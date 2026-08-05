import type { Address } from 'viem'
import { isAddress, isAddressEqual, zeroAddress } from 'viem'

import { isUrSentinel } from '../constants'
import { UnsupportedRouteError } from '../errors'
import { isNative, sameFamily, sameToken } from '../internal/currency'
import type { Segment } from '../internal/segment'
import { segmentCandidate } from '../internal/segment'
import { PROTOCOL_MODULES } from '../protocols'
import type { ProtocolModule } from '../protocols/types'
import type {
  ConversionOperation,
  CurrencyRef,
  Custody,
  ExecutionOperation,
  ExecutionPlan,
  Permit2PermitSingle,
  Protocol,
  QuotedRoute,
  RouteLeg,
  SwapOperation,
} from '../types'

import { assertNever, isSwapOperation, payerOf, recipientOf } from './operations'

// ---------------------------------------------------------------------------
// ExecutionPlan compiler — the custody-critical core.
//
// A QuotedRoute says which pools to trade through; it says nothing about who
// pays, who receives, or where the funds physically sit between hops. This
// module decides exactly that, and nothing else: it never encodes calldata and
// never touches RPC.
//
// The whole design rests on one idea — a *currency form*. Every group of legs
// consumes and produces a concrete form: v4 speaks 'native' directly, while
// v2/v3 can only ever hold wrapped native, so their legs are normalized into
// wrapped form when compiled. A conversion operation exists in a plan if and
// only if two adjacent forms disagree (input form vs first group, group i vs
// group i+1, last group vs tokenOut). That single rule produces the leading
// wrap for a native-input v2/v3 trade, the intermediate wrap/unwrap at a
// protocol boundary, and the trailing unwrap for a native-output v2/v3 trade —
// they are not three special cases, they are one case at three positions.
//
// Custody then falls out of the operation sequence: funds are pulled from the
// trader exactly once, into the first operation that can accept them directly
// (payer 'trader-via-permit2'), or into the router when a conversion has to
// happen first (payer 'router'). Every operation after the first is paid by
// the router, and every operation before the last delivers to the router, so
// each intermediate output has exactly one consumer — the next operation.
//
// `assertPlanInvariants` re-derives those custody properties from the finished
// plan and is always run at the end of `compileExecutionPlan`. It is exported
// so the encoder's tests (and any hand-built plan) can be held to the same
// contract: a plan that violates it is a fund-loss bug, not a formatting one.
// ---------------------------------------------------------------------------

export type CompileExecutionPlanArgs = {
  quoted: QuotedRoute
  tokenIn: CurrencyRef
  tokenOut: CurrencyRef
  trader: Address
  recipient: Address
  slippageBps: number
  permit?: Permit2PermitSingle
  wrappedNative: Address
  /** Defaults to {@link PROTOCOL_MODULES} — the real v2/v3/v4 modules — so a caller building a
   * plan from `../experimental` never has to construct this by hand. */
  modules?: Record<Protocol, ProtocolModule>
}

const BPS_DENOMINATOR = 10_000n

function currencyInOf(op: SwapOperation): CurrencyRef {
  return op.legs[0]!.currencyIn
}

function currencyOutOf(op: SwapOperation): CurrencyRef {
  return op.legs[op.legs.length - 1]!.currencyOut
}

function protocolOf(op: SwapOperation): Protocol {
  if (op.kind === 'v2-swap') return 'v2'
  if (op.kind === 'v3-swap') return 'v3'
  if (op.kind === 'v4-swap') return 'v4'
  return assertNever(op, 'swap operation kind')
}

/**
 * Rejects addresses that cannot be a real custody endpoint: UR sentinels and the zero address.
 *
 * The membership tests are `constants.ts`'s shared predicates (R5) — `router.ts` asks the same
 * question of a caller's request and used to carry its own copy of both. Only the predicate is
 * shared: this throws `UnsupportedRouteError` because it is judging a PLAN the search built, not a
 * request the caller sent, and the two stay distinguishable to callers.
 *
 * The shape check leads (R3) for the same reason it does in `router.ts`: `isAddressEqual`/
 * `isUrSentinel` throw viem's own `InvalidAddressError` on malformed input, and a compiler that
 * emitted that instead of its own error type would leak a viem class through this package's
 * documented error surface.
 */
