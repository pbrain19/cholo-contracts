import { AlphaRouter } from "@uniswap/smart-order-router";
import { Currency, CurrencyAmount, Token, TradeType } from "@uniswap/sdk-core";
import { encodeRouteToPath, Route } from "@uniswap/v3-sdk";
import { Protocol } from "@uniswap/router-sdk";
import { parseUnits } from "viem";
import { TOKEN_INFO } from "./constants";
import { task } from "hardhat/config";
import { ethers } from "ethers";
import { HardhatRuntimeEnvironment } from "hardhat/types";

// Define the paths we need
const PATHS_WE_NEED = [
  {
    tokenIn: "0x9560e827af36c94d2ac33a39bce1fe78631088db", // VELO
    tokenOut: "0x94b008aA00579c1307B0EF2c499aD98a8ce58e58", // USDT
    description: "VELO -> USDT",
  },
];

async function getRoute(tokenIn: string, tokenOut: string, provider: any) {
  const router = new AlphaRouter({
    chainId: 10, // Optimism
    provider: provider,
  });

  const tokenInDecimals = TOKEN_INFO[tokenIn.toLowerCase()]?.decimals;
  const tokenOutDecimals = TOKEN_INFO[tokenOut.toLowerCase()]?.decimals;

  if (!tokenInDecimals || !tokenOutDecimals) {
    throw new Error("Token not found");
  }

  // Create token instances
  const tokenInInstance = new Token(
    10, // Optimism chain ID
    tokenIn,
    tokenInDecimals,
    "", // symbol - not needed for routing
    "" // name - not needed for routing
  );

  const tokenOutInstance = new Token(
    10, // Optimism chain ID
    tokenOut,
    tokenOutDecimals,
    "", // symbol - not needed for routing
    "" // name - not needed for routing
  );

  const amountIn = parseUnits("5", tokenInDecimals);
  // Create currency amount for exact input
  const currencyAmount = CurrencyAmount.fromRawAmount(
    tokenInInstance,
    amountIn.toString()
  );

  try {
    // Get route
    const routeResponse = await router.route(
      currencyAmount,
      tokenOutInstance,
      TradeType.EXACT_INPUT,
      undefined,
      {
        protocols: [Protocol.V3],
      }
    );

    if (
      !routeResponse?.route[0] &&
      routeResponse?.trade.routes[0]?.protocol != "V3"
    ) {
      throw new Error("No route found");
    }

    const route = routeResponse.trade.routes[0] as unknown as Route<
      Currency,
      Currency
    >;
    return encodeRouteToPath(route, false);
  } catch (error) {
    console.error("Failed to get route:", error);
    throw error;
  }
}

task("get-routes", "Get Uniswap V3 routes for token pairs").setAction(
  async (_, hre: HardhatRuntimeEnvironment) => {
    const networkConfig = hre.network.config as { url: string };
    const provider = new ethers.providers.JsonRpcProvider(networkConfig.url);

    // Get the first path from PATHS_WE_NEED
    const { tokenIn, tokenOut, description } = PATHS_WE_NEED[0];

    console.log("Getting route for:");
    console.log(`Description: ${description}`);
    console.log(`Token In: ${tokenIn}`);
    console.log(`Token Out: ${tokenOut}`);

    try {
      const path = await getRoute(tokenIn, tokenOut, provider);

      console.log("\nEncoded Path:");
      console.log(path);

      // Also show the hex string for easy copying
      console.log("\nPath as hex string:");
      console.log(`0x${Buffer.from(path).toString("hex")}`);

      // Show how to use this path
      console.log("\nTo set this path, call setSwapPath with:");
      console.log(`tokenIn: ${tokenIn}`);
      console.log(`tokenOut: ${tokenOut}`);
      console.log(`path: 0x${Buffer.from(path).toString("hex")}`);
    } catch (error) {
      console.error("Error getting route:", error);
    }
  }
);

export { getRoute };
