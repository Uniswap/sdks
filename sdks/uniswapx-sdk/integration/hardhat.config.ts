import { HardhatUserConfig } from "hardhat/config";
import "@nomiclabs/hardhat-ethers";
import "@nomicfoundation/hardhat-chai-matchers";
import "@typechain/hardhat";

import 'dotenv/config'

const config: HardhatUserConfig = {
  solidity: "0.8.16",
  networks: {
    hardhat: {
      chainId: 1,
      ...(process.env.FORK_URL && {
        forking: {
          enabled: true,
          url: process.env.FORK_URL
        }
      })
    },
  },
};

export default config;
