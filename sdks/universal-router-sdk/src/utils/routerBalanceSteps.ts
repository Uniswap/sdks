import invariant from 'tiny-invariant'
import { BigNumber } from 'ethers'
import { CONTRACT_BALANCE, ETH_ADDRESS } from './constants'
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

// The SETTLE that funds a v4 step's input-token swaps (SETTLE_ALL is refused upstream).
export function isInputSettle(action: V4Action, tokenAddress: string): boolean {
  return action.action === 'SETTLE' && action.currency.toLowerCase() === tokenAddress
}

export function isInputSwap(action: V4Action, tokenAddress: string): boolean {
  return (
    (action.action === 'SWAP_EXACT_IN' && action.currencyIn.toLowerCase() === tokenAddress) ||
    (action.action === 'SWAP_EXACT_IN_SINGLE' && v4ActionSpendsToken(action, tokenAddress))
  )
}

function swapAmountIn(action: V4Action): BigNumber {
  return action.action === 'SWAP_EXACT_IN' || action.action === 'SWAP_EXACT_IN_SINGLE'
    ? BigNumber.from(action.amountIn)
    : BigNumber.from(0)
}

// Sum of the fixed amounts the input-spending swaps take, or the settle amount when the
// plan funds them with a single concrete settle. Zero when nothing concrete is present
// (sentinels / open-delta), which the split logic treats as "not comparable".
function v4StepSpendAmount(actions: V4Action[], tokenAddress: string): BigNumber {
  const settle = actions.find((action) => isInputSettle(action, tokenAddress))
  if (settle && settle.action === 'SETTLE') {
    const amount = BigNumber.from(settle.amount)
    if (amount.gt(0) && !amount.eq(CONTRACT_BALANCE)) {
      return amount
    }
  }
  return actions
    .filter((action) => isInputSwap(action, tokenAddress))
    .reduce((total, action) => total.add(swapAmountIn(action)), BigNumber.from(0))
}

function applyToV4Actions(actions: V4Action[], tokenAddress: string): V4Action[] {
  const hasInputSettle = actions.some((action) => isInputSettle(action, tokenAddress))

  // The settle that funds the swaps now takes the router's whole balance. Caller order is
  // preserved, so validateEncodeSwaps requires that settle to precede the input swaps.
  const settled: V4Action[] = actions.map((action) =>
    isInputSettle(action, tokenAddress)
      ? { ...action, amount: CONTRACT_BALANCE.toString(), payerIsUser: false }
      : action
  )

  // Exactly one input swap may consume the open delta (amountIn 0). With several input
  // swaps (a split inside the step) the others keep their quoted slices and the remainder
  // moves after them, so it absorbs the delivery variance and the fixed slices are never
  // starved. A plan that already nominates its remainder (GuideStar writes intermediate
  // steps that way) keeps that one rather than gaining a second.
  const swapIndexes = settled
    .map((action, index) => (isInputSwap(action, tokenAddress) ? index : -1))
    .filter((index) => index >= 0)
  const openDeltaIndexes = swapIndexes.filter((index) => swapAmountIn(settled[index]).isZero())
  invariant(openDeltaIndexes.length <= 1, 'ROUTER_BALANCE_INPUT_MULTIPLE_OPEN_DELTA_SWAPS')

  let transformed: V4Action[] = settled
  if (swapIndexes.length === 1) {
    transformed = settled.map((action, index) => (index === swapIndexes[0] ? { ...action, amountIn: 0 } : action))
  } else if (swapIndexes.length > 1) {
    let remainderIndex = openDeltaIndexes[0] ?? swapIndexes[0]
    if (openDeltaIndexes.length === 0) {
      for (const index of swapIndexes) {
        if (swapAmountIn(settled[index]).gt(swapAmountIn(settled[remainderIndex]))) {
          remainderIndex = index
        }
      }
    }
    const remainder: V4Action = { ...settled[remainderIndex], amountIn: 0 } as V4Action
    const lastSwapIndex = swapIndexes[swapIndexes.length - 1]
    const reordered: V4Action[] = []
    settled.forEach((action, index) => {
      if (index === remainderIndex) {
        return
      }
      reordered.push(action)
      if (
        index === lastSwapIndex ||
        (lastSwapIndex === remainderIndex && index === swapIndexes[swapIndexes.length - 2])
      ) {
        reordered.push(remainder)
      }
    })
    transformed = reordered
  }

  const result = hasInputSettle
    ? transformed
    : // No settle in the plan (addTrade-style shapes): fund the open delta explicitly.
      [
        {
          action: 'SETTLE',
          currency: tokenAddress,
          amount: CONTRACT_BALANCE.toString(),
          payerIsUser: false,
        } as V4Action,
        ...transformed,
      ]

  // Two swaps consuming the same open delta means the first takes it all and the second
  // gets nothing, which encodes cleanly and reverts on chain.
  invariant(
    result.filter((action) => isInputSwap(action, tokenAddress) && swapAmountIn(action).isZero()).length === 1,
    'ROUTER_BALANCE_INPUT_OPEN_DELTA_NOT_UNIQUE'
  )
  return result
}

