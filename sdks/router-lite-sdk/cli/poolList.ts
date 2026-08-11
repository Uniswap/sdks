// ---------------------------------------------------------------------------
// POOL LISTS — a `PoolIndexSnapshot` that travels between STRANGERS.
//
// WHAT THIS IS, IN ONE LINE. `cli/cache.ts` already carries a snapshot across a
// PROCESS boundary (the same machine, the same user, the same endpoint family).
// A pool list carries the same bytes across an ORGANIZATION boundary — a CI job
// publishes one, someone else's laptop consumes it — and the only thing that
// changes when you cross that boundary is who you are trusting. So this file is
// not a new data format; it is a TRUST ENVELOPE around the format the SDK
// already has, plus the curation rule that keeps a published list honest.
//
// THE TWO HALVES OF A SNAPSHOT ARE NOT EQUALLY SAFE TO IMPORT.
//
//   * POOLS are self-verifying downstream. Every pool a list asserts is priced
//     by a real `eth_call` at a pinned block before it can appear in a result
//     (`cli/cache.ts`'s "a quote is a probe, not a belief"), and a pool that
//     keeps failing loses its rank (`isDiscredited`). A hostile list buys
//     wasted `eth_call`s, not a wrong price.
//   * COVERAGE is a CLAIM THAT SUPPRESSES WORK. "blocks A..B of this scope have
//     been scanned" makes the next search skip A..B. A list that lies here does
//     not invent a pool, it HIDES one, and the symptom is a worse route with
//     nothing anywhere saying why. `cli/cache.ts` names this exact residual and
//     accepts it for a file the user's own machine wrote. Across an
//     organization boundary it is not acceptable by default.
//
// HENCE THE TIERS. Tier A (a list you are willing to name as first-party —
// today that means you passed `--trust-coverage`, in phase 2 it means a
// signature this tool checked) imports pools AND coverage. Tier B — anything
// else, which is the DEFAULT for every list — imports POOLS ONLY and throws the
// coverage away. Tier B is still worth a great deal: the pools are the part
// that takes a full-history `eth_getLogs` sweep to re-derive per pair, and a
// Tier B consumer re-scans the block ranges anyway, so it can only ever find
// MORE than the list knew, never less.
//
// THE CURATION RULE, WHICH IS THE ONLY THING THE PUBLISHER MUST GET RIGHT:
// A LIST MAY CLAIM COVERAGE ONLY FOR SCOPES WHOSE POOL SET IT KEPT IN FULL.
// This is `cli/cache.ts`'s "COVERAGE AND POOLS ARE INSEPARABLE" invariant with
// the stakes raised. There it explains why an over-large cache is SKIPPED
// rather than truncated; here the same fact makes a plausible-looking
// optimization — "ship the top 5,000 pools, keep the coverage, the list is
// smaller and the consumer still skips the scan" — into a silent, permanent
// hole in the consumer's index: coverage says the range is done, so the scan
// that would have found the other 645,000 pools never runs again. It is
// therefore enforced as an ASSERTION that FAILS THE BUILD
// ({@link assertPoolsCoverageInseparable}), not as a convention the publisher
// is trusted to remember.
//
// STALENESS IS NOT A FAILURE MODE HERE EITHER, for exactly `cli/cache.ts`'s
// reason: coverage is BLOCK-RANGED. A six-month-old list claims to have scanned
// up to block N, so the consumer's `uncovered()` asks the chain for N+1..head
// plus the standing reorg overlap. An old list is a bigger delta scan, never a
// wrong answer. That is why there is no TTL and no expiry field.
//
// WHAT PHASE 2 ADDS (and what this file deliberately does not do): a 'list'
// provenance tier on `PoolRecord` so a consumer can tell an imported pool from
// one it discovered; a real merge API inside the SDK instead of the CLI-side
// hydration below; and detached signatures, which is what finally lets Tier A
// be decided by cryptography rather than by the operator typing a flag.
// ---------------------------------------------------------------------------

import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'

import {
  decodeFunctionResult,
  encodeFunctionData,
  encodePacked,
  keccak256,
  pad,
  parseAbi,
  toHex,
  type Address,
  type Hex,
  type PublicClient,
} from 'viem'

import {
  aggregateCalls,
  ethCall,
  mapConcurrent,
  MULTICALL3_ADDRESS,
  parseSnapshot,
  PoolIndex,
  serializeSnapshot,
  toGraphNode,
  type PoolIndexSnapshot,
} from '../src/experimental/index'
import { PROTOCOLS, type ChainManifest, type PoolRecord, type Protocol } from '../src/index'
// deep import: deliberately unblessed, it is `PoolIndex.fromSnapshot`'s own shape-assertion
// internal — exported from `pools/poolIndex.ts` (see that function's own docstring) so an
// untrusted list can be GATED without being RESTORED, but never re-exported from
// `../src/experimental/index`. A shape-assertion internal is exactly the kind of primitive this
// package's bless list draws the line at (see `experimental/index.ts`'s header).
import { assertSnapshotShape } from '../src/pools/poolIndex'

/**
 * Bumped when the ENVELOPE's shape changes. Independent of
 * {@link import('../src/experimental/index').POOL_INDEX_SCHEMA_VERSION}, which versions the BODY:
 * the two move for different reasons (a new envelope field vs. a change to what a pool record
 * means) and a consumer has to reject on either. There is no migration path for either one, for the
 * reason `poolIndex.ts` gives: the entire content is a cache of re-readable chain state, so
 * discarding it costs a delta scan and is infinitely cheaper than misreading it.
 */
export const POOL_LIST_SCHEMA_VERSION = 1

/**
 * A list that cannot be trusted to mean what it says.
 *
 * DELIBERATELY NOT A `UsageError` (exit 3) AND NOT SILENTLY IGNORED. The flag was used correctly —
 * the user named a list and meant it — so this is not a usage mistake to be corrected; and a run
 * that quietly continued without the list would produce a legitimate-looking answer computed from a
 * different index than the one the operator asked for, which is the one outcome a testing tool must
 * never have. `rl.ts` maps it to exit 4 as a single clear line (no stack).
 */
export class PoolListError extends Error {}

/**
 * The deployment facts a snapshot's contents are expressed IN TERMS OF: which factory's creation
 * logs a coverage range refers to, and from which block "the whole history" was measured.
 *
 * WHY THESE AND NOT A HASH OF THE WHOLE MANIFEST. A manifest carries plenty that a pool list is
 * indifferent to — the Universal Router deployment, Permit2, the command set, block time. Changing
 * any of those invalidates nothing about which pools exist. What DOES invalidate a list is a
 * different factory (its coverage ranges then describe scans of a contract this consumer will never
 * read) or a different deployment block (its "covered from the beginning" claim starts at the wrong
 * beginning). Fingerprinting the whole manifest would reject lists for reasons that do not matter,
 * which trains people to pass whatever the phase-2 equivalent of `--force` is.
 *
 * Addresses are lowercased and blocks are decimal strings — see {@link PoolListEnvelope} for why the
 * envelope keeps bigints as strings rather than using the body's `$bigint:` tagging.
 */
