// @ts-ignore
import { Graph } from "graphology";
// @ts-ignore
import { allSimpleEdgeGroupPaths } from "graphology-simple-path";
import { chunk } from "lodash";
import { Contract, providers, utils as ethersUtils } from "ethers";
import SugarAbi from "./abi/Sugar.json";
import MixedQuoterAbi from "./abi/MixedQuoter.json";
// Define a CustomGraph type to fix TS errors
// @ts-ignore
type CustomGraph = Graph<GraphAttributes, GraphAttributes, GraphAttributes>;

export interface Route {
  from: string;
  to: string;
  stable: boolean;
  factory: string;
  poolAddress: string;
  pool: Pool;
  pool_fee: number; // Add fee property for path encoding
}

export interface Pool {
  token0: string;
  token1: string;
  lp: string;
  type: number;
  factory: string;
  pool_fee: number;
  [key: string]: any;
}

interface GraphAttributes {
  stable?: boolean;
  factory?: string;
  fee?: number;
}

// Sugar contract for fetching pools
const VELO_SUGAR = "0x63a73829C74e936C1D2EEbE64164694f16700138";
const MIXED_QUOTER_ADDRESS = "0x0A5aA5D3a4d28014f967Bf0f29EAA3FF9807D5c6";
const FACTORY_V2 = "0xF4d73326C13a4Fc5FD7A064217e12780e9Bd62c3";

/**
 * Fetches pools from the Velodrome/Aerodrome sugar contract
 *
 * @param provider Ethers provider
 * @returns Array of pools
 */
export async function getPools(provider: providers.Provider): Promise<Pool[]> {
  const sugarContract = new Contract(
    VELO_SUGAR.toLowerCase(),
    SugarAbi,
    provider
  );

  const POOLS_TO_FETCH = 8000;
  const chunkSize = 400;
  const allPools: Pool[] = [];

  for (
    let startIndex = 0;
    startIndex < POOLS_TO_FETCH;
    startIndex += chunkSize
  ) {
    const endIndex = Math.min(startIndex + chunkSize, POOLS_TO_FETCH);
    try {
      const pools = await sugarContract.forSwaps(
        endIndex - startIndex,
        startIndex
      );

      if (pools.length > 0) {
        allPools.push(...pools);
      } else {
        break;
      }
    } catch (err) {
      console.error(
        `Failed to fetch pools from ${startIndex} to ${endIndex}:`,
        err
      );
      break;
    }
  }

  return allPools;
}

/**
 * Returns pairs graph and a map of pairs to their addresses
 *
 * We build the edge keys using the pair address and the direction.
 */
// @ts-ignore
export function buildGraph(pairs: Pool[]): [CustomGraph, Record<string, Pool>] {
  const graph = new Graph<GraphAttributes, GraphAttributes, GraphAttributes>({
    multi: true,
  });
  const pairsByAddress: Record<string, Pool> = {};

  if (pairs.length > 0) {
    pairs.forEach((pair) => {
      const tokenA = pair.token0.toLowerCase();
      const tokenB = pair.token1.toLowerCase();
      const pairAddress = pair.lp.toLowerCase();
      const isStable = Number(pair.type) === 0;

      // Set default fee based on pool type for Velodrome/Aerodrome
      // Stable: 1 bps (0.01%), Volatile: 500 bps (5.00%)
      const fee = pair.pool_fee;

      // Add nodes if they don't exist
      if (!graph.hasNode(tokenA)) graph.addNode(tokenA);
      if (!graph.hasNode(tokenB)) graph.addNode(tokenB);

      // Add edges in both directions with the pair address as part of the key
      graph.addEdgeWithKey(`direct:${pairAddress}`, tokenA, tokenB, {
        stable: isStable,
        factory: pair.factory,
        fee: fee,
      });
      graph.addEdgeWithKey(`reversed:${pairAddress}`, tokenB, tokenA, {
        stable: isStable,
        factory: pair.factory,
        fee: fee,
      });

      pairsByAddress[pairAddress] = {
        ...pair,
        address: pairAddress,
        token0: tokenA,
        token1: tokenB,
        lp: pairAddress,
        stable: isStable,
        fee: fee,
      };
    });
  }

  return [graph, pairsByAddress];
}

/**
 * Generates possible routes from token A -> token B
 *
 * Based on the graph, returns a list of hops to get from tokenA to tokenB.
 *
 * Eg.:
 *  [
 *    [
 *      { fromA, toB, type, factory1 }
 *    ],
 *    [
 *      { fromA, toX, type, factory2 },
 *      { fromX, toB, type, factory1 }
 *    ],
 *    [
 *      { fromA, toY, type, factory1 },
 *      { fromY, toX, type, factory2 },
 *      { fromX, toB, type, factory1 }
 *    ]
 *  ]
 */
