import { mkdtemp, mkdir, readdir, readFile, rm, stat, utimes, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'bun:test'

import { POOL_INDEX_SCHEMA_VERSION, serializeSnapshot, v2PoolRef } from '../src/experimental/index'

import {
  cacheBaseline,
  cacheDir,
  cacheEnabled,
  cachePath,
  flushCacheSave,
  loadCache,
  pruneColdest,
  saveCache,
  scheduleCacheSave,
  SPAN_DIRTY_BLOCKS,
  summarizeCacheCoverage,
} from './cache'
import { DAI, LONGTAIL, POOL_USDC_DAI, sourceIndex, USDC, WARM_DELTA, warmIndex, WETH } from './testing'

/**
 * Every test below points `$XDG_CACHE_HOME` at a fresh temp dir, so nothing here can read, write, or
 * delete the developer's real `~/.cache/router-lite`. `cacheDir` reads `process.env` at CALL time
 * (not at import time) precisely so this is possible.
 */
let dir: string
const savedXdg = process.env.XDG_CACHE_HOME

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'rl-cache-'))
  process.env.XDG_CACHE_HOME = dir
})

afterEach(async () => {
  if (savedXdg === undefined) delete process.env.XDG_CACHE_HOME
  else process.env.XDG_CACHE_HOME = savedXdg
  await rm(dir, { recursive: true, force: true })
})

describe('cache location', () => {
  it('honors $XDG_CACHE_HOME and keys by chain id, not by endpoint', () => {
    expect(cacheDir({ XDG_CACHE_HOME: '/x' })).toBe('/x/router-lite')
    expect(cachePath(8453, { XDG_CACHE_HOME: '/x' })).toBe('/x/router-lite/8453.json')
    // Two providers serving the same chain see the same pools and the same history, so they share
    // one file — the endpoint is deliberately absent from the key.
    expect(cachePath(1, { XDG_CACHE_HOME: '/x' })).toBe(cachePath(1, { XDG_CACHE_HOME: '/x' }))
  })

  it('falls back to ~/.cache when XDG_CACHE_HOME is unset or blank', () => {
    expect(cacheDir({})).toMatch(/\/\.cache\/router-lite$/)
    expect(cacheDir({ XDG_CACHE_HOME: '   ' })).toMatch(/\/\.cache\/router-lite$/)
  })
})

describe('--cache / --no-cache', () => {
  it('is ON by default, everywhere, and --no-cache is the only thing that turns it off', () => {
    expect(cacheEnabled(new Set())).toBe(true)
    expect(cacheEnabled(new Set(['cache']))).toBe(true)
    expect(cacheEnabled(new Set(['no-cache']))).toBe(false)
    // Both spelled at once is a contradiction the user has to lose: refusing to cache is the
    // conservative reading, and it is the one that can never surprise them with stale-looking data.
    expect(cacheEnabled(new Set(['cache', 'no-cache']))).toBe(false)
  })
})

describe('save/load round trip', () => {
  it('saves a snapshot and restores an index that answers identically', async () => {
    const original = warmIndex()
    const saveNote = await saveCache(1, original)
    expect(saveNote).toMatch(/saved 1 pools/)

    const loaded = await loadCache(1, original)
    expect(loaded.index).toBeDefined()
    expect(loaded.note).toMatch(/loaded 1 pools/)
    expect(loaded.index!.pair(USDC, WETH).map((r) => r.pool.id)).toEqual(original.pair(USDC, WETH).map((r) => r.pool.id))
    // The point of the whole exercise: a warm run asks for the delta plus the reorg overlap, not the
    // eleven million blocks of history the first run paid for. The same range a list's ADOPTED
    // coverage produces in `poolList.test.ts` — one constant, so the two really are the same claim.
    expect(loaded.index!.uncovered('v2', WETH, 10_000_835n, 21_000_100n)).toEqual(WARM_DELTA)
  })

  it('writes atomically — tmp + rename, leaving no partial file behind', async () => {
    await saveCache(1, warmIndex())
    const entries = await readdir(join(dir, 'router-lite'))
    expect(entries).toEqual(['1.json']) // the pid-suffixed tmp file was renamed, not left lying around
    // A reader arriving at any instant sees either no file or a complete one — never a JSON prefix.
    expect(JSON.parse(await readFile(join(dir, 'router-lite', '1.json'), 'utf8'))).toHaveProperty('schemaVersion')
  })

  it('creates the cache directory on first save', async () => {
    expect(await saveCache(42161, warmIndex())).toMatch(/saved/)
    expect(await readdir(join(dir, 'router-lite'))).toEqual(['42161.json'])
  })
})

