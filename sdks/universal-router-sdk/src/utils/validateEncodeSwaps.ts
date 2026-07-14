import { BigNumber } from 'ethers'
import invariant from 'tiny-invariant'
import { TradeType } from '@uniswap/sdk-core'
import { TokenTransferMode } from '../entities/actions/uniswap'
import {
  MAX_UINT160,
  ROUTER_AS_RECIPIENT,
  SENDER_AS_RECIPIENT,
  UniversalRouterVersion,
  ZERO_ADDRESS,
} from './constants'
import { NormalizedSwapSpecification, SwapStep, V4Action } from '../types/encodeSwaps'
import { getCurrencyAddress } from './getCurrencyAddress'
import { getV3HopCount, hasUserPaidFlag, stepUserPaidPulls } from './directTransfers'
import { computeEncodeSwapsAmounts } from './computeEncodeSwapsAmounts'

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
  invariant(spec.fee?.kind !== 'portion', 'PORTION_FEE_REQUIRES_ROUTER_CUSTODY')
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
        // wrong payee while still reducing their sweep floor
        // flag-off TAKE_ALL is already rejected by the safe-mode gate above, so only a portion fee can block it here
        invariant(spec.fee?.kind !== 'portion', 'PORTION_FEE_REQUIRES_ROUTER_CUSTODY')
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

  // portion fees pair with exact-input (% of variable output); flat fees pair with exact-output (fixed deduction from the target)
  invariant(
    !(spec.fee?.kind === 'portion' && spec.tradeType !== TradeType.EXACT_INPUT),
    'INVALID_PORTION_FEE_TRADE_TYPE'
  )
  invariant(!(spec.fee?.kind === 'flat' && spec.tradeType !== TradeType.EXACT_OUTPUT), 'INVALID_FLAT_FEE_TRADE_TYPE')
  invariant(
    !(
      spec.fee?.kind === 'flat' &&
      BigNumber.from(spec.fee.amount).gt(BigNumber.from(spec.routing.amount.quotient.toString()))
    ),
    'FLAT_FEE_GT_AMOUNT'
  )

  // v2.0 PAY_PORTION takes whole bps; fractional bps need >=v2.1.1's PAY_PORTION_FULL_PRECISION
  invariant(
    !(
      spec.fee?.kind === 'portion' &&
      spec.urVersion === UniversalRouterVersion.V2_0 &&
      !spec.fee.fee.multiply(10_000).remainder.equalTo(0)
    ),
    'FRACTIONAL_BPS_PORTION_FEE_UNSUPPORTED_ON_V2_0'
  )

  // per-step: capability-gate by UR version, recipients must be router custody (or the spec
  // recipient under allowDirectTransfers), per-hop arrays must match hop counts
  for (const step of swapSteps) {
    if (!spec.allowDirectTransfers) {
      invariant(!hasUserPaidFlag(step), 'PAYER_IS_USER_REQUIRES_DIRECT_TRANSFERS')
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
