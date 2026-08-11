import { expect, test } from 'bun:test'

import {
  BACKOFF_BASE_MS,
  BACKOFF_MAX_MS,
  CHUNK_REGROWTH_SUCCESSES,
  DESCENT_TIMEOUT_FALLBACK,
  MAX_BACKOFF_TOTAL_MS,
  MAX_REQUESTS_PER_SCAN,
  MAX_SCAN_WINDOW,
  MIN_CHUNK,
  SCAN_CHUNK_CONCURRENCY,
} from '../constants'

import providerErrors from './__fixtures__/providerErrors.json'
import { delay, scanLogs } from './logScan'
import { createSemaphore } from './rpc'

/** A stub whose `request` records every `eth_getLogs` filter it is handed. */
function stub(handler: (filter: any) => unknown[]): { client: any; filters: any[] } {
  const filters: any[] = []
  return {
    filters,
    client: {
      request: async (args: any) => {
        if (args.method !== 'eth_getLogs') throw new Error(`unexpected method ${args.method}`)
        const filter = args.params[0]
        filters.push(filter)
        return handler(filter)
      },
    },
  }
}

const QUERY = { address: '0x1', topics: [] } as any

/** Blocks a recorded filter asked for (inclusive on both ends). */
function span(filter: any): bigint {
  return BigInt(filter.toBlock) - BigInt(filter.fromBlock) + 1n
}

/**
 * A stub whose `request` is genuinely asynchronous, so OVERLAP is observable: it records the number
 * of requests in flight at the instant each one is dispatched, plus the peak ever reached.
 *
 * `settle` controls when a request finishes and defaults to a macrotask (`setTimeout(0)`) — long
 * enough that every sibling in a concurrent batch is dispatched before any of them completes, so
 * `inFlightAt` reads as a clean `1,2,…,N` run per batch (which is what {@link batchSizes} decodes).
 * Tests that care about COMPLETION order override it.
 */
function concurrentStub(
  handler: (filter: any) => unknown[],
  settle: (ctx: { filter: any; inFlight: number }) => Promise<void> = () => new Promise((r) => setTimeout(r, 0)),
): { client: any; filters: any[]; inFlightAt: number[]; state: { peak: number } } {
  const filters: any[] = []
  const inFlightAt: number[] = []
  const state = { peak: 0 }
  let inFlight = 0
  return {
    filters,
    inFlightAt,
    state,
    client: {
      request: async (args: any) => {
        if (args.method !== 'eth_getLogs') throw new Error(`unexpected method ${args.method}`)
        const filter = args.params[0]
        filters.push(filter)
        inFlight++
        inFlightAt.push(inFlight)
        if (inFlight > state.peak) state.peak = inFlight
        try {
          await settle({ filter, inFlight })
          return handler(filter)
        } finally {
          inFlight--
        }
      },
    },
  }
}

/**
 * The scan's DISPATCH PATTERN, recovered from {@link concurrentStub}'s per-request in-flight counts:
 * a batch of N dispatches as the run `1,2,…,N` (nothing settles in between), so a new `1` starts a
 * new batch and every higher value extends the current one. `[1, 4, 4, 1]` reads as "one alone, two
 * batches of four, one alone".
 */
function batchSizes(inFlightAt: number[]): number[] {
  const out: number[] = []
  for (const n of inFlightAt) {
    if (n === 1) out.push(1)
    else out[out.length - 1] = n
  }
  return out
}

/** A `sleep` that records what it was asked to wait, so backoff is asserted without wall-clock. */
function recorder(): { sleep: (ms: number) => Promise<void>; delays: number[] } {
  const delays: number[] = []
  return {
    delays,
    sleep: async (ms: number) => {
      delays.push(ms)
    },
  }
}

test('bisects on provider caps and reports coverage', async () => {
  const { client, filters } = stub((filter) => {
    const from = BigInt(filter.fromBlock)
    const to = BigInt(filter.toBlock)
    if (to - from > 1000n) throw new Error('query returned more than 10000 results')
    return from <= 550n && to >= 550n ? [{ blockNumber: '0x226' }] : []
  })
  const res = await scanLogs(client, { address: '0x1', topics: [] } as any, { fromBlock: 0n, toBlock: 5000n }, {})
  expect(res.logs).toHaveLength(1)
  expect(res.complete).toBe(true)
  expect(res.covered.reduce((s, r) => s + (r.toBlock - r.fromBlock + 1n), 0n)).toBe(5001n)
  expect(BigInt(filters[0].toBlock)).toBe(5000n) // recent-first
})

// ---------------------------------------------------------------------------
// S1: the scan STARTS WIDE and bisects down, rather than starting at a
// conservative width it can never grow past.
//
// The old shape (`INITIAL_CHUNK = 10_000n` as both the start and the regrowth
// ceiling) could not discover anything: it asked for 10k, was served 10k, and
// asked for 10k again — ~100 round trips for a history a generous endpoint
// serves in one, at a per-request latency that barely moves with the width
// (456ms for 10k blocks vs 89ms for 1M, measured live). These pin the new
// contract: `min(remaining range, opts.initialChunk ?? MAX_SCAN_WINDOW)` on the
// first request, refusals bisect down in ~log2 steps, and regrowth climbs back
// toward the ceiling rather than toward a fixed 10k.
// ---------------------------------------------------------------------------

test('S1: a range narrower than the ceiling is asked for in ONE request, not a ladder of fixed windows', async () => {
  const { client, filters } = stub(() => [])
  const res = await scanLogs(client, QUERY, { fromBlock: 0n, toBlock: 20_000n }, {})

  expect(filters).toHaveLength(1) // the old fixed 10k start cost two, and a 26M-block history ~2,600
  expect(span(filters[0]!)).toBe(20_001n) // exactly the remaining range — nothing wider is ever useful
  expect(res.complete).toBe(true)
})

test('S1: a range wider than the ceiling starts at exactly MAX_SCAN_WINDOW', async () => {
  const { client, filters } = stub(() => [])
  const res = await scanLogs(client, QUERY, { fromBlock: 1n, toBlock: 50_000_000n }, {})

  expect(span(filters[0]!)).toBe(MAX_SCAN_WINDOW) // capped by the ceiling, not by the range
  expect(filters.every((f) => span(f) <= MAX_SCAN_WINDOW)).toBe(true)
  expect(res.complete).toBe(true)
})

test('S1: bisection from a wide start converges on a hard cap in ~log2 failed probes', async () => {
  // The cost of starting wide, priced exactly. A hard 2,000-block cap is ~13 halvings below
  // MAX_SCAN_WINDOW; each one is a validation refusal (fast, no query work), they happen once per
  // scan, and the within-scan ratchet plus the index's coverage cache keep them from recurring.
  const cap = 2_000n
  const ac = new AbortController()
  const { client, filters } = stub((filter) => {
    if (span(filter) > cap) throw new Error('exceeds max block range')
    ac.abort() // the descent is what this measures; stop before walking 16M blocks 1,953 at a time
    return []
  })

  await scanLogs(client, QUERY, { fromBlock: 1n, toBlock: 20_000_000n }, { signal: ac.signal })

  const spans = filters.map(span)
  const probes = spans.filter((s) => s > cap)
  // 16,000,000 -> 8M -> 4M -> 2M -> 1M -> 500k -> 250k -> 125k -> 62,500 -> 31,250 -> 15,625 ->
  // 7,812 -> 3,906, and 1,953 is the first window the endpoint will serve: 13 refusals, once.
  expect(probes).toHaveLength(13)
  expect(probes.length).toBeLessThanOrEqual(Math.ceil(Math.log2(Number(MAX_SCAN_WINDOW / cap))) + 1)
  expect(spans[0]).toBe(MAX_SCAN_WINDOW)
  expect(spans[spans.length - 1]).toBe(1_953n) // and it lands just under the cap, not at MIN_CHUNK
  expect(spans.every((s, i) => i === 0 || s === spans[i - 1]! / 2n)).toBe(true) // every step is a halving
})

