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

// input/output currencies of a v4 swap action's delta within its command's lock
function v4SwapCurrencies(action: V4Action): { input: string; output: string } | undefined {
  switch (action.action) {
    case 'SWAP_EXACT_IN':
      return action.path.length > 0
        ? { input: action.currencyIn, output: action.path[action.path.length - 1].intermediateCurrency }
        : undefined
    case 'SWAP_EXACT_OUT':
      // exact-out paths walk from the input side, so the first hop names the input currency
      return action.path.length > 0
        ? { input: action.path[0].intermediateCurrency, output: action.currencyOut }
        : undefined
    case 'SWAP_EXACT_IN_SINGLE':
    case 'SWAP_EXACT_OUT_SINGLE':
      return action.zeroForOne
        ? { input: action.poolKey.currency0, output: action.poolKey.currency1 }
        : { input: action.poolKey.currency1, output: action.poolKey.currency0 }
    default:
      return undefined
  }
}

// credits swap-enforced output minimums that a single OPEN_DELTA take forwards to the recipient.
// sound because the v4 ledger must zero for the command to succeed: when a currency's only
// take is one OPEN_DELTA take to the recipient and nothing else in the block can consume that
// currency, any successful transaction paid the recipient everything the block's swaps produced
// of it — contract-enforced to be at least the swaps' summed minimums (order-independent: an
// early take strands later credit and reverts the lock)
function v4OpenDeltaTakeCredits(actions: V4Action[], recipient: string): DirectOutputCredit[] {
  const swapMins = new Map<string, BigNumber>()
  const takeCounts = new Map<string, number>()
  const soleOpenDeltaToRecipient = new Map<string, boolean>()
  const disqualified = new Set<string>()

  for (const action of actions) {
    switch (action.action) {
      case 'SWAP_EXACT_IN':
      case 'SWAP_EXACT_OUT':
      case 'SWAP_EXACT_IN_SINGLE':
      case 'SWAP_EXACT_OUT_SINGLE': {
        const currencies = v4SwapCurrencies(action)
        if (currencies === undefined) return [] // unparseable swap: cannot attribute deltas, credit nothing
        disqualified.add(currencies.input.toLowerCase()) // the swap consumes this currency's delta
        const min = BigNumber.from(
          action.action === 'SWAP_EXACT_IN' || action.action === 'SWAP_EXACT_IN_SINGLE'
            ? action.amountOutMinimum
            : action.amountOut
        )
        const output = currencies.output.toLowerCase()
        swapMins.set(output, (swapMins.get(output) ?? BigNumber.from(0)).add(min))
        break
      }
      case 'SETTLE':
      case 'SETTLE_ALL':
        disqualified.add(action.currency.toLowerCase())
        break
      case 'TAKE': {
        const currency = action.currency.toLowerCase()
        takeCounts.set(currency, (takeCounts.get(currency) ?? 0) + 1)
        soleOpenDeltaToRecipient.set(
          currency,
          BigNumber.from(action.amount).isZero() && action.recipient.toLowerCase() === recipient.toLowerCase()
        )
        break
      }
      case 'TAKE_ALL':
      case 'TAKE_PORTION': {
        const currency = action.currency.toLowerCase()
        takeCounts.set(currency, (takeCounts.get(currency) ?? 0) + 1)
        soleOpenDeltaToRecipient.set(currency, false)
        break
      }
      default:
        break
    }
  }

  const credits: DirectOutputCredit[] = []
  for (const [currency, min] of swapMins) {
    if (takeCounts.get(currency) === 1 && soleOpenDeltaToRecipient.get(currency) && !disqualified.has(currency)) {
      credits.push({ token: currency, minAmount: min })
    }
  }
  return credits
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
      // per-action concrete credits and the block-level OPEN_DELTA rule are disjoint:
      // an OPEN_DELTA take never produces a per-action credit
      return [
        ...step.v4Actions.flatMap((action) => v4DirectOutputCredits(action, recipient)),
        ...v4OpenDeltaTakeCredits(step.v4Actions, recipient),
      ]
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
