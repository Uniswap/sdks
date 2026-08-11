import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'

import { describe, expect, test } from 'bun:test'

import { canonicalizeResult, captureError, rebuildError, replayClient, requestFromSession } from './internal/replay'
import type { CanonicalRoute, RecordedSession } from './internal/replay'
import { assertResultCoherent } from './internal/testing'
import { manifestFor } from './manifest'
import { createRouter } from './router'

// ---------------------------------------------------------------------------
// Recorded-replay golden e2e — the layer that answers "does the router find
// the RIGHT answer", hermetically.
//
// Each session under `internal/__fixtures__/sessions/` is one real `getQuote`
// run's complete, block-pinned RPC conversation (recorded via
// `scripts/recordSession.ts` through `chainz exec` — see the README's
// "Recorded-replay golden sessions" section). This test replays every session
// against the real `createRouter` + built-in manifest and asserts the FULL
// canonical result — best routeId and amountOut EXACTLY (hermetic, so no
// tolerance), every alternative's routeId+amount, and the canonicalized
// SearchReport — equals the committed golden. A ranking, pruning, discovery,
// or classification regression that changes the ANSWER fails the deep-equal;
// a change to what the search ASKS fails earlier and louder, inside the
// replay transport, naming the unrecorded (method, params).
//
// DETERMINISM: replay is hermetic and this package's engine has no
// `Date.now`/`Math.random`; the only wall-clock behavior (the 5s quote
// interleave) is quiescent under replay because every response resolves in a
// microtask. Request ORDER still varies with scheduling — absorbed by the
// canonical (method, canonicalized-params) keying, which is order-independent
// and idempotent. See `internal/replay.ts`'s header for the full variance
// accounting. The recorder writes goldens from a strict replay (not the live
// run) and proves two replays agree before a session is ever committed.
//
// Recorded-but-unrequested keys are the harmless direction (the search asked
// for LESS than the recording holds — e.g. quotes only the live run's
// interleave timer issued); they are reported as info, never asserted on.
// ---------------------------------------------------------------------------

const SESSIONS_DIR = join(fileURLToPath(new URL('.', import.meta.url)), 'internal', '__fixtures__', 'sessions')

function loadSession(file: string): RecordedSession {
  const path = join(SESSIONS_DIR, file)
  const raw = file.endsWith('.gz') ? gunzipSync(readFileSync(path)).toString('utf8') : readFileSync(path, 'utf8')
  return JSON.parse(raw) as RecordedSession
}

const files = readdirSync(SESSIONS_DIR)
  .filter((f) => f.endsWith('.json') || f.endsWith('.json.gz'))
  .sort()

describe('the error capture/rebuild round trip', () => {
  test('a cause chain survives capture and rebuild, frame for frame', () => {
    const inner = Object.assign(new Error('Details: eth_getLogs is limited to a 10,000 range'), {
      name: 'RpcRequestError',
      code: -32614,
    })
    const outer = Object.assign(new Error('HTTP request failed.\nURL: https://rpc.example/SECRET'), {
      name: 'HttpRequestError',
      status: 413,
      cause: inner,
    })

    const rebuilt = rebuildError(captureError(outer, (s) => s.replace('SECRET', '<redacted>'))) as Error & {
      status?: number
      cause?: Error & { code?: number }
    }

    expect(rebuilt.name).toBe('HttpRequestError')
    expect(rebuilt.message).toContain('<redacted>') // the recorder's redaction is what got written down
    expect(rebuilt.message).not.toContain('SECRET')
    expect(rebuilt.status).toBe(413)
    expect(rebuilt.cause?.name).toBe('RpcRequestError')
    expect(rebuilt.cause?.code).toBe(-32614)
  })

  test('an empty frame list rebuilds into a named Error, not undefined', () => {
    // `captureError` cannot produce one (it writes a fallback frame), so this only happens to a
    // hand-edited or truncated session — and the loop that walks the frames used to return
    // `undefined` for it. `replayClient` throws whatever comes back, so the symptom was a
    // `TypeError: undefined is not an object` thrown from the transport, with nothing anywhere
    // naming the file that was actually wrong.
    const rebuilt = rebuildError({ frames: [] })
    expect(rebuilt).toBeInstanceOf(Error)
    expect(rebuilt.message).toBe('recorded error with no frames')
  })
})