function assertUsableAddress(address: Address, role: string): void {
  if (typeof address !== 'string' || !isAddress(address, { strict: false }))
    throw new UnsupportedRouteError(`${role} must be a valid address, got ${String(address)}`)
  if (isAddressEqual(address, zeroAddress))
    throw new UnsupportedRouteError(`${role} must be a real address, got the zero address`)
  if (isUrSentinel(address))
    throw new UnsupportedRouteError(`${role} must not be a Universal Router sentinel address (${address})`)
}

/** The concrete currency a group actually holds: v4 keeps 'native'; v2/v3 always operate wrapped. */
function formOf(currency: CurrencyRef, protocol: Protocol, wrappedNative: Address): CurrencyRef {
  if (protocol === 'v4') return currency
  return isNative(currency) ? wrappedNative : currency
}

/** Rewrites a v2/v3 leg's currencies into wrapped form so the operation is self-describing. */
function wrappedLeg(leg: RouteLeg, wrappedNative: Address): RouteLeg {
  if (!isNative(leg.currencyIn) && !isNative(leg.currencyOut)) return leg
  return {
    ...leg,
    currencyIn: isNative(leg.currencyIn) ? wrappedNative : leg.currencyIn,
    currencyOut: isNative(leg.currencyOut) ? wrappedNative : leg.currencyOut,
  }
}

type Conversion = 'wrap-native' | 'unwrap-native' | null

/**
 * The conversion needed to turn `from` into `to`, or `null` when they are already the same
 * currency. Anything that is not a native-family conversion means the route itself is broken
 * (two unrelated tokens meeting at a boundary) rather than a plan that needs an extra operation.
 */
function conversionBetween(from: CurrencyRef, to: CurrencyRef, wrappedNative: Address, context: string): Conversion {
  if (sameToken(from, to)) return null
  if (isNative(from) && sameToken(to, wrappedNative)) return 'wrap-native'
  if (isNative(to) && sameToken(from, wrappedNative)) return 'unwrap-native'
  throw new UnsupportedRouteError(`${context}: cannot convert ${String(from)} into ${String(to)}`)
}

function conversionOperation(kind: Exclude<Conversion, null>, amount: bigint | 'router-balance'): ConversionOperation {
  return { kind, amount }
}

/**
 * Compiles a quoted route into an {@link ExecutionPlan}: input acquisition, an ordered operation
 * list with explicit per-operation custody, and a single output delivery.
 *
 * Throws {@link UnsupportedRouteError} for any route or argument the closed supported set does not
 * cover — same-family `tokenIn`/`tokenOut`, an empty or discontinuous leg chain, endpoints that
 * disagree with the route, a permit on a native input, out-of-range slippage, sentinel/zero custody
 * addresses — and for any plan that fails {@link assertPlanInvariants}, which always runs last.
 */
