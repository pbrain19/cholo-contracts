import { AlphaRouter } from "@uniswap/smart-order-router";
import { Currency, CurrencyAmount, Token, TradeType } from "@uniswap/sdk-core";
import { encodeRouteToPath, Route } from "@uniswap/v3-sdk";
import { Protocol } from "@uniswap/router-sdk";
import { parseUnits } from "viem";
import {
  TOKEN_INFO,
  PATHS_WE_NEED,
  PRICE_FEEDS,
  poolsToApprove,
} from "./constants";
import { task } from "hardhat/config";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import CholoDromeModule from "../artifacts/contracts/CholoDromeModule.sol/CholoDromeModule.json";
import { ethers } from "ethers";

// Contract address from deployment
const DEPLOYED_ADDRESS = "0xfD8B162f08c1c8D64E0Ed81AF65849C56C3500Ac";
const OLD_ADDRESS = "0xC65843B14D3a190944Ecf0A1b3dec8D60370a1A7";
async function getRoute(
  tokenIn: string,
  tokenOut: string,
  provider: ethers.providers.BaseProvider
) {
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

  const amountIn = parseUnits("5000", tokenInDecimals);
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
    console.log(route);
    return encodeRouteToPath(route, false);
  } catch (error) {
    console.error("Failed to get route:", error);
    throw error;
  }
}

task("set-routes", "Get and set Uniswap V3 routes in the contract").setAction(
  async (_, hre: HardhatRuntimeEnvironment) => {
    const networkConfig = hre.network.config as { url: string };
    const provider = new ethers.providers.JsonRpcProvider(networkConfig.url);

    // Get the signer
    const privateKey = process.env.PRIVATE_KEY;
    if (!privateKey) {
      throw new Error("PRIVATE_KEY not found in environment variables");
    }
    const wallet = new ethers.Wallet(privateKey, provider);

    // Get contract instance
    const choloDromeModule = new ethers.Contract(
      DEPLOYED_ADDRESS,
      CholoDromeModule.abi,
      wallet
    );

    // First approve all pools
    console.log("\nApproving pools...");
    try {
      for (const pool of poolsToApprove) {
        console.log(`Approving pool: ${pool}`);

        const isApproved = await choloDromeModule.approvedPools(pool);
        if (isApproved) {
          console.log(`Pool ${pool} already approved`);
          continue;
        }

        const tx = await choloDromeModule.approvePool(pool);
        console.log("Transaction hash:", tx.hash);
        await tx.wait();
        console.log(`Pool ${pool} approved successfully!`);
      }
      console.log("All pools approved successfully!");
    } catch (error) {
      console.error("Error approving pools:", error);
    }

    // Then set up all price feeds
    console.log("\nSetting up price feeds...");
    try {
      const priceFeedsToUpdate = await Promise.all(
        PRICE_FEEDS.filter(async ({ from, to }) => {
          const priceFeed = await choloDromeModule.priceFeeds(from, to);
          if (priceFeed || priceFeed === "0x") {
            console.log(`Price feed for ${from} -> ${to} already set`);
            return false;
          }
          return true;
        })
      );

      console.log("Price feeds to update:", priceFeedsToUpdate);

      if (priceFeedsToUpdate.length) {
        const tx = await choloDromeModule.setPriceFeeds(
          priceFeedsToUpdate.map(({ from, to, priceFeed }) => ({
            fromToken: from,
            toToken: to,
            priceFeed: priceFeed,
          }))
        );
        console.log("Transaction hash:", tx.hash);
        await tx.wait();
        console.log("Price feeds set successfully!");
      }
    } catch (error) {
      console.error("Error setting price feeds:", error);
    }

    // Then set up all swap routes
    console.log("\nSetting up swap routes...");
    try {
      // First get all paths
      const swapPaths = await Promise.all(
        PATHS_WE_NEED.map(async ({ tokenIn, tokenOut }) => {
          console.log(`Getting route for ${tokenIn} -> ${tokenOut}`);
          let path = await choloDromeModule.swapPaths(tokenIn, tokenOut);
          console.log(`got path for ${tokenIn} -> ${tokenOut} path:`, path);
          if (!path || path === "0x") {
            console.log(
              `no path found for ${tokenIn} -> ${tokenOut}, getting new path`
            );
            path = await getRoute(tokenIn, tokenOut, provider);
            console.log(
              `got new path for ${tokenIn} -> ${tokenOut} path:`,
              path
            );
          }
          return {
            fromToken: tokenIn,
            toToken: tokenOut,
            path,
          };
        })
      );

      // Then set them all in one transaction
      const tx = await choloDromeModule.setSwapPaths(swapPaths);
      console.log("Transaction hash:", tx.hash);
      await tx.wait();
      console.log("Swap paths set successfully!");
    } catch (error) {
      console.error("Error setting swap paths:", error);
    }
  }
);

export { getRoute };
