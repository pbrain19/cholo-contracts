// This setup uses Hardhat Ignition to manage smart contract deployments.
// Learn more about it at https://hardhat.org/ignition

import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

const CholoDromeModule = buildModule("CholoDromeModule", (m) => {
  // Constants from deploy.ts
  const universalRouter = "0x198EF79F1F515F02dFE9e3115eD9fC07183f02fC";
  const rewardToken = "0x940181a94A35A4569E4529A3CDfB74e38FD98631";
  const usdtAddress = "0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2";
  const weth = "0x4200000000000000000000000000000000000006";
  const deployerAddress = m.getAccount(0);

  // Deploy CholoDromeModule with constructor parameters
  const choloDromeModule = m.contract("CholoDromeModule", [
    deployerAddress, // _owner
    rewardToken, // _rewardToken
    usdtAddress, // _rewardStable
    universalRouter, // _swapRouter
    weth, // _weth
  ]);

  return { choloDromeModule };
});

export default CholoDromeModule;
