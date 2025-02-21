// This setup uses Hardhat Ignition to manage smart contract deployments.
// Learn more about it at https://hardhat.org/ignition

import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

const CholoDromeModule = buildModule("CholoDromeModule", (m) => {
  // Constants from deploy.ts
  const uniswapSwapRouterAddress = "0x2626664c2603336E57B271c5C0b26F421741e481";
  const rewardToken = "0x940181a94A35A4569E4529A3CDfB74e38FD98631";
  const usdtAddress = "0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2";
  const usdcAddress = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
  const weth = "0x4200000000000000000000000000000000000006";
  const deployerAddress = m.getAccount(0);

  // Deploy CholoDromeModule with constructor parameters
  const choloDromeModule = m.contract("CholoDromeModule", [
    deployerAddress, // _owner
    rewardToken, // _rewardToken
    usdtAddress, // _rewardStable
    uniswapSwapRouterAddress, // _swapRouter
    usdcAddress, // _usdc
    weth, // _weth
  ]);

  return { choloDromeModule };
});

export default CholoDromeModule;
