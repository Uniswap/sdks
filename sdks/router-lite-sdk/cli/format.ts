// ---------------------------------------------------------------------------
// Human-scale formatting shared by every renderer: durations, counters, and
// coarse "how long ago" ages. Kept apart from `amounts.ts` (token-decimal
// amount parsing/formatting) because these helpers know nothing about
// currencies — they format plain numbers and milliseconds, and every
// snapshot test in this package exercises them directly.
// ---------------------------------------------------------------------------

/**
 * A duration for a reader who is skimming, not auditing: sub-second precision only while it still
 * matters, one decimal once it doesn't, minutes once seconds stop being the natural unit.
 *
 *   < 1s     `82ms`               (no decimal — a millisecond figure with a decimal is noise)
 *   < 120s   `9.4s` / `62.6s`     (one decimal throughout — the boundary at 10s some UIs add a
 *                                  second decimal digit for is not worth the reader re-parsing)
 *   >= 120s  `1m 03s`             (seconds zero-padded so the pair reads as a clock, not two numbers)
 */
export function humanizeDuration(ms: number): string {
  const abs = Math.abs(ms)
  const sign = ms < 0 ? '-' : ''
  if (abs < 1_000) return `${sign}${Math.round(abs)}ms`
  if (abs < 120_000) return `${sign}${(abs / 1_000).toFixed(1)}s`
  const totalSeconds = Math.round(abs / 1_000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${sign}${minutes}m ${seconds.toString().padStart(2, '0')}s`
}

/**
 * A coarse "how long ago" for cache/staleness lines — `updated 3m ago`. Rounds to the nearest unit
 * at each threshold rather than truncating, so `59.6s` reads `1m ago` instead of a confusing `0m ago`.
 */
export function humanizeAge(ms: number): string {
  // Boundaries at 59.5 rather than 60 — so a value that ROUNDS UP to the next unit (`59.6s`) is
  // shown in that unit rather than as a startling `60s`/`60m`/`24h`.
  const seconds = ms / 1_000
  if (seconds < 59.5) return `${Math.max(0, Math.round(seconds))}s`
  const minutes = seconds / 60
  if (minutes < 59.5) return `${Math.round(minutes)}m`
  const hours = minutes / 60
  if (hours < 23.5) return `${Math.round(hours)}h`
  return `${Math.round(hours / 24)}d`
}

/** Thousands-grouped integer — `1234567` -> `'1,234,567'`. Accepts `number` or `bigint` (every
 * counter this CLI renders is one or the other, never a string already). */
export function groupThousands(n: number | bigint): string {
  const negative = (typeof n === 'bigint' ? n < 0n : n < 0)
  const abs = typeof n === 'bigint' ? (negative ? -n : n) : Math.abs(Math.round(n))
  const grouped = abs.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return negative ? `-${grouped}` : grouped
}

/**
 * A block number abbreviated to one decimal of millions — `17,600,830n` -> `'17.6M'` — for the ONE
 * place a full thousands-grouped number would be more precision than the reader asked for: a
 * deployment floor named only to give an era ("since block #17.6M"), not to be looked up. Every
 * OTHER block number in this CLI (the pinned search block, `--json`) stays fully grouped —
 * `groupThousands` — because those ARE meant to be looked up.
 */
export function abbreviateBlock(n: bigint): string {
  if (n < 1_000_000n) return groupThousands(n)
  // One decimal via integer math: avoids the imprecision of converting a large bigint to `Number`
  // before dividing, which starts losing digits well under block numbers this package will see.
  const tenths = (n * 10n) / 1_000_000n
  const whole = tenths / 10n
  const frac = tenths % 10n
  return `${whole}.${frac}M`
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/**
 * Approximates the calendar month/year a block was produced, from a LATER block's own timestamp and
 * the chain's block time — `since #17.6M (~Jul 2023)`. Deliberately coarse (`~Mon YYYY`, never a day
 * or an hour): the input is a linear extrapolation from `blockTimeSeconds`, which drifts over a
 * multi-year span (Ethereum's own block time moved with the Merge), so a day-level answer would
 * claim precision the math does not have. A month is the finest grain that stays honest.
 */
export function approxMonthYear(targetBlock: bigint, head: { number: bigint; timestamp: bigint }, blockTimeSeconds: number): string {
  const blocksBack = head.number - targetBlock
  const secondsBack = Number(blocksBack) * blockTimeSeconds
  const approxMs = Number(head.timestamp) * 1_000 - secondsBack * 1_000
  const d = new Date(approxMs)
  return `~${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`
}
