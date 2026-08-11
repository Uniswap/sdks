import { expect, test } from 'bun:test'
import { zeroAddress } from 'viem'

import { DEFAULT_REORG_OVERLAP_BLOCKS } from './constants'
import { sortAddresses } from './internal/currency'
import {
  AMOUNT_IN,
  BLOCK_NUMBER,
  baseManifest,
  directProbes,
  entryFor,
  stubClient,
  TOKEN_A,
  TOKEN_B,
  TRADER,
  v2Return,
  v4Return,
} from './internal/routerFixture'
import { assertResultCoherent, v4Ref } from './internal/testing'
import { computeV2PairAddress, v2Module } from './protocols/v2'
import { v4Module } from './protocols/v4'
import { createRouter } from './router'
import type { PoolKey, SwapRequest } from './types'

// ---------------------------------------------------------------------------
// WHAT A DEGRADED PROVIDER IS ALLOWED TO MAKE THE FACADE SAY.
//
// Every test in this file is one narrative about an RPC endpoint that is not
// simply working: a 429 on `eth_call` alone, a replica two blocks behind, a head
// that goes backwards, a preflight or a readiness read lost to the transport, a
// no-route whose real cause is the request rather than the chain. They share one
// question — is this verdict entitled to be CONFIDENT? — and they are collected
// here because that question is what makes them a suite, not because they share
// a fixture (they share `internal/routerFixture.ts` with the rest of the facade's
// tests).
//
// The pattern most of them use: a v2 deployment block ABOVE the head, so
// discovery completes without a single log scan and every axis of the report
// except the one under test reads perfect. That is exactly what made the original
// bug reports so convincing — an authoritative `no-route` over a search that
// never learned anything about the chain at all.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// A PARTIAL RPC OUTAGE IS NEVER A NO-ROUTE (FW2).
//
// Both tests below are a reviewer's probes, kept permanently. Each one used to
// produce a *confident* `no-route` — the first with "search complete: no viable
// route found" over stats reading 99 attempted / 0 succeeded / 99 failed, the
// second with "no candidate route verified successfully" — because a 429 was
// folded into the same bucket as an on-chain revert. Every other axis looked
// perfect (all protocols' discovery `complete`, nothing aborted, nothing
// unattempted), which is exactly what made the lie so convincing.
// ---------------------------------------------------------------------------

test('a no-route caused by nothing being COMPILABLE names the cause, not just the verdict (C4-H4)', async () => {
  // Same shape as the preflight-revert test above (deployment block above the head, so discovery
  // completes with no scans), but the candidate never reaches preflight at all: the recipient is
  // the very v2 pair the route trades through, which `assertPlanInvariants` rejects. Without the
  // cause attached, the caller is told "no candidate route verified successfully" for a request it
  // could have fixed itself — and the pool address is not knowable at request-validation time, so
  // this is the only layer that can say it.
  const manifest = baseManifest({ v2Block: BLOCK_NUMBER + 1_000_000n, v4: false })
  const [probe] = directProbes(v2Module, TOKEN_A, TOKEN_B, AMOUNT_IN, manifest)
  const [token0] = sortAddresses(TOKEN_A, TOKEN_B)
  const zeroForOne = token0.toLowerCase() === TOKEN_A.toLowerCase()
  const pairAddress = computeV2PairAddress(manifest.v2!.factory, TOKEN_A, TOKEN_B)

  const { client, counters } = stubClient({
    calls: entryFor(probe!.quote.call, v2Return(10n ** 24n, 10n ** 24n, zeroForOne)),
  })
  const router = createRouter({ client, manifest })

  const res = await router.getSwap({
    tokenIn: TOKEN_A,
    tokenOut: TOKEN_B,
    amountIn: AMOUNT_IN,
    trader: TRADER,
    recipient: pairAddress,
  })

  expect(res.status).toBe('no-route')
  if (res.status === 'no-route') {
    expect(res.reason.code).toBe('no-route-verified') // same code as a preflight-revert no-route; `detail` carries the cause
    expect(res.reason.detail).toContain('recipient')
    expect(res.reason.detail.toLowerCase()).toContain(pairAddress.toLowerCase())
  }
  // It failed at compile time, so no simulation was ever spent on it.
  expect(counters.preflights).toBe(0)
  assertResultCoherent(res)
})

