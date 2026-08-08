import { readdirSync, readFileSync } from 'node:fs'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { afterEach, beforeEach, describe, expect, test } from 'bun:test'

import { manifestFor } from '../../src/index'
import type { ParsedArgs } from '../args'
import { flushCacheSave } from '../cache'
import { buildEnvelope, parsePoolList, PoolListError, serializeEnvelope } from '../poolList'
import { MAINNET, publishedListText, USDC, WETH } from '../testing'

import { buildChainContext, startBudget } from './context'

// ---------------------------------------------------------------------------
// `buildChainContext` — the things it decides that nothing else can.
//
// Everything else in this file's subject is plumbing (resolve a URL, pick a
// manifest, hand a `PoolIndex` to `createRouter`) and is covered where it
// lives. These are not:
//
//   1. HOW `--budget`'s clock is BUILT, and WHEN IT STARTS. The signal has to
//      fire while a loop saturated with network I/O is the only thing running,
//      which is the exact condition under which the runtime declines to service
//      an unref'd timer — and it must not start ticking until the command's
//      search does, or setup (cache load, token metadata) spends the user's
//      search budget for them.
//   2. THAT THE UNREF'D ESCAPE STAYS CLOSED. See the source-guard test below
//      for why that one is asserted against the SOURCE and not against
//      behavior.
//   3. THAT THE TRANSPORT DOES NOT BATCH. Measured at 6.1x on quicknode Base,
//      and invisible to every other test in this repo because the SDK is handed
//      a client rather than building one.
//   4. WHERE `--pool-list` LANDS, and what a rejected one costs. `poolList.test.ts`
//      owns what a list is; only here is it visible that the list reaches the
//      index the ROUTER is built with, that a bad one travels as the class
//      `rl.ts` turns into exit 4, and that the cache save this function
//      registers sees the merged result.
//
// The whole file runs against a stubbed `globalThis.fetch`, so nothing here
// touches a network, and the budgets are milliseconds rather than seconds.
// ---------------------------------------------------------------------------

/** One `fetch` the transport made: the URL and the parsed JSON-RPC body (an object, or an ARRAY
 * when something batched it — which is the distinction the last test in this file turns on). */
type Wire = { url: string; body: any }

type Handler = (body: any) => { status?: number; result?: unknown; hang?: boolean }

const realFetch = globalThis.fetch

/**
 * Replaces `globalThis.fetch` with a JSON-RPC responder driven by `handler`, recording every
 * request. `hang` never resolves — the "stalled endpoint" a `--budget` exists for, without spending
 * any wall clock on it.
 */
function stubFetch(handler: Handler): Wire[] {
  const wire: Wire[] = []
  globalThis.fetch = (async (input: any, init: any) => {
    const body = JSON.parse(String(init?.body ?? 'null'))
    wire.push({ url: String(input), body })
    const answer = handler(body)
    if (answer.hang) return new Promise<Response>(() => {})
    if (answer.status !== undefined && answer.status >= 400) {
      return new Response('upstream exploded', { status: answer.status })
    }
    const reply = (one: any): unknown => ({ jsonrpc: '2.0', id: one.id, result: answer.result })
    const payload = Array.isArray(body) ? body.map(reply) : reply(body)
    return new Response(JSON.stringify(payload), { status: 200, headers: { 'content-type': 'application/json' } })
  }) as typeof fetch
  return wire
}

/** Answers `eth_chainId` with mainnet and everything else with `result`. */
function chainIdThen(result: unknown, opts: { status?: number; hang?: boolean } = {}): Handler {
  return (body: any) => {
    const first = Array.isArray(body) ? body[0] : body
    if (first?.method === 'eth_chainId') return { result: '0x1' }
    return { result, ...opts }
  }
}

const RPC = 'https://rpc.example.invalid/'

function args(opts: { budget?: string } = {}): ParsedArgs {
  const strings = new Map<string, string>([['rpc', RPC]])
  if (opts.budget !== undefined) strings.set('budget', opts.budget)
  // `no-cache`: these tests are about the client and the clock, and a cache read/write would put
  // this file's behaviour at the mercy of the developer's `~/.cache` (see `cache.test.ts`, which
  // owns that surface and sandboxes `$XDG_CACHE_HOME` for it).
  return { positionals: [], booleans: new Set(['no-cache']), strings, lists: new Map() }
}

afterEach(() => {
  globalThis.fetch = realFetch
})

