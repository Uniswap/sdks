// ---------------------------------------------------------------------------
// The `@uniswap/router-lite-sdk/experimental` subpath — the internal-facing
// route generation, execution-plan compilation, and calldata encoding stage
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
// this file (plus the public types from the package root): `generateRoutes`
// needs a `PoolIndex` (exported here) and, unless the caller has v4 hookData
// to stamp, nothing else — `hookData` defaults to an empty map.
// `compileExecutionPlan` needs `modules`, which defaults to
// `PROTOCOL_MODULES` (the real v2/v3/v4 modules, exported here) so a caller
// only has to pass it when substituting a custom module. See
// `experimental/surface.test.ts` for the compile-time guard that this stays
// true.
// ---------------------------------------------------------------------------

export { generateRoutes } from '../search/candidates'
export type { GenerateRoutesArgs, GenerateRoutesResult } from '../search/candidates'

export { compileExecutionPlan } from '../plan/compile'
export type { CompileExecutionPlanArgs } from '../plan/compile'

export { encoderFor } from '../encode'
export type { CommandSet } from '../types'

export { PoolIndex, POOL_INDEX_SCHEMA_VERSION, parseSnapshot, serializeSnapshot } from '../pools/poolIndex'
export type { PoolIndexSnapshot, PoolIndexStats } from '../pools/poolIndex'

export { PROTOCOL_MODULES, v2Module, v3Module, v4Module } from '../protocols'
export type { FeeDiscovery, ProtocolModule, QuoteProbe } from '../protocols'

// `adjacencyShape` is the one `ProtocolModule` member whose type a caller could reach but not NAME
// — a custom module has to return an `AdjacencyShape`, and `adjacencyQueries` is what turns any set
// of them into the merged `eth_getLogs` filters the engine issues. Exporting both keeps the module
// surface constructible from this file alone, the same rule the rest of it follows.
export { adjacencyQueries } from '../protocols'
export type { AdjacencyShape } from '../protocols'

// `PoolRef` carries derived fields (`id`, `currencies`) that only its constructors know how to fill,
// so a caller holding `PoolIndex.upsert` or `generateRoutes` cannot build one without these — the
// same constructibility rule the rest of this file exists to keep (see `surface.test.ts`).
export { isHooked, v2PoolRef, v3PoolRef, v4PoolRef } from '../protocols'

export type { Custody } from '../types'

export { buildHookData } from '../search/hookData'