test('a provider that 429s only eth_call is inconclusive/rpc-degraded, never a confident no-route', async () => {
  // Same "discovery completes without a single scan" setup as the test above, so the *only* thing
  // standing between this search and an authoritative `no-route` is the transport axis.
  const manifest = baseManifest({ v2Block: BLOCK_NUMBER + 1_000_000n, v4: false })
  const { client, counters } = stubClient({ rateLimitQuotes: true })
  const router = createRouter({ client, manifest })

  const res = await router.getSwap({ tokenIn: TOKEN_A, tokenOut: TOKEN_B, amountIn: AMOUNT_IN, trader: TRADER })

  expect(res.status).toBe('inconclusive')
  expect(res.status).not.toBe('no-route')
  if (res.status === 'inconclusive') {
    expect(res.reason.code).toBe('rpc-degraded') // distinct from the total-outage 'rpc-unavailable'
    expect(res.search.quoting.transportFailed).toBeGreaterThan(0)
    expect(res.search.quoting.succeeded).toBe(0)
    // Nothing reverted: not one of those dropped calls was evidence about the chain.
    expect(res.search.quoting.failed).toBe(0)
    // The giveaway from the original bug report — discovery genuinely IS complete here, and the
    // classification must still refuse to conclude.
    expect(res.search.discovery.v2.status).toBe('complete')
    expect(res.search.aborted).toBe(false)
    expect(res.search.enumeration.exhaustiveWithinMaxHops).toBe(false)
  }
  expect(counters.preflights).toBe(0) // nothing ever quoted, so nothing to verify
  assertResultCoherent(res)

  // The quote-shaped surface tells the same story.
  const quoteRes = await router.getQuote({ tokenIn: TOKEN_A, tokenOut: TOKEN_B, amountIn: AMOUNT_IN })
  expect(quoteRes.status).toBe('inconclusive')
  if (quoteRes.status === 'inconclusive') expect(quoteRes.reason.code).toBe('rpc-degraded')
  assertResultCoherent(quoteRes)
})

test('a node two blocks behind ("header not found" on every quote) is inconclusive/rpc-degraded, never a confident no-route (C4-H1)', async () => {
  // THE C4-H1 REPRO. `eth_getBlockByNumber` is answered by a healthy node; the pinned `eth_call`s
  // are load-balanced onto one that does not have that block's state yet. Not one of those errors
  // mentions a revert, is a 429, or carries a status — so every one of them used to land on the
  // classifier's `execution` default and be tallied as `quoting.failed`: on-chain evidence the
  // search never had, and (with discovery genuinely complete here) a CONFIDENT `no-route` from a
  // search that never touched chain state.
  const manifest = baseManifest({ v2Block: BLOCK_NUMBER + 1_000_000n, v4: false })
  const { client } = stubClient({ nodeStateQuotes: true })
  const router = createRouter({ client, manifest })

  const res = await router.getSwap({ tokenIn: TOKEN_A, tokenOut: TOKEN_B, amountIn: AMOUNT_IN, trader: TRADER })

  expect(res.status).toBe('inconclusive')
  expect(res.status).not.toBe('no-route')
  if (res.status === 'inconclusive') {
    expect(res.reason.code).toBe('rpc-degraded')
    // Counted on the transport axis, not the on-chain one: `NodeStateError extends TransportError`.
    expect(res.search.quoting.transportFailed).toBeGreaterThan(0)
    expect(res.search.quoting.failed).toBe(0) // nothing reverted — nothing executed at all
    expect(res.search.quoting.succeeded).toBe(0)
    expect(res.search.discovery.v2.status).toBe('complete') // the axis that made the old lie convincing
    expect(res.search.aborted).toBe(false)
    expect(res.search.enumeration.exhaustiveWithinMaxHops).toBe(false)
  }
  assertResultCoherent(res)

  const quoteRes = await router.getQuote({ tokenIn: TOKEN_A, tokenOut: TOKEN_B, amountIn: AMOUNT_IN })
  expect(quoteRes.status).toBe('inconclusive')
  if (quoteRes.status === 'inconclusive') expect(quoteRes.reason.code).toBe('rpc-degraded')
  assertResultCoherent(quoteRes)
})

