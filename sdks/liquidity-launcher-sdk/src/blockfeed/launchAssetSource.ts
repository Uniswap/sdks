import type { Hex } from 'viem'

import { computeLbpPoolId } from '../poolId'
import {
  type AuctionCheckpoint,
  type InitializedTick,
  type TickFillRatio,
  clearingPriceCall,
  currencyRaisedCall,
  deriveAuctionOutcome,
  deriveTickFillRatios,
  isGraduatedCall,
  remainingSupplyCall,
  slot0Call,
  tickDataCall,
} from '../reads'
import type { ContractCall } from '../reads'

import type { LaunchAssetSourceArgs, LaunchAssetState, Source, SpeculativeCall, TickData } from './types'

/** 2^288 — numerator for the currency-per-token inversion below. */
const Q288 = 1n << 288n

/**
 * Tag a descriptor as failure-tolerant. EVERY call this source issues is `allowFailure: true` so that
 * a reverting read (a not-yet-started `checkpoint()`, a stale lens address, a pool that does not exist
 * yet) is isolated to THIS source and never escalates to the engine. In the shared heartbeat a
 * non-speculative failure throws `TickFailedError` and fails the whole tick for EVERY source on the
 * chain (backoff + stale) — a source must never have the power to poison unrelated token-page feeds.
 * `derive` already treats any non-success result as "return undefined / keep prev", so per-source
 * behavior is unchanged; failures simply stop propagating.
 */
function tolerant(call: ContractCall): SpeculativeCall {
  return { ...call, allowFailure: true }
}

/**
 * Convert a v4 `getSlot0` sqrtPriceX96 into a Q96 raw-currency-per-raw-token price, matching the
 * orientation of the auction's clearing price so the stream stays continuous across graduation.
 *
 * A v4 sqrtPriceX96 encodes `sqrt(token1/token0)`, so `token1/token0 = sqrtPriceX96^2 / 2^192`.
 * Quick-launch raises in native ETH (`address(0)`), which sorts first → `currency0 == native` and
 * `currency1 == token`. Currency-per-token is therefore `token0/token1 = 1 / (token1/token0)`, whose
 * Q96 form is `2^96 / (sqrtPriceX96^2 / 2^192) = 2^288 / sqrtPriceX96^2`.
 *
 * NOTE: this assumes the raise currency is `currency0` (always true for native-ETH quick-launch). The
 * raw `poolSqrtPriceX96` is emitted alongside for consumers needing orientation-independent data.
 */
function poolPriceX96FromSqrt(sqrtPriceX96: bigint): bigint {
  return Q288 / (sqrtPriceX96 * sqrtPriceX96)
}

/** The graduated pool's initialized sqrtPriceX96 if the (speculative) slot0 read succeeded non-zero. */
function readPoolSqrtPrice(tick: TickData): bigint | undefined {
  const res = tick.results['slot0']
  if (!res || res.status !== 'success') return undefined
  const sqrtPriceX96 = (res.result as readonly unknown[])[0] as bigint
  return sqrtPriceX96 === 0n ? undefined : sqrtPriceX96
}

/** Build the emission for a graduated pool from a known sqrtPriceX96 and carried-forward auction totals. */
function graduatedEmission(
  tick: TickData,
  poolSqrtPriceX96: bigint,
  carried: { currencyRaised: bigint; remainingSupply: bigint }
) {
  return {
    value: {
      phase: 'graduated' as const,
      priceX96: poolPriceX96FromSqrt(poolSqrtPriceX96),
      poolSqrtPriceX96,
      currencyRaised: carried.currencyRaised,
      remainingSupply: carried.remainingSupply,
    },
    phase: 'graduated',
    identity: tick.identity,
  }
}

/**
 * The composite launch-lifecycle {@link Source}: one continuous, phase-tagged stream across a
 * quick-launch asset's two lives — the live auction and the graduated v4 pool — with no gap tick at
 * graduation. A pure reducer; all phase/cross-tick memory flows through `ctx.prev`.
 *
 * **Call set varies by phase** (looked up keyed, never positionally):
 * - *auction* (or `prev` undefined): `checkpoint`, `currencyRaised`, `remainingSupply`, `isGraduated`,
 *   the lens `tickData`, PLUS — always — the graduated pool's `StateView.getSlot0` as a speculative
 *   read (`allowFailure: true`). The pool's poolId is known deterministically from the launch params,
 *   so this read fails harmlessly every tick until the pool exists.
 * - *failed* (`prev.phase === 'failed'`): shrinks to `isGraduated` + the speculative `slot0` — a
 *   `migrate()` can still land late and graduate the auction after `endBlock`, so we keep watching.
 * - *graduated* (`prev.phase === 'graduated'`): only `StateView.getSlot0`.
 *
 * **No-gap guarantee:** because the speculative `slot0` is present on every pre-graduation tick, the
 * exact tick where `isGraduated` flips reads the freshly-initialized pool in the SAME multicall batch
 * — so the emission carries `phase: 'graduated'` AND `poolSqrtPriceX96` at the same block number. No
 * discovery, no indexer wait, no unsubscribe/resubscribe race, no one-block price hole.
 *
 * Phase is derived from `deriveAuctionOutcome(isGraduated, endBlock, currentBlock)`; `currentBlock` is
 * the tick's block number. On L1-block-domain chains (Arbitrum) `endBlock` and the L2 head differ —
 * that block-domain reconciliation is out of scope for v1 (OP-stack / Base targets, where they align).
 */
