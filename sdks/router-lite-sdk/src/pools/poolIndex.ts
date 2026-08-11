import type { Address } from 'viem'

import { DEFAULT_REORG_OVERLAP_BLOCKS, HINT_DISCREDIT_FAILURE_BLOCKS, MIN_CHUNK, NEGATIVE_CACHE_BLOCKS } from '../constants'
import { RouterConfigError } from '../errors'
import { toGraphNode } from '../internal/currency'
import type { ScanWidthMemory } from '../internal/logScan'
import { maxBig, mergeRanges } from '../internal/ranges'
import type { BlockRange, CurrencyRef, PoolKey, PoolRecord, PoolRef, Protocol } from '../types'
import { PROTOCOLS } from '../types'

// ---------------------------------------------------------------------------
// In-memory pool index with a scan-coverage cache.
//
// Three independent concerns share one class because they share a lifetime
// (per-chain, per-process) and a key space (protocol + graph node):
//   - pool identity + metadata (dedup, merge, adjacency for pair/neighbor search)
//   - scan coverage per (protocol, endpoint) — which block ranges have been
//     scanned for pool-creation events, with a standing reorg-overlap re-scan
//     window at the tip
//   - a negative cache bounded to the last NEGATIVE_CACHE_BLOCKS blocks (a pool
//     that failed to quote at block N says nothing about block N+1, and the
//     cache forgets N once the head has moved a couple of blocks past it —
//     see `markNegative`)
//
// C4-H5: THE ONE THING NONE OF THAT BOUNDS IS THE POOL COUNT ITSELF. Every
// distinct pool ever seen — hinted, discovered, or merely probed and found to
// respond — earns a permanent `pools` entry plus two permanent `adjacency`
// entries (measured ~3.1 KB/pool), and `coverage` gains a permanent entry per
// distinct scope a caller has ever asked about (a single long-tail trade's
// WETH-adjacency scan alone has been measured at ~150-250 MB). None of that
// was reachable from outside the class before this: no size accessor, no way
// to reset, no way to hand a pre-warmed index to a fresh router instance. This
// file now adds all three: `stats()` (a sizes-only snapshot, safe to log on an
// interval — see {@link PoolIndexStats}), `maxPools` (an optional bound
// enforced by evicting the least-recently-touched pool — see
// {@link PoolIndexOptions} and `evictIfNeeded`), and injectability (the
// constructor already took nothing this class doesn't also expose, so
// `createRouter({ index })` in `router.ts` can hand a whole `PoolIndex` instance
// to a router that did not build it — the "warm handoff between routers" case).
// Clearing an index is deliberately NOT a method here: `router.ts#clearIndex`
// does it by constructing a fresh `PoolIndex` and swapping the router's
// reference to it, which is also what makes an in-flight search on the old
// index safe (its `SearchContext` already copied the old reference at
// `buildContext` time, before the swap).
//
// P2: AND THE INDEX NOW OUTLIVES THE PROCESS. Injectability made a warm index
// portable between routers; `toSnapshot`/`fromSnapshot` — plus the
// `serializeSnapshot`/`parseSnapshot` JSON pair, which exist because
// `JSON.stringify` throws outright on the bigints this class is full of — make
// it portable between PROCESSES. That closes the gap the measurements kept
// pointing at: a warm in-process `getQuote` is 67ms, and every CLI invocation,
// which is how this package is actually exercised by hand, was cold. What
// travels is what cannot be cheaply re-derived (the coverage cache above all —
// the difference between a full-history scan and a delta scan) and what is
// durable (pool identity, provenance, the discredit counters); what does not
// travel is what is block-scoped by design. See {@link PoolIndexSnapshot} for
// the inventory and the reasoning field by field.
// ---------------------------------------------------------------------------

/**
 * Provenance axis, most-specific (most-authoritative) first: a caller's `hint` is never downgraded
 * by anything discovered later — 'event' (an on-chain creation log) is stronger provenance than
 * 'factory' (a quote probe that merely proved a pool responds) and so outranks it, but neither ever
 * displaces a `hint`. Merge keeps whichever source has the LOWER index here.
 *
 * This is the *stored* provenance, and it is deliberately monotone: what a record says about where
 * it came from never changes. Whether that provenance is still CREDIBLE is a separate, evidence-
 * driven question answered by {@link isDiscredited} at ranking time — see its docstring.
 */
const SOURCE_PRIORITY = ['hint', 'event', 'factory'] as const

function rank(source: PoolRecord['source']): number {
  return SOURCE_PRIORITY.indexOf(source)
}

/**
 * Whether a hinted pool's top-rank provenance has been contradicted by the chain often enough to
 * stop honoring it (C4-H4).
 *
 * WHY THIS EXISTS. `validateHint` for v2 and v4 does no on-chain lookup at all — a v2 pair address
 * is a pure CREATE2 derivation from (factory, token0, token1), and a v4 poolId is the hash of the
 * caller's own PoolKey — so *any* well-formed hint "validates" and enters the index at the top of
 * {@link SOURCE_PRIORITY}, ahead of every pool an actual creation log proved exists. That is
 * correct for the case hints exist for (a pool created seconds ago, invisible to any log scan) and
 * exploitable otherwise: 64 fabricated PoolKeys would permanently occupy the per-pair selection cap
 * ahead of the real pools, on nothing but the caller's assertion, for the whole life of the router
 * instance.
 *
 * WHAT IT IS NOT. It is not deletion, and it is not permanent. A hint may legitimately name a pool
 * that does not quote *yet* (pre-launch, unfunded, a hook that opens later), so the record stays in
 * the index with its `source: 'hint'` intact and merely loses its ranking privilege. The evidence
 * required is failures at {@link HINT_DISCREDIT_FAILURE_BLOCKS} DISTINCT blocks — and only failures
 * of the pool-absent shape, since that is the only shape `markNegative` is ever called for (see its
 * docstring and `search/pump.ts`'s reverted-measurement handling), so a pool that reverts on
 * liquidity or on a hook's own rules is never discredited by this.
 *
 * TWO ROUTES BACK, AND THE LIMITS OF EACH:
 *
 *  1. A successful quote. `lastQuoteSuccessBlock === undefined` is part of the test, so the first
 *     one clears the demotion outright. This is the ordinary path — a demoted pool is still
 *     measured (there is no per-pair selection to lose; only the `MEASUREMENT_PAIR_CEILING` abuse
 *     backstop trims a pair), so it keeps getting quoted and keeps its chance to recover.
 *  2. A creation log. `upsert` clears the failure counters when an `event`-sourced record arrives
 *     (see there), because a creation log answers the existence question directly.
 *
 * Route 1 is NOT guaranteed: on a pair that is already at its pool cap with proved pools, a
 * tier-2 record can be pruned out of selection entirely and is then never quoted again, so it can
 * never earn its own way back. That is the intended trade — a contradicted assertion should not
 * displace proved pools in order to re-prove itself every block — and it is why route 2 exists:
 * recovery requires spare pair capacity or a creation log, not merely patience.
 */
export function isDiscredited(rec: PoolRecord): boolean {
  return (
    rec.source === 'hint' &&
    rec.lastQuoteSuccessBlock === undefined &&
    (rec.quoteFailureBlocks ?? 0) >= HINT_DISCREDIT_FAILURE_BLOCKS
  )
}

