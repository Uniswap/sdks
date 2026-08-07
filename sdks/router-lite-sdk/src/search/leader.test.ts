import { expect, test } from 'bun:test'
import type { Address } from 'viem'
import { zeroHash } from 'viem'

import { PoolIndex } from '../pools/poolIndex'
import { PROTOCOL_MODULES } from '../protocols'
import { v2PoolRef as v2Ref } from '../protocols/poolRef'
import type { BlockRef, ChainManifest, ExecutionRequirement, QuotedRoute, RankedRoute, SwapRequest } from '../types'

import { routeId } from './candidates'
import { evaluate, pickLeader } from './leader'
import { initialState } from './waves'
import type { Run, SearchContext } from './waves'

// ---------------------------------------------------------------------------
// C4-T1 mutation-audit kills: M4 (pickLeader's middle `??` clause), M9/M10
// (verifyLeader's degraded-readiness guards).
// ---------------------------------------------------------------------------

const WETH = `0x${'ee'.repeat(20)}` as Address
const TOKEN_A = `0x${'aa'.repeat(20)}` as Address
const TOKEN_B = `0x${'bb'.repeat(20)}` as Address
const TRADER = `0x${'11'.repeat(20)}` as Address
const UR = `0x${'22'.repeat(20)}` as Address
const PERMIT2 = `0x${'33'.repeat(20)}` as Address

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

// ---------------------------------------------------------------------------
// M4: pickLeader's middle `??` clause — the first non-failed candidate when
// `verifyLeader` returned no leader this wave. Deleting that clause (falling
// straight through to `evaluated[0]`) is a mutant the pre-existing suite does
// not catch: confirmed surviving locally (the middle clause removed, full
// suite green) before writing this test.
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
// M9 / M10: the two `readinessDegraded` guards inside `verifyLeader`. Both
// mutants (deleting either guard) leave the pre-existing suite green — a
// requirement list built from incomplete reads must never be promised as
// `needs-action`, and a preflight revert with the trader's funding state
// partly unread must never be blamed on the route as `failed`. Confirmed
// surviving locally before writing these tests (each guard deleted in turn,
// full suite still green).
//
// `best.execution` is asserted DIRECTLY off `evaluate()`'s result — not just
// the facade's `inconclusive` status, which both the correct code and the
// mutant would produce identically (the mutant differs only in the route's
// own `execution` field, which the facade folds into the same status either
// way).
// ---------------------------------------------------------------------------

function manifest(): ChainManifest {
  return {
    chainId: 1,
    wrappedNative: WETH,
    execution: { address: UR, commandSet: 'ur-2.0', permit2: PERMIT2, wrappedNative: WETH },
  }
}

/** A swap `Run` with exactly one already-quoted v2 route, seeded directly into `state.quoted` —
 * the same technique `waves.test.ts`'s C4-P7 regressions use to control a specific `evaluate()`
 * call without engineering a multi-wave discovery timing. */
function makeSwapRun(
  client: SearchContext['client'],
  requirements: ExecutionRequirement[],
  readinessDegraded: boolean
): Run {
  const ctx: SearchContext = {
    client,
    manifest: manifest(),
    modules: PROTOCOL_MODULES,
    index: new PoolIndex(WETH),
    hookData: new Map(),
  }
  const block: BlockRef = { number: 1_000n, hash: zeroHash, timestamp: 1_700_000_000n }
  const state = initialState(block, false)
  state.requirements = requirements
  state.readinessDegraded = readinessDegraded

  const quoted: QuotedRoute = {
    route: routeAt('44'),
    quote: { amountIn: 1000n, amountOut: 900n, intermediateAmounts: [] },
  }
  state.quoted.set(routeId(quoted.route), quoted)

  const req: SwapRequest = { tokenIn: TOKEN_A, tokenOut: TOKEN_B, amountIn: 1000n, trader: TRADER }
  return { ctx, state, kind: 'swap', req }
}

test('verifyLeader (M9): degraded readiness + would-be-needs-action never promotes it — best.execution stays unverified', async () => {
  // Compiling+encoding is pure computation; requirements short-circuit verification before any RPC,
  // so this client asserts the RPC-free path by throwing on any call it receives.
  const client: SearchContext['client'] = {
    request: async () => {
      throw new Error('must never reach RPC: a non-empty requirement list short-circuits verification')
    },
  }
  const requirements: ExecutionRequirement[] = [
    { kind: 'erc20-approval', token: TOKEN_A, spender: PERMIT2, minimumAmount: 1_000n },
  ]
  const run = makeSwapRun(client, requirements, true)

  const result = await evaluate(run, true)

  // Under the M9 mutant (the `state.readinessDegraded` guard deleted), this would be 'needs-action'.
  expect(result.best?.execution).toBe('unverified')
  expect(result.requirements).toEqual(requirements)
  expect(result.tx).toBeDefined() // still compiled and handed back, per this file's own header
})

test('verifyLeader (M10): degraded readiness + a preflight revert stays unverified, never failed', async () => {
  const client: SearchContext['client'] = {
    request: async (args: any) => {
      if (args.method === 'eth_call' && (args.params[0].to as string).toLowerCase() === UR.toLowerCase()) {
        throw Object.assign(new Error('execution reverted'), { data: '0xdeadbeef' })
      }
      throw new Error(`unexpected RPC call ${String(args.method)}`)
    },
  }
  const run = makeSwapRun(client, [], true) // no requirements: verifyLeader proceeds straight to preflight

  const result = await evaluate(run, true)

  // Under the M10 mutant (the `state.readinessDegraded` guard before the `failed` write deleted),
  // this would be 'failed' with `revertData: '0xdeadbeef'`.
  expect(result.best?.execution).toBe('unverified')
  expect(result.best?.revertData).toBeUndefined()
})

test('control: the SAME preflight revert, WITHOUT degraded readiness, is authoritatively failed', async () => {
  const client: SearchContext['client'] = {
    request: async (args: any) => {
      if (args.method === 'eth_call' && (args.params[0].to as string).toLowerCase() === UR.toLowerCase()) {
        throw Object.assign(new Error('execution reverted'), { data: '0xdeadbeef' })
      }
      throw new Error(`unexpected RPC call ${String(args.method)}`)
    },
  }
  const run = makeSwapRun(client, [], false) // readiness NOT degraded this time

  const result = await evaluate(run, true)

  expect(result.best?.execution).toBe('failed')
  expect(result.best?.revertData).toBe('0xdeadbeef')
})
