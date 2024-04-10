import { HardhatUserConfig } from "hardhat/config";
import "@nomiclabs/hardhat-ethers";
import "@nomicfoundation/hardhat-chai-matchers";
import "@typechain/hardhat";

const config: HardhatUserConfig = {
  solidity: "0.8.16",
  networks: {
    hardhat: {
      chainId: 1,
    },
  },
};

export default config;