describe('the no-op save skip', () => {
  /** Saves, reloads, and hands back the reloaded index with its load-time baseline — the exact
   * state `context.ts` is in when it registers the exit-time save. */
  async function warmLoaded() {
    await saveCache(1, warmIndex())
    const path = join(dir, 'router-lite', '1.json')
    // Pin a known old mtime so "the file was not rewritten" is a strict, deterministic read.
    const old = new Date(Date.now() - 60 * 60 * 1000)
    await utimes(path, old, old)
    const loaded = await loadCache(1, warmIndex())
    return { index: loaded.index!, sinceLoad: cacheBaseline(loaded.index!), path, mtimeMs: (await stat(path)).mtimeMs }
  }

  it('skips the write when the run learned nothing material — quote evidence and identity merges included', async () => {
    const { index, sinceLoad, path, mtimeMs } = await warmLoaded()

    // Everything a warm quote run actually does to the index (measured live on Base):
    index.markSuccess(index.pair(USDC, WETH)[0]!.pool, 21_000_050n) // quote evidence — not material
    index.upsert({ pool: index.pair(USDC, WETH)[0]!.pool, source: 'event', createdAtBlock: 10_008_355n }) // identity merge: bumps version(), changes nothing
    index.addCoverage('v2', WETH, { fromBlock: 21_000_000n, toBlock: 21_000_000n + SPAN_DIRTY_BLOCKS - 1n }) // tip-advance within the drift bound

    const note = await saveCache(1, index, { sinceLoad })
    expect(note).toMatch(/cache: unchanged — save skipped/)
    expect((await stat(path)).mtimeMs).toBe(mtimeMs) // no write happened at all
  })

  it('a new pool saves', async () => {
    const { index, sinceLoad } = await warmLoaded()
    index.upsert({ pool: v2PoolRef(POOL_USDC_DAI, USDC, DAI), source: 'event', createdAtBlock: 11_000_000n })
    expect(await saveCache(1, index, { sinceLoad })).toMatch(/saved 2 pools/)
  })

  it('a merge that actually changed a pool saves — an earlier createdAtBlock', async () => {
    const { index, sinceLoad } = await warmLoaded()
    index.upsert({ pool: index.pair(USDC, WETH)[0]!.pool, source: 'event', createdAtBlock: 9_000_000n })
    expect(await saveCache(1, index, { sinceLoad })).toMatch(/saved 1 pools/)
  })

  it('a coverage-only change past the drift bound saves — the cold mega-scan must never be lost', async () => {
    const { index, sinceLoad } = await warmLoaded()
    index.addCoverage('v2', WETH, { fromBlock: 21_000_000n, toBlock: 21_000_000n + SPAN_DIRTY_BLOCKS + 1n })
    expect(await saveCache(1, index, { sinceLoad })).toMatch(/saved 1 pools/)
  })

  it('a new coverage scope saves regardless of its size — first knowledge of an endpoint', async () => {
    const { index, sinceLoad } = await warmLoaded()
    index.addCoverage('v3', DAI, { fromBlock: 20_999_000n, toBlock: 21_000_000n })
    expect(await saveCache(1, index, { sinceLoad })).toMatch(/saved 1 pools · 2 coverage scopes/)
  })

  it('a fee-only change saves', async () => {
    const { index, sinceLoad } = await warmLoaded()
    index.addEnabledFees('v3', WETH, [500])
    expect(await saveCache(1, index, { sinceLoad })).toMatch(/saved 1 pools/)
  })

  it('a cold run that learned nothing writes no file at all', async () => {
    const fresh = warmIndex()
    const note = await saveCache(7777, fresh, { sinceLoad: cacheBaseline(fresh) })
    expect(note).toMatch(/save skipped/)
    expect((await readdir(join(dir, 'router-lite')).catch(() => []))).toEqual([])
  })

  it('without a baseline the save is unconditional — the pre-existing contract', async () => {
    expect(await saveCache(1, warmIndex())).toMatch(/saved 1 pools/)
  })
})

