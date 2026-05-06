import { TokenTransferMode } from '../entities/actions/uniswap'
import { NormalizedSwapSpecification, SwapSpecification } from '../types/encodeSwaps'
import { SENDER_AS_RECIPIENT, UniversalRouterVersion } from './constants'

// Fills the four optional fields that `validateEncodeSwaps` and `computeEncodeSwapsAmounts` require.
export function normalizeEncodeSwapsSpec(spec: SwapSpecification): NormalizedSwapSpecification {
  return {
    ...spec,
    recipient: spec.recipient ?? SENDER_AS_RECIPIENT,
    tokenTransferMode: spec.tokenTransferMode ?? TokenTransferMode.Permit2,
    urVersion: spec.urVersion ?? UniversalRouterVersion.V2_0,
    safeMode: spec.safeMode ?? false,
  }
}
