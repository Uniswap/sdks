import { type Currency, Token } from '@uniswap/sdk-core'

import { getChainAddresses } from '../addresses'
import type { BlockfeedClient, PathLeg, PoolRef, PricePath } from '../types'

import { enumerateCandidates } from './enumerate'
import { probeCandidates } from './probe'
import { pickBest, scoreProbe } from './rank'
import type { CandidatePool, DiscoveryOptions, NoPathFound } from './types'

/** Injectable seams so orchestration can be tested without a chain (defaults bind the real fns). */
export interface DiscoverDeps {
  enumerateCandidates: typeof enumerateCandidates
  probeCandidates: typeof probeCandidates
  pickBest: typeof pickBest
}

const defaultDeps: DiscoverDeps = { enumerateCandidates, probeCandidates, pickBest }

/** True when two currencies are the same logical asset, treating native ETH and its WETH as one. */
function sameCurrency(a: Currency, b: Currency): boolean {
  return a.wrapped.equals(b.wrapped)
}

/** Human label for a currency in diagnostics: its symbol, else its wrapped address. */
function label(c: Currency): string {
  return c.symbol ?? c.wrapped.address
}

/**
 * Pre-cap candidates probed per pair. v3/v4 pools are ranked by in-range liquidity descending
 * (undefined — an unread/failed liquidity call — sorts last) and truncated to `max`; v2 pools carry
 * no liquidity reading and are ALWAYS kept (they are cheap to probe and cannot fake `L`). The cap
 * only bounds probe count; final selection is purely executable ranking.
 */
function capCandidates(cands: CandidatePool[], max: number): CandidatePool[] {
  if (max <= 0 || cands.length <= max) return cands
  const v2 = cands.filter((c) => c.ref.protocol === 'v2')
  const others = cands.filter((c) => c.ref.protocol !== 'v2')
  others.sort((a, b) => {
    const la = a.inRangeLiquidity
    const lb = b.inRangeLiquidity
    if (la === undefined && lb === undefined) return 0
    if (la === undefined) return 1
    if (lb === undefined) return -1
    return la > lb ? -1 : la < lb ? 1 : 0
  })
  const slots = Math.max(0, max - v2.length)
  return [...v2, ...others.slice(0, slots)]
}

function directLeg(pool: PoolRef, base: Currency, quote: Currency): PathLeg[] {
  return [{ pool, base, quote }]
}

/**
 * Two-hop executable score, using data already probed (no extra RPC): raw base bought via
 * quote→I→base (`buyOut2hop`), scaled by BOTH legs' round-trip retention — leg 1's base→I recovery
 * (`l1RoundTrip / buyOutI`) and leg 2's I→quote recovery (`l2RoundTrip / notional`). Any factor with
 * a non-positive numerator or denominator collapses the score to `0`, matching {@link scoreProbe}'s
 * broken-probe semantics. Leg 1's factor is what penalizes a manipulated thin base/I pool whose round
 * trip collapses — dropping it would let such a pool win on leg 2's retention alone. Float precision
 * is fine: this only orders contenders.
 */
function compositeScore(
  buyOut2hop: bigint,
  l1RoundTrip: bigint,
  buyOutI: bigint,
  l2RoundTrip: bigint,
  notional: bigint
): number {
  if (buyOut2hop <= 0n || l1RoundTrip <= 0n || buyOutI <= 0n || l2RoundTrip <= 0n || notional <= 0n) return 0
  return Number(buyOut2hop) * (Number(l1RoundTrip) / Number(buyOutI)) * (Number(l2RoundTrip) / Number(notional))
}

/** A scored candidate route (direct or 2-hop), reduced to the legs it would emit. */
interface Contender {
  score: number
  legs: PathLeg[]
}

/**
 * Discover the best executable price path from `base` to `quote` on `chainId` — the "router-lite":
 * enumerate candidate pools, probe-quote each in both directions at a fixed notional, and select the
 * winner by two-way executable quality (never spot price or raw liquidity, both cheap to fake).
 *
 * Considers the direct `base/quote` pools plus, when `maxHops >= 2` (the default), one 2-hop route
 * through each intermediary (default: the chain's WETH). The 2-hop assembly, per intermediary I:
 *  1. probe `I/quote` at `notional` → best leg L2 and the implied I amount it buys (`L2.buyOut`);
 *  2. probe `base/I` using that I amount as the notional → best leg L1;
 *  3. compose a two-hop score from `L1.buyOut` (base bought via quote→I→base) scaled by BOTH legs'
 *     round-trip retention — leg 1 (`L1.roundTripOut / L2.buyOut`) and leg 2 (`L2.roundTripOut /
 *     notional`) — so a thin/manipulated leg-1 pool whose round trip collapses is penalized.
 * The highest-scoring contender wins. Legs are oriented base→quote (2-hop: `base/I` then `I/quote`).
 * When nothing scores above zero, a {@link NoPathFound} naming the pair and probe count is returned.
 *
 * `_deps` injects the enumerate/probe/rank seams for orchestration tests; production uses the real
 * implementations.
 */