export type ManifestFingerprint = {
  v2?: { factory: string; deploymentBlock: string }
  v3?: { factory: string; deploymentBlock: string }
  v4?: { poolManager: string; deploymentBlock: string }
}

/**
 * A published pool list: metadata a human reads, an integrity hash, and the snapshot body.
 *
 * THE BODY IS NESTED, NOT SPLICED FLAT, because `integrity` has to name a well-defined byte range.
 * "sha256 of the body" is only a sentence if the body IS something; with `pools`/`coverage`/
 * `enabledFees` scattered at the top level next to metadata, every consumer would have to
 * re-implement the same canonical-JSON ritual to decide which bytes were hashed, and any two
 * implementations that disagree produce a list that verifies in one tool and not the other.
 *
 * THE CANONICAL FORM IS THE SDK'S OWN SERIALIZER. `integrity` is the sha256 of
 * `serializeSnapshot(body)` — the exact function `cli/cache.ts` writes cache files with, so there is
 * one bigint-encoding decision in this package rather than two. A verifier recovers those bytes as
 * `JSON.stringify(envelope.body)`: `JSON.parse` preserves key insertion order for every key a
 * snapshot contains (all alphabetic — no numeric-looking keys, which are the one thing a JS object
 * reorders), so the round trip is byte-exact. `poolList.test.ts` pins that with a property test.
 *
 * `wrappedNative` AND `reorgOverlapBlocks` APPEAR TWICE ON PURPOSE — here, where a human skimming
 * the file can see them without decoding the body, and inside the body, where they are load-bearing
 * for the index. Only the body's copy is under `integrity`, so {@link verifyPoolList} cross-checks
 * the two: a mismatch means the envelope was edited and is rejected, which turns the duplication
 * from a hazard into a second check.
 */
export type PoolListEnvelope = {
  schemaVersion: number
  chainId: number
  /**
   * How far this list's coverage REACHES — see {@link asOfBlockOf}, which computes it.
   *
   * A REACH, NOT A GUARANTEE ABOUT EVERYTHING BELOW IT. This used to read "the block up to which
   * every coverage scope this list claims is covered", which is more than the number knows: a scope's
   * ranges may have HOLES (a scan cut short by a budget leaves two ranges with a gap between them),
   * and taking each scope's furthest-reaching range says nothing about them. The body's own per-scope
   * ranges are the complete statement of what was scanned, and they are what a consumer's
   * `uncovered()` reads; this field exists so a human can judge staleness from `head -12` without
   * downloading the other 300 MB.
   */
  asOfBlock: string
  /** ISO-8601, informational only: staleness is decided by `asOfBlock`, never by wall-clock time. */
  asOfTimestamp: string
  manifestFingerprint: ManifestFingerprint
  wrappedNative: string
  reorgOverlapBlocks: string
  /** sha256, hex, of `serializeSnapshot(body)` — see this type's note on the canonical form. */
  integrity: string
  /** A {@link PoolIndexSnapshot} with its bigints `$bigint:`-tagged (i.e. `JSON.parse(serializeSnapshot(snap))`). */
  body: unknown
}

function sha256(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex')
}

/** The fingerprint {@link verifyPoolList} compares a list against — see {@link ManifestFingerprint}. */
export function fingerprintOf(manifest: ChainManifest): ManifestFingerprint {
  const fp: ManifestFingerprint = {}
  if (manifest.v2) {
    fp.v2 = { factory: manifest.v2.factory.toLowerCase(), deploymentBlock: manifest.v2.deploymentBlock.toString() }
  }
  if (manifest.v3) {
    fp.v3 = { factory: manifest.v3.factory.toLowerCase(), deploymentBlock: manifest.v3.deploymentBlock.toString() }
  }
  if (manifest.v4) {
    fp.v4 = { poolManager: manifest.v4.poolManager.toLowerCase(), deploymentBlock: manifest.v4.deploymentBlock.toString() }
  }
  return fp
}

/**
 * The block a list is "as of": the MINIMUM, over every coverage scope it claims, of how far that
 * scope's coverage reaches.
 *
 * THE MINIMUM, NOT THE MAXIMUM, AND NOT THE HEAD AT BUILD TIME. This number is what a consumer would
 * use to reason about how big its delta scan will be, and a list is only as current as its LEAST
 * current claim: reporting the head (or the furthest-reaching scope) would describe a list whose v2
 * coverage stopped a million blocks ago as fully current. A list claiming no coverage at all has no
 * scope to be behind on and reports `0n`.
 *
 * IT DOES NOT SEE HOLES, and is not meant to. Within one scope it takes the furthest `toBlock`,
 * so a scope covering 1..100 and 1000..2000 reaches 2000 even though 101..999 was never scanned.
 * Deciding what a gapped scope is "covered up to" would need a start block no snapshot records, and
 * nothing consumes this number to skip work — `uncovered()` reads the ranges themselves, hole by
 * hole. See {@link PoolListEnvelope.asOfBlock} for what the published field therefore does and does
 * not promise.
 */
export function asOfBlockOf(coverage: PoolIndexSnapshot['coverage']): bigint {
  let min: bigint | undefined
  for (const [, ranges] of coverage) {
    let reach = 0n
    for (const r of ranges) if (r.toBlock > reach) reach = r.toBlock
    if (min === undefined || reach < min) min = reach
  }
  return min ?? 0n
}

// ---------------------------------------------------------------------------
// Coverage scope keys.
//
// `PoolIndex` stores coverage under `${protocol}:${scope}`, where `scope` is
// either a token endpoint's lowercased address (an ADJACENCY scan: "every pool
// holding this token") or a `pair:<node0>-<node1>` string (an EXACT-PAIR scan,
// strictly narrower). Curation and hydration both have to take those keys apart
// — one to decide which pools a claimed scope obliges the list to keep, the
// other to hand the pieces back to `addCoverage` — so the split lives here once.
// ---------------------------------------------------------------------------

export type CoverageScope = { protocol: Protocol; scope: string }

