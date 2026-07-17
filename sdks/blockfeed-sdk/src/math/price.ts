import { type Currency, Price } from '@uniswap/sdk-core'

/** 2^96 as a decimal string — the Q96 denominator. */
const Q96_STRING = (1n << 96n).toString()

/**
 * Convert a Q96 raw-currency-per-raw-token price (the launch/auction price vocabulary) into an
 * sdk-core {@link Price} of `base` in `quote`.
 *
 * `priceX96` is `quote-raw per base-raw × 2^96`, so `quote-raw / base-raw = priceX96 / 2^96`, i.e.
 * `new Price(base, quote, 2^96, priceX96)`. This reconciles the two price vocabularies used across the
 * package: the launch sources emit `priceX96` (Q96 over raw amounts), while discovery / `pricePath`
 * emit sdk-core `Price`. The returned `Price` accounts for token decimals on `.toSignificant`.
 */
export function q96ToPrice(priceX96: bigint, base: Currency, quote: Currency): Price<Currency, Currency> {
  return new Price(base, quote, Q96_STRING, priceX96.toString())
}
