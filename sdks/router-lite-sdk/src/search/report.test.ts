import { expect, test } from 'bun:test'
import type { Address } from 'viem'
import { zeroHash } from 'viem'

import { PoolIndex } from '../pools/poolIndex'
import type { ProtocolModule } from '../protocols/types'
import type { BlockRef, ChainManifest, Protocol, SwapRequest } from '../types'

import { buildReport, discoveryStatus } from './report'
import type { ReportCtx } from './report'
import { createState } from './state'
import type { SearchState } from './state'

// ---------------------------------------------------------------------------
// C4-T1 mutation-audit kill: M15.
//
// `discoveryStatus` judges completeness against THIS TRADE'S TWO ENDPOINTS BY
// NAME (see the function's own docstring) — a count of scanned endpoints
// would let any two scans satisfy it while one endpoint's adjacency was never
// touched, reporting `complete` for a search that never looked. That is
// exactly what an `every` -> `some` mutation over the two endpoint nodes does:
// only ONE endpoint needs to be complete for the mutant to skip the `partial`
// branch. Confirmed surviving the pre-existing suite (audit + local
// reproduction: `bun test` with `every` mutated to `some` in `report.ts`
// still passes green), so this test pins the two-endpoint check directly
// rather than through a full engine scenario.
// ---------------------------------------------------------------------------

const WETH = `0x${'ee'.repeat(20)}` as Address
const TOKEN_A = `0x${'aa'.repeat(20)}` as Address
const TOKEN_B = `0x${'bb'.repeat(20)}` as Address
const TRADER = `0x${'11'.repeat(20)}` as Address

const BLOCK: BlockRef = { number: 1_000n, hash: zeroHash, timestamp: 1_700_000_000n }

function manifest(): ChainManifest {
  return { chainId: 1, wrappedNative: WETH, v2: { factory: `0x${'44'.repeat(20)}` as Address, deploymentBlock: 0n } }
}

/** A minimal enabled-only module: `discoveryStatus` reads nothing else off `ProtocolModule`. */
function enabledModule(id: Protocol): ProtocolModule {
  return {
    id,
    enabled: () => true,
    speculativeDirect: () => [],
    hypotheses: () => [],
    adjacencyShape: () => undefined,
    parsePoolLog: () => null,
    validateHint: async () => null,
    encodeQuote: () => {
      throw new Error('not used by discoveryStatus')
    },
    compileOperation: () => {
      throw new Error('not used by discoveryStatus')
    },
  }
}

/** The three things the report fold reads. `buildReport` takes them separately (`state, ctx, req`);
 * these tests carry them as one bag so each scenario can reach in and seed one of them. */
type Fold = { ctx: ReportCtx; state: SearchState; req: SwapRequest }

function makeRun(): Fold {
  const modules = { v2: enabledModule('v2'), v3: enabledModule('v3'), v4: enabledModule('v4') }
  const ctx: ReportCtx = {
    manifest: manifest(),
    modules,
    index: new PoolIndex(WETH), // discoveryStatus never touches the index; a real one is cheapest to build
  }
  const state = createState(BLOCK, false)
  const req: SwapRequest = { tokenIn: TOKEN_A, tokenOut: TOKEN_B, amountIn: 1n, trader: TRADER }
  return { ctx, state, req }
}

test('discoveryStatus: both endpoints complete -> complete', () => {
  const run = makeRun()
  run.state.discovery.v2.complete.add(TOKEN_A.toLowerCase())
  run.state.discovery.v2.complete.add(TOKEN_B.toLowerCase())

  expect(discoveryStatus(run.ctx, run.state, 'v2', [TOKEN_A, TOKEN_B])).toBe('complete')
})

test('discoveryStatus: neither endpoint complete -> partial', () => {
  const run = makeRun()

  expect(discoveryStatus(run.ctx, run.state, 'v2', [TOKEN_A, TOKEN_B])).toBe('partial')
})