/**
 * Every budget a test starts, so none is left holding the runtime open for the rest of its window —
 * the same discipline each command applies in its own `finally`. A LOCAL list rather than a module
 * reset, because the timer is no longer module state: `startBudget` hands its `cancel` back to
 * whoever started it, and this is that owner.
 */
const started: (() => void)[] = []
function budgetFor(budgetMs: number | undefined): ReturnType<typeof startBudget> {
  const budget = startBudget(budgetMs)
  started.push(budget.cancel)
  return budget
}
afterEach(() => {
  for (const cancel of started.splice(0)) cancel()
})

// ---------------------------------------------------------------------------
// 1. `--budget`'s clock
// ---------------------------------------------------------------------------

describe('the budget signal', () => {
  test('aborts at the configured budget, against an endpoint that never answers', async () => {
    // The shape the bug lived in: the process is waiting on a request that will never come back, so
    // the ONLY thing that can end the run is the budget's own timer.
    stubFetch(chainIdThen(undefined, { hang: true }))
    const ctx = await buildChainContext(args({ budget: '40ms' }))
    const started = Date.now()
    const signal = budgetFor(ctx.budgetMs).signal!

    expect(signal).toBeDefined()
    expect(signal.aborted).toBe(false) // not pre-aborted: the budget is a deadline, not a veto

    await new Promise<void>((resolve) => signal.addEventListener('abort', () => resolve(), { once: true }))

    expect(signal.aborted).toBe(true)
    expect(Date.now() - started).toBeGreaterThanOrEqual(35) // it waited for the budget...
    expect(Date.now() - started).toBeLessThan(5_000) // ...and did not wait for the request
  })

  test('an unbudgeted run gets no signal at all', async () => {
    // Absence is meaningful here: an optional signal is how the SDK tells an unbounded run from a
    // bounded one, and manufacturing an already-live signal for every run would hand every command a
    // clock it never asked for.
    stubFetch(chainIdThen('0x1'))
    const ctx = await buildChainContext(args())
    expect(ctx.budgetMs).toBeUndefined()
    expect(budgetFor(ctx.budgetMs).signal).toBeUndefined()
  })

  test('THE CLOCK DOES NOT START DURING SETUP — only when the command starts its search', async () => {
    // The regression this pins, measured live: with the timer started inside `buildChainContext`, a
    // `--budget 15s` run against a warm 115 MB mainnet cache reached the first `searchWaves` call at
    // t=16.7s — the search was born aborted and returned `inconclusive/aborted` without issuing a
    // single quote. `--budget` names a SEARCH budget, so `buildChainContext` may only PARSE it.
    stubFetch(chainIdThen('0x1'))
    const ctx = await buildChainContext(args({ budget: '30ms' }))
    expect(ctx.budgetMs).toBe(30)

    // Stand in for the setup a real command still has ahead of it (token metadata, hint parsing) —
    // longer than the whole budget. A clock started in `buildChainContext` has already fired by now.
    await new Promise((r) => setTimeout(r, 80))

    const signal = budgetFor(ctx.budgetMs).signal!
    expect(signal.aborted).toBe(false) // the search gets its full budget, not the remainder of one
    await new Promise<void>((resolve) => signal.addEventListener('abort', () => resolve(), { once: true }))
    expect(signal.aborted).toBe(true)
  })

  test('the returned cancel clears the timer: a finished command does not keep waiting', async () => {
    stubFetch(chainIdThen('0x1'))
    const ctx = await buildChainContext(args({ budget: '40ms' }))
    const budget = budgetFor(ctx.budgetMs)

    budget.cancel()
    await new Promise((r) => setTimeout(r, 90)) // well past the budget

    // Still not aborted, which is the observable half of "the process would have exited by now".
    expect(budget.signal!.aborted).toBe(false)
  })

  test('cancel is idempotent, and present even on an unbudgeted run', async () => {
    // Every command calls it from a `finally`, and an unbudgeted one takes the same path as a
    // budgeted one — so the no-budget case has to hand back a callable no-op rather than nothing,
    // and a second `clearTimeout` on a cleared handle must not throw.
    stubFetch(chainIdThen('0x1'))
    const unbudgeted = startBudget(undefined)
    expect(unbudgeted.signal).toBeUndefined()
    expect(() => {
      unbudgeted.cancel()
      unbudgeted.cancel()
    }).not.toThrow()

    const budget = budgetFor((await buildChainContext(args({ budget: '40ms' }))).budgetMs)
    expect(() => {
      budget.cancel()
      budget.cancel()
    }).not.toThrow()
  })

  test('two budgets in one process are independent — cancelling one does not disarm the other', () => {
    // The shape the module-level handle could not express: it held ONE timer, so a second
    // `startBudget` overwrote (and leaked) the first, and `cancelBudget` cleared whichever call
    // happened to be last. One invocation only ever starts one budget, so nothing was observably
    // broken — but nothing said so either, and the returned handle makes it true by construction.
    const a = budgetFor(30)
    const b = budgetFor(30)
    a.cancel()
    expect(b.signal!.aborted).toBe(false)
    return new Promise<void>((resolve) => {
      b.signal!.addEventListener('abort', () => {
        expect(a.signal!.aborted).toBe(false) // the cancelled one never fires
        resolve()
      })
    })
  })
})

