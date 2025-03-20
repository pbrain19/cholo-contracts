import { ethers } from "ethers";
import { formatUnits } from "ethers/lib/utils";
import { TOKEN_INFO } from "./constants";
import { USDT, USDC, WETH } from "./constants";

/**
 * Get the balance of a token for a specific wallet
 * @param provider The ethers provider
 * @param tokenAddress The token address
 * @param walletAddress The wallet address
 * @returns The token balance
 */
export async function getTokenBalance(
  provider: ethers.providers.Provider,
  tokenAddress: string,
  walletAddress: string
): Promise<ethers.BigNumber> {
  const tokenContract = new ethers.Contract(
    tokenAddress,
    ["function balanceOf(address) view returns (uint256)"],
    provider
  );
  const balance = await tokenContract.balanceOf(walletAddress);
  return balance;
}

/**
 * Format a token amount with the correct decimals
 * @param amount The raw token amount
 * @param tokenAddress The token address
 * @returns The formatted amount
 */
export function formatTokenAmount(
  amount: string | bigint | ethers.BigNumber,
  tokenAddress: string
): string {
  const tokenInfo = TOKEN_INFO[tokenAddress.toLowerCase()];
  return formatUnits(amount.toString(), tokenInfo.decimals);
}

/**
 * Calculate the minimum amount out with slippage
 * @param amountOut The expected amount out
 * @param slippagePercent The slippage percentage (e.g. 5 for 5%)
 * @returns The minimum amount out with slippage applied
 */
export function calculateAmountOutMinimum(
  amountOut: bigint | string | ethers.BigNumber,
  slippagePercent: number = 5
): bigint {
  // Convert to BigInt to ensure consistent calculations
  const amountOutBigInt =
    typeof amountOut === "bigint" ? amountOut : BigInt(amountOut.toString());

  const slippageFactorBigint = BigInt(100 - slippagePercent);
  const denominatorBigint = BigInt(100);
  return (amountOutBigInt * slippageFactorBigint) / denominatorBigint;
}

/**
 * Check if a token exchange rate seems reasonable
 * @param fromToken The token being swapped from
 * @param toToken The token being swapped to
 * @param exchangeRate The calculated exchange rate
 * @returns Object with validation result and expected rate if applicable
 */
export function validateExchangeRate(
  fromToken: string,
  toToken: string,
  exchangeRate: number
): { isValid: boolean; expectedRate?: number; message?: string } {
  // Check for common token pairs
  if (
    (fromToken.toLowerCase() === USDT.toLowerCase() ||
      fromToken.toLowerCase() === USDC.toLowerCase()) &&
    toToken.toLowerCase() === WETH.toLowerCase()
  ) {
    // Rough USDT/USDC to WETH exchange rate check
    const expectedRate = 0.0005; // Approximate rate: 1 USDT/USDC ≈ 0.0005 WETH
    const minAcceptableRate = 0.0001;

    if (exchangeRate < minAcceptableRate) {
      return {
        isValid: false,
        expectedRate,
        message: `WARNING: Exchange rate seems unusually low! Expected ~${expectedRate}, got ${exchangeRate.toFixed(
          6
        )}`,
      };
    }
  }

  return { isValid: true };
}

/**
 * Convert a decimal amount to raw token units
 * @param amount The decimal amount (e.g. 1.5 USDT)
 * @param tokenAddress The token address
 * @returns The amount in raw token units
 */
export function toTokenUnits(amount: number, tokenAddress: string): bigint {
  const tokenInfo = TOKEN_INFO[tokenAddress.toLowerCase()];
  return BigInt(Math.floor(amount * Math.pow(10, tokenInfo.decimals)));
}

/**
 * Get the symbol for a token
 * @param tokenAddress The token address
 * @returns The token symbol
 */
export function getTokenSymbol(tokenAddress: string): string {
  return TOKEN_INFO[tokenAddress.toLowerCase()].symbol;
}

/**
 * Get the decimals for a token
 * @param tokenAddress The token address
 * @returns The token decimals
 */
export function getTokenDecimals(tokenAddress: string): number {
  return TOKEN_INFO[tokenAddress.toLowerCase()].decimals;
}