test('a head that goes BACKWARDS between searches is inconclusive/rpc-degraded with headRegressed, and recovers on the next advance (C4-H1)', async () => {
  // The quiet half of the same failure: the lagging node does not error, it just answers about an
  // older chain. Nothing is 429'd, nothing reverts in the transport sense — so without its own axis
  // this search would report a perfectly confident `no-route` computed against state the router had
  // already been past.
  const manifest = baseManifest({ v2Block: BLOCK_NUMBER + 1_000_000n, v4: false })
  let head = BLOCK_NUMBER
  const { client } = stubClient({ blockNumber: () => head })
  const router = createRouter({ client, manifest })
  const req: SwapRequest = { tokenIn: TOKEN_A, tokenOut: TOKEN_B, amountIn: AMOUNT_IN, trader: TRADER }

  // 1. A normal search at N: discovery completes without a scan, nothing prices, verdict is honest.
  const first = await router.getSwap(req)
  expect(first.status).toBe('no-route')
  if (first.status === 'no-route') expect(first.reason.code).toBe('no-viable-route') // C4-P5: nothing was ever priced
  expect(first.search.headRegressed).toBe(false)
  expect(first.search.block.number).toBe(BLOCK_NUMBER)
  assertResultCoherent(first)

  // 2. The load balancer now answers from a replica two blocks behind — and keeps doing so, so the
  //    guard's single refetch does not shake it off.
  head = BLOCK_NUMBER - 2n
  const second = await router.getSwap(req)
  expect(second.status).toBe('inconclusive')
  expect(second.status).not.toBe('no-route')
  if (second.status === 'inconclusive') expect(second.reason.code).toBe('rpc-degraded')
  expect(second.search.headRegressed).toBe(true)
  expect(second.search.block.number).toBe(BLOCK_NUMBER - 2n) // searched where the node actually is
  assertResultCoherent(second)

  // 3. The head advances past the watermark: back to a plain authoritative verdict, with no sticky
  //    degradation left over from the blip.
  head = BLOCK_NUMBER + 1n
  const third = await router.getSwap(req)
  expect(third.status).toBe('no-route')
  expect(third.search.headRegressed).toBe(false)
  expect(third.search.block.number).toBe(BLOCK_NUMBER + 1n)
  assertResultCoherent(third)
})

test('a transient head blip is absorbed by the single refetch: no degradation reported at all', async () => {
  // The guard refetches once precisely so one unlucky request to a lagging replica costs a round
  // trip rather than a caller-visible `inconclusive`.
  const manifest = baseManifest({ v2Block: BLOCK_NUMBER + 1_000_000n, v4: false })
  // Search 1 pins N (watermark N). Search 2's first fetch lands on the lagging replica (N-2); its
  // one refetch lands on a healthy node (N+1), so the search proceeds normally at N+1.
  const heads = [BLOCK_NUMBER, BLOCK_NUMBER - 2n, BLOCK_NUMBER + 1n]
  let served = 0
  const { client } = stubClient({ blockNumber: () => heads[Math.min(served++, heads.length - 1)]! })
  const router = createRouter({ client, manifest })
  const req: SwapRequest = { tokenIn: TOKEN_A, tokenOut: TOKEN_B, amountIn: AMOUNT_IN, trader: TRADER }

  const first = await router.getSwap(req)
  expect(first.search.block.number).toBe(BLOCK_NUMBER)

  const second = await router.getSwap(req)
  expect(second.status).toBe('no-route')
  expect(second.search.headRegressed).toBe(false)
  expect(second.search.block.number).toBe(BLOCK_NUMBER + 1n) // the refetch's answer, not the blip's
  expect(served).toBe(3) // exactly one extra round trip: the guard refetches once, never in a loop
  assertResultCoherent(second)
})

test('two searches at the SAME head are not a regression — the guard fires on strictly-below only', async () => {
  // A quiet chain (or two calls inside one block) is the common case, not a degradation: `<` vs `<=`
  // here is the difference between an honest verdict and permanent `rpc-degraded` on every idle
  // chain, and it costs a second head round trip per search on top.
  const manifest = baseManifest({ v2Block: BLOCK_NUMBER + 1_000_000n, v4: false })
  const { client, counters } = stubClient({ blockNumber: () => BLOCK_NUMBER })
  const router = createRouter({ client, manifest })
  const req: SwapRequest = { tokenIn: TOKEN_A, tokenOut: TOKEN_B, amountIn: AMOUNT_IN, trader: TRADER }

  const first = await router.getSwap(req)
  const second = await router.getSwap(req)

  expect(first.search.headRegressed).toBe(false)
  expect(second.status).toBe('no-route') // still entitled to an authoritative verdict
  expect(second.search.headRegressed).toBe(false)
  expect(counters.blockFetches).toBe(2) // one per search: the equal head never triggered the refetch
  assertResultCoherent(second)
})