function earliest(a: bigint | undefined, b: bigint | undefined): bigint | undefined {
  if (a === undefined) return b
  if (b === undefined) return a
  return a < b ? a : b
}

function latest(a: bigint | undefined, b: bigint | undefined): bigint | undefined {
  if (a === undefined) return b
  if (b === undefined) return a
  return a > b ? a : b
}

/**
 * Bumped whenever the SHAPE of a {@link PoolIndexSnapshot} changes in a way that would make an older
 * payload misread rather than merely incomplete — a renamed field, a changed key format, a semantic
 * change to what a stored value means. {@link PoolIndex.fromSnapshot} refuses anything that does not
 * match exactly; there is deliberately no migration path, because the entire content of a snapshot is
 * a CACHE of things the chain can be re-read for. Starting fresh costs a delta scan, which is the
 * cheapest possible failure mode and infinitely cheaper than silently restoring coverage claims
 * whose meaning has drifted.
 */
export const POOL_INDEX_SCHEMA_VERSION = 2

/**
 * A serializable, process-independent picture of everything a {@link PoolIndex} learned that is worth
 * carrying to another process — the extension story the class was designed for
 * (`toSnapshot`/`fromSnapshot`), and what makes a CLI invocation's second run warm.
 *
 * WHAT IS IN IT, AND WHY EACH THING SURVIVES A PROCESS BOUNDARY:
 *
 *  - `pools`: the merged {@link PoolRecord}s, in insertion order. Adjacency is NOT stored — it is
 *    derived from each record's own `pool.currencies` on the way back in (`link`, exactly as `upsert`
 *    does), so it cannot drift from the pools it indexes and costs nothing to re-derive. Storing it
 *    would roughly double the payload to encode information already present.
 *  - `coverage`: the block ranges already scanned per `${protocol}:${scope}` key. This is the single
 *    most valuable thing here — it is the difference between a cold full-history scan and a delta
 *    scan, and unlike the pools it cannot be re-derived from anything cheaper than the scan itself.
 *  - `enabledFees`: fee tiers discovered from a factory's own enablement events, per
 *    `${protocol}:${factory}` key. Same argument as coverage at a smaller scale.
 *  - `learnedScanWidth`: the widest `eth_getLogs` window the endpoint has been seen to serve
 *    ({@link ScanWidthMemory}). The scanner finds it by refusal — halving down from
 *    `MAX_SCAN_WINDOW` until something is served — so on a hard-capped endpoint it is worth a run of
 *    wasted probes per cold process, and it is one small integer. Note what is stored is the HINT
 *    and not the sibling `declaredScanCap`: a snapshot is keyed by chain, so two providers on one
 *    chain share this file, and a hint that is wrong for the other provider costs a few regrowth
 *    doublings while a CEILING that is wrong for it would cap every scan it ever runs.
 *  - `wrappedNative` / `reorgOverlapBlocks`: the two chain facts the index was BUILT with and which
 *    everything above is expressed in terms of. They travel with the data because they are what make
 *    it interpretable: a restored coverage cache maintained under a different reorg depth, or an
 *    adjacency graph collapsed onto a different native family, is not stale — it is wrong.
 *    `createRouter({ index })` already rejects a mismatch against its manifest (see
 *    `router.ts#createRouter`), which is where a restored index gets checked against the chain it is
 *    about to be used for.
 *
 * WHAT IS DELIBERATELY ABSENT:
 *
 *  - The NEGATIVE CACHE. It is block-scoped by construction — "this pool could not quote at block N"
 *    says nothing about N+1, and {@link PoolIndex.markNegative} evicts anything more than
 *    {@link NEGATIVE_CACHE_BLOCKS} behind the head on every write. By the time a snapshot is read
 *    back the head has moved and every entry in it would be evicted on first use anyway. Persisting
 *    it would be persisting noise. (The DURABLE half of that machinery — `quoteFailureBlocks` /
 *    `lastQuoteFailureBlock`, which is what {@link isDiscredited} reads — lives on the records and
 *    therefore DOES survive, which is the half that should: a hint the chain contradicted twice
 *    yesterday has not earned its rank back by the process restarting.)
 *  - `lastTouched`, the LRU clock behind `maxPools`. It is re-derived on restore from each record's
 *    own blocks (`upsert`'s `createdAtBlock ?? lastQuoteSuccessBlock ?? lastQuoteFailureBlock`) — an
 *    approximation, and knowingly so: a pool kept alive purely by `touchAll` as a two-hop leg comes
 *    back looking older than it is and is evicted sooner under pressure. The alternative is a
 *    per-pool field on every record to preserve an ordering that only matters to a bounded index,
 *    which re-earns itself within one search.
 *  - `maxPools` itself. It is the RESTORING host's policy about its own memory, not a property of the
 *    data — see {@link PoolIndex.fromSnapshot}'s options argument.
 *
 * `bigint` FIELDS ARE REAL BIGINTS HERE, not strings: this is the in-memory shape. `JSON.stringify`
 * throws on a bigint, so the JSON round trip is handled by the {@link serializeSnapshot} /
 * {@link parseSnapshot} pair rather than left as a trap for every caller to rediscover.
 */
export type PoolIndexSnapshot = {
  schemaVersion: number
  wrappedNative: Address
  reorgOverlapBlocks: bigint
  pools: PoolRecord[]
  /** `[`${protocol}:${scope}`, mergedRanges]` — the coverage cache, as entries. */
  coverage: [string, BlockRange[]][]
  /** `[`${protocol}:${factory}`, feeTiers]` — the per-factory enabled-fee cache, as entries. */
  enabledFees: [string, number[]][]
  /** The widest served `eth_getLogs` window; absent when this index has never run a scan. */
  learnedScanWidth?: bigint
}

/**
 * The tag {@link serializeSnapshot} wraps a `bigint` in, and {@link parseSnapshot} unwraps.
 *
 * A JSON reviver only sees strings, so round-tripping bigints needs a marker no legitimate string
 * value in a snapshot could collide with. Every string a snapshot actually contains is one of: a
 * `PoolRef.id` (`v2:`/`v3:`/`v4:` prefixed), a `0x`-prefixed address or poolId, a `'native'` currency
 * ref, a `source` enum member, or a coverage/fee key (an address, or `pair:`-prefixed). None can
 * begin with `$bigint:`, and none is caller-controlled free text — the index never stores a symbol,
 * a URL, or anything else a user typed.
 */
const BIGINT_TAG = '$bigint:'

/**
 * A snapshot as JSON, with every `bigint` encoded as a tagged string (see {@link BIGINT_TAG}).
 *
 * Exists as a PAIR with {@link parseSnapshot} so that the bigint round trip is one library decision
 * rather than a puzzle re-solved (differently, and wrongly) by every caller: `JSON.stringify` throws
 * outright on a `bigint`, so a caller who reaches for it directly discovers the problem immediately
 * — and the obvious fix, `String(v)`, loses the type on the way back in and yields an index whose
 * `createdAtBlock` is `"18000000"` and whose every block comparison is then silently wrong.
 */
export function serializeSnapshot(snap: PoolIndexSnapshot): string {
  return JSON.stringify(snap, (_key, value: unknown) =>
    typeof value === 'bigint' ? `${BIGINT_TAG}${value.toString()}` : value,
  )
}

