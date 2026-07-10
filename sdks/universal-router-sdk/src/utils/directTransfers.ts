import { BigNumber } from 'ethers'
import { SwapStep, V4Action } from '../types/encodeSwaps'

export type UserPaidPull = {
  // token the step pulls from the user; undefined when not extractable (malformed path)
  token: string | undefined
  // contract-enforced maximum the step can pull
  maxAmount: BigNumber
}

// V3 path: 20-byte address + N × (3-byte fee + 20-byte address); minimum is 43 bytes (single hop, N=1)
// Returns N or undefined if malformed
export function getV3HopCount(path: string): number | undefined {
  if (!path.startsWith('0x')) return undefined

  const byteLength = (path.length - 2) / 2
  if (byteLength < 43) return undefined

  const variableSegmentLength = byteLength - 20
  if (variableSegmentLength < 23 || variableSegmentLength % 23 !== 0) return undefined

  return variableSegmentLength / 23
}

export function v3PathFirstToken(path: string): string | undefined {
  if (getV3HopCount(path) === undefined) return undefined
  return '0x' + path.slice(2, 42)
}

export function v3PathLastToken(path: string): string | undefined {
  if (getV3HopCount(path) === undefined) return undefined
  return '0x' + path.slice(-40)
}

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

function v4UserPaidPulls(action: V4Action): UserPaidPull[] {
  switch (action.action) {
    case 'SETTLE':
      return action.payerIsUser === true ? [{ token: action.currency, maxAmount: BigNumber.from(action.amount) }] : []
    case 'SETTLE_ALL':
      // SETTLE_ALL always settles from msgSender (the user), bounded on-chain by maxAmount
      return [{ token: action.currency, maxAmount: BigNumber.from(action.maxAmount) }]
    default:
      return []
  }
}

// permit2 pulls a step can make from the user, with their contract-enforced maxima:
// exact-in pulls exactly amountIn; exact-out reverts above amountInMax
export function stepUserPaidPulls(step: SwapStep): UserPaidPull[] {
  switch (step.type) {
    case 'V2_SWAP_EXACT_IN':
      return step.payerIsUser === true ? [{ token: step.path[0], maxAmount: BigNumber.from(step.amountIn) }] : []
    case 'V2_SWAP_EXACT_OUT':
      return step.payerIsUser === true ? [{ token: step.path[0], maxAmount: BigNumber.from(step.amountInMax) }] : []
    case 'V3_SWAP_EXACT_IN':
      return step.payerIsUser === true
        ? [{ token: v3PathFirstToken(step.path), maxAmount: BigNumber.from(step.amountIn) }]
        : []
    case 'V3_SWAP_EXACT_OUT':
      // exact-out paths are encoded output-first, so the input token is the path tail
      return step.payerIsUser === true
        ? [{ token: v3PathLastToken(step.path), maxAmount: BigNumber.from(step.amountInMax) }]
        : []
    case 'V4_SWAP':
      return step.v4Actions.flatMap(v4UserPaidPulls)
    default:
      return []
  }
}

export function sumUserPaidMax(steps: SwapStep[]): BigNumber {
  return steps.flatMap(stepUserPaidPulls).reduce((total, pull) => total.add(pull.maxAmount), BigNumber.from(0))
}
