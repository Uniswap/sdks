import invariant from 'tiny-invariant'
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

/**
 * Rewrites the first hop of a step plan to spend the router's entire input-token balance:
 * v2/v3 exact-in amounts become the CONTRACT_BALANCE sentinel; a v4 first step settles
 * CONTRACT_BALANCE and swaps the resulting open delta. Later hops already chain through
 * CONTRACT_BALANCE / open deltas, so only the input-spending step changes.
 *
 * `validateEncodeSwaps` guarantees exactly one step spends the input token and that it is
 * the first step, so this only ever rewrites `steps[0]`.
 */
export function applyRouterBalanceInputToSteps(swapSteps: SwapStep[], inputTokenAddress: string): SwapStep[] {
  const tokenAddress = inputTokenAddress.toLowerCase()
  const first = swapSteps[0]
  invariant(first !== undefined && stepSpendsToken(first, tokenAddress), 'ROUTER_BALANCE_INPUT_FIRST_STEP')

  return [rewriteSpendingStep(first, tokenAddress), ...swapSteps.slice(1)]
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
  const tokenAddress = wrappedTokenAddress.toLowerCase()
  const wrap = swapSteps[0]
  invariant(wrap !== undefined && wrap.type === 'WRAP_ETH', 'ROUTER_BALANCE_INPUT_NATIVE_REQUIRES_WRAP')

  const spenderIndex = swapSteps.findIndex((step, index) => index > 0 && stepSpendsToken(step, tokenAddress))
  invariant(spenderIndex > 0, 'ROUTER_BALANCE_INPUT_FIRST_STEP')

  return swapSteps.map((step, index) => {
    if (index === 0) {
      return { ...wrap, amount: CONTRACT_BALANCE.toString() }
    }
    if (index === spenderIndex) {
      return rewriteSpendingStep(step, tokenAddress)
    }
    return step
  })
}
