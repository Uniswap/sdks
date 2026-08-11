import type { Address, PublicClient } from 'viem'

import type { Semaphore } from '../internal/rpc'
import type { ProtocolModule } from '../protocols/types'
import type { ChainManifest, Protocol, RouteCandidate, RouteQuote } from '../types'

import type { LegRequest } from './measure'
import { measureLegs } from './measure'

// ---------------------------------------------------------------------------
// Price-impact REPORTING (never refusal) — the answering route's execution
// price compared against the same pools' marginal price, measured at a dust
// reference amount.
//
// This is a FACADE-triggered measurement: `router.ts#getQuote`/`getSwap`
// compute it exactly once, for the route they are about to answer with, as ONE
// extra `measureLegs` envelope per search (leader-only; alternatives never
// carry it). The engine itself neither ranks on it nor stores it — a route
// with catastrophic impact still quotes, still ranks by `amountOut`, and still
// answers; the number exists so the caller can SEE that the answer moves the
// pool, not so this package can refuse it.
//
// THE MEASUREMENT: each leg of the answering route is re-quoted at a dust
// reference amount — the leg's own execution input divided by 10,000 (floor 1)
// — so the reference unit price is as close to the pool's marginal (zero-size)
// price as one real quote can get without leaving the quoting machinery. The
// per-leg execution amounts are the quote's own (`amountIn`,
// `intermediateAmounts`, `amountOut`), so both prices describe the same legs
// at the same pinned block. v2 legs ride in the same envelope deliberately:
// their "quote" is the same `getReserves()` read the execution quote made
// (local math over reserves), so the marginal price costs nothing extra and
// stays on the one code path every other protocol uses.
//
// THE NUMBER: `priceImpactBps = (execution unit price / reference unit price
// − 1) × 10,000`, composed across legs as one product of per-leg ratios.
// Negative means execution gets less per unit than the marginal price — the
// ordinary direction; `−9_100` reads "this trade realizes 91% less per unit
// than the pool's marginal price", i.e. it moves the pool by ~91%. Small
// positive values are possible (fee rebates at dust sizes, rounding) and are
// reported as measured.
//
// FAILURE DEGRADES TO ABSENCE, NEVER BLOCKS THE ANSWER: a reference leg that
// reverts, is lost to the transport, is aborted by the caller's signal, or
// answers zero simply leaves `priceImpactBps` unset. Absent means "not
// computed", not "no impact".
// ---------------------------------------------------------------------------

/** One leg's two price samples: the execution amounts (the quote's own) and the dust-reference
 * measurement. All four are raw on-chain amounts; the ratio is taken pairwise so no division
 * happens until the final bps conversion. */
export type ImpactSample = { execIn: bigint; execOut: bigint; refIn: bigint; refOut: bigint }

/** The dust reference amount for one leg: its execution input / 10,000, floor 1 — small enough to
 * approximate the marginal price, never zero (a zero-amount quote is not a price). */
export function dustReference(amountIn: bigint): bigint {
  const dust = amountIn / 10_000n
  return dust > 0n ? dust : 1n
}

/**
 * Composes per-leg price ratios into one impact figure in bps (see the module header for sign and
 * meaning): `(Π(execOutᵢ·refInᵢ) / Π(execInᵢ·refOutᵢ) − 1) × 10,000`, floored to an integer.
 * `undefined` when any sample cannot form a ratio (a zero/negative denominator side) — impact is
 * then not computable, which the caller reports as absence.
 */
export function composePriceImpactBps(samples: ImpactSample[]): number | undefined {
  if (samples.length === 0) return undefined
  let num = 1n
  let den = 1n
  for (const s of samples) {
    if (s.execIn <= 0n || s.execOut <= 0n || s.refIn <= 0n || s.refOut <= 0n) return undefined
    num *= s.execOut * s.refIn
    den *= s.execIn * s.refOut
  }
  return Number((num * 10_000n) / den) - 10_000
}

export type MeasureRouteImpactArgs = {
  client: Pick<PublicClient, 'request'>
  modules: Record<Protocol, ProtocolModule>
  manifest: ChainManifest
  /** The search's pinned block — both prices must describe the same chain state. */
  blockNumber: bigint
  semaphore?: Semaphore | undefined
  multicall3?: Address | undefined
  /** The caller's own signal: an already-expired budget degrades the figure to absent rather than
   * issuing calls the caller said to stop. */
  signal?: AbortSignal | undefined
  /** The answering route and its quote — the amounts the execution prices are read from. */
  route: RouteCandidate
  quote: RouteQuote
}

/**
 * Measures the answering route's price impact: one `measureLegs` envelope quoting every leg at its
 * dust reference amount, composed against the quote's own execution amounts. Total over failure —
 * any leg that cannot produce a reference price yields `undefined`, never a throw: the answer this
 * figure annotates must not be blockable by its own annotation.
 */
export async function measureRouteImpact(args: MeasureRouteImpactArgs): Promise<number | undefined> {
  const { route, quote } = args
  const amounts = [quote.amountIn, ...quote.intermediateAmounts, quote.amountOut]
  if (amounts.length !== route.legs.length + 1) return undefined
  if (amounts.some((a) => a <= 0n)) return undefined

  const requests: LegRequest[] = route.legs.map((leg, i) => ({
    key: `impact|${i}`,
    pool: leg.pool,
    currencyIn: leg.currencyIn,
    currencyOut: leg.currencyOut,
    amountIn: dustReference(amounts[i]!),
    ...(leg.hookData !== undefined && { hookData: leg.hookData }),
  }))

  let outcomes
  try {
    // `measureLegs` is total by contract; the try is the belt for a bug below it — a broken
    // reference measurement must degrade to absence, not take the answer down.
    outcomes = await measureLegs({
      client: args.client,
      modules: args.modules,
      manifest: args.manifest,
      legs: requests,
      blockNumber: args.blockNumber,
      semaphore: args.semaphore,
      multicall3: args.multicall3,
      signal: args.signal,
    })
  } catch {
    return undefined
  }

  const byKey = new Map(outcomes.map((o) => [o.key, o]))
  const samples: ImpactSample[] = []
  for (let i = 0; i < route.legs.length; i++) {
    const outcome = byKey.get(`impact|${i}`)
    if (outcome?.kind !== 'success' || outcome.amountOut <= 0n) return undefined
    samples.push({ execIn: amounts[i]!, execOut: amounts[i + 1]!, refIn: requests[i]!.amountIn, refOut: outcome.amountOut })
  }
  return composePriceImpactBps(samples)
}