test('the watermark never moves BACKWARD on a within-bound lagging head', async () => {
  // The monotone-max property, observed from outside: after a lagging search at N-2, a later search
  // at N-1 is still behind the *watermark* (N) and must still report it. A watermark that tracked the
  // most recent head instead would call N-1 an advance over N-2 and hand back a confident verdict
  // computed two blocks behind where this router has already been.
  const manifest = baseManifest({ v2Block: BLOCK_NUMBER + 1_000_000n, v4: false })
  let head = BLOCK_NUMBER
  const { client } = stubClient({ blockNumber: () => head })
  const router = createRouter({ client, manifest })
  const req: SwapRequest = { tokenIn: TOKEN_A, tokenOut: TOKEN_B, amountIn: AMOUNT_IN, trader: TRADER }

  await router.getSwap(req) // watermark: N

  head = BLOCK_NUMBER - 2n
  const lagging = await router.getSwap(req)
  expect(lagging.search.headRegressed).toBe(true)

  head = BLOCK_NUMBER - 1n // higher than the last pinned block, still below the watermark
  const stillLagging = await router.getSwap(req)
  expect(stillLagging.status).toBe('inconclusive')
  expect(stillLagging.search.headRegressed).toBe(true)
  expect(stillLagging.search.block.number).toBe(BLOCK_NUMBER - 1n)
  assertResultCoherent(stillLagging)
})

test('a bogus high head does not poison the router forever: the watermark self-heals on two agreeing sane answers', async () => {
  // The failure mode a plain monotone maximum has: one glitched answer sits above every real head
  // for the life of the router, so every later search reports `rpc-degraded` (never again an
  // authoritative `no-route`) and pays two head round trips to do it. Two independent answers
  // hundreds of millions of blocks below the record are evidence about the RECORD, not the chain.
  const manifest = baseManifest({ v2Block: BLOCK_NUMBER + 1_000_000n, v4: false })
  let head = 9_999_999_999n // a provider glitch, far outside any plausible reorg or replica lag
  const { client, counters } = stubClient({ blockNumber: () => head })
  const router = createRouter({ client, manifest })
  const req: SwapRequest = { tokenIn: TOKEN_A, tokenOut: TOKEN_B, amountIn: AMOUNT_IN, trader: TRADER }

  await router.getSwap(req) // watermark poisoned: 9_999_999_999

  head = BLOCK_NUMBER
  const healing = await router.getSwap(req)
  expect(healing.status).toBe('no-route') // the fetch and its refetch agree, so nothing regressed
  expect(healing.search.headRegressed).toBe(false)
  expect(healing.search.block.number).toBe(BLOCK_NUMBER)

  const fetchesBefore = counters.blockFetches
  head = BLOCK_NUMBER + 1n
  const after = await router.getSwap(req)
  expect(after.status).toBe('no-route')
  expect(after.search.headRegressed).toBe(false)
  // Healed for good: back to one head round trip per search, not two forever.
  expect(counters.blockFetches - fetchesBefore).toBe(1)
  assertResultCoherent(after)
})

test('a within-bound regression is NOT self-healed away — the ordinary lagging replica still reports', async () => {
  // The other side of the self-heal bound: a two-block lag is exactly what the axis exists for, and
  // must not be explained away as a bad watermark.
  const manifest = baseManifest({ v2Block: BLOCK_NUMBER + 1_000_000n, v4: false })
  let head = BLOCK_NUMBER
  const { client } = stubClient({ blockNumber: () => head })
  const router = createRouter({ client, manifest })
  const req: SwapRequest = { tokenIn: TOKEN_A, tokenOut: TOKEN_B, amountIn: AMOUNT_IN, trader: TRADER }

  await router.getSwap(req)
  head = BLOCK_NUMBER - DEFAULT_REORG_OVERLAP_BLOCKS // well inside the plausible-lag bound
  const lagging = await router.getSwap(req)

  expect(lagging.status).toBe('inconclusive')
  expect(lagging.search.headRegressed).toBe(true)
  // And the watermark stayed put, so the next lagging search reports too.
  const again = await router.getSwap(req)
  expect(again.search.headRegressed).toBe(true)
  assertResultCoherent(lagging)
})

