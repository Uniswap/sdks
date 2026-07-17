/**
 * CCA blockfeed sources — pure-reducer `Source` factories for `@uniswap/blockfeed-sdk`.
 *
 * These export plain objects that structurally satisfy blockfeed's engine `Source<T>` contract with
 * zero runtime dependency on that package (it is a devDependency; a types-only drift guard keeps the
 * shapes compatible). See design doc §6.
 *
 * The structural mirror types in `./types` (Source/TickData/TickIdentity/CallResult/SpeculativeCall/
 * LogFilter/SourceEmission/TickContext/FeedLogRef/DecodedFeedLog) are internal to this module and are
 * intentionally NOT re-exported — only the source factories and their value/args types are public.
 */

export { ccaAuctionSource } from './ccaAuctionSource'
export { ccaBidsSource } from './ccaBidsSource'
export { launchAssetSource } from './launchAssetSource'
export type {
  LaunchAssetState,
  CcaAuctionState,
  CcaBidsState,
  LaunchPhase,
  LaunchAssetSourceArgs,
} from './types'