// THE MUTATION-KILLING CASE (M15): exactly ONE of the two endpoints' adjacency is complete. The
// real `every` demands both; a search that never looked at the other endpoint must never be
// reported `complete` — an `every` -> `some` mutant would return `complete` here instead.
test('discoveryStatus: only ONE endpoint complete -> partial, never complete (M15)', () => {
  const inOnly = makeRun()
  inOnly.state.discovery.v2.complete.add(TOKEN_A.toLowerCase())
  expect(discoveryStatus(inOnly.ctx, inOnly.state, 'v2', [TOKEN_A, TOKEN_B])).toBe('partial')

  const outOnly = makeRun()
  outOnly.state.discovery.v2.complete.add(TOKEN_B.toLowerCase())
  expect(discoveryStatus(outOnly.ctx, outOnly.state, 'v2', [TOKEN_A, TOKEN_B])).toBe('partial')
})

test('discoveryStatus: a failed scan reports failed regardless of endpoint completeness', () => {
  const run = makeRun()
  run.state.discovery.v2.complete.add(TOKEN_A.toLowerCase())
  run.state.discovery.v2.complete.add(TOKEN_B.toLowerCase())
  run.state.discovery.v2.failed = true

  expect(discoveryStatus(run.ctx, run.state, 'v2', [TOKEN_A, TOKEN_B])).toBe('failed')
})

test('discoveryStatus: a disabled protocol reports disabled before looking at discovery state at all', () => {
  const run = makeRun()
  run.ctx.modules.v3 = { ...enabledModule('v3'), enabled: () => false }

  expect(discoveryStatus(run.ctx, run.state, 'v3', [TOKEN_A, TOKEN_B])).toBe('disabled')
})

// ---------------------------------------------------------------------------
// `buildReport`'s `coveredRanges`/`demandFloor`: cumulative index knowledge at
// search end, not this run's own scan traffic — INTERSECTED across the trade's
// endpoints, matching `discoveryStatus`'s own AND (both endpoints must be
// known before a protocol counts as `complete`), never unioned.
//
// `reorgOverlapBlocks: 0n` on every index built below is deliberate: `uncovered`
// always re-opens the tip's last `reorgOverlapBlocks` regardless of how
// complete the cache is (shallow-reorg tolerance — see `poolIndex.ts`), which
// is real, correct, and unrelated to what these tests pin. Leaving the default
// in would make every "fully covered" range below fall a few blocks short of
// `head` for a reason that has nothing to do with report honesty; that
// interaction is `poolIndex.test.ts`/`discovery.test.ts`'s to cover.
// ---------------------------------------------------------------------------

/** `makeRun()`, but with the index swapped for one with no reorg-tail reopening, so a seeded
 * `[0, head]` coverage reads back as exactly `[0, head]`. */
function makeRunWithIndex(): Fold {
  const run = makeRun()
  run.ctx.index = new PoolIndex(WETH, { reorgOverlapBlocks: 0n })
  return run
}

function totalBlocks(ranges: { fromBlock: bigint; toBlock: bigint }[]): bigint {
  return ranges.reduce((sum, r) => sum + (r.toBlock - r.fromBlock + 1n), 0n)
}

test('buildReport: a warm-cache search that scans nothing new still reports the seeded coverage', () => {
  const run = makeRunWithIndex()
  const head = run.state.block.number

  // No scan runs in this test at all — the index is seeded as if an EARLIER search already found
  // everything, and this run's discovery state is populated exactly as the coverage worker would
  // leave it for two endpoints whose adjacency needed no scanning at all (empty `uncovered`
  // trivially satisfies "nothing left to cover").
  run.ctx.index.addCoverage('v2', TOKEN_A, { fromBlock: 0n, toBlock: head })
  run.ctx.index.addCoverage('v2', TOKEN_B, { fromBlock: 0n, toBlock: head })
  run.state.discovery.v2.complete.add(TOKEN_A)
  run.state.discovery.v2.complete.add(TOKEN_B)

  const report = buildReport(run.state, run.ctx, run.req)

  expect(report.discovery.v2.status).toBe('complete')
  expect(report.discovery.v2.coveredRanges).toEqual([{ fromBlock: 0n, toBlock: head }])
  expect(report.discovery.v2.demandFloor).toBe(0n)
})

