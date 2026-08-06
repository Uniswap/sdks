import type { Address } from 'viem'

import { toGraphNode } from '../internal/currency'
import type { ProtocolModule } from '../protocols/types'
import type { ChainManifest, CurrencyRef, Protocol } from '../types'
import { PROTOCOLS } from '../types'

import type { SearchContext } from './waves'

// ---------------------------------------------------------------------------
// The three questions every stage of a search asks about its own context:
// which modules are switched on for this chain, where a protocol's history
// starts, and which graph node a currency belongs to.
//
// They live in a file of their own because they belong to NONE of the stages
// that use them. `discovery.ts`, `report.ts` and `waves.ts` all call them, and
// they sat in `discovery.ts` for the single reason its header admitted to: a
// scan module may not import VALUES from `waves.ts` without making the
// engine's module graph cyclic, and discovery was the heaviest caller. That is
// a statement about import direction, not about where the functions belong —
// so they are here instead, in a leaf that only reads `SearchContext`'s TYPE
// (no runtime edge back to `waves.ts`) and that every stage may import
// downward from.
//
// Each is one line and stays one line. The moment one of them needs to decide
// something rather than look something up, it belongs in `waves.ts` with the
// rest of the policy.
// ---------------------------------------------------------------------------

/** The block a protocol's factory/manager was deployed at — the floor of every scan against it. */
export function deploymentBlockOf(m: ChainManifest, p: Protocol): bigint | undefined {
  if (p === 'v2') return m.v2?.deploymentBlock
  if (p === 'v3') return m.v3?.deploymentBlock
  return m.v4?.deploymentBlock
}

/** The protocol modules this chain's manifest actually configures, in `PROTOCOLS` order. */
export function enabledModules(ctx: SearchContext): ProtocolModule[] {
  return PROTOCOLS.map((p) => ctx.modules[p]).filter((m) => m.enabled(ctx.manifest))
}

/** A currency's graph node: the address the pool graph keys it under, native folded onto wrapped. */
export function node(c: CurrencyRef, m: ChainManifest): Address {
  return toGraphNode(c, m.wrappedNative)
}
