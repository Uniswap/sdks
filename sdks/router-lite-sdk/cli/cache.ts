// ---------------------------------------------------------------------------
// `rl`'s on-disk pool-index cache — what makes a SECOND invocation warm.
//
// THE PROBLEM IT SOLVES. A warm, in-process `getQuote` is 67ms. Every `rl`
// invocation was cold, because a process is exactly the lifetime of the
// `PoolIndex` the CLI injects: each run re-scanned the same block history to
// re-learn the same pools, then threw the answer away on exit. The SDK already
// had the whole mechanism for fixing that — `PoolIndex.toSnapshot()` /
// `fromSnapshot()` plus `createRouter({ index })` — and this file is just the
// twenty lines of filesystem that connect them.
//
// WHY THE CACHE CANNOT GO STALE, ONLY BEHIND. Nothing here has a TTL, and that
// is deliberate rather than an omission: the index's coverage cache is
// BLOCK-RANGED, so a snapshot from last week does not claim to know anything
// about this week — it claims to have scanned up to block N, and the next
// search's `uncovered()` therefore asks the chain for exactly N+1..head. A
// stale snapshot is a smaller delta scan, which is the design working, not a
// correctness hazard. The one thing a snapshot could get WRONG is the tip
// (a shallow reorg after it was written), and `uncovered()` already re-opens
// the last `reorgOverlapBlocks` of coverage on every call regardless of what
// the cache says, so that tail is re-scanned whether the data came from disk or
// from this process. Pool records are additive and identity-keyed, so a pool
// that has since been drained is re-quoted and simply fails to quote — which is
// the same thing that happens to a pool discovered thirty seconds ago.
//
// WHAT MAKES IT SAFE TO JUST DELETE. Every failure mode below — unreadable
// file, malformed JSON, schemaVersion bump, a failed shape check, a manifest
// that no longer matches — resolves to "start fresh, note it". A cache whose
// entire content is re-derivable from the chain has no failure worth reporting
// as an error, and a testing CLI that refused to run because of its own cache
// file would be a worse tool than one with no cache at all. That invariant is
// load-bearing enough to be a rule rather than a habit: NOTHING in the load
// path may throw, which is why every line that touches the file's contents —
// including the manifest cross-checks, which call methods on values that came
// out of the file — lives inside `loadCache`'s single `try`.
//
// THE TRUST BOUNDARY, AND WHERE IT ACTUALLY IS (F3). The easy story is "it is a
// local file the user owns, so reading it is as trusted as running the tool".
// That story has real holes: a CI job that restores `~/.cache` from a shared
// artifact, a devcontainer or build image with a baked-in cache, and a
// multi-user box with `XDG_CACHE_HOME` pointed somewhere shared are all cases
// where the bytes did not come from the person running the command. So the file
// is treated as UNTRUSTED INPUT, and three things bound what a hostile one can
// do:
//
//   * SHAPE. `PoolIndex.fromSnapshot` shape-checks before loading anything, so a
//     payload cannot smuggle a `'abc'` where a bigint goes and detonate later,
//     mid-search, in code that has no idea a cache exists.
//   * A QUOTE IS A PROBE, NOT A BELIEF. Every pool a snapshot asserts is priced
//     by a real `eth_call` at a pinned block before it can appear in a result.
//     Injecting a fabricated pool buys an attacker some wasted `eth_call`s, not
//     a wrong price — the same position a caller-supplied `--hint` is in, which
//     this package already documents as trusted-but-verified.
//   * DISCREDIT. A pool that keeps failing to quote loses its rank
//     (`isDiscredited`), so injected junk decays rather than accumulating.
//
// THE RESIDUAL RISK, ACCEPTED AND NAMED: COVERAGE SUPPRESSION. A snapshot can
// claim to have scanned block ranges nobody scanned, and the next search will
// believe it and skip them — so a hostile cache can hide a pool rather than
// invent one, and the symptom is a worse route (or a `no-route`) with nothing
// anywhere saying why. Nothing here detects that, because detecting it means
// doing the scan the cache exists to avoid. It is accepted for a local testing
// CLI, where the blast radius is one developer's own quote being suboptimal;
// `--no-cache` is the one-flag answer for anyone whose cache directory is
// genuinely shared, and it is why this mechanism lives in `cli/` rather than
// being switched on by default inside the SDK.
//
// THE REAL CEILING IS NODE'S STRING LIMIT, NOT `CACHE_MAX_POOLS` (F7). Both
// halves of the round trip go through a single JavaScript string
// (`JSON.stringify` out, `readFile(…, 'utf8')` in), so a snapshot can never
// exceed the runtime's maximum string length — ~512 MB on V8, ~2 GB on JSC.
// `CACHE_MAX_POOLS` (~420 MB at the bound) sits deliberately under the tighter
// of those, so the guard trips before the runtime does and the failure is a
// note rather than an allocation error. Anything that raises the bound has to
// move to a streaming format first.
//
// KEYED URLS NEVER PRINT HERE EITHER (see `rl.ts`): nothing in this file ever
// touches the endpoint, and the cache is keyed by CHAIN ID, not by endpoint —
// two providers serving mainnet see the same pools and the same block history,
// so sharing one file between them is correct and halves the cold starts.
// ---------------------------------------------------------------------------

