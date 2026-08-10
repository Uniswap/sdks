// ---------------------------------------------------------------------------
// Amount and duration parsing/formatting — pure, no RPC, fully unit-tested.
//
// The SDK is deliberately raw-bigint everywhere ("no decimal parsing" is a
// documented property of its domain model), so the human side of that line
// lives here: `1.5` with the token's own decimals in, grouped/trimmed decimal
// strings out. Formatting never rounds *up* (truncation only) so a printed
// amount is never more than what the quote actually says.
// ---------------------------------------------------------------------------

import { groupThousands } from './format'

/** Thrown for any human-input parse failure; rendered as a one-liner, never a stack. */
export class AmountError extends Error {}

/**
 * Parses a human decimal amount (`'1.5'`, `'0.000001'`, `'42'`) into raw units at `decimals`.
 * A `wei`/`raw` suffix (`'1000wei'`, `'5000raw'`) bypasses scaling for engineers who think in raw
 * units. Rejects negatives, malformed input, and more fractional digits than the token has —
 * silently truncating a user's dust amount to zero would misreport what was actually quoted.
 */
export function parseAmount(text: string, decimals: number): bigint {
  const trimmed = text.trim().toLowerCase().replace(/_/g, '')
  const rawSuffix = trimmed.match(/^(\d+)(wei|raw)$/)
  if (rawSuffix) return BigInt(rawSuffix[1]!)

  const match = trimmed.match(/^(\d+)(?:\.(\d+))?$/)
  if (!match) throw new AmountError(`unparseable amount '${text}' — expected e.g. 1.5, 0.03, 250000wei`)
  const [, whole, frac = ''] = match
  if (frac.length > decimals) {
    throw new AmountError(`amount '${text}' has ${frac.length} fractional digits but the token has ${decimals} decimals`)
  }
  const scaled = BigInt(whole!) * 10n ** BigInt(decimals) + BigInt(frac.padEnd(decimals, '0') || '0')
  if (scaled === 0n) throw new AmountError(`amount '${text}' is zero — the router requires a positive amountIn`)
  return scaled
}

/**
 * Formats raw units at `decimals` as a grouped decimal string: `3912401234n` @ 6 → `'3,912.401234'`.
 * Fractional part is truncated to `maxFractionDigits` (never rounded up) and trailing zeros are
 * trimmed; a nonzero amount that would truncate to nothing renders as `'<0.0001'`-style instead of
 * a flat lying `'0'`.
 */
export function formatAmount(amount: bigint, decimals: number, maxFractionDigits = 6): string {
  const negative = amount < 0n
  const abs = negative ? -amount : amount
  const base = 10n ** BigInt(decimals)
  const whole = abs / base
  const frac = abs % base

  const grouped = groupThousands(whole)
  const fracDigits = Math.min(maxFractionDigits, decimals)
  const fracFull = frac.toString().padStart(decimals, '0')
  const fracShown = fracFull.slice(0, fracDigits).replace(/0+$/, '')

  if (whole === 0n && frac > 0n && fracShown === '') {
    return `${negative ? '-' : ''}<0.${'0'.repeat(Math.max(fracDigits - 1, 0))}1`
  }
  const out = fracShown ? `${grouped}.${fracShown}` : grouped
  return negative ? `-${out}` : out
}

/**
 * Formats raw units at `decimals` as a grouped decimal string with an EXACT `fractionDigits` — no
 * trimming, unlike {@link formatAmount}. Exists for column-aligned tables (the runners-up delta
 * table): two rows whose amounts are `0.30` and `0.4` read as unaligned decimal points the moment
 * one of them trims a trailing zero, and a table is exactly the place that has to line up.
 */
export function formatFixed(amount: bigint, decimals: number, fractionDigits: number): string {
  const negative = amount < 0n
  const abs = negative ? -amount : amount
  const base = 10n ** BigInt(decimals)
  const whole = abs / base
  const frac = abs % base

  const grouped = groupThousands(whole)
  const digits = Math.max(0, Math.min(fractionDigits, decimals))
  const fracFull = frac.toString().padStart(decimals, '0')
  const fracShown = fracFull.slice(0, digits).padEnd(digits, '0')

  const out = digits > 0 ? `${grouped}.${fracShown}` : grouped
  return negative ? `-${out}` : out
}

/**
 * The fewest fraction digits (within `[min, min(max, decimals)]`) at which every amount in
 * `amounts` renders DISTINCT from every other, and no nonzero amount renders as a flat `0` — "enough
 * decimals to distinguish the deltas" from the runners-up table, without defaulting to full
 * precision when two decimal places already tell the whole story (`-0.30` / `-0.42`, not
 * `-0.300000` / `-0.420000`).
 *
 * Starts at `min` (2 by default — a table of whole-unit deltas with no decimals at all reads as
 * "these are all the same") and grows until the collision/all-zero test passes or `max` is reached,
 * at which point it returns `max` regardless — two genuinely-identical amounts are not a formatting
 * bug for this function to paper over.
 */
export function adaptiveFractionDigits(amounts: bigint[], decimals: number, opts: { min?: number; max?: number } = {}): number {
  const min = opts.min ?? 2
  const max = Math.min(opts.max ?? 6, decimals)
  if (min >= max) return max
  for (let digits = min; digits <= max; digits++) {
    const seen = new Set<string>()
    let ok = true
    for (const a of amounts) {
      const shown = formatFixed(a < 0n ? -a : a, decimals, digits)
      if (a !== 0n && /^0(\.0*)?$/.test(shown)) {
        ok = false
        break
      }
      if (seen.has(shown)) {
        ok = false
        break
      }
      seen.add(shown)
    }
    if (ok) return digits
  }
  return max
}

/**
 * Parses a `--budget` duration (`'900ms'`, `'10s'`, `'2m'`) into milliseconds for
 * `AbortSignal.timeout`. A unit is REQUIRED: a bare `'900'` reads as 900ms to someone fresh from
 * the SDK docs and as 900s to someone thinking in seconds, and a silently misread budget is worse
 * than a one-line rejection.
 */
export function parseBudget(text: string): number {
  const match = text.trim().toLowerCase().match(/^(\d+(?:\.\d+)?)(ms|s|m)$/)
  if (!match) throw new AmountError(`unparseable budget '${text}' — give a unit: 900ms, 10s, 2m`)
  const value = Number(match[1])
  const unit = match[2]
  const ms = unit === 'm' ? value * 60_000 : unit === 's' ? value * 1_000 : value
  if (!Number.isFinite(ms) || ms <= 0) throw new AmountError(`budget '${text}' must be positive`)
  return Math.round(ms)
}
