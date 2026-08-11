import { describe, expect, test } from 'bun:test'
import fc from 'fast-check'
import type { Address } from 'viem'

import { v2PoolRef } from '../protocols/poolRef'
import type { ProtocolModule } from '../protocols/types'
import type { ChainManifest, Protocol } from '../types'
import { protocolRecord } from '../types'

import { composePriceImpactBps, dustReference, measureRouteImpact } from './impact'
import type { ImpactSample } from './impact'

// ---------------------------------------------------------------------------
// The impact math (`quote/impact.ts`) — pure over its samples, so the suite is
// arithmetic first: sign, composition, the dust floor, and the arms that must
// yield "not computable" rather than a number. `measureRouteImpact`'s
// degrade-to-absent behavior is pinned here too, over a scripted module; the
// facade-level behavior (answering route annotated, alternatives untouched,
// failure never blocking the answer) lives in `router.test.ts`.
// ---------------------------------------------------------------------------

const TOKEN_A = `0x${'aa'.repeat(20)}` as Address
const TOKEN_B = `0x${'bb'.repeat(20)}` as Address

function sample(execIn: bigint, execOut: bigint, refIn: bigint, refOut: bigint): ImpactSample {
  return { execIn, execOut, refIn, refOut }
}

describe('dustReference', () => {
  test('amountIn / 10,000', () => {
    expect(dustReference(10_000_000n)).toBe(1_000n)
    expect(dustReference(10n ** 21n)).toBe(10n ** 17n)
  })

  test('the floor: any amountIn below 10,000 references at exactly 1', () => {
    expect(dustReference(9_999n)).toBe(1n)
    expect(dustReference(1n)).toBe(1n)
  })
})

describe('composePriceImpactBps', () => {
  test('a route executing at exactly the reference price reports 0', () => {
    // exec 1000 -> 2000 (unit 2), ref 1 -> 2 (unit 2).
    expect(composePriceImpactBps([sample(1_000n, 2_000n, 1n, 2n)])).toBe(0)
  })

  test('execution below the marginal price is NEGATIVE bps — the ordinary direction', () => {
    // exec unit 1.8 vs ref unit 2.0: 10% worse = -1000 bps.
    expect(composePriceImpactBps([sample(1_000n, 1_800n, 1n, 2n)])).toBe(-1000)
  })

  test('execution above the reference reports positive bps, as measured', () => {
    expect(composePriceImpactBps([sample(1_000n, 2_200n, 1n, 2n)])).toBe(1000)
  })

  test('multi-leg composition multiplies the per-leg ratios', () => {
    // Leg 1 at 90% of marginal, leg 2 at 80%: composed 72% -> -2800 bps.
    const legs = [
      sample(1_000n, 1_800n, 1n, 2n), // ratio 0.9
      sample(1_800n, 1_440n, 1n, 1n), // ratio 0.8
    ]
    expect(composePriceImpactBps(legs)).toBe(-2800)
  })

  test('a catastrophic route reads as ~-10,000 bps', () => {
    // exec unit 0.0001 of the marginal price.
    expect(composePriceImpactBps([sample(1_000_000n, 100n, 1n, 1n)])).toBe(-9999)
  })

  test('not computable: an empty route, a zero reference answer, or a zero side yields undefined', () => {
    expect(composePriceImpactBps([])).toBeUndefined()
    expect(composePriceImpactBps([sample(1_000n, 2_000n, 1n, 0n)])).toBeUndefined()
    expect(composePriceImpactBps([sample(1_000n, 0n, 1n, 2n)])).toBeUndefined()
    expect(composePriceImpactBps([sample(0n, 2_000n, 1n, 2n)])).toBeUndefined()
  })

  // The four laws the composition is, as opposed to the worked examples above. Each one is a
  // property of `Π(execOutᵢ·refInᵢ) / Π(execInᵢ·refOutᵢ)` that a "simplification" could quietly
  // break while every hand-picked case above kept passing — a per-leg average instead of a product
  // (loses permutation invariance the moment the legs differ), a division moved inside the loop
  // (loses scale invariance to truncation), a stray fee constant (loses the identity).
  describe('the composition laws', () => {
    const positive = fc.bigInt({ min: 1n, max: 10n ** 18n })
    const anySample = fc.record({ execIn: positive, execOut: positive, refIn: positive, refOut: positive })

    test('PERMUTATION INVARIANT: a route is a product of ratios, so leg order cannot change the figure', () => {
      fc.assert(
        fc.property(fc.array(anySample, { minLength: 1, maxLength: 5 }), (samples) => {
          expect(composePriceImpactBps([...samples].reverse())).toBe(composePriceImpactBps(samples))
        }),
      )
    })

    test('SCALE INVARIANT: multiplying a leg\'s two execution amounts by the same factor is a no-op', () => {
      // The figure is about unit PRICES, not sizes: measuring the same leg in wei or in gwei has to
      // give the same answer. Exact even in bigint, because the factor cancels before the division.
      fc.assert(
        fc.property(anySample, fc.bigInt({ min: 2n, max: 10n ** 6n }), (s, k) => {
          expect(composePriceImpactBps([{ ...s, execIn: s.execIn * k, execOut: s.execOut * k }])).toBe(composePriceImpactBps([s]))
          expect(composePriceImpactBps([{ ...s, refIn: s.refIn * k, refOut: s.refOut * k }])).toBe(composePriceImpactBps([s]))
        }),
      )
    })

    test('IDENTITY: a leg executing at exactly its reference unit price contributes nothing', () => {
      fc.assert(
        fc.property(positive, positive, fc.array(anySample, { minLength: 1, maxLength: 3 }), (execIn, execOut, rest) => {
          // Same unit price on both sides (literally the same pair of amounts), so this leg's ratio
          // is 1: alone it reports exactly 0, and inserted anywhere into a route it leaves that
          // route's figure untouched.
          const identity = { execIn, execOut, refIn: execIn, refOut: execOut }
          expect(composePriceImpactBps([identity])).toBe(0)
          expect(composePriceImpactBps([identity, ...rest])).toBe(composePriceImpactBps(rest))
          expect(composePriceImpactBps([...rest, identity])).toBe(composePriceImpactBps(rest))
        }),
      )
    })

    test('FLOORED AT -10,000: no composition can report giving up more than everything', () => {
      // A ratio of positive quantities is non-negative, so `(ratio − 1) × 10,000` cannot go below
      // −10,000 — the reading "this trade realizes 100% less per unit than the marginal price".
      // Nothing in the formula clamps; the bound is structural, and this is the assertion that it
      // stays structural.
      fc.assert(
        fc.property(fc.array(anySample, { minLength: 1, maxLength: 4 }), (samples) => {
          const bps = composePriceImpactBps(samples)
          expect(bps).toBeDefined()
          expect(bps!).toBeGreaterThanOrEqual(-10_000)
        }),
      )
    })
  })
})