export function compileExecutionPlan(args: CompileExecutionPlanArgs): ExecutionPlan {
  const { quoted, tokenIn, tokenOut, trader, recipient, slippageBps, permit, wrappedNative, modules = PROTOCOL_MODULES } = args
  const legs = quoted.route.legs
  const { amountIn, amountOut } = quoted.quote

  if (!Number.isInteger(slippageBps) || slippageBps < 0 || slippageBps > 10_000)
    throw new UnsupportedRouteError(`slippageBps must be an integer in [0, 10000], got ${slippageBps}`)
  if (legs.length === 0) throw new UnsupportedRouteError('cannot compile an execution plan for a route with no legs')
  if (amountIn <= 0n) throw new UnsupportedRouteError(`amountIn must be positive, got ${amountIn}`)
  if (amountOut <= 0n) throw new UnsupportedRouteError(`amountOut must be positive, got ${amountOut}`)
  if (sameFamily(tokenIn, tokenOut, wrappedNative))
    throw new UnsupportedRouteError(
      `tokenIn and tokenOut are the same currency family (${String(tokenIn)} / ${String(tokenOut)}); there is nothing to swap`,
    )
  assertUsableAddress(trader, 'trader')
  assertUsableAddress(recipient, 'recipient')

  // The route must actually be the route that was asked for, end to end. Compared family-wise:
  // a native-family endpoint may be materialized as either 'native' or the wrapped address, and
  // reconciling that is precisely what the conversion operations below are for.
  if (!sameFamily(legs[0]!.currencyIn, tokenIn, wrappedNative))
    throw new UnsupportedRouteError(`route starts at ${String(legs[0]!.currencyIn)}, not tokenIn ${String(tokenIn)}`)
  const lastLeg = legs[legs.length - 1]!
  if (!sameFamily(lastLeg.currencyOut, tokenOut, wrappedNative))
    throw new UnsupportedRouteError(`route ends at ${String(lastLeg.currencyOut)}, not tokenOut ${String(tokenOut)}`)
  for (let i = 1; i < legs.length; i++) {
    if (!sameFamily(legs[i - 1]!.currencyOut, legs[i]!.currencyIn, wrappedNative))
      throw new UnsupportedRouteError(
        `route leg ${i} starts at ${String(legs[i]!.currencyIn)} but leg ${i - 1} ends at ${String(legs[i - 1]!.currencyOut)}`,
      )
  }

  if (isNative(tokenIn) && permit)
    throw new UnsupportedRouteError('a Permit2 permit cannot be attached to a native-value input')

  // Segmentation is shared verbatim with the quoting engine, so an operation boundary is always a
  // boundary the quote was actually chained across.
  const groups: Segment[] = segmentCandidate(quoted.route).map((segment) => ({
    protocol: segment.protocol,
    legs: segment.protocol === 'v4' ? segment.legs : segment.legs.map((leg) => wrappedLeg(leg, wrappedNative)),
  }))

  const groupInput = (group: Segment): CurrencyRef => formOf(group.legs[0]!.currencyIn, group.protocol, wrappedNative)
  const groupOutput = (group: Segment): CurrencyRef =>
    formOf(group.legs[group.legs.length - 1]!.currencyOut, group.protocol, wrappedNative)

  const acquireInput: ExecutionPlan['acquireInput'] = isNative(tokenIn)
    ? { kind: 'native-value', amount: amountIn }
    : { kind: 'permit2-pull', token: tokenIn, amount: amountIn, ...(permit ? { permit } : {}) }

  const operations: ExecutionOperation[] = []

  // Leading conversion: the acquired form ('native' for a value send, the pulled token otherwise)
  // may not be the form the first group can consume. Its amount is exactly known, unlike every
  // later conversion, which operates on whatever the previous operation left in the router.
  const acquiredForm: CurrencyRef = isNative(tokenIn) ? 'native' : tokenIn
  const leading = conversionBetween(acquiredForm, groupInput(groups[0]!), wrappedNative, 'input')
  if (leading) operations.push(conversionOperation(leading, amountIn))

  // Funds can be pulled straight into the first swap only when nothing has to happen to them
  // first; a native input, or an input that needs converting, is already in the router by then.
  const firstPayer: Custody['payer'] = acquireInput.kind === 'permit2-pull' && !leading ? 'trader-via-permit2' : 'router'

  const lastGroup = groups[groups.length - 1]!
  const trailing = conversionBetween(groupOutput(lastGroup), tokenOut, wrappedNative, 'output')

  groups.forEach((group, i) => {
    const isLast = i === groups.length - 1
    const custody: Custody = {
      payer: i === 0 ? firstPayer : 'router',
      // Only the operation that produces the final currency may pay the recipient directly; when a
      // trailing conversion follows, that conversion is the one that delivers.
      recipient: isLast && !trailing ? 'final' : 'router',
    }
    operations.push(modules[group.protocol].compileOperation(group.legs, custody))
    if (isLast) return
    const between = conversionBetween(groupOutput(group), groupInput(groups[i + 1]!), wrappedNative, `group boundary ${i}`)
    if (between) operations.push(conversionOperation(between, 'router-balance'))
  })

  if (trailing) operations.push(conversionOperation(trailing, 'router-balance'))

  const plan: ExecutionPlan = {
    acquireInput,
    operations,
    deliverOutput: {
      recipient,
      currency: tokenOut,
      minAmountOut: (amountOut * (BPS_DENOMINATOR - BigInt(slippageBps))) / BPS_DENOMINATOR,
    },
  }

  assertPlanInvariants(plan, wrappedNative)
  return plan
}