/**
 * The inverse of {@link serializeSnapshot}. Throws whatever `JSON.parse` throws on malformed input —
 * a caller reading a cache file is expected to treat that the same way it treats a schema mismatch
 * (discard, start fresh), since both mean "this file cannot be trusted" and neither is recoverable.
 *
 * The returned value is TRUSTED to be shape-correct beyond the bigint decoding: this is a
 * deserializer, not a validator. {@link PoolIndex.fromSnapshot} checks the one thing that determines
 * whether the shape can be trusted at all (`schemaVersion`), and `createRouter({ index })` checks the
 * two chain facts. Feeding it a hand-edited file is the same class of act as calling `upsert` with a
 * fabricated record, which this package has never defended against and documents as such.
 */
export function parseSnapshot(json: string): PoolIndexSnapshot {
  return JSON.parse(json, (_key, value: unknown) =>
    typeof value === 'string' && value.startsWith(BIGINT_TAG) ? BigInt(value.slice(BIGINT_TAG.length)) : value,
  ) as PoolIndexSnapshot
}

function bad(what: string): never {
  throw new RouterConfigError(
    `pool index snapshot is malformed (${what}) — discard it and start fresh ` +
      '(a snapshot is a cache of re-readable chain state, never a source of truth)',
  )
}

/**
 * Checks the one field every consumer of a {@link PoolRef} reads FIRST — the `protocol` discriminant
 * — and then the arm-specific identity fields that discriminant promises.
 *
 * WHY THE DISCRIMINANT IS NOT LIKE THE OTHER FIELDS. `id` and `currencies` are checked above because
 * the index itself keys and links on them. `protocol` is checked here because everything DOWNSTREAM
 * of the index switches on it and then reaches straight for an arm-specific field without looking:
 * `quote/rank.ts#isComplex` calls `isHooked`, which reads `ref.poolKey.hooks` the
 * moment `protocol === 'v4'`; `plan/compile.ts`'s recipient-vs-pool check reads `leg.pool.address`
 * for anything that is not `'v4'` and hands it to viem's `isAddressEqual`; `protocols/v4.ts` and
 * `encode/ur20.ts` ABI-encode `poolKey.fee`/`tickSpacing`/`hooks` into quote calls and calldata. So a
 * crafted record claiming `protocol: 'v4'` with no `poolKey` restores into a perfectly ordinary
 * index and detonates as a bare `TypeError` (or a viem `InvalidAddressError`) from the middle of a
 * search — outside `cli/cache.ts`'s try, in a stack that names nothing about caches, which is exactly
 * the failure mode the snapshot trust story (`cli/cache.ts` header, "SHAPE") says cannot happen.
 *
 * Still shallow, and for the same reason as everything above it: this checks that the union arm the
 * record CLAIMS is populated with the right primitive types, not that the values are true. That a
 * `poolId` really hashes its `PoolKey`, or that an address really holds a pool, is chain state — and
 * re-deriving chain state is what the snapshot exists to avoid. A quote is still a probe, not a
 * belief (`cli/cache.ts`).
 */
function assertPoolRefIdentity(pool: PoolRef): void {
  const protocol = pool.protocol as unknown
  if (typeof protocol !== 'string') bad('a pool ref has a non-string protocol')
  if (!(PROTOCOLS as readonly string[]).includes(protocol)) bad(`a pool ref names an unknown protocol '${protocol}'`)
  if (pool.protocol === 'v4') {
    const key = pool.poolKey as unknown
    if (typeof key !== 'object' || key === null) bad('a v4 pool ref has no poolKey object')
    const { currency0, currency1, fee, tickSpacing, hooks } = key as PoolKey
    // `hooks` reaches `isAddressEqual` in `isHooked` (which THROWS on a non-address) and is ABI-encoded
    // as an address; `currency0`/`currency1` are the key's own identity and are ABI-encoded alongside it.
    for (const [field, value] of [
      ['currency0', currency0],
      ['currency1', currency1],
      ['hooks', hooks],
    ] as const) {
      if (typeof value !== 'string') bad(`a v4 pool ref's poolKey.${field} is not a string`)
    }
    // `fee` is `BigInt()`d in `encode/ur20.ts` and `tickSpacing` is encoded as an int24; a string or
    // null in either is a throw from inside the encoder rather than a rejected snapshot.
    for (const [field, value] of [
      ['fee', fee],
      ['tickSpacing', tickSpacing],
    ] as const) {
      if (typeof value !== 'number') bad(`a v4 pool ref's poolKey.${field} is not a number`)
    }
    return
  }
  // v2/v3: `address` is the `to` of every reserves/quote `eth_call` and the operand of
  // `plan/compile.ts`'s `isAddressEqual` recipient check.
  if (typeof pool.address !== 'string') bad(`a ${pool.protocol} pool ref's address is not a string`)
}

/**
 * Fails a snapshot whose SHAPE the index cannot operate on, before any of it is loaded.
 *
 * WHY A SHALLOW CHECK IS THE RIGHT AMOUNT. `parseSnapshot` is a deserializer: it turns tagged strings
 * back into bigints and otherwise hands `JSON.parse`'s output straight through, so every field is
 * whatever the file said. Most corruptions are self-announcing — truncated JSON throws in `JSON.parse`,
 * a bumped `schemaVersion` is caught below. The dangerous middle band is a file that parses fine and
 * is wrong in a way nothing notices until it is deep in the engine: a coverage bound that came back as
 * the string `'abc'` restores without complaint and then throws inside `uncovered`'s bigint
 * comparisons on the next search, or silently mis-sorts in `mergeRanges`. Every check below covers one
 * of those — the fields the class does arithmetic or map-keying on — and stops there. Validating
 * deeper (that a `poolId` really hashes its `PoolKey`, say) would be re-deriving the chain, which is
 * what the snapshot exists to avoid, and would still not make the content trustworthy; see
 * {@link PoolIndex.fromSnapshot}'s note on where the trust boundary actually is.
 *
 * EXPORTED, BUT NOT ON THE PACKAGE SURFACE — `src/experimental/index.ts` deliberately does not
 * re-export it, so no published entry point reaches it. It is exported so a host that must GATE an
 * untrusted snapshot without RESTORING one can run the same gate `fromSnapshot` runs, rather than
 * writing a second copy of it that would drift. `cli/poolList.ts#parsePoolList` is that host: it
 * checks a stranger's list at the boundary and then merges the records into an index it already
 * holds, so building a whole throwaway index just to reach this function meant materializing every
 * pool twice. This function is the ONLY part of `fromSnapshot` that gates anything — everything
 * after it is construction — which is exactly why splitting it out changes no boundary.
 */
