import hre from "hardhat";
import SugarAbi from "./abi/Sugar.json";
import { ethers } from "ethers";
import { PATHS_WE_NEED, USDC, USDT, WETH, AERO } from "./constants";
import { buildGraph, getRoutes, type Pool, type Route } from "./graph";

const VELO_SUGAR = "0x63a73829C74e936C1D2EEbE64164694f16700138";

// Max hops for path finding
const MAX_HOPS = 3;
// Max routes to return
const MAX_ROUTES = 3;
// High liquidity tokens - using addresses from constants.ts
const HIGH_LIQ_TOKENS = [
  USDC.toLowerCase(), // USDC
  USDT.toLowerCase(), // USDT
  WETH.toLowerCase(), // WETH
  AERO.toLowerCase(), // AERO
];

// Function to fetch pools from the sugar contract
async function getPools(provider: ethers.providers.Provider): Promise<Pool[]> {
  const sugarContract = new ethers.Contract(
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
      allPools.push(...pools);
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

// Function to encode a route for the Universal Router
function encodeRouteToPath(route: Route[]): string {
  if (!route || route.length === 0) return "0x";

  let encoded = "0x";
  route.forEach((segment, index) => {
    // Ensure addresses are lowercase when encoding
    const fromAddress = (
      segment.from.startsWith("0x") ? segment.from : `0x${segment.from}`
    ).toLowerCase();
    const toAddress = (
      segment.to.startsWith("0x") ? segment.to : `0x${segment.to}`
    ).toLowerCase();

    // Encode the first token
    if (index === 0) {
      encoded += fromAddress.slice(2);
    }

    // Encode the pool information (stable flag and the to token)
    // For Velodrome V2, we need to include the stable flag
    const stableByte = segment.stable ? "01" : "00";
    encoded += stableByte + toAddress.slice(2);
  });

  return encoded;
}

async function main() {
  const networkConfig = hre.network.config as { url: string };
  const provider = new ethers.providers.JsonRpcProvider(networkConfig.url);

  console.log("Fetching pools...");
  const pools = await getPools(provider);
  console.log(`Fetched ${pools.length} pools`);

  const [graph, pairsByAddress] = buildGraph(pools);

  console.log("\nFinding routes for token pairs...");
  for (const pair of PATHS_WE_NEED) {
    console.log(`\nRoutes for ${pair.tokenIn} -> ${pair.tokenOut}:`);

    const routes = getRoutes(
      graph,
      pairsByAddress,
      pair.tokenIn,
      pair.tokenOut,
      HIGH_LIQ_TOKENS,
      MAX_HOPS,
      MAX_ROUTES
    );

    if (routes.length === 0) {
      console.log("No routes found");
      continue;
    }

    routes.forEach((route, index) => {
      console.log(`Route ${index + 1}:`);
      route.forEach((hop, hopIndex) => {
        console.log(
          `  Hop ${hopIndex + 1}: ${hop.from} -> ${hop.to} (stable: ${
            hop.stable
          })`
        );
      });
      const encodedPath = encodeRouteToPath(route);
      console.log(`  Encoded path: ${encodedPath}`);
    });
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
