import type { Hex } from 'viem'
import { encodeAbiParameters, parseAbiParameters } from 'viem'

import type { SwapPayloadCodec } from './core'
import { encodeExecutionPlanFor } from './core'

// ---------------------------------------------------------------------------
// `ur-2.1` execution-plan encoder: the shared walker (`core.ts`) bound to the
// 2.1.1 swap-payload ABIs. The second command set this package encodes for,
// and the one that unlocks swaps on chains whose only Universal Router is a
// 2.1.1 deployment (Robinhood Chain, 4663 — see `manifest.ts`).
//
// WHAT 2.1 ACTUALLY CHANGES, FOR THE COMMANDS THIS PACKAGE EMITS — three ABI
// layouts, and nothing else:
//
//   * `V2_SWAP_EXACT_IN` (0x08) and `V3_SWAP_EXACT_IN` (0x00) each gain a
//     trailing `uint256[] minHopPriceX36` parameter (per-hop price floors;
//     an empty array disables the check).
//   * the v4 `SWAP_EXACT_IN` (action 0x07) struct gains a
//     `uint256[] minHopPriceX36` field BETWEEN `path` and `amountIn`:
//     `(address currencyIn, PathKey[] path, uint256[] minHopPriceX36,
//     uint128 amountIn, uint128 amountOutMinimum)`.
//
// Unchanged: every command byte and v4 action byte (`CommandType` /
// `Actions` are version-independent enums), `WRAP_ETH`, `UNWRAP_WETH`,
// `PERMIT2_PERMIT`, `PERMIT2_TRANSFER_FROM`, v4 `SETTLE`/`TAKE`, and the
// `execute(bytes,bytes[],uint256)` entry point.
//
// SOURCES, in decreasing order of authority:
//
//  1. THE DEPLOYED 2.1.1 ROUTER ITSELF (chain 4663,
//     `0x8876…904`, probed live 2026-08-07). A 2.0-shaped
//     `V3_SWAP_EXACT_IN`/`V2_SWAP_EXACT_IN` payload reverts
//     `SliceOutOfBounds()` (`0x3b99b53d`) — the dispatcher reads a sixth
//     parameter past the input's end — while the same payload with an empty
//     `minHopPriceX36` appended decodes and runs all the way into Permit2's
//     `AllowanceExpired(0)` (`0xd81b2f2e`). For v4, a 2.0-shaped
//     `SWAP_EXACT_IN` struct reverts `SwapAmountCannotBeZero()`
//     (`0xbe8b8507`) because the router reads `amountIn` from the 2.1 slot
//     position (where the 2.0 layout has `amountOutMinimum`'s zero); the
//     positive control — a 2.1-shaped struct with `amountIn: 0` — reverts
//     with the same selector, and a 2.1-shaped struct with a nonzero amount
//     proceeds into execution. The dispatch table itself is therefore
//     verified against the deployed bytecode's behavior, not inferred.
//  2. The pinned `@uniswap/universal-router-sdk` (workspace devDependency),
//     which encodes `UniversalRouterVersion.V2_1_1` through exactly these
//     three ABI extensions (`utils/routerCommands.ts`'s
//     `V2V3_SWAP_COMMANDS_V2_1_1`, `utils/encodeSwapStep.ts`,
//     `utils/encodeV4Action.ts`) and `@uniswap/v4-sdk`'s
//     `SWAP_EXACT_IN_STRUCT_V2_1_1` (`utils/v4Planner.ts`). The differential
//     suite (`differential.test.ts`) runs the full 73-shape matrix against
//     that SDK pinned to `V2_1_1` and requires byte identity, exactly as it
//     does for `ur-2.0` against `V2_0`.
//  3. Live end-to-end simulation: the Robinhood canary
//     (`canary/robinhood.test.ts`) simulates a real `getSwap` result through
//     `eth_simulateV1` against the real chain — the execution proof for a
//     chain that cannot be forked.
//
// `minHopPriceX36` IS ALWAYS EMITTED EMPTY HERE, deliberately. It is a
// per-hop price floor — an ADDITIONAL, optional protection 2.1 makes
// available — while this package's slippage model places exactly one floor
// per plan at the delivery end (`deliverOutput.minAmountOut`; see `core.ts`).
// An empty array disables the per-hop check (the router's decode-and-skip for
// `[]`, and the SDK's own default when the caller supplies none), so the
// encoded semantics of every plan are IDENTICAL across `ur-2.0` and `ur-2.1`:
// same custody, same single floor, same commands — different wire layout.
// Threading real per-hop floors through `ExecutionPlan` is a deliberate
// future extension, not an accidental omission.
// ---------------------------------------------------------------------------

const V2_SWAP_PARAMS_2_1 = parseAbiParameters(
  'address recipient, uint256 amountIn, uint256 amountOutMin, address[] path, bool payerIsUser, uint256[] minHopPriceX36',
)
const V3_SWAP_PARAMS_2_1 = parseAbiParameters(
  'address recipient, uint256 amountIn, uint256 amountOutMin, bytes path, bool payerIsUser, uint256[] minHopPriceX36',
)
const V4_SWAP_EXACT_IN_PARAMS_2_1 = parseAbiParameters(
  '(address currencyIn, (address intermediateCurrency, uint256 fee, int24 tickSpacing, address hooks, bytes hookData)[] path, uint256[] minHopPriceX36, uint128 amountIn, uint128 amountOutMinimum) swap',
)

/** Per-hop floors disabled — the plan's one real floor lives at the delivery end (see header). */
const NO_PER_HOP_FLOORS: readonly bigint[] = []

const UR21_CODEC: SwapPayloadCodec = {
  commandSet: 'ur-2.1',
  encodeV2SwapExactIn: ({ recipient, amountIn, amountOutMin, path, payerIsUser }): Hex =>
    encodeAbiParameters(V2_SWAP_PARAMS_2_1, [recipient, amountIn, amountOutMin, path, payerIsUser, NO_PER_HOP_FLOORS]),
  encodeV3SwapExactIn: ({ recipient, amountIn, amountOutMin, path, payerIsUser }): Hex =>
    encodeAbiParameters(V3_SWAP_PARAMS_2_1, [recipient, amountIn, amountOutMin, path, payerIsUser, NO_PER_HOP_FLOORS]),
  encodeV4SwapExactIn: ({ currencyIn, path, amountIn, amountOutMinimum }): Hex =>
    encodeAbiParameters(V4_SWAP_EXACT_IN_PARAMS_2_1, [
      { currencyIn, path, minHopPriceX36: NO_PER_HOP_FLOORS, amountIn, amountOutMinimum },
    ]),
}

/**
 * Encodes an {@link ExecutionPlan} as Universal Router `execute` calldata for a `ur-2.1` deployment.
 * See `core.ts#encodeExecutionPlanFor` for the full contract (invariants, closed shape set, errors).
 */
export const encodeExecutionPlanUr21 = encodeExecutionPlanFor(UR21_CODEC)
