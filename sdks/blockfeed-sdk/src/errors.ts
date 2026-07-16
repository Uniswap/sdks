/**
 * Base error type for every failure the blockfeed SDK raises. Consumers can `instanceof BlockfeedError`
 * to distinguish SDK-originated errors from arbitrary runtime failures. More specific subclasses
 * (e.g. tick-evaluation failures) extend this.
 */
export class BlockfeedError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message)
    this.name = 'BlockfeedError'
    // Restore prototype chain for instanceof across the ts→es target downlevel.
    Object.setPrototypeOf(this, BlockfeedError.prototype)
  }
}

/**
 * Raised when a tick's atomic read cannot be trusted: an identity call (block number / hash /
 * timestamp) failed, or one or more non-speculative (allowFailure: false) keyed calls reverted.
 * {@link failedKeys} names the offending keyed calls (or the identity calls) so callers can react.
 */
export class TickFailedError extends BlockfeedError {
  constructor(message: string, public readonly failedKeys: string[], cause?: unknown) {
    super(message, cause)
    this.name = 'TickFailedError'
    Object.setPrototypeOf(this, TickFailedError.prototype)
  }
}
