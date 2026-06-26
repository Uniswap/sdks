/**
 * Stable error codes for every input-validation failure the SDK can raise. This list is the single
 * source of truth: the SDK owns the validation logic and the user-facing messages, and consumers
 * (e.g. the backend liquidity service) **forward** these errors rather than re-authoring their own —
 * catch with {@link isLauncherSdkError}, then surface `error.message` and/or branch on `error.code`.
 */
export type LauncherErrorCode =
  | 'UNSUPPORTED_CHAIN'
  | 'INVALID_FLOOR_PRICE'
  | 'INVALID_TIME'
  | 'INVALID_AUCTION_WINDOW'
  | 'INVALID_FEE'
  | 'INVALID_PRICE_RANGE'
  | 'INVALID_LP_ALLOCATION'
  | 'INVALID_EMISSION_SCHEDULE'
  | 'INVALID_AUCTION_STEP'
  | 'INVALID_INPUT'

/**
 * Error type thrown by all SDK input validation. Carries a stable {@link LauncherErrorCode} and a
 * user-facing `message`. Consumers forward both.
 */
export class LauncherSdkError extends Error {
  readonly code: LauncherErrorCode

  constructor(code: LauncherErrorCode, message: string) {
    super(message)
    this.name = 'LauncherSdkError'
    this.code = code
    // Restore prototype chain for instanceof across the ts→es target downlevel.
    Object.setPrototypeOf(this, LauncherSdkError.prototype)
  }
}

/**
 * Type guard for forwarding. Structural (checks `name` + `code`) rather than `instanceof` so it still
 * holds across a dual cjs/esm install or bundling, where two copies of the class can otherwise defeat
 * `instanceof`. Use it in a consumer's catch to forward the SDK's validation error verbatim:
 *
 * ```ts
 * try { ... } catch (e) {
 *   if (isLauncherSdkError(e)) throw new InputValidationError(e.message) // forward
 *   throw e
 * }
 * ```
 */
export function isLauncherSdkError(error: unknown): error is LauncherSdkError {
  return (
    error instanceof LauncherSdkError ||
    (typeof error === 'object' &&
      error !== null &&
      (error as { name?: unknown }).name === 'LauncherSdkError' &&
      typeof (error as { code?: unknown }).code === 'string')
  )
}
