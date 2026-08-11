import { expect, test } from 'bun:test'
import type { Address, Hex } from 'viem'
import { zeroHash } from 'viem'

import { PREFLIGHT_TOP_K } from '../constants'
import { rateLimitHttpError } from '../internal/testing'
import { PROTOCOL_MODULES, routeId } from '../protocols'
import { v2PoolRef as v2Ref } from '../protocols/poolRef'
import type { BlockRef, ChainManifest, ExecutionRequirement, QuotedRoute, RankedRoute, SwapRequest } from '../types'

import { createNotifier } from './notify'
import type { Notifier } from './notify'
import { applyAbort, applyReadiness, createState } from './state'
import type { SearchState } from './state'
import { Verifier, pickLeader, withExecution } from './verifier'
import type { VerifierCtx } from './verifier'

// ---------------------------------------------------------------------------
// The verifier's behavioral suite. The first half is the port of
// `leader.test.ts` (the C4-T1 mutation-audit kills M4/M9/M10) onto the new
// driving surface: build a `SearchState`, settle readiness, call `consider`,
// await the wake poke that a settling preflight produces.
//
// The second half is what only the concurrent shape can get wrong: one
// preflight in flight at a time, a leader change during flight queueing the
// NEWEST leader (not a backlog), and a preflight budget that is now per SEARCH
// and therefore spans many `consider()` rounds.
// ---------------------------------------------------------------------------

const WETH = `0x${'ee'.repeat(20)}` as Address
const TOKEN_A = `0x${'aa'.repeat(20)}` as Address
const TOKEN_B = `0x${'bb'.repeat(20)}` as Address
const TRADER = `0x${'11'.repeat(20)}` as Address
const UR = `0x${'22'.repeat(20)}` as Address
const PERMIT2 = `0x${'33'.repeat(20)}` as Address

const BLOCK: BlockRef = { number: 1_000n, hash: zeroHash, timestamp: 1_700_000_000n }

function poolAt(tagByte: string): ReturnType<typeof v2Ref> {
  return v2Ref(`0x${tagByte.repeat(20)}` as Address, TOKEN_A, TOKEN_B)
}

function routeAt(tagByte: string): QuotedRoute['route'] {
  return { legs: [{ pool: poolAt(tagByte), currencyIn: TOKEN_A, currencyOut: TOKEN_B }] }
}

function rankedAt(tagByte: string, execution: RankedRoute['execution']): RankedRoute {
  return {
    route: routeAt(tagByte),
    quote: { amountIn: 1000n, amountOut: 900n, intermediateAmounts: [] },
    execution,
  }
}

function quotedAt(tagByte: string): QuotedRoute {
  return { route: routeAt(tagByte), quote: { amountIn: 1000n, amountOut: 900n, intermediateAmounts: [] } }
}

function manifest(): ChainManifest {
  return {
    chainId: 1,
    wrappedNative: WETH,
    execution: { address: UR, commandSet: 'ur-2.0', permit2: PERMIT2, wrappedNative: WETH },
  }
}

// ---------------------------------------------------------------------------
// M4: pickLeader's middle `??` clause — the first non-failed candidate when the
// verifier has established no leader. Deleting that clause (falling straight
// through to `evaluated[0]`) is a mutant the pre-existing suite does not catch.
// ---------------------------------------------------------------------------

test('pickLeader: no leaderId -> the first non-failed candidate leads, not evaluated[0] (M4)', () => {
  const failed = rankedAt('11', 'failed')
  const unverified = rankedAt('22', 'unverified')
  const verified = rankedAt('33', 'verified')
  const evaluated = [failed, unverified, verified]

  // evaluated[0] IS the failed one — a mutant that fell through to it instead of skipping past
  // `failed` candidates would pick `failed` here, which this asserts against by identity.
  expect(pickLeader(evaluated, undefined)).toBe(unverified)
})

