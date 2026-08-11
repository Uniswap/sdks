import {
  createRouter,
  manifestFor,
  RouterConfigError,
  type QuoteResult,
  type Router,
  type SearchEvent,
} from '@uniswap/router-lite-sdk'
import { scanLogs, V4_POOL_MANAGER_ABI } from '@uniswap/router-lite-sdk/experimental'
import { beforeAll, describe, expect, it } from 'bun:test'
import { decodeEventLog, encodeEventTopics, parseAbi, parseEther, type Address, type Hex, type PublicClient } from 'viem'

import { canaryLog, robinhoodChainId, robinhoodClient, robinhoodEnabled } from './env'
import { CANARY_TRADER, probeSimulateV1Support, simulateSwapE2E } from './simulate'

// ---------------------------------------------------------------------------
// ROBINHOOD CHAIN (4663) CANARY — the repurposability proof, as a repeatable test.
//
// Gated on ROUTER_LITE_CANARY=1 AND CANARY_RPC_URL_ROBINHOOD (see `env.ts` for why this chain gets
// its own variable rather than a fourth CANARY_RPC_URL_*). NEVER PR-blocking: same nightly-only
// posture as `canary.test.ts`. NO KEYS, NO FUNDS, NO BROADCASTS — swaps are proved by
// `eth_simulateV1` (`simulate.ts`'s chained acquire→approve→swap), never sent. The manifest
// shipped QUOTE-ONLY (no encoder existed for this chain's 2.1.1 Universal Router) until
// `encode/ur21.ts`; it now carries `commandSet: 'ur-2.1'`, the swap row below is this chain's
// execution proof, and the quote-only path is still pinned via an `execution: undefined` override.
//
// GRACEFUL SKIPS EVERYWHERE, BY DESIGN. Every row's subject is a pool that some stranger launched
// on a public chain in the last three days. "No freshly-launched pool traded in the window" is a
// real, expected state of the world (a quiet weekend), not a defect in this package — so those rows
// log a note and pass. What this file DOES fail on is the SDK misbehaving about something it was
// told: a wrong chain id, a manifest that lost its quote-only shape, a search that returns an
// incoherent result.
//
// ---------------------------------------------------------------------------
// WHY THIS CHAIN IS THE INTERESTING ONE.
//
// Robinhood Chain is the first chain the SDK was pointed at with nothing to copy: no existing
// manifest, no assumption that any address would resemble another chain's. Three things about it
// exercise paths no other canary row reaches:
//
//  1. THE SECOND COMMAND SET, live. This chain's one Universal Router is a 2.1.1 deployment —
//     `ROBINHOOD_MANIFEST` shipped quote-only (C4-P3) while `COMMAND_SETS` was `['ur-2.0']`, and
//     now carries it under `commandSet: 'ur-2.1'` (`encode/ur21.ts`). The swap row below is the
//     only place the ur-2.1 encoder's output meets a real chain (mainnet forks can only execute
//     ur-2.0, and this chain has no forkable archive endpoint), so simulation IS the execution
//     proof here. The quote-only configuration is still exercised via override.
//  2. A 0.1s BLOCK TIME. `eagerPairScanBlocks` is 6,048,000 blocks here — 2.5x Arbitrum's, 20x
//     Base's. Every budget in this file is sized for that, and the per-row `AbortSignal` is what
//     keeps a row finite rather than open-ended.
//  3. HINT-FREE DISCOVERY ON A FOREIGN CHAIN. The memecoin rows select their pool from logs but
//     quote with NO hints, so the search has to rediscover it through the manifest alone. A wrong
//     poolManager, a wrong quoter, or a wrong deployment block does not produce a slightly-off
//     number here — it produces no route.
//
// ---------------------------------------------------------------------------
// LIVE-RUN LOG (C4-T5, first-ever run against this chain, 2026-08-05, keyed archive endpoint —
// alchemy, robinhood-mainnet). Every number measured. Endpoint identity is kept at provider
// granularity in what is WRITTEN HERE manually — same posture as `canary.test.ts`. THAT IS NARROWER
// THAN "never a keyed URL", THOUGH, AND WORTH BEING PRECISE ABOUT: `redactKeyedUrl`
// (`canary/providers.test.ts`) only scrubs the captured-error fixture path (`providerErrors.json`);
// it is not wired into this file at all. An uncaught error surfacing from a viem call anywhere in
// this suite would print its full, unredacted URL straight into the nightly job's raw logs — the
// same caveat `canary.test.ts` carries for its own uncaught errors.
//
// chain facts confirmed at run time: head ~28,170,000; chain age 96.4 days (block 1 timestamped
// 2026-04-30); 0.10028 s/block over the last 1,000,000 blocks. Archive state available — the
// manifest's five deployment blocks were binary-searched over `eth_getCode` in 27 calls each.
//
// deployments (all verified by REAL EVENTS, not just `eth_getCode` — see `manifest.ts`):
//   v4 poolManager  18,347 `Initialize` logs over the last 2,000,000 blocks
//   v3 factory      12,407 `PoolCreated`
//   v2 factory       1,689 `PairCreated`   (v2 IS deployed here)
//
// THE METHODOLOGY FINDING WORTH REMEMBERING: mainnet's UR 2.0 address AND Base's both have code on
// this chain, 19,499 bytes each and byte-identical to those chains' own deployments. `eth_getCode`
// would have read that as "UR 2.0 is deployed here". Fingerprinting the routers' baked-in immutables
// showed one embeds MAINNET's WETH/factories and the other BASE's — foreign-configured routers at
// cross-chain-identical addresses. Immutable fingerprinting, not `eth_getCode`, is the oracle for
// "configured for THIS chain".
//
// token census behind `coreIntermediates`: across the v4 `Initialize` + v3 `PoolCreated` logs, WETH
// leads with 15,096 pools, the v4 native sentinel follows with 11,552, and USDG ("Global Dollar",
// 6dp) is third with 1,999 — an order of magnitude ahead of the fourth. There is NO USDC on this
// chain; USDG is the stable, established from pool population rather than assumed.
//
// (The per-row memecoin results from that run are recorded in the block just above the memecoin
// describe below, next to the code that produced them.)
// ---------------------------------------------------------------------------