/** Splits a `${protocol}:${scope}` coverage key, or `undefined` for a key no protocol owns. */
export function splitCoverageKey(key: string): CoverageScope | undefined {
  const colon = key.indexOf(':')
  if (colon < 0) return undefined
  const protocol = key.slice(0, colon)
  if (!(PROTOCOLS as readonly string[]).includes(protocol)) return undefined
  return { protocol: protocol as Protocol, scope: key.slice(colon + 1) }
}

/** The two graph nodes a pool sits between, native-folded and lowercased exactly as `PoolIndex` does. */
function nodesOf(rec: PoolRecord, wrappedNative: Address): [Address, Address] {
  const [a, b] = rec.pool.currencies
  return [toGraphNode(a, wrappedNative), toGraphNode(b, wrappedNative)]
}

/**
 * Whether `rec` is one of the pools a scan of `scope` would have found — the membership rule the
 * inseparability assertion is stated in terms of.
 *
 * Mirrors the two scan shapes `PoolIndex` distinguishes: an ADJACENCY scope (a bare token address)
 * covers every pool with that token on either side; a PAIR scope (`pair:n0-n1`, sorted — see
 * `PoolIndex.pairScope`) covers only pools holding exactly those two. The protocol has to match too:
 * `v3:0xweth` says v3's factory logs were scanned for WETH, and says nothing at all about v2's.
 */
export function poolInScope(rec: PoolRecord, key: CoverageScope, wrappedNative: Address): boolean {
  if (rec.pool.protocol !== key.protocol) return false
  const [n0, n1] = nodesOf(rec, wrappedNative)
  if (key.scope.startsWith('pair:')) {
    const [p0, p1] = [n0, n1].sort()
    return key.scope === `pair:${p0}-${p1}`
  }
  const node = key.scope.toLowerCase()
  return n0 === node || n1 === node
}

/**
 * THE BUILD-FAILING CHECK. Every pool the publisher knew about that falls inside a scope the list
 * CLAIMS coverage for must still be in the list's pool set.
 *
 * WHY AN ASSERTION AND NOT A CONVENTION. Violating this does not produce a smaller list with a
 * smaller benefit — it produces a consumer whose index is permanently, silently wrong about the
 * violated scope: the coverage claim makes `uncovered()` skip the range forever, so the dropped
 * pools are not merely absent from the list, they become unreachable by any future scan on that
 * consumer's machine (short of deleting its cache). Nothing downstream can detect it — detecting it
 * means running the scan the coverage exists to avoid — so the only place it can ever be caught is
 * here, at build time, where the publisher still holds both sides of the comparison.
 *
 * The message names the scope and one offending pool: a curation bug is almost always one scope's
 * membership rule being subtly wrong, and one example is enough to see which.
 */
export function assertPoolsCoverageInseparable(args: {
  /** Everything the publisher knew — the un-curated source snapshot. */
  source: PoolIndexSnapshot
  /** The coverage keys the list will claim. */
  claimedKeys: string[]
  /** `PoolRef.id`s the list keeps. */
  keptPoolIds: ReadonlySet<string>
  wrappedNative: Address
}): void {
  const { source, claimedKeys, keptPoolIds, wrappedNative } = args
  for (const key of claimedKeys) {
    const scope = splitCoverageKey(key)
    if (!scope) {
      throw new PoolListError(
        `pool list would claim coverage under '${key}', which names no known protocol — refusing to publish a claim nothing can interpret`,
      )
    }
    for (const rec of source.pools) {
      if (!poolInScope(rec, scope, wrappedNative)) continue
      if (keptPoolIds.has(rec.pool.id)) continue
      throw new PoolListError(
        `pools/coverage inseparability violated: the list claims coverage for '${key}' but dropped ${rec.pool.id}, ` +
          'a pool inside that scope. A coverage claim makes the consumer skip the scan forever, so a claimed scope ' +
          'must ship its pool set IN FULL — drop the scope, not the pools (see cli/poolList.ts).',
      )
    }
  }
}

// ---------------------------------------------------------------------------
// Curation.
// ---------------------------------------------------------------------------

/**
 * Fields on a `PoolRecord` that describe THIS PUBLISHER'S ENDPOINT AND CALLERS rather than the
 * chain, and therefore must not travel.
 *
 *  - `source: 'hint'` is downgraded to `'factory'`. A hint means "the caller of the process that
 *    built this asserted the pool exists", and that caller is not the consumer's caller. Left alone
 *    it would enter a stranger's index at the TOP of `SOURCE_PRIORITY`, ahead of every pool that
 *    stranger's own chain reads proved — a caller's private assertion laundered into a third party's
 *    ranking by nothing but a file transfer. `'factory'` is the weakest tier ("something responded
 *    here"), which is the honest description of a republished pool identity.
 *  - The DISCREDIT COUNTERS (`quoteFailureBlocks`, `lastQuoteFailureBlock`) are dropped with it:
 *    they are evidence gathered against a hint by one endpoint at particular blocks, and their only
 *    consumer (`isDiscredited`) only reads them for `'hint'` records, which no longer exist here.
 *  - `lastQuoteSuccessBlock` is dropped for the same reason in the other direction — "this quoted
 *    fine at block N against my provider" is not a fact the consumer should inherit; it will find
 *    out by quoting.
 *
 * `createdAtBlock` STAYS. It is a chain fact (the creation log's block), it is what the LRU clock is
 * rebuilt from on restore, and it is the same for every observer.
 */
export function stripEndpointSpecific(rec: PoolRecord): PoolRecord {
  const source = rec.source === 'hint' ? 'factory' : rec.source
  return {
    pool: rec.pool,
    source,
    ...(rec.createdAtBlock !== undefined ? { createdAtBlock: rec.createdAtBlock } : {}),
  }
}

export type CurateOptions = {
  /** Adjacency scopes to claim — the manifest's core intermediates. Native-folded and lowercased here. */
  coreIntermediates: Address[]
  /**
   * The manifest's factory / pool-manager addresses. These share the coverage cache's key space with
   * token endpoints but are NOT adjacency scopes: they are what the FEE-DISCOVERY scan
   * (`search/coverage.ts#discoverFeeTiers`) records its progress under, and that scan is a full-history
   * sweep of a factory's own `FeeAmountEnabled` logs — expensive, and its result (`enabledFees`) is
   * already published alongside. Claiming the scope is what lets a consumer skip the sweep instead of
   * re-running it to rediscover tiers the list already handed it.
   *
   * INSEPARABILITY HOLDS VACUOUSLY HERE, and not by accident: a factory is never one of a pool's
   * currencies (`PoolIndex.addEnabledFees` relies on exactly that to share the key space safely), so
   * a factory scope contains no pools and there is no pool set to keep in full. The assertion still
   * runs over it — it just has nothing to find.
   */
  factories: Address[]
  wrappedNative: Address
  /** How many `pair:` scopes to claim, ranked by how many pools they hold. */
  topPairs: number
  /**
   * Optional ceiling on the published pool count. Enforced by DROPPING WHOLE SCOPES (largest first)
   * — never by truncating a scope's pool set, which is precisely what
   * {@link assertPoolsCoverageInseparable} exists to forbid. A list that cannot fit even one scope
   * publishes its pools with no coverage at all, which is a perfectly good Tier B list.
   */
  maxPools?: number | undefined
}

