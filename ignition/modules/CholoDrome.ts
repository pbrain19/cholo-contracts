// This setup uses Hardhat Ignition to manage smart contract deployments.
// Learn more about it at https://hardhat.org/ignition

import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

const CholoDromeModule = buildModule("CholoDromeModule", (m) => {
  // Constants from deploy.ts
  const uniswapSwapRouterAddress = "0xE592427A0AEce92De3Edee1F18E0157C05861564";
  const veloAddress = "0x9560e827af36c94d2ac33a39bce1fe78631088db";
  const usdtAddress = "0x94b008aA00579c1307B0EF2c499aD98a8ce58e58";
  const usdcAddress = "0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85";
  const deployerAddress = m.getAccount(0);

  // Deploy CholoDromeModule with constructor parameters
  const choloDromeModule = m.contract("CholoDromeModule", [
    deployerAddress, // _owner
    veloAddress, // _rewardToken
    usdtAddress, // _rewardStable
    uniswapSwapRouterAddress, // _swapRouter
    usdcAddress, // _usdc
  ]);

  return { choloDromeModule };
});

export default CholoDromeModule;
