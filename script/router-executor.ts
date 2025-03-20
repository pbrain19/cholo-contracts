import { ethers } from "ethers";
import { RoutePlanner, CommandType } from "./planner";
import { formatUnits } from "ethers/lib/utils";
import { Tenderly } from "@tenderly/sdk";
import { TOKEN_INFO } from "./constants";
import { encodeRouteToPath, Route } from "./graph";

// Universal Router address
export const UNIVERSAL_ROUTER = "0x6Cb442acF35158D5eDa88fe602221b67B400Be3E";

/**
 * Prepares a swap transaction using the Universal Router
 * @param wallet The ethers wallet to use for the transaction
 * @param universalRouter The Universal Router contract instance
 * @param route The route to execute
 * @param amountIn The amount to swap
 * @param amountOutMinimum The minimum amount out
 * @param fromToken The token to swap from
 * @param toToken The token to swap to
 * @returns The prepared transaction parameters
 */
export async function prepareSwapTransaction(
  wallet: ethers.Wallet,
  universalRouter: ethers.Contract,
  route: Route[],
  amountIn: ethers.BigNumber,
  amountOutMinimum: ethers.BigNumber,
  fromToken: string,
  toToken: string
) {
  // Debug route information
  console.log("\n---- Route Information ----");
  route.forEach((hop, index) => {
    console.log(`Hop ${index + 1}:`);
    console.log(`  From: ${hop.from}`);
    console.log(`  To: ${hop.to}`);
    console.log(`  Pool Type: ${hop.pool.type}`);
    console.log(`  Stable: ${hop.stable}`);
    console.log(`  Pool Address: ${hop.poolAddress}`);
  });
  console.log("-------------------------\n");

  // Create a new route planner
  const planner = new RoutePlanner();

  // Get all hops from the route
  console.log(`Route has ${route.length} hops`);

  // Group hops by pool type
  const batchedHops: Array<{ type: "v2" | "v3"; hops: Route[] }> = [];
  let currentBatch: { type: "v2" | "v3"; hops: Route[] } | null = null;

  // First, group consecutive hops of the same type
  for (let i = 0; i < route.length; i++) {
    const hop = route[i];
    // For V2 pools, type is -1 (stable) or 0 (volatile)
    // For V3 pools, type is the tickSpacing value (positive)
    const isV3Pool = hop.pool.type > 0;
    const hopType = isV3Pool ? "v3" : "v2";

    if (!currentBatch || currentBatch.type !== hopType) {
      // Start a new batch
      if (currentBatch) {
        batchedHops.push(currentBatch);
      }
      currentBatch = { type: hopType, hops: [hop] };
    } else {
      // Add to current batch
      currentBatch.hops.push(hop);
    }
  }

  // Add the last batch
  if (currentBatch) {
    batchedHops.push(currentBatch);
  }

  console.log(`Grouped into ${batchedHops.length} batches by pool type:`);
  batchedHops.forEach((batch, index) => {
    console.log(
      `Batch ${index + 1}: ${batch.type.toUpperCase()} with ${
        batch.hops.length
      } hops`
    );
  });

  // Now process each batch
  let remainingAmount = amountIn;
  let isFirstHop = true;
  let batchIndex = 0;

  for (const batch of batchedHops) {
    batchIndex++;
    const isLastBatch = batchIndex === batchedHops.length;
    console.log(
      `\nProcessing ${batch.type.toUpperCase()} batch ${batchIndex} of ${
        batchedHops.length
      }`
    );

    // For V2 batch
    if (batch.type === "v2") {
      const v2Routes = batch.hops.map((hop) => ({
        from: hop.from,
        to: hop.to,
        stable: hop.stable || false,
      }));

      // Only the last batch should use the minimum amount out
      const batchAmountOutMin = isLastBatch
        ? amountOutMinimum
        : ethers.BigNumber.from(0);

      // Only the first batch should use the original amountIn
      const batchAmountIn = isFirstHop
        ? remainingAmount
        : ethers.BigNumber.from(0);

      // The recipient is the wallet for the last batch, otherwise the router
      const recipient = isLastBatch ? wallet.address : UNIVERSAL_ROUTER;

      console.log(`- Batch amount in: ${batchAmountIn.toString()}`);
      console.log(`- Batch min out: ${batchAmountOutMin.toString()}`);
      console.log(`- Recipient: ${recipient}`);
      console.log(`- Route length: ${v2Routes.length}`);

      // Detailed pool information for debugging
      console.log("- V2 Routes Detail:");
      v2Routes.forEach((r, i) => {
        console.log(
          `  Route ${i + 1}: ${r.from} -> ${r.to} (stable: ${r.stable})`
        );
      });

      // Add the V2 command for the entire batch of V2 hops
      planner.addCommand(CommandType.V2_SWAP_EXACT_IN, [
        recipient,
        batchAmountIn.toBigInt(),
        batchAmountOutMin.toBigInt(),
        v2Routes,
        isFirstHop, // payerIsUser true only for first hop
      ]);
    }
    // For V3 batch
    else {
      // When mixing V2 and V3, we need to process each V3 hop individually
      // to ensure proper token handling between different pool types
      if (batchedHops.length > 1) {
        console.log("- Processing V3 hops individually (mixed route)");

        for (let i = 0; i < batch.hops.length; i++) {
          const hop = batch.hops[i];
          const isLastHopInBatch = i === batch.hops.length - 1;
          const isFirstHopInBatch = i === 0;
          const isLastHopOverall = isLastBatch && isLastHopInBatch;

          // Only the first hop overall should use the original amountIn
          const hopAmountIn =
            isFirstHop && isFirstHopInBatch
              ? remainingAmount
              : ethers.BigNumber.from(0);

          // Only the last hop overall should use the minimum amount out
          const hopAmountOutMin = isLastHopOverall
            ? amountOutMinimum
            : ethers.BigNumber.from(0);

          // The recipient is the wallet for the last hop overall, otherwise the router
          const recipient = isLastHopOverall
            ? wallet.address
            : UNIVERSAL_ROUTER;

          console.log(`- V3 Hop ${i + 1} of ${batch.hops.length}:`);
          console.log(`  - From: ${hop.from}`);
          console.log(`  - To: ${hop.to}`);
          console.log(`  - Pool Type: ${hop.pool.type}`);
          console.log(`  - Amount In: ${hopAmountIn.toString()}`);
          console.log(`  - Min Out: ${hopAmountOutMin.toString()}`);
          console.log(`  - Recipient: ${recipient}`);

          // Encode the path for the V3 hop
          const path = encodeRouteToPath([hop], false);
          console.log(`  - Encoded Path: ${path}`);

          // Add the V3 command for this hop
          planner.addCommand(CommandType.V3_SWAP_EXACT_IN, [
            recipient,
            hopAmountIn.toBigInt(),
            hopAmountOutMin.toBigInt(),
            path,
            isFirstHop && isFirstHopInBatch, // payerIsUser true only for first hop overall
          ]);
        }
      }
      // If it's only V3 pools with no mixing, we can use a single command
      else {
        console.log("- Processing V3 batch with single command");

        // Encode all V3 hops into a single path
        const encodedPath = encodeRouteToPath(batch.hops, false);

        // Only the last batch should use the minimum amount out
        const batchAmountOutMin = isLastBatch
          ? amountOutMinimum
          : ethers.BigNumber.from(0);

        // Only the first batch should use the original amountIn
        const batchAmountIn = isFirstHop
          ? remainingAmount
          : ethers.BigNumber.from(0);

        // The recipient is the wallet for the last batch, otherwise the router
        const recipient = isLastBatch ? wallet.address : UNIVERSAL_ROUTER;

        console.log(`- V3 Batch (single command):`);
        console.log(`  - Amount In: ${batchAmountIn.toString()}`);
        console.log(`  - Min Out: ${batchAmountOutMin.toString()}`);
        console.log(`  - Recipient: ${recipient}`);
        console.log(`  - Number of hops: ${batch.hops.length}`);
        console.log(`  - Encoded Path: ${encodedPath}`);

        // Detailed hop information for debugging
        batch.hops.forEach((hop, i) => {
          console.log(
            `  Hop ${i + 1}: ${hop.from} -> ${hop.to} (type: ${hop.pool.type})`
          );
        });

        // Add the V3 command for all hops in the batch
        planner.addCommand(CommandType.V3_SWAP_EXACT_IN, [
          recipient,
          batchAmountIn.toBigInt(),
          batchAmountOutMin.toBigInt(),
          encodedPath,
          isFirstHop, // payerIsUser true only for first hop
        ]);
      }
    }

    // No longer the first hop after processing the first batch
    if (isFirstHop) {
      isFirstHop = false;
    }
  }

  // Get the commands and inputs from the planner
  const commands = planner.commands;
  const inputs = planner.inputs;

  console.log("\nFinal transaction parameters:");
  console.log(`Commands: ${commands}`);
  console.log(`Number of inputs: ${inputs.length}`);

  // Return the prepared transaction data
  return { commands, inputs };
}

