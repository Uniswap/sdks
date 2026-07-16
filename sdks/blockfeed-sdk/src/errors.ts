/**
 * Base error type for every failure the blockfeed SDK raises. Consumers can `instanceof BlockfeedError`
 * to distinguish SDK-originated errors from arbitrary runtime failures. More specific subclasses
 * (e.g. tick-evaluation failures) extend this.
 */
export class BlockfeedError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'BlockfeedError'
    // Restore prototype chain for instanceof across the ts→es target downlevel.
    Object.setPrototypeOf(this, BlockfeedError.prototype)
  }
}
