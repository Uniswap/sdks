/**
 * @uniswap/sdk - Umbrella package that re-exports all Uniswap SDKs
 *
 * This package provides a single import for all Uniswap SDK functionality.
 * Tree shaking ensures only used code is included in your bundle.
 *
 * @example
 * ```typescript
 * import {
 *   Token,
 *   CurrencyAmount,    // from sdk-core
 *   V3,                // v3-sdk namespace
 *   V4,                // v4-sdk namespace
 *   UniversalRouter,   // from universal-router-sdk
 *   UniswapX,          // uniswapx-sdk namespace
 * } from '@uniswap/sdk'
 *
 * // Create pools using namespaced imports
 * const v3Pool = new V3.Pool(tokenA, tokenB, fee, sqrtRatio, liquidity, tick)
 * const v4Pool = new V4.Pool(...)
 *
 * // Build swap
 * const { calldata, value } = UniversalRouter.SwapRouter.swapCallParameters(trade, options)
 * ```
 */

// =============================================================================
// SDK Core - Foundational types, exported directly
// =============================================================================
export * from '@uniswap/sdk-core'

// =============================================================================
// Permit2 SDK - Namespaced to avoid MaxUint256 conflict with sdk-core
// =============================================================================
import * as Permit2 from '@uniswap/permit2-sdk'
export { Permit2 }

// =============================================================================
// Protocol SDKs - Namespaced to avoid conflicts (e.g., Pool, Route classes)
// =============================================================================
import * as V2 from '@uniswap/v2-sdk'
import * as V3 from '@uniswap/v3-sdk'
import * as V4 from '@uniswap/v4-sdk'
export { V2, V3, V4 }

// =============================================================================
// Routing SDKs - Namespaced to avoid SwapRouter/SwapOptions conflicts
// =============================================================================
import * as Router from '@uniswap/router-sdk'
import * as UniversalRouter from '@uniswap/universal-router-sdk'
export { Router, UniversalRouter }

// =============================================================================
// Trading Protocols - Namespaced
// =============================================================================
import * as UniswapX from '@uniswap/uniswapx-sdk'
export { UniswapX }

// =============================================================================
// Utility SDKs - Namespaced
// =============================================================================
import * as SmartWallet from '@uniswap/smart-wallet-sdk'
import * as Flashtestations from '@uniswap/flashtestations-sdk'
import * as TamperproofTx from '@uniswap/tamperproof-transactions'
export { SmartWallet, Flashtestations, TamperproofTx }