export type CurationStats = {
  /** Pools in the source snapshot. */
  sourcePools: number
  /** Pools the list keeps. */
  keptPools: number
  /** Pools dropped because no claimed scope contains them. */
  droppedPools: number
  /** Coverage scopes in the source snapshot. */
  sourceScopes: number
  /** Coverage scopes the list claims (the rest are dropped, pools and all). */
  claimedScopes: string[]
  /** Scopes dropped to satisfy {@link CurateOptions.maxPools}. */
  scopesDroppedForSize: string[]
  /** Hint-sourced records downgraded to `factory` by {@link stripEndpointSpecific}. */
  hintsDowngraded: number
}

/**
 * Turns everything a publisher's index knows into the subset a list may honestly claim.
 *
 * THE ORDER OF OPERATIONS IS THE DESIGN. Scopes are chosen FIRST and the pool set is DERIVED from
 * them — never the other way round. Choosing pools first ("the 50,000 most interesting") and then
 * asking which coverage survives is the shape that produces the silent hole: there is almost always
 * some scope whose pools are *mostly* kept, and the temptation to claim it is exactly the bug. With
 * scopes first, the pool set is whatever those scopes oblige, and
 * {@link assertPoolsCoverageInseparable} can only ever fail if this function has a bug — which is
 * why it is still called, on every build.
 *
 * WHICH SCOPES. The manifest's core intermediates (their adjacency is what every two-hop route in
 * the search is built out of, and it is the single most expensive thing to re-derive) plus the
 * `topPairs` busiest exact-pair scopes. Everything else — one-off adjacency scans for whatever token
 * the publisher happened to be asked about — is dropped: it is narrow, it is not what a stranger is
 * likely to want, and each one drags its whole pool set along.
 */
export function curate(
  source: PoolIndexSnapshot,
  options: CurateOptions,
): { body: PoolIndexSnapshot; stats: CurationStats } {
  const { wrappedNative, topPairs } = options
  const wanted = new Set(options.coreIntermediates.map((a) => toGraphNode(a, wrappedNative)))
  wanted.add(toGraphNode(wrappedNative, wrappedNative))
  for (const factory of options.factories) wanted.add(factory.toLowerCase() as Address)

  // Rank every candidate scope the source actually has coverage for. Adjacency scopes named by the
  // manifest are always eligible; pair scopes compete on pool count.
  const adjacency: string[] = []
  const pairs: { key: string; pools: number }[] = []
  for (const [key] of source.coverage) {
    const scope = splitCoverageKey(key)
    if (!scope) continue
    const count = source.pools.filter((rec) => poolInScope(rec, scope, wrappedNative)).length
    if (scope.scope.startsWith('pair:')) pairs.push({ key, pools: count })
    else if (wanted.has(scope.scope.toLowerCase() as Address)) adjacency.push(key)
  }
  pairs.sort((a, b) => b.pools - a.pools || a.key.localeCompare(b.key))

  let claimed = [...adjacency, ...pairs.slice(0, topPairs).map((p) => p.key)]

  // `maxPools`: drop whole scopes, largest first, until the derived pool set fits. Recomputed from
  // scratch each round because scopes overlap heavily (every core-intermediate pair scope is a
  // subset of two adjacency scopes), so a scope's marginal cost is not its own pool count.
  const scopesDroppedForSize: string[] = []
  const poolsFor = (keys: string[]): Set<string> => {
    const ids = new Set<string>()
    const scopes = keys.map(splitCoverageKey).filter((s): s is CoverageScope => s !== undefined)
    for (const rec of source.pools) {
      if (scopes.some((s) => poolInScope(rec, s, wrappedNative))) ids.add(rec.pool.id)
    }
    return ids
  }
  let keptPoolIds = poolsFor(claimed)
  if (options.maxPools !== undefined) {
    while (keptPoolIds.size > options.maxPools && claimed.length > 0) {
      let worst = claimed[0]!
      let worstSize = -1
      for (const key of claimed) {
        const size = poolsFor([key]).size
        if (size > worstSize) {
          worst = key
          worstSize = size
        }
      }
      claimed = claimed.filter((k) => k !== worst)
      scopesDroppedForSize.push(worst)
      keptPoolIds = poolsFor(claimed)
    }
  }

  // The check that makes the rule a rule. By construction it cannot fire — the pool set was DERIVED
  // from `claimed` — which is exactly the point: it is a guard against this function, not against
  // the caller, and a curation change that breaks the invariant fails the build instead of shipping.
  assertPoolsCoverageInseparable({ source, claimedKeys: claimed, keptPoolIds, wrappedNative })

  const claimedSet = new Set(claimed)
  let hintsDowngraded = 0
  const pools: PoolRecord[] = []
  for (const rec of source.pools) {
    if (!keptPoolIds.has(rec.pool.id)) continue
    if (rec.source === 'hint') hintsDowngraded++
    pools.push(stripEndpointSpecific(rec))
  }

  const body: PoolIndexSnapshot = {
    schemaVersion: source.schemaVersion,
    wrappedNative: source.wrappedNative,
    reorgOverlapBlocks: source.reorgOverlapBlocks,
    pools,
    coverage: source.coverage.filter(([key]) => claimedSet.has(key)).map(([key, ranges]) => [key, [...ranges]]),
    // Fee tiers a factory ENABLED are a scan product like coverage (they come from the factory's own
    // enablement logs), so they ride the same trust tier: published with the list, adopted by the
    // consumer only under `--trust-coverage`. They carry no endpoint identity, so they are never
    // curated away — a factory's enabled tiers are the same for everyone.
    enabledFees: source.enabledFees.map(([key, tiers]) => [key, [...tiers]]),
    // `learnedScanWidth` is DELIBERATELY ABSENT: it is the widest `eth_getLogs` window the
    // PUBLISHER'S endpoint was seen to serve, which is the single most endpoint-specific number in a
    // snapshot. Handing a keyed archive node's 100k-block hint to a consumer on a 10k-capped free
    // endpoint costs them a run of refused probes on every scan.
  }

  return {
    body,
    stats: {
      sourcePools: source.pools.length,
      keptPools: pools.length,
      droppedPools: source.pools.length - pools.length,
      sourceScopes: source.coverage.length,
      claimedScopes: claimed,
      scopesDroppedForSize,
      hintsDowngraded,
    },
  }
}