// ---------------------------------------------------------------------------
// measureRouteImpact — degrade-to-absent, over a scripted quoting module
// ---------------------------------------------------------------------------

const MANIFEST: ChainManifest = {
  chainId: 1,
  wrappedNative: `0x${'ee'.repeat(20)}` as Address,
  v2: { factory: `0x${'66'.repeat(20)}` as Address, deploymentBlock: 0n },
}

/** A v2-shaped module whose quote answers `perUnit * amountIn` locally, or throws per the script. */
function scriptedModules(answer: (amountIn: bigint) => bigint | Error): Record<Protocol, ProtocolModule> {
  const v2 = {
    id: 'v2',
    enabled: () => true,
    encodeQuote: (_legs: unknown, amountIn: bigint) => ({
      call: { to: TOKEN_A, data: '0x00' },
      decode: () => {
        const out = answer(amountIn)
        if (out instanceof Error) throw out
        return { amountOut: out }
      },
    }),
  } as unknown as ProtocolModule
  return protocolRecord(() => v2)
}

const CLIENT = { request: async () => '0x' } as never

const POOL = v2PoolRef(`0x${'11'.repeat(20)}` as Address, TOKEN_A, TOKEN_B)
const ROUTE = { legs: [{ pool: POOL, currencyIn: TOKEN_A as never, currencyOut: TOKEN_B as never }] }

test('measureRouteImpact: one envelope at the dust amount, composed against the quote\'s own amounts', async () => {
  // Marginal price 2.0; the execution quote realized 1.8 per unit.
  const bps = await measureRouteImpact({
    client: CLIENT,
    modules: scriptedModules((amountIn) => amountIn * 2n),
    manifest: MANIFEST,
    blockNumber: 1n,
    route: ROUTE,
    quote: { amountIn: 100_000n, amountOut: 180_000n, intermediateAmounts: [] },
  })
  expect(bps).toBe(-1000)
})

test('measureRouteImpact: a reference leg that reverts degrades to absent, never throws', async () => {
  const bps = await measureRouteImpact({
    client: CLIENT,
    modules: scriptedModules(() => new Error('no pool here')),
    manifest: MANIFEST,
    blockNumber: 1n,
    route: ROUTE,
    quote: { amountIn: 100_000n, amountOut: 180_000n, intermediateAmounts: [] },
  })
  expect(bps).toBeUndefined()
})

test('measureRouteImpact: a quote whose amounts cannot describe its legs is not computable', async () => {
  const modules = scriptedModules((amountIn) => amountIn * 2n)
  const base = { client: CLIENT, modules, manifest: MANIFEST, blockNumber: 1n, route: ROUTE }
  // A two-leg amounts vector on a one-leg route (or vice versa) is a shape mismatch, not a guess.
  expect(
    await measureRouteImpact({ ...base, quote: { amountIn: 100_000n, amountOut: 1n, intermediateAmounts: [5n] } }),
  ).toBeUndefined()
  // Zero execution amounts cannot form a unit price.
  expect(
    await measureRouteImpact({ ...base, quote: { amountIn: 100_000n, amountOut: 0n, intermediateAmounts: [] } }),
  ).toBeUndefined()
})