// ---------------------------------------------------------------------------
// 1b. The chain id is probed ONCE, and `--concurrency` is bounded.
// ---------------------------------------------------------------------------

describe('the router the CLI builds', () => {
  test('does not re-probe eth_chainId: the detected id is handed to createRouter', async () => {
    // The CLI probes `eth_chainId` to pick a manifest at all, and `validateManifest` used to ask the
    // same endpoint the same question again on the first search — a second sequential round trip
    // (~0.9s live) in front of every invocation. `assumeChainId` replaces the READ; the cross-check
    // and the execution-address fingerprint below it are untouched, which is why `eth_getCode` still
    // goes out here.
    const wire = stubFetch((body: any) => ((Array.isArray(body) ? body[0] : body)?.method === 'eth_chainId' ? { result: '0x1' } : { status: 500 }))
    const ctx = await buildChainContext(args({ budget: '5s' }))

    // Fails at the `eth_getCode` (the stub 500s it), which is exactly far enough: manifest validation
    // ran, and whatever it asked for is now on the wire.
    await ctx.router.getQuote({ tokenIn: 'native', tokenOut: `0x${'11'.repeat(20)}`, amountIn: 1n })

    const methods = wire.map((w) => w.body.method)
    expect(methods.filter((m) => m === 'eth_chainId')).toHaveLength(1)
    expect(methods).toContain('eth_getCode')
  })

  test('--trust-coverage without --pool-list is rejected before the endpoint is touched', async () => {
    // AN ARGUMENT MISTAKE MAY NOT COST A CACHE REWRITE. This check used to run after the chain probe,
    // after the (multi-hundred-megabyte, on mainnet) cache load, and after the save was registered —
    // so `rl quote … --trust-coverage` with no list spent a round trip, a full snapshot read and a
    // full snapshot write before printing a complaint that was decidable from `parsed` alone.
    //
    // The transport is the assertion: a fetch of any kind means the probe ran.
    const wire = stubFetch(() => {
      throw new Error('the endpoint must not be touched for a flag combination that is wrong on its face')
    })
    const parsed = args()
    parsed.booleans.add('trust-coverage')
    // ...and the cache is deliberately LEFT ON here (the only test in this file that does), because
    // the load and the save registration are exactly what must not happen.
    parsed.booleans.delete('no-cache')

    await expect(buildChainContext(parsed)).rejects.toThrow(/--trust-coverage only means something with --pool-list/)
    expect(wire).toEqual([])

    // ...and it is the flag combination that is refused, not the flag: with a list named, the run
    // gets as far as the endpoint (where this stub then fails it).
    const withList = args()
    withList.booleans.add('trust-coverage')
    withList.strings.set('pool-list', '/nonexistent.poollist.json')
    await expect(buildChainContext(withList)).rejects.toThrow(/did not answer eth_chainId/)
    expect(wire.length).toBeGreaterThan(0)
  })

  test('--concurrency is validated against the SDK’s own bounds', async () => {
    stubFetch(chainIdThen('0x1'))
    const withConcurrency = (value: string): ParsedArgs => {
      const parsed = args()
      parsed.strings.set('concurrency', value)
      return parsed
    }

    // Rejected BEFORE the endpoint is touched: a bad bound is the caller's mistake, and `createRouter`
    // would report it as a `RouterConfigError` (exit 3 either way) only after a round trip.
    for (const bad of ['0', '-1', '1.5', '1025', 'lots']) {
      await expect(buildChainContext(withConcurrency(bad))).rejects.toThrow(/--concurrency/)
    }
    // ...and a legal value builds a router. 40 is the measured-better setting on a keyed mainnet
    // endpoint; the DEFAULT is still the SDK's 20, which is what an absent flag leaves in place.
    expect((await buildChainContext(withConcurrency('40'))).router).toBeDefined()
  })
})