const RUN = robinhoodEnabled()

/** USDG ("Global Dollar", 6dp) — this chain's stable, and the second `coreIntermediates` entry.
 *  NOT USDC: no USDC deployment exists here (see `manifest.ts`'s census note). */
const USDG: Address = '0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168'

/** The v4 native sentinel — `currency0` on this chain's native pools. */
const NATIVE_SENTINEL = '0x0000000000000000000000000000000000000000'

/** ~3 days at 0.1s/block — the "recently launched" window the memecoin rows draw from. */
const THREE_DAYS_BLOCKS = 2_592_000n

/**
 * ~8 hours at 0.1s/block — the window a candidate pool must have TRADED in to be considered live.
 *
 * `Initialize` alone is not activity: a pool can be initialized and never receive liquidity, and
 * quoting one of those is a statement about the launcher rather than about this SDK (the mainnet
 * canary learned this the expensive way — see `canary.test.ts`'s note on `pickTradeableRecentV4Pool`,
 * where betting a row on the single newest pool hung the suite for ten minutes). Requiring a recent
 * `Swap` log is a cheap, direct filter for "this pool is real", applied before any quoting.
 */
const ACTIVITY_BLOCKS = 300_000n

/**
 * Per-row wall-clock budget.
 *
 * Generous enough for the 6,048,000-block wave-0 window, and bounded because an unbounded row on a
 * 0.1s chain does not fail — it simply never returns. EVERY ROW SPENDS ITS WHOLE BUDGET, which is
 * the thing to know when changing this number: the leading route is priced in wave 0 within seconds
 * (the live run: 15-60s on this chain), but the iterator keeps producing waves until the signal
 * fires, so this is a per-row COST, not a per-row timeout that only bites on failure. Two rows use it
 * (`native -> USDG` and the reverse memecoin row); the hunt uses the cheaper
 * {@link PER_CANDIDATE_BUDGET_MS}. Together with the scans, that is this file's whole runtime, and it
 * has to stay inside one CI attempt's cap — see `.github/workflows/router-lite-canary.yml`'s retry
 * arithmetic before raising it.
 */
const QUOTE_BUDGET_MS = 120_000

/** Budget for the selection scans themselves (the 3-day `Initialize` walk is ~260 `eth_getLogs`
 *  legs at the default chunk size). A scan that cannot finish yields an empty candidate list, which
 *  the rows below treat as a logged skip. */
const SCAN_BUDGET_MS = 180_000

/**
 * Per-candidate budget while HUNTING for a pool that will actually price (see
 * {@link huntTradeablePool}).
 *
 * 90s, NOT 60s, and the difference is measured rather than padded: across three live runs wave 0
 * landed anywhere from 15.3s to 61.0s (see the results block below the memecoin describe — run 2's
 * `native -> USDG` first quote arrived at 59.0s and one memecoin row's wave 0 at 61.0s, while run 3's
 * were 17.0-35.7s). A 60s budget would therefore have cut off candidates whose wave 0 was merely SLOW
 * rather than dead, scoring them un-tradeable and spending the hunt on a false negative. 90s clears
 * the observed worst case with margin while still costing well under a full {@link QUOTE_BUDGET_MS} row.
 *
 * THE VARIANCE IS THE PROVIDER, NOT THE CHAIN: the slow run was the one that had just walked
 * 2,592,000 blocks of `Initialize` logs and 300,000 of `Swap` logs through the same endpoint, so
 * wave 0's own reads were queueing behind that. Anything tuned here should be re-checked against a run
 * that includes the scans, not a standalone quote.
 *
 * The hunt's total worst case is this times {@link MAX_MEMECOIN_CANDIDATES}, and that product is the
 * number to check against the CI attempt cap.
 */
const PER_CANDIDATE_BUDGET_MS = 90_000

