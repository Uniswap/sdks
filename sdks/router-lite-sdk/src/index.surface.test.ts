import { expect, test } from 'bun:test'

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
import type { Protocol, ReasonCode } from './index'

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
// ---------------------------------------------------------------------------

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