// ---------------------------------------------------------------------------
// Envelope: build, parse, verify.
// ---------------------------------------------------------------------------

export function buildEnvelope(args: {
  chainId: number
  manifest: ChainManifest
  body: PoolIndexSnapshot
  asOfTimestamp?: string
}): PoolListEnvelope {
  const canonical = serializeSnapshot(args.body)
  return {
    schemaVersion: POOL_LIST_SCHEMA_VERSION,
    chainId: args.chainId,
    asOfBlock: asOfBlockOf(args.body.coverage).toString(),
    asOfTimestamp: args.asOfTimestamp ?? new Date().toISOString(),
    manifestFingerprint: fingerprintOf(args.manifest),
    wrappedNative: args.body.wrappedNative.toLowerCase(),
    reorgOverlapBlocks: args.body.reorgOverlapBlocks.toString(),
    integrity: sha256(canonical),
    body: JSON.parse(canonical) as unknown,
  }
}

/**
 * The published file's text: a PRETTY-PRINTED HEADER over a COMPACT BODY.
 *
 * The split is a size decision that costs nothing. A real mainnet list is a few hundred megabytes of
 * pool records, and indenting them adds ~40% (measured: 275 MB compact, 387 MB at `null, 2`) to
 * something no human will ever read — while the header is a dozen lines that everyone reads first
 * (`head -12 1.poollist.json` answers "which chain, how current, which factories" with no tooling).
 * So the header gets the whitespace and the body does not.
 *
 * The body is emitted last and spliced in, which keeps this a single pass over the (large) body
 * string rather than a second full serialization. The result is ordinary JSON — nothing on the read
 * side knows or cares how the whitespace was distributed.
 */
export function serializeEnvelope(env: PoolListEnvelope): string {
  const { body, ...meta } = env
  const head = JSON.stringify(meta, null, 2)
  // `head` always ends in `\n}` (meta is never empty), which the body's entry replaces.
  return `${head.slice(0, head.length - 2)},\n  "body": ${JSON.stringify(body)}\n}\n`
}

/**
 * Parses a pool list and CHECKS ITS INTEGRITY, returning the decoded body alongside the envelope.
 *
 * Integrity is checked HERE, before the body is handed to anything, and separately from
 * {@link verifyPoolList}'s chain/manifest checks — a hash mismatch means these bytes are not the
 * bytes anyone published, so nothing else in the file (including the chain id it claims) is worth
 * comparing against anything.
 */
export function parsePoolList(text: string): { envelope: PoolListEnvelope; body: PoolIndexSnapshot } {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch (err) {
    throw new PoolListError(`pool list is not valid JSON (${err instanceof Error ? err.message.split('\n')[0]! : String(err)})`)
  }
  if (typeof raw !== 'object' || raw === null) throw new PoolListError('pool list is not a JSON object')
  const env = raw as PoolListEnvelope

  if (env.schemaVersion !== POOL_LIST_SCHEMA_VERSION) {
    throw new PoolListError(
      `pool list has schemaVersion ${String(env.schemaVersion)}, this build reads ${POOL_LIST_SCHEMA_VERSION} — ` +
        'there is no migration path; republish the list',
    )
  }
  for (const field of ['chainId'] as const) {
    if (typeof env[field] !== 'number') throw new PoolListError(`pool list has a non-numeric ${field}`)
  }
  // `asOfTimestamp` is in the list because it is RENDERED (it reaches a terminal through the
  // envelope), and every other rendered-or-compared string is checked here; leaving the one
  // informational field out was an omission, not a decision.
  for (const field of ['asOfBlock', 'asOfTimestamp', 'integrity', 'wrappedNative', 'reorgOverlapBlocks'] as const) {
    if (typeof env[field] !== 'string') throw new PoolListError(`pool list has a non-string ${field}`)
  }
  if (typeof env.body !== 'object' || env.body === null) throw new PoolListError('pool list has no body object')

  const canonical = JSON.stringify(env.body)
  const actual = sha256(canonical)
  if (actual !== env.integrity) {
    throw new PoolListError(
      `pool list integrity check FAILED — body hashes to ${actual.slice(0, 16)}… but the envelope claims ` +
        `${String(env.integrity).slice(0, 16)}…. The file was truncated, edited, or corrupted in transit; refusing to load it.`,
    )
  }

  let body: PoolIndexSnapshot
  try {
    body = parseSnapshot(canonical)
    // THE SDK'S OWN SHAPE GATE, AND ONLY THE GATE. A malformed body has to be rejected at the
    // boundary rather than detonating mid-search, exactly as `cli/cache.ts` relies on it doing for a
    // cache file — but this used to be spelled `PoolIndex.fromSnapshot(body)`, which runs the gate
    // and then builds an entire index that was immediately thrown away. Every pool was therefore
    // materialized TWICE: once into that index and once, moments later, by `hydratePoolList`'s
    // `upsert` loop into the index the run actually searches with. `assertSnapshotShape` is the whole
    // of what `fromSnapshot` validates (everything after it is construction), so the trust boundary
    // here is byte-for-byte the one it was — the second materialization simply no longer happens.
    //
    // MEASURED (synthetic v2 lists, parse + verify + hydrate, best of three):
    //
    //     pools     before    after     saved
    //     100,000    269ms    242ms      27ms
    //     400,000   1353ms   1218ms     135ms
    //
    // A tenth of the load, growing linearly with the pool count, plus the peak RSS of a whole
    // second index — the rest is `sha256` and `JSON.parse` over the file, which no restructuring
    // here can avoid.
    assertSnapshotShape(body)
  } catch (err) {
    throw new PoolListError(`pool list body is malformed (${err instanceof Error ? err.message.split('\n')[0]! : String(err)})`)
  }

  return { envelope: env, body }
}

/**
 * Cross-checks a list against the chain and manifest THIS run resolved. Throws {@link PoolListError}
 * on any disagreement.
 *
 * Every check here answers the same question — "was this list built for the thing I am about to use
 * it for?" — and none of them is recoverable by loading the list anyway: a list for another chain
 * describes pools that do not exist here, and a list built against another factory has coverage
 * ranges that describe scans of a contract this run will never read.
 */
