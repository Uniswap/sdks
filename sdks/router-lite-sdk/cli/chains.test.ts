import { describe, expect, it } from 'bun:test'

import { UsageError } from './args'
import { assertChainMatches, parseChainAssertion, resolveManifest, resolveRpcUrl } from './chains'

describe('resolveRpcUrl', () => {
  it('prefers --rpc over $ETH_RPC_URL', () => {
    expect(resolveRpcUrl('https://flag.example/A', { ETH_RPC_URL: 'https://env.example/B' })).toBe('https://flag.example/A')
  })

  it('falls back to $ETH_RPC_URL — the variable `chainz exec` exports', () => {
    expect(resolveRpcUrl(undefined, { ETH_RPC_URL: 'https://env.example/B' })).toBe('https://env.example/B')
  })

  it('rejects an empty/missing endpoint with the chainz composition pattern in the message', () => {
    expect(() => resolveRpcUrl(undefined, {})).toThrow(UsageError)
    expect(() => resolveRpcUrl(undefined, { ETH_RPC_URL: '  ' })).toThrow(/chainz exec 1 -- bun cli\/rl\.ts/)
  })
})

describe('parseChainAssertion', () => {
  it('parses a numeric id and passes absence through', () => {
    expect(parseChainAssertion('8453')).toBe(8453)
    expect(parseChainAssertion(' 1 ')).toBe(1)
    expect(parseChainAssertion(undefined)).toBeUndefined()
  })

  it('rejects names — the chain is detected, not selected', () => {
    expect(() => parseChainAssertion('mainnet')).toThrow(UsageError)
    expect(() => parseChainAssertion('base')).toThrow(/detected from the RPC endpoint/)
  })
})

describe('assertChainMatches', () => {
  it('accepts a matching assertion and no assertion at all', () => {
    expect(() => assertChainMatches(1, 1)).not.toThrow()
    expect(() => assertChainMatches(undefined, 8453)).not.toThrow()
  })

  it('rejects a mismatch — the wrong-endpoint guard', () => {
    expect(() => assertChainMatches(8453, 1)).toThrow(UsageError)
    expect(() => assertChainMatches(8453, 1)).toThrow(/serves chain 1.*wrong endpoint/)
  })
})

describe('resolveManifest', () => {
  it('maps a built-in chain id to its manifest and facts', () => {
    const resolved = resolveManifest(4663)
    expect(resolved.label).toBe('Robinhood Chain')
    expect(resolved.swaps).toBe(true) // swaps since the ur-2.1 command set — exactly as the SDK ships it
    expect(resolved.manifest.chainId).toBe(4663)
  })

  it('explains what would work for a chain with no built-in manifest', () => {
    expect(() => resolveManifest(7777777)).toThrow(UsageError)
    expect(() => resolveManifest(7777777)).toThrow(/chain 7777777.*Ethereum Mainnet \(1\).*manifestFor overrides/)
  })
})
