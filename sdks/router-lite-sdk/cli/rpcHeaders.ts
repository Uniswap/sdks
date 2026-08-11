// ---------------------------------------------------------------------------
// RPC header resolution — `--rpc-header` and `$ETH_RPC_HEADERS`.
//
// `chainz exec`/`chainz shell` export custom headers as `ETH_RPC_HEADERS` in
// foundry's own wire format: comma-separated `Name: value` pairs (chainz
// src/variables.rs, `pairs.push(format!("{name}: {value}"))` then
// `pairs.join(",")`), which is exactly what cast/forge parse natively. This
// is the SAME variable `scripts/recordOutcomes.ts` already reads (its own
// `rpcHeaders()` — see there); this module is the one parser both it and the
// CLI's chain-touching commands import, rather than two copies drifting.
//
// THE ONE THING THIS FORMAT CANNOT EXPRESS: a header value containing a
// comma. There is no escaping in `Name: value,Name: value` — chainz itself
// refuses to export a header whose value contains a comma (or a line break)
// rather than produce an ambiguous string (variables.rs bails before ever
// setting the env var), so a comma reaching this parser is always a
// separator between two pairs, never part of a value. This parser does not
// invent an escaping rule chainz does not have.
// ---------------------------------------------------------------------------

import { UsageError } from './args'

export type RpcHeaderPair = { name: string; value: string }

/**
 * Splits one foundry-format `ETH_RPC_HEADERS`-shaped string into pairs: comma-separated between
 * pairs, the FIRST colon inside a pair separates the name from the value (so a value that itself
 * contains a colon — a bearer token, a URL — is not truncated), both trimmed.
 *
 * Throws a {@link UsageError} on a pair with no colon or an empty name, rather than silently
 * dropping it: a header the caller believes is being sent and is not is a worse failure than a
 * loud one, and this is the one thing recorded/CLI header handling must never do quietly.
 */
export function parseRpcHeaderPairs(raw: string): RpcHeaderPair[] {
  const trimmed = raw.trim()
  if (trimmed.length === 0) return []
  return trimmed.split(',').map((part) => {
    const at = part.indexOf(':')
    const name = at > 0 ? part.slice(0, at).trim() : ''
    if (at <= 0 || name.length === 0) {
      throw new UsageError(`malformed RPC header '${part.trim()}' — expected 'Name: value' (comma-separated for more than one)`)
    }
    return { name, value: part.slice(at + 1).trim() }
  })
}

/**
 * Merges header pairs into a single record, keyed CASE-INSENSITIVELY (HTTP header names are), with
 * a LATER pair in `pairs` overriding an earlier one on a name collision — which is the whole
 * mechanism {@link resolveRpcHeaders} relies on to make an explicit `--rpc-header` win over
 * `$ETH_RPC_HEADERS`: it simply lists the env pairs first. The WINNING pair's original casing is
 * what's kept for the header name actually sent.
 */
function mergePairs(pairs: RpcHeaderPair[]): Record<string, string> {
  const byLower = new Map<string, RpcHeaderPair>()
  for (const pair of pairs) byLower.set(pair.name.toLowerCase(), pair)
  const out: Record<string, string> = {}
  for (const { name, value } of byLower.values()) out[name] = value
  return out
}

/**
 * This run's RPC headers: `$ETH_RPC_HEADERS` (foundry format, `undefined`/empty when unset) merged
 * with `flagValues` — one string per `--rpc-header` occurrence, each itself allowed to carry the
 * same comma-separated shape as the env var. Explicit flags win on a case-insensitive name
 * collision, because a flag typed for THIS invocation is a more specific instruction than an
 * ambient env var that was probably set for every invocation in the shell.
 */
export function resolveRpcHeaders(envRaw: string | undefined, flagValues: string[]): Record<string, string> {
  const envPairs = envRaw !== undefined ? parseRpcHeaderPairs(envRaw) : []
  const flagPairs = flagValues.flatMap(parseRpcHeaderPairs)
  return mergePairs([...envPairs, ...flagPairs])
}
