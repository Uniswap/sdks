/**
 * CCA blockfeed sources — pure-reducer `Source` factories for `@uniswap/blockfeed-sdk`.
 *
 * These export plain objects that structurally satisfy blockfeed's engine `Source<T>` contract with
 * zero runtime dependency on that package (it is a devDependency; a types-only drift guard keeps the
 * shapes compatible). See design doc §6.
 */

export * from './types'
export * from './ccaAuctionSource'
export * from './ccaBidsSource'
export * from './launchAssetSource'
