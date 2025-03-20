import { ethers } from "ethers";
import AEROUniversalRouteABI from "./abi/AeroUniversalRoute.json";
import {
  buildGraph,
  fetchQuote,
  getRoutes,
  encodeRouteToPath,
  getPools,
  formatRoutePath,
} from "./graph";
import {
  getTokenBalance,
  formatTokenAmount,
  calculateAmountOutMinimum,
  validateExchangeRate,
  toTokenUnits,
  getTokenSymbol,
  getTokenDecimals,
} from "./token-utils";
import {
  UNIVERSAL_ROUTER,
  prepareSwapTransaction,
  simulateTransaction,
  approveTokens,
  executeSwap,
} from "./router-executor";

/**
 * Options for executing a swap
 */
export interface SwapOptions {
  /** Maximum number of hops for path finding (default: 3) */
  maxHops?: number;
  /** Maximum routes to return (default: 50) */
  maxRoutes?: number;
  /** High liquidity tokens to consider for routing */
  highLiquidityTokens?: string[];
  /** Slippage tolerance percentage (default: 5) */
  slippagePercent?: number;
  /** Force swap execution even if exchange rate validation fails (default: false) */
  forceExecute?: boolean;
}

/**
 * Manages the swap process from start to finish
 */
export class SwapManager {
  private provider: ethers.providers.Provider;
  private wallet: ethers.Wallet;

  /**
   * Create a new SwapManager instance
   * @param provider The ethers provider
   * @param wallet The ethers wallet for transactions
   */
  constructor(provider: ethers.providers.Provider, wallet: ethers.Wallet) {
    this.provider = provider;
    this.wallet = wallet;
  }

  /**
   * Execute a token swap
   * @param fromToken The token to swap from
   * @param toToken The token to swap to
   * @param amountIn The amount to swap
   * @param options Configuration options for the swap
   * @returns The final balance of the destination token
   */
  async executeSwap(
    fromToken: string,
    toToken: string,
    amountIn: bigint,
    options: SwapOptions = {}
  ): Promise<ethers.BigNumber> {
    // Set default options
    const {
      maxHops = 3,
      maxRoutes = 50,
      highLiquidityTokens = [],
      slippagePercent = 5,
      forceExecute = false,
    } = options;

    console.log(
      `\nPreparing swap from ${getTokenSymbol(fromToken)} to ${getTokenSymbol(
        toToken
      )}`
    );
    console.log(
      `Amount in: ${formatTokenAmount(amountIn.toString(), fromToken)}`
    );
    console.log(`From token decimals: ${getTokenDecimals(fromToken)}`);
    console.log(`To token decimals: ${getTokenDecimals(toToken)}`);

    // Get routes and quote
    const pools = await getPools(this.provider);
    const [graph, pairsByAddress] = buildGraph(pools);

    // Get routes
    const autoRoutes = getRoutes(
      graph,
      pairsByAddress,
      fromToken,
      toToken,
      highLiquidityTokens,
      maxHops,
      maxRoutes
    );

    console.log(`Found ${autoRoutes.length} possible routes automatically`);
    console.log("Raw amount passed to fetchQuote:", amountIn.toString());

    // Fetch the best quote
    const quote = await fetchQuote(autoRoutes, amountIn, this.provider);
    if (!quote) {
      throw new Error("No quote found for swap");
    }

    // Log quote details
    console.log("Raw quote data:");
    console.log(`- amountIn: ${quote.amount.toString()}`);
    console.log(`- amountOut (raw): ${quote.amountOut.toString()}`);
    console.log(
      `- amountOut (formatted): ${formatTokenAmount(
        quote.amountOut.toString(),
        toToken
      )}`
    );

    // Calculate and validate exchange rate
    const amountInDecimal = Number(
      formatTokenAmount(amountIn.toString(), fromToken)
    );
    const amountOutDecimal = Number(
      formatTokenAmount(quote.amountOut.toString(), toToken)
    );
    const exchangeRate = amountOutDecimal / amountInDecimal;

    console.log(
      `Exchange rate: 1 ${getTokenSymbol(fromToken)} = ${exchangeRate.toFixed(
        6
      )} ${getTokenSymbol(toToken)}`
    );

    // Check if exchange rate seems reasonable
    const validation = validateExchangeRate(fromToken, toToken, exchangeRate);
    let finalAmountOutBigint: bigint;

    if (!validation.isValid) {
      console.warn(validation.message);

      if (validation.expectedRate) {
        // Calculate a more reasonable amount out manually
        const expectedAmountOut = amountInDecimal * validation.expectedRate;

        console.log(
          `Manually calculated expected output: ${expectedAmountOut} ${getTokenSymbol(
            toToken
          )}`
        );

        // Convert to raw units
        const manualAmountOut = toTokenUnits(expectedAmountOut, toToken);

        console.log(`Manual amount out (raw): ${manualAmountOut.toString()}`);
        console.log(
          `Manual amount out (formatted): ${formatTokenAmount(
            manualAmountOut.toString(),
            toToken
          )}`
        );

        if (!forceExecute) {
          throw new Error(
            "Exchange rate is too low - aborting swap. Set forceExecute=true to override."
          );
        } else {
          console.warn(
            "Continuing with swap despite low exchange rate due to forceExecute=true"
          );
          finalAmountOutBigint = manualAmountOut;
        }
      } else {
        // No expected rate provided, use quote amount
        finalAmountOutBigint = BigInt(quote.amountOut.toString());
      }
    } else {
      // Exchange rate is valid, use quote amount
      finalAmountOutBigint = BigInt(quote.amountOut.toString());
    }

    // Calculate minimum amount with slippage
    const amountOutMinimumBigint = calculateAmountOutMinimum(
      finalAmountOutBigint.toString(),
      slippagePercent
    );

    console.log(
      `Expected output: ${formatTokenAmount(
        quote.amountOut.toString(),
        toToken
      )}`
    );

    // Debug route information
    const formattedPath = formatRoutePath(quote.route);
    console.log("Route path:", formattedPath);

    // Convert to BigNumber for ethers compatibility
    const amountInBN = ethers.BigNumber.from(amountIn.toString());
    const amountOutMinimumBN = ethers.BigNumber.from(
      amountOutMinimumBigint.toString()
    );

    // Approve tokens for the swap
    await approveTokens(this.wallet, fromToken, amountInBN);

    // Create Universal Router contract instance
    const universalRouter = new ethers.Contract(
      UNIVERSAL_ROUTER,
      AEROUniversalRouteABI,
      this.wallet
    );

    // Prepare the swap transaction
    const { commands, inputs } = await prepareSwapTransaction(
      this.wallet,
      universalRouter,
      quote.route,
      amountInBN,
      amountOutMinimumBN,
      fromToken,
      toToken
    );

    // Simulate the transaction
    const { simulation, txData } = await simulateTransaction(
      this.provider,
      this.wallet,
      universalRouter,
      commands,
      inputs
    );

    // Execute the swap
    await executeSwap(
      this.wallet,
      universalRouter,
      txData,
      Number(simulation.gasUsed)
    );

    // Check final balance
    const finalBalance = await getTokenBalance(
      this.provider,
      toToken,
      this.wallet.address
    );
    console.log(
      `Final ${getTokenSymbol(toToken)} balance: ${formatTokenAmount(
        finalBalance,
        toToken
      )}`
    );

    return finalBalance;
  }

