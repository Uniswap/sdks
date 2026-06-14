import { BigNumberish } from 'ethers'
import { Currency, CurrencyAmount, Percent, TradeType } from '@uniswap/sdk-core'
import { type PathKey, type PoolKey } from '@uniswap/v4-sdk'
import { TokenTransferMode } from '../entities/actions/uniswap'
import { Permit2Permit } from '../utils/inputTokens'
import { UniversalRouterVersion } from '../utils/constants'

export type { PathKey, PoolKey }

// portion: % of variable output, used with exact-input
// flat: fixed amount, deducted from exact-output target
export type Fee =
  | { kind: 'portion'; recipient: string; fee: Percent }
  | { kind: 'flat'; recipient: string; amount: BigNumberish }

export type SwapSpecification = {
  tradeType: TradeType
  routing: {
    inputToken: Currency
    outputToken: Currency
    amount: CurrencyAmount<Currency> // the exact side: input for exact-input, output for exact-output
    quote: CurrencyAmount<Currency> // the slippage side: output for exact-input, input for exact-output
  }
  slippageTolerance: Percent
  recipient?: string // defaults to SENDER_AS_RECIPIENT (0x01); ApproveProxy requires an explicit address
  fee?: Fee
  tokenTransferMode?: TokenTransferMode
  permit?: Permit2Permit
  chainId?: number // required only for ApproveProxy
  deadline?: BigNumberish
  urVersion?: UniversalRouterVersion
  safeMode?: boolean // appends a trailing SWEEP(ETH, recipient, 0) to recover native dust or unintended msg.value
  /**
   * The input Token is the chain's native gas token exposed via an ERC20 predeploy whose balance
   * mirrors the native balance (e.g. USDC on Arc). The swap is funded by attaching
   * msg.value = exactOrMaxAmountIn * 10^(18 - token.decimals) instead of pulling via Permit2:
   * the PERMIT2_TRANSFER_FROM ingress is skipped and no ERC20 approval or permit is ever needed.
   * Incompatible with native input, permit, and TokenTransferMode.ApproveProxy.
   */
  nativeErc20Input?: boolean
}

// Output of `normalizeEncodeSwapsSpec`: the four fields below are guaranteed
// non-undefined, encoding the precondition for `validateEncodeSwaps` and
// `computeEncodeSwapsAmounts` at the type level.
export type NormalizedSwapSpecification = Omit<
  SwapSpecification,
  'recipient' | 'tokenTransferMode' | 'urVersion' | 'safeMode'
> & {
  recipient: string
  tokenTransferMode: TokenTransferMode
  urVersion: UniversalRouterVersion
  safeMode: boolean
}

export type V2SwapExactIn = {
  type: 'V2_SWAP_EXACT_IN'
  recipient: string
  amountIn: BigNumberish
  amountOutMin: BigNumberish
  path: string[]
  minHopPriceX36?: BigNumberish[]
}

export type V2SwapExactOut = {
  type: 'V2_SWAP_EXACT_OUT'
  recipient: string
  amountOut: BigNumberish
  amountInMax: BigNumberish
  path: string[]
  minHopPriceX36?: BigNumberish[]
}

export type V3SwapExactIn = {
  type: 'V3_SWAP_EXACT_IN'
  recipient: string
  amountIn: BigNumberish
  amountOutMin: BigNumberish
  path: string
  minHopPriceX36?: BigNumberish[]
}

export type V3SwapExactOut = {
  type: 'V3_SWAP_EXACT_OUT'
  recipient: string
  amountOut: BigNumberish
  amountInMax: BigNumberish
  path: string
  minHopPriceX36?: BigNumberish[]
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

export type SwapStep = V2SwapExactIn | V2SwapExactOut | V3SwapExactIn | V3SwapExactOut | V4Swap | WrapEth | UnwrapWeth

export type V4SwapExactIn = {
  action: 'SWAP_EXACT_IN'
  currencyIn: string
  path: PathKey[]
  amountIn: BigNumberish
  amountOutMinimum: BigNumberish
  minHopPriceX36?: BigNumberish[]
}

export type V4SwapExactInSingle = {
  action: 'SWAP_EXACT_IN_SINGLE'
  poolKey: PoolKey
  zeroForOne: boolean
  amountIn: BigNumberish
  amountOutMinimum: BigNumberish
  minHopPriceX36?: BigNumberish
  hookData: string
}

export type V4SwapExactOut = {
  action: 'SWAP_EXACT_OUT'
  currencyOut: string
  path: PathKey[]
  amountOut: BigNumberish
  amountInMaximum: BigNumberish
  minHopPriceX36?: BigNumberish[]
}

export type V4SwapExactOutSingle = {
  action: 'SWAP_EXACT_OUT_SINGLE'
  poolKey: PoolKey
  zeroForOne: boolean
  amountOut: BigNumberish
  amountInMaximum: BigNumberish
  minHopPriceX36?: BigNumberish
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

// the v4-periphery actions UR's `V4Router._handleAction` dispatches
export type V4Action =
  | V4SwapExactIn
  | V4SwapExactInSingle
  | V4SwapExactOut
  | V4SwapExactOutSingle
  | V4Settle
  | V4SettleAll
  | V4Take
  | V4TakeAll
  | V4TakePortion
