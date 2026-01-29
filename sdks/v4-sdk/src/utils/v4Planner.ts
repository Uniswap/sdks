import invariant from 'tiny-invariant'
import { defaultAbiCoder } from 'ethers/lib/utils'
import { BigNumber } from 'ethers'
import { Currency, Percent, TradeType } from '@uniswap/sdk-core'
import { Trade } from '../entities/trade'
import { ADDRESS_ZERO, EMPTY_BYTES } from '../internalConstants'
import { encodeRouteToPath } from './encodeRouteToPath'
/**
 * Actions
 * @description Constants that define what action to perform
 * Not all actions are supported yet.
 * @enum {number}
 */
/**
 * UniversalRouter version
 * @description Version of the UniversalRouter contract
 * @enum {string}
 */
export enum URVersion {
  V2_0 = '2.0',
  V2_1 = '2.1',
}

export enum Actions {
  // pool actions
  // liquidity actions
  INCREASE_LIQUIDITY = 0x00,
  DECREASE_LIQUIDITY = 0x01,
  MINT_POSITION = 0x02,
  BURN_POSITION = 0x03,

  // for fee on transfer tokens
  // INCREASE_LIQUIDITY_FROM_DELTAS = 0x04,
  // MINT_POSITION_FROM_DELTAS = 0x05,

  // swapping
  SWAP_EXACT_IN_SINGLE = 0x06,
  SWAP_EXACT_IN = 0x07,
  SWAP_EXACT_OUT_SINGLE = 0x08,
  SWAP_EXACT_OUT = 0x09,

  // closing deltas on the pool manager
  // settling
  SETTLE = 0x0b,
  SETTLE_ALL = 0x0c,
  SETTLE_PAIR = 0x0d,
  // taking
  TAKE = 0x0e,
  TAKE_ALL = 0x0f,
  TAKE_PORTION = 0x10,
  TAKE_PAIR = 0x11,

  CLOSE_CURRENCY = 0x12,
  // CLEAR_OR_TAKE = 0x13,
  SWEEP = 0x14,

  // for wrapping/unwrapping native
  // WRAP = 0x15,
  UNWRAP = 0x16,
}

export enum Subparser {
  V4SwapExactInSingle,
  V4SwapExactIn,
  V4SwapExactOutSingle,
  V4SwapExactOut,
  PoolKey,
}

export type ParamType = {
  readonly name: string
  readonly type: string
  readonly subparser?: Subparser
}

const POOL_KEY_STRUCT = '(address currency0,address currency1,uint24 fee,int24 tickSpacing,address hooks)'

const PATH_KEY_STRUCT = '(address intermediateCurrency,uint256 fee,int24 tickSpacing,address hooks,bytes hookData)'

const SWAP_EXACT_IN_SINGLE_STRUCT =
  '(' + POOL_KEY_STRUCT + ' poolKey,bool zeroForOne,uint128 amountIn,uint128 amountOutMinimum,bytes hookData)'

// UR 2.0 swap structs (without maxHopSlippage)
const SWAP_EXACT_IN_STRUCT_V2_0 =
  '(address currencyIn,' + PATH_KEY_STRUCT + '[] path,uint128 amountIn,uint128 amountOutMinimum)'

const SWAP_EXACT_OUT_STRUCT_V2_0 =
  '(address currencyOut,' + PATH_KEY_STRUCT + '[] path,uint128 amountOut,uint128 amountInMaximum)'

// UR 2.1 swap structs (with maxHopSlippage)
const SWAP_EXACT_IN_STRUCT_V2_1 =
  '(address currencyIn,' +
  PATH_KEY_STRUCT +
  '[] path,uint256[] maxHopSlippage,uint128 amountIn,uint128 amountOutMinimum)'

const SWAP_EXACT_OUT_SINGLE_STRUCT =
  '(' + POOL_KEY_STRUCT + ' poolKey,bool zeroForOne,uint128 amountOut,uint128 amountInMaximum,bytes hookData)'

const SWAP_EXACT_OUT_STRUCT_V2_1 =
  '(address currencyOut,' +
  PATH_KEY_STRUCT +
  '[] path,uint256[] maxHopSlippage,uint128 amountOut,uint128 amountInMaximum)'

