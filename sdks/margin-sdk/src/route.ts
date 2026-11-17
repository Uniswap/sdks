import { type Address, type Hex, concatHex, encodeAbiParameters, isAddressEqual, numberToHex, zeroAddress } from 'viem'

import { ACTION_ABI, V4RouterAction } from './actions.js'
import { ADDRESS_THIS, CONTRACT_BALANCE, MSG_SENDER, OPEN_DELTA } from './constants.js'
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
 * output, delivers it to the caller's MarginAccount, draws the input from the router (the
 * payer) via Permit2, and returns any unspent input to the router in the input currency.
 *
 * The ERC-20 pool shape is a byte-for-byte mirror of v4-periphery
 * `test/shared/MarginRouteHelpers.buildV4ExactOutRoute`. The native pool shape (one side of the
 * pool is ETH while the market token is WETH) wraps and unwraps inside the Universal Router so the
 * margin router still sees WETH on both ends.
 */

/** Universal Router `Commands.PERMIT2_TRANSFER_FROM`: pull a token from the UR's caller via Permit2. */
export const UR_COMMAND_PERMIT2_TRANSFER_FROM = 0x02

/** Universal Router `Commands.WRAP_ETH`: wrap the UR's ETH into WETH for a recipient. */
export const UR_COMMAND_WRAP_ETH = 0x0b

/** Universal Router `Commands.UNWRAP_WETH`: unwrap the UR's whole WETH balance to a recipient. */
export const UR_COMMAND_UNWRAP_WETH = 0x0c

/** Universal Router `Commands.V4_SWAP`: run an embedded v4 router actions plan. */
export const UR_COMMAND_V4_SWAP = 0x10

/** `Dispatcher` input shape for `PERMIT2_TRANSFER_FROM`: `(token, recipient, uint160 amount)`. */
const PERMIT2_TRANSFER_FROM_ABI = [{ type: 'address' }, { type: 'address' }, { type: 'uint160' }] as const

/** `Dispatcher` input shape shared by `WRAP_ETH` (`recipient, amount`) and `UNWRAP_WETH` (`recipient, amountMin`). */
const RECIPIENT_AMOUNT_ABI = [{ type: 'address' }, { type: 'uint256' }] as const

/** A Universal Router command plan, as the margin flows consume it. */
export interface UniversalRouterRoute {
  /** The packed command byte string (`routeCommands`). */
  commands: Hex
  /** The per-command ABI-encoded inputs (`routeInputs`). */
  inputs: Hex[]
}