// @ts-ignore
export function getRoutes(
  graph: CustomGraph,
  pairsByAddress: Record<string, Pool>,
  fromToken: string,
  toToken: string,
  highLiqTokens: string[],
  maxHops = 3,
  maxRoutes = 25
): Route[][] {
  if (!fromToken || !toToken || graph.size === 0) {
    return [];
  }

  const fromTokenLower = fromToken.toLowerCase();
  const toTokenLower = toToken.toLowerCase();

  // Get all possible paths using graphology's path finding
  let graphPaths: string[][][] = [];
  try {
    graphPaths = allSimpleEdgeGroupPaths(graph, fromTokenLower, toTokenLower, {
      maxDepth: maxHops,
    });
  } catch (e) {
    console.error("Failed to find paths:", e);
    return [];
  }

  let paths: Route[][] = [];

  // Convert graph paths to route segments
  graphPaths.forEach((pathSet) => {
    let mappedPathSets: Route[][] = [];

    pathSet.forEach((pairAddresses, index) => {
      const currentMappedPathSets: Route[][] = [];

      pairAddresses.forEach((pairAddressWithDirection) => {
        const [direction, pairAddress] = pairAddressWithDirection.split(":");
        const pair = pairsByAddress[pairAddress];

        if (!pair) return;

        const routeComponent: Route = {
          from: direction === "direct" ? pair.token0 : pair.token1,
          to: direction === "direct" ? pair.token1 : pair.token0,
          stable: pair.stable,
          factory: pair.factory,
          pool_fee: pair.pool_fee,
          poolAddress: pair.lp,
          pool: pair,
        };

        // For the first hop, create new path sets
        if (index === 0) {
          currentMappedPathSets.push([routeComponent]);
        } else {
          // For subsequent hops, extend existing path sets
          mappedPathSets.forEach((incompleteSet) => {
            currentMappedPathSets.push([...incompleteSet, routeComponent]);
          });
        }
      });

      mappedPathSets = currentMappedPathSets;
    });

    paths.push(...mappedPathSets);
  });

  // Filter paths to only include high liquidity tokens
  const highLiqTokensLower = [...highLiqTokens, fromToken, toToken].map((t) =>
    t.toLowerCase()
  );

  paths = paths.filter((route) =>
    route.every(
      (segment) =>
        highLiqTokensLower.includes(segment.from.toLowerCase()) &&
        highLiqTokensLower.includes(segment.to.toLowerCase())
    )
  );

  // If we have too many paths, prioritize direct routes
  if (paths.length > maxRoutes) {
    const directPaths = paths.filter((path) => path.length === 1);
    const multiHopPaths = paths.filter((path) => path.length > 1);

    paths = [
      ...directPaths,
      ...multiHopPaths.slice(0, maxRoutes - directPaths.length),
    ];
  }

  return paths;
}
export type Quote = {
  route: Route[];
  amount: BigInt;
  amountOut: BigInt;
  amountsOut: BigInt[];
};

/**
 * Encodes a route to a hex path suitable for router contracts
 * Based on Uniswap's implementation but adapted for our Route type
 *
 * @param route Array of route segments
 * @param exactOutput Whether to reverse the path for exact output swaps
 * @returns Encoded path as a hex string
 */
export function encodeRouteToPath(
  route: Route[],
  exactOutput: boolean = false
): string {
  if (!route || route.length === 0) return "0x";

  // Constants for V2 pool fee encoding
  const VOLATILE_V2_FEE = 4194304; // hex 0x400000
  const STABLE_V2_FEE = 2097152; // hex 0x200000

  // Create path array: [tokenA, feeAB, tokenB, feeBC, tokenC]
  const path: (string | number)[] = [];

  // Add first token (from of first route segment)
  path.push(route[0].from);

  // Add each route segment (fee and destination token)
  for (const segment of route) {
    // For V2 pools, type is -1 (stable) or 0 (volatile)
    // For V3 pools, type is the tickSpacing value (positive)
    let fee;
    if (segment.pool.type <= 0) {
      // V2 pools
      fee = segment.stable ? STABLE_V2_FEE : VOLATILE_V2_FEE;
    } else {
      // V3 pools - use type as tickSpacing
      fee = segment.pool.type;
    }

    console.log(
      `Encoding path segment: ${segment.from} -> ${segment.to}, pool type: ${segment.pool.type}, fee: ${fee}`
    );

    path.push(fee);

    // Add destination token
    path.push(segment.to);
  }

  // If exactOutput is true, reverse the path
  const finalPath = exactOutput ? [...path].reverse() : path;

  // Encode the path with proper hex formatting
  let encoded = "";

  for (let i = 0; i < finalPath.length; i++) {
    const item = finalPath[i];

    if (i % 2 === 0) {
      // Token address (20 bytes)
      const cleanAddress = item.toString().toLowerCase().replace(/^0x/, "");
      encoded += cleanAddress.padStart(40, "0");
    } else {
      // Fee (3 bytes)
      const feeHex = ethersUtils
        .hexZeroPad(ethersUtils.hexlify(Number(item)), 3)
        .slice(2);
      encoded += feeHex;
    }
  }

  return "0x" + encoded;
}

