import type { Hex } from 'viem'
import { encodeAbiParameters, parseAbiParameters } from 'viem'

import type { SwapPayloadCodec } from './core'
import { encodeExecutionPlanFor } from './core'

// ---------------------------------------------------------------------------
// `ur-2.0` execution-plan encoder: the shared walker (`core.ts`) bound to the
// 2.0 swap-payload ABIs.
//
// This file holds exactly the surface that is VERSIONED between Universal
// Router command sets — the ABI layout of the three exact-in swap payloads —
// and nothing else. Custody, command bytes, action bytes and every guard live
// in `core.ts`, shared with `ur21.ts`, whose header explains why the split is
// safe (the 2.1 revision changed these three ABIs and nothing this package
// emits besides them).
//
// The encoder is pinned to one immutable deployment family
// (`commandSet: 'ur-2.0'`). Anything else throws, because a command payload
// that moved between router versions is a fund-loss bug, not a compatibility
// warning.
// ---------------------------------------------------------------------------

// Re-exported for the R6 parity tests (`ur20.test.ts`) only — see `core.ts` for the terms. The
// bytes are shared across command sets; this remains the import site the tests were written
// against.
export { COMMAND, V4_ACTION } from './core'

const V2_SWAP_PARAMS = parseAbiParameters(
  'address recipient, uint256 amountIn, uint256 amountOutMin, address[] path, bool payerIsUser',
)
const V3_SWAP_PARAMS = parseAbiParameters(
  'address recipient, uint256 amountIn, uint256 amountOutMin, bytes path, bool payerIsUser',
)
const V4_SWAP_EXACT_IN_PARAMS = parseAbiParameters(
  '(address currencyIn, (address intermediateCurrency, uint256 fee, int24 tickSpacing, address hooks, bytes hookData)[] path, uint128 amountIn, uint128 amountOutMinimum) swap',
)

const UR20_CODEC: SwapPayloadCodec = {
  commandSet: 'ur-2.0',
  encodeV2SwapExactIn: ({ recipient, amountIn, amountOutMin, path, payerIsUser }): Hex =>
    encodeAbiParameters(V2_SWAP_PARAMS, [recipient, amountIn, amountOutMin, path, payerIsUser]),
  encodeV3SwapExactIn: ({ recipient, amountIn, amountOutMin, path, payerIsUser }): Hex =>
    encodeAbiParameters(V3_SWAP_PARAMS, [recipient, amountIn, amountOutMin, path, payerIsUser]),
  encodeV4SwapExactIn: ({ currencyIn, path, amountIn, amountOutMinimum }): Hex =>
    encodeAbiParameters(V4_SWAP_EXACT_IN_PARAMS, [{ currencyIn, path, amountIn, amountOutMinimum }]),
}

/**
 * Encodes an {@link ExecutionPlan} as Universal Router `execute` calldata for a `ur-2.0` deployment.
 * See `core.ts#encodeExecutionPlanFor` for the full contract (invariants, closed shape set, errors).
 */
export const encodeExecutionPlan = encodeExecutionPlanFor(UR20_CODEC)