test('S1: a TIMEOUT-shaped refusal collapses the window in ONE step instead of thirteen halvings', async () => {
  // The halving ladder prices every refusal as free. A provider that hangs until viem gives up does
  // not refuse for free: viem has already retried three times at ~10s before this scanner sees the
  // error, so 13 halvings from MAX_SCAN_WINDOW is ~9 minutes of zero progress. One expensive failure
  // must buy the whole descent.
  const { client, filters } = stub((filter) => {
    if (span(filter) > DESCENT_TIMEOUT_FALLBACK) {
      const err = new Error('The request took too long to respond.')
      err.name = 'TimeoutError' // viem's real timeout class — `classifyRpcError` reads the name
      throw err
    }
    return []
  })

  const res = await scanLogs(client, QUERY, { fromBlock: 1n, toBlock: 20_000_000n }, { sleep: recorder().sleep })

  const spans = filters.map(span)
  // The DESCENT is what this measures — every request before the first the endpoint accepted.
  // (Steady-state regrowth probes afterwards are the pre-existing 1-per-CHUNK_REGROWTH_SUCCESSES
  // trade, unchanged by S1 and bounded by the test below it.)
  const descent = spans.slice(0, spans.findIndex((s) => s <= DESCENT_TIMEOUT_FALLBACK))
  expect(descent).toHaveLength(1) // ONE timeout paid, not thirteen
  expect(spans[0]).toBe(MAX_SCAN_WINDOW) // it still starts wide...
  expect(spans[1]).toBe(DESCENT_TIMEOUT_FALLBACK) // ...and lands on the fallback in a single step
  expect(res.complete).toBe(true)
})

// (The collapse's ONE-SHOT guard — a timeout at or below DESCENT_TIMEOUT_FALLBACK halving as usual
// rather than re-collapsing — is a single transition and lives in `logScanPolicy.test.ts` as
// "AT the fallback width a transport failure halves as usual". What the scan level adds over it is
// the collapse's effect on a real walk, which the test above pins.)

test('S1: regrowth ratchets PAST the old 10k ceiling, back up to the width the endpoint really serves', async () => {
  // Cap-then-recovery: the endpoint refuses anything over 100k for the first stretch, then stops
  // refusing. Under the old shape the window could never exceed 10,000 no matter what the endpoint
  // was willing to serve; now the ratchet climbs back toward MAX_SCAN_WINDOW.
  let successes = 0
  const { client, filters } = stub((filter) => {
    const capNow = successes >= 2 ? MAX_SCAN_WINDOW : 100_000n // the transient cap lifts after 2 clean chunks
    if (span(filter) > capNow) throw new Error('query returned more than 10000 results')
    successes++
    return []
  })

  const res = await scanLogs(client, QUERY, { fromBlock: 1n, toBlock: 4_000_000n }, {})

  const widestServed = filters.map(span).reduce((a, b) => (b > a ? b : a))
  expect(widestServed).toBeGreaterThan(10_000n) // the old ceiling is not a ceiling any more
  expect(widestServed).toBeGreaterThanOrEqual(125_000n) // it climbed strictly past the transient cap
  expect(res.complete).toBe(true) // and the ratchet never disturbs the coverage math
})

test('opts.initialChunk (C4-P6) is a CEILING override: the start and every regrowth stay under it', async () => {
  const { client, filters } = stub(() => []) // every chunk succeeds — nothing forces a shrink
  const res = await scanLogs(client, QUERY, { fromBlock: 0n, toBlock: 10_000n }, { initialChunk: 2_000n })

  expect(span(filters[0]!)).toBe(2_000n) // the FIRST request spans exactly the override, not the range
  expect(res.complete).toBe(true)
  // Every chunk regrows toward 2_000n after CHUNK_REGROWTH_SUCCESSES clean requests, never past it —
  // the override is the ceiling, which is the whole point of the option.
  expect(filters.every((f) => span(f) <= 2_000n)).toBe(true)
})

test('opts.initialChunk still yields to a NARROWER remaining range — the start is min(range, ceiling)', async () => {
  const { client, filters } = stub(() => [])
  await scanLogs(client, QUERY, { fromBlock: 0n, toBlock: 500n }, { initialChunk: 2_000n })

  expect(filters).toHaveLength(1)
  expect(span(filters[0]!)).toBe(501n) // asking for 2,000 blocks of a 501-block range buys nothing
})

test('abort stops between chunks, complete=false', async () => {
  const ac = new AbortController()
  const { client } = stub(() => {
    ac.abort()
    return []
  })
  // Wider than MAX_SCAN_WINDOW, so the first (widest possible) chunk cannot finish the range on its
  // own and the abort actually has a between-chunks gap to land in.
  const res = await scanLogs(
    client,
    { address: '0x1', topics: [] } as any,
    { fromBlock: 0n, toBlock: 50_000_000n },
    { signal: ac.signal },
  )
  expect(res.complete).toBe(false)
})

// ---------------------------------------------------------------------------
// Regression: the query's topic filter must survive all the way to the wire.
//
// This scanner used to call viem's `getLogs` action, which builds `topics`
// exclusively from an `event`/`events` ABI argument and silently discards a
// caller-supplied `topics` field — so every scan went out as an unfiltered
// "give me every log this contract emitted" query. Discovery still worked
// (`parsePoolLog` drops what it cannot decode), which is exactly why the defect
// was invisible: the only symptom was that a creation-event lookup dragged back
// the contract's entire event stream and fought the provider's result cap all
// the way down to the minimum window. A fork run made it visible; these two
// tests keep it visible.
// ---------------------------------------------------------------------------

test('sends the query address and topic filter verbatim, with hex-encoded block bounds', async () => {
  const topics = ['0xaaa', null, '0xbbb', '0xccc'] as any
  const { client, filters } = stub(() => [])

  await scanLogs(client, { address: '0xfactory', topics }, { fromBlock: 16n, toBlock: 255n }, {})

  expect(filters).toHaveLength(1)
  expect(filters[0].address).toBe('0xfactory')
  expect(filters[0].topics).toEqual(topics)
  expect(filters[0].fromBlock).toBe('0x10')
  expect(filters[0].toBlock).toBe('0xff')
})

test('normalizes raw hex-encoded logs into the Log shape callers expect', async () => {
  // A node answers with hex strings, while `PoolRecord.createdAtBlock` and every coverage
  // comparison downstream are bigints — an unformatted log would poison the index with `"0x2a"`.
  const { client } = stub(() => [
    {
      address: '0xfactory',
      topics: ['0xaaa'],
      data: '0x',
      blockNumber: '0x2a',
      logIndex: '0x1',
      transactionIndex: '0x0',
    },
  ])

  const res = await scanLogs(
    client,
    { address: '0xfactory', topics: ['0xaaa'] } as any,
    { fromBlock: 0n, toBlock: 100n },
    {},
  )

  expect(res.logs).toHaveLength(1)
  expect(res.logs[0]!.blockNumber).toBe(42n)
  expect(res.logs[0]!.logIndex).toBe(1)
})

// ---------------------------------------------------------------------------
// Durability: the window must grow back, the scan must be budgeted, and retries
// against a failing endpoint must back off.
//
// Halving alone is a one-way ratchet — one transient error early in a
// multi-million-block walk used to pin every remaining request at a tiny
// window, and with no request budget and no backoff the only exit was an
// `AbortSignal` the zero-config path never passes. Each test below pins one of
// the three mechanisms; each fails if its mechanism is removed.
// ---------------------------------------------------------------------------

