import { describe, expect, test } from 'bun:test'

import { DESCENT_TIMEOUT_FALLBACK, MIN_CHUNK } from '../constants'
import type { BlockRange } from '../types'

import providerErrors from './__fixtures__/providerErrors.json'
import { scanLogs } from './logScan'
import type { RpcFailureKind } from './rpcErrors'
import { classifyRpcError, parseDeclaredCap } from './rpcErrors'

// ---------------------------------------------------------------------------
// THE PROVIDER CONFORMANCE TABLE.
//
// `__fixtures__/providerErrors.json` is the only place in this package where a
// REAL provider gets to say something. Every capture in it was taken off a live
// endpoint by `canary/providers.test.ts`, and the nightly canary rewrites the
// file whenever an endpoint produces a new error — which means the fixture is
// the package's evidence base and it GROWS WITHOUT ANYONE ASKING.
//
// The other fixture-driven suites (`rpcErrors.test.ts`, `logScan.test.ts`) each
// read the captures they were written for, by name, and hand-build the error
// around them — `new Error(message)` with `name = 'HttpRequestError'` pinned on
// by the test rather than derived from what was recorded. That is fine for what
// those tests assert (the PARSER against real wording) and useless for the
// question this file asks: given a shape a provider actually produced, WHAT
// DOES THE WHOLE STACK DO WITH IT? Two things follow from that difference:
//
//   * The error here is REBUILT FROM THE CAPTURE'S OWN FIELDS (see
//     {@link rebuildCapturedError}) — the HTTP status is read out of the
//     recorded text, the JSON-RPC code off the recorded `causeCode`, and
//     nothing is asserted by hand. A capture recorded as an HTTP-200 body error
//     is replayed as one, with no status anywhere, because that is the shape
//     that used to classify `execution` (see `rpcErrors.ts#NODE_STATE_RPC_CODES`).
//     Until this file existed, the recorded `causeCode: -32614` was read by NO
//     test at all — every suite that touched the batched quicknode capture
//     rebuilt the code by hand, so the fixture field could have been wrong or
//     absent and nothing would have noticed.
//   * The table is CLOSED against the fixture (the first test below). A seventh
//     capture appearing overnight fails this file until someone writes down what
//     the stack does with it. That is the entire point: new provider evidence
//     must be interrogated, not merely stored.
//
// One row per capture, and each row states four things — the classification,
// the declared cap (width, kind, and whether a retry range was volunteered),
// the wire shape it was rebuilt from, and what a real `scanLogs` run costs
// against an endpoint that fails this way. The last column is where the rows
// stop being paraphrases of `rpcErrors.test.ts` and start being about behavior:
// alchemy and quicknode both say "10,000" and the same scan costs 20 requests
// against one and 101 against the other, because only one of them means it as a
// span policy.
// ---------------------------------------------------------------------------

/** The recorded fields a capture can carry. `note`/`causeCode` are hand-added; the rest is written
 * by `canary/providers.test.ts#recordProviderError` on every nightly re-capture. */
type Capture = { source: string; capturedAt: string; message: string; note?: string; causeCode?: number }

const CAPTURES = providerErrors as Record<string, Capture>

/** `Status: 403` — the line viem's `HttpRequestError` puts in its message, and the only place a
 * capture records the HTTP status. Absent means the error never had one: the JSON-RPC body arrived
 * inside a 200, which is exactly the batched-transport shape. */
function statusOf(message: string): number | undefined {
  const match = /\nStatus:\s*(\d+)/.exec(message)
  return match ? Number(match[1]) : undefined
}

/** `Details: …` — the provider's own words, which viem also hangs off the error as `details`. */
function detailsOf(message: string): string | undefined {
  const match = /\nDetails:\s*(.*)/.exec(message)
  return match?.[1]
}