export function assertSnapshotShape(snap: PoolIndexSnapshot): void {
  if (typeof snap !== 'object' || snap === null) bad('not an object')
  if (snap.schemaVersion !== POOL_INDEX_SCHEMA_VERSION) {
    throw new RouterConfigError(
      `pool index snapshot has schemaVersion ${String(snap.schemaVersion)}, this build reads ${POOL_INDEX_SCHEMA_VERSION} — ` +
        'discard it and start fresh (a snapshot is a cache of re-readable chain state, never a source of truth)',
    )
  }
  // `wrappedNative` becomes every adjacency lookup's native-family fold, and is `.toLowerCase()`d by
  // callers comparing it against a manifest — a non-string here is the `cli/cache.ts` TypeError.
  if (typeof snap.wrappedNative !== 'string') bad('wrappedNative is not a string')
  // Subtracted from block numbers on every `uncovered` call.
  if (typeof snap.reorgOverlapBlocks !== 'bigint') bad('reorgOverlapBlocks is not a bigint')

  if (!Array.isArray(snap.pools)) bad('pools is not an array')
  for (const rec of snap.pools) {
    if (typeof rec !== 'object' || rec === null) bad('a pool record is not an object')
    const pool = rec.pool as unknown
    if (typeof pool !== 'object' || pool === null) bad('a pool record has no pool')
    // `id` is the index's primary map key; `currencies` is destructured into both adjacency links.
    if (typeof (pool as PoolRef).id !== 'string') bad('a pool ref has a non-string id')
    const currencies = (pool as PoolRef).currencies as unknown
    if (!Array.isArray(currencies) || currencies.length !== 2) bad('a pool ref does not carry exactly two currencies')
    for (const c of currencies) if (typeof c !== 'string') bad('a pool ref currency is not a string')
    assertPoolRefIdentity(pool as PoolRef)
    // Read by `rank()` (an `indexOf` that quietly returns -1) and by `isDiscredited`.
    if (typeof rec.source !== 'string') bad('a pool record has a non-string source')
    for (const field of ['createdAtBlock', 'lastQuoteSuccessBlock', 'lastQuoteFailureBlock'] as const) {
      const v = rec[field]
      if (v !== undefined && typeof v !== 'bigint') bad(`a pool record's ${field} is not a bigint`)
    }
    if (rec.quoteFailureBlocks !== undefined && typeof rec.quoteFailureBlocks !== 'number') {
      bad("a pool record's quoteFailureBlocks is not a number")
    }
  }

  if (!Array.isArray(snap.coverage)) bad('coverage is not an array')
  for (const entry of snap.coverage) {
    if (!Array.isArray(entry) || entry.length !== 2) bad('a coverage entry is not a [key, ranges] pair')
    const [key, ranges] = entry
    if (typeof key !== 'string') bad('a coverage key is not a string')
    if (!Array.isArray(ranges)) bad('a coverage entry has no range array')
    for (const r of ranges) {
      if (typeof r !== 'object' || r === null) bad('a coverage range is not an object')
      if (typeof r.fromBlock !== 'bigint' || typeof r.toBlock !== 'bigint') bad('a coverage range bound is not a bigint')
    }
  }

  if (!Array.isArray(snap.enabledFees)) bad('enabledFees is not an array')
  for (const entry of snap.enabledFees) {
    if (!Array.isArray(entry) || entry.length !== 2) bad('an enabledFees entry is not a [key, tiers] pair')
    const [key, tiers] = entry
    if (typeof key !== 'string') bad('an enabledFees key is not a string')
    if (!Array.isArray(tiers)) bad('an enabledFees entry has no tier array')
    for (const t of tiers) if (typeof t !== 'number') bad('an enabledFees tier is not a number')
  }

  // Compared against, and `minBig`/`maxBig`d with, block counts on the first request of every scan
  // — the same class of field as `reorgOverlapBlocks` above, and the same failure if it is a string.
  // Optional: an index that never scanned anything has none, and neither did any snapshot written
  // before it existed.
  if (snap.learnedScanWidth !== undefined && typeof snap.learnedScanWidth !== 'bigint') {
    bad('learnedScanWidth is not a bigint')
  }
  // AND NOT MERELY POSITIVE — AT LEAST `MIN_CHUNK`. `learnedScanWidth` opens the next scan's first
  // window (`internal/logScanPolicy.ts#initialPolicy`), and `MIN_CHUNK` is the narrowest window that
  // scanner will ever ASK FOR: a smaller value describes no window the machine can use, and used as
  // a starting width it produces a scan that never fails, never gives anything up, and spends its
  // whole `MAX_REQUESTS_PER_SCAN` budget walking a multi-million-block range a handful of blocks at
  // a time — a permanently crippled router with nothing anywhere saying why. `> 0` admitted exactly
  // that. Belt and braces with `initialPolicy`'s own floor, and the two note each other: this gate
  // stops a sub-floor value ENTERING a router's memory, the floor stops one that arrives by any
  // other route from deciding a width. Nothing this package writes can trip it — `logScan.ts`
  // records only widths at or above the floor — so a value below it means a foreign or corrupt file.
  if (snap.learnedScanWidth !== undefined && snap.learnedScanWidth < MIN_CHUNK) {
    bad(`learnedScanWidth ${snap.learnedScanWidth} is below MIN_CHUNK (${MIN_CHUNK}) — no window the scanner can ask for`)
  }
}

export type PoolIndexOptions = {
  /**
   * Bound the index to at most this many distinct pools. `undefined` (the default) is unbounded —
   * see the C4-H5 header comment above for what that costs on a long-running instance. When set,
   * inserting a pool beyond the cap evicts the least-recently-TOUCHED pool(s) first (touch =
   * {@link PoolIndex.upsert}/{@link PoolIndex.markSuccess}/{@link PoolIndex.markNegative}/
   * {@link PoolIndex.touchAll} — the last of which touches every pool a search's candidate
   * enumeration selects as a route leg, whether or not it goes on to quote successfully), except a
   * pool touched at the block the triggering call itself named, which is never evicted regardless of
   * how far over cap that leaves the index — see {@link PoolIndex.evictIfNeeded}.
   *
   * A pool with `isDiscredited(record)` true (an unverified hint the chain has already contradicted —
   * see `isDiscredited`'s docstring) is the LAST eviction candidate, not an ordinary one: its record is
   * tiny, and its accumulated failure count is the one thing worth paying to keep, since evicting it
   * hands a caller who resubmits the same junk hint its full, un-discredited rank right back. It is
   * only evicted when no other (unprotected) pool is eligible at all.
   */
  maxPools?: number | undefined
  /**
   * How many blocks of already-covered tip {@link PoolIndex.uncovered} re-opens on every call, for
   * shallow-reorg tolerance. Defaults to {@link DEFAULT_REORG_OVERLAP_BLOCKS} (mainnet's 32).
   *
   * A CHAIN FACT, injected rather than read from a constant (C4-P1). This class is deliberately
   * manifest-unaware — it knows pools and block ranges, not deployments — so the chain's answer
   * arrives here the same way `wrappedNative` does: through the constructor, from whoever built the
   * index against a manifest. `router.ts` passes `reorgOverlapBlocksOf(manifest)` and rejects an
   * INJECTED index whose value disagrees, exactly as it does for `wrappedNative`.
   */
  reorgOverlapBlocks?: bigint | undefined
}

/**
 * A snapshot of what a {@link PoolIndex} currently holds — every field is a size, not a value, so
 * this is safe to log/emit on an interval without leaking anything the index was told in confidence
 * (a hint's pool identity, a discovered pair). Exists so a long-running host can watch an unbounded
 * index's footprint grow (or confirm a `maxPools`-bounded one is holding steady) without reaching
 * into private state — see `createRouter`'s `stats()`, which returns this same shape under the
 * public name `RouterStats`.
 */