// ---------------------------------------------------------------------------
// QUARANTINE — THE WHOLE CORPUS, pending the outcome-log golden format
// (docs/superpowers/plans/2026-08-10-event-driven-search-core.md, Task 13).
//
// Every session here is one wave engine run's complete, block-pinned RPC
// conversation. The event-driven cutover is a HARD CUT: the engine now asks in
// leg-measurement rounds and coverage-worker scans whose request shapes no
// wave-era recording holds, so a replay meets unrecorded (method, params) keys
// immediately — that is the corpus working (a conversation cannot outlive a
// change in what the search asks), and no `--regold` can help, because a
// golden rebuilt from bytes recorded for the old shapes asserts nothing.
//
// Task 13 replaces this format wholesale: goldens become recorded OUTCOME LOGS
// replayed through `search/state.ts`'s `apply*` + composition + `buildReport`
// — independent of RPC request shapes, which is exactly the coupling that
// retired this corpus. RPC-level replay (`internal/replay.ts`) survives for
// provider-conformance tests, which are genuinely about wire shapes.
//
// Until then every session is skipped BY NAME below, so a bare `bun test`
// prints the gap instead of reporting green over a corpus that has quietly
// stopped asserting anything.
// ---------------------------------------------------------------------------

const QUARANTINE_REASON =
  'wave-era RPC recording cannot replay the event-driven engine; superseded by the outcome-log golden format (plan Task 13)'

const QUARANTINED: Record<string, string> = Object.fromEntries(files.map((f) => [loadSession(f).label, QUARANTINE_REASON]))

describe('recorded-replay goldens', () => {
  test('the session corpus exists', () => {
    expect(files.length).toBeGreaterThan(0)
  })

  for (const [label, reason] of Object.entries(QUARANTINED)) {
    // ...and it says so out loud, so a bare `bun test` names the gap instead of reporting a green
    // run over a corpus that has quietly stopped asserting its answers.
    // eslint-disable-next-line no-console
    console.warn(`[replay] QUARANTINED session "${label}" is NOT being replayed — ${reason}`)
  }

  for (const file of files) {
    const session = loadSession(file)
    const quarantined = QUARANTINED[session.label]
    const runOrSkip = quarantined ? test.skip : test

    runOrSkip(
      `${session.label}: replay reproduces the golden exactly${quarantined ? ` [QUARANTINED — ${quarantined}]` : ''}`,
      async () => {
        const harness = replayClient(session)
        const router = createRouter({ client: harness.client, manifest: manifestFor(session.chainId) })

        const result = await router.getQuote(requestFromSession(session))

        // Held to the same invariants every other suite's results are — a classification bug fails
        // here even when the golden itself would still have matched.
        assertResultCoherent(result)

        const canonical = canonicalizeResult(result)
        const golden = session.golden

        // The targeted assertions first, so a regression names the axis it broke before the full
        // deep-equal restates it wholesale.
        expect(canonical.status).toBe(golden.status)
        expect(canonical.best?.routeId).toBe(golden.best?.routeId)
        // Hermetic replay at a pinned block: the number is exact or it is wrong.
        expect(canonical.best?.amountOut).toBe(golden.best?.amountOut)
        expect(canonical.best?.promotedOverComplex).toBe(golden.best?.promotedOverComplex)
        expect(canonical.alternatives.map((a) => ({ routeId: a.routeId, amountOut: a.amountOut }))).toEqual(
          golden.alternatives.map((a) => ({ routeId: a.routeId, amountOut: a.amountOut })),
        )

        // The canonicalized SearchReport and everything else, exactly.
        expect(canonical).toEqual(golden)

        const unrequested = harness.unrequestedKeys()
        if (unrequested.length > 0) {
          // Info only: recorded-but-unrequested keys mean the search asked for LESS than the
          // recording holds, which is harmless (see the header).
          console.info(`[replay:${session.label}] info: ${unrequested.length} recorded key(s) never requested`)
        }
      },
      30_000,
    )
  }
})

