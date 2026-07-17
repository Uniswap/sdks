import { type Currency, Price } from '@uniswap/sdk-core'

import { BlockfeedError } from '../errors'

/** 2¹⁹² as a decimal string — the denominator of the raw sqrtPriceX96 → price conversion. */
export const Q192 = (2n ** 192n).toString()

/** True when two currencies are the same logical asset, treating native ETH and its WETH as one. */
function sameCurrency(a: Currency, b: Currency): boolean {
  return a.wrapped.equals(b.wrapped)
}

/**
 * Orient a `base`/`quote` request against a pool's sorted `token0`/`token1` and produce the price of
 * `base` in `quote` from an already-computed raw ratio of token1-raw per token0-raw.
 *
 * `raw0in1` is `{ numerator, denominator }` such that `numerator/denominator` = token1-raw per
 * token0-raw (i.e. the price of token0 denominated in token1, as raw on-chain amounts). When `base`
 * is token0 that ratio is returned as-is; when `base` is token1 it is inverted. The returned
 * {@link Price} carries the caller's own `base`/`quote` currency objects (so native ETH stays native
 * even when the pool stores WETH), which is sound because native and wrapped share raw amounts and
 * decimals.
 */
function orientPrice(args: {
  raw0in1: { numerator: bigint; denominator: bigint }
  token0: Currency
  token1: Currency
  base: Currency
  quote: Currency
}): Price<Currency, Currency> {
  const { raw0in1, token0, token1, base, quote } = args
  // base=token0, quote=token1 → token1-raw per token0-raw = numerator/denominator.
  if (sameCurrency(base, token0) && sameCurrency(quote, token1)) {
    return new Price(base, quote, raw0in1.denominator.toString(), raw0in1.numerator.toString())
  }
  // base=token1, quote=token0 → token0-raw per token1-raw = denominator/numerator (inverted).
  if (sameCurrency(base, token1) && sameCurrency(quote, token0)) {
    return new Price(base, quote, raw0in1.numerator.toString(), raw0in1.denominator.toString())
  }
  throw new BlockfeedError(
    `Price base/quote (${base.symbol ?? '?'}/${quote.symbol ?? '?'}) are not the pool's currencies ` +
      `(${token0.symbol ?? '?'}/${token1.symbol ?? '?'})`
  )
}

/**
 * Price of `base` in `quote` from a v3/v4 pool's `sqrtPriceX96`, where `token0`/`token1` are the
 * pool's address-sorted currencies.
 *
 * The core identity: price of token0 in token1 (token1-raw per token0-raw) = `sqrtP² / 2¹⁹²`. This is
 * built as `new Price(token0, token1, 2¹⁹², sqrtP²)` and inverted when `base` is token1. Native ETH
 * and WETH interoperate via `.wrapped` comparison. Throws {@link BlockfeedError} when `base`/`quote`
 * are not the pool's two currencies.
 */
export function priceFromSqrtPriceX96(args: {
  sqrtPriceX96: bigint
  token0: Currency
  token1: Currency
  base: Currency
  quote: Currency
}): Price<Currency, Currency> {
  const { sqrtPriceX96, token0, token1, base, quote } = args
  const sqrtSquared = sqrtPriceX96 * sqrtPriceX96
  return orientPrice({
    raw0in1: { numerator: sqrtSquared, denominator: 2n ** 192n },
    token0,
    token1,
    base,
    quote,
  })
}

/**
 * Price of `base` in `quote` from a v2 pair's reserves, where `token0`/`token1` are the pair's
 * address-sorted currencies. Spot price of token0 in token1 (token1-raw per token0-raw) =
 * `reserve1 / reserve0`. Throws {@link BlockfeedError} when `base`/`quote` are not the pair's
 * currencies.
 */
export function priceFromV2Reserves(args: {
  reserve0: bigint
  reserve1: bigint
  token0: Currency
  token1: Currency
  base: Currency
  quote: Currency
}): Price<Currency, Currency> {
  const { reserve0, reserve1, token0, token1, base, quote } = args
  return orientPrice({
    raw0in1: { numerator: reserve1, denominator: reserve0 },
    token0,
    token1,
    base,
    quote,
  })
}
