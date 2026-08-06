import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { afterEach, describe, expect, test } from 'bun:test'

import type { ParsedArgs } from '../args'

import { buildChainContext, cancelBudget } from './context'

// ---------------------------------------------------------------------------
// `buildChainContext` — the three things it decides that nothing else can.
//
// Everything else in this file's subject is plumbing (resolve a URL, pick a
// manifest, hand a `PoolIndex` to `createRouter`) and is covered where it
// lives. These three are not:
//
//   1. HOW `--budget`'s clock is BUILT. The signal has to fire while a loop
//      saturated with network I/O is the only thing running, which is the exact
//      condition under which the runtime declines to service an unref'd timer.
//   2. THAT THE UNREF'D ESCAPE STAYS CLOSED. See the source-guard test below
//      for why that one is asserted against the SOURCE and not against
//      behavior.
//   3. THAT THE TRANSPORT DOES NOT BATCH. Measured at 6.1x on quicknode Base,
//      and invisible to every other test in this repo because the SDK is handed
//      a client rather than building one.
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
  // A budget timer is REF'D on purpose (that is the whole fix), so a test that left one pending
  // would hold the runtime open for the rest of its budget. Cancelling here is the same discipline
  // `rl.ts` applies in its `finally`.
  cancelBudget()
})

// ---------------------------------------------------------------------------
// 1. `--budget`'s clock
// ---------------------------------------------------------------------------

describe('the budget signal', () => {
  test('aborts at the configured budget, against an endpoint that never answers', async () => {
    // The shape the bug lived in: the process is waiting on a request that will never come back, so
    // the ONLY thing that can end the run is the budget's own timer.
    stubFetch(chainIdThen(undefined, { hang: true }))
    const started = Date.now()
    const ctx = await buildChainContext(args({ budget: '40ms' }))

    expect(ctx.signal).toBeDefined()
    expect(ctx.signal!.aborted).toBe(false) // not pre-aborted: the budget is a deadline, not a veto

    await new Promise<void>((resolve) => ctx.signal!.addEventListener('abort', () => resolve(), { once: true }))

    expect(ctx.signal!.aborted).toBe(true)
    expect(Date.now() - started).toBeGreaterThanOrEqual(35) // it waited for the budget...
    expect(Date.now() - started).toBeLessThan(5_000) // ...and did not wait for the request
  })

  test('an unbudgeted run gets no signal at all', async () => {
    // Absence is meaningful here: `ChainContext.signal` being optional is how the SDK tells an
    // unbounded run from a bounded one, and manufacturing an already-live signal for every run would
    // hand every command a clock it never asked for.
    stubFetch(chainIdThen('0x1'))
    expect((await buildChainContext(args())).signal).toBeUndefined()
  })

  test('cancelBudget clears the timer: a finished command does not keep waiting', async () => {
    stubFetch(chainIdThen('0x1'))
    const ctx = await buildChainContext(args({ budget: '40ms' }))

    cancelBudget()
    await new Promise((r) => setTimeout(r, 90)) // well past the budget

    // Still not aborted, which is the observable half of "the process would have exited by now".
    expect(ctx.signal!.aborted).toBe(false)
  })

  test('cancelBudget is idempotent, and safe with no budget in flight', () => {
    // Called from `rl.ts`'s `finally` AND from its signal handlers, so a Ctrl-C during a normal exit
    // reaches it twice. A second `clearTimeout` on a cleared handle must not throw.
    expect(() => {
      cancelBudget()
      cancelBudget()
      cancelBudget()
    }).not.toThrow()
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
    // behind an ordinary ref'd `setTimeout` (see `context.ts#budgetSignal`), and nothing in the host
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
