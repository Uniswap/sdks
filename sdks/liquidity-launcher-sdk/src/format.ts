import { formatUnits } from 'viem'

/**
 * Display formatting for launch UIs and error messages. Values read in the units the launch UI uses:
 * fees as percentages and token amounts as human-readable decimals — never raw hundredths-of-a-bip
 * or base units.
 */

/**
 * Formats a Uniswap pool fee (hundredths of a bip — 3000 = 0.3%, 1_000_000 = 100%) as a percentage:
 * 3000 -> "0.3%", 3001 -> "0.3001%", 100 -> "0.01%", 10000 -> "1%".
 */
export function formatFeePercent(fee: number): string {
  // Hundredths of a bip -> percent is a divide by 10_000; an integer fee yields at most 4 decimals.
  const percent = fee / 10_000
  return `${parseFloat(percent.toFixed(4))}%`
}

const THOUSANDS_SEPARATOR = /\B(?=(\d{3})+(?!\d))/g

/**
 * Formats a raw on-chain token amount (base units) as a grouped human-readable decimal, with an
 * optional symbol: (57500000000000000000000000n, 18, 'WBTC') -> "57,500,000 WBTC".
 */
export function formatTokenAmount(rawAmount: bigint, decimals: number, symbol?: string): string {
  const [whole, fraction] = formatUnits(rawAmount, decimals).split('.')
  const grouped = whole!.replace(THOUSANDS_SEPARATOR, ',')
  const amount = fraction ? `${grouped}.${fraction}` : grouped
  return symbol ? `${amount} ${symbol}` : amount
}
