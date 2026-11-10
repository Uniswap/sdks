import { type Address, type PublicClient } from 'viem'

import { LENDING_ADAPTER_ABI } from './abis.js'
import { WAD } from './constants.js'
import { MarginSdkError } from './errors.js'
import { quoteCollateralForDebt, toUint128, withSlippageUp } from './math.js'
import { type Market } from './types.js'

/**
 * Interest-accrual estimation for sizing the full-close swap buffer. A close route must buy AT
 * LEAST the live debt, and debt keeps accruing between the quote and inclusion — but a Universal
 * Router route is static calldata, so the exact-output amount has to be fixed offchain. A flat
 * slippage buffer conflates two different risks (swap price movement vs. interest accrual) and is
 * wrong in both directions: too small on a high-utilization market, pure over-buy on a quiet one.
 *
 * This module splits the accrual side out and sizes it from the position's own realized growth:
 * 1. {@link measureBorrowRatePerSecond} samples the interest-accrued debt (`adapter.positionOf`)
 *    at two blocks and derives the realized per-second growth rate. Venue-agnostic: the same
 *    read works on Morpho Blue, Aave v3, Aave v4, and Compound v3, and it prices in venue quirks
 *    (share rounding, premium-inclusive debt) that a nominal APR read would miss.
 * 2. {@link projectDebt} / {@link estimateInterestAccrual} compound the rate over the expected
 *    inclusion horizon (3-term Taylor of e^x, the same series Morpho accrues with).
 * 3. {@link sizeFullClose} composes both with the swap-slippage cap, mirroring `sizeDecrease`.
 */

/** Converts a block-count horizon into seconds. Mainnet default: 12 seconds per block. */
export function blocksToSeconds(blocks: bigint, secondsPerBlock = 12n): bigint {
  if (blocks < 0n || secondsPerBlock <= 0n) {
    throw new MarginSdkError('INVALID_INPUT', 'blocks must be non-negative and secondsPerBlock positive')
  }
  return blocks * secondsPerBlock
}

/**
 * The interest a position accrues on `debtAmount` at `ratePerSecondWad` over `seconds`, rounded
 * up (a buffer must cover, never undershoot). Growth compounds with the 3-term Taylor expansion
 * of `e^(rate * seconds) - 1` — the exact series Morpho Blue accrues with, an upper bound on
 * Compound v3's linear accrual, and within dust of Aave's binomial compounding on any realistic
 * inclusion horizon (minutes, not months).
 */
export function estimateInterestAccrual(p: {
  /** The current debt, in the debt token's native decimals. */
  debtAmount: bigint
  /** The per-second borrow growth rate, WAD-scaled (1e18 == 100% per second). */
  ratePerSecondWad: bigint
  /** The horizon to accrue over, in seconds (see {@link blocksToSeconds}). */
  seconds: bigint
}): bigint {
  if (p.debtAmount < 0n || p.ratePerSecondWad < 0n || p.seconds < 0n) {
    throw new MarginSdkError('INVALID_INPUT', 'debtAmount, ratePerSecondWad, and seconds must be non-negative')
  }
  const x = p.ratePerSecondWad * p.seconds
  const secondTerm = (x * x) / (2n * WAD)
  const thirdTerm = (secondTerm * x) / (3n * WAD)
  const growth = x + secondTerm + thirdTerm
  // ceil: the buffer must cover the projected debt, so rounding always works against undershoot
  return (p.debtAmount * growth + WAD - 1n) / WAD
}

/** `debtAmount` projected forward by {@link estimateInterestAccrual} over the same horizon. */
export function projectDebt(p: { debtAmount: bigint; ratePerSecondWad: bigint; seconds: bigint }): bigint {
  return p.debtAmount + estimateInterestAccrual(p)
}

/** A realized borrow-rate measurement returned by {@link measureBorrowRatePerSecond}. */
export interface BorrowRateSample {
  /** The realized per-second growth rate of the position's debt, WAD-scaled. */
  ratePerSecondWad: bigint
  /** The wall-clock seconds between the two sampled blocks. */
  elapsedSeconds: bigint
  /** The interest-accrued debt at the lookback block. */
  debtBefore: bigint
  /** The interest-accrued debt at the latest block. */
  debtAfter: bigint
  /** The lookback block number the first sample was read at. */
  fromBlock: bigint
  /** The latest block number the second sample was read at. */
  toBlock: bigint
}

/**
 * Measures the position's realized per-second borrow growth by reading its interest-accrued debt
 * (`adapter.positionOf`) at two blocks `lookbackBlocks` apart. Venue-agnostic and
 * position-specific: whatever the venue's rate model, share rounding, or debt premium does shows
 * up in the measurement.
 *
 * The lookback window MUST NOT contain a mutation of this position. A repay inside the window
 * makes the debt shrink and this throws; a borrow inside the window silently inflates the
 * measured rate (a conservative failure for buffer sizing, but a wrong rate). After mutating a
 * position, measure with a `lookbackBlocks` small enough to start after the mutation. The default
 * (64 blocks, about 13 minutes on mainnet) stays inside the state window that non-archive nodes
 * serve.
 */