  /**
   * Get the balance of a token for the wallet
   * @param tokenAddress The token address
   * @returns The token balance
   */
  async getTokenBalance(tokenAddress: string): Promise<ethers.BigNumber> {
    return getTokenBalance(this.provider, tokenAddress, this.wallet.address);
  }

  /**
   * Execute a chain of swaps
   * @param swapChain Array of from/to token pairs to swap through
   * @param initialAmount Initial amount to swap (if undefined, will use entire balance)
   * @param options Configuration options for the swaps
   * @returns The final balance
   */
  async executeSwapChain(
    swapChain: Array<{ from: string; to: string }>,
    initialAmount?: bigint,
    options?: SwapOptions
  ): Promise<ethers.BigNumber> {
    if (swapChain.length === 0) {
      throw new Error("Swap chain cannot be empty");
    }

    // Get initial token balance if not provided
    let currentBalance: ethers.BigNumber;
    if (initialAmount === undefined) {
      currentBalance = await this.getTokenBalance(swapChain[0].from);
    } else {
      currentBalance = ethers.BigNumber.from(initialAmount.toString());
    }

    console.log(`Starting swap chain with ${swapChain.length} swaps`);
    console.log(
      `Initial ${getTokenSymbol(
        swapChain[0].from
      )} balance: ${formatTokenAmount(currentBalance, swapChain[0].from)}`
    );

    // Execute each swap in the chain
    for (const { from, to } of swapChain) {
      currentBalance = await this.executeSwap(
        from,
        to,
        currentBalance.toBigInt(),
        options
      );
    }

    const finalToken = swapChain[swapChain.length - 1].to;
    console.log(
      `\nFinal ${getTokenSymbol(finalToken)} balance: ${formatTokenAmount(
        currentBalance,
        finalToken
      )}`
    );

    return currentBalance;
  }
}
