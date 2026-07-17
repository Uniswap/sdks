import { type Currency, Fraction, Price } from '@uniswap/sdk-core'
import type { Address, Hex } from 'viem'

import { STATE_VIEW_ABI, V2_PAIR_ABI, V3_POOL_ABI } from '../abis'
import { getChainAddresses } from '../addresses'
import { BlockfeedError } from '../errors'
import { matchesV4Currency, sameCurrency } from '../internal/currency'
import { poolIdFromPoolKey, poolRefIdentifier } from '../math/poolId'
import { priceFromSqrtPriceX96, priceFromV2Reserves } from '../math/sqrtPrice'
import type { ContractCall, PathLeg, PricePath, Source, TickData } from '../types'

/** The composed price of the path plus each leg's individual spot price, oldest→newest by leg order. */
export interface PricePathValue {
  price: Price<Currency, Currency>
  legPrices: Price<Currency, Currency>[]
  /**
   * The composed price as a plain JS number (quote per base), computed once per emission from
   * `price.toSignificant(15)`. Convenience for charting; loses precision beyond ~15 significant digits.
   */
  priceFloat: number
}

/** Stable, chain-carrying id for a currency (native and wrapped are distinguished; chainId included). */
function currencyId(c: Currency): string {
  return c.isNative ? `${c.chainId}-native` : `${c.chainId}-${c.wrapped.address.toLowerCase()}`
}

/**
 * Stable, chain-agnostic-in-shape serialization of a path: protocol + pool identity + base/quote
 * currency ids per leg, prefixed by the path endpoints. Two structurally-identical paths (same pools,
 * same currencies, same order) always produce the same key; any pool or currency difference changes
 * it. Used as the {@link Source} dedupe key.
 */
export function pricePathKey(path: PricePath): string {
  const legs = path.legs
    .map((leg) => `${leg.pool.protocol}:${poolRefIdentifier(leg.pool)}:${currencyId(leg.base)}>${currencyId(leg.quote)}`)
    .join('|')
  return `${currencyId(path.base)}=>${currencyId(path.quote)}#${legs}`
}

/** Chain addresses a v4 leg needs, resolved once at construction (only when the path has a v4 leg). */
interface V4Addresses {
  weth: Address
  stateView: Address
}

/** Order a leg's `base`/`quote` into the pool's `token0`/`token1`. */
function orderCurrencies(leg: PathLeg, v4?: V4Addresses): { token0: Currency; token1: Currency } {
  if (leg.pool.protocol === 'v4') {
    const { currency0, currency1 } = leg.pool.poolKey
    const weth = (v4 as V4Addresses).weth
    if (matchesV4Currency(leg.base, currency0, weth) && matchesV4Currency(leg.quote, currency1, weth)) {
      return { token0: leg.base, token1: leg.quote }
    }
    if (matchesV4Currency(leg.base, currency1, weth) && matchesV4Currency(leg.quote, currency0, weth)) {
      return { token0: leg.quote, token1: leg.base }
    }
    throw new BlockfeedError(
      `v4 leg currencies (${leg.base.symbol ?? '?'}/${leg.quote.symbol ?? '?'}) do not match poolKey currencies`
    )
  }
  // v2/v3: token0 is the lower wrapped address.
  return BigInt(leg.base.wrapped.address) < BigInt(leg.quote.wrapped.address)
    ? { token0: leg.base, token1: leg.quote }
    : { token0: leg.quote, token1: leg.base }
}

/** Per-leg execution plan resolved once at construction: the read to issue and how to price its result. */
interface LegPlan {
  key: string
  call: ContractCall
  /** Decode a successful call result into this leg's price, or `undefined` for an unpriceable pool. */
  price(result: unknown): Price<Currency, Currency> | undefined
}

/** Read `result[index]` as a bigint from a viem multi-return tuple. */
function tupleBigInt(result: unknown, index: number): bigint {
  return (result as readonly unknown[])[index] as bigint
}

function buildLegPlan(leg: PathLeg, index: number, v4?: V4Addresses): LegPlan {
  const key = `leg${index}`
  const { token0, token1 } = orderCurrencies(leg, v4)
  const { base, quote } = leg

  switch (leg.pool.protocol) {
    case 'v2': {
      const call: ContractCall = {
        address: leg.pool.pair,
        abi: V2_PAIR_ABI,
        functionName: 'getReserves',
        args: [],
        allowFailure: true,
      }
      return {
        key,
        call,
        price(result) {
          const reserve0 = tupleBigInt(result, 0)
          const reserve1 = tupleBigInt(result, 1)
          if (reserve0 === 0n || reserve1 === 0n) return undefined
          return priceFromV2Reserves({ reserve0, reserve1, token0, token1, base, quote })
        },
      }
    }
    case 'v3': {
      const call: ContractCall = { address: leg.pool.pool, abi: V3_POOL_ABI, functionName: 'slot0', args: [], allowFailure: true }
      return {
        key,
        call,
        price(result) {
          const sqrtPriceX96 = tupleBigInt(result, 0)
          if (sqrtPriceX96 === 0n) return undefined
          return priceFromSqrtPriceX96({ sqrtPriceX96, token0, token1, base, quote })
        },
      }
    }
    case 'v4': {
      const poolId: Hex = poolIdFromPoolKey(leg.pool.poolKey)
      const stateView = (v4 as V4Addresses).stateView
      const call: ContractCall = { address: stateView, abi: STATE_VIEW_ABI, functionName: 'getSlot0', args: [poolId], allowFailure: true }
      return {
        key,
        call,
        price(result) {
          const sqrtPriceX96 = tupleBigInt(result, 0)
          if (sqrtPriceX96 === 0n) return undefined // uninitialized pool → no emission
          return priceFromSqrtPriceX96({ sqrtPriceX96, token0, token1, base, quote })
        },
      }
    }
  }
}

