import { expect, test } from 'bun:test'

import * as rootModule from './index'
import {
  ARBITRUM_MANIFEST,
  BASE_MANIFEST,
  MAINNET_MANIFEST,
  PROTOCOLS,
  REASON_CODES,
  ROBINHOOD_MANIFEST,
  RouterConfigError,
  UNICHAIN_MANIFEST,
  UnsupportedRouteError,
  createRouter,
  manifestFor,
} from './index'
import type { CreateRouterOptions, IterateOptions, Protocol, ReasonCode } from './index'

// ---------------------------------------------------------------------------
// Compile-time + minimal-execution guard that every VALUE export of the package root
// (`@uniswap/router-lite-sdk`, i.e. `./index`) stays actually importable and callable from outside
// the package — mirrors `experimental/surface.test.ts`'s guard for the `/experimental` subpath, one
// level up.
//
// `REASON_CODES` is the export this file exists to pin (F7): a value export is easy to accidentally
// demote to `export type` (or drop entirely) in a refactor, and unlike a type-only mistake, that is
// invisible to `tsc` at every OTHER call site in the package — nothing here imports `REASON_CODES`
// as a value except a caller who actually wants to iterate/validate against it, which is exactly
// what this test does. The other root value exports ride along for the same cheap-drift-guard
// reason `experimental/surface.test.ts` covers its own subpath.
//
// THE SPOT CHECKS BELOW ARE NOT A SURFACE PIN, WHICH IS WHY THE TWO EXHAUSTIVE ONES EXIST. A test
// that names the exports it expects can only fail when one goes MISSING; an export that ARRIVES is
// invisible to it, and the package shipped `PROTOCOLS` (a value) and `assumeChainId` /
// `IterateOptions` (an option field and a type) with nothing failing and nothing documented. So
// this file pins the full sorted export list, and — because `Object.keys` sees only value exports —
// the option bag's keys are pinned at COMPILE time as well. Failing either is not a bug: it means
// someone must consciously update the pin AND the README table it mirrors.
// ---------------------------------------------------------------------------

/**
 * Every VALUE export of the package root, sorted. Adding one is a public-API decision; this is
 * where it gets made deliberately instead of by import.
 */
const ROOT_VALUE_EXPORTS = [
  'ARBITRUM_MANIFEST',
  'BASE_MANIFEST',
  'MAINNET_MANIFEST',
  'PROTOCOLS',
  'REASON_CODES',
  'ROBINHOOD_MANIFEST',
  'RouterConfigError',
  'UNICHAIN_MANIFEST',
  'UnsupportedRouteError',
  'createRouter',
  'manifestFor',
] as const

test('the package root exports EXACTLY these values — an addition fails here, not silently in a release', () => {
  expect(Object.keys(rootModule).sort()).toEqual([...ROOT_VALUE_EXPORTS])
})

// The compile-time half. `Object.keys` cannot see a type export or an option FIELD, and both are
// how the last two undocumented additions arrived. `Exclude<A, B> | Exclude<B, A>` resolves to
// `never` iff the two key sets are identical, so a new option (or a removed one) fails to compile
// here with the offending name printed in the error.
type Exact<Actual extends string, Pinned extends string> = Exclude<Actual, Pinned> | Exclude<Pinned, Actual>
type AssertNever<T extends never> = T

type PinnedCreateRouterOptions =
  | 'client'
  | 'manifest'
  | 'index'
  | 'maxPools'
  | 'concurrency'
  | 'logChunkBlocks'
  | 'assumeChainId'
type PinnedIterateOptions = 'onFirstRoute'

type _CreateRouterOptionsArePinned = AssertNever<Exact<keyof CreateRouterOptions & string, PinnedCreateRouterOptions>>
type _IterateOptionsArePinned = AssertNever<Exact<keyof IterateOptions & string, PinnedIterateOptions>>

test('the two option bags carry exactly the documented fields', () => {
  // The assertion is the two type aliases above (they fail `bun run typecheck:tests`, not this
  // runtime test). This case exists so the aliases are referenced — an unused type alias is exactly
  // the thing a future cleanup deletes — and so the failure has a name in the test output too.
  const createKeys: PinnedCreateRouterOptions[] = [
    'client',
    'manifest',
    'index',
    'maxPools',
    'concurrency',
    'logChunkBlocks',
    'assumeChainId',
  ]
  const iterateKeys: PinnedIterateOptions[] = ['onFirstRoute']
  expect(createKeys).toHaveLength(7)
  expect(iterateKeys).toHaveLength(1)
})

test('REASON_CODES is a real, importable, iterable value — not just the ReasonCode type', () => {
  expect(Array.isArray(REASON_CODES)).toBe(true)
  expect(REASON_CODES.length).toBeGreaterThan(0)
  expect(REASON_CODES).toContain('rpc-unavailable')
  expect(REASON_CODES).toContain('rpc-degraded')
  expect(REASON_CODES).toContain('aborted')
  expect(REASON_CODES).toContain('discovery-incomplete')
  expect(REASON_CODES).toContain('quotes-unattempted')
  expect(REASON_CODES).toContain('no-viable-route')
  expect(REASON_CODES).toContain('no-route-verified')
  // `ReasonCode` narrows to exactly what `REASON_CODES` holds — reachable and assignable here means
  // the value and the type it's drawn from stay in sync from the caller's point of view.
  const code: ReasonCode = REASON_CODES[0]!
  expect(typeof code).toBe('string')
})

test('PROTOCOLS is a real, importable, iterable value — not just the Protocol type', () => {
  // Same guard as `REASON_CODES` above, for the same reason: a caller iterating the closed set (a
  // per-protocol table, a `Record<Protocol, …>` builder) has no other way to reach it, and the
  // demotion to `export type` that would break them is invisible to `tsc` everywhere else.
  expect(Array.isArray(PROTOCOLS)).toBe(true)
  expect([...PROTOCOLS]).toEqual(['v2', 'v3', 'v4'])
  // Every key of `SearchReport.discovery` is drawn from exactly this set — the property the CLI's
  // coverage panel relies on when it walks `PROTOCOLS` to index into the report.
  const p: Protocol = PROTOCOLS[0]!
  expect(typeof p).toBe('string')
})

test('createRouter, manifestFor, and the built-in manifests are reachable and callable from the package root', () => {
  expect(typeof createRouter).toBe('function')
  expect(typeof manifestFor).toBe('function')
  expect(MAINNET_MANIFEST.chainId).toBe(1)
  expect(BASE_MANIFEST.chainId).toBe(8453)
  expect(UNICHAIN_MANIFEST.chainId).toBe(130)
  expect(ARBITRUM_MANIFEST.chainId).toBe(42161)
  expect(ROBINHOOD_MANIFEST.chainId).toBe(4663)
  expect(manifestFor(1)).toEqual(MAINNET_MANIFEST)
})

test('RouterConfigError and UnsupportedRouteError are constructible, named Error subclasses', () => {
  expect(new RouterConfigError('x')).toBeInstanceOf(Error)
  expect(new RouterConfigError('x').name).toBe('RouterConfigError')
  expect(new UnsupportedRouteError('x')).toBeInstanceOf(Error)
  expect(new UnsupportedRouteError('x').name).toBe('UnsupportedRouteError')
})