test('grows the window back after a transient failure instead of staying collapsed', async () => {
  // The ceiling is pinned (`initialChunk`) so the regrowth LADDER is what this measures, not the
  // starting width: a wide start would swallow this 100k range in one or two requests and never
  // exercise the doubling at all. The property — halve on failure, double back after
  // CHUNK_REGROWTH_SUCCESSES clean chunks, never past the ceiling — is unchanged by S1.
  const CEILING = 10_000n
  let failed = false
  const { client, filters } = stub(() => {
    if (!failed) {
      failed = true
      throw new Error('query returned more than 10000 results')
    }
    return []
  })

  const res = await scanLogs(client, QUERY, { fromBlock: 1n, toBlock: 100_000n }, { initialChunk: CEILING })

  const spans = filters.map(span)
  expect(spans[0]).toBe(CEILING) // the probe that failed
  // ...then the halved window, for exactly as many chunks as regrowth requires...
  expect(spans.slice(1, 1 + CHUNK_REGROWTH_SUCCESSES)).toEqual(
    Array.from({ length: CHUNK_REGROWTH_SUCCESSES }, () => CEILING / 2n),
  )
  // ...and then back to full speed, where it stays.
  expect(spans[1 + CHUNK_REGROWTH_SUCCESSES]).toBe(CEILING)
  expect(spans.slice(1 + CHUNK_REGROWTH_SUCCESSES).every((s) => s === CEILING)).toBe(true)
  // Regrowth must not disturb the recent-first coverage math.
  expect(res.complete).toBe(true)
  expect(res.covered).toEqual([{ fromBlock: 1n, toBlock: 100_000n }])
})

test('never grows the window past the ceiling', async () => {
  const CEILING = 10_000n
  const { client, filters } = stub(() => [])

  const res = await scanLogs(client, QUERY, { fromBlock: 1n, toBlock: 100_000n }, { initialChunk: CEILING })

  expect(filters.map(span).every((s) => s === CEILING)).toBe(true)
  expect(filters).toHaveLength(10) // 100_000 blocks / 10_000 — uncapped doubling would take fewer
  expect(res.complete).toBe(true)
})

test('stabilizes under a hard provider cap, with regrowth probes bounded', async () => {
  // The permanent-cap case regrowth costs something: every probe above the cap is a wasted request.
  // It must stay a fixed, small fraction of the scan rather than growing with it.
  const cap = 2000n
  const { client, filters } = stub((filter) => {
    if (span(filter) > cap) throw new Error('exceeds max block range')
    return []
  })

  const res = await scanLogs(client, QUERY, { fromBlock: 1n, toBlock: 100_000n }, {})

  const spans = filters.map(span)
  const probes = spans.filter((s) => s > cap).length
  const accepted = spans.length - probes
  const acceptedSpans = spans.filter((s) => s <= cap)
  const stabilized = acceptedSpans[0]!
  // Every accepted chunk is the same stabilized window — 100_000 (the whole range, since it fits
  // under MAX_SCAN_WINDOW) halved six times is the first window under the cap — so the scan settles
  // instead of grinding down toward MIN_CHUNK. The final chunk is the exception, clamped by
  // `fromBlock` to whatever is left of the range.
  expect(stabilized).toBe(1_562n)
  expect(acceptedSpans.slice(0, -1).every((s) => s === stabilized)).toBe(true)
  expect(acceptedSpans[acceptedSpans.length - 1]!).toBeLessThanOrEqual(stabilized)
  expect(res.complete).toBe(true) // every block still covered, at the cap-sized window
  expect(probes).toBeGreaterThan(6) // 6 halvings to find the cap, then it keeps probing...
  expect(probes).toBeLessThanOrEqual(6 + Math.ceil(accepted / CHUNK_REGROWTH_SUCCESSES)) // ...at most one per N
})

test('stops at the request budget instead of scanning forever', async () => {
  // An endpoint that fails everything: without a budget this walks 10M blocks 128 at a time,
  // three attempts each, with no exit at all on the zero-config path.
  const { client, filters } = stub(() => {
    throw new Error('rate limited')
  })
  const { sleep } = recorder()

  const res = await scanLogs(client, QUERY, { fromBlock: 0n, toBlock: 10_000_000n }, { sleep })

  expect(filters).toHaveLength(MAX_REQUESTS_PER_SCAN) // every attempt counts, successes and failures
  expect(res.complete).toBe(false)
  expect(res.covered).toEqual([])
  expect(res.logs).toEqual([])
})

test('backs off exponentially between retries at the minimum window', async () => {
  const { client } = stub(() => {
    throw new Error('rate limited')
  })
  const { sleep, delays } = recorder()

  await scanLogs(client, QUERY, { fromBlock: 0n, toBlock: 2_000n }, { sleep })

  // Escalation survives giving a sub-range up: the endpoint is what is unwell, not the range.
  expect(delays.slice(0, 5)).toEqual([
    BACKOFF_BASE_MS,
    BACKOFF_BASE_MS * 2,
    BACKOFF_BASE_MS * 4,
    BACKOFF_MAX_MS,
    BACKOFF_MAX_MS,
  ])
})

test('stops sleeping once the total backoff budget is spent, and still terminates', async () => {
  // Per-retry caps do not compose: a full request budget of maximum-length backoffs would be over
  // two hours of pure sleep. Past the total budget the retries continue without waiting, and the
  // request budget — not the sleeping — is what ends the scan.
  const { client, filters } = stub(() => {
    throw new Error('rate limited')
  })
  const { sleep, delays } = recorder()

  const res = await scanLogs(client, QUERY, { fromBlock: 0n, toBlock: 10_000_000n }, { sleep })

  expect(delays.reduce((a, b) => a + b, 0)).toBe(MAX_BACKOFF_TOTAL_MS) // not one millisecond more
  expect(delays.length).toBeLessThan(filters.length / 10) // the vast majority of retries never slept
  expect(filters).toHaveLength(MAX_REQUESTS_PER_SCAN) // and the scan still ran to its request budget
  expect(res.complete).toBe(false)
})

test('an abort during backoff stops the scan without another request', async () => {
  const ac = new AbortController()
  const { client, filters } = stub(() => {
    throw new Error('rate limited')
  })
  const delays: number[] = []
  let requestsAtAbort = -1

  const res = await scanLogs(
    client,
    QUERY,
    { fromBlock: 0n, toBlock: 2_000n },
    {
      signal: ac.signal,
      sleep: async (ms: number) => {
        delays.push(ms)
        if (delays.length === 2) {
          ac.abort()
          requestsAtAbort = filters.length
        }
      },
    },
  )

  expect(delays).toHaveLength(2) // no third failure, so no third backoff
  expect(filters).toHaveLength(requestsAtAbort) // nothing was asked for after the abort
  expect(res.complete).toBe(false)
})

test('the real backoff timer resolves on time and is cleared by an abort', async () => {
  // The default `sleep` is the only timer this package creates, so a pending backoff is the only
  // thing that can hold a Node event loop open after a caller walks away. An abort must clear it.
  const started = Date.now()
  await delay(20)
  expect(Date.now() - started).toBeGreaterThanOrEqual(15)

  const ac = new AbortController()
  const abortStarted = Date.now()
  const pending = delay(60_000, ac.signal)
  ac.abort()
  await pending
  expect(Date.now() - abortStarted).toBeLessThan(1_000)

  await delay(10, AbortSignal.abort()) // already-aborted signal: resolves immediately, no timer
})

// ---------------------------------------------------------------------------
// R2: the declared-cap fast path.
//
// Every failure message below is a verbatim live capture from
// `../internal/__fixtures__/providerErrors.json`, fed through the stub — so
// these test the scanner against what providers ACTUALLY say, not against a
// paraphrase that happens to match the parser. If a re-capture changes the
// wording, these fail alongside the parser's own tests in `rpcErrors.test.ts`.
// ---------------------------------------------------------------------------

/** The captured message for one endpoint, thrown the way viem surfaces it. */
function providerFailure(endpoint: keyof typeof providerErrors): Error {
  const err = new Error(providerErrors[endpoint].message)
  err.name = 'HttpRequestError'
  return err
}

