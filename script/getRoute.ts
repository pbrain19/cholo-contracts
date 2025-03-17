import { poolsToApprove } from "./constants";
import { task } from "hardhat/config";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import CholoDromeModule from "../artifacts/contracts/CholoDromeModule.sol/CholoDromeModule.json";
import { ethers } from "ethers";

// Contract address from deployment
// const DEPLOYED_ADDRESS = "0xfD8B162f08c1c8D64E0Ed81AF65849C56C3500Ac";
const DEPLOYED_ADDRESS = "0x71CEc225d23F542ef669365412e5740b7009d869";

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
  }
);
