import { type Address, isAddress, isAddressEqual, zeroAddress } from 'viem'

import { MarginSdkError } from './errors.js'
import { type Market, type PoolKey } from './types.js'

/**
 * Market and pool-key helpers mirroring the onchain `Market` type: the single choke point that
 * reconciles a v4 pool with a `(collateral, debt)` market and derives swap direction.
 */

/** v4 `LPFeeLibrary.MAX_LP_FEE`: the largest static LP fee, in hundredths of a bip (100%). */
export const MAX_LP_FEE = 1_000_000

/** v4 `LPFeeLibrary.DYNAMIC_FEE_FLAG`: the `fee` sentinel marking a dynamic-fee pool. */
export const DYNAMIC_FEE_FLAG = 0x800000

/** v4 `TickMath` tick-spacing bounds. */
export const MIN_TICK_SPACING = 1
export const MAX_TICK_SPACING = 32_767

/** Asserts `value` is a well-formed 20-byte hex address, wrapping viem's check in a typed error. */
export function validateAddress(value: Address, label: string): void {
  if (!isAddress(value, { strict: false })) {
    throw new MarginSdkError('INVALID_INPUT', `${label} is not a valid address: ${value}`)
  }
}

/** Whether `a` sorts before `b` under v4's canonical currency ordering (numeric address order). */
export function sortsBefore(a: Address, b: Address): boolean {
  return BigInt(a) < BigInt(b)
}

/**
 * Builds a canonically-ordered v4 `PoolKey` from an unordered currency pair. Defaults to a
 * hookless pool. Enforces the pool-manager bounds offchain: `fee` is a static LP fee up to
 * `MAX_LP_FEE` or exactly `DYNAMIC_FEE_FLAG`, and `tickSpacing` is within v4's tick-spacing range.
 */
export function toPoolKey(p: {
  currencyA: Address
  currencyB: Address
  fee: number
  tickSpacing: number
  hooks?: Address
}): PoolKey {
  validateAddress(p.currencyA, 'currencyA')
  validateAddress(p.currencyB, 'currencyB')
  if (p.hooks !== undefined) validateAddress(p.hooks, 'hooks')
  if (isAddressEqual(p.currencyA, p.currencyB)) {
    throw new MarginSdkError('INVALID_MARKET', 'pool currencies must be distinct')
  }
  if (!Number.isInteger(p.fee) || p.fee < 0 || (p.fee > MAX_LP_FEE && p.fee !== DYNAMIC_FEE_FLAG)) {
    throw new MarginSdkError(
      'INVALID_INPUT',
      `fee must be an integer in [0, ${MAX_LP_FEE}] (hundredths of a bip) or the DYNAMIC_FEE_FLAG, got ${p.fee}`
    )
  }
  if (!Number.isInteger(p.tickSpacing) || p.tickSpacing < MIN_TICK_SPACING || p.tickSpacing > MAX_TICK_SPACING) {
    throw new MarginSdkError(
      'INVALID_INPUT',
      `tickSpacing must be an integer in [${MIN_TICK_SPACING}, ${MAX_TICK_SPACING}], got ${p.tickSpacing}`
    )
  }
  const [currency0, currency1] = sortsBefore(p.currencyA, p.currencyB)
    ? [p.currencyA, p.currencyB]
    : [p.currencyB, p.currencyA]
  return { currency0, currency1, fee: p.fee, tickSpacing: p.tickSpacing, hooks: p.hooks ?? zeroAddress }
}

/** Validates a market: distinct, non-zero ERC-20 addresses (native ETH is not a margin currency). */
export function validateMarket(market: Market): void {
  validateAddress(market.collateral, 'market.collateral')
  validateAddress(market.debt, 'market.debt')
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
 * The `zeroForOne` flag for a swap that sells `input` through `poolKey`. Open/increase flows sell
 * the market's debt (buy collateral); close/decrease flows sell the collateral (buy debt to
 * repay). Throws `MARKET_MISMATCH` when the pool's currencies are not the market pair or `input`
 * is not one of the market's currencies. Direction inside a Universal Router route is derived by
 * `buildV4ExactOutRoute`; this helper serves plans that use the native v4 swap actions directly.
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