test('R2: a declared cap BELOW MIN_CHUNK gives the sub-range up at once — no retries, no backoff', async () => {
  // blastapi caps public `eth_getLogs` at ten blocks: nine halvings under MIN_CHUNK, so the
  // bisection can never reach a window this endpoint will serve. Before the fast path, each
  // sub-range cost a full halving ladder (10_000 -> 128) plus MAX_CONSECUTIVE_MIN_FAILURES retries
  // plus an exponential backoff escalation, all to rediscover a fact the FIRST error stated.
  const { client, filters } = stub(() => {
    throw providerFailure('eth-mainnet.public.blastapi.io')
  })
  const { sleep, delays } = recorder()

  const res = await scanLogs(client, QUERY, { fromBlock: 0n, toBlock: 5_000n }, { sleep })

  expect(filters).toHaveLength(1) // ONE request for the whole range, then the honest give-up
  expect(delays).toEqual([]) // the endpoint is capping, not throttling: nothing to back off from
  expect(res.logs).toEqual([])
  // Coverage is reported honestly rather than optimistically: nothing was served, nothing is claimed.
  expect(res.covered).toEqual([])
  expect(res.complete).toBe(false)
})

test('R2: the give-up is per sub-range and still walks the whole span, one request per window', async () => {
  // The budget is what this protects. With the ceiling pinned at 10,000 a 40,000-block range is four
  // windows, so a capped endpoint costs four requests total — versus (4 windows x ~7 halvings x 3
  // retries) and a full MAX_BACKOFF_TOTAL_MS of sleeping under the old path. The ceiling is pinned
  // here rather than left at MAX_SCAN_WINDOW precisely so this stays a MULTI-sub-range test: at the
  // default ceiling the whole 40k range is one window, which is the case the test above already covers.
  const CEILING = 10_000n
  const { client, filters } = stub(() => {
    throw providerFailure('eth-mainnet.public.blastapi.io')
  })
  const { sleep, delays } = recorder()

  const res = await scanLogs(client, QUERY, { fromBlock: 1n, toBlock: 40_000n }, { sleep, initialChunk: CEILING })

  expect(filters).toHaveLength(4)
  expect(delays).toEqual([])
  expect(res.complete).toBe(false)
  expect(filters.every((f) => span(f) === CEILING)).toBe(true)
  expect(filters.length).toBeLessThan(MAX_REQUESTS_PER_SCAN)
})

test('R2: a SPAN cap below MIN_CHUNK is remembered as NOTHING — the second scan costs exactly what the first did', async () => {
  // The capture above (blastapi) states its ten-block cap as a DENSITY observation. This is the same
  // unserveable width stated as a durable SPAN POLICY — quicknode's wording, whose whole point is
  // that a span cap is a CEILING the scanner adopts for the rest of the endpoint's life. Below
  // MIN_CHUNK it must adopt nothing, and this is the test that says so across the seam where it
  // matters: `ScanWidthMemory`, and the scan after it.
  //
  // WHY TWO SCANS. A recorded ceiling of 10 is invisible in the FIRST scan, which keeps its wide
  // width and abandons the range in two strides — and total from the second onwards, because
  // `initialPolicy` has no MIN_CHUNK floor: it opens at chunkSize 10, the endpoint SERVES 10 blocks
  // (its real cap is 10), nothing ever fails, nothing is ever given up, and the scan spends its
  // entire MAX_REQUESTS_PER_SCAN budget covering 40,000 blocks of a 20,000,000-block range. Every
  // later scan on that router does it again. The honest outcome is the one asserted here: this
  // endpoint cannot serve a window this scanner is willing to pay for, so every scan says so in two
  // requests and claims no coverage.
  const memory: { learnedScanWidth?: bigint; declaredScanCap?: bigint } = {}
  const handler = (filter: any): unknown[] => {
    if (span(filter) > 10n) throw new Error('eth_getLogs is limited to a 10 range')
    return []
  }
  const range = { fromBlock: 1n, toBlock: 20_000_000n }

  const first = stub(handler)
  const firstRes = await scanLogs(first.client, QUERY, range, { sleep: recorder().sleep, widthMemory: memory })

  // Two requests: the 16M-block ceiling window, then the 4M-block remainder — each refused, each
  // given up on the spot at the width it was asked at, which is what makes the abandonment cheap.
  expect(first.filters.map(span)).toEqual([MAX_SCAN_WINDOW, 4_000_000n])
  expect(firstRes.covered).toEqual([])
  expect(firstRes.complete).toBe(false)

  // NOTHING IS REMEMBERED. Not the cap (it is not a width this scanner can use, so recording it as a
  // ceiling is recording a lie the next scan then acts on), and not a learned width (nothing served).
  expect(memory.declaredScanCap).toBeUndefined()
  expect(memory.learnedScanWidth).toBeUndefined()

  const second = stub(handler)
  const secondRes = await scanLogs(second.client, QUERY, range, { sleep: recorder().sleep, widthMemory: memory })

  expect(second.filters.map(span)).toEqual(first.filters.map(span)) // not 4,000 requests of ten blocks
  expect(secondRes.requests).toBe(firstRes.requests)
  expect(secondRes.covered).toEqual([])
  expect(secondRes.complete).toBe(false)
})

test('R2: a declared SERVEABLE cap is jumped to directly — no blind halving toward it', async () => {
  // drpc states a workable span (25683953-25685027 = 1,075 blocks) rather than a block cap. The
  // scanner takes its WIDTH as the next window: reaching 1,075 by halving from 10,000 would take
  // four probes (5000, 2500, 1250, 625 — overshooting to less than the cap allows), and the endpoint
  // already said what it would accept.
  const declaredWidth = 25_685_027n - 25_683_953n + 1n
  const { client, filters } = stub((filter) => {
    if (span(filter) > declaredWidth) throw providerFailure('eth.drpc.org')
    return []
  })
  const { sleep, delays } = recorder()

  const res = await scanLogs(client, QUERY, { fromBlock: 0n, toBlock: 20_000n }, { sleep })

  expect(span(filters[0]!)).toBe(20_001n) // the first attempt is the whole range (S1's wide start)
  expect(span(filters[1]!)).toBe(declaredWidth) // ...and the SECOND is exactly what drpc declared
  expect(filters[1]!.toBlock).toBe(filters[0]!.toBlock) // same cursor, narrower window — nothing skipped
  expect(delays).toEqual([]) // a cap, not an outage
  expect(res.complete).toBe(true) // and the whole range is still covered, at the declared width
})

test('R2 x S1: a cap declared partway DOWN the descent is jumped to, cutting the rest of the ladder', async () => {
  // The interaction the wide start makes newly reachable: the first few refusals say nothing useful
  // (some endpoints just error on an absurd span), and only once the window is within shouting
  // distance does the provider quote a workable one. The moment it does, the remaining ~10 halvings
  // are skipped — the ladder is a search for an answer the endpoint has now handed over.
  const declaredWidth = 25_685_027n - 25_683_953n + 1n
  const ac = new AbortController()
  const { client, filters } = stub((filter) => {
    const width = span(filter)
    if (width > 1_000_000n) throw new Error('invalid params') // no cap stated, not transport: keep halving
    if (width > declaredWidth) throw providerFailure('eth.drpc.org') // now it states one
    ac.abort() // the descent is the subject; stop once it lands
    return []
  })

  await scanLogs(client, QUERY, { fromBlock: 1n, toBlock: 20_000_000n }, { sleep: recorder().sleep, signal: ac.signal })

  const spans = filters.map(span)
  expect(spans.slice(0, 5)).toEqual([MAX_SCAN_WINDOW, 8_000_000n, 4_000_000n, 2_000_000n, 1_000_000n]) // blind halving
  expect(spans[5]).toBe(declaredWidth) // then straight to the declared width, not 500_000
  expect(spans).toHaveLength(6) // ~10 further halvings never happened
})

