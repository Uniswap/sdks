// ---------------------------------------------------------------------------
// The `@uniswap/router-lite-sdk/experimental` subpath — the internal-facing
// pool-index, execution-plan compilation, and calldata encoding stage
// primitives, exported directly for callers who need to build their own
// search policy on top of them instead of going through `createRouter`'s
// `getQuote`/`getSwap` facade.
//
// This is a DIRECTORY index (`src/experimental/index.ts`), not a sibling file
// (`src/experimental.ts`): the package's `exports` map (see `package.json`)
// resolves the subpath to `dist/**/src/experimental/index.*`, so the source
// layout has to mirror that path exactly for the build to produce a matching
// output.
//
// No policy lives here — `createRouter` is the only place that decides *when*
// to stop searching or *how* to classify what was found; these are the raw
// stage functions it is built from.
//
// `PoolIndex`'s snapshot pair ships here too (P2): `toSnapshot`/`fromSnapshot`
// are the class's own extension story, and `serializeSnapshot`/`parseSnapshot`
// travel with them because `JSON.stringify` throws on the bigints a snapshot
// carries — shipping the type without a working JSON round trip would ship a
// puzzle. `cli/cache.ts` is the reference consumer.
//
// Every argument type below is constructible from exports reachable through
// this file (plus the public types from the package root):
// `compileExecutionPlan` needs `modules`, which defaults to
// `PROTOCOL_MODULES` (the real v2/v3/v4 modules, exported here) so a caller
// only has to pass it when substituting a custom module. See
// `experimental/surface.test.ts` for the compile-time guard that this stays
// true.
//
// A second block below (search "BLESSED FOR canary/ AND cli/") carries a different kind of export:
// not stage primitives for a custom search policy, but internal helpers `canary/` and `cli/` used to
// reach only via a relative `../src/internal/*` import — unifying canary's module-resolution world
// onto this package (rather than mixing it with a second, source-resolved copy of the same code) and
// giving cli/ a public name for what it already depended on.
// ---------------------------------------------------------------------------

export { compileExecutionPlan } from '../plan/compile'
export type { CompileExecutionPlanArgs } from '../plan/compile'

export { encoderFor } from '../encode'
export type { CommandSet } from '../types'

export { PoolIndex, POOL_INDEX_SCHEMA_VERSION, parseSnapshot, serializeSnapshot } from '../pools/poolIndex'
export type { PoolIndexOptions, PoolIndexSnapshot, PoolIndexStats } from '../pools/poolIndex'

export { PROTOCOL_MODULES, v2Module, v3Module, v4Module } from '../protocols'
export type { FeeDiscovery, ProtocolModule } from '../protocols'

// `adjacencyShape` is the one `ProtocolModule` member whose type a caller could reach but not NAME
// — a custom module has to return an `AdjacencyShape`, and `adjacencyQueries` is what turns any set
// of them into the merged `eth_getLogs` filters the engine issues. Exporting both keeps the module
// surface constructible from this file alone, the same rule the rest of it follows.
export { adjacencyQueries } from '../protocols'
export type { AdjacencyShape } from '../protocols'

// `PoolRef` carries derived fields (`id`, `currencies`) that only its constructors know how to fill,
// so a caller holding `PoolIndex.upsert` cannot build one without these — the same constructibility
// rule the rest of this file exists to keep (see `surface.test.ts`).
export { isHooked, v2PoolRef, v3PoolRef, v4PoolRef } from '../protocols'

export type { Custody } from '../types'

export { buildHookData } from '../search/hookData'

// ---------------------------------------------------------------------------
// BLESSED FOR canary/ AND cli/ (see the task that added this block). Both directories used to
// deep-import these from `../src/internal/*` (cli) or `../src/internal/*` / `../src/*` (canary) —
// unreachable through either public export path, so a caller outside this repo had no way to do
// what those two tools do. Each symbol below has a coherent story for a caller building custom
// tooling on top of the primitives already exported above; anything without one stays a deep import
// (see e.g. `cli/poolList.ts`'s `assertSnapshotShape`, deliberately never re-exported here — its own
// docstring in `pools/poolIndex.ts` explains why).
// ---------------------------------------------------------------------------

// `assertResultCoherent` mechanically checks the honesty invariants every `QuoteResult`/`SwapResult`
// this package returns must satisfy — the same check every internal suite runs on every result it
// produces. Exported so a caller building its own fixtures (canary's live results; a downstream
// app's integration tests) can hold the SDK itself to the contract, rather than re-deriving a partial
// copy of it. Imported from `../internal/resultCoherence`, NOT `../internal/testing` (which merely
// re-exports it) — `internal/testing.ts` is a test-fixture grab bag excluded from every build, and
// importing from it here would have pulled the whole file into `dist/` (see `resultCoherence.ts`'s
// header and `build.surface.test.ts`).
export { assertResultCoherent, emptyReport } from '../internal/resultCoherence'

