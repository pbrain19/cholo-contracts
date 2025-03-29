import hre from "hardhat";

import { Contract, providers, utils as ethersUtils, ethers } from "ethers";
import SugarAbi from "./abi/Sugar.json";
import { formatUnits } from "ethers/lib/utils";

// Sugar contract address
const VELO_SUGAR = "0x63a73829C74e936C1D2EEbE64164694f16700138";

// Simple ERC20 ABI with only the symbol and decimals functions
const ERC20_ABI = [
  {
    constant: true,
    inputs: [],
    name: "symbol",
    outputs: [{ name: "", type: "string" }],
    payable: false,
    stateMutability: "view",
    type: "function",
  },
  {
    constant: true,
    inputs: [],
    name: "decimals",
    outputs: [{ name: "", type: "uint8" }],
    payable: false,
    stateMutability: "view",
    type: "function",
  },
];

interface LpInfo {
  lp: string;
  symbol: string;
  decimals: number;
  liquidity: BigInt;
  type: number;
  tick: number;
  sqrt_ratio: BigInt;
  token0: string;
  reserve0: BigInt;
  staked0: BigInt;
  token1: string;
  reserve1: BigInt;
  staked1: BigInt;
  gauge: string;
  gauge_liquidity: BigInt;
  gauge_alive: boolean;
  fee: string;
  bribe: string;
  factory: string;
  emissions: BigInt;
  emissions_token: string;
  pool_fee: BigInt;
  unstaked_fee: BigInt;
  token0_fees: BigInt;
  token1_fees: BigInt;
  nfpm: string;
  alm: string;
}

interface TokenInfo {
  address: string;
  symbol: string;
  decimals: number;
}

/**
 * Fetches the symbol and decimals for a token
 *
 * @param provider Ethers provider
 * @param tokenAddress The token address
 * @returns Token symbol and decimals
 */
async function getTokenInfo(
  provider: providers.Provider,
  tokenAddress: string
): Promise<TokenInfo> {
  try {
    const tokenContract = new Contract(tokenAddress, ERC20_ABI, provider);
    const symbol = await tokenContract.symbol();
    const decimals = await tokenContract.decimals();

    return {
      address: tokenAddress,
      symbol,
      decimals,
    };
  } catch (err) {
    console.error(`Failed to fetch token info for ${tokenAddress}:`, err);
    return {
      address: tokenAddress,
      symbol: "UNKNOWN",
      decimals: 18,
    };
  }
}

/**
 * Fetches pools from the Velodrome/Aerodrome sugar contract in batches
 *
 * @param provider Ethers provider
 * @returns Array of filtered pool information
 */
async function fetchAllPools(provider: providers.Provider): Promise<LpInfo[]> {
  const sugarContract = new Contract(
    VELO_SUGAR.toLowerCase(),
    SugarAbi,
    provider
  );

  const POOLS_TO_FETCH = 8000;
  const PAGE_SIZE = 500;
  const allPools: LpInfo[] = [];
  const fetchPromises: Promise<LpInfo[]>[] = [];

  console.log(
    `Fetching up to ${POOLS_TO_FETCH} pools in batches of ${PAGE_SIZE}...`
  );

  // Create promises for all batch requests
  for (let offset = 0; offset < POOLS_TO_FETCH; offset += PAGE_SIZE) {
    const fetchPromise = sugarContract
      .all(PAGE_SIZE, offset)
      .then((pools: LpInfo[]) => {
        console.log(`Fetched ${pools.length} pools from offset ${offset}`);
        return pools;
      })
      .catch((err: any) => {
        console.error(`Error fetching pools from offset ${offset}:`, err);
        return [];
      });

    fetchPromises.push(fetchPromise);
  }

  // Execute all promises in parallel
  const poolBatches = await Promise.all(fetchPromises);

  // Combine all batches
  for (const batch of poolBatches) {
    allPools.push(...batch);
  }

  console.log(`Total pools fetched: ${allPools.length}`);

  // Filter pools: only include those with emissions and type >= 1 (Concentrated Liquidity pools)
  const filteredPools = allPools.filter(
    (pool) => pool.emissions.toString() !== "0" && pool.type >= 1
  );

  console.log(`Filtered to ${filteredPools.length} CL pools with emissions`);

  return filteredPools;
}