test('pickLeader: a leaderId hit always wins, whatever its execution status', () => {
  const failed = rankedAt('11', 'failed')
  const verified = rankedAt('22', 'verified')
  const evaluated = [failed, verified]

  expect(pickLeader(evaluated, routeId(failed.route))).toBe(failed)
})

test('pickLeader: every candidate failed -> falls back to evaluated[0]', () => {
  const first = rankedAt('11', 'failed')
  const second = rankedAt('22', 'failed')

  expect(pickLeader([first, second], undefined)).toBe(first)
})

// ---------------------------------------------------------------------------
// The driving harness
// ---------------------------------------------------------------------------

type Harness = { state: SearchState; wake: Notifier; verifier: Verifier }

/** A search state with readiness already settled (the loop's ordering guarantee), plus a verifier
 * over it. `readiness: false` builds the pre-readiness state the gate must reject. */
function harness(
  client: VerifierCtx['client'],
  opts: {
    requirements?: ExecutionRequirement[]
    degraded?: boolean
    readiness?: boolean
    recording?: boolean
    req?: SwapRequest
    modules?: VerifierCtx['modules']
  } = {},
): Harness {
  const state = createState(BLOCK, false, opts.recording)
  if (opts.readiness !== false) {
    applyReadiness(state, { requirements: opts.requirements ?? [], degraded: opts.degraded ?? false })
  }
  const wake = createNotifier()
  const req: SwapRequest = opts.req ?? { tokenIn: TOKEN_A, tokenOut: TOKEN_B, amountIn: 1000n, trader: TRADER }
  const verifier = new Verifier({
    state,
    ctx: { client, manifest: manifest(), modules: opts.modules ?? PROTOCOL_MODULES },
    req,
    wake,
  })
  return { state, wake, verifier }
}

function revertError(data: Hex = '0xdeadbeef'): Error {
  return Object.assign(new Error('execution reverted'), { data })
}

/** Answers every preflight `eth_call` from a script, one entry per call, and counts them. */
function scriptedClient(script: (call: number) => void): { client: VerifierCtx['client']; calls: () => number } {
  let calls = 0
  const client = {
    async request(args: any) {
      if (args.method !== 'eth_call') throw new Error(`unexpected RPC call ${String(args.method)}`)
      if ((args.params[0].to as string).toLowerCase() !== UR.toLowerCase()) throw new Error('preflight must target the router')
      script(calls++)
      return '0x'
    },
  } as unknown as VerifierCtx['client']
  return { client, calls: () => calls }
}

/** A client whose calls hang until the test settles them by hand — the only way to hold a preflight
 * in flight across a second `consider()`. */
function deferredClient(): {
  client: VerifierCtx['client']
  inFlight: { resolve: () => void; reject: (err: unknown) => void }[]
} {
  const inFlight: { resolve: () => void; reject: (err: unknown) => void }[] = []
  const client = {
    async request(args: any) {
      if (args.method !== 'eth_call') throw new Error(`unexpected RPC call ${String(args.method)}`)
      await new Promise<void>((resolve, reject) => {
        inFlight.push({ resolve, reject })
      })
      return '0x'
    },
  } as unknown as VerifierCtx['client']
  return { client, inFlight }
}

const tick = (): Promise<void> => new Promise<void>((resolve) => setTimeout(resolve, 0))

const statusOf = (state: SearchState, quoted: QuotedRoute): RankedRoute['execution'] =>
  withExecution(state, quoted).execution

// ---------------------------------------------------------------------------
// M9 / M10: the two `readinessDegraded` guards. Both mutants (deleting either)
// leave the rest of the suite green — a requirement list built from incomplete
// reads must never be promised as `needs-action`, and a preflight revert with
// the trader's funding state partly unread must never be blamed on the route.
// ---------------------------------------------------------------------------

