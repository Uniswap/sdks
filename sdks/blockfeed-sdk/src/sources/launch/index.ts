/**
 * Launch-lifecycle sources — pure-reducer `Source` factories for Uniswap Liquidity Launcher auctions,
 * built against blockfeed's own engine contract. Read descriptors, decoders, and ABIs come from
 * `@uniswap/liquidity-launcher-sdk`; the value/orientation logic lives here.
 */

export { launchAssetSource } from './launchAssetSource'
export { quickLaunchAssetSource } from './quickLaunchAssetSource'
export { ccaBidsSource } from './ccaBidsSource'
export type { LaunchAssetState, CcaBidsState, LaunchPhase, LaunchAssetSourceArgs } from './types'

// Typed decode of a `BidSubmitted` feed log, re-exported from the launcher (where the event ABI and
// its sibling decoders live).
export { decodeBidSubmitted } from '@uniswap/liquidity-launcher-sdk'
export type { BidSubmitted } from '@uniswap/liquidity-launcher-sdk'