export type PoolIndexStats = {
  /** Distinct pools currently held (`pools.size`). */
  pools: number
  /** Directed adjacency relationships (`link` writes two per pool — A->B and B->A — so this is
   * `2 * <undirected pool-edges>` at steady state, not a pool count). The single largest driver of
   * the ~3.1 KB/pool growth this type exists to make visible. */
  adjacencyEdges: number
  /** Distinct `${protocol}:${scope}` scan-coverage cache keys — one per distinct endpoint or
   * {@link PoolIndex.pairScope} a caller has ever asked this index to cover. */
  coverageScopes: number
  /** Distinct blocks currently retained in the negative cache — bounded by {@link NEGATIVE_CACHE_BLOCKS}
   * regardless of how many pools have ever failed a quote (see {@link PoolIndex.markNegative}).
   * Formerly the test-only `negativeCacheBlockCount()` accessor, folded in here (C4-H5). */
  negativeCacheBlocks: number
  /** Distinct `${protocol}:${factory}` keys with recorded enabled fee tiers. */
  enabledFeeFactories: number
}

export class PoolIndex {
  /**
   * Exposed (not private) so a caller injecting a pre-built index into `createRouter({ index })` can
   * be validated against the target manifest before it is used for anything — a mismatched
   * wrappedNative would silently collapse native-family adjacency onto the wrong graph node. See
   * `router.ts#createRouter`'s injection check.
   */
  readonly wrappedNative: Address

  /**
   * The tip overlap {@link uncovered} re-opens — see {@link PoolIndexOptions.reorgOverlapBlocks}.
   * Exposed for the same reason `wrappedNative` is: `createRouter({ index })` validates an injected
   * index against the target manifest before using it, and an index built with a different overlap
   * has a coverage cache whose tip was maintained under a different reorg assumption.
   */
  readonly reorgOverlapBlocks: bigint

  /** `PoolRef.id` -> merged record. */
  private readonly pools = new Map<string, PoolRecord>()

  /** graph node -> (graph node -> pool keys). Symmetric adjacency for pair()/neighbors(). */
  private readonly adjacency = new Map<string, Map<string, Set<string>>>()

  /** `${protocol}:${scope}` -> merged, sorted, disjoint covered ranges. */
  private readonly coverage = new Map<string, BlockRange[]>()

  /**
   * `block` -> set of pool ids marked negative AT that block. Keyed by block first (not by pool),
   * so eviction in {@link markNegative} is a bounded scan over the (small) set of distinct blocks
   * ever marked, never over the number of pools that have ever failed a quote.
   *
   * Previously `Map<PoolRef.id, Set<bigint>>`: a pool's entry, once created, was never removed, so
   * the per-block sets only ever grew for the lifetime of the process — "block-scoped" was a key
   * on each entry, not a lifetime for the map. On a busy server quoting many distinct pools across
   * many blocks that is unbounded memory growth (measured ~136 B/entry — on the order of 590 MB/
   * month). {@link markNegative} now evicts every block older than {@link NEGATIVE_CACHE_BLOCKS}
   * behind the one it is about to write, on every call, so this map never holds more than a
   * handful of blocks' worth of pool ids regardless of how long the process runs.
   */
  private readonly negative = new Map<bigint, Set<string>>()

  /** `${protocol}:${factory}` -> fee tiers the factory has enabled (v3's governance-extensible set). */
  private readonly fees = new Map<string, Set<number>>()

  /** Bound on `pools.size` from {@link PoolIndexOptions.maxPools}; `undefined` is unbounded. */
  private readonly maxPools?: number | undefined

  /**
   * `PoolRef.id` -> the block it was last TOUCHED at (see {@link touch}) — upsert, a successful
   * quote, or a failed one. Read only by {@link evictIfNeeded}, and only when {@link maxPools} is
   * set: an unbounded index never evicts, so it never needs to know which pool is oldest. A pool
   * absent from this map (a hint or factory-probe record upserted with no block information at all,
   * and never yet quoted) has never been touched — the sentinel `-1n` used in {@link evictIfNeeded}
   * sorts it before every real block number, so it is the first thing evicted under pressure, which
   * is the right default: nothing has demonstrated it is worth keeping yet.
   */
  private readonly lastTouched = new Map<string, bigint>()

  /**
   * What the endpoint behind this index has taught the scanner about `eth_getLogs` window widths —
   * see {@link ScanWidthMemory}, which owns the semantics.
   *
   * IT LIVES HERE BECAUSE THIS IS WHERE THE OTHER SCAN BOOKKEEPING LIVES. It is not pool data, and
   * on a first read it does not belong on a pool index at all — but {@link coverage} is not pool
   * data either, and the two answer the same question from opposite ends: coverage is WHICH blocks a
   * scan can skip, this is HOW WIDE a request for the rest of them may be. Both are learned by
   * scanning, both are worthless to re-derive, and both need to reach the next process by the same
   * route, so putting them anywhere else would mean a second snapshot with a second lifetime.
   *
   * Handed out by reference (see {@link scanWidth}) rather than copied: the scanner updates it in
   * place as it learns, which is the whole mechanism.
   */
  private readonly scanWidthMemory: ScanWidthMemory = {}

  constructor(wrappedNative: Address, options?: PoolIndexOptions) {
    this.wrappedNative = wrappedNative
    this.maxPools = options?.maxPools
    this.reorgOverlapBlocks = options?.reorgOverlapBlocks ?? DEFAULT_REORG_OVERLAP_BLOCKS
  }

  /**
   * The live {@link ScanWidthMemory} every scan on this index shares — handed out BY REFERENCE, on
   * purpose: `internal/logScan.ts#scanLogs` reads its starting width from it and writes back what it
   * learned, so a copy would make each scan's discovery invisible to the next and defeat the point.
   *
   * There is exactly one per index, i.e. one per router, i.e. (in practice) one per endpoint, which
   * is the scope the fact is true at. A caller sharing one index across two DIFFERENT endpoints —
   * nothing prevents it, and `cli/cache.ts` shares a snapshot between providers on the same chain by
   * design — gets the narrower endpoint's hint as the wider one's starting guess, which costs the
   * regrowth ratchet a few doublings and nothing else. That tolerance is exactly why only the hint
   * and not the declared cap survives {@link toSnapshot}.
   */
  scanWidth(): ScanWidthMemory {
    return this.scanWidthMemory
  }

  private link(nodeA: string, nodeB: string, key: string): void {
    for (const [from, to] of [
      [nodeA, nodeB],
      [nodeB, nodeA],
    ] as const) {
      let edges = this.adjacency.get(from)
      if (!edges) {
        edges = new Map()
        this.adjacency.set(from, edges)
      }
      let keys = edges.get(to)
      if (!keys) {
        keys = new Set()
        edges.set(to, keys)
      }
      keys.add(key)
    }
  }

  /** The inverse of {@link link} for exactly one direction — used only by {@link evictPool}, which
   * calls it twice (A->B and B->A) the same way `link` writes both directions on insert. Prunes the
   * now-empty inner/outer map entries too, so an evicted pool leaves no empty scaffolding behind for
   * `neighbors()` to iterate over forever. */
  private unlink(from: string, to: string, key: string): void {
    const edges = this.adjacency.get(from)
    const keys = edges?.get(to)
    if (!keys) return
    keys.delete(key)
    if (keys.size === 0) edges!.delete(to)
    if (edges!.size === 0) this.adjacency.delete(from)
  }

  /** Records `id` as touched at `block`, keeping the LATEST block seen (a search pins blocks
   * monotonically in steady state, but nothing here depends on that — a lower/duplicate block is
   * simply not an improvement). A `block` of `undefined` (no block information available at the call
   * site) leaves any existing touch alone rather than erasing it. */
  private touch(id: string, block: bigint | undefined): void {
    if (block === undefined) return
    const existing = this.lastTouched.get(id)
    if (existing === undefined || block > existing) this.lastTouched.set(id, block)
  }