test('degraded readiness + would-be-needs-action never promotes it — the route stays unverified (M9)', () => {
  // Compiling+encoding is pure computation; requirements short-circuit verification before any RPC,
  // so this client asserts the RPC-free path by throwing on any call it receives.
  const client: VerifierCtx['client'] = {
    request: async () => {
      throw new Error('must never reach RPC: a non-empty requirement list short-circuits verification')
    },
  } as VerifierCtx['client']
  const requirements: ExecutionRequirement[] = [
    { kind: 'erc20-approval', token: TOKEN_A, spender: PERMIT2, minimumAmount: 1_000n },
  ]
  const { state, verifier } = harness(client, { requirements, degraded: true })
  const quoted = quotedAt('44')

  verifier.consider([quoted])

  // Under the M9 mutant (the `state.readinessDegraded` guard deleted), this would be 'needs-action'.
  expect(statusOf(state, quoted)).toBe('unverified')
  expect(state.execution.has(routeId(quoted.route))).toBe(false) // no status was WRITTEN at all
  expect(state.requirements).toEqual(requirements)
  // Still compiled and handed back, per the verifier's own header.
  expect(state.compiledById.get(routeId(quoted.route))?.tx).toBeDefined()
  expect(verifier.leaderId()).toBe(routeId(quoted.route))
  expect(verifier.idle()).toBe(true)
  expect(state.verification.preflightAttempted).toBe(0)
})

test('degraded readiness + a preflight revert stays unverified, never failed (M10)', async () => {
  const { client } = scriptedClient(() => {
    throw revertError()
  })
  const { state, wake, verifier } = harness(client, { degraded: true })
  const quoted = quotedAt('44')

  verifier.consider([quoted])
  await wake.next()

  // Under the M10 mutant (the `readinessDegraded` guard before the `failed` write deleted), this
  // would be 'failed' with `revertData: '0xdeadbeef'`.
  expect(statusOf(state, quoted)).toBe('unverified')
  expect(withExecution(state, quoted).revertData).toBeUndefined()
  // The simulation RAN — a real round trip, so it costs a real slot of the budget.
  expect(state.verification.preflightAttempted).toBe(1)
})

test('control: the SAME preflight revert, WITHOUT degraded readiness, is authoritatively failed', async () => {
  const { client } = scriptedClient(() => {
    throw revertError()
  })
  const { state, wake, verifier } = harness(client)
  const quoted = quotedAt('44')

  verifier.consider([quoted])
  await wake.next()

  expect(statusOf(state, quoted)).toBe('failed')
  expect(withExecution(state, quoted).revertData).toBe('0xdeadbeef')
  expect(state.verificationDegraded).toBe(false)
})

// ---------------------------------------------------------------------------
// The rest of the ported rules: needs-action, transport, compile failure,
// the verified short-circuit.
// ---------------------------------------------------------------------------

test('requirements short-circuit verification: needs-action, no simulation, tx still compiled', () => {
  const client: VerifierCtx['client'] = {
    request: async () => {
      throw new Error('must never reach RPC')
    },
  } as VerifierCtx['client']
  const requirements: ExecutionRequirement[] = [
    { kind: 'erc20-approval', token: TOKEN_A, spender: PERMIT2, minimumAmount: 1_000n },
  ]
  const { state, verifier } = harness(client, { requirements })
  const quoted = quotedAt('44')

  verifier.consider([quoted])

  expect(statusOf(state, quoted)).toBe('needs-action')
  expect(state.compiledById.get(routeId(quoted.route))?.tx).toBeDefined()
  // The readiness gate's verdict is decided without a round trip, so it spends no budget.
  expect(state.verification.preflightAttempted).toBe(0)
  expect(state.verification.preflightBudgetExhausted).toBe(false)
})