export function launchAssetSource(args: LaunchAssetSourceArgs): Source<LaunchAssetState> {
  const { chainId, auction, tickDataLens, poolKey, stateView, endBlock } = args

  // Deterministic graduated-pool id. The poolKey currencies are already address-sorted, so passing
  // them as (currency0, currency1) to computeLbpPoolId (which re-sorts) yields the canonical id.
  const poolId: Hex = computeLbpPoolId(
    poolKey.currency0,
    poolKey.currency1,
    poolKey.fee,
    poolKey.tickSpacing,
    poolKey.hooks
  )
  const speculativeSlot0: SpeculativeCall = tolerant(slot0Call({ stateView, poolId }))
  const key = `launchAsset:${chainId}:${auction.toLowerCase()}`

  return {
    key,
    // Every call is `allowFailure: true` in every phase — see `tolerant` for the isolation rationale.
    calls(ctx): Record<string, SpeculativeCall> {
      const prevPhase = ctx.prev?.value.phase
      if (prevPhase === 'graduated') {
        // Steady-state graduated: only the pool price matters now.
        return { slot0: speculativeSlot0 }
      }
      if (prevPhase === 'failed') {
        // Keep watching for a late graduation; the full auction read-set is no longer meaningful.
        return { isGraduated: tolerant(isGraduatedCall(auction)), slot0: speculativeSlot0 }
      }
      // Auction (or first tick): full read-set + always-on speculative pool read.
      return {
        checkpoint: tolerant(clearingPriceCall(auction)),
        currencyRaised: tolerant(currencyRaisedCall(auction)),
        remainingSupply: tolerant(remainingSupplyCall(auction)),
        isGraduated: tolerant(isGraduatedCall(auction)),
        tickData: tolerant(tickDataCall(tickDataLens, auction)),
        slot0: speculativeSlot0,
      }
    },
    derive(tick: TickData, ctx) {
      const prev = ctx.prev
      const poolSqrtPriceX96 = readPoolSqrtPrice(tick)

      // --- Steady-state graduated: pool price only, auction totals carried forward. ---
      if (prev?.value.phase === 'graduated') {
        if (poolSqrtPriceX96 === undefined) return undefined // transient read miss → keep prev
        return graduatedEmission(tick, poolSqrtPriceX96, prev.value)
      }

      // --- Failed regime: watch isGraduated for a late migrate(). ---
      if (prev?.value.phase === 'failed') {
        const isGradRes = tick.results['isGraduated']
        if (isGradRes?.status !== 'success') return undefined
        if ((isGradRes.result as boolean) && poolSqrtPriceX96 !== undefined) {
          return graduatedEmission(tick, poolSqrtPriceX96, prev.value)
        }
        // Still failed: re-emit the frozen final auction snapshot (suppressed by valueEquals if equal).
        return {
          value: {
            phase: 'failed',
            priceX96: prev.value.priceX96,
            currencyRaised: prev.value.currencyRaised,
            remainingSupply: prev.value.remainingSupply,
            tickFillRatios: prev.value.tickFillRatios,
          },
          phase: 'failed',
          identity: tick.identity,
        }
      }

      // --- Auction / first tick: full read-set required. ---
      const checkpoint = tick.results['checkpoint']
      const currencyRaised = tick.results['currencyRaised']
      const remainingSupply = tick.results['remainingSupply']
      const isGraduated = tick.results['isGraduated']
      const tickData = tick.results['tickData']
      if (
        checkpoint?.status !== 'success' ||
        currencyRaised?.status !== 'success' ||
        remainingSupply?.status !== 'success' ||
        isGraduated?.status !== 'success' ||
        tickData?.status !== 'success'
      ) {
        return undefined
      }

      const raised = currencyRaised.result as bigint
      const remaining = remainingSupply.result as bigint
      const graduatedFlag = isGraduated.result as boolean
      const outcome = deriveAuctionOutcome({
        isGraduated: graduatedFlag,
        endBlock,
        currentBlock: tick.identity.blockNumber,
      })

      // Graduation edge: the speculative slot0 has succeeded in this same batch → no gap.
      if (outcome === 'graduated' && poolSqrtPriceX96 !== undefined) {
        return graduatedEmission(tick, poolSqrtPriceX96, { currencyRaised: raised, remainingSupply: remaining })
      }

      const clearingPrice = (checkpoint.result as AuctionCheckpoint).clearingPrice
      const fillRatios: TickFillRatio[] = deriveTickFillRatios(tickData.result as readonly InitializedTick[])
      // 'active' → auction; 'failed' → failed. A 'graduated' outcome without a pool read this tick
      // (defensive; the atomic-batch guarantee makes it a no-op) degrades to 'auction' so the phase
      // event and first pool price still land together on the tick slot0 succeeds.
      const phase = outcome === 'failed' ? 'failed' : 'auction'
      return {
        value: {
          phase,
          priceX96: clearingPrice,
          currencyRaised: raised,
          remainingSupply: remaining,
          tickFillRatios: fillRatios,
        },
        phase,
        identity: tick.identity,
      }
    },
    valueEquals(a, b) {
      // Intentionally ignores `tickFillRatios`: during the auction the clearing price (`priceX96`)
      // decays every block, so an emission is virtually never suppressed mid-auction anyway; once the
      // auction ends the ratios are frozen. Comparing the (potentially large) ratio array every tick
      // would be pure cost for no practical suppression benefit.
      return (
        a.phase === b.phase &&
        a.priceX96 === b.priceX96 &&
        a.poolSqrtPriceX96 === b.poolSqrtPriceX96 &&
        a.currencyRaised === b.currencyRaised &&
        a.remainingSupply === b.remainingSupply
      )
    },
  }
}