  /** Removes `id` entirely: the pool record, its touch history, and both directions of its adjacency
   * link. Nothing else references a pool by id (the negative cache is keyed by block first and
   * already self-evicts — see {@link markNegative} — and the fee-tier cache is keyed by factory, never
   * by pool), so this is the whole cleanup an eviction needs to leave no dangling reference behind. */
  private evictPool(id: string): void {
    const rec = this.pools.get(id)
    if (!rec) return
    this.pools.delete(id)
    this.lastTouched.delete(id)
    const [c0, c1] = rec.pool.currencies
    const nodeA = toGraphNode(c0, this.wrappedNative)
    const nodeB = toGraphNode(c1, this.wrappedNative)
    this.unlink(nodeA, nodeB, id)
    this.unlink(nodeB, nodeA, id)
  }

  /**
   * Enforces {@link maxPools} after a NEW pool has just been inserted (the only way `pools.size`
   * grows — {@link markSuccess}/{@link markNegative} only ever touch an existing record). A no-op
   * when `maxPools` is `undefined` (the default, unbounded).
   *
   * Eviction is a plain O(n) scan over every pool for its `lastTouched` entry, picking the lowest
   * (untouched pools sort first via the `-1n` sentinel — see {@link lastTouched}'s docstring) and
   * repeating until back at or under the cap. That is deliberately not indexed by recency: eviction
   * only runs when the cap is actually exceeded, which — per {@link PoolIndexOptions.maxPools}'s
   * docstring — is meant to be rare relative to the steady stream of upserts/touches a busy router
   * generates, so paying O(n) on the rare event is cheaper than maintaining a sorted structure on
   * every touch just to make the rare event O(log n).
   *
   * `currentBlock` is the block the triggering upsert itself named (its `createdAtBlock` /
   * `lastQuoteSuccessBlock` / `lastQuoteFailureBlock` — whichever {@link touch} used) — NEVER evicted,
   * however far over cap that leaves the index, because a pool touched at the same block as the one
   * that just pushed the index over the line is, by construction, part of what the CURRENT search
   * just proved useful. If every remaining pool is protected this way the loop simply stops (`victim`
   * stays `undefined`) rather than violate that rule to satisfy the cap.
   *
   * DISCREDITED HINTS ARE THE LAST RESORT, NOT AN ORDINARY CANDIDATE (reviewer follow-up to C4-H5).
   * A {@link isDiscredited} record is exactly the accumulated evidence that
   * {@link HINT_DISCREDIT_FAILURE_BLOCKS} failed blocks were needed to establish — evicting it throws
   * that history away, and a caller that resubmits the same junk hint afterward gets it back in at
   * FULL, un-discredited rank (`upsert` has no record of the past to merge against anymore). The
   * record itself is tiny (a handful of scalar fields, no adjacency of its own worth preserving
   * beyond the one entry), so among eligible (unprotected) pools this method always prefers to evict
   * a non-discredited one first, and only reaches for a discredited one when no other candidate is
   * eligible at all.
   */
  private evictIfNeeded(currentBlock: bigint | undefined): void {
    if (this.maxPools === undefined) return
    while (this.pools.size > this.maxPools) {
      let victim: string | undefined
      let victimTouch = 0n
      let discreditedVictim: string | undefined
      let discreditedVictimTouch = 0n
      for (const [id, rec] of this.pools) {
        const touched = this.lastTouched.get(id) ?? -1n
        if (currentBlock !== undefined && touched === currentBlock) continue // protected: touched THIS block
        if (isDiscredited(rec)) {
          if (discreditedVictim === undefined || touched < discreditedVictimTouch) {
            discreditedVictim = id
            discreditedVictimTouch = touched
          }
          continue
        }
        if (victim === undefined || touched < victimTouch) {
          victim = id
          victimTouch = touched
        }
      }
      // Prefer the ordinary eviction candidate; a discredited hint is only reached for when nothing
      // else is eligible (every remaining non-discredited pool is protected, or there are none left).
      const chosen = victim ?? discreditedVictim
      if (chosen === undefined) break // every remaining pool is protected — stop rather than evict one
      this.evictPool(chosen)
    }
  }

  upsert(rec: PoolRecord): void {
    const key = rec.pool.id
    const existing = this.pools.get(key)
    const touchBlock = rec.createdAtBlock ?? rec.lastQuoteSuccessBlock ?? rec.lastQuoteFailureBlock
    if (!existing) {
      this.pools.set(key, rec)
      this.touch(key, touchBlock)
      // The ref's currencies are already in domain form, so a v4 native side arrives as 'native' and
      // collapses onto the wrapped-native graph node rather than linking under address(0).
      const [t0, t1] = rec.pool.currencies
      this.link(toGraphNode(t0, this.wrappedNative), toGraphNode(t1, this.wrappedNative), key)
      // Only a NEW pool can push `pools.size` past `maxPools` — a re-upsert of an already-known pool
      // never changes the count, so eviction is checked here and nowhere else.
      this.evictIfNeeded(touchBlock)
      return
    }
    // The failure history is a property of the POOL, not of the record that happened to be merged
    // in, so it survives every re-upsert. Otherwise a discredited hint would be laundered clean by
    // any later `upsert` naming the same pool — including the caller simply re-sending its hint,
    // which is the one thing a hostile caller can do for free.
    //
    // WITH ONE EXCEPTION: an incoming `event` record. That is a pool-creation log — direct evidence
    // that the pool the hint asserted genuinely exists — and it answers the exact question the
    // failure counter was standing in for. Without this, a hinted pool that failed twice before it
    // was funded could never be restored except by quoting successfully, which per
    // {@link isDiscredited} it may not get the chance to do on a pair already at its selection cap.
    // (Scope of trust: `event` records reach the index from the log scanner, and from a caller's own
    // `ingestLogs`/`ingestReceipt` — which this package documents as trusting the caller's log
    // provenance. A caller able to forge a creation log can already inject arbitrary pools at
    // `event` rank directly, so this exception grants it nothing it did not already have.)
    const proved = rec.source === 'event'
    this.pools.set(key, {
      pool: existing.pool,
      createdAtBlock: earliest(existing.createdAtBlock, rec.createdAtBlock),
      source: rank(rec.source) < rank(existing.source) ? rec.source : existing.source,
      lastQuoteSuccessBlock: latest(existing.lastQuoteSuccessBlock, rec.lastQuoteSuccessBlock),
      quoteFailureBlocks: proved ? 0 : Math.max(existing.quoteFailureBlocks ?? 0, rec.quoteFailureBlocks ?? 0),
      lastQuoteFailureBlock: proved ? undefined : latest(existing.lastQuoteFailureBlock, rec.lastQuoteFailureBlock),
    })
    this.touch(key, touchBlock)
  }

  pair(a: CurrencyRef, b: CurrencyRef): PoolRecord[] {
    const nodeA = toGraphNode(a, this.wrappedNative)
    const nodeB = toGraphNode(b, this.wrappedNative)
    const keys = this.adjacency.get(nodeA)?.get(nodeB)
    if (!keys) return []
    return [...keys].map((k) => this.pools.get(k)!)
  }

