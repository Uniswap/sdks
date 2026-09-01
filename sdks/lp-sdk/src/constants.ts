import { Percent } from '@uniswap/sdk-core'

/**
 * Default slippage tolerance applied when none is provided. Matches the default used
 * by the Uniswap Labs liquidity service so estimates line up with the transactions
 * users actually sign.
 */
export const DEFAULT_LP_SLIPPAGE_TOLERANCE = new Percent(250, 10_000) // 2.5%

/**
 * Default slippage tolerance for v4 pools with a native currency side. Matches the
 * Uniswap Labs liquidity service default for native v4 pools.
 */
export const DEFAULT_NATIVE_V4_SLIPPAGE_TOLERANCE = new Percent(5, 10_000) // 0.05%
