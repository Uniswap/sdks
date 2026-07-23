/**
 * @uniswap/margin-sdk
 *
 * A framework-agnostic toolkit for the Uniswap v4 margin trading periphery: leveraged spot
 * positions built from a v4 swap plus a borrow/supply against an external lending venue (Morpho
 * Blue, Aave v3, Aave v4), all behind one MarginRouter.
 */

// Chains & addresses
export * from './chains'
export * from './addresses'

// Constants & errors
export * from './constants'
export * from './errors'

// Onchain struct mirrors & ABIs
export * from './types'
export * from './abis'

// Markets, account derivation, leverage & health math
export * from './market'
export * from './account'
export * from './math'

// Entry-point encoders & the execute-plan builder
export * from './encode'
export * from './actions'
export * from './planner'

// Reads (descriptors + viem helpers)
export * from './reads'