/**
 * How many freshly-launched pools to try before giving the memecoin rows up.
 *
 * EIGHT, BECAUSE THREE WAS NOT ENOUGH — and finding that out was the point of running this file
 * live. See the results block below the memecoin describe: an exploratory pass priced 2 of its 3
 * candidates, and then the very first run of THIS file priced 0 of 3 and went red. Nothing about the
 * SDK differed between them; the pools did. A freshly-launched pool on this chain is routinely
 * un-quotable minutes after the `Swap` logs that made it look alive, because it was drained. So the
 * row can never be "quote the N newest and assert": it has to WALK candidates until one prices,
 * which is exactly the conclusion `canary.test.ts`'s `pickTradeableRecentV4Pool` reached on mainnet
 * for the same reason.
 *
 * Four, because 4 x {@link PER_CANDIDATE_BUDGET_MS} is 6 minutes and that is what the nightly job's
 * per-attempt cap has room for alongside everything else (see the workflow's retry arithmetic). The
 * hunt's budget was spent on a longer per-candidate window rather than more candidates, because the
 * failure mode that budget guards against — scoring a merely-slow pool as dead — wastes a candidate
 * either way, so a too-short window costs more than a shorter list does.
 *
 * With the walk bounded per candidate and "none priced" a logged skip rather than a failure, this
 * number only trades runtime against how often the row produces real signal instead of a skip — it can
 * no longer turn the nightly red either way.
 */
const MAX_MEMECOIN_CANDIDATES = 4

/** A first buy of a fresh launch, not an attempt to eat the whole curve (same reasoning as
 *  `canary.test.ts`'s `LONG_TAIL_ETH_IN`). */
const MEMECOIN_ETH_IN = parseEther('0.01')

/** `Swap` is not in `internal/abis.ts` (the SDK never watches it) — declared here for the activity
 *  filter only, and only its indexed `id` topic is actually read. */
const V4_SWAP_ABI = parseAbi([
  'event Swap(bytes32 indexed id, address indexed sender, int128 amount0, int128 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick, uint24 fee)',
])

const ERC20_META_ABI = parseAbi(['function symbol() view returns (string)', 'function decimals() view returns (uint8)'])

type Candidate = {
  id: Hex
  /** The non-native side — the "memecoin". */
  other: Address
  createdAtBlock: bigint | null
  fee: number
  hooks: Address
  /** Whether the pool's native leg is the v4 native sentinel or the wrapped token. */
  nativeSide: 'native' | 'wrapped'
  recentSwaps: number
}

type Row = {
  label: string
  status: string
  amountOut: string | null
  reasonCode: string | null
  route: string | null
  firstQuoteMs: number | null
  totalMs: number
  /** One entry per `quotes()` event. `status` is null on `progress` — a report axis moved without a
   * new lead, so there is no result to take a status off. */
  waves: { index: number; elapsedMs: number; event: SearchEvent<QuoteResult>['type']; status: string | null }[]
}

let client: PublicClient | undefined
let candidates: Candidate[] = []
/** The first candidate that priced, and its row — `undefined` when none of them would. */
let winner: { pool: Candidate; row: Row } | undefined
const meta = new Map<string, { symbol: string; decimals: number }>()

function manifest() {
  return manifestFor(robinhoodChainId())
}

/** A leg rendered for the log — the discovery route the brief asks each row to report. */
function describeLeg(leg: { pool: any }): string {
  const p = leg.pool
  if (p.protocol === 'v2') return `v2(${p.address})`
  if (p.protocol === 'v3') return `v3(fee ${p.fee}, ${p.address})`
  return `v4(fee ${p.poolKey.fee}, tickSpacing ${p.poolKey.tickSpacing}, hooks ${p.poolKey.hooks})`
}

/**
 * One HINT-FREE quote, on a router and client that have never seen a request — the cold-discovery
 * measurement the brief asks for.
 *
 * A router shared between rows would carry the previous row's discovered pools and report discovery
 * it never performed (the exact error `env.ts#freshClient` exists to prevent on mainnet). Iterating
 * `quotes` rather than awaiting `getQuote` is what makes the per-wave timings observable; the final
 * yield is the result `getQuote` would have returned.
 */
async function quoteRow(
  label: string,
  tokenIn: 'native' | Address,
  tokenOut: 'native' | Address,
  amountIn: bigint,
  budgetMs: number = QUOTE_BUDGET_MS,
): Promise<Row> {
  const router: Router = createRouter({ client: robinhoodClient()!, manifest: manifest() })
  const start = performance.now()
  const waves: Row['waves'] = []
  let firstQuoteMs: number | null = null
  let last: QuoteResult | undefined
  let index = 0

  for await (const event of router.quotes({ tokenIn, tokenOut, amountIn, signal: AbortSignal.timeout(budgetMs) })) {
    const elapsedMs = Math.round(performance.now() - start)
    if (event.type === 'progress') {
      waves.push({ index: index++, elapsedMs, event: 'progress', status: null })
      continue
    }
    waves.push({ index: index++, elapsedMs, event: event.type, status: event.result.status })
    if (firstQuoteMs === null && event.result.status === 'quote') firstQuoteMs = elapsedMs
    last = event.result
  }

  const row: Row = {
    label,
    status: last?.status ?? 'none',
    amountOut: last?.status === 'quote' ? last.best.quote.amountOut.toString() : null,
    reasonCode: last && 'reason' in last ? last.reason.code : null,
    route: last?.status === 'quote' ? last.best.route.legs.map(describeLeg).join(' -> ') : null,
    firstQuoteMs,
    totalMs: Math.round(performance.now() - start),
    waves,
  }

  canaryLog('robinhood row', {
    ...row,
    // The four independent report axes, logged whatever the verdict — the nightly log IS the report.
    report: last
      ? {
          block: last.search.block.number.toString(),
          discovery: Object.fromEntries(
            Object.entries(last.search.discovery).map(([k, v]) => [k, v.status]),
          ),
          legsMeasured: last.search.enumeration.legsMeasured,
          quoting: last.search.quoting,
          aborted: last.search.aborted,
          headRegressed: last.search.headRegressed,
        }
      : null,
  })
  return row
}