/**
 * Rebuilds the viem-shaped error a capture came from, DERIVED ENTIRELY FROM THE CAPTURE'S FIELDS —
 * no per-endpoint knowledge, so a seventh capture is rebuilt by the same three lines as the first
 * six and cannot be quietly reshaped into whatever makes a test pass.
 *
 *  - a recorded `Status:` line means the wire delivered an HTTP failure: `HttpRequestError`, with
 *    that status, which is the tier `classifyRpcError` reaches first.
 *  - no status means the JSON-RPC error rode inside a 200 body — viem's `RpcRequestError` wrapper,
 *    the batched shape, with the code (when one was recorded) on the `cause` where viem puts it.
 *    `RpcRequestError` is deliberately NOT a transport-classified name (it wraps every revert too),
 *    so this rebuild gives the classifier no help it would not have in production.
 *
 * The one thing a rebuild cannot recover is a code the capture never recorded: `recordProviderError`
 * persists only `message`, so `eth.drpc.org`'s real `-32602` is absent here. It changes nothing —
 * `-32602` is in no code set (publicnode's archive-paywall capture carries the same code for a
 * completely different failure), so drpc classifies off its message either way.
 *
 * IT HAS NO SIBLING ANY MORE, AND THAT IS WORTH SAYING. `internal/replay.ts#rebuildError` used to do
 * the superficially similar job of reviving a recorded provider error, from a `cause` chain that had
 * been walked and written down frame by frame; the two were deliberately never merged, because this
 * one has only a message string and must INFER the wrapper from it — same shape out, opposite amount
 * of evidence in, and this one's inference is the thing under test. That module died with the
 * RPC-session goldens (the outcome-log format records outcomes, not conversations, so nothing
 * anywhere else rebuilds an error now). These fixtures are LIVE PROVIDER CAPTURES, not sessions, and
 * they are unaffected: they are about wire shapes, which is exactly what this suite is for.
 */
function rebuildCapturedError(capture: Capture): Error {
  const status = statusOf(capture.message)
  const details = detailsOf(capture.message)
  const err = Object.assign(new Error(capture.message), {
    name: status === undefined ? 'RpcRequestError' : 'HttpRequestError',
    ...(status === undefined ? {} : { status }),
    ...(details === undefined ? {} : { details }),
  }) as Error & { cause?: unknown }
  if (capture.causeCode !== undefined) err.cause = { code: capture.causeCode, message: details }
  return err
}

// --- the scan scenario every row is measured in -------------------------------------------------
// One shape, so the rows are comparable: a million blocks, a ceiling pinned AT the range (the first
// request is the whole thing — S1's wide start, with small enough numbers to reason about), and an
// endpoint that serves anything at or under SERVEABLE_WIDTH and answers everything wider with the
// captured error. `sleep` is injected, so a row that costs backoff records the delays instead of
// waiting for them.
const SCAN_RANGE: BlockRange = { fromBlock: 1n, toBlock: 1_000_000n }
const SCAN_CEILING = 1_000_000n
const SERVEABLE_WIDTH = 250_000n

type ScanOutcome = { requests: number; complete: boolean; coveredBlocks: bigint; backoffs: number }

async function scanAgainst(capture: Capture): Promise<ScanOutcome> {
  const backoffs: number[] = []
  const client = {
    request: async (args: any) => {
      if (args.method !== 'eth_getLogs') throw new Error(`unexpected method ${args.method}`)
      const filter = args.params[0]
      const span = BigInt(filter.toBlock) - BigInt(filter.fromBlock) + 1n
      if (span > SERVEABLE_WIDTH) throw rebuildCapturedError(capture)
      return []
    },
  }
  const res = await scanLogs(client as any, { address: '0x1', topics: [] } as any, SCAN_RANGE, {
    initialChunk: SCAN_CEILING,
    sleep: async (ms: number) => {
      backoffs.push(ms)
    },
  })
  return {
    requests: res.requests,
    complete: res.complete,
    coveredBlocks: res.covered.reduce((sum, r) => sum + (r.toBlock - r.fromBlock + 1n), 0n),
    backoffs: backoffs.length,
  }
}

type Row = {
  /** What the wire shape was, as derived from the capture — pinned so a re-capture that changes the
   * transport (a vendor moving a cap from an HTTP status into a 200 body, which is the whole
   * quicknode story) shows up here rather than silently changing the classification below. */
  wire: { status?: number | undefined; causeCode?: number | undefined }
  classify: RpcFailureKind
  capBlocks?: bigint | undefined
  capKind?: 'span' | 'density' | undefined
  /** Whether the provider volunteered a range to retry. Presence only: `logScan` uses the WIDTH and
   * never the position (`rpcErrors.ts#DeclaredCap.retryRange` — the suggested ranges routinely sit
   * outside the window that was asked for). */
  retryRange: boolean
  scan: ScanOutcome
  /** Why this row reads the way it does — the behavior the numbers encode. */
  verdict: string
}

