// ---------------------------------------------------------------------------
// Amount and duration parsing/formatting — pure, no RPC, fully unit-tested.
//
// The SDK is deliberately raw-bigint everywhere ("no decimal parsing" is a
// documented property of its domain model), so the human side of that line
// lives here: `1.5` with the token's own decimals in, grouped/trimmed decimal
// strings out. Formatting never rounds *up* (truncation only) so a printed
// amount is never more than what the quote actually says.
// ---------------------------------------------------------------------------

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

  const grouped = whole.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',')
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