// ---------------------------------------------------------------------------
// 1c. `--pool-list`, at the seam rather than at the unit.
//
// `poolList.test.ts` owns what a list IS — curation, the envelope, the trust
// tiers, hydration into a bare index. What is only visible HERE is the wiring:
// that `buildChainContext` puts the list into the index the ROUTER gets, that
// the trust decision reaches a terminal, that a rejected list travels as the
// class `rl.ts` maps to exit 4 (and not as one of the classes it maps to 3),
// and that the cache save registered by this same function sees the merged
// result rather than whatever the cache alone restored.
// ---------------------------------------------------------------------------

describe('--pool-list, wired into the run', () => {
  let dir: string
  const realError = console.error
  const savedXdg = process.env.XDG_CACHE_HOME

  /** Every `console.error` line the run produced — the CLI's whole non-machine channel. */
  let stderr: string[]

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'rl-ctx-poollist-'))
    stderr = []
    console.error = (...parts: unknown[]): void => {
      stderr.push(parts.map(String).join(' '))
    }
  })
  afterEach(async () => {
    console.error = realError
    if (savedXdg === undefined) delete process.env.XDG_CACHE_HOME
    else process.env.XDG_CACHE_HOME = savedXdg
    await rm(dir, { recursive: true, force: true })
  })

  async function listAt(name: string, text: string): Promise<string> {
    const path = join(dir, name)
    await writeFile(path, text, 'utf8')
    return path
  }

  /** `args()` plus `--pool-list <path>`, and optionally `--trust-coverage` / the cache left ON. */
  function withList(path: string, opts: { trust?: boolean; cache?: boolean } = {}): ParsedArgs {
    const parsed = args()
    parsed.strings.set('pool-list', path)
    if (opts.trust === true) parsed.booleans.add('trust-coverage')
    if (opts.cache === true) parsed.booleans.delete('no-cache')
    return parsed
  }

  test('merges the list into the index the router is built with, and says so on stderr', async () => {
    stubFetch(chainIdThen('0x1'))
    const ctx = await buildChainContext(withList(await listAt('1.poollist.json', publishedListText())))

    // The pools are IN THE RUN'S INDEX — not in some parsed object the router never sees.
    expect(ctx.index.stats().pools).toBe(4)
    expect(ctx.index.pair(USDC, WETH).map((r) => r.pool.id)).toHaveLength(1)
    // ...and the load is announced unconditionally (no --verbose here), because a run whose index
    // came from somewhere the user cannot see is a run they cannot reason about.
    expect(stderr.filter((l) => l.includes('pool-list:'))).toHaveLength(1)
    expect(stderr.join('\n')).toMatch(/pool-list: 4 pools \(4 new\).*as of block 20900000/)
  })

  test('DISCARDS the list’s coverage by default — the flag is the whole trust decision', async () => {
    stubFetch(chainIdThen('0x1'))
    const ctx = await buildChainContext(withList(await listAt('1.poollist.json', publishedListText())))

    expect(ctx.index.stats().coverageScopes).toBe(0)
    // The consumer therefore still scans the whole history: a Tier B list can only make it find MORE
    // than the list knew, never less.
    expect(ctx.index.uncovered('v2', WETH, 10_000_835n, 21_000_000n)).toEqual([
      { fromBlock: 10_000_835n, toBlock: 21_000_000n },
    ])
    expect(stderr.join('\n')).toMatch(/coverage scopes discarded \(pass --trust-coverage to adopt\)/)
  })

  test('--trust-coverage adopts it, and the line names the tier it adopted', async () => {
    stubFetch(chainIdThen('0x1'))
    const ctx = await buildChainContext(withList(await listAt('1.poollist.json', publishedListText()), { trust: true }))

    expect(ctx.index.stats().coverageScopes).toBeGreaterThan(0)
    expect(ctx.index.enabledFees('v3', MAINNET.v3!.factory)).toEqual([100, 500, 3000, 10_000])
    expect(stderr.join('\n')).toMatch(/coverage scopes ADOPTED \(--trust-coverage\)/)
  })

  // -------------------------------------------------------------------------
  // THE EXIT-4 PATHS, asserted as the CLASS rather than as a message: `rl.ts`
  // dispatches on `instanceof PoolListError` for exit 4, and on `UsageError`
  // for exit 3. A rejected list that arrived as a `UsageError` would tell a
  // script to fix its arguments — the arguments were right, the FILE was
  // wrong — and one that arrived as anything else would print a stack.
  // -------------------------------------------------------------------------

  const rejections: [string, () => Promise<string>, RegExp][] = [
    [
      'a body that does not hash to the envelope’s claim',
      async () => publishedListText().replace('"pools"', '"poolz"'),
      /integrity check FAILED/,
    ],
    [
      'a list built for a different chain',
      async () => serializeEnvelope(buildEnvelope({ chainId: 8453, manifest: MAINNET, body: parsePoolList(publishedListText()).body })),
      /built for chain 8453, but this run resolved chain 1/,
    ],
    [
      'a factory fingerprint that is not this manifest’s',
      async () => {
        const env = buildEnvelope({ chainId: 1, manifest: manifestFor(8453), body: parsePoolList(publishedListText()).body })
        return serializeEnvelope(env)
      },
      /manifestFingerprint/,
    ],
  ]

  for (const [what, text, message] of rejections) {
    test(`refuses ${what} — as a PoolListError (exit 4), never a UsageError (exit 3)`, async () => {
      stubFetch(chainIdThen('0x1'))
      const failing = buildChainContext(withList(await listAt('1.poollist.json', await text())))

      await expect(failing).rejects.toBeInstanceOf(PoolListError)
      await expect(failing).rejects.toThrow(message)
    })
  }

  test('the cache save sees the MERGED index, not just what the cache restored', async () => {
    // The property the registration order exists for. `scheduleCacheSave` closes over the index and
    // is registered after the list is applied, so what `rl.ts` flushes on exit is everything this
    // run assembled — a list loaded once is a list the next cold run already has.
    process.env.XDG_CACHE_HOME = dir
    stubFetch(chainIdThen('0x1'))

    const ctx = await buildChainContext(withList(await listAt('1.poollist.json', publishedListText()), { cache: true }))
    expect(ctx.index.stats().pools).toBe(4)

    await flushCacheSave()

    const saved = JSON.parse(await readFile(join(dir, 'router-lite', '1.json'), 'utf8')) as { pools: unknown[] }
    expect(saved.pools).toHaveLength(4)
  })
})

