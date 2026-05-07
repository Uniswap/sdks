import { BigNumber } from 'ethers'
import invariant from 'tiny-invariant'
import { TradeType } from '@uniswap/sdk-core'
import { TokenTransferMode } from '../entities/actions/uniswap'
import { ROUTER_AS_RECIPIENT, SENDER_AS_RECIPIENT, UniversalRouterVersion, ZERO_ADDRESS } from './constants'
import { NormalizedSwapSpecification, SwapStep, V4Action } from '../types/encodeSwaps'

// V3 path: 20-byte address + N × (3-byte fee + 20-byte address); minimum is 43 bytes (single hop, N=1)
// Returns N or undefined if malformed
function getV3HopCount(path: string): number | undefined {
  if (!path.startsWith('0x')) return undefined

  const byteLength = (path.length - 2) / 2
  if (byteLength < 43) return undefined

  const variableSegmentLength = byteLength - 20
  if (variableSegmentLength < 23 || variableSegmentLength % 23 !== 0) return undefined

  return variableSegmentLength / 23
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

function assertRouterActionRecipient(recipient: string): void {
  invariant(recipient === ROUTER_AS_RECIPIENT, 'V4_ACTION_RECIPIENT_MUST_BE_ROUTER')
}

// V4 actions that take a recipient must use router custody so the SDK's settlement sweeps see the funds
function validateV4Recipients(actions: V4Action[]): void {
  for (const action of actions) {
    switch (action.action) {
      case 'TAKE':
      case 'TAKE_PORTION':
        assertRouterActionRecipient(action.recipient)
        break
      default:
        break
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

  // per-step: capability-gate by UR version, recipients must be router custody, per-hop arrays must match hop counts
  for (const step of swapSteps) {
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
        assertRouterRecipient(step.recipient)
        invariant(
          !step.minHopPriceX36 || step.minHopPriceX36.length === step.path.length - 1,
          'V2_MIN_HOP_PRICE_X36_LENGTH_MISMATCH'
        )
        break
      case 'V3_SWAP_EXACT_IN':
      case 'V3_SWAP_EXACT_OUT': {
        assertRouterRecipient(step.recipient)
        const hopCount = getV3HopCount(step.path)
        invariant(
          hopCount === undefined || !step.minHopPriceX36 || step.minHopPriceX36.length === hopCount,
          'V3_MIN_HOP_PRICE_X36_LENGTH_MISMATCH'
        )
        break
      }
      case 'WRAP_ETH':
      case 'UNWRAP_WETH':
        assertRouterRecipient(step.recipient)
        break
      case 'V4_SWAP':
        validateV4HopCounts(step.v4Actions)
        validateV4Recipients(step.v4Actions)
        break
      default:
        break
    }
  }
}