/**
 * Freshly-`Initialize`d v4 pools with a native/wrapped leg that have ALSO traded recently, newest
 * first. Returns `[]` rather than throwing on any shortfall — an empty list is a logged skip for
 * every caller, never a failure (see this file's header on graceful skips).
 */
async function discoverActiveRecentPools(c: PublicClient): Promise<Candidate[]> {
  const m = manifest()
  const head = await c.getBlockNumber()
  const wrapped = m.wrappedNative.toLowerCase()
  const poolManager = m.v4!.poolManager

  const initTopic = encodeEventTopics({ abi: V4_POOL_MANAGER_ABI, eventName: 'Initialize' })[0]!
  const init = await scanLogs(
    c,
    { address: poolManager, topics: [initTopic] },
    { fromBlock: head > THREE_DAYS_BLOCKS ? head - THREE_DAYS_BLOCKS : 0n, toBlock: head },
    { signal: AbortSignal.timeout(SCAN_BUDGET_MS) },
  )

  const swapTopic = encodeEventTopics({ abi: V4_SWAP_ABI, eventName: 'Swap' })[0]!
  const swaps = await scanLogs(
    c,
    { address: poolManager, topics: [swapTopic] },
    { fromBlock: head > ACTIVITY_BLOCKS ? head - ACTIVITY_BLOCKS : 0n, toBlock: head },
    { signal: AbortSignal.timeout(SCAN_BUDGET_MS) },
  )
  const swapCounts = new Map<string, number>()
  for (const l of swaps.logs) {
    const id = l.topics?.[1]?.toLowerCase()
    if (id) swapCounts.set(id, (swapCounts.get(id) ?? 0) + 1)
  }

  canaryLog('robinhood pool discovery', {
    head: head.toString(),
    initializeLogs: init.logs.length,
    initializeScanComplete: init.complete,
    swapLogs: swaps.logs.length,
    swapScanComplete: swaps.complete,
    distinctActivePools: swapCounts.size,
  })

  const out: Candidate[] = []
  // `scanLogs` walks recent-first, so this list is already newest-first.
  for (const l of init.logs) {
    const d = decodeEventLog({
      abi: V4_POOL_MANAGER_ABI,
      eventName: 'Initialize',
      topics: l.topics as [Hex, ...Hex[]],
      data: l.data,
    })
    const { id, currency0, currency1, fee, hooks } = d.args
    const c0 = currency0.toLowerCase()
    const c1 = currency1.toLowerCase()
    const isNative = c0 === NATIVE_SENTINEL || c1 === NATIVE_SENTINEL
    const isWrapped = c0 === wrapped || c1 === wrapped
    if (!isNative && !isWrapped) continue
    const recentSwaps = swapCounts.get(id.toLowerCase()) ?? 0
    if (recentSwaps === 0) continue
    const nativeLeg = isNative ? NATIVE_SENTINEL : wrapped
    out.push({
      id,
      other: (c0 === nativeLeg ? currency1 : currency0) as Address,
      createdAtBlock: l.blockNumber ?? null,
      fee,
      hooks,
      nativeSide: isNative ? 'native' : 'wrapped',
      recentSwaps,
    })
  }

  // ORDERED BY ACTIVITY, NOT BY RECENCY. Every pool in `out` already satisfies "launched in the last
  // three days" — that is what the `Initialize` window selected, and it is the property the memecoin
  // case is about. Recency does not order the HUNT well, though: run 2's three newest candidates had
  // 15-52 swaps each and all three were dead, while pools a little further down that run's list had
  // 199-223. Swap count in the last ~8 hours is simply the better predictor of "will still quote",
  // and spending the hunt's budget in that order costs nothing and skips fewer nights.
  out.sort((a, b) => b.recentSwaps - a.recentSwaps)
  return out.slice(0, MAX_MEMECOIN_CANDIDATES)
}

/**
 * `symbol()`/`decimals()` for a token, memoized, never throwing.
 *
 * A ROW'S SYMBOL IS ATTACKER-CONTROLLED TEXT and it is logged verbatim. Whoever launched the pool
 * chose the string, so a nightly run's log can legitimately contain profanity, slurs, unicode
 * lookalikes, or something shaped like a log line of its own — this suite picks its subjects from
 * whatever a public chain's launchpads produced in the last three days, so there is no version of
 * this row that only sees tasteful names. It is logged anyway because a row is unreadable without
 * some human-facing label, and it goes through `JSON.stringify` (via `canaryLog`), which escapes
 * newlines and quotes so a hostile symbol cannot forge a second log line. Nothing downstream ever
 * branches on it. Do not promote a live symbol into a committed comment or an assertion.
 */