import { mkdir, readdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'

import type { Address } from 'viem'

import { intersectRanges, parseSnapshot, PoolIndex, serializeSnapshot, type PoolIndexSnapshot } from '../src/experimental/index'
import { PROTOCOLS, type BlockRange, type Protocol } from '../src/index'

import type { FlagSpec } from './args'

/**
 * Flags every chain-touching command accepts. The cache is ON by default, EVERYWHERE.
 *
 * The alternative considered was on-by-default for `discover` (a pure exploration command) and
 * off-by-default for `quote`/`swap` (which produce something a user might act on). That split was
 * rejected: it would mean the two commands whose latency a user actually feels are the two that
 * never benefit, and it implies a correctness difference between them that does not exist. A quote
 * is priced by `eth_call` at a pinned block on every run — the cache accelerates finding WHICH pools
 * to price, never WHAT they are worth — so a cached run and a cold run quote identically. What the
 * cache can do is make a search see a pool it would otherwise not have scanned far enough back to
 * find, which makes the answer better, not staler.
 *
 * `--no-cache` opts out (for a genuinely cold measurement, or to sidestep a suspect cache file);
 * `--cache` is accepted so a script can state the default explicitly and keep saying so if the
 * default ever changes.
 */
export const CACHE_FLAGS: FlagSpec = {
  cache: { kind: 'boolean' },
  'no-cache': { kind: 'boolean' },
}

/**
 * Pools above which a snapshot is NOT written — the one bound standing between this cache and
 * unbounded disk growth, and the knob that prices every warm start.
 *
 * MEASURED, NOT GUESSED. Snapshot cost is linear in pool count, at ~420 bytes, ~2.4us of load and
 * ~0.7us of save per pool (mainnet, local SSD):
 *
 *     pools      size     load (read+parse+rebuild)    save (serialize+write)
 *     10,000     4.4 MB     20 ms                        18 ms
 *     50,000    26.4 MB    103 ms                        42 ms
 *     100,000   50.8 MB    212 ms                        81 ms
 *     250,000   113  MB    567 ms                       181 ms
 *     654,267   275  MB   1560 ms                       441 ms
 *
 * 1,000,000 IS SET BY THE WORKLOAD, NOT BY A ROUND NUMBER. `chainz exec 1 -- rl discover usdc` is
 * the heaviest thing this CLI does — it drains USDC adjacency AND the core-intermediate (WETH)
 * adjacency across v2/v3/v4 over mainnet's whole history — and it settles at 654,267 pools / 275 MB.
 * That is one measured data point away from the bound, deliberately: a bound BELOW the heaviest real
 * workload excludes the exact case the cache exists for, which is what the first guess (50,000) did.
 * The ceiling is therefore ~420 MB per chain.
 *
 * WHAT THAT BUYS AND WHAT IT COSTS, BOTH MEASURED. `rl discover usdc` on mainnet: 67s cold (and
 * still budget-aborted with v2 discovery partial) versus 5.1s fully warm, with `eth_getLogs` down
 * from 356 to 14 — the 14 being the standing reorg-overlap re-scans, i.e. the floor. The cost lands
 * on the other side: `rl quote eth usdc 1` is 0.4s cold and 4.5s against a maximal cache, of which
 * ~2s is snapshot I/O and the rest is the search legitimately doing more (82 candidates priced
 * instead of 10, off 7,824 known intermediates instead of none). A major pair resolves on the first measurement round
 * from speculative direct probes and genuinely does not need the index; a long-tail pair — what this
 * SDK is actually for — falls through to exactly the adjacency scans the cache eliminates. Anyone
 * measuring cold latency, or who wants neither cost, passes `--no-cache`; deleting the file is
 * always safe.
 *
 * SKIPPING, NOT TRUNCATING, AND SKIPPING THE *WHOLE* SAVE. Writing a partial snapshot would be worse
 * than writing none, because COVERAGE AND POOLS ARE INSEPARABLE: coverage says "these blocks have
 * been scanned", so a snapshot carrying coverage without the pools that scan found would make the
 * next run skip the scan AND have nothing to show for it — an index that confidently knows nothing.
 * Any truncation rule has to keep those two consistent, and none of the cheap ones do. Skipping also
 * leaves whatever smaller snapshot is already on disk intact, which beats replacing it with an
 * arbitrary subset.
 */
export const CACHE_MAX_POOLS = 1_000_000

/** Bumped independently of the SDK's schema version; see {@link cachePath}. */
const CACHE_DIR_NAME = 'router-lite'

/** `$XDG_CACHE_HOME/router-lite` when set, else `~/.cache/router-lite`. */
export function cacheDir(env: Record<string, string | undefined> = process.env): string {
  const base = env.XDG_CACHE_HOME?.trim()
  return join(base && base.length > 0 ? base : join(homedir(), '.cache'), CACHE_DIR_NAME)
}

/** One file per chain id — see this file's header for why the endpoint is deliberately not in the key. */
export function cachePath(chainId: number, env?: Record<string, string | undefined>): string {
  return join(cacheDir(env), `${chainId}.json`)
}

/** Whether `--cache`/`--no-cache` leave the cache on. Default ON; `--no-cache` always wins. */
export function cacheEnabled(booleans: Set<string>): boolean {
  return !booleans.has('no-cache')
}

export type CacheLoad = {
  /** The restored index, or `undefined` when there was nothing usable to restore. */
  index: PoolIndex | undefined
  /** One line for `--verbose`, always present — "why is this run cold?" must never be a mystery. */
  note: string
}

/**
 * Reads `chainId`'s snapshot and rebuilds a {@link PoolIndex} from it, or explains why it could not.
 *
 * `expected` is cross-checked BEFORE the index is handed back, on the two facts a snapshot carries
 * precisely so they can be checked: `wrappedNative` and `reorgOverlapBlocks`. `createRouter({ index })`
 * would reject a mismatch too — but it does so by throwing a `RouterConfigError`, which is the right
 * behaviour for a caller who deliberately built an index and the wrong one for a cache file the user
 * never asked about. So the check happens here, where the answer is "start fresh", and the SDK's
 * check remains the backstop it was written to be.
 *
 * `expected` is (structurally) the FRESH `PoolIndex` this run would otherwise use, rather than a
 * manifest: the manifest states `reorgOverlapBlocks` optionally and the class resolves the default,
 * so asking the class what it resolved to is the only way to compare against the real value without
 * restating that default here and letting the two drift.
 */
export async function loadCache(
  chainId: number,
  expected: { wrappedNative: Address; reorgOverlapBlocks: bigint },
): Promise<CacheLoad> {
  const path = cachePath(chainId)
  // Before anything else: clear out any full-size `.tmp` a previous run died holding. Awaited rather
  // than fired-and-forgotten because this is a one-shot CLI — a detached promise races the process
  // exit and would leave the orphan behind exactly as often as not — and because it is one `readdir`
  // over a directory that holds a handful of entries.
  await sweepStaleTmp()

  let raw: string
  try {
    raw = await readFile(path, 'utf8')
  } catch {
    return { index: undefined, note: `cache: none at ${path} — cold start` }
  }

  // EVERYTHING that touches the file's contents lives inside this `try`, including the two
  // cross-checks below. That is not tidiness: `expected.wrappedNative.toLowerCase()` is a method call
  // on a value that CAME FROM THE FILE, so a snapshot whose `wrappedNative` is a number, or absent,
  // used to throw a raw `TypeError` out of this function — past every "start fresh" path, out through
  // `buildChainContext`, and into `rl.ts`'s catch-all as an exit-4 stack trace. A corrupt cache file
  // is never allowed to be a crash; `PoolIndex.fromSnapshot`'s shape check now makes that specific
  // one impossible, and this `try` is the guarantee that the NEXT one is not a crash either.
  let index: PoolIndex
  try {
    const snap: PoolIndexSnapshot = parseSnapshot(raw)
    index = PoolIndex.fromSnapshot(snap)

    if (index.wrappedNative.toLowerCase() !== expected.wrappedNative.toLowerCase()) {
      return { index: undefined, note: `cache: ${path} was built for a different wrappedNative — starting fresh` }
    }
    if (index.reorgOverlapBlocks !== expected.reorgOverlapBlocks) {
      return { index: undefined, note: `cache: ${path} was maintained under a different reorg overlap — starting fresh` }
    }
  } catch (err) {
    // Malformed JSON, a bumped schemaVersion, a failed shape check, anything at all: the content is
    // re-derivable from the chain, so there is no failure here worth more than a note.
    const why = err instanceof Error ? err.message.split('\n')[0]! : String(err)
    return { index: undefined, note: `cache: discarded ${path} (${why}) — starting fresh` }
  }

  const stats = index.stats()
  return { index, note: `cache: loaded ${stats.pools} pools · ${stats.coverageScopes} coverage scopes from ${path}` }
}

/** A `.tmp` older than this cannot belong to a live write, so it is an orphan from a killed run. */
const STALE_TMP_MS = 60 * 60 * 1000

/**
 * Deletes orphaned `*.tmp` files left behind by a write that never reached its `rename`.
 *
 * These are FULL-SIZE snapshots — up to a few hundred megabytes each — so a handful of Ctrl-C'd runs
 * could quietly fill a cache directory with dead weight that nothing ever reads or replaces (the
 * live path only ever writes to a fresh pid-suffixed name and renames it away). `saveCache` cleans up
 * its own failures; this catches the case it cannot, where the process died between the write and the
 * rename.
 *
 * Never throws and never reports: an mtime younger than {@link STALE_TMP_MS} is skipped so a
 * concurrent writer's in-progress file is left strictly alone, and every error is swallowed —
 * failing to tidy up is not a reason to fail a command, or even to mention it.
 */
async function sweepStaleTmp(): Promise<void> {
  try {
    const dir = cacheDir()
    const now = Date.now()
    for (const name of await readdir(dir)) {
      if (!name.endsWith('.tmp')) continue
      const full = join(dir, name)
      const info = await stat(full)
      if (now - info.mtimeMs > STALE_TMP_MS) await rm(full, { force: true })
    }
  } catch {
    // No directory, no permission, a racing sweep from a second process: all fine, all ignorable.
  }
}

/**
 * Writes `index` back to `chainId`'s cache file, atomically. Returns the `--verbose` note.
 *
 * ATOMIC BECAUSE THE READER IS THE SAME TOOL. `rl` is run repeatedly and often concurrently (two
 * terminals, a `watch`, a script), and a plain `writeFile` truncates in place: a reader arriving
 * mid-write sees a prefix of valid JSON, which `parseSnapshot` throws on — recoverable, but it turns
 * a warm start into a cold one for no reason, and only under load. `tmp + rename` is a single
 * atomic directory operation on every POSIX filesystem, so a reader sees either the whole old file
 * or the whole new one, never a splice. The tmp name carries the pid so two concurrent writers
 * cannot clobber each other's partial file before either renames.
 *
 * ATOMIC IS NOT COORDINATED, THOUGH. Two `rl` runs finishing at once is LAST-WRITER-WINS: both write
 * a complete, self-consistent snapshot and the later `rename` is the one that survives, so the
 * earlier run's newly-learned coverage is simply lost rather than corrupted. That is the intended
 * behaviour and not worth a lock file — losing one run's delta costs the next run one delta re-scan,
 * which is the same thing a cold start costs, and a lock introduces a failure mode (a stale lock from
 * a killed run) strictly worse than the one it prevents.
 *
 * NEVER THROWS, AND NEVER LEAVES ITS TMP BEHIND. A cache write failing (read-only home, full disk, a
 * sandbox with no HOME) must not change what the command returned — the answer was already computed
 * and printed — and a failed write must not strand a several-hundred-megabyte partial file. The one
 * case this cannot clean up is the process being killed mid-write, which is what `sweepStaleTmp`
 * exists for.
 */
export async function saveCache(chainId: number, index: PoolIndex): Promise<string> {
  const path = cachePath(chainId)
  const stats = index.stats()
  if (stats.pools > CACHE_MAX_POOLS) {
    return `cache: not saved — ${stats.pools} pools exceeds the ${CACHE_MAX_POOLS} bound (see cli/cache.ts)`
  }
  const tmp = `${path}.${process.pid}.tmp`
  try {
    await mkdir(cacheDir(), { recursive: true })
    await writeFile(tmp, serializeSnapshot(index.toSnapshot()), 'utf8')
    await rename(tmp, path)
    return `cache: saved ${stats.pools} pools · ${stats.coverageScopes} coverage scopes to ${path}`
  } catch (err) {
    const why = err instanceof Error ? err.message.split('\n')[0]! : String(err)
    await rm(tmp, { force: true }).catch(() => {}) // never strand a partial snapshot
    return `cache: not saved (${why})`
  }
}

// ---------------------------------------------------------------------------
// The cache summary line's data — the pure half. `context.ts` calls this on
// whatever `loadCache` restored (pools, coverage) and hands the result to
// `report.ts#renderCacheLine`, which is the actual string formatting.
//
// Computed PRE-SEARCH, from the snapshot alone, with no new RPC call: the
// live chain head is a search's own first read, one round trip away, and the
// cache line has to be printable before that. So "head" here is a PROXY —
// the highest block ANY coverage range in the whole snapshot reaches, across
// every protocol and scope — not the chain's real tip. That makes the
// percentage a measure of "how internally caught-up is this cache", not "how
// caught up is this cache with the live chain": a snapshot that is a month
// stale but was fully scanned up to the block it stopped at still reads
// 100% here, and correctly so — the real staleness is exactly the delta the
// upcoming search's own scans will close, and is not this line's job to
// guess at.
// ---------------------------------------------------------------------------

export type CacheProtocolSummary = { pct: number; complete: boolean }

/** Merges `ranges` (from however many distinct coverage-scope keys share a protocol — a direct
 * pair's scope and an adjacency endpoint's scope can overlap) and sums the covered span within
 * `[lo, hi]`, so overlapping scopes are never double-counted. Composed from `src/internal/ranges.ts`'s
 * set arithmetic — intersecting against the single `[lo, hi]` window both clips every range to it and
 * merges the overlaps, which is the one definition of that algebra this package has. */
function mergedCoveredSpan(ranges: BlockRange[], lo: bigint, hi: bigint): bigint {
  const clipped = intersectRanges(ranges, [{ fromBlock: lo, toBlock: hi }])
  return clipped.reduce((total, r) => total + (r.toBlock - r.fromBlock + 1n), 0n)
}

/**
 * Per-protocol coverage fraction against each protocol's OWN demand floor — the same denominator
 * shape `SearchReport.discovery[p].demandFloor` uses, just computed here without a live head (see
 * this section's header). A protocol absent from `demandFloors` (no bundle in the manifest) is
 * OMITTED from the result — the caller renders that as `disabled`, distinct from a present protocol
 * reporting a legitimate `0%`.
 */
export function summarizeCacheCoverage(
  coverage: readonly (readonly [string, BlockRange[]])[],
  // `bigint | undefined` (rather than the optional-key `Partial<Record<...>>` shape) on purpose: the
  // natural caller reads `chain.manifest.v2?.deploymentBlock`, which is ALWAYS a present key whose
  // value happens to be `undefined` for a protocol with no manifest bundle, never an absent key — and
  // `exactOptionalPropertyTypes` treats those two shapes as distinct.
  demandFloors: Record<Protocol, bigint | undefined>,
): Partial<Record<Protocol, CacheProtocolSummary>> {
  let approxHead: bigint | undefined
  for (const [, ranges] of coverage) {
    for (const r of ranges) {
      if (approxHead === undefined || r.toBlock > approxHead) approxHead = r.toBlock
    }
  }

  const result: Partial<Record<Protocol, CacheProtocolSummary>> = {}
  for (const p of PROTOCOLS) {
    const floor = demandFloors[p]
    if (floor === undefined) continue
    if (approxHead === undefined || approxHead < floor) {
      result[p] = { pct: 0, complete: false }
      continue
    }
    const ranges = coverage.filter(([key]) => key.startsWith(`${p}:`)).flatMap(([, r]) => r)
    const covered = mergedCoveredSpan(ranges, floor, approxHead)
    const span = approxHead - floor + 1n
    const fraction = span > 0n ? Number((covered * 1000n) / span) / 1000 : 0
    result[p] = { pct: fraction, complete: fraction >= 0.999 }
  }
  return result
}

// ---------------------------------------------------------------------------
// The exit-time save.
//
// Only ONE chain context is ever built per `rl` invocation (the CLI takes one
// endpoint and detects one chain), so a single module-level slot is the whole
// registry this needs — no map, no ids. `context.ts` registers the save when it
// builds the index; `rl.ts` flushes it in a `finally`, so the cache is written
// on every exit path including the error ones (a search that failed partway
// still learned real coverage, and throwing that away would make the failing
// case permanently slow).
// ---------------------------------------------------------------------------

let pendingSave: (() => Promise<void>) | undefined

/** Registers the save to run when the process finishes its command. Replaces any prior registration. */
export function scheduleCacheSave(save: () => Promise<void>): void {
  pendingSave = save
}

/** Runs (and clears) whatever {@link scheduleCacheSave} registered. Never throws. */
export async function flushCacheSave(): Promise<void> {
  const save = pendingSave
  pendingSave = undefined
  if (!save) return
  try {
    await save()
  } catch {
    // `saveCache` already swallows its own failures; this is the belt for anything the closure adds.
  }
}
