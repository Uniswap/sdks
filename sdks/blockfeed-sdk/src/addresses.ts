import { CHAIN_TO_ADDRESSES_MAP, V2_FACTORY_ADDRESSES, WETH9 } from '@uniswap/sdk-core'
import { type Address, getAddress } from 'viem'

import { BlockfeedError } from './errors'

/**
 * Per-chain protocol addresses the blockfeed sources read from. Keyed by numeric chain id.
 *
 * Every field is either DERIVED from the workspace `@uniswap/sdk-core` dependency (so it can never
 * drift from that source) or carried in {@link BLOCKFEED_CHAIN_CONFIG} for the two fields sdk-core
 * cannot supply:
 *   - Derived (checksummed via viem `getAddress`): `v2Factory` ← `V2_FACTORY_ADDRESSES`,
 *     `v3Factory` ← `CHAIN_TO_ADDRESSES_MAP[].v3CoreFactoryAddress`,
 *     `v4PoolManager` ← `.v4PoolManagerAddress`, `v4StateView` ← `.v4StateView`,
 *     `v4Quoter` ← `.v4QuoterAddress`, `weth` ← `WETH9[chainId].address`.
 *   - Owned: `quoterV2` (sdk-core's generic `quoterAddress` is NOT the v3 QuoterV2 on Mainnet — it
 *     stores QuoterV1 0xb273… — nor on Unichain, so it is not a valid source) and
 *     `v4PoolManagerDeployBlock` (the contract's creation block, not tracked by sdk-core).
 *
 * The owned values were cross-verified against the official Uniswap deployment docs
 * (https://developers.uniswap.org/contracts/v4/deployments and the v3 deployment pages) and, for the
 * deploy blocks, by binary-searching `eth_getCode` on a public RPC per chain (no code at block-1,
 * code at block).
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

/**
 * The fields sdk-core cannot supply, plus (should the need arise) explicit overrides for any field
 * sdk-core lacks or disagrees on. The KEYS of this record DEFINE the blockfeed-supported chain set —
 * {@link getChainAddresses} throws for any chain absent here.
 *
 * As of this writing sdk-core carries every derivable field for all three chains and every value
 * matches the previously-hand-maintained literal, so no per-field overrides are needed.
 */
const BLOCKFEED_CHAIN_CONFIG: Record<
  number,
  {
    quoterV2: Address
    v4PoolManagerDeployBlock: bigint
    /** Explicit overrides for fields sdk-core lacks/disagrees on; each must carry a reason. */
    overrides?: Partial<Pick<ChainAddresses, 'v2Factory' | 'v3Factory' | 'v4PoolManager' | 'v4StateView' | 'v4Quoter' | 'weth'>>
  }
> = {
  // Ethereum Mainnet
  1: {
    quoterV2: getAddress('0x61fFE014bA17989E743c5F6cB21bF9697530B21e'),
    // v4 PoolManager creation block (2025-01, "v4 launch"); binary-searched via eth_getCode.
    v4PoolManagerDeployBlock: 21688329n,
  },
  // Base
  8453: {
    quoterV2: getAddress('0x3d4e44Eb1374240CE5F1B871ab261CD16335B76a'),
    // v4 PoolManager creation block on Base; binary-searched via eth_getCode.
    v4PoolManagerDeployBlock: 25350988n,
  },
  // Unichain
  130: {
    // sdk-core's generic `quoterAddress` field stores a different (non-V2) quoter for Unichain, so
    // it is not a valid source for this field; the docs QuoterV2 is corroborated on-chain (its
    // factory() returns the Unichain v3 factory 0x1f98…003).
    quoterV2: getAddress('0x385a5cf5f83e99f7bb2852b6a19c3538b9fa7658'),
    // v4 PoolManager is a genesis predeploy on Unichain (code present at block 0); binary-search
    // via eth_getCode confirms code exists at the earliest queryable block.
    v4PoolManagerDeployBlock: 0n,
  },
}

/**
 * Resolves a required sdk-core-derived address, checksumming it and failing loudly (rather than
 * emitting an `undefined` address) if sdk-core has no value for the chain. When that happens the fix
 * is an explicit `overrides` entry in {@link BLOCKFEED_CHAIN_CONFIG}.
 */
function deriveRequired(value: string | undefined, chainId: number, field: string): Address {
  if (!value) {
    throw new BlockfeedError(
      `sdk-core has no ${field} for chain ${chainId}; add an explicit override in BLOCKFEED_CHAIN_CONFIG.`
    )
  }
  return getAddress(value)
}

function buildChainAddresses(chainId: number, config: (typeof BLOCKFEED_CHAIN_CONFIG)[number]): ChainAddresses {
  const sdk = CHAIN_TO_ADDRESSES_MAP[chainId as keyof typeof CHAIN_TO_ADDRESSES_MAP] as
    | (typeof CHAIN_TO_ADDRESSES_MAP)[keyof typeof CHAIN_TO_ADDRESSES_MAP]
    | undefined
  const v2Factory = config.overrides?.v2Factory ?? (V2_FACTORY_ADDRESSES[chainId] ? getAddress(V2_FACTORY_ADDRESSES[chainId]) : undefined)
  const weth = config.overrides?.weth ?? deriveRequired(WETH9[chainId]?.address, chainId, 'WETH9')
  return {
    v2Factory,
    v3Factory: config.overrides?.v3Factory ?? deriveRequired(sdk?.v3CoreFactoryAddress, chainId, 'v3CoreFactoryAddress'),
    v4PoolManager: config.overrides?.v4PoolManager ?? deriveRequired(sdk?.v4PoolManagerAddress, chainId, 'v4PoolManagerAddress'),
    v4StateView: config.overrides?.v4StateView ?? deriveRequired(sdk?.v4StateView, chainId, 'v4StateView'),
    v4Quoter: config.overrides?.v4Quoter ?? deriveRequired(sdk?.v4QuoterAddress, chainId, 'v4QuoterAddress'),
    weth,
    quoterV2: config.quoterV2,
    v4PoolManagerDeployBlock: config.v4PoolManagerDeployBlock,
  }
}

/**
 * Frozen registry of per-chain protocol addresses, keyed by numeric chain id. Built at module load by
 * merging sdk-core-derived fields with the owned {@link BLOCKFEED_CHAIN_CONFIG}. Deep-frozen (the
 * record and each chain's address object) so consumers treat it as read-only canonical data —
 * mutating it would silently corrupt every source on that chain.
 */
export const CHAIN_ADDRESSES: Readonly<Record<number, Readonly<ChainAddresses>>> = Object.freeze(
  Object.fromEntries(
    Object.entries(BLOCKFEED_CHAIN_CONFIG).map(([id, config]) => [
      Number(id),
      Object.freeze(buildChainAddresses(Number(id), config)),
    ])
  )
)

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
