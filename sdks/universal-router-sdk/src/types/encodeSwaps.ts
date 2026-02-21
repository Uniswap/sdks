import { Currency, CurrencyAmount, TradeType, Percent } from '@uniswap/sdk-core'
import { BigNumber, BigNumberish } from 'ethers'
import { Permit2Permit } from '../utils/inputTokens'
import { URVersion } from '@uniswap/v4-sdk'

// === Intent (SDK-owned safety metadata) ===

export type SwapIntent = {
  tradeType: TradeType
  inputToken: Currency
  outputToken: Currency
  inputAmount: CurrencyAmount<Currency> // exact for EXACT_INPUT, max for EXACT_OUTPUT
  outputAmount: CurrencyAmount<Currency> // expected for EXACT_INPUT, exact for EXACT_OUTPUT
  slippageTolerance: Percent
  recipient?: string // defaults to SENDER_AS_RECIPIENT
  permit?: Permit2Permit
  deadline?: BigNumberish
  urVersion?: URVersion // defaults to V2_0
}

// === UR-level swap steps (routing-owned, typesafe whitelist) ===

export type V2SwapExactIn = {
  type: 'V2_SWAP_EXACT_IN'
  recipient: string
  amountIn: BigNumberish
  amountOutMin: BigNumberish
  path: string[]
  payerIsUser: boolean
}

export type V2SwapExactOut = {
  type: 'V2_SWAP_EXACT_OUT'
  recipient: string
  amountOut: BigNumberish
  amountInMax: BigNumberish
  path: string[]
  payerIsUser: boolean
}

export type V3SwapExactIn = {
  type: 'V3_SWAP_EXACT_IN'
  recipient: string
  amountIn: BigNumberish
  amountOutMin: BigNumberish
  path: string
  payerIsUser: boolean
}

export type V3SwapExactOut = {
  type: 'V3_SWAP_EXACT_OUT'
  recipient: string
  amountOut: BigNumberish
  amountInMax: BigNumberish
  path: string
  payerIsUser: boolean
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

// === V4 actions (typed, used inside V4Swap.v4Actions) ===

export type PoolKey = {
  currency0: string
  currency1: string
  fee: number
  tickSpacing: number
  hooks: string
}

export type PathKey = {
  intermediateCurrency: string
  fee: BigNumberish
  tickSpacing: number
  hooks: string
  hookData: string
}

export type V4SwapExactIn = {
  action: 'SWAP_EXACT_IN'
  currencyIn: string
  path: PathKey[]
  amountIn: BigNumberish
  amountOutMinimum: BigNumberish
  maxHopSlippage?: BigNumber[]
}

export type V4SwapExactInSingle = {
  action: 'SWAP_EXACT_IN_SINGLE'
  poolKey: PoolKey
  zeroForOne: boolean
  amountIn: BigNumberish
  amountOutMinimum: BigNumberish
  hookData: string
}

export type V4SwapExactOut = {
  action: 'SWAP_EXACT_OUT'
  currencyOut: string
  path: PathKey[]
  amountOut: BigNumberish
  amountInMaximum: BigNumberish
  maxHopSlippage?: BigNumber[]
}

export type V4SwapExactOutSingle = {
  action: 'SWAP_EXACT_OUT_SINGLE'
  poolKey: PoolKey
  zeroForOne: boolean
  amountOut: BigNumberish
  amountInMaximum: BigNumberish
  hookData: string
}

export type V4Settle = {
  action: 'SETTLE'
  currency: string
  amount: BigNumberish
  payerIsUser: boolean
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
