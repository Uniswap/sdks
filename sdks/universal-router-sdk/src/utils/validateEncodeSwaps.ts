import { BigNumber } from 'ethers'
import invariant from 'tiny-invariant'
import { TradeType } from '@uniswap/sdk-core'
import { TokenTransferMode } from '../entities/actions/uniswap'
import { ROUTER_AS_RECIPIENT, SENDER_AS_RECIPIENT, UniversalRouterVersion } from './constants'
import { SwapSpecification, SwapStep, V4Action } from '../types/encodeSwaps'

function getV3HopCount(path: string): number | undefined {
  if (!path.startsWith('0x')) return undefined

  const byteLength = (path.length - 2) / 2
  if (byteLength < 43) return undefined

  const variableSegmentLength = byteLength - 20
  if (variableSegmentLength < 23 || variableSegmentLength % 23 !== 0) return undefined

  return variableSegmentLength / 23
}

function hasV4MaxHopSlippage(action: V4Action): boolean {
  switch (action.action) {
    case 'SWAP_EXACT_IN':
    case 'SWAP_EXACT_OUT':
      return action.maxHopSlippage !== undefined
    case 'SWAP_EXACT_IN_SINGLE':
    case 'SWAP_EXACT_OUT_SINGLE':
      return action.maxHopSlippage !== undefined
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
          !action.maxHopSlippage || action.maxHopSlippage.length === action.path.length,
          'V4_MAX_HOP_SLIPPAGE_LENGTH_MISMATCH'
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

function validateV4Recipients(actions: V4Action[]): void {
  for (const action of actions) {
    switch (action.action) {
      case 'TAKE':
      case 'TAKE_PAIR':
      case 'TAKE_PORTION':
      case 'SWEEP':
        assertRouterActionRecipient(action.recipient)
        break
      default:
        break
    }
  }
}

export function validateEncodeSwaps(spec: SwapSpecification, swapSteps: SwapStep[]): void {
  invariant(swapSteps.length > 0, 'EMPTY_SWAP_STEPS')

  const recipient = spec.recipient ?? SENDER_AS_RECIPIENT
  const tokenTransferMode = spec.tokenTransferMode ?? TokenTransferMode.Permit2
  const urVersion = spec.urVersion ?? UniversalRouterVersion.V2_0

  if (tokenTransferMode === TokenTransferMode.ApproveProxy) {
    invariant(!!spec.chainId, 'PROXY_MISSING_CHAIN_ID')
    invariant(!spec.routing.inputToken.isNative, 'PROXY_NATIVE_INPUT')
    invariant(!spec.permit, 'PROXY_PERMIT_CONFLICT')
    invariant(!!spec.recipient && recipient !== SENDER_AS_RECIPIENT, 'PROXY_EXPLICIT_RECIPIENT_REQUIRED')
  }
  invariant(!(spec.routing.inputToken.isNative && spec.permit), 'NATIVE_INPUT_PERMIT')
  invariant(!(spec.fee?.kind === 'portion' && spec.tradeType !== TradeType.EXACT_INPUT), 'INVALID_PORTION_FEE_TRADE_TYPE')
  invariant(!(spec.fee?.kind === 'flat' && spec.tradeType !== TradeType.EXACT_OUTPUT), 'INVALID_FLAT_FEE_TRADE_TYPE')
  invariant(
    !(
      spec.fee?.kind === 'flat' &&
      BigNumber.from(spec.fee.amount).gt(BigNumber.from(spec.routing.amount.quotient.toString()))
    ),
    'FLAT_FEE_GT_AMOUNT'
  )

  invariant(
    !(
      spec.fee?.kind === 'portion' &&
      urVersion === UniversalRouterVersion.V2_0 &&
      !spec.fee.fee.multiply(10_000).remainder.equalTo(0)
    ),
    'FRACTIONAL_BPS_PORTION_FEE_UNSUPPORTED_ON_V2_0'
  )

  for (const step of swapSteps) {
    if (urVersion === UniversalRouterVersion.V2_0) {
      invariant(!('maxHopSlippage' in step) || step.maxHopSlippage === undefined, 'MAX_HOP_SLIPPAGE_UNSUPPORTED_ON_V2_0')
      invariant(!(step.type === 'V4_SWAP' && step.v4Actions.some(hasV4MaxHopSlippage)), 'MAX_HOP_SLIPPAGE_UNSUPPORTED_ON_V2_0')
    }

    switch (step.type) {
      case 'V2_SWAP_EXACT_IN':
      case 'V2_SWAP_EXACT_OUT':
        assertRouterRecipient(step.recipient)
        invariant(
          !step.maxHopSlippage || step.maxHopSlippage.length === step.path.length - 1,
          'V2_MAX_HOP_SLIPPAGE_LENGTH_MISMATCH'
        )
        break
      case 'V3_SWAP_EXACT_IN':
      case 'V3_SWAP_EXACT_OUT': {
        assertRouterRecipient(step.recipient)
        const hopCount = getV3HopCount(step.path)
        invariant(
          hopCount === undefined || !step.maxHopSlippage || step.maxHopSlippage.length === hopCount,
          'V3_MAX_HOP_SLIPPAGE_LENGTH_MISMATCH'
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