/** Inputs shared by the exact-output route builders. */
export interface ExactOutRouteParams {
  poolKey: PoolKey
  /** The currency the route spends (the margin router flash-takes and funds it). Always an ERC-20. */
  input: Address
  /** The currency the route buys. Always an ERC-20. */
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
 *
 * A native pool (`poolKey.currency0 == address(0)`) needs `weth9` to map the pool's ETH side to
 * the market's WETH; the plan is then the one {@link buildV4NativePoolExactOutRoute} builds.
 */
export function buildV4ExactOutRoute(p: ExactOutRouteParams & { weth9?: Address }): UniversalRouterRoute {
  if (isAddressEqual(p.poolKey.currency0, zeroAddress)) {
    if (p.weth9 === undefined) {
      throw new MarginSdkError(
        'INVALID_INPUT',
        'poolKey is a native pool; pass weth9 (or call buildV4NativePoolExactOutRoute) to route the market WETH through it'
      )
    }
    return buildV4NativePoolExactOutRoute({ ...p, weth9: p.weth9 })
  }
  validateRouteParties(p)
  const inputIsZero = isAddressEqual(p.input, p.poolKey.currency0)
  const inputIsOne = isAddressEqual(p.input, p.poolKey.currency1)
  const outputIsZero = isAddressEqual(p.output, p.poolKey.currency0)
  const outputIsOne = isAddressEqual(p.output, p.poolKey.currency1)
  if (!((inputIsZero && outputIsOne) || (inputIsOne && outputIsZero))) {
    throw new MarginSdkError('MARKET_MISMATCH', 'input and output must be the two currencies of poolKey')
  }

  // The embedded v4 plan: exact-output swap, settle the input from the UR's caller (the margin
  // router, via Permit2), take the bought output to the account.
  return {
    commands: numberToHex(UR_COMMAND_V4_SWAP, { size: 1 }),
    inputs: [
      encodeV4ExactOutSwap(p, {
        zeroForOne: inputIsZero,
        settleCurrency: p.input,
        payerIsUser: true,
        takeCurrency: p.output,
        takeRecipient: p.recipient,
      }),
    ],
  }
}

/**
 * Builds the exact-output plan over a native v4 pool (`currency0 == address(0)`) for a market whose
 * token on that side is WETH. The margin router only moves WETH, so the plan wraps and unwraps
 * inside the Universal Router and keeps the route's postcondition: the output reaches the account
 * as WETH or the ERC-20, and unspent input returns to the margin router as WETH.
 *
 * Selling WETH (`input == weth9`): `PERMIT2_TRANSFER_FROM` pulls the whole cap from the margin
 * router into the Universal Router, `UNWRAP_WETH` turns it into ETH, the v4 plan settles the swap
 * from the Universal Router's own ETH balance and takes the output to the account, and
 * `WRAP_ETH(MSG_SENDER, CONTRACT_BALANCE)` wraps the change and returns it to the margin router.
 * Routing the change to the account instead would leave the router's accounting at the full cap.
 *
 * Buying WETH (`output == weth9`): the v4 plan settles the ERC-20 input from the margin router via
 * Permit2 and takes the bought ETH into the Universal Router, then `WRAP_ETH(recipient, amountOut)`
 * delivers it to the account as WETH.
 */
export function buildV4NativePoolExactOutRoute(p: ExactOutRouteParams & { weth9: Address }): UniversalRouterRoute {
  validateRouteParties(p)
  validateAddress(p.weth9, 'weth9')
  if (!isAddressEqual(p.poolKey.currency0, zeroAddress)) {
    throw new MarginSdkError('INVALID_INPUT', 'poolKey is not a native pool (currency0 must be the zero address)')
  }
  if (isAddressEqual(p.input, zeroAddress) || isAddressEqual(p.output, zeroAddress)) {
    throw new MarginSdkError('MARKET_MISMATCH', 'route input and output are market tokens; the WETH side is weth9, never address(0)')
  }
  const sellsWeth = isAddressEqual(p.input, p.weth9) && isAddressEqual(p.output, p.poolKey.currency1)
  const buysWeth = isAddressEqual(p.output, p.weth9) && isAddressEqual(p.input, p.poolKey.currency1)
  if (!sellsWeth && !buysWeth) {
    throw new MarginSdkError('MARKET_MISMATCH', 'one of input/output must be weth9 and the other poolKey.currency1')
  }
  const amountInMaximum = toUint128(p.amountInMaximum, 'amountInMaximum')

  if (sellsWeth) {
    return {
      commands: concatHex([
        numberToHex(UR_COMMAND_PERMIT2_TRANSFER_FROM, { size: 1 }),
        numberToHex(UR_COMMAND_UNWRAP_WETH, { size: 1 }),
        numberToHex(UR_COMMAND_V4_SWAP, { size: 1 }),
        numberToHex(UR_COMMAND_WRAP_ETH, { size: 1 }),
      ]),
      inputs: [
        encodeAbiParameters(PERMIT2_TRANSFER_FROM_ABI, [p.weth9, ADDRESS_THIS, amountInMaximum]),
        encodeAbiParameters(RECIPIENT_AMOUNT_ABI, [ADDRESS_THIS, amountInMaximum]),
        encodeV4ExactOutSwap(p, {
          zeroForOne: true,
          settleCurrency: zeroAddress,
          payerIsUser: false,
          takeCurrency: p.output,
          takeRecipient: p.recipient,
        }),
        encodeAbiParameters(RECIPIENT_AMOUNT_ABI, [MSG_SENDER, CONTRACT_BALANCE]),
      ],
    }
  }
  return {
    commands: concatHex([numberToHex(UR_COMMAND_V4_SWAP, { size: 1 }), numberToHex(UR_COMMAND_WRAP_ETH, { size: 1 })]),
    inputs: [
      encodeV4ExactOutSwap(p, {
        zeroForOne: false,
        settleCurrency: p.input,
        payerIsUser: true,
        takeCurrency: zeroAddress,
        takeRecipient: ADDRESS_THIS,
      }),
      encodeAbiParameters(RECIPIENT_AMOUNT_ABI, [p.recipient, toUint128(p.amountOut, 'amountOut')]),
    ],
  }
}

function validateRouteParties(p: ExactOutRouteParams): void {
  validateAddress(p.input, 'input')
  validateAddress(p.output, 'output')
  validateAddress(p.recipient, 'recipient')
  if (isAddressEqual(p.recipient, zeroAddress)) {
    throw new MarginSdkError('INVALID_RECIPIENT', 'route recipient must be the MarginAccount, not the zero address')
  }
}

/**
 * The `V4_SWAP` input: an embedded v4 router plan of `SWAP_EXACT_OUT_SINGLE`, `SETTLE`, `TAKE`.
 * `settleCurrency`/`payerIsUser` say who funds the swap (the margin router via Permit2, or the
 * Universal Router's own balance); `takeCurrency`/`takeRecipient` say where the output goes.
 */
function encodeV4ExactOutSwap(
  p: ExactOutRouteParams,
  leg: { zeroForOne: boolean; settleCurrency: Address; payerIsUser: boolean; takeCurrency: Address; takeRecipient: Address }
): Hex {
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
          zeroForOne: leg.zeroForOne,
          amountOut: toUint128(p.amountOut, 'amountOut'),
          amountInMaximum: toUint128(p.amountInMaximum, 'amountInMaximum'),
          minHopPriceX36: p.minHopPriceX36 ?? 0n,
          hookData: p.hookData ?? '0x',
        },
      ]
    ),
    encodeAbiParameters([...ACTION_ABI[V4RouterAction.SETTLE]], [leg.settleCurrency, OPEN_DELTA, leg.payerIsUser]),
    encodeAbiParameters([...ACTION_ABI[V4RouterAction.TAKE]], [leg.takeCurrency, leg.takeRecipient, OPEN_DELTA]),
  ]
  return encodeAbiParameters([{ type: 'bytes' }, { type: 'bytes[]' }], [v4Actions, v4Params])
}