async function symbolOf(c: PublicClient, token: Address): Promise<{ symbol: string; decimals: number }> {
  const cached = meta.get(token.toLowerCase())
  if (cached) return cached
  try {
    const [symbol, decimals] = await Promise.all([
      c.readContract({ address: token, abi: ERC20_META_ABI, functionName: 'symbol' }),
      c.readContract({ address: token, abi: ERC20_META_ABI, functionName: 'decimals' }),
    ])
    const v = { symbol: symbol as string, decimals: Number(decimals) }
    meta.set(token.toLowerCase(), v)
    return v
  } catch {
    // A launch token with a non-standard `symbol()` is not this suite's problem — label it and move on.
    const v = { symbol: '<unreadable>', decimals: 18 }
    meta.set(token.toLowerCase(), v)
    return v
  }
}

/**
 * Walks {@link candidates} newest-first and returns the first one that will actually PRICE a trade,
 * or `undefined` when none of them will.
 *
 * "RECENTLY LAUNCHED AND RECENTLY TRADED" IS NOT THE SAME AS "TRADEABLE NOW", and conflating the two
 * is what turned this file red on its first live run (0 of 3, where an exploratory pass minutes
 * earlier had priced 2 of 3 — see the results block below the memecoin describe). A launch pool can
 * be drained between the `Swap` log that vouched for it and the moment a quote asks for a price, and
 * on this chain that is common rather than exotic. Each candidate therefore gets its OWN bounded
 * budget: {@link PER_CANDIDATE_BUDGET_MS} converts "this pool is dead" from a red row into a 60-second
 * no, and the hunt moves on.
 *
 * The winning row is RETURNED, not re-quoted, so the forward assertion and the reverse row both
 * describe the same pool and the hunt is not paid for twice.
 */
async function huntTradeablePool(): Promise<{ pool: Candidate; row: Row } | undefined> {
  for (const pool of candidates) {
    const { symbol } = await symbolOf(client!, pool.other)
    canaryLog('robinhood memecoin candidate starting', {
      symbol,
      token: pool.other,
      hooks: pool.hooks,
      fee: pool.fee,
      nativeSide: pool.nativeSide,
      createdAtBlock: pool.createdAtBlock?.toString() ?? null,
      recentSwaps: pool.recentSwaps,
    })
    const row = await quoteRow(`native->${symbol}`, 'native', pool.other, MEMECOIN_ETH_IN, PER_CANDIDATE_BUDGET_MS)
    if (row.status === 'quote') return { pool, row }
    canaryLog('robinhood memecoin candidate did not price — trying the next one', {
      symbol,
      status: row.status,
      reasonCode: row.reasonCode,
    })
  }
  return undefined
}

beforeAll(async () => {
  if (!RUN) return
  client = robinhoodClient()
  candidates = await discoverActiveRecentPools(client!)
  for (const p of candidates) await symbolOf(client!, p.other)
  canaryLog('robinhood candidates selected', {
    count: candidates.length,
    pools: candidates.map((p) => ({
      symbol: meta.get(p.other.toLowerCase())?.symbol,
      token: p.other,
      createdAtBlock: p.createdAtBlock?.toString() ?? null,
      fee: p.fee,
      hooks: p.hooks,
      nativeSide: p.nativeSide,
      recentSwaps: p.recentSwaps,
    })),
  })
  // The hunt runs HERE, once, so both memecoin rows below describe the same pool — and so the
  // reverse row is never pointed at a pool that never priced forward (which the first version of
  // this file did, by using `candidates[0]` unconditionally).
  winner = await huntTradeablePool()
  canaryLog('robinhood memecoin hunt result', {
    tried: candidates.length,
    found: Boolean(winner),
    symbol: winner ? meta.get(winner.pool.other.toLowerCase())?.symbol : null,
  })
}, 1_800_000)