test('R2: an undeclared cap still bisects exactly as before', async () => {
  // The control. The publicnode capture declares no window at all, so the pre-existing halving
  // ladder must be untouched: window halves, no give-up, coverage completes.
  const { client, filters } = stub((filter) => {
    if (span(filter) > 2_500n) throw providerFailure('ethereum.publicnode.com')
    return []
  })

  const res = await scanLogs(client, QUERY, { fromBlock: 0n, toBlock: 30_000n }, { sleep: recorder().sleep })

  expect(span(filters[0]!)).toBe(30_001n) // the whole range
  expect(span(filters[1]!)).toBe(15_000n) // halved, not jumped
  expect(res.complete).toBe(true)
})

// (A cap WIDER than the window in flight explaining nothing — no clamp, ordinary halving — is one
// transition over synthetic facts, and lives in `logScanPolicy.test.ts` as "a declared cap WIDER
// than the window in flight explains nothing"; the wording it has to survive is pinned by
// `rpcErrors.test.ts`. Neither half needs a scan around it.)

// ---------------------------------------------------------------------------
// P1: concurrent chunk dispatch WITHIN one scan.
//
// The scanner used to walk a range strictly one chunk at a time, which — after
// S1 made most queries a request or two — left the narrow-cap queries (v4
// adjacency caps between 200k and 1M blocks on a keyed mainnet endpoint) and
// every post-descent walk serializing against a router semaphore that was
// measured 7/20 utilized during a full cold drain.
//
// The split these tests pin is between the SEARCH and the WALK. Finding the
// width an endpoint will serve is inherently sequential (each answer picks the
// next question), so the descent is untouched and a failure re-enters it. Once
// a width has actually been SERVED, the remaining same-width sub-ranges are
// disjoint and independent, and they go out together.
// ---------------------------------------------------------------------------

test('P1: once a width is established, same-width chunks are dispatched CONCURRENTLY', async () => {
  const CEILING = 1_000n
  const { client, filters, inFlightAt, state } = concurrentStub(() => [])

  const res = await scanLogs(client, QUERY, { fromBlock: 1n, toBlock: 20_000n }, { initialChunk: CEILING })

  expect(state.peak).toBe(SCAN_CHUNK_CONCURRENCY) // the whole point: >1 request in flight from ONE scan
  expect(state.peak).toBeGreaterThanOrEqual(2)
  expect(inFlightAt[0]).toBe(1) // ...but never on the first chunk, which is what establishes the width
  // The width is at the ceiling here, so doubling is a no-op and no batch has to stop short of a
  // regrowth boundary: one establishing chunk, then full batches, then the 3-chunk remainder.
  expect(batchSizes(inFlightAt)).toEqual([1, 4, 4, 4, 4, 3])
  expect(filters).toHaveLength(20) // 20,000 blocks / 1,000 — the same count the sequential walk cost
  expect(res.complete).toBe(true)
  expect(res.covered).toEqual([{ fromBlock: 1n, toBlock: 20_000n }])
})

test('P1: the descent is sequential, and only a width the endpoint has SERVED is dispatched in parallel', async () => {
  const cap = 1_000n
  const { client, inFlightAt } = concurrentStub((filter) => {
    if (span(filter) > cap) throw new Error('exceeds max block range')
    return []
  })

  await scanLogs(client, QUERY, { fromBlock: 1n, toBlock: 40_000n }, {})

  // 40,001 -> 20,000 -> 10,000 -> 5,000 -> 2,500 -> 1,250 are all refused, ONE AT A TIME: a bisection
  // is a search, and six simultaneous refusals would buy nothing the first one did not already say.
  // 625 is the first width served, and it too goes out alone — nothing had proven it yet. Only then
  // does the walk batch, and the batch is CHUNK_REGROWTH_SUCCESSES - 1 rather than a full
  // SCAN_CHUNK_CONCURRENCY: below the ceiling a batch stops at the regrowth boundary so the ratchet
  // still doubles after exactly CHUNK_REGROWTH_SUCCESSES clean chunks, counting the establishing one.
  // The `1` after it is that doubled 1,250 probe — refused again, and alone, because a width nothing
  // has served is exactly the state the scan opened in.
  expect(batchSizes(inFlightAt).slice(0, 9)).toEqual([1, 1, 1, 1, 1, 1, 1, CHUNK_REGROWTH_SUCCESSES - 1, 1])
})

test('P1: a failure inside a batch falls back to the sequential path, and the failed chunk covers NOTHING', async () => {
  // One poisoned block the endpoint refuses to serve at ANY width — so the failure lands mid-batch,
  // and no amount of halving gets past it. This is the case where "concurrent" could quietly become
  // "optimistic": a batch that claimed its whole planned span, or that kept a success sitting BEHIND
  // an unserved chunk, would report coverage for blocks nobody ever read.
  const POISON = 5_000n
  const CEILING = 1_000n
  const { client, inFlightAt } = concurrentStub((filter) => {
    if (BigInt(filter.fromBlock) <= POISON && POISON <= BigInt(filter.toBlock)) throw new Error('server error')
    return []
  })

  const res = await scanLogs(
    client,
    QUERY,
    { fromBlock: 1n, toBlock: 20_000n },
    { initialChunk: CEILING, sleep: recorder().sleep },
  )

  // Exactly one gap, exactly the width of the sub-range the endpoint gave up on (MIN_CHUNK, after
  // 1,000 -> 500 -> 250 -> 128 and MAX_CONSECUTIVE_MIN_FAILURES retries there). Everything else is
  // covered — including the tail of the failed batch, which was discarded on the spot and re-walked.
  expect(res.covered).toEqual([
    { fromBlock: 1n, toBlock: 5_000n - MIN_CHUNK },
    { fromBlock: 5_001n, toBlock: 20_000n },
  ])
  expect(res.covered.some((r) => r.fromBlock <= POISON && POISON <= r.toBlock)).toBe(false)
  expect(res.complete).toBe(false)

  // The dispatch pattern: establish, four clean batches (the fourth is the one that contained the
  // poisoned chunk — it still went out four-wide), then strictly one at a time while the descent
  // re-derives a width for that sub-range.
  const sizes = batchSizes(inFlightAt)
  expect(sizes.slice(0, 5)).toEqual([1, 4, 4, 4, 4])
  expect(sizes.slice(5, 9)).toEqual([1, 1, 1, 1])
})

test('P1: the request budget stays EXACT under concurrency — a batch never overshoots it', async () => {
  // `MAX_REQUESTS_PER_SCAN` counts dispatched requests, and a batch pays for all of its chunks before
  // any of them answers. Without clamping the batch to what is left, the last one would step over the
  // line (1 establishing + 4n lands on 3,997, and a full batch from there is 4,001).
  const { client, filters } = concurrentStub(
    () => [],
    () => Promise.resolve(), // no timer: 4,000 requests, and overlap is still real (nothing settles mid-batch)
  )

  const res = await scanLogs(client, QUERY, { fromBlock: 0n, toBlock: 2_000_000n }, { initialChunk: MIN_CHUNK })

  expect(filters).toHaveLength(MAX_REQUESTS_PER_SCAN) // not one request more
  expect(res.complete).toBe(false) // the range is far wider than the budget can walk at MIN_CHUNK
})

test('P1: results are ordered by BLOCK, not by arrival — a batch that answers backwards is still recent-first', async () => {
  // The one thing a caller can actually observe about dispatch order. Here the batch completes in the
  // exact REVERSE of the order it was planned (the newest chunk, dispatched first, answers last), so
  // anything that appended logs or coverage as they landed would come back inverted.
  const { client } = concurrentStub(
    (filter) => [
      {
        address: '0x1',
        topics: [],
        data: '0x',
        blockNumber: filter.toBlock,
        logIndex: '0x0',
        transactionIndex: '0x0',
      },
    ],
    ({ inFlight }) => new Promise((r) => setTimeout(r, 10 - inFlight)),
  )

  const res = await scanLogs(client, QUERY, { fromBlock: 1n, toBlock: 8_000n }, { initialChunk: 1_000n })

  const blocks = res.logs.map((l) => l.blockNumber!)
  expect(blocks).toHaveLength(8)
  expect(blocks).toEqual([...blocks].sort((a, b) => (a > b ? -1 : 1))) // strictly descending: recent-first
  expect(res.covered).toEqual([{ fromBlock: 1n, toBlock: 8_000n }])
  expect(res.complete).toBe(true)
})

