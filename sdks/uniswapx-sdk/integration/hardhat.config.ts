import { HardhatUserConfig } from "hardhat/config";
import "@nomiclabs/hardhat-ethers";
import "@nomicfoundation/hardhat-chai-matchers";
import "@typechain/hardhat";

import 'dotenv/config'

// Only fork when a FORK_URL is provided. Specs that deploy everything they need
// (reactor, permit2, quoter, mock tokens) run on a plain local node, so leaving
// FORK_URL unset lets them run without a mainnet RPC. Fork-dependent specs still
// require FORK_URL, exactly as before.
const config: HardhatUserConfig = {
  solidity: "0.8.29",
  networks: {
    hardhat: {
      chainId: 1,
      forking: process.env.FORK_URL
        ? {
            enabled: true,
            url: process.env.FORK_URL,
          }
        : undefined,
    },
  },
};

export default config;