// The router holds the funds, so no leg of a spender step may pull from the user: a
// payerIsUser flag left over from a wallet-mode plan would encode as
// permit2.transferFrom(msg.sender) on-chain, and on this arm msg.sender is the filler,
// not the swapper. EVERY settle in the step is cleared, not just the one funding the
// input token: a v4 step can carry a second settle in an unrelated currency, which is
// not the input token and so was previously left holding its flag while the step-level
// validator waiver excused the whole step. Amounts are left untouched; this is used for
// the fixed legs of a split.
function clearPayerIsUser(step: SwapStep): SwapStep {
  switch (step.type) {
    case 'V2_SWAP_EXACT_IN':
    case 'V3_SWAP_EXACT_IN':
      return { ...step, payerIsUser: false }
    case 'V4_SWAP':
      return {
        ...step,
        v4Actions: step.v4Actions.map((action) =>
          action.action === 'SETTLE' ? { ...action, payerIsUser: false } : action
        ),
      }
    default:
      // validateEncodeSwaps refuses exact-out and unexpected shapes before this runs
      invariant(false, 'ROUTER_BALANCE_INPUT_UNSUPPORTED_STEP')
  }
}

function rewriteSpendingStep(step: SwapStep, tokenAddress: string): SwapStep {
  const cleared = clearPayerIsUser(step)
  switch (cleared.type) {
    case 'V2_SWAP_EXACT_IN':
    case 'V3_SWAP_EXACT_IN':
      return { ...cleared, amountIn: CONTRACT_BALANCE.toString() }
    case 'V4_SWAP':
      return { ...cleared, v4Actions: applyToV4Actions(cleared.v4Actions, tokenAddress) }
    default:
      invariant(false, 'ROUTER_BALANCE_INPUT_UNSUPPORTED_STEP')
  }
}

// The remainder leg of a split: the largest spender by input amount, which absorbs all
// delivery variance. A v4 leg's spend is read from its input settle (or the sum of its
// input swaps); a leg with no concrete amount cannot be compared and is refused.
function stepSpendAmount(step: SwapStep, tokenAddress: string): BigNumber {
  switch (step.type) {
    case 'V2_SWAP_EXACT_IN':
    case 'V3_SWAP_EXACT_IN':
      return BigNumber.from(step.amountIn)
    case 'V4_SWAP':
      return v4StepSpendAmount(step.v4Actions, tokenAddress)
    default:
      return BigNumber.from(0)
  }
}