test('P1: an abort stops the scan BETWEEN batches — the batch in flight is kept, nothing new is dispatched', async () => {
  const ac = new AbortController()
  let answered = 0
  const { client, filters, inFlightAt } = concurrentStub(() => {
    if (++answered === 6) ac.abort() // partway through the third batch
    return []
  })

  const res = await scanLogs(
    client,
    QUERY,
    { fromBlock: 1n, toBlock: 100_000n },
    { initialChunk: 1_000n, signal: ac.signal },
  )

  // One establishing chunk, then two full batches — the second of which was already in flight when
  // the signal tripped. It is allowed to finish and its chunks are kept: they were paid for and
  // honestly served, and dropping them would be its own kind of dishonesty. Nothing is dispatched
  // after it, which is the guarantee the between-chunks check gave before P1 and still gives now.
  expect(batchSizes(inFlightAt)).toEqual([1, 4, 4])
  expect(filters).toHaveLength(9)
  expect(res.complete).toBe(false)
  const claimed = res.covered.reduce((s, r) => s + (r.toBlock - r.fromBlock + 1n), 0n)
  expect(claimed).toBe(9_000n) // exactly the nine chunks served, not one block more
})

test('P1: an abort drains the queued batch instead of firing it — no request goes out after the signal', async () => {
  // THE FAILURE THIS PINS. `createSemaphore` is a plain FIFO with no abort awareness: a queued
  // acquire resolves whenever a permit frees, knowing nothing about a signal that fired while it
  // waited. With a batch of four behind a busy router that meant four full `eth_getLogs` going out
  // AFTER the caller walked away — and the more concurrency P1 added, the more of them there were.
  const ac = new AbortController()
  const gate = createSemaphore(1) // forces the batch to drain one at a time, so the abort lands mid-batch
  let served = 0
  const { client, filters } = concurrentStub(() => {
    // Not the establishing chunk (that would abort before any batch is ever planned) — the FIRST
    // chunk of the first four-wide batch, leaving three siblings queued on the semaphore behind it.
    if (++served === 2) ac.abort()
    return []
  })

  const res = await scanLogs(
    client,
    QUERY,
    { fromBlock: 1n, toBlock: 100_000n },
    { initialChunk: 1_000n, signal: ac.signal, semaphore: gate },
  )

  // One establishing chunk, then the first chunk of the four-wide batch — and then nothing. The three
  // siblings holding queued acquires each check the signal the instant they get their permit and
  // return without touching the transport.
  expect(filters).toHaveLength(2)
  expect(res.complete).toBe(false)
  // A skipped chunk is not a failure: it covers nothing, and it is not evidence about the endpoint
  // either, so the working width is neither halved nor backed off. Coverage is exactly what was served.
  expect(res.covered).toEqual([{ fromBlock: 98_001n, toBlock: 100_000n }])
})

test('P1 (F9): a discarded batch tail still counts against the budget — it really did go to the wire', async () => {
  // The tail of a failed batch is dropped for correctness (see the contiguous-prefix rule), and that
  // must not be mistaken for the requests being free. They were dispatched, the endpoint served them,
  // and the budget has to say so — otherwise a scan that keeps hitting mid-batch failures gets
  // unlimited free retries against `MAX_REQUESTS_PER_SCAN`.
  let served = 0
  const { client, filters, inFlightAt } = concurrentStub(() => {
    // The SECOND chunk of the first full batch fails; the two siblings behind it succeed and are then
    // thrown away by the contiguous-prefix rule.
    if (++served === 3) throw new Error('server error')
    return []
  })

  const res = await scanLogs(client, QUERY, { fromBlock: 1n, toBlock: 20_000n }, { initialChunk: 1_000n })

  expect(batchSizes(inFlightAt).slice(0, 2)).toEqual([1, 4]) // establish, then a full batch of four
  expect(res.complete).toBe(true) // nothing is LOST — the dropped sub-ranges are simply re-walked
  expect(res.covered).toEqual([{ fromBlock: 1n, toBlock: 20_000n }])

  // The accounting this exists for. The whole 20,000-block range is 20 chunks at the established
  // width, and the scan spent strictly more requests than that: the failure itself, the two siblings
  // behind it that were served and discarded, and the narrower re-walk the descent then paid for.
  // Crediting any of those back would hand a scan that keeps failing mid-batch unlimited free retries
  // against MAX_REQUESTS_PER_SCAN.
  expect(filters.length).toBeGreaterThanOrEqual(20 + 3)
  // Every recorded filter is a request that really reached the transport — `requests` is a count of
  // the wire, not of the plan, which is what makes the budget exact (see the budget test above).
  expect(filters.every((f) => span(f) <= 1_000n)).toBe(true)
})

test('P1 (F9): several concurrent scans never exceed the shared semaphore, however wide their batches', async () => {
  // P1's per-scan concurrency MULTIPLIES with the fan-out above it (`search/coverage.ts` runs a scan
  // per protocol per topic position). The router-wide semaphore is what is supposed to make that
  // product safe, and this is the test that it actually does — a bound that only holds for one scan
  // at a time is not a bound.
  const LIMIT = 5
  const gate = createSemaphore(LIMIT)
  let inFlight = 0
  let peak = 0
  const client = {
    request: async () => {
      inFlight++
      if (inFlight > peak) peak = inFlight
      try {
        await new Promise((r) => setTimeout(r, 0))
        return []
      } finally {
        inFlight--
      }
    },
  }

  const scans = Array.from({ length: 6 }, () =>
    scanLogs(client as any, QUERY, { fromBlock: 1n, toBlock: 40_000n }, { initialChunk: 1_000n, semaphore: gate }),
  )
  const results = await Promise.all(scans)

  expect(peak).toBeLessThanOrEqual(LIMIT) // 6 scans x 4 chunks = 24 would be in flight without the gate
  expect(peak).toBeGreaterThan(1) // ...and the gate is not accidentally serializing everything either
  for (const res of results) expect(res.complete).toBe(true)
})

// ---------------------------------------------------------------------------
// A DECLARED CAP IS A CEILING, AND THE CEILING IS REMEMBERED.
//
// Base on quicknode is the endpoint that made both of these matter: a hard
// 10,000-block `eth_getLogs` cap over 48M blocks of v3 history, stated in every
// refusal, and seven scans per cold search.
//
// Reading the cap as only a WIDTH left two things broken that nothing in the
// suite could see, because both are about what happens on the FIFTH clean chunk
// and beyond:
//
//   * the regrowth ratchet doubles straight back past the stated cap, fails,
//     and — since a changed width is a width nothing has served — sends the
//     next chunk out ALONE. Three sequential round trips per four chunks of
//     real work, forever, on an endpoint that had already said what it would
//     serve.
//   * the next scan starts over at MAX_SCAN_WINDOW and halves its way back
//     down to rediscover the same sentence.
// ---------------------------------------------------------------------------

test('a declared cap lowers the CEILING, so regrowth cannot double past it', async () => {
  const CAP = 10_000n
  const { client, filters, inFlightAt } = concurrentStub((filter) => {
    if (span(filter) > CAP) throw new Error('eth_getLogs is limited to a 10,000 range')
    return []
  })

  const res = await scanLogs(client, QUERY, { fromBlock: 1n, toBlock: 200_000n }, {})

  // One refusal (the whole 200,000-block range), then straight to the declared width — and never a
  // request above it again, which is the property the ceiling adds over jumping the width alone.
  expect(span(filters[0]!)).toBe(200_000n)
  expect(filters.slice(1).every((f) => span(f) === CAP)).toBe(true)
  expect(filters.filter((f) => span(f) > CAP)).toHaveLength(1)
  // ...and because the width now SITS AT the ceiling, doubling is a no-op, `widthEstablished`
  // survives it, and the walk runs at full batches instead of collapsing to 1-3-1-3.
  // 20 chunks of 10,000: one establishing, then four full batches, then the 3-chunk remainder.
  expect(batchSizes(inFlightAt).slice(1)).toEqual([1, 4, 4, 4, 4, 3])
  expect(res.complete).toBe(true)
  expect(res.covered).toEqual([{ fromBlock: 1n, toBlock: 200_000n }])
})

