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
 * The same key's fetch while it is still in flight. The result cache above only fills once a fetch
 * has RETURNED, so without this the concurrent shape this module is actually used in —
 * `resolveTrade` resolves `tokenIn` and `tokenOut` at the same time, and a symbol argument makes
 * each of them read every one of the manifest's core intermediates — issued the whole metadata set
 * TWICE (measured on mainnet: 20 `eth_call`s for 5 tokens) because neither resolution had finished
 * when the other started. Sharing the promise makes the second caller await the first's calls.
 */
const inFlightMeta = new Map<string, Promise<ResolvedToken>>()

/**
 * Fetches `symbol()`/`decimals()` for `address`, with the classic bytes32-symbol fallback (MKR-era
 * tokens). A token with no readable `decimals()` is rejected — amount parsing without decimals
 * would silently mis-scale, which is worse than refusing.
 *
 * ONE ROUND TRIP, NOT TWO. The two reads are independent, so they go out together: this runs before
 * the search on every `quote`/`swap`, on an endpoint whose round trip is the unit of latency the
 * whole CLI is priced in (measured on a mainnet endpoint at ~0.9s/RTT: awaiting `decimals()` before
 * even dispatching `symbol()` put a second full round trip in front of every search). The
 * `Promise.allSettled` — rather than `Promise.all` — is what keeps the outcome identical to the
 * sequential version it replaces: `decimals()` is still the read whose failure rejects the token,
 * checked first, and a failed `symbol()` still falls back rather than throwing.
 */
export async function fetchTokenMeta(client: PublicClient, chainId: number, address: Address): Promise<ResolvedToken> {
  const key = `${chainId}:${address.toLowerCase()}`
  const cached = metaCache.get(key)
  if (cached) return cached
  const pending = inFlightMeta.get(key)
  if (pending) return pending

  const fetching = loadTokenMeta(client, address)
    .then((resolved) => {
      metaCache.set(key, resolved)
      return resolved
    })
    // Cleared either way: a failed read is not cached, so the next caller gets to try again.
    .finally(() => inFlightMeta.delete(key))
  inFlightMeta.set(key, fetching)
  return fetching
}

async function loadTokenMeta(client: PublicClient, address: Address): Promise<ResolvedToken> {
  const [decimalsRead, symbolRead] = await Promise.allSettled([
    client.readContract({ address, abi: ERC20_META_ABI, functionName: 'decimals' }),
    client.readContract({ address, abi: ERC20_META_ABI, functionName: 'symbol' }),
  ])

  if (decimalsRead.status !== 'fulfilled') {
    throw new UsageError(`${address} does not answer decimals() — is it an ERC-20 on this chain?`)
  }

  let symbol: string
  if (symbolRead.status === 'fulfilled') {
    symbol = symbolRead.value
  } else {
    try {
      const raw = await client.readContract({ address, abi: ERC20_SYMBOL_BYTES32_ABI, functionName: 'symbol' })
      symbol = hexToString(trim(raw, { dir: 'right' }))
    } catch {
      symbol = shortHex(address) // display-only fallback; the address is still fully usable
    }
  }

  return { ref: address, symbol, decimals: decimalsRead.value }
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
