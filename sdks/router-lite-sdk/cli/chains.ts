// ---------------------------------------------------------------------------
// Chain resolution — built-in manifests cross-referenced with the user's
// `chainz` CLI (the local tool of record for which chains this machine has
// endpoints for).
//
// Two sources, two jobs:
//  - the SDK's built-in manifests decide WHAT is routable (the five chains
//    `manifestFor` knows out of the box);
//  - chainz decides WHERE to connect (its configured RPC endpoint for that
//    chain), unless `--rpc` overrides it.
//
// KEYED URLS ARE NEVER PRINTED. The RPC URL is resolved by capturing
// `chainz exec <id> -- sh -c 'printf %s "$ETH_RPC_URL"'` — the URL travels
// process-to-process, never through a terminal — and everything this module
// throws is pre-redacted with `redactKeyedUrl` so even a failure path cannot
// echo a key. (`chainz list --json`, used for name matching, redacts its own
// URLs before we ever see them.)
// ---------------------------------------------------------------------------

import { execFileSync } from 'node:child_process'
import { homedir } from 'node:os'
import { join } from 'node:path'

import { manifestFor, type ChainManifest } from '../src/index'

import { UsageError } from './args'
import { redactKeyedUrl } from './redact'


export type BuiltinChain = { chainId: number; name: string; aliases: string[]; swaps: boolean }

/** The five chains the SDK ships manifests for (`src/manifest.ts`), with the CLI's accepted names. */
export const BUILTIN_CHAINS: BuiltinChain[] = [
  { chainId: 1, name: 'Ethereum Mainnet', aliases: ['mainnet', 'ethereum', 'eth'], swaps: true },
  { chainId: 130, name: 'Unichain', aliases: ['unichain'], swaps: true },
  { chainId: 8453, name: 'Base', aliases: ['base'], swaps: true },
  { chainId: 42161, name: 'Arbitrum One', aliases: ['arbitrum', 'arb'], swaps: true },
  { chainId: 4663, name: 'Robinhood Chain', aliases: ['robinhood', 'rh'], swaps: false }, // quote-only
]

export type ChainzEntry = { name: string; aliases: string[]; chainId: number }

/**
 * Parses `chainz list --json` output into the three fields this CLI matches on. Pure — the JSON
 * shape is pinned by a unit test with a canned capture, so a chainz upgrade that changes it fails
 * loudly in the suite instead of silently breaking `--chain <name>` at the terminal.
 */
export function parseChainzList(json: string): ChainzEntry[] {
  const raw = JSON.parse(json) as Array<{ name?: unknown; aliases?: unknown; chain_id?: unknown }>
  if (!Array.isArray(raw)) throw new Error('chainz list --json did not return an array')
  return raw
    .filter((e) => typeof e.name === 'string' && typeof e.chain_id === 'number')
    .map((e) => ({
      name: e.name as string,
      aliases: Array.isArray(e.aliases) ? (e.aliases as unknown[]).filter((a): a is string => typeof a === 'string') : [],
      chainId: e.chain_id as number,
    }))
}

/**
 * Matches a user's `--chain` spec (id, builtin alias, or chainz name/alias — case-insensitive)
 * against both sources. Pure; chainz entries are optional so the CLI still resolves builtin names
 * with no chainz installed at all.
 */
export function matchChain(
  spec: string,
  chainz: ChainzEntry[],
): { chainId: number; builtin?: BuiltinChain; chainzName?: string } {
  const lower = spec.trim().toLowerCase()
  const asId = /^\d+$/.test(lower) ? Number(lower) : undefined

  const builtin = BUILTIN_CHAINS.find(
    (c) => c.chainId === asId || c.aliases.includes(lower) || c.name.toLowerCase() === lower,
  )
  const viaChainz = chainz.find(
    (c) =>
      c.chainId === (asId ?? builtin?.chainId) ||
      c.name.toLowerCase() === lower ||
      c.aliases.some((a) => a.toLowerCase() === lower),
  )
  const chainId = builtin?.chainId ?? viaChainz?.chainId ?? asId
  if (chainId === undefined) {
    const known = BUILTIN_CHAINS.map((c) => c.aliases[0]).join(', ')
    throw new UsageError(`unknown chain '${spec}' — try one of: ${known}, a chain id, or a chainz chain name`)
  }
  const resolvedBuiltin = builtin ?? BUILTIN_CHAINS.find((c) => c.chainId === chainId)
  const result: { chainId: number; builtin?: BuiltinChain; chainzName?: string } = { chainId }
  if (resolvedBuiltin) result.builtin = resolvedBuiltin
  if (viaChainz) result.chainzName = viaChainz.name
  return result
}

