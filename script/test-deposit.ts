import hre from "hardhat";
import { ethers } from "ethers";
import { USDC, USDT, WETH, CBBTC, KAIKO } from "./constants";
import { formatTokenAmount } from "./token-utils";
import { SwapManager } from "./swap-manager";

// High liquidity tokens - using addresses from constants
const HIGH_LIQ_TOKENS = [
  USDC.toLowerCase(), // USDC
  USDT.toLowerCase(), // USDT
  WETH.toLowerCase(), // WETH
];

async function main() {
  const networkConfig = hre.network.config as { url: string };
  const provider = new ethers.providers.JsonRpcProvider(networkConfig.url);

  // Get the signer
  const privateKey = process.env.PRIVATE_KEY;
  if (!privateKey) {
    throw new Error("PRIVATE_KEY not found in environment variables");
  }

  const wallet = new ethers.Wallet(privateKey, provider);
  console.log("Wallet address:", wallet.address);

  // Create a swap manager instance
  const swapManager = new SwapManager(provider, wallet);

  // Define swap options
  const swapOptions = {
    maxHops: 3,
    maxRoutes: 50,
    highLiquidityTokens: HIGH_LIQ_TOKENS,
    slippagePercent: 5,
    forceExecute: true, // Set to false in production
  };

  // Method 1: Execute individual swaps
  console.log("\n============ METHOD 1: Individual Swaps ============");

  // Get initial USDT balance
  const initialUsdtBalance = await swapManager.getTokenBalance(USDT);
  console.log(
    `Initial USDT balance: ${formatTokenAmount(initialUsdtBalance, USDT)}`
  );

  // USDT -> WETH
  let currentBalance = await swapManager.executeSwap(
    USDT,
    WETH,
    initialUsdtBalance.toBigInt(),
    swapOptions
  );

  // WETH -> CBBTC
  currentBalance = await swapManager.executeSwap(
    WETH,
    CBBTC,
    currentBalance.toBigInt(),
    swapOptions
  );

  // CBBTC -> KAIKO
  currentBalance = await swapManager.executeSwap(
    CBBTC,
    KAIKO,
    currentBalance.toBigInt(),
    swapOptions
  );

  // KAIKO -> USDT
  currentBalance = await swapManager.executeSwap(
    KAIKO,
    USDT,
    currentBalance.toBigInt(),
    swapOptions
  );

  // Final USDT balance check
  const finalUsdtBalance = await swapManager.getTokenBalance(USDT);
  console.log(
    `\nFinal USDT balance: ${formatTokenAmount(finalUsdtBalance, USDT)}`
  );

  // Method 2: Execute swap chain
  console.log("\n============ METHOD 2: Swap Chain ============");

  // Define the swap chain
  const swapChain = [
    { from: USDT, to: WETH },
    { from: WETH, to: CBBTC },
    { from: CBBTC, to: KAIKO },
    { from: KAIKO, to: USDT },
  ];

  // Get initial USDT balance
  const initialBalanceForChain = await swapManager.getTokenBalance(USDT);

  // Execute the swap chain
  const finalBalanceFromChain = await swapManager.executeSwapChain(
    swapChain,
    initialBalanceForChain.toBigInt(),
    swapOptions
  );

  console.log(
    `\nSwap chain completed. Final USDT balance: ${formatTokenAmount(
      finalBalanceFromChain,
      USDT
    )}`
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