test('a failed head REFETCH degrades the search rather than escalating it to a total outage', async () => {
  // The refetch is a diagnostic. Letting it throw would take a search that already has a perfectly
  // usable pinned block and report `rpc-unavailable` — a strictly worse answer than the degraded one
  // the guard exists to produce.
  const manifest = baseManifest({ v2Block: BLOCK_NUMBER + 1_000_000n, v4: false })
  let fetches = 0
  const { client } = stubClient({
    blockNumber: () => {
      fetches++
      if (fetches === 1) return BLOCK_NUMBER // search 1: establishes the watermark
      if (fetches === 2) return BLOCK_NUMBER - 2n // search 2: behind, so the guard refetches...
      throw new Error('connection reset by peer') // ...and the refetch dies
    },
  })
  const router = createRouter({ client, manifest })
  const req: SwapRequest = { tokenIn: TOKEN_A, tokenOut: TOKEN_B, amountIn: AMOUNT_IN, trader: TRADER }

  await router.getSwap(req)
  const res = await router.getSwap(req)

  expect(res.status).toBe('inconclusive')
  if (res.status === 'inconclusive') expect(res.reason.code).toBe('rpc-degraded') // NOT 'rpc-unavailable'
  expect(res.search.headRegressed).toBe(true)
  expect(res.search.block.number).toBe(BLOCK_NUMBER - 2n) // the first answer, kept and searched at
  assertResultCoherent(res)
})

test('a 429 on the preflight call alone is inconclusive/rpc-degraded — the route stays unverified, never failed and never ready', async () => {
  const manifest = baseManifest({ v2Block: BLOCK_NUMBER + 1_000_000n, v4: false })
  const [probe] = directProbes(v2Module, TOKEN_A, TOKEN_B, AMOUNT_IN, manifest)
  const [token0] = sortAddresses(TOKEN_A, TOKEN_B)
  const zeroForOne = token0.toLowerCase() === TOKEN_A.toLowerCase()

  const { client, counters } = stubClient({
    calls: entryFor(probe!.quote.call, v2Return(10n ** 24n, 10n ** 24n, zeroForOne)),
    // Every verification attempt is rate limited, so the degradation never resolves.
    preflight: Array<'rate-limit'>(8).fill('rate-limit'),
  })
  const router = createRouter({ client, manifest })

  const res = await router.getSwap({ tokenIn: TOKEN_A, tokenOut: TOKEN_B, amountIn: AMOUNT_IN, trader: TRADER })

  expect(res.status).toBe('inconclusive')
  expect(res.status).not.toBe('no-route')
  expect(res.status).not.toBe('ready')
  if (res.status === 'inconclusive') {
    expect(res.reason.code).toBe('rpc-degraded')
    expect(res.search.verificationDegraded).toBe(true)
    // The quote itself succeeded — this is purely a verification-channel failure.
    expect(res.search.quoting.succeeded).toBeGreaterThan(0)
    expect(res.search.quoting.transportFailed).toBe(0)
    expect(res.search.discovery.v2.status).toBe('complete')
    // FW5/P1: the route priced and encoded fine, so it comes back — as `unverified`, which is
    // exactly what a lost simulation leaves behind. The caller can retry it against a healthier
    // endpoint instead of re-running the whole search.
    expect(res.best?.execution).toBe('unverified')
    expect(res.tx?.to).toBe(manifest.execution!.address)
  }
  expect(counters.preflights).toBeGreaterThan(0)
  assertResultCoherent(res)
})

test('a throttled readiness read never becomes a stated requirement: inconclusive/rpc-degraded, never a confident needs-action', async () => {
  // The sibling of the two probes above, one layer over: readiness reads flow through the same
  // `ethCall`, and coercing a throttled `balanceOf` to `0n` used to state `insufficient-balance
  // available: 0n` as fact — then short-circuit preflight, so nothing downstream could notice.
  const manifest = baseManifest({ v2Block: BLOCK_NUMBER + 1_000_000n, v4: false })
  const [probe] = directProbes(v2Module, TOKEN_A, TOKEN_B, AMOUNT_IN, manifest)
  const [token0] = sortAddresses(TOKEN_A, TOKEN_B)
  const zeroForOne = token0.toLowerCase() === TOKEN_A.toLowerCase()

  const { client, counters } = stubClient({
    calls: entryFor(probe!.quote.call, v2Return(10n ** 24n, 10n ** 24n, zeroForOne)),
    rateLimitBalanceRead: true,
    // The trader is genuinely unapproved, so a real requirement is observed alongside the lost read:
    // the list is non-empty but INCOMPLETE, which is exactly what must not be promised.
    readiness: { erc20Allowance: 0n },
  })
  const router = createRouter({ client, manifest })

  const res = await router.getSwap({ tokenIn: TOKEN_A, tokenOut: TOKEN_B, amountIn: AMOUNT_IN, trader: TRADER })

  expect(res.status).toBe('inconclusive')
  expect(res.status).not.toBe('needs-action')
  if (res.status === 'inconclusive') {
    expect(res.reason.code).toBe('rpc-degraded')
    expect(res.search.verificationDegraded).toBe(true)
    expect(res.search.quoting.succeeded).toBeGreaterThan(0) // the route itself priced fine
    // FW5/P1: no `needs-action` errand is promised off a half-read funding state — but the route and
    // its calldata are still handed over, which is strictly more than this path used to return.
    expect(res.best?.quote.amountOut).toBeGreaterThan(0n)
    expect(res.tx?.to).toBe(manifest.execution!.address)
  }
  expect(counters.preflights).toBe(0) // funding state unknown ⇒ no simulation to misread
  assertResultCoherent(res)
})

