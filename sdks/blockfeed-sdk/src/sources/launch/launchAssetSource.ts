import { type TickFillRatio, deriveAuctionOutcome, deriveTickFillRatios, isGraduatedCall } from '@uniswap/liquidity-launcher-sdk'
import type { Address, Hex } from 'viem'

import { STATE_VIEW_ABI } from '../../abis'
import { getChainAddresses } from '../../addresses'
import { poolIdFromPoolKey } from '../../math/poolId'
import type { ContractCall, Source, TickData } from '../../types'

import { auctionCallSet, readAuctionResults, tolerant } from './auctionReads'
import type { LaunchAssetSourceArgs, LaunchAssetState } from './types'

/** 2^288 — numerator for the currency-per-token inversion below. */
const Q288 = 1n << 288n

/**
 * Blockfeed's own v4 StateView `getSlot0(poolId)` descriptor (it owns the v4 reads), always
 * failure-tolerant — see `tolerant` in auctionReads for the isolation rationale.
 */
function slot0Descriptor(stateView: Address, poolId: Hex): ContractCall {
  return { address: stateView, abi: STATE_VIEW_ABI, functionName: 'getSlot0', args: [poolId], allowFailure: true }
}

/** Decode a successful `getSlot0` result to its `sqrtPriceX96` (first tuple element). */
function decodeSlot0SqrtPriceX96(result: unknown): bigint {
  return (result as readonly unknown[])[0] as bigint
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
  const sqrtPriceX96 = decodeSlot0SqrtPriceX96(res.result)
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
    identity: tick.identity,
  }
}

/**
 * The composite launch-lifecycle {@link Source}: one continuous, phase-tagged stream across a
 * quick-launch asset's two lives — the live auction and the graduated v4 pool — with no gap tick at
 * graduation. A pure reducer; all phase/cross-tick memory flows through `prev`.
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
 *
 * The v4 StateView address is resolved internally from `chainId` via `getChainAddresses`.
 */
export function launchAssetSource(args: LaunchAssetSourceArgs): Source<LaunchAssetState> {
  const { chainId, auction, tickDataLens, poolKey, endBlock } = args
  const stateView = getChainAddresses(chainId).v4StateView

  // Deterministic graduated-pool id. The poolKey currencies are already address-sorted, so this
  // matches the canonical on-chain PoolKey.toId().
  const poolId: Hex = poolIdFromPoolKey(poolKey)
  const speculativeSlot0: ContractCall = slot0Descriptor(stateView, poolId)
  const key = `launchAsset:${chainId}:${auction.toLowerCase()}`

  return {
    key,
    // Every call is `allowFailure: true` in every phase — see `tolerant` for the isolation rationale.
    calls(prev): Record<string, ContractCall> {
      const prevPhase = prev?.value.phase
      if (prevPhase === 'graduated') {
        // Steady-state graduated: only the pool price matters now.
        return { slot0: speculativeSlot0 }
      }
      if (prevPhase === 'failed') {
        // Keep watching for a late graduation; the full auction read-set is no longer meaningful.
        return { isGraduated: tolerant(isGraduatedCall(auction)), slot0: speculativeSlot0 }
      }
      // Auction (or first tick): full read-set + always-on speculative pool read.
      return auctionCallSet(auction, tickDataLens, speculativeSlot0)
    },
    derive(tick: TickData, prev) {
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
          identity: tick.identity,
        }
      }

      // --- Auction / first tick: full read-set required. ---
      const results = readAuctionResults(tick)
      if (results === undefined) return undefined

      const raised = results.currencyRaised
      const remaining = results.remainingSupply
      const outcome = deriveAuctionOutcome({
        isGraduated: results.isGraduated,
        endBlock,
        currentBlock: tick.identity.blockNumber,
      })

      // Graduation edge: the speculative slot0 has succeeded in this same batch → no gap.
      if (outcome === 'graduated' && poolSqrtPriceX96 !== undefined) {
        return graduatedEmission(tick, poolSqrtPriceX96, { currencyRaised: raised, remainingSupply: remaining })
      }

      const clearingPrice = results.clearingPrice
      const fillRatios: TickFillRatio[] = deriveTickFillRatios(results.ticks)
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
