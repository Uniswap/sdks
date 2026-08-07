import type { Protocol } from '../types'

import type { ProtocolModule } from './types'
import { v2Module } from './v2'
import { v3Module } from './v3'
import { v4Module } from './v4'

// ---------------------------------------------------------------------------
// The protocol registry — the one place that knows all three ProtocolModules
// exist. `createRouter` uses `PROTOCOL_MODULES` directly instead of building
// its own `Record<Protocol, ProtocolModule>` literal, and every internal stage
// that accepts a `modules` argument (`compileExecutionPlan`) defaults to it —
// so wiring a new protocol in only ever means updating this file.
//
// Also the re-export surface `../experimental` draws on to make its own
// `modules` parameters constructible: `ProtocolModule` itself is the plugin
// interface a caller would otherwise have no way to reference.
// ---------------------------------------------------------------------------

export { v2Module } from './v2'
export { v3Module } from './v3'
export { v4Module } from './v4'
export type { FeeDiscovery, ProtocolModule, QuoteProbe } from './types'

// The PoolRef vocabulary itself: the three constructors (the only way a ref is ever built) and the
// one predicate — `isHooked` — that anything outside a module needs to ask about a pool's shape.
export { isHooked, v2PoolRef, v3PoolRef, v4PoolRef } from './poolRef'
export type { V2PoolRef, V3PoolRef, V4PoolRef } from './poolRef'

export const PROTOCOL_MODULES: Record<Protocol, ProtocolModule> = { v2: v2Module, v3: v3Module, v4: v4Module }