test('buildReport: coverage is AND across endpoints, matching discoveryStatus — a fully-cached endpoint alone reports zero while the other is untouched', () => {
  // `coveredRanges` must intersect the two endpoints' coverage, never union it. `discoveryStatus`
  // (this file, above) calls a protocol `complete` only once BOTH endpoints are fully known
  // (`endpointNodes.every(...)`) — a route needs every pool touching either endpoint, not just one —
  // so a coverage bar built from the union would show a near-full bar under a `partial` label
  // whenever one endpoint happens to be fully cached and the other has never been touched at all,
  // indefinitely, until the untouched endpoint is finally scanned. TOKEN_A is fully known here;
  // TOKEN_B has no coverage in the index at all, so the intersection — and the honest answer to "how
  // much does the router know for THIS pair" — is nothing.
  const run = makeRunWithIndex()
  const head = run.state.block.number

  run.ctx.index.addCoverage('v2', TOKEN_A, { fromBlock: 0n, toBlock: head })
  run.state.discovery.v2.complete.add(TOKEN_A)
  // TOKEN_B: no coverage, never marked complete.

  const report = buildReport(run.state, run.ctx, run.req)

  expect(report.discovery.v2.status).toBe('partial')
  expect(report.discovery.v2.coveredRanges).toEqual([])
})

test('buildReport: partially overlapping endpoint coverage reports exactly the overlap', () => {
  const run = makeRunWithIndex()
  const head = run.state.block.number

  // TOKEN_A's adjacency is known for [0, 700]; TOKEN_B's for [400, head]. Only [400, 700] is known
  // for BOTH endpoints, which is the intersection this scenario pins.
  run.ctx.index.addCoverage('v2', TOKEN_A, { fromBlock: 0n, toBlock: 700n })
  run.ctx.index.addCoverage('v2', TOKEN_B, { fromBlock: 400n, toBlock: head })

  const report = buildReport(run.state, run.ctx, run.req)

  expect(report.discovery.v2.coveredRanges).toEqual([{ fromBlock: 400n, toBlock: 700n }])
})

test('buildReport: two trade endpoints that collapse onto one graph node still report that single scope — intersection over one scope is a no-op', () => {
  // native+wrapped (or any trade whose two currencies share a node once `node()` folds native onto
  // wrapped) leaves `coveredRangesFor` with exactly ONE endpoint after de-duplication. `intersectAll`
  // over a single-element input must return that element unchanged, not collapse to `[]` — the
  // degenerate case the AND semantics could plausibly get wrong if it intersected the single scope
  // against an implicit empty second operand instead of just not having one.
  const run = makeRunWithIndex()
  run.req.tokenOut = TOKEN_A // same node as tokenIn — only one endpoint scope is ever demanded
  const head = run.state.block.number

  run.ctx.index.addCoverage('v2', TOKEN_A, { fromBlock: 0n, toBlock: head })

  const report = buildReport(run.state, run.ctx, run.req)

  expect(report.discovery.v2.coveredRanges).toEqual([{ fromBlock: 0n, toBlock: head }])
})

test('buildReport: covered fraction is monotone across two searches sharing the same index', () => {
  const run = makeRunWithIndex()
  const head = run.state.block.number

  // First search: only the recent tail is known.
  run.ctx.index.addCoverage('v2', TOKEN_A, { fromBlock: 800n, toBlock: head })
  run.ctx.index.addCoverage('v2', TOKEN_B, { fromBlock: 800n, toBlock: head })
  const first = buildReport(run.state, run.ctx, run.req)

  // Second search over the SAME index, now with the rest of the history scanned in — nothing this
  // run needs to have done itself for the report to reflect it.
  run.ctx.index.addCoverage('v2', TOKEN_A, { fromBlock: 0n, toBlock: 799n })
  run.ctx.index.addCoverage('v2', TOKEN_B, { fromBlock: 0n, toBlock: 799n })
  const second = buildReport(run.state, run.ctx, run.req)

  // Floor stability: the same protocol's demanded floor never moves between these two searches,
  // regardless of which sub-ranges either one happened to scan.
  expect(second.discovery.v2.demandFloor).toBe(first.discovery.v2.demandFloor)
  expect(totalBlocks(second.discovery.v2.coveredRanges)).toBeGreaterThanOrEqual(totalBlocks(first.discovery.v2.coveredRanges))
})

