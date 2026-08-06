import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'

import { describe, expect, test } from 'bun:test'

import { canonicalizeResult, replayClient, requestFromSession } from './internal/replay'
import type { RecordedSession } from './internal/replay'
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

describe('recorded-replay goldens', () => {
  test('the session corpus exists', () => {
    expect(files.length).toBeGreaterThan(0)
  })

  for (const file of files) {
    const session = loadSession(file)

    test(
      `${session.label}: replay reproduces the golden exactly`,
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
