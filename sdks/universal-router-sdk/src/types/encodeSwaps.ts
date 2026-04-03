import { BigNumberish } from 'ethers'
import { Currency, CurrencyAmount, Percent, TradeType } from '@uniswap/sdk-core'
import { type PathKey, type PoolKey } from '@uniswap/v4-sdk'
import { TokenTransferMode } from '../entities/actions/uniswap'
import { Permit2Permit } from '../utils/inputTokens'
import { UniversalRouterVersion } from '../utils/constants'

export type { PathKey, PoolKey }

export type Fee =
  | { kind: 'portion'; recipient: string; fee: Percent }
  | { kind: 'flat'; recipient: string; amount: BigNumberish }

export type SwapSpecification = {
  tradeType: TradeType
  routing: {
    inputToken: Currency
    outputToken: Currency
    amount: CurrencyAmount<Currency>
    quote: CurrencyAmount<Currency>
  }
  recipient?: string
  fee?: Fee
  tokenTransferMode?: TokenTransferMode
  permit?: Permit2Permit
  chainId?: number
  slippageTolerance: Percent
  deadline?: BigNumberish
  urVersion?: UniversalRouterVersion
}

export type V2SwapExactIn = {
  type: 'V2_SWAP_EXACT_IN'
  recipient: string
  amountIn: BigNumberish
  amountOutMin: BigNumberish
  path: string[]
  maxHopSlippage?: BigNumberish[]
}

export type V2SwapExactOut = {
  type: 'V2_SWAP_EXACT_OUT'
  recipient: string
  amountOut: BigNumberish
  amountInMax: BigNumberish
  path: string[]
  maxHopSlippage?: BigNumberish[]
}

export type V3SwapExactIn = {
  type: 'V3_SWAP_EXACT_IN'
  recipient: string
  amountIn: BigNumberish
  amountOutMin: BigNumberish
  path: string
  maxHopSlippage?: BigNumberish[]
}

export type V3SwapExactOut = {
  type: 'V3_SWAP_EXACT_OUT'
  recipient: string
  amountOut: BigNumberish
  amountInMax: BigNumberish
  path: string
  maxHopSlippage?: BigNumberish[]
}

export type V4Swap = {
  type: 'V4_SWAP'
  v4Actions: V4Action[]
}

export type WrapEth = {
  type: 'WRAP_ETH'
  recipient: string
  amount: BigNumberish
}

export type UnwrapWeth = {
  type: 'UNWRAP_WETH'
  recipient: string
  amountMin: BigNumberish
}

export type SwapStep =
  | V2SwapExactIn
  | V2SwapExactOut
  | V3SwapExactIn
  | V3SwapExactOut
  | V4Swap
  | WrapEth
  | UnwrapWeth

export type V4SwapExactIn = {
  action: 'SWAP_EXACT_IN'
  currencyIn: string
  path: PathKey[]
  amountIn: BigNumberish
  amountOutMinimum: BigNumberish
  maxHopSlippage?: BigNumberish[]
}

export type V4SwapExactInSingle = {
  action: 'SWAP_EXACT_IN_SINGLE'
  poolKey: PoolKey
  zeroForOne: boolean
  amountIn: BigNumberish
  amountOutMinimum: BigNumberish
  maxHopSlippage?: BigNumberish
  hookData: string
}

export type V4SwapExactOut = {
  action: 'SWAP_EXACT_OUT'
  currencyOut: string
  path: PathKey[]
  amountOut: BigNumberish
  amountInMaximum: BigNumberish
  maxHopSlippage?: BigNumberish[]
}

export type V4SwapExactOutSingle = {
  action: 'SWAP_EXACT_OUT_SINGLE'
  poolKey: PoolKey
  zeroForOne: boolean
  amountOut: BigNumberish
  amountInMaximum: BigNumberish
  maxHopSlippage?: BigNumberish
  hookData: string
}

export type V4Settle = {
  action: 'SETTLE'
  currency: string
  amount: BigNumberish
}

export type V4SettleAll = {
  action: 'SETTLE_ALL'
  currency: string
  maxAmount: BigNumberish
}

export type V4SettlePair = {
  action: 'SETTLE_PAIR'
  currency0: string
  currency1: string
}

export type V4Take = {
  action: 'TAKE'
  currency: string
  recipient: string
  amount: BigNumberish
}

export type V4TakeAll = {
  action: 'TAKE_ALL'
  currency: string
  minAmount: BigNumberish
}

export type V4TakePortion = {
  action: 'TAKE_PORTION'
  currency: string
  recipient: string
  bips: BigNumberish
}

export type V4TakePair = {
  action: 'TAKE_PAIR'
  currency0: string
  currency1: string
  recipient: string
}

export type V4CloseCurrency = {
  action: 'CLOSE_CURRENCY'
  currency: string
}

export type V4Sweep = {
  action: 'SWEEP'
  currency: string
  recipient: string
}

export type V4Unwrap = {
  action: 'UNWRAP'
  amount: BigNumberish
}

export type V4Action =
  | V4SwapExactIn
  | V4SwapExactInSingle
  | V4SwapExactOut
  | V4SwapExactOutSingle
  | V4Settle
  | V4SettleAll
  | V4SettlePair
  | V4Take
  | V4TakeAll
  | V4TakePortion
  | V4TakePair
  | V4CloseCurrency
  | V4Sweep
  | V4Unwrap
