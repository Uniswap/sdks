import { BigNumber } from 'ethers'
import { SwapStep, V4Action } from '../types/encodeSwaps'
import { CONTRACT_BALANCE, ETH_ADDRESS, SENDER_AS_RECIPIENT } from './constants'

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

// SETTLE_ALL / TAKE_ALL are intrinsically direct (no flag on-chain) and are gated separately
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

// contract-enforced maxima: exact-in pulls exactly amountIn; exact-out reverts above amountInMax
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

// token-agnostic by design: validation binds every pull to the input token before this sum is
// used, so off-token pulls are rejected rather than filtered (unlike output credits below)
export function sumUserPaidMax(steps: SwapStep[]): BigNumber {
  return steps.flatMap(stepUserPaidPulls).reduce((total, pull) => total.add(pull.maxAmount), BigNumber.from(0))
}

type DirectOutputCredit = {
  token: string | undefined
  minAmount: BigNumber
}

function v4DirectOutputCredits(action: V4Action, recipient: string): DirectOutputCredit[] {
  switch (action.action) {
    case 'TAKE': {
      if (action.recipient.toLowerCase() !== recipient.toLowerCase()) return []
      const amount = BigNumber.from(action.amount)
      // OPEN_DELTA (0) / CONTRACT_BALANCE takes are runtime-sized: deliverable, but guarantee nothing
      if (amount.lte(0) || amount.gte(CONTRACT_BALANCE)) return []
      return [{ token: action.currency, minAmount: amount }]
    }
    case 'TAKE_ALL':
      // pays msgSender on-chain: counts only when the spec recipient IS the sender sentinel
      return recipient === SENDER_AS_RECIPIENT
        ? [{ token: action.currency, minAmount: BigNumber.from(action.minAmount) }]
        : []
    default:
      return []
  }
}

// contract-guaranteed amounts a step delivers directly to `recipient`
function stepDirectOutputCredits(step: SwapStep, recipient: string): DirectOutputCredit[] {
  const isDirect = 'recipient' in step && step.recipient.toLowerCase() === recipient.toLowerCase()
  switch (step.type) {
    case 'V2_SWAP_EXACT_IN':
      return isDirect ? [{ token: step.path[step.path.length - 1], minAmount: BigNumber.from(step.amountOutMin) }] : []
    case 'V2_SWAP_EXACT_OUT':
      return isDirect ? [{ token: step.path[step.path.length - 1], minAmount: BigNumber.from(step.amountOut) }] : []
    case 'V3_SWAP_EXACT_IN':
      return isDirect ? [{ token: v3PathLastToken(step.path), minAmount: BigNumber.from(step.amountOutMin) }] : []
    case 'V3_SWAP_EXACT_OUT':
      // exact-out paths are encoded output-first, so the output token is the path head
      return isDirect ? [{ token: v3PathFirstToken(step.path), minAmount: BigNumber.from(step.amountOut) }] : []
    case 'UNWRAP_WETH':
      return isDirect ? [{ token: ETH_ADDRESS, minAmount: BigNumber.from(step.amountMin) }] : []
    case 'V4_SWAP':
      return step.v4Actions.flatMap((action) => v4DirectOutputCredits(action, recipient))
    default:
      return []
  }
}

export function sumDirectOutputMin(steps: SwapStep[], recipient: string, outputTokenAddress: string): BigNumber {
  const target = outputTokenAddress.toLowerCase()
  return steps
    .flatMap((step) => stepDirectOutputCredits(step, recipient))
    .filter((credit) => credit.token !== undefined && credit.token.toLowerCase() === target)
    .reduce((total, credit) => total.add(credit.minAmount), BigNumber.from(0))
}