test('without the clamp the same walk would re-probe: the un-clamped ratchet is what this replaces', async () => {
  // The control. An endpoint that caps at 10,000 but says NOTHING about it gets the old behaviour —
  // blind halving to 6,250 and a wasted probe at 12,500 after every regrowth boundary — which is
  // exactly the cost the declared-cap clamp above avoids, and is unchanged for providers that
  // decline to say anything.
  const CAP = 10_000n
  const { client, filters } = stub((filter) => {
    if (span(filter) > CAP) throw new Error('boom') // no window stated anywhere
    return []
  })

  await scanLogs(client, QUERY, { fromBlock: 1n, toBlock: 200_000n }, { sleep: recorder().sleep })

  const overCap = filters.filter((f) => span(f) > CAP)
  expect(overCap.length).toBeGreaterThan(1) // the descent, PLUS a regrowth probe per 4 clean chunks
  expect(filters.some((f) => span(f) === 6_250n)).toBe(true) // …and it settles below the real cap
})

test('widthMemory: the second scan starts at the width the first one learned', async () => {
  const CAP = 10_000n
  const memory: { learnedScanWidth?: bigint; declaredScanCap?: bigint } = {}
  const handler = (filter: any): unknown[] => {
    if (span(filter) > CAP) throw new Error('eth_getLogs is limited to a 10,000 range')
    return []
  }

  const first = stub(handler)
  await scanLogs(first.client, QUERY, { fromBlock: 1n, toBlock: 100_000n }, { widthMemory: memory })
  expect(memory.learnedScanWidth).toBe(CAP)
  expect(memory.declaredScanCap).toBe(CAP)
  expect(first.filters.filter((f) => span(f) > CAP)).toHaveLength(1) // the one probe that taught it

  const second = stub(handler)
  const res = await scanLogs(second.client, QUERY, { fromBlock: 1n, toBlock: 100_000n }, { widthMemory: memory })

  // Not one wasted request this time: the descent was a search for a fact already in hand.
  expect(second.filters.filter((f) => span(f) > CAP)).toHaveLength(0)
  expect(span(second.filters[0]!)).toBe(CAP)
  expect(res.complete).toBe(true)
})

test('widthMemory: a stale hint is a HINT — the scan still corrects downward and still covers', async () => {
  // The hint's whole safety argument. A remembered width that the endpoint no longer serves (a
  // tightened plan, or a snapshot shared between two providers on one chain — `cli/cache.ts` does
  // exactly that) costs probes, never coverage.
  const memory = { learnedScanWidth: 1_000_000n }
  const { client, filters } = stub((filter) => {
    if (span(filter) > 1_000n) throw new Error('boom')
    return []
  })

  const res = await scanLogs(client, QUERY, { fromBlock: 1n, toBlock: 8_000n }, { sleep: recorder().sleep, widthMemory: memory })

  expect(span(filters[0]!)).toBe(8_000n) // bounded by the RANGE, which is narrower than the hint
  expect(res.complete).toBe(true)
  expect(res.covered).toEqual([{ fromBlock: 1n, toBlock: 8_000n }])
})

// (`initialChunk` outranking a remembered hint is `min(hint, ceiling)` and nothing else — the same
// assertion, under the same title, already sits in `logScanPolicy.test.ts` as
// "initialPolicy: the hint never widens a scan past its own ceiling".)

test('widthMemory: the learned width is a running MAXIMUM, not the last window asked for', async () => {
  // A short delta re-scan asks for a short window and is served. Recording that as what the endpoint
  // "can do" would ratchet the hint towards nothing over a warm router's life — every incremental
  // re-scan is short.
  const memory: { learnedScanWidth?: bigint } = {}
  const { client } = stub(() => [])

  await scanLogs(client, QUERY, { fromBlock: 1n, toBlock: 500_000n }, { widthMemory: memory })
  expect(memory.learnedScanWidth).toBe(500_000n)

  await scanLogs(client, QUERY, { fromBlock: 1n, toBlock: 300n }, { widthMemory: memory })
  expect(memory.learnedScanWidth).toBe(500_000n) // unchanged by the narrow re-scan
})

// THE POISONED-HINT REGRESSION, WRITE SIDE. The running-maximum rule above only protects a memory
// that already holds a wide value. A COLD one — a fresh index whose very first scan is a narrow
// reorg re-scan — recorded the narrow width as this endpoint's learned capacity, and
// `initialPolicy` then opened every later full-history scan there: served every time, never
// corrected, the entire request budget spent walking millions of blocks a handful at a time. A width
// below MIN_CHUNK is not a capacity observation at all — it is a report that nobody asked for more.
test('widthMemory: a window narrower than MIN_CHUNK is never recorded as learned capacity', async () => {
  const memory: { learnedScanWidth?: bigint } = {}
  const { client } = stub(() => [])

  // A 32-block reorg re-scan on a COLD memory: served, and deliberately learned from.
  await scanLogs(client, QUERY, { fromBlock: 1n, toBlock: 32n }, { widthMemory: memory })
  expect(memory.learnedScanWidth).toBeUndefined()

  // Exactly at the floor it IS a real observation — that is a window this scanner asks for.
  await scanLogs(client, QUERY, { fromBlock: 1n, toBlock: MIN_CHUNK }, { widthMemory: memory })
  expect(memory.learnedScanWidth).toBe(MIN_CHUNK)
})

test('widthMemory: absent, every behaviour is exactly what it was', async () => {
  const CAP = 1_000n
  const withMemory = stub((f) => (span(f) > CAP ? (() => { throw new Error('boom') })() : []))
  const without = stub((f) => (span(f) > CAP ? (() => { throw new Error('boom') })() : []))

  const a = await scanLogs(withMemory.client, QUERY, { fromBlock: 1n, toBlock: 20_000n }, { sleep: recorder().sleep, widthMemory: {} })
  const b = await scanLogs(without.client, QUERY, { fromBlock: 1n, toBlock: 20_000n }, { sleep: recorder().sleep })

  expect(withMemory.filters.map(span)).toEqual(without.filters.map(span))
  expect(a).toEqual(b)
})

test('quicknode Base, live capture: the batched shape reaches the fast path through its cause', async () => {
  // End to end against the real captured error, in the shape the CLI's transport delivered it:
  // HTTP 200, `-32614` on the cause, the cap only in the prose. If either the classifier tier or the
  // parser pattern regresses, this scan goes back to eleven blind halvings and settles at 7,812.
  const CAP = 10_000n
  const { client, filters } = stub((filter) => {
    if (span(filter) <= CAP) return []
    throw Object.assign(new Error(providerErrors['base-mainnet.quiknode.pro (batched)'].message), {
      name: 'RpcRequestError',
      cause: { code: -32614, message: 'eth_getLogs is limited to a 10,000 range' },
    })
  })

  const res = await scanLogs(client, QUERY, { fromBlock: 1n, toBlock: 1_000_000n }, { sleep: recorder().sleep })

  expect(span(filters[0]!)).toBe(1_000_000n)
  expect(span(filters[1]!)).toBe(CAP) // straight to the stated cap, not 500,000
  expect(filters.filter((f) => span(f) > CAP)).toHaveLength(1)
  expect(res.complete).toBe(true)
})

// ---------------------------------------------------------------------------
// `opts.maxRequests` — a caller narrowing its own slice of the budget.
//
// The case it exists for is not an expensive scan; it is a scan in the WRONG
// PLACE: one full-history walk starving everything else that shares its
// latency budget. On a 10,000-block-capped endpoint over 48M blocks a fee
// history is 4,822 requests — an entire `--budget 60s` on its own.
// ---------------------------------------------------------------------------

