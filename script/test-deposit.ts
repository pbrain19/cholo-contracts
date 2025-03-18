import hre from "hardhat";
import { ethers } from "ethers";
import { PATHS_WE_NEED } from "./constants";
import {
  buildGraph,
  fetchQuote,
  getRoutes,
  encodeRouteToPath,
  getPools,
  formatRoutePath,
  debugEncodedPath,
} from "./graph";
import { parseUnits } from "ethers/lib/utils";

// Max hops for path finding
const MAX_HOPS = 3;
// Max routes to return
const MAX_ROUTES = 25;
// High liquidity tokens - using addresses from constants
import { USDC, USDT, WETH } from "./constants";
const HIGH_LIQ_TOKENS = [
  USDC.toLowerCase(), // USDC
  USDT.toLowerCase(), // USDT
  WETH.toLowerCase(), // WETH
];

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

    const quote = await fetchQuote(
      routes,
      parseUnits("1", 18).toBigInt(),
      provider
    );

    if (!quote) {
      console.log("No quote found");
      continue;
    }

    const encodedPath = encodeRouteToPath(quote.route);
    console.log(`  Encoded path: ${encodedPath}`);

    // Add debugging output
    console.log(`  Human readable path: ${formatRoutePath(quote.route)}`);
    console.log(`  Decoded path: ${debugEncodedPath(encodedPath)}`);

    console.log(
      `  Quote: ${JSON.stringify(
        quote.route.map((r) => r.from + " -> " + r.to)
      )}`
    );
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