  neighbors(endpoint: CurrencyRef): Map<string, PoolRecord[]> {
    const node = toGraphNode(endpoint, this.wrappedNative)
    const edges = this.adjacency.get(node)
    const result = new Map<string, PoolRecord[]>()
    if (!edges) return result
    for (const [otherNode, keys] of edges) {
      result.set(
        otherNode,
        [...keys].map((k) => this.pools.get(k)!),
      )
    }
    return result
  }

  /**
   * The coverage scope for an *exact-pair* query — a scan that answers "every pool holding exactly
   * these two currencies", which is strictly narrower than either endpoint's adjacency and must
   * therefore never be confused with it. Family-normalized and sorted (so direction and
   * native/wrapped spelling do not fork the cache) and namespaced so it can never collide with an
   * endpoint address key.
   */
  pairScope(a: CurrencyRef, b: CurrencyRef): string {
    const [n0, n1] = [toGraphNode(a, this.wrappedNative), toGraphNode(b, this.wrappedNative)].sort()
    return `pair:${n0}-${n1}`
  }

  /** `scope` is either a token endpoint's address (adjacency) or a {@link pairScope} string. */
  addCoverage(p: Protocol, scope: string, r: BlockRange): void {
    const key = `${p}:${scope.toLowerCase()}`
    const existing = this.coverage.get(key) ?? []
    this.coverage.set(key, mergeRanges([...existing, r]))
  }

  uncovered(p: Protocol, scope: string, deployBlock: bigint, head: bigint): BlockRange[] {
    const key = `${p}:${scope.toLowerCase()}`
    const covered = this.coverage.get(key) ?? []

    // Clip covered ranges to the requested domain [deployBlock, head]; they arrive sorted/disjoint.
    const clipped: BlockRange[] = []
    for (const c of covered) {
      const from = maxBig(c.fromBlock, deployBlock)
      const to = c.toBlock < head ? c.toBlock : head
      if (from <= to) clipped.push({ fromBlock: from, toBlock: to })
    }

    // Raw complement of the clipped covered ranges within the domain.
    const raw: BlockRange[] = []
    let cursor = deployBlock
    let maxCoveredEnd: bigint | undefined
    for (const c of clipped) {
      if (c.fromBlock > cursor) raw.push({ fromBlock: cursor, toBlock: c.fromBlock - 1n })
      cursor = maxBig(cursor, c.toBlock + 1n)
      maxCoveredEnd = maxCoveredEnd === undefined ? c.toBlock : maxBig(maxCoveredEnd, c.toBlock)
    }
    if (cursor <= head) raw.push({ fromBlock: cursor, toBlock: head })

    // Re-open the final `reorgOverlapBlocks` of whatever coverage reaches furthest, regardless
    // of whether it was otherwise covered — shallow reorgs can invalidate the tip at any time.
    if (maxCoveredEnd !== undefined) {
      const reopenFrom = maxBig(maxCoveredEnd - this.reorgOverlapBlocks + 1n, deployBlock)
      if (reopenFrom <= head) raw.push({ fromBlock: reopenFrom, toBlock: head })
    }

    return mergeRanges(raw)
  }

  /**
   * Records fee tiers discovered from a factory's own enablement events. Shares the coverage cache's
   * key space (`protocol:address`) but keyed by *factory*, not by a token endpoint — the two can
   * never collide because a factory is never one of a pool's currencies.
   */
  addEnabledFees(p: Protocol, factory: string, fees: number[]): void {
    const key = `${p}:${factory.toLowerCase()}`
    let set = this.fees.get(key)
    if (!set) {
      set = new Set()
      this.fees.set(key, set)
    }
    for (const fee of fees) set.add(fee)
  }

  /** Fee tiers discovered for `factory` so far, ascending (empty until a fee scan has run). */
  enabledFees(p: Protocol, factory: string): number[] {
    return [...(this.fees.get(`${p}:${factory.toLowerCase()}`) ?? [])].sort((a, b) => a - b)
  }

  markSuccess(ref: PoolRef, block: bigint): void {
    const key = ref.id
    const existing = this.pools.get(key)
    if (!existing) return
    this.pools.set(key, { ...existing, lastQuoteSuccessBlock: latest(existing.lastQuoteSuccessBlock, block) })
    this.touch(key, block)
  }

  /**
   * Marks `ref` unquoteable at `block`. Evicts stale history first (see {@link evictNegativeBefore})
   * so the cache's size is bounded on every write, not just eventually swept — a caller that never
   * calls `markNegative` again after a burst pays nothing extra, but also never gets to rely on a
   * background sweep it never triggered.
   *
   * Deliberately amount-independent AT THIS LAYER: it is the caller's job (see the pump's
   * reverted-measurement handling, `search/pump.ts`) to only mark a pool negative for a failure shape that is
   * itself amount-independent (an empty-data revert — the pool-absent shape). This method has no
   * way to know why the caller decided to mark, so it does not gate on amount at all; it only bounds
   * *how long* a mark can possibly outlive its evidence.
   *
   * `ref` is not required to already be in the index — a hypothesis the pump measured can fail
   * before anything ever `upsert`s it — so the touch it records for eviction purposes
   * is gated on the pool actually being indexed: touching (or worse, creating a `lastTouched` entry
   * for) an id `pools` has never heard of would itself be exactly the kind of key that never gets
   * cleaned up, since {@link evictPool} only ever runs for ids `pools` contains.
   */
  markNegative(ref: PoolRef, block: bigint): void {
    this.recordQuoteFailure(ref, block)
    this.evictNegativeBefore(block)
    let ids = this.negative.get(block)
    if (!ids) {
      ids = new Set()
      this.negative.set(block, ids)
    }
    ids.add(ref.id)
    if (this.pools.has(ref.id)) this.touch(ref.id, block)
  }

  /**
   * Touches every pool in `refs` at `block` in one call — for the pump's planning step
   * (`search/pump.ts`), which touches every pool it plans a leg for *before* anything is quoted,
   * let alone quoted successfully.
   *
   * WHY THIS EXISTS (reviewer follow-up to C4-H5). `upsert`/`markSuccess`/`markNegative` all key a
   * touch to a measurement's OUTCOME — inserted, priced, priced and failed. A pool alive only as a
   * two-hop intermediate leg can be planned by every single search that runs against its pair and,
   * cut short by an abort or the pair ceiling, never once hit any of those three. Under `maxPools`
   * that pool was evictable despite being exactly the kind of pool the cap exists to keep — one
   * this router's own searches keep finding useful. Being planned as a leg IS evidence the pool is
   * worth keeping, independent of whether that particular measurement later succeeds or fails.
   *
   * Refs not currently indexed are silently skipped (mirrors `markNegative`'s same guard) — nothing
   * here upserts a pool that is not already known.
   */
  touchAll(refs: PoolRef[], block: bigint): void {
    for (const ref of refs) {
      if (this.pools.has(ref.id)) this.touch(ref.id, block)
    }
  }

  isNegative(ref: PoolRef, block: bigint): boolean {
    return this.negative.get(block)?.has(ref.id) ?? false
  }

