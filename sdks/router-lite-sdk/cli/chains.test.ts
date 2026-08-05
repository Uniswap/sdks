import { describe, expect, it } from 'bun:test'

import { UsageError } from './args'
import { matchChain, parseChainzList, type ChainzEntry } from './chains'

// A canned `chainz list --json` capture (URLs already redacted by chainz itself; this CLI only
// reads name/aliases/chain_id). Pins the parse to the real shape so a chainz upgrade that changes
// it fails here, not at the terminal.
const CHAINZ_JSON = JSON.stringify([
  { name: 'Ethereum Mainnet', aliases: [], chain_id: 1, selected_rpc: 'https://redacted', key_name: 'default' },
  { name: 'Base', aliases: ['b'], chain_id: 8453 },
  { name: 'Zora', aliases: [], chain_id: 7777777 },
  { name: 'malformed entry', chain_id: 'not-a-number' },
])

describe('parseChainzList', () => {
  it('extracts name/aliases/chainId and drops malformed entries', () => {
    expect(parseChainzList(CHAINZ_JSON)).toEqual([
      { name: 'Ethereum Mainnet', aliases: [], chainId: 1 },
      { name: 'Base', aliases: ['b'], chainId: 8453 },
      { name: 'Zora', aliases: [], chainId: 7777777 },
    ])
  })
})

describe('matchChain', () => {
  const chainz: ChainzEntry[] = parseChainzList(CHAINZ_JSON)

  it('matches built-in aliases and ids without chainz', () => {
    expect(matchChain('mainnet', []).chainId).toBe(1)
    expect(matchChain('8453', []).chainId).toBe(8453)
    expect(matchChain('Robinhood Chain', []).chainId).toBe(4663)
  })

  it('is case-insensitive and matches chainz names and aliases', () => {
    const match = matchChain('BASE', chainz)
    expect(match.chainId).toBe(8453)
    expect(match.builtin?.swaps).toBe(true)
    expect(match.chainzName).toBe('Base')
    expect(matchChain('b', chainz).chainId).toBe(8453)
  })

  it('resolves a chainz-only chain to its id with no builtin attached', () => {
    const match = matchChain('zora', chainz)
    expect(match.chainId).toBe(7777777)
    expect(match.builtin).toBeUndefined()
  })

  it('rejects a name neither source knows', () => {
    expect(() => matchChain('gibberish', chainz)).toThrow(UsageError)
  })
})
