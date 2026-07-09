import { SwapStep } from '../types/encodeSwaps'

// true when the step carries an explicit payerIsUser=true (V2/V3 swaps or a v4 SETTLE).
// SETTLE_ALL / TAKE_ALL are intrinsically direct (no flag on-chain) and are gated separately.
export function hasUserPaidFlag(step: SwapStep): boolean {
  switch (step.type) {
    case 'V2_SWAP_EXACT_IN':
    case 'V2_SWAP_EXACT_OUT':
    case 'V3_SWAP_EXACT_IN':
    case 'V3_SWAP_EXACT_OUT':
      return step.payerIsUser === true
    case 'V4_SWAP':
      return step.v4Actions.some((a) => a.action === 'SETTLE' && a.payerIsUser === true)
    default:
      return false
  }
}