test('a genuinely unmet requirement (reads all landed) is still needs-action — the fix does not blunt real requirements', async () => {
  const manifest = baseManifest({ v2Block: BLOCK_NUMBER + 1_000_000n, v4: false })
  const [probe] = directProbes(v2Module, TOKEN_A, TOKEN_B, AMOUNT_IN, manifest)
  const [token0] = sortAddresses(TOKEN_A, TOKEN_B)
  const zeroForOne = token0.toLowerCase() === TOKEN_A.toLowerCase()

  const { client } = stubClient({
    calls: entryFor(probe!.quote.call, v2Return(10n ** 24n, 10n ** 24n, zeroForOne)),
    readiness: { balance: 0n }, // a read that LANDED and said zero
  })
  const router = createRouter({ client, manifest })

  const res = await router.getSwap({ tokenIn: TOKEN_A, tokenOut: TOKEN_B, amountIn: AMOUNT_IN, trader: TRADER })

  expect(res.status).toBe('needs-action')
  if (res.status === 'needs-action') {
    expect(res.requirements).toContainEqual({ kind: 'insufficient-balance', token: TOKEN_A, required: AMOUNT_IN, available: 0n })
    expect(res.search.verificationDegraded).toBe(false)
  }
  assertResultCoherent(res)
})

test('a preflight lost to the transport does not write the SEARCH off: the verifier falls through to the next candidate', async () => {
  // The 'unverified' vs 'failed' distinction, observable from outside: a transport loss says nothing
  // about the route, so the candidate is passed over (never demoted to `failed`) and the walk goes
  // on — a runner-up whose simulation gets through still returns `ready`.
  const manifest = baseManifest({ v2Block: BLOCK_NUMBER + 1_000_000n })
  const poolKey: PoolKey = { currency0: TOKEN_A, currency1: TOKEN_B, fee: 2500, tickSpacing: 50, hooks: zeroAddress }
  const v4Leg = { pool: v4Ref(poolKey), currencyIn: TOKEN_A, currencyOut: TOKEN_B }
  const [v2Probe] = directProbes(v2Module, TOKEN_A, TOKEN_B, AMOUNT_IN, manifest)
  const [token0] = sortAddresses(TOKEN_A, TOKEN_B)
  const zeroForOne = token0.toLowerCase() === TOKEN_A.toLowerCase()

  const { client, counters } = stubClient({
    // The v4 pool outprices the v2 one, so its preflight goes first — and is rate limited.
    calls: {
      ...entryFor(v4Module.encodeQuote([v4Leg], AMOUNT_IN, manifest).call, v4Return(10n ** 21n)),
      ...entryFor(v2Probe!.quote.call, v2Return(10n ** 24n, 10n ** 24n, zeroForOne)),
    },
    preflight: ['rate-limit', 'ok'],
  })
  const router = createRouter({ client, manifest })
  await router.ingestPool({ protocol: 'v4', poolKey })

  const res = await router.getSwap({ tokenIn: TOKEN_A, tokenOut: TOKEN_B, amountIn: AMOUNT_IN, trader: TRADER })

  expect(res.status).toBe('ready')
  if (res.status === 'ready') {
    expect(res.execution.verifiedAtBlock.number).toBe(res.search.block.number)
    // The transport-lost leader was never blamed: it sits in `alternatives` as `unverified`.
    const lost = res.alternatives.find((a) => a.execution === 'unverified')
    expect(lost).toBeDefined()
    expect(res.search.verificationDegraded).toBe(true) // a lost call still degrades the report
  }
  expect(counters.preflights).toBe(2)
  assertResultCoherent(res)
})
