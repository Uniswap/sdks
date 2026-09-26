import { type Address, type Hex, concatHex, encodeAbiParameters, isAddressEqual, numberToHex, zeroAddress } from 'viem'

import { ACTION_ABI, V4RouterAction } from './actions.js'
import { OPEN_DELTA } from './constants.js'
import { MarginSdkError } from './errors.js'
import { validateAddress } from './market.js'
import { toUint128 } from './math.js'
import { type PoolKey } from './types.js'

/**
 * Universal Router route builders for the margin position swaps. `increasePosition`,
 * `decreasePosition`, and the `ROUTE_SWAP` plan action take a caller-built Universal Router
 * command plan (`routeCommands`/`routeInputs`) so liquidity can be sourced across v2/v3/v4; this
 * module builds the canonical single-pool v4 case — the direct replacement for the pre-UR API's
 * `poolKey` field. For multi-hop or cross-version routes, build the commands with the
 * universal-router-sdk instead; the margin router only requires that the route buys the exact
 * output, delivers it to the caller's MarginAccount, and draws the input from the router (the
 * payer) via Permit2.
 *
 * Byte-for-byte mirror of v4-periphery `test/shared/MarginRouteHelpers.buildV4ExactOutRoute`.
 */

/** Universal Router `Commands.V4_SWAP`: run an embedded v4 router actions plan. */
export const UR_COMMAND_V4_SWAP = 0x10

/** A Universal Router command plan, as the margin flows consume it. */
export interface UniversalRouterRoute {
  /** The packed command byte string (`routeCommands`). */
  commands: Hex
  /** The per-command ABI-encoded inputs (`routeInputs`). */
  inputs: Hex[]
}

/**
 * Builds the Universal Router command plan for a single v4 exact-output swap: buy `amountOut` of
 * `output` for at most `amountInMaximum` of `input` over `poolKey`, drawing the input from the
 * margin router (the Universal Router's caller) via Permit2 and delivering the output to
 * `recipient` — which MUST be the caller's MarginAccount (`getMarginAccountAddress` /
 * `predictMarginAccountAddress`).
 *
 * On an increase the input is the market's debt and the output its collateral (`amountOut ==
 * collateralToBuy`); on a decrease the input is the collateral and the output the debt
 * (`amountOut == debtToRepay`, or the accrual-buffered current debt on a full close). The binding
 * slippage cap is the position call's `maxDebtIn`/`maxCollateralIn` (the router's scoped Permit2
 * allowance); `amountInMaximum` is the route's own inner bound — pass the same value.
 */
export function buildV4ExactOutRoute(p: {
  poolKey: PoolKey
  /** The currency the route spends (the margin router flash-takes and funds it). */
  input: Address
  /** The currency the route buys. */
  output: Address
  /** uint128. The exact output to buy (the router asserts the account received it). */
  amountOut: bigint
  /** uint128. The route's inner input cap; pass the position call's `maxDebtIn`/`maxCollateralIn`. */
  amountInMaximum: bigint
  /** The bought output's destination: the caller's MarginAccount. */
  recipient: Address
  /** Optional per-hop price bound (X36 fixed-point). Zero (default) disables it. */
  minHopPriceX36?: bigint
  /** Optional hook data forwarded to the pool's hooks. */
  hookData?: Hex
}): UniversalRouterRoute {
  validateAddress(p.input, 'input')
  validateAddress(p.output, 'output')
  validateAddress(p.recipient, 'recipient')
  if (isAddressEqual(p.recipient, zeroAddress)) {
    throw new MarginSdkError('INVALID_RECIPIENT', 'route recipient must be the MarginAccount, not the zero address')
  }
  const inputIsZero = isAddressEqual(p.input, p.poolKey.currency0)
  const inputIsOne = isAddressEqual(p.input, p.poolKey.currency1)
  const outputIsZero = isAddressEqual(p.output, p.poolKey.currency0)
  const outputIsOne = isAddressEqual(p.output, p.poolKey.currency1)
  if (!((inputIsZero && outputIsOne) || (inputIsOne && outputIsZero))) {
    throw new MarginSdkError('MARKET_MISMATCH', 'input and output must be the two currencies of poolKey')
  }

  // The embedded v4 plan: exact-output swap, settle the input from the UR's caller (the margin
  // router, via Permit2), take the bought output to the account.
  const v4Actions = concatHex([
    numberToHex(V4RouterAction.SWAP_EXACT_OUT_SINGLE, { size: 1 }),
    numberToHex(V4RouterAction.SETTLE, { size: 1 }),
    numberToHex(V4RouterAction.TAKE, { size: 1 }),
  ])
  const v4Params: Hex[] = [
    encodeAbiParameters(
      [...ACTION_ABI[V4RouterAction.SWAP_EXACT_OUT_SINGLE]],
      [
        {
          poolKey: p.poolKey,
          zeroForOne: inputIsZero,
          amountOut: toUint128(p.amountOut, 'amountOut'),
          amountInMaximum: toUint128(p.amountInMaximum, 'amountInMaximum'),
          minHopPriceX36: p.minHopPriceX36 ?? 0n,
          hookData: p.hookData ?? '0x',
        },
      ]
    ),
    encodeAbiParameters([...ACTION_ABI[V4RouterAction.SETTLE]], [p.input, OPEN_DELTA, true]),
    encodeAbiParameters([...ACTION_ABI[V4RouterAction.TAKE]], [p.output, p.recipient, OPEN_DELTA]),
  ]

  return {
    commands: numberToHex(UR_COMMAND_V4_SWAP, { size: 1 }),
    inputs: [encodeAbiParameters([{ type: 'bytes' }, { type: 'bytes[]' }], [v4Actions, v4Params])],
  }
}