// ---------------------------------------------------------------------------
// chainz process integration (impure; everything above is pure and tested).
// ---------------------------------------------------------------------------

function chainzBinary(): string | undefined {
  // `RL_CHAINZ_BIN` pins the binary outright — for a non-standard install location, and for the
  // unit tests, which point it at a shim (mutating PATH does not reliably redirect executable
  // resolution under every runtime's spawn, so the seam is explicit instead).
  const override = process.env.RL_CHAINZ_BIN
  const candidates = override ? [override] : ['chainz', join(homedir(), '.nix-profile/bin/chainz')]
  for (const candidate of candidates) {
    try {
      execFileSync(candidate, ['--version'], { stdio: ['ignore', 'ignore', 'ignore'] })
      return candidate
    } catch {
      /* try the next location */
    }
  }
  return undefined
}

let cachedBinary: { key: string | undefined; value: string | undefined } | undefined

function binary(): string | undefined {
  // Cache keyed by the override so a test (or shell) that changes RL_CHAINZ_BIN mid-process is
  // never served the previous binary.
  const key = process.env.RL_CHAINZ_BIN
  if (!cachedBinary || cachedBinary.key !== key) cachedBinary = { key, value: chainzBinary() }
  return cachedBinary.value
}

/** Every chain chainz knows about, or `[]` when chainz is not installed/configured. */
export function chainzChains(): ChainzEntry[] {
  const bin = binary()
  if (!bin) return []
  try {
    const out = execFileSync(bin, ['list', '--json'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
    return parseChainzList(out)
  } catch {
    return []
  }
}

/**
 * The configured RPC URL for `chainId`, captured from chainz's environment expansion — stdout of a
 * child process, never printed. Returns `undefined` when chainz is absent or has no such chain;
 * throws (redacted) only when chainz itself fails unexpectedly.
 */
export function chainzRpcUrl(chainId: number): string | undefined {
  const bin = binary()
  if (!bin) return undefined
  try {
    const url = execFileSync(bin, ['exec', String(chainId), '--', 'sh', '-c', 'printf %s "$ETH_RPC_URL"'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim()
    return url.length > 0 ? url : undefined
  } catch (err) {
    // A chain chainz doesn't have makes it exit nonzero, which execFileSync reports via the
    // error's `status` property (the child's exit code) — that is "not configured", not an error.
    // The message itself is just "Command failed: …", so string-matching it can never distinguish
    // the two; only a missing `status` (ENOENT, signal kill) is a real failure worth surfacing.
    const status = (err as { status?: number | null }).status
    if (typeof status === 'number') return undefined
    const message = err instanceof Error ? err.message : String(err)
    throw new Error(`chainz exec failed: ${redactKeyedUrl(message)}`)
  }
}

export type ResolvedChain = {
  chainId: number
  label: string
  manifest: ChainManifest
  rpcUrl: string
  rpcSource: 'chainz' | '--rpc'
  swaps: boolean
}

/**
 * Resolves `--chain`/`--rpc` into everything a command needs to build a router. The manifest must
 * be a built-in (this CLI does not take manifest overrides — that's SDK-integration territory);
 * the endpoint comes from `--rpc` when given, else from chainz.
 */
export function resolveChain(chainSpec: string | undefined, rpcOverride: string | undefined): ResolvedChain {
  // With --rpc there is nothing to ask chainz for — don't spawn it at all (built-in names/ids
  // resolve without it, and the machine may not even have chainz installed).
  const match = matchChain(chainSpec ?? 'mainnet', rpcOverride ? [] : chainzChains())
  if (!match.builtin) {
    const known = BUILTIN_CHAINS.map((c) => `${c.aliases[0]} (${c.chainId})`).join(', ')
    throw new UsageError(
      `chain ${match.chainzName ?? chainSpec} (id ${match.chainId}) has no built-in manifest — this CLI supports: ${known}`,
    )
  }
  const rpcUrl = rpcOverride ?? chainzRpcUrl(match.chainId)
  if (!rpcUrl) {
    throw new UsageError(
      `no RPC endpoint for ${match.builtin.name} — add it to chainz (\`chainz add\`) or pass --rpc <url>`,
    )
  }
  return {
    chainId: match.chainId,
    label: match.builtin.name,
    manifest: manifestFor(match.chainId),
    rpcUrl,
    rpcSource: rpcOverride ? '--rpc' : 'chainz',
    swaps: match.builtin.swaps,
  }
}

/**
 * Request timeout for the viem transport: generous on Robinhood Chain for the same reason the
 * canary's `robinhoodClient` is (0.1s blocks make single `eth_getLogs` legs slow even against a
 * good endpoint), standard elsewhere.
 */
export function clientTimeoutMs(chainId: number): number {
  return chainId === 4663 ? 120_000 : 30_000
}