// ---------------------------------------------------------------------------
// 2. The source guard.
// ---------------------------------------------------------------------------

describe('the unref’d-timer escape stays closed', () => {
  /**
   * Built from parts so this file does not contain the very string it forbids — which lets the scan
   * cover ALL of `cli/`, this test included, instead of carving out an exemption that a future file
   * could quietly be added to.
   */
  const FORBIDDEN = ['AbortSignal', 'timeout('].join('.')

  /**
   * Source with comments removed, so the scan reads CODE.
   *
   * Necessary rather than fastidious: `context.ts`'s own banner names the forbidden call while
   * explaining why it is forbidden, and a guard that cannot tell an explanation from a use would
   * force that explanation to be deleted — leaving the next reader with a hand-rolled timer and no
   * idea why. A trailing `// …` on a line of real code is deliberately still scanned (only lines
   * that START as comments are dropped), so nothing can hide behind an end-of-line comment.
   */
  function code(text: string): string {
    return text
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .split('\n')
      .filter((line) => !/^\s*(\/\/|\*)/.test(line))
      .join('\n')
  }

  function cliSources(): { path: string; raw: string; text: string }[] {
    const root = join(dirname(fileURLToPath(import.meta.url)), '..')
    return readdirSync(root, { recursive: true })
      .map(String)
      .filter((p) => p.endsWith('.ts'))
      .map((p) => {
        const raw = readFileSync(join(root, p), 'utf8')
        return { path: p, raw, text: code(raw) }
      })
  }

  test(`no file under cli/ constructs a timeout signal the standard-library way`, () => {
    // WHY THIS IS A SOURCE ASSERTION AND NOT A BEHAVIOURAL ONE, which is unusual enough to spell out:
    // the failure it guards against is EVENT-LOOP STARVATION, and a unit test cannot produce it. The
    // standard-library signal's timer is unref'd, and an unref'd timer is not reliably serviced by
    // this runtime while the loop is saturated with network I/O. Reproducing that needs a real
    // endpoint, thousands of in-flight requests and minutes of runtime — it was FOUND that way
    // (`rl quote eth usdc 1 --watch --budget 60s` against Base/quicknode: four consecutive runs where
    // `aborted` never flipped, still scanning at t=180s, ~7,700 requests deep, RSS past 13 GB; the
    // identical run behind a ref'd `setTimeout` aborted at t=60.4s). A behavioural test that passes
    // in milliseconds would prove nothing about the state the bug needs, and its passing would be
    // worse than no test at all.
    //
    // So the durable defense is the shape of the code: `--budget` builds its own `AbortController`
    // behind an ordinary ref'd `setTimeout` (see `context.ts#startBudget`), and nothing in the host
    // may go back to the one-liner. Reverting the fix is what fails here, immediately and cheaply.
    const offenders = cliSources().filter((f) => f.text.includes(FORBIDDEN))
    expect(offenders.map((f) => f.path)).toEqual([])
  })

  test('the guard is actually scanning something, and the needle really matches', () => {
    // A recursive read that silently returned nothing — or comment-stripping that ate the whole file
    // — would make the test above vacuously green.
    const sources = cliSources()
    expect(sources.length).toBeGreaterThan(10)
    const self = sources.find((f) => f.path === join('commands', 'context.ts'))!
    expect(self.text.length).toBeGreaterThan(500)
    // `context.ts` DOES name the forbidden call, in the banner explaining why it is not used. That
    // is the pair of facts this guard rests on: present in the prose, absent from the code.
    expect(self.raw).toContain(FORBIDDEN)
    expect(self.text).not.toContain(FORBIDDEN)
    // ...and the needle matches a real use when there is one, so a typo'd constant cannot pass as a
    // clean tree.
    expect(code(`const s = ${FORBIDDEN}30)`)).toContain(FORBIDDEN)
  })
})