/**
 * Simulates a transaction using Tenderly
 * @param provider The ethers provider
 * @param wallet The ethers wallet
 * @param universalRouter The Universal Router contract instance
 * @param commands The commands to execute
 * @param inputs The inputs for the commands
 * @returns The simulation results
 */
export async function simulateTransaction(
  provider: ethers.providers.Provider,
  wallet: ethers.Wallet,
  universalRouter: ethers.Contract,
  commands: string,
  inputs: any[]
) {
  if (!process.env.TENDERLY_API_KEY) {
    throw new Error("TENDERLY_API_KEY is required for transaction simulation");
  }

  console.log("Simulating transaction with Tenderly...");

  // Get the transaction data that would be sent
  const txData = await universalRouter.populateTransaction[
    "execute(bytes,bytes[])"
  ](commands, inputs, { value: 0 });
  console.log("txData:", txData);
  // Get current block number for simulation
  const currentBlock = await provider.getBlockNumber();

  // Initialize Tenderly
  const tenderlyInstance = new Tenderly({
    accountName: "top_nexus",
    projectName: "caballo",
    accessKey: process.env.TENDERLY_API_KEY,
    network: 8453, // Base network ID
  });

  // Simulate transaction
  const simulation = await tenderlyInstance.simulator.simulateTransaction({
    transaction: {
      from: wallet.address,
      to: UNIVERSAL_ROUTER,
      gas: 20000000, // High initial gas limit for simulation
      gas_price: "0", // Let Tenderly determine the gas price
      value: "0",
      input: txData.data || "0x",
    },
    blockNumber: currentBlock,
  });

  if (!simulation || !simulation.status) {
    console.log(simulation);
    throw new Error("Transaction simulation failed");
  }

  const estimate = await wallet.estimateGas(txData);

  console.log("Tenderly simulation results:");
  console.log(`- Status: ${simulation.status}`);
  console.log(`- Gas used: ${simulation.gasUsed}`);
  console.log(
    `See simulation details at: https://dashboard.tenderly.co/top_nexus/caballo/simulator`
  );

  console.log("Estimate from wallet:", estimate.toString());
  if (estimate.toBigInt() > 0n) {
    throw new Error("Gas estimate is greater than 0");
  }

  return { simulation, txData };
}