export async function measureBorrowRatePerSecond(
  client: PublicClient,
  p: { adapter: Address; account: Address; market: Market; lookbackBlocks?: bigint }
): Promise<BorrowRateSample> {
  const lookback = p.lookbackBlocks ?? 64n
  if (lookback <= 0n) {
    throw new MarginSdkError('INVALID_INPUT', 'lookbackBlocks must be positive')
  }
  const toBlock = await client.getBlock()
  const fromBlockNumber = toBlock.number - lookback
  if (fromBlockNumber < 0n) {
    throw new MarginSdkError('INVALID_INPUT', `lookbackBlocks ${lookback} reaches below block 0`)
  }
  const fromBlock = await client.getBlock({ blockNumber: fromBlockNumber })
  const positionAt = (blockNumber: bigint) =>
    client.readContract({
      address: p.adapter,
      abi: LENDING_ADAPTER_ABI,
      functionName: 'positionOf',
      args: [p.account, p.market],
      blockNumber,
    }) as Promise<readonly [bigint, bigint]>
  const [[, debtBefore], [, debtAfter]] = await Promise.all([positionAt(fromBlockNumber), positionAt(toBlock.number)])

  const elapsedSeconds = toBlock.timestamp - fromBlock.timestamp
  if (elapsedSeconds <= 0n) {
    throw new MarginSdkError('INVALID_INPUT', 'sampled blocks are not separated in time; increase lookbackBlocks')
  }
  if (debtBefore === 0n) {
    throw new MarginSdkError(
      'INVALID_INPUT',
      'no debt at the lookback block (position opened or fully repaid inside the window) — shrink lookbackBlocks'
    )
  }
  if (debtAfter < debtBefore) {
    throw new MarginSdkError(
      'INVALID_INPUT',
      'debt decreased across the window (a repay landed inside it) — shrink lookbackBlocks past the mutation'
    )
  }

  return {
    ratePerSecondWad: ((debtAfter - debtBefore) * WAD) / (debtBefore * elapsedSeconds),
    elapsedSeconds,
    debtBefore,
    debtAfter,
    fromBlock: fromBlockNumber,
    toBlock: toBlock.number,
  }
}

/**
 * Sizes a full close: the accrual-buffered exact-output the route must buy (`debtToBuy`) and the
 * slippage-buffered collateral cap (`maxCollateralIn`), keeping the two risks separately priced.
 * `debtToBuy` is the route's `amountOut` (and what the router's coverage assert is measured
 * against); `maxCollateralIn` is the binding spend cap. The over-buy is now just the projected
 * accrual plus `extraBufferBps`, instead of a flat slippage haircut on the whole debt.
 */
export function sizeFullClose(p: {
  /** The current debt (read via `describePosition`/`positionOf`), in native decimals. */
  debtAmount: bigint
  /** The per-second borrow rate, from {@link measureBorrowRatePerSecond} or the caller's own source. */
  ratePerSecondWad: bigint
  /** The expected blocks until inclusion. */
  horizonBlocks: bigint
  /** Seconds per block; mainnet default 12. */
  secondsPerBlock?: bigint
  /**
   * Safety margin in bps on top of the projection (default 1), covering rate drift between the
   * measurement and inclusion and venue rounding at wei scale.
   */
  extraBufferBps?: number
  /** Quoted price: collateral-wei per one whole debt token (see `sizeDecrease`). */
  priceCollateralPerDebtToken: bigint
  /** The debt token's decimals. */
  debtDecimals: number
  /** Swap-slippage headroom in bps applied to the quoted collateral cost. */
  slippageBps: number
}): { debtToBuy: bigint; maxCollateralIn: bigint; accrualBuffer: bigint } {
  if (p.debtAmount <= 0n) {
    throw new MarginSdkError('INVALID_AMOUNT', 'debtAmount must be positive (a zero-debt close is swap-free)')
  }
  const projected = projectDebt({
    debtAmount: p.debtAmount,
    ratePerSecondWad: p.ratePerSecondWad,
    seconds: blocksToSeconds(p.horizonBlocks, p.secondsPerBlock ?? 12n),
  })
  const debtToBuy = toUint128(withSlippageUp(projected, p.extraBufferBps ?? 1), 'debtToBuy')
  const quoted = quoteCollateralForDebt({
    debtAmount: debtToBuy,
    priceCollateralPerDebtToken: p.priceCollateralPerDebtToken,
    debtDecimals: p.debtDecimals,
  })
  return {
    debtToBuy,
    maxCollateralIn: toUint128(withSlippageUp(quoted, p.slippageBps), 'maxCollateralIn'),
    accrualBuffer: debtToBuy - p.debtAmount,
  }
}
