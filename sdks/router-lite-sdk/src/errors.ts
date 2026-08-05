/**
 * Thrown for operator errors — invalid manifest, chainId mismatch, or other configuration problems
 * detected before RPC traffic where possible. Business outcomes (no route found, etc.) are never
 * thrown; they are returned as result union values (see {@link QuoteResult}/{@link SwapResult}).
 */
export class RouterConfigError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'RouterConfigError'
    // Restore prototype chain for instanceof across the ts→es target downlevel.
    Object.setPrototypeOf(this, RouterConfigError.prototype)
  }
}

/**
 * Thrown when a route's shape falls outside the closed supported set — {single, two-hop} x
 * {v2, v3, v4, mixed} x {erc20, native} in/out, exact-input, optional permit. Anything else throws
 * this rather than being silently accepted.
 */
export class UnsupportedRouteError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'UnsupportedRouteError'
    // Restore prototype chain for instanceof across the ts→es target downlevel.
    Object.setPrototypeOf(this, UnsupportedRouteError.prototype)
  }
}

/**
 * Thrown by the RPC seams (`internal/rpc.ts`'s `ethCall`) when a call failed in the *transport*
 * channel rather than on-chain — an HTTP error (429/5xx), a timeout, a dropped socket, or a JSON-RPC
 * error that reports a provider limit rather than an EVM outcome. A revert (with or without data) is
 * NOT this: it is a real, authoritative answer from the node and keeps propagating as a plain
 * `Error`.
 *
 * The distinction is the whole point. Folding the two together is what let a partial provider outage
 * ("`eth_call` is 429ing, everything else is fine") be reported as a *confident* `no-route`: every
 * candidate "failed", so the search looked complete while in fact nothing had been evaluated. Any
 * search that observes one of these is `inconclusive` (`rpc-degraded`), never an authoritative
 * no-route.
 *
 * INTERNAL — deliberately not exported from `index.ts`. Callers never catch it: it is captured by
 * `mapConcurrent`/`preflightTx` and turned into the report's `quoting.transportFailed` /
 * `verificationDegraded` axes, which is the surface a caller actually reads. The original provider
 * error is preserved as `cause` for logging.
 */
export class TransportError extends Error {
  /** Set manually rather than via the `Error` constructor's `cause` option (ES2022) — this
   * package's `tsconfig` targets es2020, whose ambient `Error` type has no such overload. */
  readonly cause?: unknown

  constructor(message: string, options?: { cause?: unknown }) {
    super(message)
    this.name = 'TransportError'
    if (options?.cause !== undefined) this.cause = options.cause
    // Restore prototype chain for instanceof across the ts→es target downlevel.
    Object.setPrototypeOf(this, TransportError.prototype)
  }
}

/**
 * The node-state half of {@link TransportError}: the provider answered, but about *itself* — it
 * could not serve this request AT THIS BLOCK. `header not found`, `missing trie node 0x…`,
 * `block not found`, `unknown block`, erigon's `state at block N is not available`, alchemy's
 * `Nonexistent block: requested N, latest M`, and the response-size/range caps all land here.
 *
 * It extends `TransportError` on purpose: every counting site in the package
 * (`quoting.transportFailed`, `verificationDegraded`, the facade's `rpc-degraded`) is keyed on
 * `instanceof TransportError`, and the AXIS effect of a node-state failure is identical to a 429 —
 * no evidence about the chain, so never a `no-route`. The subclass exists purely for diagnostics:
 * an operator reading the error (or its `cause`) can tell "your provider is throttling you" from
 * "your load balancer just served this call from a node two blocks behind the one we pinned".
 *
 * THIS IS THE C4-H1 BUG. These errors used to fall through `classifyRpcError`'s `execution` default,
 * so a load balancer routing the pinned-block `eth_call`s to a lagging node produced dozens of
 * `quoting.failed` — on-chain evidence the search never had — and a *confident* `no-route` from a
 * search that never touched chain state. In preflight the same shape fabricated a `reverted` verdict.
 */
export class NodeStateError extends TransportError {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options)
    this.name = 'NodeStateError'
    // Restore prototype chain for instanceof across the ts→es target downlevel.
    Object.setPrototypeOf(this, NodeStateError.prototype)
  }
}

/**
 * Thrown by the wave engine (`search/waves.ts`) when it cannot even fetch the pinned block to
 * search against — a provider outage, or a malformed/absent `eth_getBlockByNumber` response. This
 * is the engine's *only* throw: everything else it observes (a reverting quote, an uncompilable
 * route, a capped log scan) is a recorded business outcome, never an exception.
 *
 * The facade (`router.ts`) catches this by identity and reports it as an `inconclusive` result
 * rather than propagating it — a total RPC outage is a business outcome from the caller's point of
 * view, not something every caller must remember to catch. The original error is preserved via the
 * standard `cause` option for anyone inspecting the thrown error directly (engine-level tests, an
 * uncaught-exception logger upstream of the facade); the facade's business-outcome result has no
 * field to carry it, since a caller reading a `QuoteResult`/`SwapResult` was never going to look
 * for a `cause` there.
 */
export class RpcUnavailableError extends Error {
  /** Set manually rather than via the `Error` constructor's `cause` option (ES2022) — this
   * package's `tsconfig` targets es2020, whose ambient `Error` type has no such overload. */
  readonly cause?: unknown

  constructor(message: string, options?: { cause?: unknown }) {
    super(message)
    this.name = 'RpcUnavailableError'
    if (options?.cause !== undefined) this.cause = options.cause
    // Restore prototype chain for instanceof across the ts→es target downlevel.
    Object.setPrototypeOf(this, RpcUnavailableError.prototype)
  }
}
