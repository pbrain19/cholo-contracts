import dotenv from "dotenv";

import type { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox-viem";
import "./script/getRoute"; // Import the task

// Load environment variables from the .env file
dotenv.config();

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.20",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
      viaIR: true,
    },
  },
  networks: {
    hardhat: {
      allowUnlimitedContractSize: true,
    },

    optimism: {
      url: "https://mainnet.optimism.io/",
      accounts: [process.env.PRIVATE_KEY!],
    },
  },

  sourcify: {
    enabled: true,
  },

  etherscan: {
    apiKey: process.env.ETHERSCAN_API_KEY!,
  },
  gasReporter: {
    coinmarketcap: process.env.COINMARKETCAP_API_KEY!,
    enabled: true,
    currency: "USD",
    token: "op",
  },
};

export default config;
