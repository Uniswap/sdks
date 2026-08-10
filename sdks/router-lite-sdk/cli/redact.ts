// ---------------------------------------------------------------------------
// Keyed-URL redaction — mirrored from `canary/providers.test.ts#redactKeyedUrl`
// (same rule, same rationale), because this CLI has the same leak path: viem
// embeds the full request URL in every error it constructs, and the RPC URLs
// this tool is handed (via `--rpc`/`$ETH_RPC_URL`) routinely carry vendor keys
// in the path or query string. Every error line this CLI prints goes through
// here first; the URL itself is never printed on any success path at all.
//
// Deliberately duplicated rather than imported: `canary/` resolves the SDK by
// package name (the built `dist/`), and this CLI's contract is "always the
// current source" — importing across the two workspaces would couple this
// tool's runtime to a possibly-stale build artifact for twenty lines of pure
// string code. The unit tests pin the behaviour to the canary's exact cases.
// ---------------------------------------------------------------------------

/** What a keyed endpoint's URL is replaced with before anything is printed. */
export const REDACTED_URL = 'https://<redacted-keyed-endpoint>'

/**
 * Minimum length of a URL path segment for it to be treated as a SECRET rather than a route:
 * vendor keys are long opaque tokens (20+ chars in every major vendor's documented format), while
 * ordinary path segments (`v2`, `rpc`, `mainnet`) are short. Erring toward over-redaction is the
 * right side to err on here.
 */
const SECRET_SEGMENT_MIN_LENGTH = 16

/**
 * Replaces any key-bearing URL in `message` with {@link REDACTED_URL}, leaving the rest of the
 * message intact. A URL is keyed when it carries any query string or a path segment of at least
 * {@link SECRET_SEGMENT_MIN_LENGTH} characters; keyless public URLs stay readable, since which
 * vendor produced an error is the most useful diagnostic in it. Idempotent.
 */
export function redactKeyedUrl(message: string): string {
  return message.replace(/https?:\/\/[^\s"'<>\\]+/g, (url) => {
    const withoutScheme = url.slice(url.indexOf('://') + 3)
    const [beforeQuery, ...queryParts] = withoutScheme.split('?')
    if (queryParts.length > 0 && queryParts.join('?').length > 0) return REDACTED_URL
    const segments = beforeQuery!.split('/').slice(1)
    return segments.some((s) => s.length >= SECRET_SEGMENT_MIN_LENGTH) ? REDACTED_URL : url
  })
}

// ---------------------------------------------------------------------------
// RPC header VALUES — a second, unrelated leak path a keyed URL doesn't cover.
//
// `--rpc-header`/`$ETH_RPC_HEADERS` (see `rpcHeaders.ts`) hand this CLI credentials that never
// touch a URL at all, so `redactKeyedUrl`'s shape-based rule (long path segment, query string)
// cannot find them — there is no shape to a header value; a gateway's own key could be `"1234"` or
// a 200-char bearer token, and either can come straight back in that SAME gateway's error text (an
// auth failure that echoes the value it rejected is exactly the shape a keyed URL's failure already
// takes). The only thing that identifies a value as secret is that THIS RUN sent it, so — unlike
// `redactKeyedUrl` — this is an EXACT-MATCH scrub against the values actually used, not a pattern.
//
// A MODULE-LEVEL REGISTRY, on purpose and for the same reason `cli/cache.ts`'s `pendingSave` is
// one: an `rl` invocation resolves exactly one header set for its one chain context, so a single
// slot is the whole registry needed — no map, no ids, and every error path (`rl.ts`'s catch-all,
// `commands/context.ts`'s chain-probe failure, `scripts/recordSession.ts`'s captured fixture
// errors) reads the same slot without having to thread the headers through every call that might
// end up printing or persisting a message.
// ---------------------------------------------------------------------------

let activeHeaders: RpcHeaderPair[] = []

type RpcHeaderPair = { name: string; value: string }

/**
 * Registers the exact RPC header values this run is sending, so {@link redactHeaderValues} can
 * scrub them out of anything printed or persisted afterwards. Call it BEFORE the first network
 * request that carries them — including the chain-detection probe — so a failure on that very
 * first request is covered too. Replaces any prior registration (one call per invocation).
 */
export function registerRpcHeaders(headers: Record<string, string>): void {
  activeHeaders = Object.entries(headers)
    .filter(([, value]) => value.length > 0)
    .map(([name, value]) => ({ name, value }))
}

/** Test-only: clears whatever {@link registerRpcHeaders} registered, so one test's headers cannot
 * leak into the next. */
export function resetRpcHeaders(): void {
  activeHeaders = []
}

/**
 * Replaces every literal occurrence of a registered header VALUE in `message` with
 * `<Name: redacted>` — the header's NAME is kept (it is not a secret, and it is what makes the
 * redaction still useful as a diagnostic), the value never is. Longest value first, so one
 * header's value being a substring of another's can never leave a partial value exposed.
 */
export function redactHeaderValues(message: string): string {
  let out = message
  for (const { name, value } of [...activeHeaders].sort((a, b) => b.value.length - a.value.length)) {
    out = out.split(value).join(`<${name}: redacted>`)
  }
  return out
}

/** Both redaction rules, composed — the one function every print/persist path should call. */
export function redact(message: string): string {
  return redactHeaderValues(redactKeyedUrl(message))
}