function pickRemainderIndex(swapSteps: SwapStep[], spenderIndexes: number[], tokenAddress: string): number {
  let remainderIndex = spenderIndexes[0]
  let remainderAmount = BigNumber.from(-1)
  for (const index of spenderIndexes) {
    const amount = stepSpendAmount(swapSteps[index], tokenAddress)
    invariant(amount.gt(0) && !amount.eq(CONTRACT_BALANCE), 'ROUTER_BALANCE_INPUT_SPLIT_LEG_AMOUNT_UNKNOWN')
    if (amount.gt(remainderAmount)) {
      remainderAmount = amount
      remainderIndex = index
    }
  }
  return remainderIndex
}

// The unwrap converts the delivered pot to ETH, so the greedy claim moves to the leg
// spending that ETH; the WETH legs keep their quoted amounts from router custody.
function applyUnwrapBoundaryRemainder(swapSteps: SwapStep[], unwrapIndex: number, tokenAddress: string): SwapStep[] {
  const nativeSpenders = swapSteps
    .map((step, index) => (index > unwrapIndex && stepSpendsToken(step, ETH_ADDRESS) ? index : -1))
    .filter((index) => index >= 0)
  invariant(nativeSpenders.length > 0, 'ROUTER_BALANCE_INPUT_UNWRAP_WITHOUT_NATIVE_LEG')
  invariant(nativeSpenders.length === 1, 'ROUTER_BALANCE_INPUT_UNWRAP_MULTIPLE_NATIVE_LEGS')

  return swapSteps.map((step, index) => {
    if (index === nativeSpenders[0]) {
      return rewriteSpendingStep(step, ETH_ADDRESS)
    }
    return stepSpendsToken(step, tokenAddress) ? clearPayerIsUser(step) : step
  })
}

/**
 * Rewrites a step plan to spend the router's entire input-token balance.
 *
 * Single spender: its v2/v3 exact-in amount becomes the CONTRACT_BALANCE
 * sentinel (a v4 spender settles CONTRACT_BALANCE; one of its input swaps
 * consumes the open delta while any others keep their quoted slices).
 *
 * Split routes (multiple spenders of the input token): every spender but the
 * largest keeps its quoted amount, funded from router custody; the largest is
 * rewritten to CONTRACT_BALANCE and MOVED after the other spenders, so it
 * absorbs all delivery variance and the fill only reverts when delivery
 * cannot cover the fixed legs.
 */
export function applyRouterBalanceInputToSteps(
  swapSteps: SwapStep[],
  inputTokenAddress: string,
  wrappedNativeAddress?: string
): SwapStep[] {
  const tokenAddress = inputTokenAddress.toLowerCase()

  // UNWRAP_WETH takes the router's whole WETH balance, so with WETH delivered it is
  // already the greedy claim and the legs before it stay fixed.
  const unwrapIndex = swapSteps.findIndex((step) => step.type === 'UNWRAP_WETH')
  if (unwrapIndex >= 0 && tokenAddress === wrappedNativeAddress?.toLowerCase()) {
    return applyUnwrapBoundaryRemainder(swapSteps, unwrapIndex, tokenAddress)
  }

  const spenderIndexes = swapSteps
    .map((step, index) => (stepSpendsToken(step, tokenAddress) ? index : -1))
    .filter((index) => index >= 0)
  invariant(spenderIndexes.length > 0, 'ROUTER_BALANCE_INPUT_FIRST_STEP')

  if (spenderIndexes.length === 1) {
    return swapSteps.map((step, index) =>
      index === spenderIndexes[0] ? rewriteSpendingStep(step, tokenAddress) : step
    )
  }

  const remainderIndex = pickRemainderIndex(swapSteps, spenderIndexes, tokenAddress)
  const remainder = rewriteSpendingStep(swapSteps[remainderIndex], tokenAddress)
  const lastSpenderIndex = spenderIndexes[spenderIndexes.length - 1]

  const reordered: SwapStep[] = []
  swapSteps.forEach((step, index) => {
    if (index === remainderIndex) {
      return
    }
    // fixed legs keep their quoted amounts but are funded from router custody too
    reordered.push(spenderIndexes.includes(index) ? clearPayerIsUser(step) : step)
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