// V4_BASE_ACTIONS_ABI_DEFINITION uses V2.0 structs (default, without maxHopSlippage)
const SWAP_EXACT_IN_STRUCT = SWAP_EXACT_IN_STRUCT_V2_0
const SWAP_EXACT_OUT_STRUCT = SWAP_EXACT_OUT_STRUCT_V2_0

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export const V4_BASE_ACTIONS_ABI_DEFINITION: { [key in Actions]: readonly ParamType[] } = {
  // Liquidity commands
  [Actions.INCREASE_LIQUIDITY]: [
    { name: 'tokenId', type: 'uint256' },
    { name: 'liquidity', type: 'uint256' },
    { name: 'amount0Max', type: 'uint128' },
    { name: 'amount1Max', type: 'uint128' },
    { name: 'hookData', type: 'bytes' },
  ],
  [Actions.DECREASE_LIQUIDITY]: [
    { name: 'tokenId', type: 'uint256' },
    { name: 'liquidity', type: 'uint256' },
    { name: 'amount0Min', type: 'uint128' },
    { name: 'amount1Min', type: 'uint128' },
    { name: 'hookData', type: 'bytes' },
  ],
  [Actions.MINT_POSITION]: [
    { name: 'poolKey', type: POOL_KEY_STRUCT, subparser: Subparser.PoolKey },
    { name: 'tickLower', type: 'int24' },
    { name: 'tickUpper', type: 'int24' },
    { name: 'liquidity', type: 'uint256' },
    { name: 'amount0Max', type: 'uint128' },
    { name: 'amount1Max', type: 'uint128' },
    { name: 'owner', type: 'address' },
    { name: 'hookData', type: 'bytes' },
  ],
  [Actions.BURN_POSITION]: [
    { name: 'tokenId', type: 'uint256' },
    { name: 'amount0Min', type: 'uint128' },
    { name: 'amount1Min', type: 'uint128' },
    { name: 'hookData', type: 'bytes' },
  ],

  // Swapping commands
  [Actions.SWAP_EXACT_IN_SINGLE]: [
    { name: 'swap', type: SWAP_EXACT_IN_SINGLE_STRUCT, subparser: Subparser.V4SwapExactInSingle },
  ],
  [Actions.SWAP_EXACT_IN]: [{ name: 'swap', type: SWAP_EXACT_IN_STRUCT, subparser: Subparser.V4SwapExactIn }],
  [Actions.SWAP_EXACT_OUT_SINGLE]: [
    { name: 'swap', type: SWAP_EXACT_OUT_SINGLE_STRUCT, subparser: Subparser.V4SwapExactOutSingle },
  ],
  [Actions.SWAP_EXACT_OUT]: [{ name: 'swap', type: SWAP_EXACT_OUT_STRUCT, subparser: Subparser.V4SwapExactOut }],

  // Payments commands
  [Actions.SETTLE]: [
    { name: 'currency', type: 'address' },
    { name: 'amount', type: 'uint256' },
    { name: 'payerIsUser', type: 'bool' },
  ],
  [Actions.SETTLE_ALL]: [
    { name: 'currency', type: 'address' },
    { name: 'maxAmount', type: 'uint256' },
  ],
  [Actions.SETTLE_PAIR]: [
    { name: 'currency0', type: 'address' },
    { name: 'currency1', type: 'address' },
  ],
  [Actions.TAKE]: [
    { name: 'currency', type: 'address' },
    { name: 'recipient', type: 'address' },
    { name: 'amount', type: 'uint256' },
  ],
  [Actions.TAKE_ALL]: [
    { name: 'currency', type: 'address' },
    { name: 'minAmount', type: 'uint256' },
  ],
  [Actions.TAKE_PORTION]: [
    { name: 'currency', type: 'address' },
    { name: 'recipient', type: 'address' },
    { name: 'bips', type: 'uint256' },
  ],
  [Actions.TAKE_PAIR]: [
    { name: 'currency0', type: 'address' },
    { name: 'currency1', type: 'address' },
    { name: 'recipient', type: 'address' },
  ],
  [Actions.CLOSE_CURRENCY]: [{ name: 'currency', type: 'address' }],
  [Actions.SWEEP]: [
    { name: 'currency', type: 'address' },
    { name: 'recipient', type: 'address' },
  ],
  [Actions.UNWRAP]: [{ name: 'amount', type: 'uint256' }],
}

// UR 2.1 specific ABI definitions for swap actions (with maxHopSlippage)
export const V4_SWAP_ACTIONS_V2_1: { [key: number]: readonly ParamType[] } = {
  [Actions.SWAP_EXACT_IN]: [{ name: 'swap', type: SWAP_EXACT_IN_STRUCT_V2_1, subparser: Subparser.V4SwapExactIn }],
  [Actions.SWAP_EXACT_OUT]: [{ name: 'swap', type: SWAP_EXACT_OUT_STRUCT_V2_1, subparser: Subparser.V4SwapExactOut }],
}

const FULL_DELTA_AMOUNT = 0

export class V4Planner {
  actions: string
  params: string[]

  constructor() {
    this.actions = EMPTY_BYTES
    this.params = []
  }

  addAction(type: Actions, parameters: any[], urVersion: URVersion = URVersion.V2_0): V4Planner {
    let command = createAction(type, parameters, urVersion)
    this.params.push(command.encodedInput)
    this.actions = this.actions.concat(command.action.toString(16).padStart(2, '0'))
    return this
  }

