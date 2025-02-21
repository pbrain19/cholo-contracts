import dotenv from "dotenv";

import type { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox-viem";
import "./script/getRoute";
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
      url: process.env.PROVIDER_URL!,
      accounts: [process.env.PRIVATE_KEY!],
    },
    base: {
      url: process.env.BASE_PROVIDER_URL!,
      accounts: [process.env.PRIVATE_KEY!],
    },
  },

  sourcify: {
    enabled: true,
  },

  etherscan: {
    apiKey: process.env.BASE_ETHERSCAN_API_KEY!,
  },
  gasReporter: {
    coinmarketcap: process.env.COINMARKETCAP_API_KEY!,
    enabled: true,
    currency: "USD",
    token: "op",
  },
};

export default config;