const TABLE: Record<string, Row> = {
  // No window in the message at all (an archive-access 403), so nothing to jump to. The 403 makes it
  // `transport`, and THAT is what buys the descent: one expensive refusal collapses the window
  // straight to DESCENT_TIMEOUT_FALLBACK instead of walking ~13 halvings down to it. 8 requests for
  // a million blocks, complete, no backoff — the collapse plus one regrowth doubling to 200k.
  'ethereum.publicnode.com': {
    wire: { status: 403 },
    classify: 'transport',
    capBlocks: undefined,
    capKind: undefined,
    retryRange: false,
    scan: { requests: 8, complete: true, coveredBlocks: 1_000_000n, backoffs: 0 },
    verdict: 'declares nothing; the transport tier collapses the descent in one step',
  },

  // The cheapest possible honest failure. A declared cap of 10 blocks is below MIN_CHUNK (128), i.e.
  // below anything this scanner will ever ask for, so no amount of halving or retrying can reach it:
  // ONE request, the sub-range given up, and coverage reported as the nothing it is. The alternative
  // (and what this used to cost) is MAX_CONSECUTIVE_MIN_FAILURES retries and a full backoff
  // escalation per sub-range, rediscovering a sentence the first error stated in English.
  'eth-mainnet.public.blastapi.io': {
    wire: { status: 400 },
    classify: 'transport',
    capBlocks: 10n,
    capKind: 'density',
    retryRange: true,
    scan: { requests: 1, complete: false, coveredBlocks: 0n, backoffs: 0 },
    verdict: 'cap below MIN_CHUNK: give the sub-range up at once, claim no coverage',
  },

  // The one capture with no HTTP status and no recorded code — a JSON-RPC result cap inside a 200.
  // It classifies `unavailable` off its message alone ("query exceeds max results"), which is the
  // tier that keeps a result cap from being read as an on-chain refusal. Behaviorally the classify
  // is masked here: the cap fast path fires first (1,075 blocks, derived from the range drpc
  // volunteered), and because that is a DENSITY observation the ceiling is untouched, so the ratchet
  // doubles 1,075 -> 137,600 over the walk. 33 requests, complete.
  'eth.drpc.org': {
    wire: {},
    classify: 'unavailable',
    capBlocks: 1_075n,
    capKind: 'density',
    retryRange: true,
    scan: { requests: 33, complete: true, coveredBlocks: 1_000_000n, backoffs: 0 },
    verdict: 'density cap from a volunteered range: jump to its width, then regrow past it',
  },

  // The same quicknode cap, through the two transports, MUST end in the same place — that is what
  // this pair is for. Unbatched it is an HTTP 413 (`transport`, caught by the status tier);
  // batched it is a 200 with `-32614` on the cause (`unavailable`, caught by the code tier), which
  // is the shape that used to fall through to `execution`. Both read the cap as a SPAN policy, both
  // clamp the ceiling to 10,000, and both therefore cost the identical 101 requests — 100 chunks of
  // 10k with no regrowth probing, because at the ceiling doubling is a no-op and the batching stays
  // whole. Higher than alchemy's 20 below, and correctly so: this endpoint really will refuse 10,001.
  'base-mainnet.quiknode.pro (unbatched)': {
    wire: { status: 413 },
    classify: 'transport',
    capBlocks: 10_000n,
    capKind: 'span',
    retryRange: false,
    scan: { requests: 101, complete: true, coveredBlocks: 1_000_000n, backoffs: 0 },
    verdict: 'span cap clamps the ceiling: no regrowth probing, full-width batches',
  },
  'base-mainnet.quiknode.pro (batched)': {
    wire: { causeCode: -32614 },
    classify: 'unavailable',
    capBlocks: 10_000n,
    capKind: 'span',
    retryRange: false,
    scan: { requests: 101, complete: true, coveredBlocks: 1_000_000n, backoffs: 0 },
    verdict: 'HTTP 200 + -32614: same verdict and same cost as the unbatched shape',
  },

  // THE ROW THE `capKind` FIELD EXISTS FOR. Alchemy states "10,000 block range" in the same breath
  // as an ~8,000,000-block retry suggestion for the same query, so the 10,000 is one of two offered
  // modes and not a policy. Read as `density` the ceiling is left alone and the ratchet climbs
  // 10k -> 160k: 20 requests. Read as `span` — the mistake — it would clamp to 10,000 and cost the
  // 101 above, forever, on an endpoint that demonstrably serves 8M-block windows.
  'eth-mainnet.g.alchemy.com': {
    wire: { status: 400 },
    classify: 'transport',
    capBlocks: 10_000n,
    capKind: 'density',
    retryRange: true,
    scan: { requests: 20, complete: true, coveredBlocks: 1_000_000n, backoffs: 0 },
    verdict: 'density cap does NOT clamp the ceiling: 20 requests, not quicknode’s 101',
  },
}