export function verifyPoolList(
  envelope: PoolListEnvelope,
  body: PoolIndexSnapshot,
  expected: { chainId: number; manifest: ChainManifest },
): void {
  if (envelope.chainId !== expected.chainId) {
    throw new PoolListError(
      `pool list was built for chain ${envelope.chainId}, but this run resolved chain ${expected.chainId} — wrong list, or wrong endpoint?`,
    )
  }

  // The envelope's human-readable copies must agree with the body's authoritative ones (only the
  // body is under `integrity` — see `PoolListEnvelope`).
  if (envelope.wrappedNative.toLowerCase() !== body.wrappedNative.toLowerCase()) {
    throw new PoolListError("pool list envelope's wrappedNative disagrees with its body — the envelope was edited")
  }
  if (envelope.reorgOverlapBlocks !== body.reorgOverlapBlocks.toString()) {
    throw new PoolListError("pool list envelope's reorgOverlapBlocks disagrees with its body — the envelope was edited")
  }
  // THE THIRD DERIVED FIELD, which was being taken on faith while its two neighbours were checked.
  // `asOfBlock` is computed from the body's coverage, so it is exactly as recomputable as the other
  // two — and it is the field a human reads to decide whether a list is current enough to bother
  // with. An envelope edited to say 21,000,000 over a body that stops at 19,000,000 is a lie a
  // `head -12` cannot catch and a successful load would never contradict.
  if (envelope.asOfBlock !== asOfBlockOf(body.coverage).toString()) {
    throw new PoolListError("pool list envelope's asOfBlock disagrees with its body — the envelope was edited")
  }

  if (body.wrappedNative.toLowerCase() !== expected.manifest.wrappedNative.toLowerCase()) {
    throw new PoolListError(
      `pool list was built for wrappedNative ${body.wrappedNative} but this chain's manifest says ${expected.manifest.wrappedNative} — ` +
        'its adjacency graph is folded onto a different native family',
    )
  }

  const want = fingerprintOf(expected.manifest)
  const got = envelope.manifestFingerprint
  if (typeof got !== 'object' || got === null) throw new PoolListError('pool list has no manifestFingerprint')
  for (const protocol of PROTOCOLS) {
    const a = JSON.stringify((want as Record<string, unknown>)[protocol] ?? null)
    const b = JSON.stringify((got as Record<string, unknown>)[protocol] ?? null)
    if (a !== b) {
      throw new PoolListError(
        `pool list's ${protocol} manifestFingerprint ${b} does not match this run's manifest ${a} — ` +
          'the list describes scans of a different deployment',
      )
    }
  }
}

// ---------------------------------------------------------------------------
// Hydration — putting a verified list into the index this run will search with.
// ---------------------------------------------------------------------------

export type PoolListHydration = {
  /** Pool records the list offered. */
  offered: number
  /** How much `index.stats().pools` grew — the rest were already known (the cache had them). */
  added: number
  /** Coverage scopes the list claimed. */
  scopes: number
  /** Whether those scopes were adopted (Tier A, `--trust-coverage`) or discarded (Tier B, default). */
  coverageAdopted: boolean
}

/**
 * Merges a verified list INTO `index` — which already holds whatever the on-disk cache restored.
 *
 * A MERGE, NOT A REPLACEMENT, AND IT NEEDS NO SDK CHANGE. Every write below is a public `PoolIndex`
 * method doing exactly what a live discovery does: `upsert` merges by `PoolRef.id` under the class's
 * own provenance rules (so a cached record the chain proved is never demoted by a list's copy of it,
 * and the failure history a cached record carries survives), and `addCoverage` UNIONS block ranges
 * per scope through `mergeRanges`. Rebuilding a merged snapshot and calling `fromSnapshot` would
 * have worked too and was rejected: it re-`upsert`s every cached pool (~2.4us each, i.e. seconds on
 * a large cache) to reach the same state these calls reach incrementally, and it would have had to
 * re-implement the per-key range union that `addCoverage` already performs — `fromSnapshot` does a
 * bare `Map.set` per coverage entry, so a duplicate key there is last-writer-wins, not a merge.
 *
 * PRECEDENCE, THEREFORE, IS UNION IN BOTH DIRECTIONS, and the cache wins every conflict it can have:
 * pool provenance resolves by `SOURCE_PRIORITY` rather than by arrival order, and coverage is a union
 * because both sides are making the same KIND of claim ("these blocks were scanned") — the union is
 * simply everything that has been scanned by anyone this run is willing to believe. Which is why the
 * `--trust-coverage` gate below is the whole trust decision: once adopted, a list's ranges are
 * indistinguishable from the cache's.
 */
export function hydratePoolList(
  index: PoolIndex,
  body: PoolIndexSnapshot,
  options: { trustCoverage: boolean },
): PoolListHydration {
  const before = index.stats().pools
  for (const rec of body.pools) index.upsert(rec)

  if (options.trustCoverage) {
    for (const [key, ranges] of body.coverage) {
      const scope = splitCoverageKey(key)
      if (!scope) continue // a key no protocol owns cannot be applied; silently skipping is correct
      for (const range of ranges) index.addCoverage(scope.protocol, scope.scope, range)
    }
    for (const [key, tiers] of body.enabledFees) {
      const scope = splitCoverageKey(key)
      if (!scope) continue
      index.addEnabledFees(scope.protocol, scope.scope, tiers)
    }
  }

  return {
    offered: body.pools.length,
    added: index.stats().pools - before,
    scopes: body.coverage.length,
    coverageAdopted: options.trustCoverage,
  }
}

// ---------------------------------------------------------------------------
// The CLI entry point.
// ---------------------------------------------------------------------------

/**
 * Reads a pool list from a local path or an `https://` URL.
 *
 * `http://` IS REFUSED RATHER THAN FETCHED. The integrity hash lives in the same file it protects,
 * so it defends against corruption and truncation, NOT against an attacker who can rewrite the
 * response — such an attacker simply rewrites the hash too. Transport authenticity is the only thing
 * standing between a remote list and arbitrary coverage suppression, so the plaintext scheme is not
 * offered at all rather than offered with a warning nobody reads.
 */
export async function readPoolListText(spec: string, fetchImpl: typeof fetch = fetch): Promise<string> {
  if (/^http:\/\//i.test(spec)) {
    throw new PoolListError(`refusing to fetch a pool list over plaintext http (${spec}) — use https, or download it and pass a path`)
  }
  if (/^https:\/\//i.test(spec)) {
    let res: Response
    try {
      res = await fetchImpl(spec)
    } catch (err) {
      throw new PoolListError(`could not fetch pool list ${spec} (${err instanceof Error ? err.message.split('\n')[0]! : String(err)})`)
    }
    if (!res.ok) throw new PoolListError(`could not fetch pool list ${spec} (HTTP ${res.status})`)
    return res.text()
  }
  try {
    return await readFile(spec, 'utf8')
  } catch (err) {
    throw new PoolListError(`could not read pool list ${spec} (${err instanceof Error ? err.message.split('\n')[0]! : String(err)})`)
  }
}