/**
 * Re-derives the custody guarantees of a finished plan and throws {@link UnsupportedRouteError} on
 * the first violation. Always run at the end of {@link compileExecutionPlan}, and exported so any
 * hand-built plan handed to the encoder is held to the same contract.
 *
 * Guarantees, in order: the input pull is coherent (positive, permit matches the pulled token and
 * covers it); the output delivery is real (one delivery, to a non-sentinel non-zero address, of the
 * currency the last operation actually produces); no pool appears twice, and no pool in the plan is
 * itself the recipient; each operation's legs
 * chain and match the operation's protocol, with v2/v3 legs never holding native; exactly one
 * operation ends the plan, nothing before it delivers to the recipient, and every intermediate
 * output is consumed by the immediately following operation (single consumer, and never zero);
 * only the first operation may be paid by the trader, and only against a Permit2 pull; and every
 * wrap/unwrap sits next to an operation that genuinely needs the conversion, never next to another
 * conversion.
 *
 * `wrappedNative` tells the checks *which* ERC-20 is the wrapped native, so a conversion's
 * counterpart currency and a trailing wrap's delivered currency can be checked against it —
 * required, since both real callers (`compileExecutionPlan` below and the `ur-2.0` encoder) always
 * have it in hand.
 */
export function assertPlanInvariants(plan: ExecutionPlan, wrappedNative: Address): void {
  const { acquireInput, operations, deliverOutput } = plan

  // --- input acquisition -----------------------------------------------------------------
  if (acquireInput.amount <= 0n) throw new UnsupportedRouteError(`acquireInput.amount must be positive, got ${acquireInput.amount}`)
  if (acquireInput.kind === 'permit2-pull' && acquireInput.permit) {
    const permitted = acquireInput.permit.details
    if (!sameToken(permitted.token, acquireInput.token))
      throw new UnsupportedRouteError(`permit is for ${permitted.token} but the plan pulls ${acquireInput.token}`)
    if (permitted.amount < acquireInput.amount)
      throw new UnsupportedRouteError(`permit allows ${permitted.amount} but the plan pulls ${acquireInput.amount}`)
  }

  // --- output delivery -------------------------------------------------------------------
  if (!deliverOutput) throw new UnsupportedRouteError('plan has no deliverOutput')
  if (deliverOutput.minAmountOut < 0n)
    throw new UnsupportedRouteError(`deliverOutput.minAmountOut must not be negative, got ${deliverOutput.minAmountOut}`)
  assertUsableAddress(deliverOutput.recipient, 'deliverOutput.recipient')

  if (operations.length === 0) throw new UnsupportedRouteError('plan has no operations')
  const swaps = operations.filter(isSwapOperation)
  if (swaps.length === 0) throw new UnsupportedRouteError('plan has no swap operations')

  // --- pool uniqueness -------------------------------------------------------------------
  const seenPools = new Set<string>()
  for (const op of swaps) {
    for (const leg of op.legs) {
      const identity = leg.pool.id
      if (seenPools.has(identity)) throw new UnsupportedRouteError(`pool ${identity} appears more than once in the plan`)
      seenPools.add(identity)
    }
  }

  // --- the recipient is not one of the plan's own pools -----------------------------------
  // The request-level recipient checks (`router.ts#assertRecipientNotAContract`) can name only the
  // addresses known before a route exists — the tokens, the Universal Router, Permit2, WETH. A pool
  // address is not knowable then, and delivering a swap's output *into* a pool it just traded
  // through is a donation to that pool's LPs with no way back. The legs are in hand here, so the
  // check costs a walk over at most two of them. v4 pools have no address at all (their identity is
  // a poolId inside the PoolManager singleton), so only v2/v3 legs can collide.
  // Both sides are validated by this point: the recipient by `assertUsableAddress` above, and a
  // pool address by whichever `PoolRef` constructor built it from an ABI-decoded log or a CREATE2
  // derivation — so `isAddressEqual` is safe, and it is what makes a checksummed pool address
  // compare equal to a lowercased recipient naming the same contract.
  for (const op of swaps) {
    for (const leg of op.legs) {
      if (leg.pool.protocol === 'v4') continue
      if (isAddressEqual(leg.pool.address, deliverOutput.recipient))
        throw new UnsupportedRouteError(`recipient ${deliverOutput.recipient} is the ${leg.pool.protocol} pool this plan trades through`)
    }
  }

  // --- per-operation shape ---------------------------------------------------------------
  for (const op of swaps) {
    if (op.legs.length === 0) throw new UnsupportedRouteError(`${op.kind} operation has no legs`)
    if (op.kind === 'v2-swap' && op.legs.length !== 1)
      throw new UnsupportedRouteError(`v2 operations are single-leg; got ${op.legs.length} legs`)
    for (const leg of op.legs) {
      if (leg.pool.protocol !== protocolOf(op))
        throw new UnsupportedRouteError(`${op.kind} operation carries a ${leg.pool.protocol} leg`)
      if (op.kind !== 'v4-swap' && (isNative(leg.currencyIn) || isNative(leg.currencyOut)))
        throw new UnsupportedRouteError(`${op.kind} operations hold wrapped native only, never native`)
    }
    for (let i = 1; i < op.legs.length; i++) {
      if (!sameToken(op.legs[i - 1]!.currencyOut, op.legs[i]!.currencyIn))
        throw new UnsupportedRouteError(`${op.kind} operation legs do not chain at leg ${i}`)
    }
  }

  // --- single consumer per intermediate output -------------------------------------------
  const lastIndex = operations.length - 1
  operations.forEach((op, i) => {
    if (!isSwapOperation(op)) return
    if (recipientOf(op) === 'final' && i !== lastIndex)
      throw new UnsupportedRouteError(`operation ${i} delivers to the recipient but is not the final operation`)
    // Every intermediate output must be consumed, and by the very next operation. Directly
    // adjacent swaps must therefore agree on the currency exactly; when they do not, the earlier
    // output has *no* consumer (it is stranded in the router) and the later operation is funded by
    // nothing. Currency-mismatched neighbours that need a conversion are legal only with the
    // wrap/unwrap operation between them, which is checked further below.
    const next = operations[i + 1]
    if (next === undefined || !isSwapOperation(next)) return
    if (!sameToken(currencyOutOf(op), currencyInOf(next)))
      throw new UnsupportedRouteError(
        `operation ${i} produces ${String(currencyOutOf(op))} but operation ${i + 1} consumes ${String(currencyInOf(next))}`,
      )
  })

  const finalOp = operations[lastIndex]!
  if (isSwapOperation(finalOp)) {
    if (recipientOf(finalOp) !== 'final')
      throw new UnsupportedRouteError('the final operation leaves its output stranded in the router')
    if (!sameToken(currencyOutOf(finalOp), deliverOutput.currency))
      throw new UnsupportedRouteError(
        `the final operation produces ${String(currencyOutOf(finalOp))} but the plan delivers ${String(deliverOutput.currency)}`,
      )
  } else if (finalOp.kind === 'unwrap-native') {
    if (!isNative(deliverOutput.currency))
      throw new UnsupportedRouteError(`plan ends in an unwrap but delivers ${String(deliverOutput.currency)}`)
  } else if (isNative(deliverOutput.currency)) {
    throw new UnsupportedRouteError('plan ends in a wrap but delivers native')
  } else if (!sameToken(deliverOutput.currency, wrappedNative)) {
    // A trailing wrap can only ever produce wrapped native, so that is the only currency the plan
    // can be delivering.
    throw new UnsupportedRouteError(`plan ends in a wrap but delivers ${String(deliverOutput.currency)}, not ${wrappedNative}`)
  }

  // --- the trader pays exactly once, at the front ----------------------------------------
  operations.forEach((op, i) => {
    if (!isSwapOperation(op) || payerOf(op) !== 'trader-via-permit2') return
    if (i !== 0) throw new UnsupportedRouteError(`operation ${i} is paid by the trader but is not the first operation`)
    if (acquireInput.kind !== 'permit2-pull')
      throw new UnsupportedRouteError('an operation is paid via Permit2 but the plan does not pull via Permit2')
  })

  // --- conversions sit only where a conversion is needed ----------------------------------
  operations.forEach((op, i) => {
    if (isSwapOperation(op)) return
    if (typeof op.amount === 'bigint' && op.amount <= 0n)
      throw new UnsupportedRouteError(`${op.kind} amount must be positive, got ${op.amount}`)

    const previous = operations[i - 1]
    if (previous === undefined) {
      // A leading conversion converts whatever was just acquired: value sends can only be wrapped,
      // pulled ERC-20s (wrapped native) can only be unwrapped.
      const expected = acquireInput.kind === 'native-value' ? 'wrap-native' : 'unwrap-native'
      if (op.kind !== expected)
        throw new UnsupportedRouteError(`a leading ${op.kind} cannot follow a ${acquireInput.kind} input`)
    } else {
      if (!isSwapOperation(previous)) throw new UnsupportedRouteError(`adjacent ${previous.kind} and ${op.kind} operations`)
      if (recipientOf(previous) !== 'router')
        throw new UnsupportedRouteError(`operation ${i - 1} does not leave its output in the router for the ${op.kind}`)
      const produced = currencyOutOf(previous)
      if (op.kind === 'wrap-native' && !isNative(produced))
        throw new UnsupportedRouteError(`wrap-native follows an operation producing ${String(produced)}, not native`)
      if (op.kind === 'unwrap-native' && isNative(produced))
        throw new UnsupportedRouteError('unwrap-native follows an operation already producing native')
      if (op.kind === 'unwrap-native' && !sameToken(produced, wrappedNative))
        throw new UnsupportedRouteError(`unwrap-native follows an operation producing ${String(produced)}, not ${wrappedNative}`)
    }

    const next = operations[i + 1]
    if (next === undefined) return
    if (!isSwapOperation(next)) throw new UnsupportedRouteError(`adjacent ${op.kind} and ${next.kind} operations`)
    // `next` is router-paid by construction: it sits at index >= 1, and only operation 0 is ever
    // allowed to be trader-paid (checked above).
    const consumed = currencyInOf(next)
    if (op.kind === 'wrap-native' && isNative(consumed))
      throw new UnsupportedRouteError('wrap-native precedes an operation that consumes native')
    if (op.kind === 'wrap-native' && !sameToken(consumed, wrappedNative))
      throw new UnsupportedRouteError(`wrap-native precedes an operation consuming ${String(consumed)}, not ${wrappedNative}`)
    if (op.kind === 'unwrap-native' && !isNative(consumed))
      throw new UnsupportedRouteError(`unwrap-native precedes an operation consuming ${String(consumed)}, not native`)
  })
}