/**
 * Fetches pools from Velodrome/Aerodrome sugar contract
 * and displays pools with emissions, filtering for CL pools
 *
 * @param provider Ethers provider
 */
async function displayPoolsInfo(provider: providers.Provider): Promise<void> {
  try {
    // Fetch all pools and filter
    const pools = await fetchAllPools(provider);

    if (pools.length === 0) {
      console.log("No CL pools with emissions found.");
      return;
    }

    // Create a unique set of token addresses to fetch
    const tokenAddresses = new Set<string>();
    for (const pool of pools) {
      tokenAddresses.add(pool.token0.toLowerCase());
      tokenAddresses.add(pool.token1.toLowerCase());
      if (pool.emissions_token) {
        tokenAddresses.add(pool.emissions_token.toLowerCase());
      }
    }

    console.log(
      `Fetching token info for ${tokenAddresses.size} unique tokens...`
    );

    // Fetch token info (symbol and decimals) for all tokens
    const tokenInfoMap = new Map<string, TokenInfo>();
    const tokenPromises: Promise<void>[] = [];

    for (const address of tokenAddresses) {
      const promise = getTokenInfo(provider, address).then((info) => {
        tokenInfoMap.set(address.toLowerCase(), info);
      });
      tokenPromises.push(promise);
    }

    await Promise.all(tokenPromises);
    console.log(`Fetched info for ${tokenInfoMap.size} tokens`);

    // Variable to store the DRB/WETH pool details from the screenshot
    let drbWethPool: LpInfo | null = null;

    // Display pools information
    console.log(
      "\nPOOL LIST - TOKEN0/TOKEN1 - LIQUIDITY - EMISSIONS - POOL TYPE"
    );
    console.log("=".repeat(80));

    for (const pool of pools) {
      // Get token symbols
      const token0Info = tokenInfoMap.get(pool.token0.toLowerCase()) || {
        symbol: "UNKNOWN",
        decimals: 18,
      };
      const token1Info = tokenInfoMap.get(pool.token1.toLowerCase()) || {
        symbol: "UNKNOWN",
        decimals: 18,
      };

      // Get emissions token info if available
      const emissionsTokenInfo = pool.emissions_token
        ? tokenInfoMap.get(pool.emissions_token.toLowerCase()) || {
            symbol: "UNKNOWN",
            decimals: 18,
          }
        : { symbol: "NONE", decimals: 18 };

      // Format liquidity and emissions
      const liquidityFormatted = formatUnits(
        pool.liquidity.toString(),
        pool.decimals
      );
      const emissionsFormatted =
        formatUnits(pool.emissions.toString(), emissionsTokenInfo.decimals) +
        ` ${emissionsTokenInfo.symbol}/sec`;

      // Format pool type (CL-tickSpacing)
      const poolTypeFormatted = `CL-${pool.type}`;

      // Check if this is the DRB/WETH CL-200 pool from the screenshot
      if (
        pool.type === 200 &&
        ((token0Info.symbol === "BNKR" && token1Info.symbol === "WETH") ||
          (token0Info.symbol === "WETH" && token1Info.symbol === "BNKR"))
      ) {
        drbWethPool = pool;
      }

      // Display pool information
      console.log(
        `${poolTypeFormatted}-${token0Info.symbol}/${token1Info.symbol} - ${liquidityFormatted} - ${emissionsFormatted}`
      );
    }

    // Display detailed information about the DRB/WETH pool if found
    if (drbWethPool) {
      const token0Info = tokenInfoMap.get(drbWethPool.token0.toLowerCase()) || {
        symbol: "UNKNOWN",
        decimals: 18,
      };
      const token1Info = tokenInfoMap.get(drbWethPool.token1.toLowerCase()) || {
        symbol: "UNKNOWN",
        decimals: 18,
      };
      const emissionsTokenInfo = drbWethPool.emissions_token
        ? tokenInfoMap.get(drbWethPool.emissions_token.toLowerCase()) || {
            symbol: "UNKNOWN",
            decimals: 18,
          }
        : { symbol: "NONE", decimals: 18 };

      console.log("\n\n");
      console.log("===== DETAILED INFORMATION ABOUT DRB/WETH POOL =====");
      console.log("\nPool Address:", drbWethPool.lp);
      console.log("Pool Symbol:", drbWethPool.symbol);
      console.log("Pool Type: CL-200 (Concentrated Liquidity)");
      console.log(`Token0: ${token0Info.symbol} (${drbWethPool.token0})`);
      console.log(`Token1: ${token1Info.symbol} (${drbWethPool.token1})`);
      console.log("Decimals:", drbWethPool.decimals);

      // Format liquidity
      const liquidityFormatted = formatUnits(
        drbWethPool.liquidity.toString(),
        drbWethPool.decimals
      );
      console.log("Liquidity:", liquidityFormatted);

      console.log("Current Tick:", drbWethPool.tick);
      console.log("Sqrt Ratio X96:", drbWethPool.sqrt_ratio.toString());

      // Format reserves
      const reserve0Formatted = formatUnits(
        drbWethPool.reserve0.toString(),
        token0Info.decimals
      );
      const reserve1Formatted = formatUnits(
        drbWethPool.reserve1.toString(),
        token1Info.decimals
      );
      console.log("Reserve0:", reserve0Formatted, token0Info.symbol);
      console.log("Reserve1:", reserve1Formatted, token1Info.symbol);

      // Format staked amounts
      console.log(
        "Staked0:",
        formatUnits(drbWethPool.staked0.toString(), token0Info.decimals),
        token0Info.symbol
      );
      console.log(
        "Staked1:",
        formatUnits(drbWethPool.staked1.toString(), token1Info.decimals),
        token1Info.symbol
      );

      console.log("Gauge Address:", drbWethPool.gauge);
      console.log(
        "Gauge Liquidity:",
        formatUnits(
          drbWethPool.gauge_liquidity.toString(),
          drbWethPool.decimals
        )
      );
      console.log("Gauge Active:", drbWethPool.gauge_alive);
      console.log("Fee Address:", drbWethPool.fee);
      console.log("Bribe Address:", drbWethPool.bribe);
      console.log("Factory Address:", drbWethPool.factory);

      // Format emissions
      const emissionsPerSecFormatted = formatUnits(
        drbWethPool.emissions.toString(),
        emissionsTokenInfo.decimals
      );
      console.log(
        "Emissions:",
        emissionsPerSecFormatted,
        `${emissionsTokenInfo.symbol}/sec`
      );

      // Calculate emissions per year
      const emissionsPerSec = parseFloat(emissionsPerSecFormatted);
      const SECONDS_PER_YEAR = 365 * 24 * 60 * 60;
      const emissionsPerYear = emissionsPerSec * SECONDS_PER_YEAR;
      console.log(
        "Emissions per year:",
        emissionsPerYear,
        emissionsTokenInfo.symbol
      );

      // Calculate APR based on the given AERO price in ETH
      // Assuming 1 AERO = 0.000256654676237627 ETH as mentioned
      let aeroToEthRate = 0.000256654676237627;

      // Total pool liquidity in ETH (already in ETH units from formatUnits)
      const totalLiquidityInEth = parseFloat(liquidityFormatted);

      // Value of yearly emissions in ETH
      let yearlyEmissionsValueInEth = 0;

      if (emissionsTokenInfo.symbol === "AERO") {
        yearlyEmissionsValueInEth = emissionsPerYear * aeroToEthRate;
      } else {
        console.log(
          "Emissions token is not AERO, using a placeholder calculation"
        );
        // If not AERO, this is just a placeholder calculation
        yearlyEmissionsValueInEth = emissionsPerYear * aeroToEthRate;
      }

      // Calculate APR (Annual Percentage Rate)
      const calculatedAPR =
        (yearlyEmissionsValueInEth / totalLiquidityInEth) * 100;
      console.log(
        `\nCalculated APR (using 1 ${
          emissionsTokenInfo.symbol
        } = ${aeroToEthRate} ETH): ${calculatedAPR.toFixed(2)}%`
      );

      // Value of reserves in ETH (if token0 or token1 is WETH, we can use that directly)
      let totalValueInEth = 0;

      if (token0Info.symbol === "WETH") {
        totalValueInEth = parseFloat(reserve0Formatted);
        console.log(`\nPool ETH value from Reserve0: ${totalValueInEth} ETH`);
      } else if (token1Info.symbol === "WETH") {
        totalValueInEth = parseFloat(reserve1Formatted);
        console.log(`\nPool ETH value from Reserve1: ${totalValueInEth} ETH`);
      }

      // Alternative APR calculation based on reserves
      if (totalValueInEth > 0) {
        const alternativeAPR =
          (yearlyEmissionsValueInEth / totalValueInEth) * 100;
        console.log(
          `Alternative APR (based on ETH reserves): ${alternativeAPR.toFixed(
            2
          )}%`
        );
      }

      // Calculate APR based on gauge liquidity
      const gaugeLiquidityFormatted = formatUnits(
        drbWethPool.gauge_liquidity.toString(),
        drbWethPool.decimals
      );
      const gaugeLiquidityInEth = parseFloat(gaugeLiquidityFormatted);

      if (gaugeLiquidityInEth > 0) {
        const gaugeAPR =
          (yearlyEmissionsValueInEth / gaugeLiquidityInEth) * 100;
        console.log(`APR based on gauge liquidity: ${gaugeAPR.toFixed(2)}%`);

        // The 9,000% APR might be coming from a very small amount of gauge liquidity
        console.log(
          `\nFor reference, to get a 9,000% APR with ${yearlyEmissionsValueInEth.toFixed(
            8
          )} ETH worth of yearly emissions,`
        );
        console.log(
          `the gauge liquidity would need to be around ${(
            yearlyEmissionsValueInEth / 90
          ).toFixed(8)} ETH`
        );
      }

      // Check if we're dealing with imprecise values that could lead to extreme APRs
      console.log("\nPossible APR calculation scenarios:");

      // Scenario 1: Calculate what gauge liquidity would result in 9,000% APR
      const targetAPR = 9000;
      const requiredGaugeLiquidity =
        yearlyEmissionsValueInEth / (targetAPR / 100);
      console.log(
        `For a ${targetAPR}% APR, gauge liquidity would need to be: ${requiredGaugeLiquidity.toFixed(
          10
        )} ETH`
      );

      // Scenario 2: If we only consider staked/active liquidity instead of total liquidity
      if (token0Info.symbol === "WETH") {
        const stakedEth = parseFloat(
          formatUnits(drbWethPool.staked0.toString(), token0Info.decimals)
        );
        if (stakedEth > 0) {
          const stakedAPR = (yearlyEmissionsValueInEth / stakedEth) * 100;
          console.log(`APR based on staked ETH: ${stakedAPR.toFixed(2)}%`);
        }
      } else if (token1Info.symbol === "WETH") {
        const stakedEth = parseFloat(
          formatUnits(drbWethPool.staked1.toString(), token1Info.decimals)
        );
        if (stakedEth > 0) {
          const stakedAPR = (yearlyEmissionsValueInEth / stakedEth) * 100;
          console.log(`APR based on staked ETH: ${stakedAPR.toFixed(2)}%`);
        }
      }

      console.log(
        "\nEmissions Token:",
        `${emissionsTokenInfo.symbol} (${drbWethPool.emissions_token})`
      );
      console.log(
        "Pool Fee:",
        formatUnits(drbWethPool.pool_fee.toString(), 18)
      );
      console.log(
        "Unstaked Fee:",
        formatUnits(drbWethPool.unstaked_fee.toString(), 18)
      );
      console.log(
        "Token0 Fees:",
        formatUnits(drbWethPool.token0_fees.toString(), token0Info.decimals),
        token0Info.symbol
      );
      console.log(
        "Token1 Fees:",
        formatUnits(drbWethPool.token1_fees.toString(), token1Info.decimals),
        token1Info.symbol
      );
      console.log("NFPM Address:", drbWethPool.nfpm);
      console.log("ALM Address:", drbWethPool.alm);
      console.log("\n===================================================");
    } else {
      console.log("\nDRB/WETH CL-200 pool was not found in the fetched pools.");
    }
  } catch (err) {
    console.error("Failed to display pool data:", err);
  }
}

// Connect to the provider and run the script
async function main() {
  const networkConfig = hre.network.config as { url: string };
  const provider = new ethers.providers.JsonRpcProvider(networkConfig.url);
  await displayPoolsInfo(provider);
}

// Execute the script
main().catch(console.error);
