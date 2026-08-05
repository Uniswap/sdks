import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterAll, beforeAll, describe, expect, it } from 'bun:test'

import { UsageError } from './args'
import { chainzRpcUrl, matchChain, parseChainzList, resolveChain, type ChainzEntry } from './chains'

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

// A shim standing in for chainz: knows no chains at all (`list` is empty, `exec` exits 1 the way
// the real chainz does for an unconfigured chain). Wired in via the RL_CHAINZ_BIN override —
// `chains.ts`'s explicit test seam — rather than a PATH prepend, which does not reliably redirect
// executable resolution under every runtime's spawn.
describe('chainz process integration (stubbed via RL_CHAINZ_BIN shim)', () => {
  let shimDir: string

  beforeAll(() => {
    shimDir = mkdtempSync(join(tmpdir(), 'rl-chainz-shim-'))
    const shim = join(shimDir, 'chainz')
    writeFileSync(
      shim,
      '#!/bin/sh\ncase "$1" in\n  --version) echo "chainz 0.0.0-shim"; exit 0;;\n  list) echo "[]"; exit 0;;\n  exec) echo "Chain not found" >&2; exit 1;;\nesac\nexit 1\n',
    )
    chmodSync(shim, 0o755)
    process.env.RL_CHAINZ_BIN = shim
  })

  afterAll(() => {
    delete process.env.RL_CHAINZ_BIN
    rmSync(shimDir, { recursive: true, force: true })
  })

  it('treats a nonzero chainz exit (chain not configured) as undefined, not an error', () => {
    // execFileSync reports the child's exit code via `status`; a missing chain must come back as
    // "no URL" so `resolveChain` can render its friendly guidance instead of an internal stack.
    expect(chainzRpcUrl(4663)).toBeUndefined()
  })

  it('resolveChain renders the friendly no-endpoint guidance (a UsageError, exit 3)', () => {
    expect(() => resolveChain('mainnet', undefined)).toThrow(UsageError)
    expect(() => resolveChain('mainnet', undefined)).toThrow(/chainz add.*--rpc/)
  })

  it('never spawns chainz when --rpc is supplied', () => {
    const resolved = resolveChain('mainnet', 'https://rpc.example.test/KEYKEYKEYKEYKEYKEYKEY')
    expect(resolved.rpcUrl).toBe('https://rpc.example.test/KEYKEYKEYKEYKEYKEYKEY')
    expect(resolved.rpcSource).toBe('--rpc')
  })
})
