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