export async function fetchQuote(
  routes: Route[][],
  amount: BigInt,
  provider: providers.Provider,
  chunkSize = 50
) {
  console.log(`Fetching quote for ${routes.length} routes`);
  const routeChunks = chunk(routes, chunkSize);
  const router: Contract = new Contract(
    MIXED_QUOTER_ADDRESS,
    MixedQuoterAbi,
    provider
  );

  let quoteChunks: Quote[] = [];
  // Split into chunks and get the route quotes...
  for (const routeChunk of routeChunks) {
    for (const route of routeChunk) {
      let amountsOut: BigInt[];
      try {
        // Encode the path according to the contract's requirements
        const encodedPath = encodeRouteToPath(route, false);
        const [
          amountOut,
          sqrtPriceX96AfterList,
          initializedTicksCrossedList,
          gasEstimate,
        ] = await router.callStatic.quoteExactInput(encodedPath, amount);
        console.log("amountOut:", amountOut.toString());
        // Store the quote result
        amountsOut = [amountOut];
      } catch (err) {
        console.error("Error fetching quote:", err);
        amountsOut = [];
      }

      // Ignore bad quotes...
      if (amountsOut && amountsOut.length >= 1) {
        const amountOut = BigInt(amountsOut[amountsOut.length - 1].toString());

        // Ignore zero quotes...
        if (amountOut !== BigInt(0)) {
          quoteChunks.push({ route, amount, amountOut, amountsOut });
        }
      }
    }
  }

  // Filter out bad quotes and find the best one...
  const bestQuote = quoteChunks
    .flat()
    .filter(Boolean)
    .reduce((best, quote) => {
      console.log("quote:", quote.amountOut.toString());
      if (!best) {
        return quote;
      } else {
        return BigInt(best.amountOut.toString()) <
          BigInt(quote.amountOut.toString())
          ? quote
          : best;
      }
    }, null as Quote | null);

  if (!bestQuote) {
    console.log("No best quote found");
    return null;
  }

  console.log(`Best quote: ${bestQuote.amountOut.toString()}`);

  return bestQuote;
}

/**
 * Creates a human-readable representation of a swap path
 *
 * @param route The route segments
 * @returns A user-friendly string showing tokens and fees in the path
 */
export function formatRoutePath(route: Route[]): string {
  if (!route || route.length === 0) return "";

  let result = route[0].from;

  for (const segment of route) {
    // Get fee description
    const feeValue = segment.pool_fee;
    const feeDesc = segment.stable ? "stable" : "volatile";

    result += ` -[${feeValue} (${feeDesc})]-> ${segment.to}`;
  }

  return result;
}

// Utility function to debug a path encoded for routers
export function debugEncodedPath(encodedPath: string): string {
  if (!encodedPath || encodedPath === "0x" || encodedPath.length < 42) {
    return "Invalid encoded path";
  }

  let result = "";
  const path = encodedPath.slice(2); // Remove '0x'

  // Extract tokens and fees
  let i = 0;
  while (i < path.length) {
    // Token address (20 bytes = 40 hex chars)
    if (i + 40 <= path.length) {
      const tokenAddress = "0x" + path.slice(i, i + 40);
      result += tokenAddress;
      i += 40;

      // Fee (3 bytes = 6 hex chars)
      if (i + 6 <= path.length) {
        const feeHex = "0x" + path.slice(i, i + 6);
        const fee = parseInt(feeHex, 16);
        result += ` -[${fee}]-> `;
        i += 6;
      } else {
        break;
      }
    } else {
      break;
    }
  }

  // Remove trailing arrow if present
  if (result.endsWith(" -> ")) {
    result = result.slice(0, -4);
  }

  return result;
}
