/**
 * Stable error codes for every input-validation failure the SDK can raise. This list is the single
 * source of truth: the SDK owns the validation logic and the user-facing messages, and consumers
 * **forward** these errors rather than re-authoring their own — catch with {@link isMarginSdkError},
 * then surface `error.message` and/or branch on `error.code`.
 */
export type MarginErrorCode =
  | 'UNSUPPORTED_CHAIN'
  | 'INVALID_LEVERAGE'
  | 'INVALID_AMOUNT'
  | 'AMOUNT_OVERFLOW'
  | 'INVALID_SLIPPAGE'
  | 'INVALID_MARKET'
  | 'MARKET_MISMATCH'
  | 'SLIPPAGE_BOUND_REQUIRED'
  | 'INVALID_PLAN'
  | 'INVALID_INPUT'

/**
 * Error type thrown by all SDK input validation. Carries a stable {@link MarginErrorCode} and a
 * user-facing `message`. Consumers forward both.
 */
export class MarginSdkError extends Error {
  readonly code: MarginErrorCode

  constructor(code: MarginErrorCode, message: string) {
    super(message)
    this.name = 'MarginSdkError'
    this.code = code
    // Restore prototype chain for instanceof across the ts→es target downlevel.
    Object.setPrototypeOf(this, MarginSdkError.prototype)
  }
}

/**
 * Type guard for forwarding. Structural (checks `name` + `code`) rather than `instanceof` so it
 * still holds across a dual cjs/esm install or bundling, where two copies of the class can
 * otherwise defeat `instanceof`.
 */
export function isMarginSdkError(error: unknown): error is MarginSdkError {
  return (
    error instanceof MarginSdkError ||
    (typeof error === 'object' &&
      error !== null &&
      (error as { name?: unknown }).name === 'MarginSdkError' &&
      typeof (error as { code?: unknown }).code === 'string')
  )
}
