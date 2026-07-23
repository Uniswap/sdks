import { type Address, isAddressEqual, zeroAddress } from 'viem'

import { MarginSdkError } from './errors'
import { type Market, type PoolKey } from './types'

/**
 * Market and pool-key helpers mirroring the onchain `Market` type: the single choke point that
 * reconciles a v4 pool with a `(collateral, debt)` market and derives swap direction.
 */

/** Whether `a` sorts before `b` under v4's canonical currency ordering (numeric address order). */
export function sortsBefore(a: Address, b: Address): boolean {
  return BigInt(a) < BigInt(b)
}

/**
 * Builds a canonically-ordered v4 `PoolKey` from an unordered currency pair. Defaults to a
 * hookless pool.
 */
export function toPoolKey(p: {
  currencyA: Address
  currencyB: Address
  fee: number
  tickSpacing: number
  hooks?: Address
}): PoolKey {
  if (isAddressEqual(p.currencyA, p.currencyB)) {
    throw new MarginSdkError('INVALID_MARKET', 'pool currencies must be distinct')
  }
  const [currency0, currency1] = sortsBefore(p.currencyA, p.currencyB)
    ? [p.currencyA, p.currencyB]
    : [p.currencyB, p.currencyA]
  return { currency0, currency1, fee: p.fee, tickSpacing: p.tickSpacing, hooks: p.hooks ?? zeroAddress }
}

/** Validates a market: distinct, non-zero ERC-20 addresses (native ETH is not a margin currency). */
export function validateMarket(market: Market): void {
  if (isAddressEqual(market.collateral, zeroAddress) || isAddressEqual(market.debt, zeroAddress)) {
    throw new MarginSdkError(
      'INVALID_MARKET',
      'margin markets are ERC-20 only: use WETH, not the native-ETH zero address'
    )
  }
  if (isAddressEqual(market.collateral, market.debt)) {
    throw new MarginSdkError('INVALID_MARKET', 'market collateral and debt must be distinct tokens')
  }
}

/**
 * True iff the unordered pair `{a, b}` equals the market's `{collateral, debt}` pair
 * (order-insensitive), mirroring `Market.hasCurrencies`.
 */
export function marketHasCurrencies(market: Market, a: Address, b: Address): boolean {
  return (
    (isAddressEqual(a, market.collateral) && isAddressEqual(b, market.debt)) ||
    (isAddressEqual(a, market.debt) && isAddressEqual(b, market.collateral))
  )
}

/** Whether the pool trades exactly the market's two currencies (order-independent). */
export function poolKeyMatchesMarket(poolKey: PoolKey, market: Market): boolean {
  return marketHasCurrencies(market, poolKey.currency0, poolKey.currency1)
}

/**
 * Mirrors `Market.toSwapParams` direction derivation: the `zeroForOne` flag for a swap that sells
 * `input` through `poolKey`. Open/increase flows sell the market's debt (buy collateral);
 * close/decrease flows sell the collateral (buy debt to repay). Throws `MARKET_MISMATCH` when the
 * pool's currencies are not the market pair or `input` is not one of the market's currencies —
 * the same condition the contract rejects with `MarketSwapMismatch`.
 */
export function swapZeroForOne(market: Market, input: Address, poolKey: PoolKey): boolean {
  if (!poolKeyMatchesMarket(poolKey, market)) {
    throw new MarginSdkError('MARKET_MISMATCH', 'pool currencies do not match the market (collateral, debt) pair')
  }
  if (!isAddressEqual(input, market.collateral) && !isAddressEqual(input, market.debt)) {
    throw new MarginSdkError('MARKET_MISMATCH', 'swap input must be one of the market currencies')
  }
  return isAddressEqual(input, poolKey.currency0)
}