/**
 * Approves tokens for the Universal Router
 * @param wallet The ethers wallet
 * @param tokenAddress The token address
 * @param amount The amount to approve
 */
export async function approveTokens(
  wallet: ethers.Wallet,
  tokenAddress: string,
  amount: ethers.BigNumber
) {
  console.log("Approving tokens for swap...");
  const tokenContract = new ethers.Contract(
    tokenAddress,
    [
      "function approve(address spender, uint256 amount) returns (bool)",
      "function allowance(address owner, address spender) view returns (uint256)",
    ],
    wallet
  );

  // Check current allowance
  const allowance = await tokenContract.allowance(
    wallet.address,
    UNIVERSAL_ROUTER
  );

  console.log("allowance:", allowance.toBigInt().toString());

  // If allowance is less than amount, approve
  if (allowance.toBigInt() < amount.toBigInt()) {
    const approveTx = await tokenContract.approve(UNIVERSAL_ROUTER, amount);
    console.log("Approval transaction sent:", approveTx.hash);
    await approveTx.wait();
    console.log("Token approval completed");
    return true;
  } else {
    console.log("Sufficient allowance already exists");
    return false;
  }
}

/**
 * Executes a swap transaction
 * @param wallet The ethers wallet
 * @param universalRouter The Universal Router contract instance
 * @param txData The transaction data
 * @param gasEstimate The gas estimate from simulation
 * @returns The transaction receipt
 */
export async function executeSwap(
  wallet: ethers.Wallet,
  universalRouter: ethers.Contract,
  txData: ethers.PopulatedTransaction,
  gasEstimate: number
) {
  console.log("Executing swap...");

  const tx = await wallet.sendTransaction({
    to: UNIVERSAL_ROUTER,
    data: txData.data,
    value: 0,
    gasLimit: BigInt(Math.ceil(gasEstimate * 1.2)), // Add 20% buffer to gas estimate
  });

  console.log("Swap transaction sent:", tx.hash);
  const receipt = await tx.wait();
  console.log("Swap completed!");

  return receipt;
}
