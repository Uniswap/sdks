import { BigNumber } from 'ethers'
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
        if (action.maxHopSlippage && action.maxHopSlippage.length !== action.path.length) {
          throw new Error('V4_MAX_HOP_SLIPPAGE_LENGTH_MISMATCH')
        }
        break
      default:
        break
    }
  }
}

function assertRouterRecipient(recipient: string): void {
  if (recipient !== ROUTER_AS_RECIPIENT) {
    throw new Error('STEP_RECIPIENT_MUST_BE_ROUTER')
  }
}

function assertRouterActionRecipient(recipient: string): void {
  if (recipient !== ROUTER_AS_RECIPIENT) {
    throw new Error('V4_ACTION_RECIPIENT_MUST_BE_ROUTER')
  }
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
  if (swapSteps.length === 0) {
    throw new Error('EMPTY_SWAP_STEPS')
  }

  const recipient = spec.recipient ?? SENDER_AS_RECIPIENT
  const tokenTransferMode = spec.tokenTransferMode ?? TokenTransferMode.Permit2
  const urVersion = spec.urVersion ?? UniversalRouterVersion.V2_0

  if (tokenTransferMode === TokenTransferMode.ApproveProxy) {
    if (!spec.chainId) throw new Error('PROXY_MISSING_CHAIN_ID')
    if (spec.routing.inputToken.isNative) throw new Error('PROXY_NATIVE_INPUT')
    if (spec.permit) throw new Error('PROXY_PERMIT_CONFLICT')
    if (!spec.recipient || recipient === SENDER_AS_RECIPIENT) throw new Error('PROXY_EXPLICIT_RECIPIENT_REQUIRED')
  }

  if (spec.routing.inputToken.isNative && spec.permit) {
    throw new Error('NATIVE_INPUT_PERMIT')
  }

  if (spec.fee?.kind === 'portion' && spec.tradeType !== TradeType.EXACT_INPUT) {
    throw new Error('INVALID_PORTION_FEE_TRADE_TYPE')
  }

  if (spec.fee?.kind === 'flat' && spec.tradeType !== TradeType.EXACT_OUTPUT) {
    throw new Error('INVALID_FLAT_FEE_TRADE_TYPE')
  }

  if (
    spec.fee?.kind === 'flat' &&
    BigNumber.from(spec.fee.amount).gt(BigNumber.from(spec.routing.amount.quotient.toString()))
  ) {
    throw new Error('FLAT_FEE_GT_AMOUNT')
  }

  if (
    spec.fee?.kind === 'portion' &&
    urVersion === UniversalRouterVersion.V2_0 &&
    !spec.fee.fee.multiply(10_000).remainder.equalTo(0)
  ) {
    throw new Error('FRACTIONAL_BPS_PORTION_FEE_UNSUPPORTED_ON_V2_0')
  }

  for (const step of swapSteps) {
    if (urVersion === UniversalRouterVersion.V2_0) {
      if ('maxHopSlippage' in step && step.maxHopSlippage !== undefined) {
        throw new Error('MAX_HOP_SLIPPAGE_UNSUPPORTED_ON_V2_0')
      }

      if (step.type === 'V4_SWAP' && step.v4Actions.some(hasV4MaxHopSlippage)) {
        throw new Error('MAX_HOP_SLIPPAGE_UNSUPPORTED_ON_V2_0')
      }
    }

    switch (step.type) {
      case 'V2_SWAP_EXACT_IN':
      case 'V2_SWAP_EXACT_OUT':
        assertRouterRecipient(step.recipient)
        if (step.maxHopSlippage && step.maxHopSlippage.length !== step.path.length - 1) {
          throw new Error('V2_MAX_HOP_SLIPPAGE_LENGTH_MISMATCH')
        }
        break
      case 'V3_SWAP_EXACT_IN':
      case 'V3_SWAP_EXACT_OUT': {
        assertRouterRecipient(step.recipient)
        const hopCount = getV3HopCount(step.path)
        if (hopCount !== undefined && step.maxHopSlippage && step.maxHopSlippage.length !== hopCount) {
          throw new Error('V3_MAX_HOP_SLIPPAGE_LENGTH_MISMATCH')
        }
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
