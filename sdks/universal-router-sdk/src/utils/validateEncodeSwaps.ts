import { BigNumber } from 'ethers'
import invariant from 'tiny-invariant'
import { TradeType, WETH9 } from '@uniswap/sdk-core'
import { MAX_FEE_RECIPIENTS, TokenTransferMode } from '../entities/actions/uniswap'
import {
  MAX_UINT160,
  ROUTER_AS_RECIPIENT,
  SENDER_AS_RECIPIENT,
  UniversalRouterVersion,
  isAtLeastV2_1_1,
  ZERO_ADDRESS,
  ETH_ADDRESS,
  CONTRACT_BALANCE,
} from './constants'
import { NormalizedSwapSpecification, SwapStep, V4Action } from '../types/encodeSwaps'
import { getCurrencyAddress } from './getCurrencyAddress'
import { getV3HopCount, hasUserPaidFlag, stepUserPaidPulls } from './directTransfers'
import { computeEncodeSwapsAmounts } from './computeEncodeSwapsAmounts'
import { isInputSettle, isInputSwap, stepSpendAmount, stepSpendsToken, v4SwapAmountIn } from './routerBalanceSteps'
import { toFeeList } from './normalizeEncodeSwapsSpec'

function hasPortionFee(spec: NormalizedSwapSpecification): boolean {
  return toFeeList(spec.fee).some((fee) => fee.kind === 'portion')
}

function hasV4MinHopPriceX36(action: V4Action): boolean {
  switch (action.action) {
    case 'SWAP_EXACT_IN':
    case 'SWAP_EXACT_OUT':
    case 'SWAP_EXACT_IN_SINGLE':
    case 'SWAP_EXACT_OUT_SINGLE':
      return action.minHopPriceX36 !== undefined
    default:
      return false
  }
}

function validateV4HopCounts(actions: V4Action[]): void {
  for (const action of actions) {
    switch (action.action) {
      case 'SWAP_EXACT_IN':
      case 'SWAP_EXACT_OUT':
        invariant(
          !action.minHopPriceX36 || action.minHopPriceX36.length === action.path.length,
          'V4_MIN_HOP_PRICE_X36_LENGTH_MISMATCH'
        )
        break
      default:
        break
    }
  }
}

function assertRouterRecipient(recipient: string): void {
  invariant(recipient === ROUTER_AS_RECIPIENT, 'STEP_RECIPIENT_MUST_BE_ROUTER')
}

// `routerOnlyError` is the surface's legacy flag-off code (steps vs v4 actions)
function checkRecipient(spec: NormalizedSwapSpecification, recipient: string, routerOnlyError: string): void {
  invariant(typeof recipient === 'string', routerOnlyError)
  if (recipient === ROUTER_AS_RECIPIENT) return
  invariant(spec.allowDirectTransfers, routerOnlyError)
  invariant(!hasPortionFee(spec), 'PORTION_FEE_REQUIRES_ROUTER_CUSTODY')
  invariant(recipient.toLowerCase() === spec.recipient.toLowerCase(), 'STEP_RECIPIENT_NOT_ALLOWED')
}

function validateV4Recipients(actions: V4Action[], spec: NormalizedSwapSpecification): void {
  for (const action of actions) {
    switch (action.action) {
      case 'TAKE':
      case 'TAKE_PORTION':
        // fees are sdk-authored (the envelope's PAY_PORTION); a step-level TAKE_PORTION never pays the fee recipient
        checkRecipient(spec, action.recipient, 'V4_ACTION_RECIPIENT_MUST_BE_ROUTER')
        break
      case 'TAKE_ALL':
        // TAKE_ALL pays msgSender on-chain; any other spec recipient would be the
        // wrong payee while still reducing their sweep floor.
        invariant(spec.allowDirectTransfers, 'TAKE_ALL_REQUIRES_DIRECT_TRANSFERS')
        invariant(!hasPortionFee(spec), 'PORTION_FEE_REQUIRES_ROUTER_CUSTODY')
        // strict equality: the all-numeric sentinel has no checksum variant; anything else fails closed
        invariant(spec.recipient === SENDER_AS_RECIPIENT, 'TAKE_ALL_REQUIRES_SENDER_RECIPIENT')
        break
      default:
        break
    }
  }
}