/**
 * The whole `--pool-list` path: read, verify, hydrate into `index`, and hand back the one line the
 * caller prints to stderr.
 *
 * The line is UNCONDITIONAL (not gated on `--verbose`) and always names the trust decision, for the
 * same reason `context.ts` prints the cache's chain and path unconditionally: a run whose index came
 * from somewhere the user cannot see is a run they cannot reason about. Whether coverage was adopted
 * is the single most consequential thing about a list load, so it is never a detail.
 */
export async function applyPoolList(
  index: PoolIndex,
  spec: string,
  expected: { chainId: number; manifest: ChainManifest; trustCoverage: boolean },
): Promise<string> {
  const text = await readPoolListText(spec)
  const { envelope, body } = parsePoolList(text)
  verifyPoolList(envelope, body, expected)
  const summary = hydratePoolList(index, body, { trustCoverage: expected.trustCoverage })
  const tier = summary.coverageAdopted
    ? `${summary.scopes} coverage scopes ADOPTED (--trust-coverage)`
    : `${summary.scopes} coverage scopes discarded (pass --trust-coverage to adopt)`
  return `pool-list: ${summary.offered} pools (${summary.added} new) · ${tier} · as of block ${envelope.asOfBlock} · ${spec}`
}

// ---------------------------------------------------------------------------
// VERIFY-BEFORE-PUBLISH.
//
// Curation is arithmetic over a file; it cannot tell whether the file is
// describing the real chain. So a sample of the curated pools is checked
// AGAINST THE CHAIN before anything is written, and a single definitive
// negative fails the build (`scripts/buildPoolList.ts` is the orchestrator that
// supplies the client and the args; the decisions live here, where the unit
// suite can reach them).
//
// EXISTENCE, NOT PRICE. The question is only "does this pool identity
// correspond to something real on this chain right now", because that is the
// one thing a curated list can get wrong in a way a consumer cannot notice: a
// pool that does not exist wastes a consumer's `eth_call` and then vanishes
// from their ranking (`isDiscredited`), but a list full of them is a list built
// from a corrupted or wrong-chain source, and that is worth failing a build
// over. Liquidity, price and quoteability are all deliberately out of scope —
// they change every block and a list makes no claim about them.
//
// THREE DIFFERENT ORACLES, one per protocol, each the most authoritative cheap
// one available:
//   v2/v3 — ask the FACTORY. `getPair`/`getPool` is the factory's own registry;
//           an address it returns is a pool it created, which is strictly
//           stronger than "there is code at that address".
//   v4    — ask the POOL MANAGER's storage. v4 pools are not contracts, so
//           there is no address to have code at; `extsload` of the pool's slot0
//           with a non-zero sqrtPriceX96 is the canonical "initialized" test
//           (the same one v4-core's own StateLibrary performs).
//
// A REVERT IS NOT A NEGATIVE. Only a DEFINITIVE answer (the factory naming a
// different address or the zero address; slot0 reading back zero) fails the
// build. A reverting or transport-failed probe is reported as unverifiable and
// tolerated: an endpoint that will not answer says nothing about the chain, and
// failing a nightly publish because a provider rate-limited it would train
// everyone to pass `--skip-verify`.
//
// ...BUT A RUN THAT VERIFIED NOTHING AT ALL IS NOT A VERIFIED RUN. Tolerating
// individual unverifiable probes is what makes the check survive a flaky
// endpoint; tolerating a run in which EVERY probe was unverifiable is what
// turns the check into decoration. Both halves are needed, and the second one
// is the guard at the bottom of {@link verifyLive}: `checked === 0` with
// targets in hand means the endpoint answered nothing, and publishing off that
// is publishing unverified — which is what `--skip-verify` is for, explicitly.
// ---------------------------------------------------------------------------

const V2_FACTORY_GETPAIR = parseAbi(['function getPair(address tokenA, address tokenB) view returns (address pair)'])
const V3_FACTORY_GETPOOL = parseAbi(['function getPool(address tokenA, address tokenB, uint24 fee) view returns (address pool)'])
/** v4-core's `Extsload`. `POOLS_SLOT` is 6 and slot0 is the state struct's first word — see StateLibrary. */
const V4_EXTSLOAD = parseAbi(['function extsload(bytes32 slot) view returns (bytes32 value)'])
const V4_POOLS_SLOT = 6n

/** Per-call fallback fan-out when this chain has no Multicall3 — the same bound `DEFAULT_CONCURRENCY`
 * gives a router, restated as a literal because a publisher is not a router and has no options object
 * to read one from. */
const VERIFY_CONCURRENCY = 8

export type PoolProbe = { rec: PoolRecord; call: { to: Address; data: Hex }; check: (data: Hex) => 'ok' | 'missing' }

/** The one existence probe for `rec`, or `undefined` when the manifest declares no deployment for its
 * protocol (nothing to ask, so nothing is claimed either way). */
export function probeFor(rec: PoolRecord, manifest: ChainManifest): PoolProbe | undefined {
  if (rec.pool.protocol === 'v2') {
    if (!manifest.v2) return undefined
    const want = rec.pool.address.toLowerCase()
    return {
      rec,
      call: {
        to: manifest.v2.factory,
        data: encodeFunctionData({ abi: V2_FACTORY_GETPAIR, functionName: 'getPair', args: [rec.pool.token0, rec.pool.token1] }),
      },
      check: (data) => (decodeProbedAddress(V2_FACTORY_GETPAIR, 'getPair', data) === want ? 'ok' : 'missing'),
    }
  }
  if (rec.pool.protocol === 'v3') {
    if (!manifest.v3) return undefined
    const want = rec.pool.address.toLowerCase()
    const { token0, token1, fee } = rec.pool
    return {
      rec,
      call: {
        to: manifest.v3.factory,
        data: encodeFunctionData({ abi: V3_FACTORY_GETPOOL, functionName: 'getPool', args: [token0, token1, fee] }),
      },
      check: (data) => (decodeProbedAddress(V3_FACTORY_GETPOOL, 'getPool', data) === want ? 'ok' : 'missing'),
    }
  }
  if (!manifest.v4) return undefined
  const slot = keccak256(encodePacked(['bytes32', 'bytes32'], [rec.pool.poolId, pad(toHex(V4_POOLS_SLOT), { size: 32 })]))
  return {
    rec,
    call: {
      to: manifest.v4.poolManager,
      data: encodeFunctionData({ abi: V4_EXTSLOAD, functionName: 'extsload', args: [slot] }),
    },
    // slot0 packs sqrtPriceX96 into the LOW 160 bits; zero there means the pool was never initialized.
    check: (data) => ((BigInt(data) & ((1n << 160n) - 1n)) !== 0n ? 'ok' : 'missing'),
  }
}