test('a settled verdict is not re-derived every round: one needs-action leader, one outcome', () => {
  const client: VerifierCtx['client'] = {
    request: async () => {
      throw new Error('must never reach RPC')
    },
  } as unknown as VerifierCtx['client']
  const requirements: ExecutionRequirement[] = [
    { kind: 'erc20-approval', token: TOKEN_A, spender: PERMIT2, minimumAmount: 1_000n },
  ]
  const { state, verifier } = harness(client, { requirements, recording: true })
  const quoted = quotedAt('44')

  // The loop calls `consider` on every cycle; a gated leader must not append an outcome per cycle.
  verifier.consider([quoted])
  verifier.consider([quoted])
  verifier.consider([quoted])

  expect(state.outcomeLog).toEqual([
    { t: 'readiness', r: { requirements, degraded: false } },
    { t: 'preflight', routeId: routeId(quoted.route), o: { kind: 'needs-action' } },
  ])
  expect(verifier.leaderId()).toBe(routeId(quoted.route))
})

test('a transport loss leaves the route unverified and degrades the search, and the budget moves on', async () => {
  const { client, calls } = scriptedClient((call) => {
    if (call === 0) throw rateLimitHttpError()
    throw revertError('0xbeef')
  })
  const { state, wake, verifier } = harness(client)
  const first = quotedAt('44')
  const second = quotedAt('55')

  verifier.consider([first, second])
  await wake.next()

  expect(statusOf(state, first)).toBe('unverified')
  expect(state.verificationDegraded).toBe(true)
  expect(state.verification.preflightAttempted).toBe(1)

  // The fall-through: the next round passes OVER the candidate whose call was lost (nothing was
  // learned about it, and re-asking a provider that just refused is a retry aimed at it) and spends
  // the next slot on the route behind it.
  verifier.consider([first, second])
  await wake.next()

  expect(calls()).toBe(2)
  expect(statusOf(state, second)).toBe('failed')
  expect(statusOf(state, first)).toBe('unverified')
})

test('an uncompilable route fails at zero budget cost and names its reason', () => {
  const client: VerifierCtx['client'] = {
    request: async () => {
      throw new Error('a compile failure must never reach preflight')
    },
  } as VerifierCtx['client']
  const bad = quotedAt('44')
  // The recipient is the route's own pool — `assertPlanInvariants` rejects that with a named
  // `UnsupportedRouteError`, which is a business outcome about this candidate, not a bug.
  const req: SwapRequest = {
    tokenIn: TOKEN_A,
    tokenOut: TOKEN_B,
    amountIn: 1000n,
    trader: TRADER,
    recipient: poolAt('44').address,
  }
  const { state, verifier } = harness(client, { req })

  verifier.consider([bad])

  expect(statusOf(state, bad)).toBe('failed')
  expect(state.firstCompileError).toContain('is the v2 pool this plan trades through')
  // `PREFLIGHT_TOP_K` budgets round trips, not disqualifications.
  expect(state.verification.preflightAttempted).toBe(0)
  expect(verifier.idle()).toBe(true)
})

test('a TypeError from compileOperation propagates as a bug — never a business outcome', () => {
  // The other side of the test above, and the reason `compileAndEncode` catches by TYPE rather than
  // catching everything: `UnsupportedRouteError` is a statement about this candidate, but a
  // `TypeError` out of a protocol module is a defect in the package. Swallowing it would turn every
  // such bug into a silent `failed` route and a confident `no-route` verdict — which is exactly the
  // shape that is impossible to diagnose from a caller's report.
  const client: VerifierCtx['client'] = {
    request: async () => {
      throw new Error('a compile failure must never reach preflight')
    },
  } as VerifierCtx['client']
  const modules: VerifierCtx['modules'] = {
    ...PROTOCOL_MODULES,
    v2: {
      ...PROTOCOL_MODULES.v2,
      compileOperation() {
        throw new TypeError('Cannot read properties of undefined')
      },
    },
  }
  const { verifier } = harness(client, { modules })

  expect(() => verifier.consider([quotedAt('44')])).toThrow(TypeError)
})

test('a candidate already verified leads without a second simulation', () => {
  const { client, calls } = scriptedClient(() => {})
  const { state, verifier } = harness(client)
  const quoted = quotedAt('44')
  state.execution.set(routeId(quoted.route), { status: 'verified' })

  verifier.consider([quoted])

  expect(calls()).toBe(0)
  expect(verifier.leaderId()).toBe(routeId(quoted.route))
  expect(verifier.idle()).toBe(true)
})