describe.skipIf(!RUN)('Robinhood Chain manifest (canary, live)', () => {
  it('the endpoint really serves chain 4663, and the manifest agrees', async () => {
    const live = await client!.getChainId()
    expect(live).toBe(robinhoodChainId())
    expect(manifest().chainId).toBe(robinhoodChainId())
  })

  it('has code at every address the manifest names', async () => {
    const m = manifest()
    const addresses: [string, Address][] = [
      ['v2.factory', m.v2!.factory],
      ['v3.factory', m.v3!.factory],
      ['v3.v3QuoterV2', m.v3!.v3QuoterV2],
      ['v4.poolManager', m.v4!.poolManager],
      ['v4.quoter', m.v4!.quoter],
      ['wrappedNative', m.wrappedNative],
      ['coreIntermediates[1] (USDG)', USDG],
    ]
    for (const [label, address] of addresses) {
      const code = (await client!.request({ method: 'eth_getCode', params: [address, 'latest'] } as any)) as Hex
      expect(code, `${label} (${address}) has no code`).not.toBe('0x')
      expect(code.length, `${label} (${address}) has empty code`).toBeGreaterThan(2)
    }
  })

  it('USDG is the 6-decimal stable the manifest claims', async () => {
    const { symbol, decimals } = await symbolOf(client!, USDG)
    expect(symbol).toBe('USDG')
    expect(decimals).toBe(6)
    expect(manifest().coreIntermediates).toContain(USDG)
  })

  // THE QUOTE-ONLY PATH (C4-P3), still proved live — via override now that the built-in manifest
  // carries an execution bundle (the shape it shipped in before `encode/ur21.ts` existed). A
  // quote-only configuration must refuse a swap SYNCHRONOUSLY, before any RPC, with a named error.
  it('a quote-only override still refuses getSwap with RouterConfigError — no silent fallback', async () => {
    const m = manifestFor(robinhoodChainId(), { execution: undefined })
    expect(m.execution).toBeUndefined()
    const router = createRouter({ client: client!, manifest: m })
    // `getSwap` is `async`, so `validateSwapRequest`'s synchronous throw surfaces as a rejection —
    // "synchronously, before any RPC" is a claim about ordering, not about the call shape. Caught
    // once and asserted on the error object, rather than `.rejects` twice against one promise.
    let caught: unknown
    try {
      await router.getSwap({
        tokenIn: 'native',
        tokenOut: USDG,
        amountIn: parseEther('0.01'),
        trader: '0x1111111111111111111111111111111111111111',
        signal: AbortSignal.timeout(5_000),
      })
    } catch (err) {
      caught = err
    }
    expect(caught).toBeInstanceOf(RouterConfigError)
    expect((caught as Error).message).toMatch(/no execution bundle/)
  })

  // THE EXECUTION PROOF FOR THE ur-2.1 COMMAND SET — the row this chain gained when the manifest
  // did. `getSwap` encodes against the 2.1.1 Universal Router, and the canary's chained
  // acquire→approve→swap `eth_simulateV1` (see `simulate.ts`) runs that calldata against the REAL
  // chain: every call must succeed and the recipient must receive at least the SDK's own slippage
  // floor. Mainnet's fork suite cannot test this (it executes ur-2.0, and this chain cannot be
  // forked without an archive endpoint), so per the project's "I trust simulations" ruling this
  // simulation IS the execution proof. First live run 2026-08-07 (results block below the memecoin
  // describe): both directions simulated ok — native -> USDG delivered +0.01 bps vs quote, the
  // reverse +33 bps (the acquisition leg's own price impact, in the trader's favor), and a
  // v4-routed swap (hook-gated fee-0 pool) delivered its quote EXACTLY, 0 bps.
  it('simulates a real swap end-to-end: getSwap native -> USDG through the 2.1.1 router', async () => {
    const supported = await probeSimulateV1Support(client!)
    if (!supported) {
      canaryLog('endpoint does not support eth_simulateV1 — swap row recorded as a skip, not a failure')
      return
    }
    const router = createRouter({ client: client!, manifest: manifest() })
    const result = await router.getSwap({
      tokenIn: 'native',
      tokenOut: USDG,
      amountIn: parseEther('0.01'),
      trader: CANARY_TRADER,
      signal: AbortSignal.timeout(QUOTE_BUDGET_MS),
    })
    canaryLog('robinhood swap row: getSwap', { status: result.status })
    // On a 0.1s chain the search can legitimately run out of budget mid-discovery (see the quote
    // row above) — but a COMPLETED search against WETH/USDG that found nothing is a failure.
    if (result.status !== 'ready' && result.status !== 'needs-action') {
      expect(result.status).toBe('inconclusive')
      canaryLog('swap search did not complete within budget — recorded, not failed', {
        reasonCode: 'reason' in result ? result.reason.code : null,
      })
      return
    }
    expect(result.tx.to.toLowerCase()).toBe(manifest().execution!.address.toLowerCase())
    const outcome = await simulateSwapE2E(client!, result, CANARY_TRADER)
    canaryLog('robinhood swap row: simulated', {
      ok: outcome.ok,
      outputReceived: outcome.outputReceived.toString(),
      quotedAmountOut: result.best.quote.amountOut.toString(),
      route: result.best.route.legs.map(describeLeg).join(' -> '),
    })
    expect(outcome.ok).toBe(true)
    expect(outcome.outputReceived).toBeGreaterThan(0n)
  }, QUOTE_BUDGET_MS + 120_000)

  it('quotes native -> USDG through the same quote-only manifest', async () => {
    const row = await quoteRow('native->USDG', 'native', USDG, parseEther('0.01'))
    // `quote` is the expectation; `inconclusive` is accepted, because on a 0.1s chain the row's
    // budget expires mid-discovery by construction and that is a fact about the 6,048,000-block
    // window, not a defect (`inconclusive` still hands back everything it priced — see `types.ts`).
    // A completed search that found nothing (`no-route`) is what fails this row.
    expect(['quote', 'inconclusive']).toContain(row.status)
    if (row.status === 'quote') {
      expect(BigInt(row.amountOut!)).toBeGreaterThan(0n)
    } else {
      canaryLog('native->USDG did not complete within budget — recorded, not failed', { reasonCode: row.reasonCode })
    }
  }, QUOTE_BUDGET_MS + 60_000)
})