// ---------------------------------------------------------------------------
// THE GOLDEN SCHEMA, PINNED IN THE TEST AND NOT IN THE GOLDENS.
//
// The deep-equal above is a fixed point, and a fixed point cannot notice a
// field that stopped existing: if the engine silently stopped reporting a
// canonical field, ONE `scripts/recordSession.ts --regold` rewrites every
// golden without it — from the same recorded conversations, so nothing
// re-records, nothing errors, and the diff is a plausible-looking removal —
// and every run afterwards is green against a corpus that has stopped
// asserting the thing.
//
// `gasEstimate` is the field that made this concrete: it lives in a return slot
// of the very quoter calls these sessions replay and was discarded on decode
// for most of this package's life. A decode that started reading the wrong
// slot again, or a two-segment sum quietly dropped, would produce goldens that
// are perfectly self-consistent.
//
// So the SHAPE is asserted here, against rules derived from the production
// contract rather than from the files:
//
//   * the key set is closed — a field that vanished fails, and so does one
//     that appeared without anybody deciding to add it;
//   * `gasEstimate` is present EXACTLY when the route has no v2 leg. That is
//     the all-or-nothing gas rule restated (`search/pump.ts#composeRoutes`): a v2
//     segment is local constant-product arithmetic over `getReserves()` and
//     measures no gas, so one v2 leg makes the whole route's sum undefined.
//     Stated as an `iff`, so "gas stopped being reported" and "gas got
//     synthesized for a route nothing simulated" are both failures.
// ---------------------------------------------------------------------------

const REQUIRED_ROUTE_KEYS = ['amountIn', 'amountOut', 'intermediateAmounts', 'path', 'protocols', 'routeId']
const OPTIONAL_ROUTE_KEYS = ['gasEstimate', 'promotedOverComplex']

describe('the golden canonical shape (independent of the deep-equal)', () => {
  const allRoutes: { label: string; route: CanonicalRoute }[] = []

  for (const file of files) {
    const session = loadSession(file)
    const routes = [...(session.golden.best ? [session.golden.best] : []), ...session.golden.alternatives]
    for (const route of routes) allRoutes.push({ label: session.label, route })

    test(`${session.label}: every golden route carries the whole canonical shape, and gas exactly where it is measurable`, () => {
      if (session.golden.status === 'quote') expect(routes.length).toBeGreaterThan(0)
      for (const route of routes) {
        const keys = Object.keys(route).sort()
        expect(
          keys.filter((k) => !REQUIRED_ROUTE_KEYS.includes(k) && !OPTIONAL_ROUTE_KEYS.includes(k)),
          `${session.label} ${route.routeId}: golden route carries a key the canonical shape does not declare`,
        ).toEqual([])
        expect(
          REQUIRED_ROUTE_KEYS.filter((k) => !keys.includes(k)),
          `${session.label} ${route.routeId}: golden route is MISSING a canonical field — one --regold can do this silently`,
        ).toEqual([])

        // The iff. `protocols` is this route's own leg list, so the rule is checked against the
        // route rather than against a remembered expectation per session.
        const measurable = !route.protocols.includes('v2')
        expect(
          route.gasEstimate !== undefined,
          `${session.label} ${route.routeId} (${route.protocols.join('+')}): gasEstimate should be ${measurable ? 'present' : 'absent'}`,
        ).toBe(measurable)
        if (measurable) expect(route.gasEstimate).toMatch(/^\d+$/)
        expect(route.amountIn).toMatch(/^\d+$/)
        expect(route.amountOut).toMatch(/^\d+$/)
        expect(route.path.length).toBe(route.protocols.length + 1)
      }
    })
  }

  // The rules above are only worth anything if the corpus exercises both sides of the iff. Without
  // this, a corpus that drifted to v2-only routes would satisfy "gas absent" everywhere and the
  // vanishing-field guard would be back to asserting nothing.
  test('the corpus exercises both sides of the gas rule', () => {
    expect(allRoutes.some(({ route }) => route.gasEstimate !== undefined)).toBe(true)
    expect(allRoutes.some(({ route }) => route.protocols.includes('v2'))).toBe(true)
  })
})
