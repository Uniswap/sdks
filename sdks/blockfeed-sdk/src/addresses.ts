import { type Address, getAddress } from 'viem'

import { BlockfeedError } from './errors'

/**
 * Per-chain protocol addresses the blockfeed sources read from. Keyed by numeric chain id.
 *
 * Every address below is cross-verified against at least two independent sources:
 *   1. in-repo `@uniswap/sdk-core` (`sdks/sdk-core/src/addresses.ts`, `entities/weth9.ts`) — or, for
 *      v2 factories, `V2_FACTORY_ADDRESSES` there plus an on-chain `allPairsLength()` probe;
 *   2. the official Uniswap deployment docs
 *      (https://developers.uniswap.org/contracts/v4/deployments and the v3 deployment pages).
 * `v4PoolManagerDeployBlock` is the contract's actual creation block, found by binary-searching
 * `eth_getCode` on a public RPC for each chain (verified: no code at block-1, code at block).
 */
export interface ChainAddresses {
  v2Factory?: Address
  v3Factory: Address
  v4PoolManager: Address
  v4StateView: Address
  v4PoolManagerDeployBlock: bigint
  quoterV2: Address // v3 QuoterV2
  v4Quoter: Address
  weth: Address
}

export const CHAIN_ADDRESSES: Record<number, ChainAddresses> = {
  // Ethereum Mainnet
  1: {
    v2Factory: getAddress('0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f'),
    v3Factory: getAddress('0x1F98431c8aD98523631AE4a59f267346ea31F984'),
    v4PoolManager: getAddress('0x000000000004444c5dc75cB358380D2e3dE08A90'),
    v4StateView: getAddress('0x7ffe42c4a5deea5b0fec41c94c136cf115597227'),
    // v4 PoolManager creation block (2025-01, "v4 launch"); binary-searched via eth_getCode.
    v4PoolManagerDeployBlock: 21688329n,
    quoterV2: getAddress('0x61fFE014bA17989E743c5F6cB21bF9697530B21e'),
    v4Quoter: getAddress('0x52f0e24d1c21c8a0cb1e5a5dd6198556bd9e1203'),
    weth: getAddress('0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2'),
  },
  // Base
  8453: {
    v2Factory: getAddress('0x8909dc15e40173ff4699343b6eb8132c65e18ec6'),
    v3Factory: getAddress('0x33128a8fC17869897dcE68Ed026d694621f6FDfD'),
    v4PoolManager: getAddress('0x498581ff718922c3f8e6a244956af099b2652b2b'),
    v4StateView: getAddress('0xa3c0c9b65bad0b08107aa264b0f3db444b867a71'),
    // v4 PoolManager creation block on Base; binary-searched via eth_getCode.
    v4PoolManagerDeployBlock: 25350988n,
    quoterV2: getAddress('0x3d4e44Eb1374240CE5F1B871ab261CD16335B76a'),
    v4Quoter: getAddress('0x0d5e0f971ed27fbff6c2837bf31316121532048d'),
    weth: getAddress('0x4200000000000000000000000000000000000006'),
  },
  // Unichain
  130: {
    v2Factory: getAddress('0x1f98400000000000000000000000000000000002'),
    v3Factory: getAddress('0x1f98400000000000000000000000000000000003'),
    v4PoolManager: getAddress('0x1f98400000000000000000000000000000000004'),
    v4StateView: getAddress('0x86e8631a016f9068c3f085faf484ee3f5fdee8f2'),
    // v4 PoolManager is a genesis predeploy on Unichain (code present at block 0); binary-search
    // via eth_getCode confirms code exists at the earliest queryable block.
    v4PoolManagerDeployBlock: 0n,
    // sdk-core's generic `quoterAddress` field stores a different (non-V2) quoter for Unichain, so
    // it is not a valid source for this field; the docs QuoterV2 is corroborated on-chain (its
    // factory() returns the Unichain v3 factory 0x1f98…003).
    quoterV2: getAddress('0x385a5cf5f83e99f7bb2852b6a19c3538b9fa7658'),
    v4Quoter: getAddress('0x333e3c607b141b18ff6de9f258db6e77fe7491e0'),
    weth: getAddress('0x4200000000000000000000000000000000000006'),
  },
}

/**
 * Returns the protocol addresses for a chain, throwing {@link BlockfeedError} (with the chain id in
 * the message) when the chain is not in {@link CHAIN_ADDRESSES}.
 */
export function getChainAddresses(chainId: number): ChainAddresses {
  const addresses = CHAIN_ADDRESSES[chainId]
  if (!addresses) {
    throw new BlockfeedError(
      `Unsupported chainId ${chainId}: no blockfeed addresses registered. Supported chains: ${Object.keys(
        CHAIN_ADDRESSES
      ).join(', ')}.`
    )
  }
  return addresses
}
