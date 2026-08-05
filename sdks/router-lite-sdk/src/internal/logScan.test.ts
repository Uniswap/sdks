import { expect, test } from 'bun:test'

import {
  BACKOFF_BASE_MS,
  BACKOFF_MAX_MS,
  CHUNK_REGROWTH_SUCCESSES,
  INITIAL_CHUNK,
  MAX_BACKOFF_TOTAL_MS,
  MAX_REQUESTS_PER_SCAN,
} from '../constants'

import { delay, scanLogs } from './logScan'

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

test('opts.initialChunk (C4-P6) overrides both the starting window and the regrowth ceiling', async () => {
  const { client, filters } = stub(() => []) // every chunk succeeds — nothing forces a shrink
  const res = await scanLogs(client, QUERY, { fromBlock: 0n, toBlock: 10_000n }, { initialChunk: 2_000n })

  expect(span(filters[0]!)).toBe(2_000n) // the FIRST request spans exactly the override, not INITIAL_CHUNK
  expect(res.complete).toBe(true)
  // Every chunk regrows toward 2_000n after CHUNK_REGROWTH_SUCCESSES clean requests, never past it —
  // the override is the ceiling too, not just the starting point.
  expect(filters.every((f) => span(f) <= 2_000n)).toBe(true)
})

test('opts.initialChunk defaults to INITIAL_CHUNK when omitted — existing behavior unchanged', async () => {
  const { client, filters } = stub(() => [])
  await scanLogs(client, QUERY, { fromBlock: 0n, toBlock: 20_000n }, {})
  expect(span(filters[0]!)).toBe(INITIAL_CHUNK)
})

test('abort stops between chunks, complete=false', async () => {
  const ac = new AbortController()
  const { client } = stub(() => {
    ac.abort()
    return []
  })
  const res = await scanLogs(
    client,
    { address: '0x1', topics: [] } as any,
    { fromBlock: 0n, toBlock: 50000n },
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
  // Fails exactly once, at the initial window, then answers everything.
  let failed = false
  const { client, filters } = stub(() => {
    if (!failed) {
      failed = true
      throw new Error('query returned more than 10000 results')
    }
    return []
  })

  const res = await scanLogs(client, QUERY, { fromBlock: 1n, toBlock: 100_000n }, {})

  const spans = filters.map(span)
  expect(spans[0]).toBe(INITIAL_CHUNK) // the probe that failed
  // ...then the halved window, for exactly as many chunks as regrowth requires...
  expect(spans.slice(1, 1 + CHUNK_REGROWTH_SUCCESSES)).toEqual(
    Array.from({ length: CHUNK_REGROWTH_SUCCESSES }, () => INITIAL_CHUNK / 2n),
  )
  // ...and then back to full speed, where it stays.
  expect(spans[1 + CHUNK_REGROWTH_SUCCESSES]).toBe(INITIAL_CHUNK)
  expect(spans.slice(1 + CHUNK_REGROWTH_SUCCESSES).every((s) => s === INITIAL_CHUNK)).toBe(true)
  // Regrowth must not disturb the recent-first coverage math.
  expect(res.complete).toBe(true)
  expect(res.covered).toEqual([{ fromBlock: 1n, toBlock: 100_000n }])
})

test('never grows the window past the initial chunk', async () => {
  const { client, filters } = stub(() => [])

  const res = await scanLogs(client, QUERY, { fromBlock: 1n, toBlock: 100_000n }, {})

  expect(filters.map(span).every((s) => s === INITIAL_CHUNK)).toBe(true)
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
  // Every accepted chunk is the same stabilized window — 10_000 halved three times is the first
  // window under the cap — so the scan settles instead of grinding down toward MIN_CHUNK.
  expect(spans.filter((s) => s <= cap).every((s) => s === INITIAL_CHUNK / 8n)).toBe(true)
  expect(res.complete).toBe(true) // every block still covered, at the cap-sized window
  expect(probes).toBeGreaterThan(3) // 3 halvings to find the cap, then it keeps probing...
  expect(probes).toBeLessThanOrEqual(3 + Math.ceil(accepted / CHUNK_REGROWTH_SUCCESSES)) // ...at most one per N
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
