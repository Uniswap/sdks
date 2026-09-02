import invariant from 'tiny-invariant'
import { BigNumber } from 'ethers'
import { CONTRACT_BALANCE } from './constants'
import { SwapStep, V4Action } from '../types/encodeSwaps'

function v4ActionSpendsToken(action: V4Action, tokenAddress: string): boolean {
  switch (action.action) {
    case 'SETTLE':
    case 'SETTLE_ALL':
      return action.currency.toLowerCase() === tokenAddress
    case 'SWAP_EXACT_IN':
      return action.currencyIn.toLowerCase() === tokenAddress
    case 'SWAP_EXACT_IN_SINGLE': {
      const spent = action.zeroForOne ? action.poolKey.currency0 : action.poolKey.currency1
      return spent.toLowerCase() === tokenAddress
    }
    default:
      return false
  }
}

// Whether a step draws the trade's input token, i.e. is a candidate first hop.
export function stepSpendsToken(step: SwapStep, inputTokenAddress: string): boolean {
  const tokenAddress = inputTokenAddress.toLowerCase()
  switch (step.type) {
    case 'V2_SWAP_EXACT_IN':
      return step.path[0]?.toLowerCase() === tokenAddress
    case 'V3_SWAP_EXACT_IN':
      // v3 exact-in paths are encoded input-first: the first 20 bytes are the input token
      return step.path.slice(0, 42).toLowerCase() === tokenAddress
    case 'V4_SWAP':
      return step.v4Actions.some((action) => v4ActionSpendsToken(action, tokenAddress))
    default:
      return false
  }
}

function applyToV4Actions(actions: V4Action[], tokenAddress: string): V4Action[] {
  const hasInputSettle = actions.some(
    (action) => action.action === 'SETTLE' && action.currency.toLowerCase() === tokenAddress
  )

  const transformed: V4Action[] = actions.map((action) => {
    // The settle that funds the swap now takes the router's whole balance.
    if (action.action === 'SETTLE' && action.currency.toLowerCase() === tokenAddress) {
      return { ...action, amount: CONTRACT_BALANCE.toString(), payerIsUser: false }
    }
    // With the settle sized by CONTRACT_BALANCE, the swap consumes the open delta.
    if (action.action === 'SWAP_EXACT_IN' && action.currencyIn.toLowerCase() === tokenAddress) {
      return { ...action, amountIn: 0 }
    }
    if (action.action === 'SWAP_EXACT_IN_SINGLE' && v4ActionSpendsToken(action, tokenAddress)) {
      return { ...action, amountIn: 0 }
    }
    return action
  })

  if (hasInputSettle) {
    return transformed
  }
  // No settle in the plan (addTrade-style shapes): fund the open delta explicitly.
  return [
    { action: 'SETTLE', currency: tokenAddress, amount: CONTRACT_BALANCE.toString(), payerIsUser: false },
    ...transformed,
  ]
}

function rewriteSpendingStep(step: SwapStep, tokenAddress: string): SwapStep {
  switch (step.type) {
    case 'V2_SWAP_EXACT_IN':
    case 'V3_SWAP_EXACT_IN':
      return { ...step, amountIn: CONTRACT_BALANCE.toString() }
    case 'V4_SWAP':
      return { ...step, v4Actions: applyToV4Actions(step.v4Actions, tokenAddress) }
    default:
      // validateEncodeSwaps refuses exact-out and unexpected shapes before this runs
      invariant(false, 'ROUTER_BALANCE_INPUT_UNSUPPORTED_STEP')
  }
}

// The remainder leg of a split: the largest spender by amountIn, which
// absorbs all delivery variance. V4 spenders are refused in splits (their
// spend amount lives in settle/open-delta actions, not a comparable field).
function pickRemainderIndex(swapSteps: SwapStep[], spenderIndexes: number[]): number {
  let remainderIndex = spenderIndexes[0]
  let remainderAmount = BigNumber.from(-1)
  for (const index of spenderIndexes) {
    const step = swapSteps[index]
    invariant(
      step.type === 'V2_SWAP_EXACT_IN' || step.type === 'V3_SWAP_EXACT_IN',
      'ROUTER_BALANCE_INPUT_V4_SPLIT_UNSUPPORTED'
    )
    const amount = BigNumber.from(step.amountIn)
    if (amount.gt(remainderAmount)) {
      remainderAmount = amount
      remainderIndex = index
    }
  }
  return remainderIndex
}

/**
 * Rewrites a step plan to spend the router's entire input-token balance.
 *
 * Single spender: its v2/v3 exact-in amount becomes the CONTRACT_BALANCE
 * sentinel (a v4 spender settles CONTRACT_BALANCE and swaps the open delta).
 *
 * Split routes (multiple spenders of the input token): every spender but the
 * largest keeps its quoted amount, funded from router custody; the largest is
 * rewritten to CONTRACT_BALANCE and MOVED after the other spenders, so it
 * absorbs all delivery variance and the fill only reverts when delivery
 * cannot cover the fixed legs.
 */
export function applyRouterBalanceInputToSteps(swapSteps: SwapStep[], inputTokenAddress: string): SwapStep[] {
  const tokenAddress = inputTokenAddress.toLowerCase()
  const spenderIndexes = swapSteps
    .map((step, index) => (stepSpendsToken(step, tokenAddress) ? index : -1))
    .filter((index) => index >= 0)
  invariant(spenderIndexes.length > 0, 'ROUTER_BALANCE_INPUT_FIRST_STEP')

  if (spenderIndexes.length === 1) {
    return swapSteps.map((step, index) =>
      index === spenderIndexes[0] ? rewriteSpendingStep(step, tokenAddress) : step
    )
  }

  const remainderIndex = pickRemainderIndex(swapSteps, spenderIndexes)
  const remainder = rewriteSpendingStep(swapSteps[remainderIndex], tokenAddress)
  const lastSpenderIndex = spenderIndexes[spenderIndexes.length - 1]

  const reordered: SwapStep[] = []
  swapSteps.forEach((step, index) => {
    if (index === remainderIndex) {
      return
    }
    reordered.push(step)
    // insert the remainder right after the last other spender
    if (
      index === lastSpenderIndex ||
      (lastSpenderIndex === remainderIndex && index === spenderIndexes[spenderIndexes.length - 2])
    ) {
      reordered.push(remainder)
    }
  })
  return reordered
}

/**
 * Native-input variant: the plan leads with the route's WRAP_ETH, which is resized to wrap
 * the router's entire native balance (attached msg.value plus any stray ETH, so no value
 * is left behind — UR never refunds msg.value); the wrapped-token hop that follows then
 * spends CONTRACT_BALANCE like an ERC20 balance swap.
 *
 * `validateEncodeSwaps` guarantees steps[0] is a router-recipient WRAP_ETH and exactly one
 * later step spends the wrapped token.
 */
export function applyNativeRouterBalanceInputToSteps(swapSteps: SwapStep[], wrappedTokenAddress: string): SwapStep[] {
  const wrap = swapSteps[0]
  invariant(wrap !== undefined && wrap.type === 'WRAP_ETH', 'ROUTER_BALANCE_INPUT_NATIVE_REQUIRES_WRAP')

  // After the full wrap, the plan is an ordinary (possibly split) balance swap
  // of the wrapped token.
  return [
    { ...wrap, amount: CONTRACT_BALANCE.toString() },
    ...applyRouterBalanceInputToSteps(swapSteps.slice(1), wrappedTokenAddress),
  ]
}