test('buildReport: the demand floor is the deployment floor, not min(coveredRanges) — stable regardless of which sub-range was scanned', () => {
  const run = makeRunWithIndex()
  const head = run.state.block.number

  // Coverage starts well AFTER the deployment floor (block 0) — a partial scan that has not yet
  // reached the earliest history.
  run.ctx.index.addCoverage('v2', TOKEN_A, { fromBlock: 500n, toBlock: head })
  run.ctx.index.addCoverage('v2', TOKEN_B, { fromBlock: 500n, toBlock: head })

  const report = buildReport(run.state, run.ctx, run.req)

  expect(report.discovery.v2.coveredRanges).toEqual([{ fromBlock: 500n, toBlock: head }])
  // The floor used for any percentage/denominator is the manifest's deployment block (0n), never the
  // earliest covered range's `fromBlock` (500n).
  expect(report.discovery.v2.demandFloor).toBe(0n)
})

// ---------------------------------------------------------------------------
// `enumeration`: the frontier ratio and the exhaustiveness verdict it drives.
//
// Ported from the deleted `waves.test.ts` (`intermediatesPruned (C4-P7)`),
// which drove it through a whole wave engine over MAX_INTERMEDIATES + 1 core
// intermediates. The count is no longer re-derived from the index at report
// time — the frontier writes both halves — so the fold is where the claim now
// lives, and all three numbers still have to reconcile from one sample.
// ---------------------------------------------------------------------------

/** Everything except the frontier looking exhaustive, so `exhaustiveWithinMaxHops` is decided by the
 * frontier alone rather than by whichever other axis happened to be unset. */
function completeDiscovery(run: Fold): void {
  for (const protocol of ['v2', 'v3', 'v4'] as Protocol[]) {
    run.state.discovery[protocol].complete.add(TOKEN_A.toLowerCase())
    run.state.discovery[protocol].complete.add(TOKEN_B.toLowerCase())
  }
}

test('buildReport: enumeration reconciles — discovered = selected + pruned, from one sample of the frontier', () => {
  const run = makeRunWithIndex()
  completeDiscovery(run)
  // One more eligible intermediate than the frontier has selected: exactly one is
  // eligible-but-unreached, and the report must say so by name and not only by folding it into the
  // boolean below.
  run.state.intermediates.discovered = 9
  run.state.intermediates.selected = Array.from({ length: 8 }, (_, i) => `0x${(0xc0 + i).toString(16)}`)

  const report = buildReport(run.state, run.ctx, run.req)

  expect(report.enumeration.intermediatesDiscovered).toBe(9)
  expect(report.enumeration.intermediatesSelected).toBe(8)
  expect(report.enumeration.intermediatesPruned).toBe(1)
  expect(report.enumeration.intermediatesDiscovered).toBe(
    report.enumeration.intermediatesSelected + report.enumeration.intermediatesPruned,
  )
  // The pre-existing verdict this count already drove — kept in sync, not duplicated logic.
  expect(report.enumeration.exhaustiveWithinMaxHops).toBe(false)
})

test('buildReport: a frontier that reached everything eligible IS exhaustive', () => {
  const run = makeRunWithIndex()
  completeDiscovery(run)
  run.state.intermediates.discovered = 3
  run.state.intermediates.selected = ['0xc0', '0xc1', '0xc2']

  const report = buildReport(run.state, run.ctx, run.req)

  expect(report.enumeration.intermediatesPruned).toBe(0)
  expect(report.enumeration.exhaustiveWithinMaxHops).toBe(true)
})

test('buildReport: a frontier ahead of `discovered` never reports a NEGATIVE prune', () => {
  // The frontier selects from one walk and `discovered` is refreshed by the next, so a shrinking
  // index (a concurrent search evicting pools under `maxPools`) can leave `selected` momentarily
  // larger. A raw subtraction would print `-2 pruned` and, worse, fail the `=== 0` exhaustiveness
  // check for a search that reached strictly more than it discovered.
  const run = makeRunWithIndex()
  completeDiscovery(run)
  run.state.intermediates.discovered = 1
  run.state.intermediates.selected = ['0xc0', '0xc1', '0xc2']

  const report = buildReport(run.state, run.ctx, run.req)

  expect(report.enumeration.intermediatesPruned).toBe(0)
  expect(report.enumeration.exhaustiveWithinMaxHops).toBe(true)
})
