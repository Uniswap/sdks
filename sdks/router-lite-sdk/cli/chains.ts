// ---------------------------------------------------------------------------
// Chain + endpoint resolution — this CLI takes parameters, and nothing else.
//
// It deliberately knows nothing about how endpoints are managed on a machine
// (no chainz integration, no config files, no child processes): the endpoint
// arrives as `--rpc <url>` or `$ETH_RPC_URL` — exactly what
// `chainz exec <chain> --` exports — and the chain identifies ITSELF via
// `eth_chainId` against that endpoint, mapped onto the SDK's built-in
// manifests. Composition over integration: `chainz exec 1 -- bun cli/rl.ts
// quote …` gets endpoint management for free, and so does anything else that
// can set an env var.
//
// `--chain <id>` survives as an ASSERTION, not a selector: it never picks an
// endpoint, it cross-checks the one provided — catching the classic
// wrong-endpoint mistake (asserting 8453 while $ETH_RPC_URL points at
// mainnet) before any search runs. Name-based selection is gone by design.
//
// KEYED URLS ARE STILL NEVER PRINTED: the URL now arrives via flag/env, but
// the leak surface is unchanged (viem embeds it in every error it builds), so
// every error path stays scrubbed with `redactKeyedUrl` (see `rl.ts` and
// `context.ts`).
// ---------------------------------------------------------------------------

import { manifestFor, type ChainManifest } from '../src/index'

import { UsageError } from './args'

export type BuiltinChain = { chainId: number; name: string; swaps: boolean }

/** The five chains the SDK ships manifests for (`src/manifest.ts`). */
export const BUILTIN_CHAINS: BuiltinChain[] = [
  { chainId: 1, name: 'Ethereum Mainnet', swaps: true },
  { chainId: 130, name: 'Unichain', swaps: true },
  { chainId: 8453, name: 'Base', swaps: true },
  { chainId: 42161, name: 'Arbitrum One', swaps: true },
  { chainId: 4663, name: 'Robinhood Chain', swaps: true }, // UR 2.1.1, commandSet 'ur-2.1'
]

function supportedList(): string {
  return BUILTIN_CHAINS.map((c) => `${c.name} (${c.chainId})`).join(', ')
}

/**
 * The RPC endpoint to connect to, and the single precedence every entry point in this package
 * (`cli/rl.ts`, `scripts/compare.ts`, `scripts/buildPoolList.ts`, `scripts/recordSession.ts`) shares:
 * `--rpc` wins, `$ETH_RPC_URL` is next (that variable is exactly what `chainz exec <chain> --`
 * exports, so chainz-driven usage needs no flag at all), and `$RPC_URL` is the last, more generic
 * fallback for callers that already export that name for other tooling. Having none of the three is
 * a friendly one-liner showing the composition pattern. `env` is injectable for tests; nothing here
 * ever prints the resolved URL.
 */
export function resolveRpcUrl(
  rpcFlag: string | undefined,
  env: Record<string, string | undefined> = process.env,
): string {
  const url = rpcFlag ?? env.ETH_RPC_URL ?? env.RPC_URL
  if (url !== undefined && url.trim().length > 0) return url.trim()
  throw new UsageError(
    'no RPC endpoint — pass --rpc <url>, export ETH_RPC_URL, or export RPC_URL ' +
      '(e.g. drive it through chainz: `chainz exec 1 -- bun cli/rl.ts quote eth usdc 1`)',
  )
}

/**
 * Parses the `--chain` assertion: a numeric chain id, or nothing. The chain is detected from the
 * endpoint itself, so an assertion that needs no lookup table is one that cannot drift from it.
 */
export function parseChainAssertion(spec: string | undefined): number | undefined {
  if (spec === undefined) return undefined
  const trimmed = spec.trim()
  if (!/^\d+$/.test(trimmed)) {
    throw new UsageError(
      `--chain takes a numeric chain id to assert (e.g. --chain 8453), not '${spec}' — the chain itself is detected from the RPC endpoint`,
    )
  }
  return Number(trimmed)
}

/** The wrong-endpoint guard: a `--chain` assertion that disagrees with what the endpoint actually
 * serves is an error BEFORE any search runs, never a confident answer about the wrong chain. */
export function assertChainMatches(asserted: number | undefined, actual: number): void {
  if (asserted === undefined || asserted === actual) return
  throw new UsageError(
    `--chain ${asserted} asserted, but the connected RPC serves chain ${actual} — wrong endpoint? (check what $ETH_RPC_URL points at)`,
  )
}

export type ResolvedChain = { chainId: number; label: string; manifest: ChainManifest; swaps: boolean }

/** Maps a detected chain id onto a built-in manifest, or explains exactly what would work. */
export function resolveManifest(chainId: number): ResolvedChain {
  const builtin = BUILTIN_CHAINS.find((c) => c.chainId === chainId)
  if (!builtin) {
    throw new UsageError(
      `the connected RPC serves chain ${chainId}, which has no built-in manifest — this CLI supports: ${supportedList()}. ` +
        'Other chains are routable via the SDK with manifestFor overrides, not through this CLI.',
    )
  }
  return { chainId, label: builtin.name, manifest: manifestFor(chainId), swaps: builtin.swaps }
}

/**
 * Request timeout for the viem transport: generous on Robinhood Chain for the same reason the
 * canary's `robinhoodClient` is (0.1s blocks make single `eth_getLogs` legs slow even against a
 * good endpoint), standard elsewhere.
 */
export function clientTimeoutMs(chainId: number): number {
  return chainId === 4663 ? 120_000 : 30_000
}
