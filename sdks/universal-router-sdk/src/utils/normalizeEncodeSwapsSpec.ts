import { TokenTransferMode } from '../entities/actions/uniswap'
import { Fee, FlatFee, NormalizedSwapSpecification, PortionFee, SwapSpecification } from '../types/encodeSwaps'
import { DEFAULT_UR_VERSION, SENDER_AS_RECIPIENT } from './constants'

// Fills the five optional fields that `validateEncodeSwaps` and `computeEncodeSwapsAmounts` require.
export function normalizeEncodeSwapsSpec(spec: SwapSpecification): NormalizedSwapSpecification {
  return {
    ...spec,
    recipient: spec.recipient ?? SENDER_AS_RECIPIENT,
    tokenTransferMode: spec.tokenTransferMode ?? TokenTransferMode.Permit2,
    urVersion: spec.urVersion ?? DEFAULT_UR_VERSION,
    safeMode: spec.safeMode ?? false,
    allowDirectTransfers: spec.allowDirectTransfers ?? false,
  }
}

/** A lone `Fee` becomes a one-element list, so every read site handles multiple recipients by construction. */
export function toFeeList(fee: SwapSpecification['fee']): Fee[] {
  if (!fee) return []
  return Array.isArray(fee) ? fee : [fee]
}

export function toPortionFeeList(fee: SwapSpecification['fee']): PortionFee[] {
  return toFeeList(fee).filter((entry): entry is PortionFee => entry.kind === 'portion')
}

export function toFlatFeeList(fee: SwapSpecification['fee']): FlatFee[] {
  return toFeeList(fee).filter((entry): entry is FlatFee => entry.kind === 'flat')
}
