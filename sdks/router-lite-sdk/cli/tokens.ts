// ---------------------------------------------------------------------------
// Token resolution — how `rl quote eth usdc 1` works without a token list.
//
// Three input forms:
//  - `eth` / `native`         → the chain's native currency;
//  - `0x…` (40 hex chars)     → that ERC-20, symbol/decimals fetched on-chain;
//  - any other word (`usdc`)  → matched, case-insensitively, against the
//    ON-CHAIN symbols of the manifest's own `coreIntermediates` (wrapped
//    native included).
//
// The symbol path deliberately carries no hardcoded addresses: the manifest's
// core intermediates are the chain's majors already (USDC on mainnet/Base/
// Arbitrum/Unichain, USDG on Robinhood Chain — where no USDC exists at all),
// so resolving `usdc` *through the manifest* is both zero-maintenance and
// honest per chain — a symbol the chain's manifest doesn't carry is an error
// naming the symbols that would have worked, not a guess. Metadata is cached
// per session so repeated formatting never refetches.
// ---------------------------------------------------------------------------

import { hexToString, parseAbi, trim, type Address, type PublicClient } from 'viem'

import type { ChainManifest, CurrencyRef } from '../src/index'

import { shortHex } from './ansi'
import { UsageError } from './args'


export type ResolvedToken = {
  ref: CurrencyRef
  symbol: string
  decimals: number
}

const ERC20_META_ABI = parseAbi(['function symbol() view returns (string)', 'function decimals() view returns (uint8)'])
const ERC20_SYMBOL_BYTES32_ABI = parseAbi(['function symbol() view returns (bytes32)'])

function isAddress(s: string): s is Address {
  return /^0x[0-9a-fA-F]{40}$/.test(s)
}

/** Session-scoped metadata cache, keyed `${chainId}:${lowercased address}`. */
const metaCache = new Map<string, ResolvedToken>()

/**
 * Fetches `symbol()`/`decimals()` for `address`, with the classic bytes32-symbol fallback (MKR-era
 * tokens). A token with no readable `decimals()` is rejected — amount parsing without decimals
 * would silently mis-scale, which is worse than refusing.
 */
export async function fetchTokenMeta(client: PublicClient, chainId: number, address: Address): Promise<ResolvedToken> {
  const key = `${chainId}:${address.toLowerCase()}`
  const cached = metaCache.get(key)
  if (cached) return cached

  let decimals: number
  try {
    decimals = await client.readContract({ address, abi: ERC20_META_ABI, functionName: 'decimals' })
  } catch {
    throw new UsageError(`${address} does not answer decimals() — is it an ERC-20 on this chain?`)
  }

  let symbol: string
  try {
    symbol = await client.readContract({ address, abi: ERC20_META_ABI, functionName: 'symbol' })
  } catch {
    try {
      const raw = await client.readContract({ address, abi: ERC20_SYMBOL_BYTES32_ABI, functionName: 'symbol' })
      symbol = hexToString(trim(raw, { dir: 'right' }))
    } catch {
      symbol = shortHex(address) // display-only fallback; the address is still fully usable
    }
  }

  const resolved: ResolvedToken = { ref: address, symbol, decimals }
  metaCache.set(key, resolved)
  return resolved
}

/** The manifest's symbol-resolvable addresses: wrapped native first, then the core intermediates. */
function symbolCandidates(manifest: ChainManifest): Address[] {
  const seen = new Set<string>()
  const out: Address[] = []
  for (const addr of [manifest.wrappedNative, ...(manifest.coreIntermediates ?? [])]) {
    const key = addr.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(addr)
  }
  return out
}

/** Resolves one CLI token argument (see module header for the three accepted forms). */
export async function resolveToken(
  client: PublicClient,
  manifest: ChainManifest,
  input: string,
): Promise<ResolvedToken> {
  const lower = input.trim().toLowerCase()
  if (lower === 'eth' || lower === 'native') {
    return { ref: 'native', symbol: 'ETH', decimals: 18 }
  }
  if (input.startsWith('0x')) {
    if (!isAddress(input)) throw new UsageError(`'${input}' is not a valid address`)
    return fetchTokenMeta(client, manifest.chainId, input)
  }

  const candidates = symbolCandidates(manifest)
  const metas = await Promise.all(candidates.map((addr) => fetchTokenMeta(client, manifest.chainId, addr)))
  const match = metas.find((m) => m.symbol.toLowerCase() === lower)
  if (match) return match

  const available = ['eth', ...metas.map((m) => m.symbol)].join(', ')
  throw new UsageError(
    `unknown token '${input}' on this chain — resolvable symbols here are: ${available}; anything else needs its address`,
  )
}
