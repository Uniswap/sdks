import { expect, test } from 'bun:test'
import type { Address } from 'viem'
import { zeroHash } from 'viem'

import { PoolIndex } from '../pools/poolIndex'
import type { ProtocolModule } from '../protocols/types'
import type { BlockRef, ChainManifest, Protocol, SwapRequest } from '../types'

import { buildReport, discoveryStatus } from './report'
import { initialState } from './waves'
import type { Run, SearchContext } from './waves'

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
// rather than through a full multi-wave `searchWaves` scenario.
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

function makeRun(): Run {
  const modules = { v2: enabledModule('v2'), v3: enabledModule('v3'), v4: enabledModule('v4') }
  const ctx: SearchContext = {
    client: {
      request: async () => {
        throw new Error('discoveryStatus must never issue RPC')
      },
    },
    manifest: manifest(),
    modules,
    index: new PoolIndex(WETH), // discoveryStatus never touches the index; a real one is cheapest to build
    hookData: new Map(),
  }
  const state = initialState(BLOCK, false)
  const req: SwapRequest = { tokenIn: TOKEN_A, tokenOut: TOKEN_B, amountIn: 1n, trader: TRADER }
  return { ctx, state, kind: 'swap', req }
}

test('discoveryStatus: both endpoints complete -> complete', () => {
  const run = makeRun()
  run.state.discovery.v2.complete.add(TOKEN_A.toLowerCase())
  run.state.discovery.v2.complete.add(TOKEN_B.toLowerCase())

  expect(discoveryStatus(run, 'v2', [TOKEN_A, TOKEN_B])).toBe('complete')
})

test('discoveryStatus: neither endpoint complete -> partial', () => {
  const run = makeRun()

  expect(discoveryStatus(run, 'v2', [TOKEN_A, TOKEN_B])).toBe('partial')
})

// THE MUTATION-KILLING CASE (M15): exactly ONE of the two endpoints' adjacency is complete. The
// real `every` demands both; a search that never looked at the other endpoint must never be
// reported `complete` — an `every` -> `some` mutant would return `complete` here instead.
test('discoveryStatus: only ONE endpoint complete -> partial, never complete (M15)', () => {
  const inOnly = makeRun()
  inOnly.state.discovery.v2.complete.add(TOKEN_A.toLowerCase())
  expect(discoveryStatus(inOnly, 'v2', [TOKEN_A, TOKEN_B])).toBe('partial')

  const outOnly = makeRun()
  outOnly.state.discovery.v2.complete.add(TOKEN_B.toLowerCase())
  expect(discoveryStatus(outOnly, 'v2', [TOKEN_A, TOKEN_B])).toBe('partial')
})

test('discoveryStatus: a failed scan reports failed regardless of endpoint completeness', () => {
  const run = makeRun()
  run.state.discovery.v2.complete.add(TOKEN_A.toLowerCase())
  run.state.discovery.v2.complete.add(TOKEN_B.toLowerCase())
  run.state.discovery.v2.failed = true

  expect(discoveryStatus(run, 'v2', [TOKEN_A, TOKEN_B])).toBe('failed')
})

test('discoveryStatus: a disabled protocol reports disabled before looking at discovery state at all', () => {
  const run = makeRun()
  run.ctx.modules.v3 = { ...enabledModule('v3'), enabled: () => false }

  expect(discoveryStatus(run, 'v3', [TOKEN_A, TOKEN_B])).toBe('disabled')
})

// ---------------------------------------------------------------------------
// `buildReport`'s `coveredRanges`/`demandFloor`: cumulative index knowledge at
// search end, not this run's own scan traffic.
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
function makeRunWithIndex(): Run {
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
  // everything, and this run's discovery state is populated exactly as `scanAdjacency` would leave
  // it for two endpoints whose adjacency needed no scanning at all (empty `uncovered` trivially
  // satisfies "nothing left to cover").
  run.ctx.index.addCoverage('v2', TOKEN_A, { fromBlock: 0n, toBlock: head })
  run.ctx.index.addCoverage('v2', TOKEN_B, { fromBlock: 0n, toBlock: head })
  run.state.discovery.v2.complete.add(TOKEN_A)
  run.state.discovery.v2.complete.add(TOKEN_B)

  const report = buildReport(run)

  expect(report.discovery.v2.status).toBe('complete')
  expect(report.discovery.v2.coveredRanges).toEqual([{ fromBlock: 0n, toBlock: head }])
  expect(report.discovery.v2.demandFloor).toBe(0n)
})

test('buildReport: a fully-cached endpoint is not dropped just because the OTHER endpoint still needs scanning', () => {
  // The degenerate case this bug produced: one endpoint (TOKEN_A) is fully known from an earlier
  // search and needed no scan this run at all; TOKEN_B has never been touched. Overall status is
  // correctly `partial` (discoveryStatus judges both endpoints by name), but the report must not
  // discard TOKEN_A's entire known history just because no scan *walked* it this run — the old
  // per-run `.covered` bookkeeping only recorded ranges a scan actually returned, so a scope that
  // needed zero scanning reported zero coverage even though the index knew it end-to-end.
  const run = makeRunWithIndex()
  const head = run.state.block.number

  run.ctx.index.addCoverage('v2', TOKEN_A, { fromBlock: 0n, toBlock: head })
  run.state.discovery.v2.complete.add(TOKEN_A)
  // TOKEN_B: no coverage, never marked complete.

  const report = buildReport(run)

  expect(report.discovery.v2.status).toBe('partial')
  expect(report.discovery.v2.coveredRanges).toEqual([{ fromBlock: 0n, toBlock: head }])
})

test('buildReport: covered fraction is monotone across two searches sharing the same index', () => {
  const run = makeRunWithIndex()
  const head = run.state.block.number

  // First search: only the recent tail is known.
  run.ctx.index.addCoverage('v2', TOKEN_A, { fromBlock: 800n, toBlock: head })
  run.ctx.index.addCoverage('v2', TOKEN_B, { fromBlock: 800n, toBlock: head })
  const first = buildReport(run)

  // Second search over the SAME index, now with the rest of the history scanned in — nothing this
  // run needs to have done itself for the report to reflect it.
  run.ctx.index.addCoverage('v2', TOKEN_A, { fromBlock: 0n, toBlock: 799n })
  run.ctx.index.addCoverage('v2', TOKEN_B, { fromBlock: 0n, toBlock: 799n })
  const second = buildReport(run)

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

  const report = buildReport(run)

  expect(report.discovery.v2.coveredRanges).toEqual([{ fromBlock: 500n, toBlock: head }])
  // The floor used for any percentage/denominator is the manifest's deployment block (0n), never the
  // earliest covered range's `fromBlock` (500n).
  expect(report.discovery.v2.demandFloor).toBe(0n)
})
