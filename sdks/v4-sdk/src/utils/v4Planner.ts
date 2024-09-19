import invariant from 'tiny-invariant'
import { defaultAbiCoder } from 'ethers/lib/utils'
import { Currency, Percent, TradeType } from '@uniswap/sdk-core'
import { Trade } from '../entities/trade'
import { ADDRESS_ZERO } from '../internalConstants'
import { encodeRouteToPath } from './encodeRouteToPath'
/**
 * Actions
 * @description Constants that define what action to perform
 * @enum {number}
 */
export enum Actions {
  // pool actions
  // liquidity actions
  INCREASE_LIQUIDITY = 0x00,
  DECREASE_LIQUIDITY = 0x01,
  MINT_POSITION = 0x02,
  BURN_POSITION = 0x03,
  // swapping
  SWAP_EXACT_IN_SINGLE = 0x04,
  SWAP_EXACT_IN = 0x05,
  SWAP_EXACT_OUT_SINGLE = 0x06,
  SWAP_EXACT_OUT = 0x07,

  // closing deltas on the pool manager
  // settling
  SETTLE = 0x09,
  SETTLE_ALL = 0x10,
  // taking
  TAKE = 0x12,
  TAKE_ALL = 0x13,
  TAKE_PORTION = 0x14,

  SETTLE_TAKE_PAIR = 0x16,

  CLOSE_CURRENCY = 0x17,
  SWEEP = 0x19,
}

const POOL_KEY_STRUCT = '(address currency0,address currency1,uint24 fee,int24 tickSpacing,address hooks)'

const PATH_KEY_STRUCT = '(address intermediateCurrency,uint256 fee,int24 tickSpacing,address hooks,bytes hookData)'

const SWAP_EXACT_IN_SINGLE_STRUCT =
  '(' +
  POOL_KEY_STRUCT +
  ' poolKey,bool zeroForOne,uint128 amountIn,uint128 amountOutMinimum,uint160 sqrtPriceLimitX96,bytes hookData)'

const SWAP_EXACT_IN_STRUCT =
  '(address currencyIn,' + PATH_KEY_STRUCT + '[] path,uint128 amountIn,uint128 amountOutMinimum)'

const SWAP_EXACT_OUT_SINGLE_STRUCT =
  '(' +
  POOL_KEY_STRUCT +
  ' poolKey,bool zeroForOne,uint128 amountOut,uint128 amountInMaximum,uint160 sqrtPriceLimitX96,bytes hookData)'

const SWAP_EXACT_OUT_STRUCT =
  '(address currencyOut,' + PATH_KEY_STRUCT + '[] path,uint128 amountOut,uint128 amountInMaximum)'

const ABI_DEFINITION: { [key in Actions]: string[] } = {
  // Liquidity commands
  [Actions.INCREASE_LIQUIDITY]: [
    'uint256 tokenId',
    'uint256 liquidity',
    'uint128 amount0Max',
    'uint128 amount1Max',
    'bytes hookData',
  ],
  [Actions.DECREASE_LIQUIDITY]: [
    'uint256 tokenId',
    'uint256 liquidity',
    'uint128 amount0Min',
    'uint128 amount1Min',
    'bytes hookData',
  ],
  [Actions.MINT_POSITION]: [
    POOL_KEY_STRUCT,
    'int24 tickLower',
    'int24 tickUpper',
    'uint256 liquidity',
    'uint128 amount0Max',
    'uint128 amount1Max',
    'address owner',
    'bytes hookData',
  ],
  [Actions.BURN_POSITION]: ['uint256 tokenId', 'uint128 amount0Min', 'uint128 amount1Min', 'bytes hookData'],

  // Swapping commands
  [Actions.SWAP_EXACT_IN_SINGLE]: [SWAP_EXACT_IN_SINGLE_STRUCT],
  [Actions.SWAP_EXACT_IN]: [SWAP_EXACT_IN_STRUCT],
  [Actions.SWAP_EXACT_OUT_SINGLE]: [SWAP_EXACT_OUT_SINGLE_STRUCT],
  [Actions.SWAP_EXACT_OUT]: [SWAP_EXACT_OUT_STRUCT],

  // Payments commands
  [Actions.SETTLE]: ['address', 'uint256', 'bool'],
  [Actions.SETTLE_ALL]: ['address', 'uint256'],
  [Actions.TAKE]: ['address', 'address', 'uint256'],
  [Actions.TAKE_ALL]: ['address', 'uint256'],
  [Actions.TAKE_PORTION]: ['address', 'address', 'uint256'],
  [Actions.SETTLE_TAKE_PAIR]: ['address', 'address'],
  [Actions.CLOSE_CURRENCY]: ['address'],
  [Actions.SWEEP]: ['address', 'address'],
}

export class V4Planner {
  actions: string
  params: string[]

  constructor() {
    this.actions = '0x'
    this.params = []
  }

  addAction(type: Actions, parameters: any[]): void {
    let command = createAction(type, parameters)
    this.params.push(command.encodedInput)
    this.actions = this.actions.concat(command.action.toString(16).padStart(2, '0'))
  }

  addTrade(trade: Trade<Currency, Currency, TradeType>, slippageTolerance?: Percent): void {
    const exactOutput = trade.tradeType === TradeType.EXACT_OUTPUT

    if (exactOutput) invariant(!!slippageTolerance, 'ExactOut requires slippageTolerance')
    invariant(trade.swaps.length === 1, 'Only accepts Trades with 1 swap (must break swaps into individual trades)')

    const actionType = exactOutput ? Actions.SWAP_EXACT_OUT : Actions.SWAP_EXACT_IN

    const currencyIn = currencyAddress(trade.inputAmount.currency)
    const currencyOut = currencyAddress(trade.outputAmount.currency)

    this.addAction(actionType, [
      exactOutput
        ? {
            currencyOut,
            path: encodeRouteToPath(trade.route, exactOutput),
            amountInMaximum: trade.maximumAmountIn(slippageTolerance ?? new Percent(0)).quotient.toString(),
            amountOut: trade.inputAmount.quotient.toString(),
          }
        : {
            currencyIn,
            path: encodeRouteToPath(trade.route, exactOutput),
            amountIn: trade.inputAmount.quotient.toString(),
            amountOutMinimum: slippageTolerance ? trade.minimumAmountOut(slippageTolerance).quotient.toString() : 0,
          },
    ])

    this.addAction(Actions.SETTLE_TAKE_PAIR, [currencyIn, currencyOut])
  }

  finalize(): string {
    return defaultAbiCoder.encode(['bytes', 'bytes[]'], [this.actions, this.params])
  }
}

function currencyAddress(currency: Currency): string {
  return currency.isNative ? ADDRESS_ZERO : currency.wrapped.address
}

type RouterAction = {
  action: Actions
  encodedInput: string
}

function createAction(action: Actions, parameters: any[]): RouterAction {
  const encodedInput = defaultAbiCoder.encode(ABI_DEFINITION[action], parameters)
  return { action, encodedInput }
}