describe('starting fresh', () => {
  it('reports a cold start when there is no file at all', async () => {
    const loaded = await loadCache(999, warmIndex())
    expect(loaded.index).toBeUndefined()
    expect(loaded.note).toMatch(/none at .*999\.json.*cold start/)
  })

  it('discards a corrupt file rather than failing the command', async () => {
    await mkdir(join(dir, 'router-lite'), { recursive: true })
    await writeFile(join(dir, 'router-lite', '1.json'), '{"schemaVersion":' + POOL_INDEX_SCHEMA_VERSION + ',"pools":[', 'utf8')

    const loaded = await loadCache(1, warmIndex())
    expect(loaded.index).toBeUndefined()
    expect(loaded.note).toMatch(/discarded .*starting fresh/)
  })

  it('discards a snapshot written by a different schemaVersion', async () => {
    const snap = warmIndex().toSnapshot()
    await mkdir(join(dir, 'router-lite'), { recursive: true })
    await writeFile(join(dir, 'router-lite', '1.json'), serializeSnapshot({ ...snap, schemaVersion: 99 }), 'utf8')

    const loaded = await loadCache(1, warmIndex())
    expect(loaded.index).toBeUndefined()
    expect(loaded.note).toMatch(/discarded .*schemaVersion 99/)
  })

  it('discards a snapshot built for a different wrappedNative', async () => {
    await saveCache(1, warmIndex())
    // Same chain id on disk, but this run resolved a different wrapped-native — a manifest change, or
    // a chain id collision between a real chain and a local fork. Collapsing the native family onto
    // the wrong graph node is not "stale", it is wrong, so the file is not used.
    const loaded = await loadCache(1, { wrappedNative: USDC, reorgOverlapBlocks: 32n })
    expect(loaded.index).toBeUndefined()
    expect(loaded.note).toMatch(/different wrappedNative/)
  })

  it('discards a snapshot maintained under a different reorg overlap', async () => {
    await saveCache(1, warmIndex()) // built with the 32-block default
    const loaded = await loadCache(1, { wrappedNative: WETH, reorgOverlapBlocks: 200n })
    expect(loaded.index).toBeUndefined()
    expect(loaded.note).toMatch(/different reorg overlap/)
  })
})