test('maxRequests stops the scan at the caller’s bound and reports the rest as uncovered', async () => {
  const { client, filters } = stub(() => [])

  const res = await scanLogs(client, QUERY, { fromBlock: 1n, toBlock: 1_000_000n }, { initialChunk: 1_000n, maxRequests: 10 })

  expect(filters).toHaveLength(10) // 1,000 windows would be needed; ten were bought
  expect(res.complete).toBe(false)
  // Recent-first, so what IS covered is the tail — and it is claimed honestly, not rounded up.
  expect(res.covered).toEqual([{ fromBlock: 990_001n, toBlock: 1_000_000n }])
})

test('maxRequests counts FAILURES too — a refusing endpoint cannot spend more than the bound', async () => {
  const { client, filters } = stub(() => {
    throw new Error('boom')
  })

  const res = await scanLogs(client, QUERY, { fromBlock: 1n, toBlock: 1_000_000n }, { sleep: recorder().sleep, maxRequests: 5 })

  expect(filters).toHaveLength(5)
  expect(res.covered).toEqual([])
})

test('maxRequests only ever NARROWS: it cannot buy more than MAX_REQUESTS_PER_SCAN', async () => {
  // The global ceiling is what bounds every scan in the package; a caller may take less of the
  // endpoint's time than it allows, never more.
  const { client, filters } = stub(() => {
    throw new Error('boom')
  })

  await scanLogs(client, QUERY, { fromBlock: 0n, toBlock: MAX_SCAN_WINDOW * 100n }, {
    sleep: recorder().sleep,
    initialChunk: MIN_CHUNK,
    maxRequests: MAX_REQUESTS_PER_SCAN * 10,
  })

  expect(filters.length).toBeLessThanOrEqual(MAX_REQUESTS_PER_SCAN)
})

test('maxRequests never lets a concurrent batch overshoot the bound', async () => {
  // The batch is planned before it is dispatched, so an off-by-one here would let a scan spend
  // SCAN_CHUNK_CONCURRENCY - 1 requests it was not sold — the same exactness `MAX_REQUESTS_PER_SCAN`
  // already relies on.
  for (const bound of [1, 2, 3, 5, 7, 11]) {
    const { client, filters } = concurrentStub(() => [])
    await scanLogs(client, QUERY, { fromBlock: 1n, toBlock: 1_000_000n }, { initialChunk: 1_000n, maxRequests: bound })
    expect(filters).toHaveLength(bound)
  }
})

test('maxRequests absent leaves the global ceiling in charge, unchanged', async () => {
  const { client, filters } = stub(() => [])
  const res = await scanLogs(client, QUERY, { fromBlock: 1n, toBlock: 20_000n }, { initialChunk: 1_000n })
  expect(filters).toHaveLength(20)
  expect(res.complete).toBe(true)
})

test('the returned `requests` is what reached the wire, so a shared budget can be split exactly', async () => {
  // `discoverFeeTiers` spends ONE budget across however many ranges `uncovered` hands it (a warm
  // index gives two: the unscanned gap plus the re-opened reorg tail). Subtracting an ESTIMATE there
  // is how a bound quietly becomes a multiplier — which it did, and the warm Base run spent the whole
  // 60s in wave 1 again for exactly that reason.
  const { client, filters } = stub(() => [])
  const res = await scanLogs(client, QUERY, { fromBlock: 1n, toBlock: 100_000n }, { initialChunk: 1_000n, maxRequests: 30 })
  expect(res.requests).toBe(30)
  expect(res.requests).toBe(filters.length)

  const complete = await scanLogs(client, QUERY, { fromBlock: 1n, toBlock: 5_000n }, { initialChunk: 1_000n })
  expect(complete.requests).toBe(5)
  expect(complete.complete).toBe(true)
})

test('an aborted chunk is not billed: `requests` counts the wire, not the plan', async () => {
  const ac = new AbortController()
  let served = 0
  const { client } = concurrentStub(() => {
    if (++served === 2) ac.abort()
    return []
  })

  const res = await scanLogs(client, QUERY, { fromBlock: 1n, toBlock: 1_000_000n }, { initialChunk: 1_000n, signal: ac.signal })

  // Whatever the batch planned, only chunks that actually went out are charged — the same accounting
  // `MAX_REQUESTS_PER_SCAN` has always used, now visible to callers splitting a budget.
  expect(res.requests).toBeGreaterThan(0)
  expect(res.requests).toBeLessThanOrEqual(served + SCAN_CHUNK_CONCURRENCY)
})

// ---------------------------------------------------------------------------
// THE CLAMP IS FOR SPAN POLICIES ONLY.
//
// Alchemy's response-size refusal names a "10,000 block range" and, in the same
// sentence, suggests an ~8,000,000-block retry range for the same query. It is
// offering two modes, not stating a ceiling. Clamping a scan's ceiling to the
// 10,000 would pin every mainnet scan 800x too narrow for the rest of its life
// — on the endpoint this package's own baseline numbers come from.
// ---------------------------------------------------------------------------

test('a DENSITY cap moves the width but never the ceiling: the ratchet must still climb out', async () => {
  // The endpoint refuses the widest windows on DENSITY (a dense recent region) but happily serves
  // 4,000,000-block windows once the walk is past it — the shape of a real mainnet adjacency scan.
  const DENSE_BELOW = 30_000_000n // blocks below this are sparse and serve at any width
  const { client, filters } = stub((filter) => {
    const to = BigInt(filter.toBlock)
    if (to > DENSE_BELOW && span(filter) > 1_000_000n) throw new Error(providerErrors['eth-mainnet.g.alchemy.com'].message)
    return []
  })

  const res = await scanLogs(client, QUERY, { fromBlock: 1n, toBlock: 40_000_000n }, { sleep: recorder().sleep })

  // It obeyed the stated 10,000 for the attempt that failed...
  expect(filters.some((f) => span(f) === 10_000n)).toBe(true)
  // ...but the ceiling was NOT lowered, so regrowth climbed back to windows orders of magnitude
  // wider once the dense region was behind it. Un-gated, every window here would be <= 10,000 and
  // this 40M-block range would need ~4,000 requests instead of a few dozen.
  expect(filters.some((f) => span(f) > 1_000_000n)).toBe(true)
  expect(filters.length).toBeLessThan(500)
  expect(res.complete).toBe(true)
})

test('a density cap does not poison the width memory for later scans', async () => {
  const memory: { learnedScanWidth?: bigint; declaredScanCap?: bigint } = {}
  const { client } = stub((filter) => {
    if (span(filter) > 4_000_000n) throw new Error(providerErrors['eth-mainnet.g.alchemy.com'].message)
    return []
  })

  await scanLogs(client, QUERY, { fromBlock: 1n, toBlock: 20_000_000n }, { sleep: recorder().sleep, widthMemory: memory })

  // No CEILING is remembered from a density observation — the next scan must be free to ask wide
  // again, because the next scan is a different query over a different region.
  expect(memory.declaredScanCap).toBeUndefined()
  expect(memory.learnedScanWidth).toBeGreaterThan(10_000n)
})

test('a SPAN cap still clamps — the Base fix is not weakened by the density gate', async () => {
  const CAP = 10_000n
  const memory: { learnedScanWidth?: bigint; declaredScanCap?: bigint } = {}
  const { client, filters } = stub((filter) => {
    if (span(filter) > CAP) throw new Error('eth_getLogs is limited to a 10,000 range')
    return []
  })

  await scanLogs(client, QUERY, { fromBlock: 1n, toBlock: 200_000n }, { widthMemory: memory })

  expect(memory.declaredScanCap).toBe(CAP)
  expect(filters.filter((f) => span(f) > CAP)).toHaveLength(1) // one probe, then never again
})