test('a preflight that succeeds verifies the route and pokes the wake', async () => {
  const { client } = scriptedClient(() => {})
  const { state, wake, verifier } = harness(client)
  const quoted = quotedAt('44')

  verifier.consider([quoted])
  expect(verifier.idle()).toBe(false) // in flight

  await wake.next()

  expect(statusOf(state, quoted)).toBe('verified')
  expect(verifier.leaderId()).toBe(routeId(quoted.route))
  expect(verifier.idle()).toBe(true)
  expect(state.verification.preflightAttempted).toBe(1)
})

// ---------------------------------------------------------------------------
// The readiness gate
// ---------------------------------------------------------------------------

test('consider() before readiness has settled is a programmer error, not a business outcome', () => {
  const { client } = scriptedClient(() => {})
  const { verifier } = harness(client, { readiness: false })

  expect(() => verifier.consider([quotedAt('44')])).toThrow(/readiness/i)
})

// ---------------------------------------------------------------------------
// Concurrency: one preflight in flight, newest leader queued
// ---------------------------------------------------------------------------

test('a leader change during flight queues the NEWEST leader — not a backlog of every change', async () => {
  const { client, inFlight } = deferredClient()
  const { state, wake, verifier } = harness(client)
  const a = quotedAt('44')
  const b = quotedAt('55')
  const c = quotedAt('66')

  verifier.consider([a])
  await tick()
  expect(inFlight.length).toBe(1) // exactly one preflight, a's

  // Two leader changes land while a's call is out. Only the second may survive: the queue holds the
  // current leader, not a history of them.
  verifier.consider([b, a])
  verifier.consider([c, b, a])
  expect(verifier.idle()).toBe(false)
  await tick()
  expect(inFlight.length).toBe(1) // still one — nothing was dispatched alongside a

  inFlight[0]!.reject(revertError('0xaaaa'))
  await wake.next()
  await tick()

  // c, the newest leader, is what got the next slot; b was never simulated at all.
  expect(inFlight.length).toBe(2)
  expect(statusOf(state, a)).toBe('failed')
  expect(state.execution.has(routeId(b.route))).toBe(false)
  expect(state.verification.preflightAttempted).toBe(1) // c's is still out

  inFlight[1]!.resolve()
  await wake.next()

  expect(statusOf(state, c)).toBe('verified')
  expect(verifier.leaderId()).toBe(routeId(c.route))
  expect(verifier.idle()).toBe(true)
})

test('idle() is false while a queued leader is pending, so the loop cannot terminate over it', async () => {
  const { client, inFlight } = deferredClient()
  const { wake, verifier } = harness(client)
  const a = quotedAt('44')
  const b = quotedAt('55')

  verifier.consider([a])
  await tick()
  expect(verifier.idle()).toBe(false)

  // Queued, not dispatched — and the verifier is emphatically NOT idle: the loop's termination
  // check must not be able to end the search over a leader still waiting for its turn.
  verifier.consider([b, a])
  expect(verifier.idle()).toBe(false)

  inFlight[0]!.resolve()
  await wake.next()
  await tick()
  expect(inFlight.length).toBe(2) // the queued leader took the freed slot
  expect(verifier.idle()).toBe(false)

  inFlight[1]!.resolve()
  await wake.next()
  expect(verifier.idle()).toBe(true)
})

// ---------------------------------------------------------------------------
// The per-SEARCH preflight budget (spec §7.3): PREFLIGHT_TOP_K simulations for
// the whole search, spanning as many `consider()` rounds as the loop makes.
// ---------------------------------------------------------------------------