describe('bounds and failure containment', () => {
  // The bound used to SKIP the save entirely — meaning the day a chain's index outgrew it, its
  // cache silently stopped learning forever (Base was measured at 974,723 of the 1,000,000 bound).
  // It now prunes the SNAPSHOT to 90% of the bound and writes. `maxPools` here is the documented
  // test seam: materializing a million real pools would dwarf the code under test.
  it('past the bound: prunes to 90%, keeps the most-recently-touched pools, and says so', async () => {
    const index = sourceIndex() // 4 pools, createdAtBlock 10.0M / 11.0M / 12.4M / 15.0M
    const note = await saveCache(1, index, { maxPools: 3 }) // target: floor(3 * 0.9) = 2

    expect(note).toMatch(/saved 2 pools/)
    expect(note).toMatch(/pruned 2 coldest pools/)
    // The prune touched only what was WRITTEN — the live index keeps everything it had.
    expect(index.stats().pools).toBe(4)

    const reloaded = await loadCache(1, index)
    expect(reloaded.index!.stats().pools).toBe(2)
    // Touch order is the snapshot's own LRU reconstruction (createdAtBlock here): the two newest
    // survive, the two coldest are gone.
    expect(reloaded.index!.pair(LONGTAIL, WETH)).toHaveLength(1) // created 15.0M — hottest
    expect(reloaded.index!.pair(DAI, WETH)).toHaveLength(1) // created 12.4M
    expect(reloaded.index!.pair(USDC, DAI)).toHaveLength(0) // created 11.0M — pruned
    expect(reloaded.index!.pair(USDC, WETH)).toHaveLength(0) // created 10.0M — pruned
  })

  it('under the bound: untouched, no prune note', async () => {
    const note = await saveCache(1, sourceIndex(), { maxPools: 4 })
    expect(note).toMatch(/saved 4 pools/)
    expect(note).not.toMatch(/pruned/)
  })

  it('pruneColdest: never-touched records sort coldest, and a within-bound array is returned as-is', () => {
    const hot = { pool: v2PoolRef(USDC, USDC, WETH), source: 'event' as const, createdAtBlock: 100n }
    const warm = { pool: v2PoolRef(DAI, DAI, WETH), source: 'event' as const, lastQuoteSuccessBlock: 50n }
    const never = { pool: v2PoolRef(LONGTAIL, LONGTAIL, WETH), source: 'hint' as const } // no blocks at all
    const pools = [never, hot, warm]

    expect(pruneColdest(pools, 3)).toBe(pools) // within bound: the same array, not a copy
    expect(pruneColdest(pools, 2)).toEqual([hot, warm]) // the -1n sentinel goes first
    expect(pruneColdest(pools, 1)).toEqual([hot])
  })

  it('never throws when the cache location is unwritable — the answer was already computed', async () => {
    // A file where the directory should be: `mkdir` fails, and so would every write under it.
    await writeFile(join(dir, 'router-lite'), 'not a directory', 'utf8')
    const note = await saveCache(1, warmIndex())
    expect(note).toMatch(/not saved \(/)
  })
})

describe('the exit-time flush', () => {
  it('runs exactly the registered save, once, and clears it', async () => {
    let calls = 0
    scheduleCacheSave(async () => {
      calls++
    })
    await flushCacheSave()
    await flushCacheSave() // a second flush has nothing left to do
    expect(calls).toBe(1)
  })

  it('is a no-op when nothing registered — `rl chains` never builds an index', async () => {
    await flushCacheSave()
    expect(await readdir(dir)).toEqual([])
  })

  it('swallows a throwing save so the command keeps the exit code it earned', async () => {
    scheduleCacheSave(async () => {
      throw new Error('disk on fire')
    })
    await flushCacheSave() // must not reject
  })
})

describe('a corrupt cache file is never a crash (F1)', () => {
  const PA = '0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'
  const PB = '0xBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB'

  /** A schema-`v` snapshot whose only content is one pool record wrapping the literal `poolJson`. */
  function poolBody(v: number, poolJson: string): string {
    return (
      '{"schemaVersion":' + v + ',"wrappedNative":"0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",' +
      '"reorgOverlapBlocks":"$bigint:32","pools":[{"pool":' + poolJson + ',"source":"event"}],' +
      '"coverage":[],"enabledFees":[]}'
    )
  }

  /** A ref that claims `protocol: 'v4'` — id, currencies and poolId all present — and omits `poolKey`. */
  function v4NoPoolKeyBody(v: number): string {
    return poolBody(
      v,
      '{"id":"v4:0x' + 'cd'.repeat(32) + '","currencies":["' + PA + '","' + PB + '"],' +
        '"protocol":"v4","poolId":"0x' + 'cd'.repeat(32) + '"}',
    )
  }

  /** Writes `body` verbatim as chain 1's cache file. */
  async function poison(body: string): Promise<void> {
    await mkdir(join(dir, 'router-lite'), { recursive: true })
    await writeFile(join(dir, 'router-lite', '1.json'), body, 'utf8')
  }

  // Each of these used to escape `loadCache` as an uncaught throw — `expected.wrappedNative` is
  // compared with `.toLowerCase()` against a value that CAME FROM THE FILE, and that call sat outside
  // the try. The result was a raw TypeError travelling up through `buildChainContext` into `rl.ts`'s
  // catch-all: an exit-4 stack trace for a file the user never asked about, in flat contradiction of
  // the header's "every failure resolves to start fresh" invariant.
  // `V` rather than a literal `1`: these payloads exercise the SHAPE checks, so they must keep
  // reaching them as the schema version moves. Hard-coded, they start failing the version check
  // first and silently stop testing anything they were written for.
  const V = POOL_INDEX_SCHEMA_VERSION
  const payloads: [string, string][] = [
    ['wrappedNative is a number', '{"schemaVersion":' + V + ',"wrappedNative":1,"reorgOverlapBlocks":"$bigint:32","pools":[],"coverage":[],"enabledFees":[]}'],
    ['wrappedNative is missing', '{"schemaVersion":' + V + ',"reorgOverlapBlocks":"$bigint:32","pools":[],"coverage":[],"enabledFees":[]}'],
    ['wrappedNative is null', '{"schemaVersion":' + V + ',"wrappedNative":null,"reorgOverlapBlocks":"$bigint:32","pools":[],"coverage":[],"enabledFees":[]}'],
    ['the whole file is a JSON scalar', '42'],
    ['the whole file is JSON null', 'null'],
    ['the file is empty', ''],
    ['a coverage bound is poisoned', '{"schemaVersion":' + V + ',"wrappedNative":"0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2","reorgOverlapBlocks":"$bigint:32","pools":[],"coverage":[["v3:x",[{"fromBlock":"abc","toBlock":"$bigint:9"}]]],"enabledFees":[]}'],
    // A pool that CLAIMS v4 and carries no `poolKey`: the discriminant's version of the poisoned
    // coverage bound above. It parses, it restores, and it then throws a bare TypeError out of
    // `isHooked` the first time candidate ranking touches it — mid-search, long past this function's
    // try, which is the whole reason the shape check is the SDK's job and not the CLI's.
    ['a pool claims v4 but carries no poolKey', v4NoPoolKeyBody(V)],
    ['a pool carries a protocol nothing implements', poolBody(V, '{"id":"v9:0x1","currencies":["' + PA + '","' + PB + '"],"protocol":"v9","address":"' + PA + '"}')],
    ['a v2 pool has no address', poolBody(V, '{"id":"v2:0x1","currencies":["' + PA + '","' + PB + '"],"protocol":"v2","token0":"' + PA + '","token1":"' + PB + '"}')],
  ]

  for (const [what, body] of payloads) {
    it(`starts fresh when ${what}`, async () => {
      await poison(body)
      const loaded = await loadCache(1, warmIndex()) // must RESOLVE, never reject
      expect(loaded.index).toBeUndefined()
      expect(loaded.note).toMatch(/discarded|cold start/)
    })
  }

  it('a poisoned coverage bound is caught at load, not on the next search', async () => {
    // The one that motivated the shape check: this parses, and without it `fromSnapshot` returned a
    // perfectly ordinary-looking index that threw inside `uncovered` mid-search.
    await poison(payloads.find(([w]) => w === 'a coverage bound is poisoned')![1])
    const loaded = await loadCache(1, warmIndex())
    expect(loaded.index).toBeUndefined()
    expect(loaded.note).toMatch(/malformed/)
  })

  it('a pool ref lying about its protocol is caught at load, not on the next search', async () => {
    // The sibling of the above for the PoolRef discriminant. Without the shape gate this file
    // restores into a working index and the crash lands in `comparePoolPriority`/`compile.ts`, where
    // nothing knows a cache exists — so the note here has to say `malformed` (the gate fired), not
    // merely `cold start`.
    await poison(v4NoPoolKeyBody(POOL_INDEX_SCHEMA_VERSION))
    const loaded = await loadCache(1, warmIndex())
    expect(loaded.index).toBeUndefined()
    expect(loaded.note).toMatch(/malformed/)
    expect(loaded.note).toMatch(/discard it and start fresh/)
  })
})

describe('summarizeCacheCoverage — the pre-search cache-line math', () => {
  it('omits a protocol entirely when the manifest carries no bundle for it — "disabled", not "0%"', () => {
    const summary = summarizeCacheCoverage([], { v2: 1_000n, v3: undefined, v4: 2_000n })
    expect(summary.v3).toBeUndefined()
  })

  it('reports 0% (never "disabled") for a present protocol with nothing scanned yet — a cold cache', () => {
    const summary = summarizeCacheCoverage([], { v2: 1_000n, v3: undefined, v4: undefined })
    expect(summary.v2).toEqual({ pct: 0, complete: false })
  })

  it('uses the highest covered block ANYWHERE in the snapshot as the head proxy, per protocol', () => {
    const coverage: [string, { fromBlock: bigint; toBlock: bigint }[]][] = [
      ['v2:0xaaa', [{ fromBlock: 1_000n, toBlock: 1_999n }]], // fully covers v2's [1000, 1999] span
      ['v3:0xbbb', [{ fromBlock: 1_000n, toBlock: 1_499n }]], // covers only half of v3's own span
    ]
    const summary = summarizeCacheCoverage(coverage, { v2: 1_000n, v3: 1_000n, v4: undefined })
    expect(summary.v2).toEqual({ pct: 1, complete: true })
    expect(summary.v3!.pct).toBeCloseTo(0.5, 1)
    expect(summary.v3!.complete).toBe(false)
  })

  it('never double-counts overlapping ranges from two different coverage-scope keys sharing a protocol', () => {
    const coverage: [string, { fromBlock: bigint; toBlock: bigint }[]][] = [
      ['v2:0xaaa', [{ fromBlock: 1_000n, toBlock: 1_999n }]],
      ['v2:pair:0xaaa-0xbbb', [{ fromBlock: 1_500n, toBlock: 1_999n }]], // fully overlaps the tail above
    ]
    const summary = summarizeCacheCoverage(coverage, { v2: 1_000n, v3: undefined, v4: undefined })
    // Naive summing would read 1,000 + 500 = 1,500 covered out of a 1,000-block span — over 100%.
    expect(summary.v2).toEqual({ pct: 1, complete: true })
  })

  it('treats a protocol whose demand floor sits past the head proxy as legitimately 0%, not NaN/negative', () => {
    const coverage: [string, { fromBlock: bigint; toBlock: bigint }[]][] = [['v2:0xaaa', [{ fromBlock: 1_000n, toBlock: 1_999n }]]]
    const summary = summarizeCacheCoverage(coverage, { v2: undefined, v3: 5_000n, v4: undefined })
    expect(summary.v3).toEqual({ pct: 0, complete: false })
  })
})

describe('orphaned tmp files (F5)', () => {
  it('removes its own tmp when the write fails', async () => {
    // A directory where the final file should be: `writeFile` succeeds, `rename` cannot clobber it.
    await mkdir(join(dir, 'router-lite', '1.json'), { recursive: true })
    const note = await saveCache(1, warmIndex())
    expect(note).toMatch(/not saved \(/)
    expect((await readdir(join(dir, 'router-lite'))).filter((f) => f.endsWith('.tmp'))).toEqual([])
  })

  it('sweeps a stale tmp left by a killed run, and leaves a fresh one alone', async () => {
    // These are FULL-SIZE snapshots — hundreds of megabytes each — so a few Ctrl-C'd runs could
    // quietly fill the cache directory with files nothing ever reads or replaces.
    await mkdir(join(dir, 'router-lite'), { recursive: true })
    const stale = join(dir, 'router-lite', '1.json.99999.tmp')
    const fresh = join(dir, 'router-lite', '1.json.88888.tmp')
    await writeFile(stale, 'orphan', 'utf8')
    await writeFile(fresh, 'in progress', 'utf8')
    const old = new Date(Date.now() - 2 * 60 * 60 * 1000)
    await utimes(stale, old, old)

    await loadCache(1, warmIndex()) // the sweep rides along with the load

    const left = (await readdir(join(dir, 'router-lite'))).filter((f) => f.endsWith('.tmp'))
    expect(left).toEqual(['1.json.88888.tmp']) // a concurrent writer's in-progress file is never touched
  })
})