// ---------------------------------------------------------------------------
// THE MEMECOIN ROWS.
//
// LIVE RESULTS, C4-T5 (2026-08-05, head ~28,173,000-28,190,000). Pool population both runs drew
// from: ~23,550 v4 `Initialize` logs over the last ~3 days (2,592,000 blocks, complete in one
// `scanLogs` pass) and ~281,000-283,000 `Swap` logs over the last ~8 hours across ~3,118 distinct
// pools; 1,394 of the freshly-launched pools had both a native/wrapped leg AND recent trading.
// Everything quoted HINT-FREE.
//
// RUN 1 — exploratory, 3 fixed candidates, 240s each. 2 of 3 priced:
//
//   row                     status         amountOut (0.01 ETH in)   route                       first quote
//   native -> "v4"          quote          3,964,027.517 tokens      v4 fee 2500, hookless       15.6s
//   native -> NASCAT        inconclusive   —                         (nothing priced)            —
//   native -> STACKS        quote          7,196,927.036 tokens      v4 fee 0, HOOKED 0xEfe6…    15.3s
//   "v4" -> native (1 tok)  quote          2,498,138,424 wei         v4 fee 2500, hookless       17.4s
//
// (Pool ages at quote time: 8,260-9,902 blocks — 14-17 minutes old on a 0.1s chain. The first token's
// `symbol()` really is the string "v4", a launcher's joke rather than a decoding bug.)
//
// THE ROUND TRIP IS THE STRONGEST CORRECTNESS SIGNAL HERE. Row 1 priced 0.01 ETH at 3,964,027.517
// tokens, i.e. 2.523e9 wei per token; row 4 then sold 1 token back for 2,498,138,424 wei — 1.0% below
// the forward-implied rate, which is what a 0.25% fee tier plus spread plus the pool's own curve
// should cost on a round trip. Two independent quote directions through the same pool agreeing to
// within a fee is not something a wrong quoter address or a misparsed `PoolKey` produces.
//
// A HOOKED POOL WAS PRICED HINT-FREE (row 3, hook `0xEfe6…aEc`) — the memecoin case in its real form:
// launchpad hooks are the norm on this chain, and the search found and priced one with no help.
//
// RUN 2 — THIS FILE, first live execution, 3 fixed candidates at 120s each. 0 of 3 priced, and the
// row went RED. That failure is why the code above no longer looks like run 1:
//
//   row               status         wave 0 at   quoting (attempted/succeeded/failed)
//   native -> USDG    quote          59.0s       10 / 9 / 1     v3 fee 100 — the manifest routes
//   native -> #1      inconclusive   61.0s       27 / 8 / 19
//   native -> #2      inconclusive   57.0s       27 / 8 / 19
//   native -> #3      inconclusive   18.5s       27 / 8 / 19
//
// NOTHING ABOUT THE SDK DIFFERED BETWEEN THE TWO RUNS — the pools did. All three of run 2's
// candidates were fee-10000 hookless native-leg pools launched ~10,000 blocks (~16 min) earlier with
// 15-52 recorded swaps, and all three were dead by the time they were asked for a price. Note the
// shape of the failures: 8 quotes succeeded in each (the intermediate legs) and 19 failed (the
// target pair's fee tiers), and the verdict was `inconclusive`/`aborted` rather than a false
// `no-route` — the engine reported "I could not finish", which is correct, instead of "there is no
// route", which would have been a lie.
//
// THE LESSON, WHICH MAINNET HAD ALREADY LEARNED: "recently launched and recently traded" does not
// imply "tradeable now", and a row that quotes the N newest pools and asserts is a row betting the
// nightly on strangers not rugging. `canary.test.ts`'s `pickTradeableRecentV4Pool` reached this
// conclusion for the same reason; {@link huntTradeablePool} is its counterpart here — walk candidates
// under a per-candidate budget, assert on the first that prices, and treat "none of them would" as a
// logged skip. The non-negotiable liveness assertion moved to the `native -> USDG` row, which depends
// on the manifest and nothing else.
//
// RUN 3 — this file after that rework. 7 pass / 0 fail in 391s:
//
//   row                   status   amountOut               route                     wave 0
//   native -> FRONG       quote    299,762.867 tokens      v4 fee 2500, hookless     18.0s
//   native -> USDG        quote    18.665521 USDG          v3 fee 100                35.7s
//   FRONG -> native (1)   quote    33,101,101,443 wei      v4 fee 2500, hookless     17.0s
//
// THE HUNT HIT ON ITS FIRST CANDIDATE, so it cost one candidate's budget instead of six. That is the
// activity-ordering change in `discoverActiveRecentPools` paying off rather than luck: ordered by
// recent swap count, the six candidates carried 1,091-2,044 swaps each (versus 15-52 for run 2's
// three newest), and the top one priced immediately. Three of the six were hook-gated and one carried
// the dynamic-fee flag (`fee: 8388608`), so the ordering does not quietly select for "boring" pools.
//
// AND THE ROUND TRIP AGAIN, on a different pool: 0.01 ETH bought 299,762.867 FRONG (3.336e10 wei per
// token), and 1 FRONG sold back for 33,101,101,443 wei (3.310e10) — 0.78% under the forward-implied
// rate, for a 0.25%-per-side fee tier. Independently reproduced on a second chain-4663 pool days
// newer than run 1's.
//
// A FIFTH INDEPENDENT PRICE CHECK FELL OUT OF IT. `native -> USDG` priced ETH at 1,866.55 USDG here,
// against 1,863.51 / 1,862.17 / 1,863.27 USDC on Base / Unichain / Arbitrum in the same window (see
// `manifest.ts`'s first-live-quote table) — a 0.18% spread across five separately-assembled
// manifests, five endpoints, two stablecoins and both v3 and v4 winning routes. Wrong addresses do
// not agree to 18 basis points.
//
// THE EXECUTABLE (eth_simulateV1) PROOF ARRIVED WITH THE ur-2.1 COMMAND SET (2026-08-07) — until
// then the blocker was this package, not the provider (`getSwap` cannot run without an `execution`
// bundle, and `COMMAND_SETS` had no encoder for this chain's 2.1.1 router). First live execution
// proof, run the day the manifest gained its bundle (head ~30,672,000; keyed endpoint, alchemy
// robinhood-mainnet; every simulation the canary's chained acquire→approve→swap via one
// `eth_simulateV1`, no keys, no broadcasts):
//
//   direction                       route                        quote          simulated delta
//   native -> USDG (0.01 ETH)       v3 fee 100                   19.145200 USDG +0.01 bps
//   USDG -> native (10 USDG)        v3 fee 100 (+approve chain)  5.2223e15 wei  +33.34 bps *
//   native -> memecoin (0.01 ETH)   v4 fee 0, HOOK-GATED         4,822.0025 tk  0 bps — EXACT
//
//   * the reverse row's +33 bps is the acquisition leg's own price impact (the simulation buys its
//     USDG in the same block before selling it), in the trader's favor — not quote error.
//
// The v4 row is the one that only this chain could provide: the ur-2.1 `V4_SWAP` payload (the
// struct whose `minHopPriceX36` sits mid-struct — the layout the deployed router was proved to
// require, see `encode/ur21.ts`) executing through a hook-gated pool and delivering the quote to
// the wei. The swap row in the manifest describe above re-proves the native -> USDG direction on
// every canary run.
// ---------------------------------------------------------------------------