function decodeProbedAddress(
  abi: typeof V2_FACTORY_GETPAIR | typeof V3_FACTORY_GETPOOL,
  fn: 'getPair' | 'getPool',
  data: Hex,
): string {
  // A call to an address with no code succeeds with `0x`, which decodes to nothing — treated as a
  // non-answer (never equal to the wanted address, hence 'missing'), which is the correct reading
  // for a factory address the manifest is wrong about.
  try {
    return (decodeFunctionResult({ abi, functionName: fn, data } as never) as string).toLowerCase()
  } catch {
    return ''
  }
}

/**
 * Picks which pools to probe: EVERY pool inside a claimed `pair:` scope (those are the scopes a
 * consumer will lean on hardest and they are small), plus a deterministic sample of the rest up to
 * `sample`. Deterministic — an evenly-spaced stride over insertion order rather than a random draw —
 * so two builds of the same source verify the same pools and a failure is reproducible.
 */
export function selectProbeTargets(
  body: PoolIndexSnapshot,
  claimed: string[],
  sample: number,
  wrappedNative: Address,
): PoolRecord[] {
  const pairScopes = claimed
    .map(splitCoverageKey)
    .filter((s): s is CoverageScope => s !== undefined && s.scope.startsWith('pair:'))

  const chosen = new Map<string, PoolRecord>()
  for (const rec of body.pools) {
    if (pairScopes.some((s) => poolInScope(rec, s, wrappedNative))) chosen.set(rec.pool.id, rec)
  }
  const rest = body.pools.filter((rec) => !chosen.has(rec.pool.id))
  const take = Math.min(sample, rest.length)
  if (take > 0) {
    const stride = rest.length / take
    for (let i = 0; i < take; i++) chosen.set(rest[Math.floor(i * stride)]!.pool.id, rest[Math.floor(i * stride)]!)
  }
  return [...chosen.values()]
}

/**
 * Reads the code at this chain's Multicall3 and returns the address only if something is deployed
 * there — NEVER the canonical address on faith.
 *
 * THE SAME ONCE-PER-CLIENT PROBE `router.ts#resolveMulticall3` PERFORMS, and for the identical
 * reason, restated here because a publisher has no router to borrow it from:
 * `internal/multicall.ts#AggregateCallsArgs.multicall3` states outright that callers must not pass
 * the canonical address unprobed, because an `aggregate3` sent to an address with no code SUCCEEDS
 * with `0x` and every inner result is lost to the outer decode. On the router that costs a search;
 * here it costs the entire point of the build step — every probe comes back a `TransportError`
 * (the outer decode fails, and `coarsenOuterFailure` conservatively calls that transport), every
 * probe is therefore "unverifiable", nothing is ever definitively missing, and the build publishes
 * an unverified list while printing that it verified 0 pools.
 *
 * A FAILED PROBE IS `null`, NOT A THROW: nothing was learned about the address, so the caller falls
 * back to per-call `eth_call`s, which are correct on every chain and merely slower.
 */
export async function probeMulticall3(
  client: Pick<PublicClient, 'request'>,
  manifest: ChainManifest,
): Promise<Address | null> {
  const address = manifest.multicall3 ?? MULTICALL3_ADDRESS
  try {
    const code = (await client.request({ method: 'eth_getCode', params: [address, 'latest'] } as any)) as Hex
    return typeof code === 'string' && code !== '0x' && code.length > 2 ? address : null
  } catch {
    return null
  }
}

export type VerifyLiveResult = {
  /** Probes that came back with a definitive, positive answer. */
  checked: number
  /** Probes the endpoint would not answer (a revert, a transport failure, a chunk lost as a whole). */
  unverifiable: number
  /** Whether the probes went out through `aggregate3` or one `eth_call` at a time. */
  aggregated: boolean
}

/**
 * Probes `targets` for existence at `blockNumber` and throws {@link PoolListError} on the first
 * definitive negative — or when the run verified NOTHING (see the section header).
 *
 * Dispatch is `aggregate3` when {@link probeMulticall3} found a real deployment (200 probes become
 * ~4 requests, which is the only reason "probe every pool in every claimed pair scope" is a default
 * rather than a flag nobody turns on) and one `eth_call` per probe otherwise — same slot semantics
 * either way, since `aggregateCalls` and `mapConcurrent` both return one `Hex | Error` per input.
 */
export async function verifyLive(args: {
  client: Pick<PublicClient, 'request'>
  manifest: ChainManifest
  targets: PoolRecord[]
  blockNumber: bigint
  /** The PROBED deployment, or `null` for the per-call path. Passed in rather than probed here so a
   * caller that already resolved it (or a test that wants one path) does not re-read the code. */
  multicall3: Address | null
}): Promise<VerifyLiveResult> {
  const { client, manifest, targets, blockNumber, multicall3 } = args
  if (targets.length === 0) return { checked: 0, unverifiable: 0, aggregated: multicall3 !== null }

  const probes = targets.map((rec) => probeFor(rec, manifest)).filter((p): p is PoolProbe => p !== undefined)
  const results: Array<Hex | Error> =
    multicall3 !== null
      ? await aggregateCalls({ client, multicall3, calls: probes.map((p) => p.call), blockNumber })
      : await mapConcurrent(probes, VERIFY_CONCURRENCY, (p) => ethCall(client, p.call, blockNumber))

  const missing: string[] = []
  let unverifiable = 0
  results.forEach((result, i) => {
    const probe = probes[i]!
    if (result instanceof Error) {
      unverifiable++
      return
    }
    if (probe.check(result) === 'missing') missing.push(probe.rec.pool.id)
  })

  if (missing.length > 0) {
    throw new PoolListError(
      `verify-before-publish FAILED at block ${blockNumber}: ${missing.length}/${probes.length} probed pools do not exist on chain ` +
        `(e.g. ${missing.slice(0, 3).join(', ')}). The source snapshot describes a different chain, or is corrupt — not publishing.`,
    )
  }

  const checked = probes.length - unverifiable
  if (checked === 0) {
    throw new PoolListError(
      `verify-before-publish VERIFIED NOTHING at block ${blockNumber}: ${targets.length} pool(s) selected, ` +
        `${probes.length} probe(s) built, 0 answered (${unverifiable} unverifiable). ` +
        'An endpoint that answers no probe proves nothing about this chain, so publishing here would ship an ' +
        'unverified list under a verified banner. Fix the endpoint, or say so with --skip-verify.',
    )
  }
  return { checked, unverifiable, aggregated: multicall3 !== null }
}
