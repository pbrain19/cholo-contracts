import hre from "hardhat";

import ICLPoolArtifact from "../artifacts/contracts/choloInterfaces.sol/ICLPool.json";
import ISlipstreamSugarArtifact from "../artifacts/contracts/choloInterfaces.sol/ISlipstreamSugar.json";
import { ethers } from "ethers";

export function calculatePrice(
  sqrtPriceX96: bigint,
  token0Decimals: number,
  token1Decimals: number
): number {
  const Q96 = BigInt(2) ** BigInt(96);
  const sqrtPrice = Number(sqrtPriceX96) / Number(Q96);
  const price = sqrtPrice * sqrtPrice;
  // Adjust for decimals
  const decimalAdjustment = 10 ** (token1Decimals - token0Decimals);
  return decimalAdjustment / price;
}

async function main() {
  const networkConfig = hre.network.config as { url: string };
  const provider = new ethers.providers.JsonRpcProvider(networkConfig.url);
  // Pool address from which to fetch info
  const poolAddress = "0xebd5311bea1948e1441333976eadcfe5fbda777c";

  // Instantiate the pool contract using the ICLPool interface
  const pool = new ethers.Contract(poolAddress, ICLPoolArtifact.abi, provider);

  console.log(`Fetching info for pool: ${poolAddress}`);

  // Retrieve pool parameters
  const [sqrtPriceX96, currentTick] = await pool.slot0();
  const currentTickNumber = ethers.BigNumber.from(currentTick);
  const tickSpacing = await pool.tickSpacing();
  const token0 = await pool.token0();
  const token1 = await pool.token1();

  // Get token decimals
  const token0Contract = new ethers.Contract(
    token0,
    ["function decimals() view returns (uint8)"],
    provider
  );
  const token1Contract = new ethers.Contract(
    token1,
    ["function decimals() view returns (uint8)"],
    provider
  );

  const token0Decimals = await token0Contract.decimals();
  const token1Decimals = await token1Contract.decimals();

  console.log("Pool Parameters:");
  console.log(`  sqrtPriceX96: ${sqrtPriceX96}`);
  console.log(`  currentTick: ${currentTick}`);
  console.log(`  tickSpacing: ${tickSpacing}`);
  console.log(`  token0: ${token0} (${token0Decimals} decimals)`);
  console.log(`  token1: ${token1} (${token1Decimals} decimals)`);

  // 0xD45624bf2CB9f65ecbdF3067d21992b099b56202

  // Calculate prices from sqrtPriceX96
  // Calculate the base price (token1/token0) as raw value: (sqrtPriceX96^2) / (2^192)
  const Q192 = ethers.BigNumber.from(2).pow(192);
  const rawPrice = sqrtPriceX96.mul(sqrtPriceX96).div(Q192);

  // Adjust the raw price to human-readable form with 18 decimals:
  // adjustment factor = 10^(token0Decimals + 18) / 10^(token1Decimals)
  const adjustmentNumerator = ethers.BigNumber.from(10).pow(
    token0Decimals + 18
  );
  const adjustmentDenom = ethers.BigNumber.from(10).pow(token1Decimals);
  const adjustedPrice1Per0 = rawPrice
    .mul(adjustmentNumerator)
    .div(adjustmentDenom);

  // Compute inverse price (token0/token1) with 18 decimals:
  // This is equivalent to: (10^36) / adjustedPrice1Per0
  const ONE_36 = ethers.BigNumber.from(10).pow(36);
  const adjustedPrice0Per1 = ONE_36.div(adjustedPrice1Per0);

  console.log("\nCalculated Prices:");
  console.log(
    `  Price (token1/token0): ${ethers.utils.formatUnits(
      adjustedPrice1Per0,
      18
    )}`
  );
  console.log(
    `  Price (token0/token1): ${ethers.utils.formatUnits(
      adjustedPrice0Per1,
      18
    )}`
  );

  // Hard coded deposit simulation parameters
  const depositUSDC = 1000;
  const ticksAbove = 5;
  const ticksBelow = 5;

  console.log("\nStarting deposit simulation with:");
  console.log(`  Deposit USDC: ${depositUSDC}`);
  console.log(`  Ticks Above: ${ticksAbove}`);
  console.log(`  Ticks Below: ${ticksBelow}`);

  // Round current tick to nearest tickSpacing
  const tickSpacingBN = ethers.BigNumber.from(tickSpacing);
  const halfSpacing = tickSpacingBN.div(2);
  const roundedTick = currentTickNumber
    .add(halfSpacing) // Add half spacing for proper rounding
    .div(tickSpacingBN)
    .mul(tickSpacingBN);

  console.log(
    `\nRounded current tick: ${roundedTick} (from ${currentTickNumber})`
  );

  // Calculate tick boundaries using rounded tick
  const tickLower = roundedTick.sub(
    ethers.BigNumber.from(ticksBelow).mul(tickSpacing)
  );
  const tickUpper = roundedTick.add(
    ethers.BigNumber.from(ticksAbove).mul(tickSpacing)
  );

  console.log(
    `\nUsing calculated pool ticks: lower = ${tickLower}, upper = ${tickUpper}`
  );

  // Calculate position within the range (0-1 ratio)
  const tickRange = tickUpper.sub(tickLower);
  const positionInRange = currentTickNumber.sub(tickLower);
  const swapRatio = positionInRange.mul(10_000).div(tickRange); // 0-100% in basis points

  // Calculate swap amount based on position in range
  const swapAmount = (depositUSDC * swapRatio.toNumber()) / 10_000;
  console.log(
    `\nOptimal swap amount: ${swapAmount.toFixed(2)} USDC (${
      swapRatio.toNumber() / 100
    }% of deposit) should be swapped into token1 based on range position`
  );

  // Define the USDC address provided by the user
  const USDCAddress = "0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85";
  console.log(`\nUsing USDC address: ${USDCAddress}`);

  // Instantiate the Sugar contract (Velodrome Sugar) using the ISlipstreamSugar interface
  const sugarAddress = "0x5Bd7E2221C2d59c99e6A9Cd18D80A5F4257D0f32";
  const sugar = new ethers.Contract(
    sugarAddress,
    ISlipstreamSugarArtifact.abi,
    provider
  );

  const slipStreamSugarAddress = "0xD45624bf2CB9f65ecbdF3067d21992b099b56202";
  const slipStreamSugar = new ethers.Contract(
    slipStreamSugarAddress,
    ISlipstreamSugarArtifact.abi,
    provider
  );

  // Calculate sqrtPriceLower and sqrtPriceUpper using sugar's getSqrtRatioAtTick
  const sqrtPriceLower = await sugar.getSqrtRatioAtTick(tickLower);
  const sqrtPriceUpper = await sugar.getSqrtRatioAtTick(tickUpper);
  console.log(`Calculated sqrtPriceLower: ${sqrtPriceLower}`);
  console.log(`Calculated sqrtPriceUpper: ${sqrtPriceUpper}`);

  // Define a BigNumber constant for 10, so we can safely use .mul() and .pow()
  const TEN = ethers.BigNumber.from(10);

  // --------------------------------------------------------------------------
  // NEW: Simulate Solidity's estimateOptimal logic in JavaScript
  // --------------------------------------------------------------------------

  // Parse deposit amount for token0 (USDC) into its scaled value
  const depositAmountToken0 = ethers.utils.parseUnits(
    depositUSDC.toString(),
    token0Decimals
  );
  const depositAmountToken1 = ethers.BigNumber.from(0);

  console.log("\nSimulating optimal deposit based on Solidity logic:");

  // Define a conversion function to mimic _convertToken0To1
  function convertToken0To1(amount0: ethers.BigNumber): ethers.BigNumber {
    // amount0 is in token0 decimals (6)
    // need to return amount in token1 decimals (18)
    // price is in 18 decimals
    return amount0
      .mul(adjustedPrice1Per0)
      .div(TEN.pow(18)) // remove price scaling
      .mul(TEN.pow(18)) // scale to token1 decimals
      .div(TEN.pow(6)); // remove token0 decimals
  }

  // Branch depending on where the current sqrtPrice falls relative to the range.
  if (sqrtPriceX96.lt(sqrtPriceLower)) {
    // Price below range: In Solidity, this means convert token1 → token0.
    // Since our deposit is entirely token0, no swap is needed.
    console.log("Price is below range:");
    console.log("  Optimal deposit: All in token0 (no swap needed).");
    console.log(`  Optimal amounts:
    Token0: ${ethers.utils.formatUnits(depositAmountToken0, token0Decimals)}
    Token1: ${ethers.utils.formatUnits(depositAmountToken1, token1Decimals)}
    Swap: 0`);
  } else if (sqrtPriceX96.gt(sqrtPriceUpper)) {
    // Price above range: convert token0 → token1 entirely.
    console.log("Price is above range:");
    const amount0ToSwap = depositAmountToken0;
    const amount1FromSwap = convertToken0To1(amount0ToSwap);
    console.log("  Swapping all token0 deposit to token1.");
    console.log(`  Optimal amounts:
    Token0: 0
    Token1: ${ethers.utils.formatUnits(amount1FromSwap, token1Decimals)}
    Swap: Token0 swapped = ${ethers.utils.formatUnits(
      amount0ToSwap,
      token0Decimals
    )}`);
  } else {
    // Price within range:
    console.log("Price is within range:");

    const s = sqrtPriceX96;
    const sa = sqrtPriceLower;
    const sb = sqrtPriceUpper;

    // Calculate price ratios first (maintaining precision)
    const priceRatio = s.mul(s);
    const priceLower = sa.mul(sa);
    const priceUpper = sb.mul(sb);

    console.log("\n-------- Debug: Price Calculations --------");
    console.log(`Current price ratio: ${priceRatio.toString()}`);
    console.log(`Lower price ratio: ${priceLower.toString()}`);
    console.log(`Upper price ratio: ${priceUpper.toString()}`);

    // Calculate human readable prices using the same formula as before
    console.log("\nHuman readable prices (token1/token0):");
    console.log(
      `Current: ${calculatePrice(BigInt(s), token0Decimals, token1Decimals)}`
    );
    console.log(
      `Lower: ${calculatePrice(BigInt(sa), token0Decimals, token1Decimals)}`
    );
    console.log(
      `Upper: ${calculatePrice(BigInt(sb), token0Decimals, token1Decimals)}`
    );

    // Calculate the optimal ratio based on where we are in the range
    // Note: All terms are in the same scale (Q192) so we can subtract directly
    const range = priceUpper.sub(priceLower);
    const position = priceRatio.sub(priceLower);

    console.log("\n-------- Debug: Position in Range --------");
    console.log(`Range: ${range.toString()}`);
    console.log(`Position in range: ${position.toString()}`);

    // Calculate optimal ratio (scaled to basis points)
    const optimalRatio = position.mul(TEN.pow(4)).div(range);
    console.log(`Optimal ratio (bps): ${optimalRatio.toString()}`);

    // Calculate swap amount based on optimal ratio
    const swapAmountToken0 = depositAmountToken0
      .mul(optimalRatio)
      .div(TEN.pow(4));
    const amount1FromSwap = convertToken0To1(swapAmountToken0);
    const optimalAmountToken0 = depositAmountToken0.sub(swapAmountToken0);
    const optimalAmountToken1 = depositAmountToken1.add(amount1FromSwap);

    console.log("\n-------- Optimal amounts --------");
    console.log(`Token0: ${optimalAmountToken0}`);
    console.log(`Token1: ${optimalAmountToken1}`);
    console.log(`sqrtPriceX96: ${sqrtPriceX96}`);
    console.log(`tickLower: ${tickLower}`);
    console.log(`tickUpper: ${tickUpper}`);
    // Verify our calculations using Sugar's estimation functions
    // optimalAmountToken1 and optimalAmount0 are already scaled with their respective decimals
    try {
      const estimatedAmount0 = await slipStreamSugar.estimateAmount0(
        optimalAmountToken1, // already in 18 decimals
        poolAddress,
        sqrtPriceX96,
        tickLower,
        tickUpper
      );

      const estimatedAmount1 = await slipStreamSugar.estimateAmount1(
        optimalAmountToken0, // already in 6 decimals
        poolAddress,
        sqrtPriceX96,
        tickLower,
        tickUpper
      );

      console.log("\n-------- Sugar Estimates --------");
      console.log(
        `Input amount0 (USDC): ${ethers.utils.formatUnits(
          optimalAmountToken0,
          token0Decimals
        )}`
      );
      console.log(
        `Input amount1 (OP): ${ethers.utils.formatUnits(
          optimalAmountToken1,
          token1Decimals
        )}`
      );
      console.log(
        `Estimated amount0 (for our token1): ${ethers.utils.formatUnits(
          estimatedAmount0,
          token0Decimals
        )}`
      );
      console.log(
        `Estimated amount1 (for our token0): ${ethers.utils.formatUnits(
          estimatedAmount1,
          token1Decimals
        )}`
      );
    } catch (error) {
      console.log("\nError in estimation:", error.message);
    }

    console.log("\n-------- Final Results --------");
    console.log(
      `Swap amount (from token0): ${ethers.utils.formatUnits(
        swapAmountToken0,
        token0Decimals
      )}`
    );
    console.log(`Optimal deposit amounts:
    Token0: ${ethers.utils.formatUnits(optimalAmountToken0, token0Decimals)}
    Token1: ${ethers.utils.formatUnits(optimalAmountToken1, token1Decimals)}`);
  }

  // --------------------------------------------------------------------------
  // End Simulation
  // --------------------------------------------------------------------------

  //   // Calculate liquidity using depositUSDC as token0 and 0 for token1
  //   const scaledDepositUSDC = ethers.utils.parseUnits(
  //     depositUSDC.toString(),
  //     token0Decimals
  //   );
  //   const liquidity = await sugar.getLiquidityForAmounts(
  //     scaledDepositUSDC,
  //     0,
  //     sqrtPriceX96,
  //     sqrtPriceLower,
  //     sqrtPriceUpper
  //   );

  //   console.log(`\nCalculated liquidity using depositUSDC (${depositUSDC}):`);
  //   console.log(`  Raw liquidity value: ${liquidity.toString()}`);
  //   console.log(
  //     `  Formatted liquidity: ${ethers.utils.formatUnits(liquidity, 18)}`
  //   );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