const HEX_BYTES = /^0x([0-9a-fA-F]{2})*$/

// ethers rejects non-hex hookData (e.g. '') deep inside abi encoding; fail loudly here instead
function validateV4HookData(actions: V4Action[]): void {
  for (const action of actions) {
    if (action.action === 'SWAP_EXACT_IN_SINGLE' || action.action === 'SWAP_EXACT_OUT_SINGLE') {
      invariant(HEX_BYTES.test(action.hookData), 'V4_HOOK_DATA_INVALID')
    }
    if (action.action === 'SWAP_EXACT_IN' || action.action === 'SWAP_EXACT_OUT') {
      for (const hop of action.path) {
        invariant(HEX_BYTES.test(hop.hookData), 'V4_HOOK_DATA_INVALID')
      }
    }
  }
}

export function validateEncodeSwaps(spec: NormalizedSwapSpecification, swapSteps: SwapStep[]): void {
  invariant(swapSteps.length > 0, 'EMPTY_SWAP_STEPS')

  const amountCurrency = spec.routing.amount.currency.wrapped
  const quoteCurrency = spec.routing.quote.currency.wrapped
  const inputCurrency = spec.routing.inputToken.wrapped
  const outputCurrency = spec.routing.outputToken.wrapped

  invariant(!spec.slippageTolerance.lessThan(0), 'SLIPPAGE_TOLERANCE')
  invariant(spec.recipient !== ZERO_ADDRESS, 'RECIPIENT_CANNOT_BE_ZERO')
  invariant(spec.recipient !== ROUTER_AS_RECIPIENT, 'RECIPIENT_CANNOT_BE_ROUTER')

  // routing.amount is on the exact side of the trade; routing.quote is on the slippage side
  if (spec.tradeType === TradeType.EXACT_INPUT) {
    invariant(amountCurrency.equals(inputCurrency), 'INVALID_ROUTING_AMOUNT_CURRENCY')
    invariant(quoteCurrency.equals(outputCurrency), 'INVALID_ROUTING_QUOTE_CURRENCY')
  } else {
    invariant(amountCurrency.equals(outputCurrency), 'INVALID_ROUTING_AMOUNT_CURRENCY')
    invariant(quoteCurrency.equals(inputCurrency), 'INVALID_ROUTING_QUOTE_CURRENCY')
  }

  // ApproveProxy ingress lives upstream in the proxy contract: needs chain id, ERC20 input, no permit2, explicit recipient
  if (spec.tokenTransferMode === TokenTransferMode.ApproveProxy) {
    invariant(!!spec.chainId, 'PROXY_MISSING_CHAIN_ID')
    invariant(!spec.routing.inputToken.isNative, 'PROXY_NATIVE_INPUT')
    invariant(!spec.permit, 'PROXY_PERMIT_CONFLICT')
    invariant(spec.recipient !== SENDER_AS_RECIPIENT, 'PROXY_EXPLICIT_RECIPIENT_REQUIRED')
  }
  // permit2 is ERC20-only; native input pays via msg.value
  invariant(!(spec.routing.inputToken.isNative && spec.permit), 'NATIVE_INPUT_PERMIT')

  // native-ERC20 gas-token input (e.g. Arc USDC): funded via msg.value, never via Permit2
  if (spec.nativeErc20Input) {
    invariant(!spec.routing.inputToken.isNative, 'NATIVE_ERC20_INPUT_NATIVE_TOKEN')
    invariant(!spec.permit, 'NATIVE_ERC20_INPUT_PERMIT_CONFLICT')
    invariant(spec.tokenTransferMode !== TokenTransferMode.ApproveProxy, 'NATIVE_ERC20_INPUT_PROXY_CONFLICT')
    invariant(spec.routing.inputToken.decimals <= 18, 'NATIVE_ERC20_INPUT_DECIMALS')
  }

  // router-balance funding: no ingress, first hop spends CONTRACT_BALANCE. Mirrors the
  // SwapOptions.routerBalanceInput guards; anything refused here would silently encode a
  // fixed-amount wallet-funded swap instead.
  if (spec.routerBalanceInput) {
    invariant(spec.tradeType === TradeType.EXACT_INPUT, 'ROUTER_BALANCE_INPUT_EXACT_INPUT_ONLY')
    invariant(!spec.nativeErc20Input, 'ROUTER_BALANCE_INPUT_NATIVE_ERC20_CONFLICT')
    invariant(!spec.permit, 'ROUTER_BALANCE_INPUT_PERMIT_CONFLICT')
    invariant(spec.tokenTransferMode !== TokenTransferMode.ApproveProxy, 'ROUTER_BALANCE_INPUT_PROXY_CONFLICT')
    invariant(!spec.allowDirectTransfers, 'ROUTER_BALANCE_INPUT_DIRECT_TRANSFERS_CONFLICT')
    // SENDER_AS_RECIPIENT resolves to the caller of execute(), who in this flow is the
    // funder (a bridge filler), not the swapper.
    invariant(spec.recipient !== SENDER_AS_RECIPIENT, 'ROUTER_BALANCE_INPUT_EXPLICIT_RECIPIENT_REQUIRED')
    if (spec.routerBalanceInput.minimumAmount !== undefined) {
      // BALANCE_CHECK_ERC20 reads `owner` verbatim, so the router's real address is needed
      invariant(!!spec.chainId, 'ROUTER_BALANCE_INPUT_MINIMUM_REQUIRES_CHAIN_ID')
    }

    const nativeBalanceInput = spec.routing.inputToken.isNative
    // Native input is funded as msg.value on execute() (raw transfers to the router
    // revert) and must be wrapped in full before anything spends it, so the plan has to
    // lead with a WRAP_ETH; the spender checks below then run against the wrapped token.
    if (nativeBalanceInput) {
      invariant(swapSteps[0]?.type === 'WRAP_ETH', 'ROUTER_BALANCE_INPUT_NATIVE_REQUIRES_WRAP')
    }

    // At least one step must spend the (wrapped) input token. Splits are
    // allowed: the transform keeps every spender's quoted amount except the
    // largest, which is rewritten to CONTRACT_BALANCE and moved last among the
    // spenders (a v4 leg's spend is read from its input settle or swaps).
    const balanceInputTokenAddress = nativeBalanceInput
      ? spec.routing.inputToken.wrapped.address
      : getCurrencyAddress(spec.routing.inputToken)
    const spendableSteps = nativeBalanceInput ? swapSteps.slice(1) : swapSteps
    const unwrapIndex = swapSteps.findIndex((step) => step.type === 'UNWRAP_WETH')
    const unwrapDrainsInput =
      unwrapIndex >= 0 &&
      !nativeBalanceInput &&
      balanceInputTokenAddress.toLowerCase() === WETH9[spec.routing.inputToken.chainId]?.address.toLowerCase()
    const spenderIndexes = spendableSteps
      .map((step, index) => (stepSpendsToken(step, balanceInputTokenAddress) ? index : -1))
      .filter((index) => index >= 0)
    invariant(spenderIndexes.length > 0, 'ROUTER_BALANCE_INPUT_SPLIT_ROUTE')

    // Shapes the rewrite cannot express. Checked here so both encode paths get a typed
    // refusal; the transform keeps the same assertions as a backstop.
    if (unwrapDrainsInput) {
      const nativeSpenders = swapSteps.filter(
        (step, index) => index > unwrapIndex && stepSpendsToken(step, ETH_ADDRESS)
      )
      invariant(nativeSpenders.length > 0, 'ROUTER_BALANCE_INPUT_UNWRAP_WITHOUT_NATIVE_LEG')
      invariant(nativeSpenders.length === 1, 'ROUTER_BALANCE_INPUT_UNWRAP_MULTIPLE_NATIVE_LEGS')
    }
    // A split needs a comparable amount on every leg to pick the one that absorbs the
    // variance; a sentinel or zero leg leaves the choice undefined.
    const remainderCurrency = (unwrapDrainsInput ? ETH_ADDRESS : balanceInputTokenAddress).toLowerCase()
    const remainderSpenders = swapSteps.filter((step) => stepSpendsToken(step, remainderCurrency))
    if (remainderSpenders.length > 1) {
      for (const step of remainderSpenders) {
        const amount = stepSpendAmount(step, remainderCurrency)
        invariant(amount.gt(0) && !amount.eq(CONTRACT_BALANCE), 'ROUTER_BALANCE_INPUT_SPLIT_LEG_AMOUNT_UNKNOWN')
      }
    }
    for (const step of swapSteps) {
      if (step.type !== 'V4_SWAP') {
        continue
      }
      const openDelta = step.v4Actions.filter(
        (action) => isInputSwap(action, remainderCurrency) && v4SwapAmountIn(action).isZero()
      )
      invariant(openDelta.length <= 1, 'ROUTER_BALANCE_INPUT_MULTIPLE_OPEN_DELTA_SWAPS')
    }
    swapSteps.forEach((step, index) => {
      invariant(
        step.type !== 'V2_SWAP_EXACT_OUT' && step.type !== 'V3_SWAP_EXACT_OUT',
        'ROUTER_BALANCE_INPUT_EXACT_INPUT_ONLY'
      )
      // A wrap at hop 0 of an ERC20 plan means the plan expects native input. Wraps later
      // in the plan are routers wrapping intermediate ETH (a v4 leg paid out native and the
      // next leg wants WETH) and only touch what that leg produced.
      invariant(step.type !== 'WRAP_ETH' || index > 0 || nativeBalanceInput, 'ROUTER_BALANCE_INPUT_NATIVE_INPUT')
      // Native mode wraps the whole balance at hop 0, so a later leg that still expects raw
      // ETH (routers can feed v4 pools native directly) would find nothing to spend.
      invariant(
        !nativeBalanceInput || index === 0 || !stepSpendsToken(step, ETH_ADDRESS),
        'ROUTER_BALANCE_INPUT_NATIVE_LEG_UNSUPPORTED'
      )
      // With WETH delivered, the unwrap is the greedy claim, so an input-token spender
      // after it would find an empty balance.
      invariant(
        !unwrapDrainsInput || index <= unwrapIndex || !stepSpendsToken(step, balanceInputTokenAddress),
        'ROUTER_BALANCE_INPUT_WETH_LEG_AFTER_UNWRAP'
      )
      // The rewrite keeps the caller's v4 action order and turns the input settle into
      // SETTLE(CONTRACT_BALANCE) with the swap on the open delta. A swap that runs before
      // that settle has nothing to spend and reverts on-chain, so require settle first.
      // (A step with no input settle gets one prepended by the rewrite.)
      if (step.type === 'V4_SWAP' && stepSpendsToken(step, balanceInputTokenAddress)) {
        const token = balanceInputTokenAddress.toLowerCase()
        const settleIndex = step.v4Actions.findIndex((action) => isInputSettle(action, token))
        const swapIndex = step.v4Actions.findIndex((action) => isInputSwap(action, token))
        invariant(
          settleIndex < 0 || swapIndex < 0 || settleIndex < swapIndex,
          'ROUTER_BALANCE_INPUT_V4_SETTLE_BEFORE_SWAP'
        )
      }
    })
  }

  // An empty array is rejected rather than read as "no fee": silently paying nobody is the failure to prevent.
  // Fee checks throw plain Errors, not tiny-invariant: invariant strips the
  // message in production builds, and callers classify these by message.
  const fees = toFeeList(spec.fee)
  if (Array.isArray(spec.fee)) {
    if (fees.length === 0) throw new Error('AT_LEAST_ONE_FEE_RECIPIENT_REQUIRED')
    if (fees.length > MAX_FEE_RECIPIENTS) throw new Error('TOO_MANY_FEE_RECIPIENTS')
  }

  // Each portion fee means a fraction of the *gross* output, so later entries are rescaled
  // against the router's shrinking balance at encode time. The rescaled portions are fractional
  // bips, which only PAY_PORTION_FULL_PRECISION (>= v2.1.1) can represent, so multiple portion
  // fees are therefore rejected on older router versions.
  if (fees.filter((fee) => fee.kind === 'portion').length > 1 && !isAtLeastV2_1_1(spec.urVersion)) {
    throw new Error('MULTIPLE_FEE_RECIPIENTS_REQUIRE_UR_V2_1_1')
  }

  // Per entry, so one bad entry is never averaged away, and a mixed portion/flat array trips one of these.
  let flatFeeTotal = BigNumber.from(0)
  for (const fee of fees) {
    // portion fees pair with exact-input (% of variable output); flat fees pair with exact-output (fixed deduction from the target)
    if (fee.kind === 'portion' && spec.tradeType !== TradeType.EXACT_INPUT) {
      throw new Error('INVALID_PORTION_FEE_TRADE_TYPE')
    }
    if (fee.kind === 'flat' && spec.tradeType !== TradeType.EXACT_OUTPUT) {
      throw new Error('INVALID_FLAT_FEE_TRADE_TYPE')
    }

    if (fee.kind === 'flat') {
      flatFeeTotal = flatFeeTotal.add(BigNumber.from(fee.amount))
    }

    // v2.0 PAY_PORTION takes whole bps; fractional bps need >=v2.1.1's PAY_PORTION_FULL_PRECISION
    // Any pre-2.1.1 version lacks PAY_PORTION_FULL_PRECISION, not just 2.0.
    if (fee.kind === 'portion' && !isAtLeastV2_1_1(spec.urVersion) && !fee.fee.multiply(10_000).remainder.equalTo(0)) {
      throw new Error('FRACTIONAL_BPS_PORTION_FEE_UNSUPPORTED_ON_V2_0')
    }
  }

  // Each flat transfer is paid in full from the same balance, so it is the total that must fit.
  if (flatFeeTotal.gt(BigNumber.from(spec.routing.amount.quotient.toString()))) {
    throw new Error('FLAT_FEE_GT_AMOUNT')
  }

  // per-step: capability-gate by UR version, recipients must be router custody (or the spec
  // recipient under allowDirectTransfers), per-hop arrays must match hop counts
  // Router-balance funding rewrites the spender legs and clears any payerIsUser flag a
  // wallet-mode router plan carried, so the flag is tolerated only on those legs.
  const balanceInputAddress = spec.routerBalanceInput
    ? spec.routing.inputToken.isNative
      ? spec.routing.inputToken.wrapped.address
      : getCurrencyAddress(spec.routing.inputToken)
    : undefined
  for (const step of swapSteps) {
    if (!spec.allowDirectTransfers) {
      // The router-balance rewrite clears payerIsUser on the spender steps, so a flag a
      // wallet-mode plan carried there is tolerated. The waiver is per-PULL, not
      // per-step: a spender step may also carry a settle in some other currency, which
      // the rewrite has no business funding, and excusing the whole step would let that
      // settle reach the chain and pull the executing filler's balance via Permit2.
      const rewrittenPulls =
        balanceInputAddress !== undefined &&
        stepSpendsToken(step, balanceInputAddress) &&
        stepUserPaidPulls(step).every((pull) => pull.token?.toLowerCase() === balanceInputAddress.toLowerCase())
      invariant(!hasUserPaidFlag(step) || rewrittenPulls, 'PAYER_IS_USER_REQUIRES_DIRECT_TRANSFERS')
      if (step.type === 'V4_SWAP') {
        for (const action of step.v4Actions) {
          invariant(action.action !== 'SETTLE_ALL', 'SETTLE_ALL_REQUIRES_DIRECT_TRANSFERS')
          invariant(action.action !== 'TAKE_ALL', 'TAKE_ALL_REQUIRES_DIRECT_TRANSFERS')
        }
      }
    }

    if (spec.urVersion === UniversalRouterVersion.V2_0) {
      invariant(
        !('minHopPriceX36' in step) || step.minHopPriceX36 === undefined,
        'MIN_HOP_PRICE_X36_UNSUPPORTED_ON_V2_0'
      )
      invariant(
        !(step.type === 'V4_SWAP' && step.v4Actions.some(hasV4MinHopPriceX36)),
        'MIN_HOP_PRICE_X36_UNSUPPORTED_ON_V2_0'
      )
    }

    switch (step.type) {
      case 'V2_SWAP_EXACT_IN':
      case 'V2_SWAP_EXACT_OUT':
        checkRecipient(spec, step.recipient, 'STEP_RECIPIENT_MUST_BE_ROUTER')
        invariant(
          !step.minHopPriceX36 || step.minHopPriceX36.length === step.path.length - 1,
          'V2_MIN_HOP_PRICE_X36_LENGTH_MISMATCH'
        )
        break
      case 'V3_SWAP_EXACT_IN':
      case 'V3_SWAP_EXACT_OUT': {
        checkRecipient(spec, step.recipient, 'STEP_RECIPIENT_MUST_BE_ROUTER')
        const hopCount = getV3HopCount(step.path)
        invariant(
          hopCount === undefined || !step.minHopPriceX36 || step.minHopPriceX36.length === hopCount,
          'V3_MIN_HOP_PRICE_X36_LENGTH_MISMATCH'
        )
        break
      }
      case 'WRAP_ETH':
        // router-only in both regimes: this is the input-side transition, not an outbound payout
        assertRouterRecipient(step.recipient)
        break
      case 'UNWRAP_WETH':
        checkRecipient(spec, step.recipient, 'STEP_RECIPIENT_MUST_BE_ROUTER')
        break
      case 'V4_SWAP':
        validateV4HopCounts(step.v4Actions)
        validateV4HookData(step.v4Actions)
        validateV4Recipients(step.v4Actions, spec)
        break
      default:
        break
    }
  }

  // inbound budget: user-paid pulls must be concrete input-token amounts whose combined
  // maxima fit within exactOrMaxAmountIn; the encoder then ingresses only the remainder,
  // so total user outflow can never exceed the spec's input
  if (spec.allowDirectTransfers && swapSteps.some((step) => stepUserPaidPulls(step).length > 0)) {
    // permit2-based direct pulls need a plain ERC20 input owned by the tx sender
    invariant(!spec.routing.inputToken.isNative, 'DIRECT_TRANSFERS_NATIVE_INPUT')
    invariant(!spec.nativeErc20Input, 'DIRECT_TRANSFERS_NATIVE_ERC20_INPUT')
    invariant(spec.tokenTransferMode === TokenTransferMode.Permit2, 'DIRECT_TRANSFERS_REQUIRES_PERMIT2')

    const { exactOrMaxAmountIn } = computeEncodeSwapsAmounts(spec)
    const inputTokenAddress = getCurrencyAddress(spec.routing.inputToken).toLowerCase()

    let userPaidTotal = BigNumber.from(0)
    swapSteps.forEach((step, stepIndex) => {
      for (const pull of stepUserPaidPulls(step)) {
        // concrete amounts only: bans ALREADY_PAID/OPEN_DELTA (0), CONTRACT_BALANCE (2^255),
        // and anything permit2's uint160 cannot move
        invariant(
          pull.maxAmount.gt(0) && pull.maxAmount.lte(MAX_UINT160),
          `USER_PAID_AMOUNT_OUT_OF_RANGE (step ${stepIndex})`
        )
        invariant(typeof pull.token === 'string', `USER_PAID_MALFORMED_PATH (step ${stepIndex})`)
        invariant(pull.token.toLowerCase() === inputTokenAddress, `USER_PAID_INPUT_TOKEN_MISMATCH (step ${stepIndex})`)
        userPaidTotal = userPaidTotal.add(pull.maxAmount)
      }
    })
    invariant(userPaidTotal.lte(exactOrMaxAmountIn), 'USER_PAID_EXCEEDS_MAX_INPUT')

    // keeps the permit2 allowance an on-chain outer ceiling equal to the budget
    if (spec.permit) {
      invariant(spec.permit.details.token.toLowerCase() === inputTokenAddress, 'PERMIT_TOKEN_MISMATCH')
      invariant(BigNumber.from(spec.permit.details.amount).gte(exactOrMaxAmountIn), 'PERMIT_AMOUNT_INSUFFICIENT')
    }
  }
}
