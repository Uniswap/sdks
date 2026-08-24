import { BigNumberish } from 'ethers'
import { Currency, CurrencyAmount, Percent, TradeType } from '@uniswap/sdk-core'
import { type PathKey, type PoolKey } from '@uniswap/v4-sdk'
import { RouterBalanceInput, TokenTransferMode } from '../entities/actions/uniswap'
import { Permit2Permit } from '../utils/inputTokens'
import { UniversalRouterVersion } from '../utils/constants'

export type { PathKey, PoolKey }

// portion: % of variable output, used with exact-input
// flat: fixed amount, deducted from exact-output target
export type Fee =
  | { kind: 'portion'; recipient: string; fee: Percent }
  | { kind: 'flat'; recipient: string; amount: BigNumberish }

export type PortionFee = Extract<Fee, { kind: 'portion' }>
export type FlatFee = Extract<Fee, { kind: 'flat' }>

/**
 * Fee(s) taken out of the swap output before it is settled to `recipient`.
 *
 * A bare `Fee` is the original shape and encodes exactly as it always has. An array pays one
 * recipient per entry, in the order given, and holds at most `MAX_FEE_RECIPIENTS` entries; each
 * entry costs one command, so the list is bounded to keep calldata size and the gas of the fee
 * tail predictable.
 *
 * Each `portion` entry's fee means "this fraction of the *gross* swap output": the encoder
 * rescales later entries against the router's shrinking balance (`scalePortionFees`), so every
 * recipient receives exactly their stated fraction of gross. The rescaled portions are fractional
 * bips, so more than one portion fee requires `urVersion` >= 2.1.1
 * (`MULTIPLE_FEE_RECIPIENTS_REQUIRE_UR_V2_1_1` otherwise).
 *
 * Entries must all be the same `kind`, because `kind` is already pinned by the trade type:
 * `portion` pairs with `EXACT_INPUT` and `flat` with `EXACT_OUTPUT`, so a mixed array is rejected
 * by `INVALID_PORTION_FEE_TRADE_TYPE` / `INVALID_FLAT_FEE_TRADE_TYPE` whichever way the trade goes.
 */
export type FeeSpecification = Fee | Fee[]

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
  fee?: FeeSpecification
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
  /**
   * Lets steps pull input straight from the user and pay output straight to `recipient`
   * (instead of router custody), still validated so the user never pays more than
   * `exactOrMaxAmountIn` or receives less than the minimum output. Default false.
   * See `SwapRouter.encodeSwaps`.
   */
  allowDirectTransfers?: boolean
  /**
   * Fund the swap from the Universal Router's own balance of the input token: no Permit2
   * ingress is emitted, the first hop spends the CONTRACT_BALANCE sentinel, and an optional
   * `minimumAmount` emits a BALANCE_CHECK_ERC20 (requires `chainId` to resolve the router
   * address). A native input is funded by attaching msg.value to execute() (raw transfers
   * to the router revert): the plan must lead with a WRAP_ETH, which is resized to wrap the
   * whole balance, the floor is asserted post-wrap as WETH, ETH dust is always swept to the
   * recipient, and the encoded value is 0. Same semantics and guards as
   * `SwapOptions.routerBalanceInput`: explicit `recipient`, EXACT_INPUT, exactly one step
   * spending the (wrapped) input token (no splits); incompatible with `permit`,
   * `nativeErc20Input`, `allowDirectTransfers`, and ApproveProxy.
   */
  routerBalanceInput?: RouterBalanceInput
}

// Output of `normalizeEncodeSwapsSpec`: the five fields below are guaranteed
// non-undefined, encoding the precondition for `validateEncodeSwaps` and
// `computeEncodeSwapsAmounts` at the type level.
export type NormalizedSwapSpecification = Omit<
  SwapSpecification,
  'recipient' | 'tokenTransferMode' | 'urVersion' | 'safeMode' | 'allowDirectTransfers'
> & {
  recipient: string
  tokenTransferMode: TokenTransferMode
  urVersion: UniversalRouterVersion
  safeMode: boolean
  allowDirectTransfers: boolean
}

export type V2SwapExactIn = {
  type: 'V2_SWAP_EXACT_IN'
  recipient: string
  amountIn: BigNumberish
  amountOutMin: BigNumberish
  path: string[]
  minHopPriceX36?: BigNumberish[]
  payerIsUser?: boolean
}

export type V2SwapExactOut = {
  type: 'V2_SWAP_EXACT_OUT'
  recipient: string
  amountOut: BigNumberish
  amountInMax: BigNumberish
  path: string[]
  minHopPriceX36?: BigNumberish[]
  payerIsUser?: boolean
}

export type V3SwapExactIn = {
  type: 'V3_SWAP_EXACT_IN'
  recipient: string
  amountIn: BigNumberish
  amountOutMin: BigNumberish
  path: string
  minHopPriceX36?: BigNumberish[]
  payerIsUser?: boolean
}

export type V3SwapExactOut = {
  type: 'V3_SWAP_EXACT_OUT'
  recipient: string
  amountOut: BigNumberish
  amountInMax: BigNumberish
  path: string
  minHopPriceX36?: BigNumberish[]
  payerIsUser?: boolean
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
  payerIsUser?: boolean
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