// ---------------------------------------------------------------------------
// 3. The transport: `batch: false`, on purpose.
// ---------------------------------------------------------------------------

describe('the client the CLI builds', () => {
  test('DOES NOT BATCH: two concurrent calls are two HTTP requests', async () => {
    // The measurement this pins (20s of six concurrent adjacency scans, blocks covered per second):
    //
    //     quicknode Base (8453)     71,161 batched   ->   437,435 unbatched   6.1x
    //     alchemy   Mainnet (1)  2,472,779 batched   -> 3,316,227 unbatched   1.34x
    //
    // The reason is what this tool's heaviest phase looks like: ~20 `eth_getLogs` in flight at once,
    // which viem's batcher fuses into ONE POST that cannot return until its slowest member does.
    // Twenty independent requests over a keep-alive pool genuinely overlap; one batch of twenty does
    // not. It also un-breaks `--budget`, since an abort cannot interrupt a fused request.
    //
    // Asserted through the wire rather than by reading `client.transport`'s config: `batch: true`
    // would show up here as one POST carrying a JSON ARRAY, which is precisely the thing that was
    // slow — a config field is only a proxy for it.
    const wire = stubFetch(chainIdThen('0x1'))
    const ctx = await buildChainContext(args())
    const beforeCalls = wire.length

    await Promise.all([ctx.client.request({ method: 'eth_blockNumber' }), ctx.client.request({ method: 'eth_gasPrice' })])

    const issued = wire.slice(beforeCalls)
    expect(issued).toHaveLength(2)
    expect(issued.every((w) => !Array.isArray(w.body))).toBe(true)
    expect(issued.map((w) => w.body.method).sort()).toEqual(['eth_blockNumber', 'eth_gasPrice'])
  })

  test('the chain-detection probe is unbatched and unretried too', async () => {
    // One POST for `eth_chainId`, and a friendly `UsageError` — not viem's retry ladder — when the
    // endpoint refuses it. An unreachable endpoint should cost seconds, not the full ladder.
    const wire = stubFetch(() => ({ status: 500 }))
    await expect(buildChainContext(args())).rejects.toThrow(/did not answer eth_chainId/)
    expect(wire).toHaveLength(1)
  })

  test('a budgeted run does not retry a failing request', async () => {
    // The other half of "`--budget` means what it says": viem's default ladder is 3 retries with
    // backoff, which a tight budget cannot afford to spend on one dead call.
    const wire = stubFetch((body: any) => ((Array.isArray(body) ? body[0] : body)?.method === 'eth_chainId' ? { result: '0x1' } : { status: 500 }))
    const ctx = await buildChainContext(args({ budget: '5s' }))
    const beforeCalls = wire.length

    await expect(ctx.client.request({ method: 'eth_blockNumber' })).rejects.toThrow()

    expect(wire.length - beforeCalls).toBe(1)
  })
})