  addTrade(
    trade: Trade<Currency, Currency, TradeType>,
    slippageTolerance?: Percent,
    maxHopSlippage?: BigNumber[],
    urVersion: URVersion = URVersion.V2_0
  ): V4Planner {
    const exactOutput = trade.tradeType === TradeType.EXACT_OUTPUT

    // exactInput we sometimes perform aggregated slippage checks, but not with exactOutput
    if (exactOutput) invariant(!!slippageTolerance, 'ExactOut requires slippageTolerance')
    invariant(trade.swaps.length === 1, 'Only accepts Trades with 1 swap (must break swaps into individual trades)')

    const actionType = exactOutput ? Actions.SWAP_EXACT_OUT : Actions.SWAP_EXACT_IN

    const currencyIn = currencyAddress(trade.route.pathInput)
    const currencyOut = currencyAddress(trade.route.pathOutput)

    // Build the swap struct based on UR version
    if (urVersion === URVersion.V2_1) {
      // UR 2.1: includes maxHopSlippage field
      const maxHopSlippageArray = maxHopSlippage ?? []

      this.addSwapAction(
        actionType,
        [
          exactOutput
            ? {
                currencyOut,
                path: encodeRouteToPath(trade.route, exactOutput),
                maxHopSlippage: maxHopSlippageArray,
                amountOut: trade.outputAmount.quotient.toString(),
                amountInMaximum: trade.maximumAmountIn(slippageTolerance ?? new Percent(0)).quotient.toString(),
              }
            : {
                currencyIn,
                path: encodeRouteToPath(trade.route, exactOutput),
                maxHopSlippage: maxHopSlippageArray,
                amountIn: trade.inputAmount.quotient.toString(),
                amountOutMinimum: slippageTolerance ? trade.minimumAmountOut(slippageTolerance).quotient.toString() : 0,
              },
        ],
        urVersion
      )
    } else {
      // UR 2.0: no maxHopSlippage field (default for backwards compatibility)
      this.addSwapAction(
        actionType,
        [
          exactOutput
            ? {
                currencyOut,
                path: encodeRouteToPath(trade.route, exactOutput),
                amountOut: trade.outputAmount.quotient.toString(),
                amountInMaximum: trade.maximumAmountIn(slippageTolerance ?? new Percent(0)).quotient.toString(),
              }
            : {
                currencyIn,
                path: encodeRouteToPath(trade.route, exactOutput),
                amountIn: trade.inputAmount.quotient.toString(),
                amountOutMinimum: slippageTolerance ? trade.minimumAmountOut(slippageTolerance).quotient.toString() : 0,
              },
        ],
        urVersion
      )
    }
    return this
  }

  addSettle(currency: Currency, payerIsUser: boolean, amount?: BigNumber): V4Planner {
    this.addAction(Actions.SETTLE, [currencyAddress(currency), amount ?? FULL_DELTA_AMOUNT, payerIsUser])
    return this
  }

  addTake(currency: Currency, recipient: string, amount?: BigNumber): V4Planner {
    const takeAmount = amount ?? FULL_DELTA_AMOUNT
    this.addAction(Actions.TAKE, [currencyAddress(currency), recipient, takeAmount])
    return this
  }

  addUnwrap(amount: BigNumber): V4Planner {
    this.addAction(Actions.UNWRAP, [amount])
    return this
  }

  finalize(): string {
    return defaultAbiCoder.encode(['bytes', 'bytes[]'], [this.actions, this.params])
  }

  private addSwapAction(type: Actions, parameters: any[], urVersion: URVersion): V4Planner {
    // Use V2.1 ABI (with maxHopSlippage) for V2.1, otherwise default to V2.0 ABI (without maxHopSlippage)
    const abiDef = urVersion === URVersion.V2_1 ? V4_SWAP_ACTIONS_V2_1[type] : V4_BASE_ACTIONS_ABI_DEFINITION[type]
    const encodedInput = defaultAbiCoder.encode(
      abiDef.map((v) => v.type),
      parameters
    )
    this.params.push(encodedInput)
    this.actions = this.actions.concat(type.toString(16).padStart(2, '0'))
    return this
  }
}

function currencyAddress(currency: Currency): string {
  return currency.isNative ? ADDRESS_ZERO : currency.wrapped.address
}

type RouterAction = {
  action: Actions
  encodedInput: string
}

function createAction(action: Actions, parameters: any[], urVersion: URVersion = URVersion.V2_0): RouterAction {
  // Use V2.1 ABI for swap actions if V2.1, otherwise use base ABI (V2.0)
  const isSwapAction = action === Actions.SWAP_EXACT_IN || action === Actions.SWAP_EXACT_OUT
  const abiDef =
    urVersion === URVersion.V2_1 && isSwapAction ? V4_SWAP_ACTIONS_V2_1[action] : V4_BASE_ACTIONS_ABI_DEFINITION[action]
  const encodedInput = defaultAbiCoder.encode(
    abiDef.map((v) => v.type),
    parameters
  )
  return { action, encodedInput }
}