test('the preflight budget is per SEARCH: a 4th distinct reverting leader is never simulated', async () => {
  const { client, calls } = scriptedClient(() => {
    throw revertError()
  })
  const { state, wake, verifier } = harness(client)
  const ranked = ['44', '55', '66', '77'].map(quotedAt)
  expect(PREFLIGHT_TOP_K).toBe(3)

  // Each round is one loop cycle: consider, then the settlement's wake.
  for (let round = 0; round < PREFLIGHT_TOP_K; round++) {
    verifier.consider(ranked)
    await wake.next()
  }

  expect(calls()).toBe(PREFLIGHT_TOP_K)
  expect(state.verification.preflightAttempted).toBe(PREFLIGHT_TOP_K)

  // The 4th round finds the budget spent with a candidate nobody has tried.
  verifier.consider(ranked)
  await tick()

  expect(calls()).toBe(PREFLIGHT_TOP_K)
  expect(state.verification.preflightBudgetExhausted).toBe(true)
  expect(statusOf(state, ranked[3]!)).toBe('unverified')
  expect(verifier.idle()).toBe(true)
})

test('budget exhaustion is not claimed when every remaining candidate already failed', async () => {
  const { client } = scriptedClient(() => {
    throw revertError()
  })
  const { state, wake, verifier } = harness(client)
  const ranked = ['44', '55', '66'].map(quotedAt)

  for (let round = 0; round < PREFLIGHT_TOP_K; round++) {
    verifier.consider(ranked)
    await wake.next()
  }
  verifier.consider(ranked)

  // The cap stopped the walk, but nothing was left that a simulation could have changed.
  expect(state.verification.preflightBudgetExhausted).toBe(false)
  expect(ranked.every((r) => statusOf(state, r) === 'failed')).toBe(true)
})

test('budget exhaustion is not claimed over an already-verified candidate', async () => {
  const { client } = scriptedClient((call) => {
    if (call < PREFLIGHT_TOP_K - 1) throw revertError()
  })
  const { state, wake, verifier } = harness(client)
  const ranked = ['44', '55', '66', '77'].map(quotedAt)

  for (let round = 0; round < PREFLIGHT_TOP_K; round++) {
    verifier.consider(ranked)
    await wake.next()
  }

  // The third round verified ranked[2]; the walk now stops on it before the cap is ever consulted,
  // so a report claiming an exhausted budget would contradict a result that is already `ready`.
  verifier.consider(ranked)
  expect(statusOf(state, ranked[2]!)).toBe('verified')
  expect(state.verification.preflightBudgetExhausted).toBe(false)
  expect(verifier.leaderId()).toBe(routeId(ranked[2]!.route))
})

test('an aborted search never reports its preflight budget as exhausted', async () => {
  const { client, calls } = scriptedClient(() => {
    throw revertError()
  })
  const { state, wake, verifier } = harness(client)
  const ranked = ['44', '55', '66', '77'].map(quotedAt)

  for (let round = 0; round < PREFLIGHT_TOP_K; round++) {
    verifier.consider(ranked)
    await wake.next()
  }
  verifier.consider(ranked)
  expect(state.verification.preflightBudgetExhausted).toBe(true)

  // The caller's abort is what stopped this search, not a simulation budget — and
  // `preflightBudgetExhausted` exists to name the latter specifically.
  applyAbort(state)
  verifier.consider(ranked)
  await tick()

  expect(state.verification.preflightBudgetExhausted).toBe(false)
  expect(calls()).toBe(PREFLIGHT_TOP_K) // no simulation was dispatched after the abort either
  expect(verifier.leaderId()).toBe(routeId(ranked[3]!.route)) // the leader is still handed back
})

test('an abort before any simulation hands back the leader with its tx, unverified and unblamed', () => {
  const { client, calls } = scriptedClient(() => {})
  const { state, verifier } = harness(client)
  const quoted = quotedAt('44')
  applyAbort(state)

  verifier.consider([quoted])

  expect(calls()).toBe(0)
  expect(statusOf(state, quoted)).toBe('unverified')
  expect(state.compiledById.get(routeId(quoted.route))?.tx).toBeDefined()
  expect(verifier.leaderId()).toBe(routeId(quoted.route))
  expect(state.verification.preflightBudgetExhausted).toBe(false)
})