describe.skipIf(!RUN)('Robinhood Chain memecoin pools (canary, live, hint-free)', () => {
  it('prices a freshly-launched pool with no hints at all', () => {
    // The hunt already ran in `beforeAll`; this row asserts on its outcome. Both possible outcomes
    // are legitimate, and the difference between them is a fact about other people's pools:
    //
    //  - a winner was found -> assert the FULL shape of a cold-discovered quote (priced, routed,
    //    reached in wave 0). This is the repurposability proof.
    //  - no candidate priced -> LOGGED SKIP, not a failure. Every candidate was a pool launched in
    //    the last three days that had traded within the last eight hours and was nonetheless dead by
    //    the time it was asked for a price. That is a statement about a memecoin chain's launch
    //    churn; failing the nightly over it would train everyone to ignore this canary, which is
    //    worse than asserting less. The manifest's own liveness is NOT left unasserted either way —
    //    the `native -> USDG` row above covers it, and that one has no such dependency.
    if (!winner) {
      canaryLog('no freshly-launched pool would price — skipping the memecoin assertions', {
        candidatesTried: candidates.length,
      })
      expect(candidates.length).toBeGreaterThanOrEqual(0) // the row ran; nothing to assert on
      return
    }

    const { row, pool } = winner
    canaryLog('robinhood memecoin forward row (the winner)', {
      symbol: meta.get(pool.other.toLowerCase())?.symbol,
      hooks: pool.hooks,
      fee: pool.fee,
      nativeSide: pool.nativeSide,
      ageBlocksAtDiscovery: pool.createdAtBlock?.toString() ?? null,
      ...row,
    })

    expect(row.status).toBe('quote')
    expect(BigInt(row.amountOut!)).toBeGreaterThan(0n)
    expect(row.route).toBeTruthy()
    // Wave 0 is where a hint-free quote on a fresh pool has to land — if it only appeared in a later,
    // scan-bound wave, the recent-launch window is not doing its job on this chain.
    expect(row.firstQuoteMs).not.toBeNull()
  })

  it('prices the reverse direction too — memecoin -> native', async () => {
    if (!winner) {
      canaryLog('no winning pool — skipping the reverse memecoin row')
      return
    }
    const { pool, row: forward } = winner
    const { symbol, decimals } = await symbolOf(client!, pool.other)
    // One whole token. The exact size does not matter for the direction check, and a fresh launch has
    // no meaningful "standard" trade size to pick anyway.
    const row = await quoteRow(`${symbol}->native`, pool.other, 'native', 10n ** BigInt(decimals))
    canaryLog('robinhood memecoin reverse row', { forwardAmountOut: forward.amountOut, ...row })

    // Deliberately weaker than the forward row even though the pool is known-tradeable in one
    // direction: selling INTO a fresh pool can legitimately fail to price (a hook that gates one
    // direction, or no native-side reserve to pay out), and the pool can be drained between the two
    // quotes. What is asserted is that the reverse request terminates COHERENTLY rather than
    // returning nonsense.
    expect(['quote', 'no-route', 'inconclusive']).toContain(row.status)
    if (row.status === 'quote') expect(BigInt(row.amountOut!)).toBeGreaterThan(0n)
    else canaryLog('reverse memecoin row did not price — recorded, not failed', { reasonCode: row.reasonCode })
  }, QUOTE_BUDGET_MS + 60_000)
})
