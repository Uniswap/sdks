import { mkdtemp, mkdir, readdir, readFile, rm, utimes, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import type { Address } from 'viem'

import { PoolIndex, POOL_INDEX_SCHEMA_VERSION, serializeSnapshot, v2PoolRef } from '../src/experimental/index'

import { CACHE_MAX_POOLS, cacheDir, cacheEnabled, cachePath, flushCacheSave, loadCache, saveCache, scheduleCacheSave } from './cache'

const WETH = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2' as Address
const USDC = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48' as Address
const POOL = '0xB4e16d0168e52d35CaCD2c6185b44281Ec28C9Dc' as Address

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

/** An index with one pool and a covered range — the smallest thing worth caching. */
function warmIndex(): PoolIndex {
  const index = new PoolIndex(WETH)
  index.upsert({ pool: v2PoolRef(POOL, USDC, WETH), source: 'event', createdAtBlock: 10_008_355n })
  index.addCoverage('v2', WETH, { fromBlock: 10_000_835n, toBlock: 21_000_000n })
  return index
}

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
    // eleven million blocks of history the first run paid for.
    expect(loaded.index!.uncovered('v2', WETH, 10_000_835n, 21_000_100n)).toEqual([
      { fromBlock: 20_999_969n, toBlock: 21_000_100n },
    ])
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
  it('skips the save past CACHE_MAX_POOLS, leaving any existing snapshot intact', async () => {
    await saveCache(1, warmIndex())
    const before = await readFile(join(dir, 'router-lite', '1.json'), 'utf8')

    const huge = warmIndex()
    // `stats()` is what the guard reads, so a stub of exactly that is the whole fixture needed —
    // materializing 50,001 real pools would make this test slower than the code path it guards.
    const oversized = Object.assign(Object.create(Object.getPrototypeOf(huge) as object) as PoolIndex, huge, {
      stats: () => ({ ...huge.stats(), pools: CACHE_MAX_POOLS + 1 }),
    })
    const note = await saveCache(1, oversized)

    expect(note).toMatch(new RegExp(`not saved.*${CACHE_MAX_POOLS + 1} pools.*${CACHE_MAX_POOLS} bound`))
    expect(await readFile(join(dir, 'router-lite', '1.json'), 'utf8')).toBe(before) // untouched
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