export async function discoverPricePath(
  client: BlockfeedClient,
  args: { chainId: number; base: Currency; quote: Currency; options?: DiscoveryOptions },
  _deps: DiscoverDeps = defaultDeps
): Promise<PricePath | NoPathFound> {
  const { chainId, base, quote } = args
  const options = args.options ?? {}
  const maxHops = options.maxHops ?? 2
  const notional = options.probeNotional ?? 10n ** BigInt(quote.decimals) * 1000n
  const cap = options.maxProbeCandidatesPerPair ?? 12
  const enumOpts = { hookAllowlist: options.hookAllowlist, fromBlockOverride: options.fromBlockOverride }

  const { weth } = getChainAddresses(chainId)
  const intermediaries = options.intermediaries ?? [new Token(chainId, weth, 18, 'WETH')]

  let totalProbed = 0
  const contenders: Contender[] = []

  // --- Direct base/quote. ---
  const directCands = capCandidates(await _deps.enumerateCandidates(client, chainId, base, quote, enumOpts), cap)
  totalProbed += directCands.length
  const directProbes = await _deps.probeCandidates(client, chainId, directCands, base, quote, notional)
  const bestDirect = _deps.pickBest(directProbes, notional)
  if (bestDirect) {
    contenders.push({ score: scoreProbe(bestDirect, notional), legs: directLeg(bestDirect.candidate.ref, base, quote) })
  }

  // --- 2-hop through each intermediary. ---
  if (maxHops >= 2) {
    for (const inter of intermediaries) {
      if (sameCurrency(inter, base) || sameCurrency(inter, quote)) continue

      // Step 1: I/quote — how much I does `notional` of quote buy, and the best leg to do it.
      const iqCands = capCandidates(await _deps.enumerateCandidates(client, chainId, inter, quote, enumOpts), cap)
      totalProbed += iqCands.length
      const iqProbes = await _deps.probeCandidates(client, chainId, iqCands, inter, quote, notional)
      const l2 = _deps.pickBest(iqProbes, notional)
      if (!l2 || l2.buyOut <= 0n) continue
      const buyOutI = l2.buyOut

      // Step 3: base/I — using that I amount as the notional, buy base.
      const biCands = capCandidates(await _deps.enumerateCandidates(client, chainId, base, inter, enumOpts), cap)
      totalProbed += biCands.length
      const biProbes = await _deps.probeCandidates(client, chainId, biCands, base, inter, buyOutI)
      const l1 = _deps.pickBest(biProbes, buyOutI)
      if (!l1 || l1.buyOut <= 0n) continue

      // Two-hop composite retention: base bought via quote→I→base (`l1.buyOut`), scaled by BOTH legs'
      // round-trip retention — leg 1 (base→I: `l1.roundTripOut`/`buyOutI`) AND leg 2 (I→quote:
      // `l2.roundTripOut`/`notional`). Including leg 1's factor is adversarially load-bearing: a
      // manipulated thin base/I pool whose round trip collapses is penalized here rather than hidden.
      const score = compositeScore(l1.buyOut, l1.roundTripOut, buyOutI, l2.roundTripOut, notional)
      if (score > 0) {
        contenders.push({
          score,
          legs: [
            { pool: l1.candidate.ref, base, quote: inter },
            { pool: l2.candidate.ref, base: inter, quote },
          ],
        })
      }
    }
  }

  let winner: Contender | undefined
  for (const c of contenders) {
    if (!winner || c.score > winner.score) winner = c
  }
  if (!winner || winner.score <= 0) {
    return {
      kind: 'no-path',
      reason: `No viable price path for ${label(base)}/${label(quote)}: probed ${totalProbed} candidate(s), none produced a positive two-way executable score.`,
    }
  }

  return { base, quote, legs: winner.legs }
}