  /**
   * The durable half of {@link markNegative}: the negative cache itself is deliberately forgotten
   * within a couple of blocks (a pool that could not quote at block N says nothing about N+1), but
   * "this pool has never once quoted, across N separate blocks" is a fact that only accumulates by
   * outliving individual blocks. Kept as a COUNT plus the last block seen, so repeated failures at
   * one block (concurrent requests at the same head, a wave re-quoting) count once and the memory
   * cost is two fields, not a growing set.
   *
   * PRECISELY: this counts blocks at which the failing block CHANGED, which is not the same as the
   * number of distinct blocks — N, N+1, N counts three. That approximation is sound only because
   * the single threshold reading it is {@link HINT_DISCREDIT_FAILURE_BLOCKS} = 2, where the two
   * measures cannot disagree about whether the bar is met; see that constant for why raising it
   * requires a real distinct-block set instead.
   *
   * Only ever consumed for hinted pools ({@link isDiscredited}); recorded for all of them because
   * the counter is two fields either way and a pool's `source` can be upgraded to `hint` by a later
   * upsert, which must not resurrect an already-contradicted key.
   */
  private recordQuoteFailure(ref: PoolRef, block: bigint): void {
    const existing = this.pools.get(ref.id)
    if (!existing) return
    if (existing.lastQuoteFailureBlock === block) return
    this.pools.set(ref.id, {
      ...existing,
      quoteFailureBlocks: (existing.quoteFailureBlocks ?? 0) + 1,
      lastQuoteFailureBlock: block,
    })
  }

  /**
   * Drops every negative-cache entry older than {@link NEGATIVE_CACHE_BLOCKS} behind `newBlock`.
   * Run on every {@link markNegative} call rather than on a timer or a separate sweep method: a
   * search pins blocks close to monotonically (the head watermark in `search/loop.ts` only ever
   * regresses across a lagging-replica hiccup, and self-heals even then), so in steady state this is
   * a handful of `Map` key deletions per call — never a scan whose cost grows with how many pools
   * have ever failed, which is what made the un-evicted map unbounded in the first place.
   */
  private evictNegativeBefore(newBlock: bigint): void {
    const threshold = newBlock - NEGATIVE_CACHE_BLOCKS
    for (const block of this.negative.keys()) {
      if (block < threshold) this.negative.delete(block)
    }
  }

  /**
   * A sizes-only snapshot of everything this index currently holds — see {@link PoolIndexStats} for
   * what each field means and why it is safe to log on an interval. Not part of routing (no search
   * reads it) — it exists for hosts running a long-lived instance to observe the growth C4-H5 exists
   * to bound, and it subsumes what used to be the test-only `negativeCacheBlockCount()` accessor
   * (`stats().negativeCacheBlocks`).
   */
  stats(): PoolIndexStats {
    let adjacencyEdges = 0
    for (const edges of this.adjacency.values()) adjacencyEdges += edges.size
    return {
      pools: this.pools.size,
      adjacencyEdges,
      coverageScopes: this.coverage.size,
      negativeCacheBlocks: this.negative.size,
      enabledFeeFactories: this.fees.size,
    }
  }

  /**
   * Everything this index knows that outlives the process, in a shape {@link serializeSnapshot} can
   * write to disk — see {@link PoolIndexSnapshot} for what is included, what is not, and why.
   *
   * A SHALLOW copy of the records, deliberately. `PoolRecord` is treated as immutable everywhere in
   * this class (`upsert`/`markSuccess`/`recordQuoteFailure` all replace the map entry with a fresh
   * object rather than mutating the stored one), so sharing the record objects with a snapshot costs
   * nothing and cannot be observed. The container arrays ARE fresh, so a caller holding a snapshot
   * does not hold a live view of an index that keeps changing under it.
   */
  toSnapshot(): PoolIndexSnapshot {
    return {
      schemaVersion: POOL_INDEX_SCHEMA_VERSION,
      wrappedNative: this.wrappedNative,
      reorgOverlapBlocks: this.reorgOverlapBlocks,
      pools: [...this.pools.values()],
      coverage: [...this.coverage].map(([key, ranges]) => [key, [...ranges]]),
      enabledFees: [...this.fees].map(([key, tiers]) => [key, [...tiers].sort((a, b) => a - b)]),
      // The HINT only — never `declaredScanCap`. See {@link PoolIndexSnapshot} and
      // {@link ScanWidthMemory} for why one of the two fields may cross a process boundary and the
      // other may not. Absent when nothing has been scanned yet, so an index that never ran a scan
      // still round-trips to the same snapshot it always did.
      ...(this.scanWidthMemory.learnedScanWidth !== undefined && {
        learnedScanWidth: this.scanWidthMemory.learnedScanWidth,
      }),
    }
  }

  /**
   * Rebuilds an index from a {@link PoolIndexSnapshot}. The inverse of {@link toSnapshot} for every
   * question the index can be asked (`pair`, `neighbors`, `uncovered`, `enabledFees`) — see
   * `poolIndex.test.ts`'s round-trip property.
   *
   * VALIDATES `schemaVersion` AND THE SHAPE, then stops. The version check is the one a caller cannot
   * make for itself (it is a fact about this file, not about their chain). The shape check
   * ({@link assertSnapshotShape}) exists because the alternative is not "a slightly wrong index" but a
   * BOOBY-TRAPPED one: a snapshot whose coverage bound deserialized as the string `'abc'` instead of a
   * bigint restores perfectly happily and then throws deep inside `uncovered`'s comparisons, mid-search,
   * with a stack that names none of this. Anything that arrives structurally wrong must fail HERE,
   * where the caller's answer is "discard it and start fresh", not three layers down where it is a
   * crash.
   *
   * IT IS A SHAPE CHECK, NOT A TRUST BOUNDARY. It asserts that what came back is the kind of thing the
   * class can operate on — bigints where bigints go, strings where keys go, arrays where arrays go —
   * and nothing about whether the CONTENT is true. A snapshot can still assert a pool that does not
   * exist or coverage of blocks nobody scanned; see `cli/cache.ts`'s trust-boundary note for why that
   * residual is accepted and what bounds it.
   *
   * The two CHAIN facts are still validated where they can be compared against something:
   * `createRouter({ index })` rejects an index that disagrees with its manifest, and it does so for
   * indexes built by hand exactly as for indexes restored from here.
   *
   * `options.maxPools` is the RESTORING host's bound on its own memory — not a property of the
   * snapshot, which is why it is not stored in one. Supplying it here means the eviction pass runs as
   * the pools go back in, so restoring an oversized snapshot into a bounded index trims rather than
   * blows past the cap. (Note the LRU clock is reconstructed from record blocks — see
   * {@link PoolIndexSnapshot} — so which pools a restore-time eviction picks is approximate.)
   */
  static fromSnapshot(snap: PoolIndexSnapshot, options?: Pick<PoolIndexOptions, 'maxPools'>): PoolIndex {
    assertSnapshotShape(snap)
    const index = new PoolIndex(snap.wrappedNative, {
      reorgOverlapBlocks: snap.reorgOverlapBlocks,
      ...(options?.maxPools !== undefined && { maxPools: options.maxPools }),
    })
    // `upsert` rather than a direct map write, so adjacency, the LRU clock and any `maxPools`
    // eviction are all built by the same code path a live insert uses — a restored index is not a
    // second, parallel construction of the class's invariants that could drift from the first.
    for (const rec of snap.pools) index.upsert(rec)
    for (const [key, ranges] of snap.coverage) index.coverage.set(key, mergeRanges([...ranges]))
    for (const [key, tiers] of snap.enabledFees) index.fees.set(key, new Set(tiers))
    if (snap.learnedScanWidth !== undefined) index.scanWidthMemory.learnedScanWidth = snap.learnedScanWidth
    return index
  }
}
