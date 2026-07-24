/**
 * @uniswap/margin-sdk
 *
 * A framework-agnostic toolkit for the Uniswap v4 margin trading periphery: leveraged spot
 * positions built from a v4 swap plus a borrow/supply against an external lending venue (Morpho
 * Blue, Aave v3, Aave v4), all behind one MarginRouter.
 */

// Chains & addresses
export * from './chains.js'
export * from './addresses.js'

// Constants & errors
export * from './constants.js'
export * from './errors.js'

// Onchain struct mirrors & ABIs
export * from './types.js'
export * from './abis.js'

// Markets, account derivation, leverage & health math
export * from './market.js'
export * from './account.js'
export * from './math.js'

// Entry-point encoders & the execute-plan builder
export * from './encode.js'
export * from './actions.js'
export * from './planner.js'

// Reads (descriptors + viem helpers)
export * from './reads.js'
