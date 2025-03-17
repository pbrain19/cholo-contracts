// @ts-ignore
import { Graph } from "graphology";
// @ts-ignore
import { allSimpleEdgeGroupPaths } from "graphology-simple-path";

export interface Route {
  from: string;
  to: string;
  stable: boolean;
  factory: string;
}

export interface Pool {
  token0: string;
  token1: string;
  lp: string;
  type: number;
  factory: string;
  [key: string]: any;
}

interface GraphAttributes {
  stable?: boolean;
  factory?: string;
}

type CustomGraph = Graph<GraphAttributes, GraphAttributes, GraphAttributes>;

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
      const isStable = pair.type === 0;

      // Add nodes if they don't exist
      if (!graph.hasNode(tokenA)) graph.addNode(tokenA);
      if (!graph.hasNode(tokenB)) graph.addNode(tokenB);

      // Add edges in both directions with the pair address as part of the key
      graph.addEdgeWithKey(`direct:${pairAddress}`, tokenA, tokenB, {
        stable: isStable,
        factory: pair.factory,
      });
      graph.addEdgeWithKey(`reversed:${pairAddress}`, tokenB, tokenA, {
        stable: isStable,
        factory: pair.factory,
      });

      pairsByAddress[pairAddress] = {
        ...pair,
        address: pairAddress,
        token0: tokenA,
        token1: tokenB,
        lp: pairAddress,
        stable: isStable,
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