/** Validate leg chaining and path endpoints at construction time (never at derive time). */
function validatePath(path: PricePath): void {
  if (path.legs.length === 0) {
    throw new BlockfeedError('PricePath must have at least one leg')
  }
  const first = path.legs[0]
  const last = path.legs[path.legs.length - 1]
  if (!sameCurrency(path.base, first.base)) {
    throw new BlockfeedError(
      `PricePath.base (${path.base.symbol ?? '?'}) does not match the first leg's base (${first.base.symbol ?? '?'})`
    )
  }
  if (!sameCurrency(path.quote, last.quote)) {
    throw new BlockfeedError(
      `PricePath.quote (${path.quote.symbol ?? '?'}) does not match the last leg's quote (${last.quote.symbol ?? '?'})`
    )
  }
  for (let i = 0; i < path.legs.length - 1; i++) {
    if (!sameCurrency(path.legs[i].quote, path.legs[i + 1].base)) {
      throw new BlockfeedError(
        `PricePath legs do not chain at index ${i}: leg ${i} quote (${
          path.legs[i].quote.symbol ?? '?'
        }) must equal leg ${i + 1} base (${path.legs[i + 1].base.symbol ?? '?'})`
      )
    }
  }
  // The path's chainId is `path.base.chainId`; every other currency in the path must agree.
  const chainId = path.base.chainId
  for (const c of [path.quote, ...path.legs.flatMap((leg) => [leg.base, leg.quote])]) {
    if (c.chainId !== chainId) {
      throw new BlockfeedError(
        `PricePath currency ${c.symbol ?? '?'} is on chain ${c.chainId}, but path.base is on chain ${chainId}`
      )
    }
  }
}

/**
 * A {@link Source} that prices `path.base` in `path.quote` by reading each leg's pool spot price in a
 * single atomic tick and composing them with `Price.multiply`.
 *
 * Per leg the read is: v2 → `getReserves` at the pair; v3 → `slot0` at the pool; v4 →
 * `StateView.getSlot0(poolId)` where `poolId` is derived from the PoolKey.
 *
 * The chainId is taken from `path.base.chainId` (validated to match every other currency in the path
 * at construction); a v4 leg additionally needs it to resolve the StateView address and native/WETH
 * duality. Leg chaining and path endpoints are validated at construction, not at derive time.
 *
 * `derive` returns `undefined` (no emission) when any leg's read is missing/failed or a v4 pool is
 * uninitialized (`sqrtPriceX96 === 0`). Equal composed prices are suppressed via `valueEquals`.
 */
export function pricePathSource(path: PricePath): Source<PricePathValue> {
  validatePath(path)
  const chainId = path.base.chainId
  const hasV4 = path.legs.some((leg) => leg.pool.protocol === 'v4')

  // Resolve chain addresses ONCE when any leg is v4 (the only case they're needed); thread them into
  // each leg plan.
  let v4Addresses: V4Addresses | undefined
  if (hasV4) {
    const addrs = getChainAddresses(chainId)
    v4Addresses = { weth: addrs.weth, stateView: addrs.v4StateView }
  }
  const plans = path.legs.map((leg, i) => buildLegPlan(leg, i, v4Addresses))
  const key = `pricePath:${pricePathKey(path)}`

  return {
    key,
    calls() {
      const calls: Record<string, ContractCall> = {}
      for (const plan of plans) calls[plan.key] = plan.call
      return calls
    },
    derive(tick: TickData) {
      const legPrices: Price<Currency, Currency>[] = []
      for (const plan of plans) {
        const res = tick.results[plan.key]
        if (!res || res.status !== 'success') return undefined
        const price = plan.price(res.result)
        if (price === undefined) return undefined
        legPrices.push(price)
      }

      // Compose raw fractions directly (bypassing Price.multiply's strict currency invariant so native
      // ETH ↔ WETH legs chain); relabel to the path's own endpoints. Raw amounts and decimals are
      // identical across the native/wrapped boundary, so the ratio is unchanged.
      let composed = new Fraction(legPrices[0].numerator, legPrices[0].denominator)
      for (let i = 1; i < legPrices.length; i++) {
        composed = composed.multiply(new Fraction(legPrices[i].numerator, legPrices[i].denominator))
      }
      const price = new Price(path.base, path.quote, composed.denominator, composed.numerator)
      const priceFloat = parseFloat(price.toSignificant(15))

      return { value: { price, legPrices, priceFloat }, identity: tick.identity }
    },
    valueEquals(a, b) {
      return a.price.equalTo(b.price)
    },
  }
}
