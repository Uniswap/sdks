import type { Address, Hex } from 'viem'
import { isAddressEqual, zeroAddress } from 'viem'

import { sortAddresses } from '../internal/currency'
import { computeV4PoolId } from '../internal/poolId'
import type { CurrencyRef, PoolKey, PoolRef, Protocol, RouteCandidate } from '../types'

// ---------------------------------------------------------------------------
// PoolRef construction — the only place a `PoolRef` is ever built, and the
// identity vocabulary built out of it (`PoolRef.id`, and `routeId`).
//
// A `PoolRef` carries two derived fields on every arm (`id` and `currencies`,
// see the type's own docs); they are derived here, once, so that every
// consumer reads them instead of switching on `protocol` to recompute them.
// Seven such re-derivations used to be spread across the index, the candidate
// generator, the plan compiler and the search engine, and one of them shipped
// wrong (a v4 native pool was linked into the graph under address(0) instead
// of the native family).
//
// Everything here is pure and RPC-free: the protocol modules call these from
// `parsePoolLog`, `validateHint`, and their speculative probe builders.
// ---------------------------------------------------------------------------

/** The three arms, named — so a constructor's return type narrows to the protocol it just built. */
export type V2PoolRef = Extract<PoolRef, { protocol: 'v2' }>
export type V3PoolRef = Extract<PoolRef, { protocol: 'v3' }>
export type V4PoolRef = Extract<PoolRef, { protocol: 'v4' }>

/** `${protocol}:${lowercased address-or-poolId}` — the pool index key and `routeId`'s unit.
 *
 * DELIBERATELY `.toLowerCase()`, NOT `isAddressEqual` (R3): this builds a MAP KEY, not a comparison.
 * A canonical lowercased string is exactly what makes two spellings of the same pool collide in the
 * index's `Map`, and `id` is a v4 poolId (a 32-byte hash) as often as an address, which
 * `isAddressEqual` cannot take at all. Every keyed lookup in this package is lowercased for the same
 * reason — see `pools/poolIndex.ts` and `search/state.ts#legKey`. */
function identity(protocol: Protocol, id: Address | Hex): string {
  return `${protocol}:${id.toLowerCase()}`
}

/**
 * Deterministic route identity: each leg's pool identity (protocol + lowercased address/poolId),
 * joined by '>'.
 *
 * IT LIVES BESIDE {@link identity} BECAUSE IT IS THAT FUNCTION'S ONLY COMPOSITION. `routeId` is
 * nothing but `PoolRef.id` concatenated in leg order, so the two spellings of "what makes this the
 * same thing as that" belong in one file — a change to how a pool is keyed is automatically a
 * change to how a route is keyed, and this is where a reader looking for either finds both. It lives
 * here rather than in the search engine so `quote/rank.ts` (the ranking tie-break) never imports
 * UP the layer stack to ask a question with no search in it at all.
 */
export function routeId(c: RouteCandidate): string {
  return c.legs.map((leg) => leg.pool.id).join('>')
}

/** v4 spells native as address(0) on-chain (never the wrapped address); the domain spells it 'native'. */
function domainCurrency(c: Address): CurrencyRef {
  return isAddressEqual(c, zeroAddress) ? 'native' : c
}

/**
 * The token pair is sorted here rather than trusted from the caller: `token0`/`token1` name the
 * pool's *on-chain* slots, and `currencies` is documented as sorted, so a caller that passed them
 * reversed would produce a ref that lies about both. Every caller today already pre-sorts (the
 * factory events arrive sorted; the probe builders and hint validators sort explicitly), so this
 * only closes the hole — it changes nothing for them.
 */
export function v2PoolRef(address: Address, a: Address, b: Address): V2PoolRef {
  const [token0, token1] = sortAddresses(a, b)
  return { protocol: 'v2', address, token0, token1, id: identity('v2', address), currencies: [token0, token1] }
}

/** Sorted for the same reason as {@link v2PoolRef}. */
export function v3PoolRef(address: Address, a: Address, b: Address, fee: number): V3PoolRef {
  const [token0, token1] = sortAddresses(a, b)
  return { protocol: 'v3', address, token0, token1, fee, id: identity('v3', address), currencies: [token0, token1] }
}

/**
 * A v4 pool has no address of its own: its identity IS the hash of its key, so the caller never
 * supplies a `poolId` — it is computed here. `parsePoolLog` checks the resulting id against the
 * `Initialize` log's own indexed one rather than trusting the log's value.
 *
 * Unlike v2/v3 above, the key is used exactly as given: `currency0`/`currency1` order is an input to
 * that hash, so reordering it here would silently name a *different pool* than the caller asked
 * about. Sorting a PoolKey is the calling module's job (see `v4Module.validateHint`), and an
 * already-sorted key — every real one — is unaffected either way.
 */
export function v4PoolRef(poolKey: PoolKey): V4PoolRef {
  const poolId = computeV4PoolId(poolKey)
  return {
    protocol: 'v4',
    poolId,
    poolKey,
    id: identity('v4', poolId),
    currencies: [domainCurrency(poolKey.currency0), domainCurrency(poolKey.currency1)],
  }
}

/** True only for a v4 pool with a non-zero `hooks` address — v2 and v3 pools have no hooks at all. */
export function isHooked(ref: PoolRef): boolean {
  return ref.protocol === 'v4' && !isAddressEqual(ref.poolKey.hooks, zeroAddress)
}