// `DEFAULT_SLIPPAGE_BPS` is the slippage this package applies when a `SwapRequest` doesn't override
// it; a caller reconstructing what a prior `getSwap` call used (canary's `simulateSwapE2E`, which
// gets a `SwapResult` back but not the request that produced it) needs the same default rather than
// a hardcoded guess.
export { DEFAULT_SLIPPAGE_BPS } from '../constants'

// `scanLogs` is the adaptive, bisecting `eth_getLogs` walker every discovery scan in this package is
// built from — the log-scanning stage primitive, the same category as `compileExecutionPlan` above
// for a caller assembling its own search policy, and the one piece
// canary's provider-behavior suite exists to exercise directly (its bisection converging against a
// real provider's cap is the thing under test, not a reimplementation of it).
export { scanLogs } from '../internal/logScan'
// The return type of the already-exported `adjacencyQueries` above, and `scanLogs`'s own query
// argument type — a caller naming either (a variable, a helper's parameter) needs it from here too.
export type { MergedLogQuery } from '../types'

// The v4 PoolManager's ABI — needed to decode/derive topics for the `Initialize`/`Swap` logs
// `scanLogs` returns, for a caller building v4-specific discovery on top of it.
export { V4_POOL_MANAGER_ABI } from '../internal/abis'

// The canonical Multicall3 deployment address, and the ABI its stub responses decode against —
// needed by a caller building tests around `aggregateCalls`, or resolving the same deployment
// `router.ts` probes for.
export { MULTICALL3_ADDRESS } from '../internal/multicall'
export { MULTICALL3_ABI } from '../internal/abis'

// `aggregateCalls` batches many block-pinned `eth_call`s through Multicall3's `aggregate3`; `ethCall`
// and `mapConcurrent` are the single-call dispatch and bounded-concurrency primitives it (and the
// router itself) are built from. Exported together as the RPC-dispatch stage primitives, for a
// caller (e.g. a pool-list publisher verifying pools before shipping them) that wants the same
// batching/concurrency behavior the router itself relies on.
export { aggregateCalls } from '../internal/multicall'
export { ethCall, mapConcurrent } from '../internal/rpc'

// `classifyRpcError` sorts a failed RPC call into the channel that decides what it's evidence of
// (an on-chain revert vs. a provider outage vs. node-state unavailability) — the transport-vs-
// execution classifier every `eth_call`/`eth_getLogs` in this package is judged by. A caller doing
// its own RPC work (a token-metadata read, a manual probe) needs the same rule to report failures
// consistently rather than drifting from it.
export { classifyRpcError } from '../internal/rpcErrors'
export type { RpcFailureKind } from '../internal/rpcErrors'

// Currency-normalization helpers used throughout discovery: `toGraphNode` folds `'native'` onto a
// chain's wrapped-native address (the graph-node identity `PoolIndex` itself keys on), `sameFamily`
// asks whether two `CurrencyRef`s are the same token once that fold is applied, and `sortAddresses`
// gives two addresses a stable, case-insensitive order. A caller building its own adjacency/curation
// logic on top of `PoolIndex`/`PoolRecord` needs the identical fold, not a second copy of it.
export { toGraphNode, sameFamily, sortAddresses } from '../internal/currency'

// `isDiscredited` is `PoolRecord`'s own ranking judgment — a hinted-but-never-proved pool that has
// racked up enough quote failures loses its ranking privilege (see the function's own docstring for
// the exact rule). A caller reporting on or curating a `PoolIndex`'s records (a `discover` command,
// a pool-list builder) needs this exact rule, not a re-derived approximation of it.
export { isDiscredited } from '../pools/poolIndex'

// `intersectRanges` is this package's block-range-set intersection — the one piece of the range
// algebra behind `PoolIndex`'s coverage cache that a caller integrating a `PoolIndexSnapshot` into
// its own cache (`cli/cache.ts`'s reference implementation) needs directly, alongside the
// snapshot pair exported above.
export { intersectRanges } from '../internal/ranges'

// `blockTimeSecondsOf` is `ChainManifest`'s own chain-physics accessor: seconds per block, either
// stated on the manifest or defaulted to mainnet's 12 — the number every per-chain time window in
// this package (wave 0's recent-launch scan, a CLI's own search budget) is computed from. Exported
// because it takes and returns only already-public types, and a caller sizing its own chain-relative
// window has no other way to read the exact number the engine itself uses.
export { blockTimeSecondsOf } from '../manifest'