describe('provider conformance — every live capture, interrogated end to end', () => {
  test('THE TABLE IS CLOSED: a new capture must be given a row', () => {
    // The nightly canary rewrites `providerErrors.json` whenever a live endpoint produces an error,
    // so the fixture can gain a shape nobody has looked at. Without this, that shape would be
    // *stored* and never *interrogated* — the exact situation the batched quicknode capture was in
    // for as long as it took someone to notice a range cap was classifying as an EVM refusal.
    expect(Object.keys(TABLE).sort()).toEqual(Object.keys(CAPTURES).sort())
  })

  test('every capture is a live capture (a hand-written row would make this whole file a tautology)', () => {
    for (const capture of Object.values(CAPTURES)) expect(capture.source).toBe('live-capture')
  })

  for (const [hostname, row] of Object.entries(TABLE)) {
    const capture = CAPTURES[hostname]!

    test(`${hostname}: ${row.verdict}`, async () => {
      // The wire shape, derived from the capture rather than asserted onto it.
      expect({ status: statusOf(capture.message), causeCode: capture.causeCode }).toEqual({
        status: row.wire.status,
        causeCode: row.wire.causeCode,
      })

      const err = rebuildCapturedError(capture)
      expect(classifyRpcError(err)).toBe(row.classify)

      const declared = parseDeclaredCap(err)
      expect(declared.capBlocks).toBe(row.capBlocks!)
      expect(declared.capKind).toBe(row.capKind!)
      expect(declared.retryRange !== undefined).toBe(row.retryRange)

      expect(await scanAgainst(capture)).toEqual(row.scan)
    })
  }

  test('coverage is never claimed for a sub-range that was not served', () => {
    // The one invariant that holds across every row whatever the provider said: `complete` and
    // `coveredBlocks` agree, and an incomplete scan is missing blocks rather than quietly claiming
    // them. A row could be re-measured wrongly; this cannot be satisfied by a wrong number.
    for (const row of Object.values(TABLE)) {
      const wholeRange = SCAN_RANGE.toBlock - SCAN_RANGE.fromBlock + 1n
      expect(row.scan.complete).toBe(row.scan.coveredBlocks === wholeRange)
      expect(row.scan.coveredBlocks).toBeLessThanOrEqual(wholeRange)
    }
  })

  test('a declared cap below MIN_CHUNK is unreachable by construction, and exactly one capture is there', () => {
    // Ties blastapi's one-request row to the reason for it rather than to the number 1: MIN_CHUNK is
    // the floor, so a cap under it can only ever be given up on. If a re-capture raises blastapi's
    // cap above the floor, its row's request count changes and this says why.
    const belowFloor = Object.entries(TABLE).filter(([, r]) => r.capBlocks !== undefined && r.capBlocks < MIN_CHUNK)
    expect(belowFloor.map(([host]) => host)).toEqual(['eth-mainnet.public.blastapi.io'])
    for (const [, row] of belowFloor) {
      expect(row.scan.requests).toBe(1)
      expect(row.scan.coveredBlocks).toBe(0n)
    }
  })

  test('a capture that declares NO window is the only one that needs the expensive-refusal collapse', () => {
    // publicnode's 8 requests are only affordable because its 403 classifies as transport and the
    // first refusal drops the window straight to DESCENT_TIMEOUT_FALLBACK. Every other row has a
    // declared cap and takes the fast path above it, so the collapse is dead weight for them — which
    // is worth pinning, because it means a regression in the collapse hides everywhere but here.
    const undeclared = Object.entries(TABLE).filter(([, r]) => r.capBlocks === undefined)
    expect(undeclared.map(([host]) => host)).toEqual(['ethereum.publicnode.com'])
    for (const [, row] of undeclared) {
      expect(row.classify === 'transport' || row.classify === 'unavailable').toBe(true)
      // Collapsing in one step rather than halving from the ceiling: log2(1_000_000 / 100_000) is
      // ~3.3 halvings saved here and ~7 at MAX_SCAN_WINDOW, and the row must stay far under the
      // ladder it replaces or the collapse has stopped firing.
      expect(row.scan.requests).toBeLessThan(Number(SCAN_CEILING / DESCENT_TIMEOUT_FALLBACK) + 5)
    }
  })

  test('NO capture classifies as `execution` — not one of them is evidence about the chain', () => {
    // The load-bearing safety property of the whole table, and the one that would have caught the
    // batched quicknode shape on the day it was captured. Every entry in this fixture is an
    // `eth_getLogs` refusal: a paywall, a range cap, a result cap. None of them is an EVM verdict,
    // so none of them may ever contribute to a `no-route` conclusion (`rpcErrors.ts#RpcFailureKind`).
    // `execution` is the classifier's DEFAULT, so this is precisely the assertion that a shape the
    // parser does not understand cannot pass silently.
    for (const [hostname, capture] of Object.entries(CAPTURES)) {
      expect([hostname, classifyRpcError(rebuildCapturedError(capture))]).not.toEqual([hostname, 'execution'])
    }
  })
})
