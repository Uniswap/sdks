/**
 * Stable error codes thrown by the SDK's config-derivation helpers. Consumers can switch on
 * `error.code` and map to their own error types / user-facing copy (the backend, for example,
 * maps these to its `InputValidationError`).
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

/** Error type thrown by all SDK input validation. Carries a stable {@link LauncherErrorCode}. */
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
