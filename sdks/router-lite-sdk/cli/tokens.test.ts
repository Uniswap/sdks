import { describe, expect, it } from 'bun:test'
import type { Address, PublicClient } from 'viem'

import { UsageError } from './args'
import { fetchTokenMeta } from './tokens'

const TOKEN = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48' as Address

/**
 * `fetchTokenMeta`'s caches are MODULE-scoped (one CLI process resolves one chain's tokens once), so
 * every test below uses its own chain id to get a clean key namespace instead of an exported reset
 * that only tests would ever call.
 */
let nextChainId = 900_000
function freshChain(): number {
  return nextChainId++
}

type Behaviour = {
  /** Resolve `decimals()` with this, or reject if it is an Error. */
  decimals?: unknown
  /** Resolve the string `symbol()` with this, or reject if it is an Error. */
  symbol?: unknown
  /** Resolve the bytes32 `symbol()` fallback with this, or reject if it is an Error. */
  symbolBytes32?: unknown
}

type FakeClient = { client: PublicClient; calls: string[]; inFlight: () => number }

/** A client that records which reads it was asked for, and answers per {@link Behaviour}. */
function fakeClient(behaviour: Behaviour, gate?: Promise<void>): FakeClient {
  const calls: string[] = []
  let inFlight = 0
  const client = {
    readContract: async (args: { functionName: string; abi: readonly unknown[] }): Promise<unknown> => {
      // The bytes32 fallback is a second `symbol` read against a different ABI, distinguished here
      // the same way the caller distinguishes them: by which ABI was handed in.
      const bytes32 = args.functionName === 'symbol' && calls.includes('symbol')
      const label = bytes32 ? 'symbol:bytes32' : args.functionName
      calls.push(label)
      inFlight++
      try {
        if (gate) await gate
        const value = label === 'decimals' ? behaviour.decimals : label === 'symbol' ? behaviour.symbol : behaviour.symbolBytes32
        if (value instanceof Error) throw value
        return value
      } finally {
        inFlight--
      }
    },
  } as unknown as PublicClient
  return { client, calls, inFlight: () => inFlight }
}

describe('fetchTokenMeta', () => {
  it('reads decimals() and symbol() in ONE round trip — both are in flight together', async () => {
    let open!: () => void
    const gate = new Promise<void>((resolve) => {
      open = resolve
    })
    const { client, calls, inFlight } = fakeClient({ decimals: 6, symbol: 'USDC' }, gate)

    const pending = fetchTokenMeta(client, freshChain(), TOKEN)
    await Promise.resolve() // let both dispatches happen
    expect(calls).toEqual(['decimals', 'symbol'])
    expect(inFlight()).toBe(2)

    open()
    expect(await pending).toEqual({ ref: TOKEN, symbol: 'USDC', decimals: 6 })
  })

  it('shares one in-flight fetch between concurrent callers instead of reading twice', async () => {
    let open!: () => void
    const gate = new Promise<void>((resolve) => {
      open = resolve
    })
    const { client, calls } = fakeClient({ decimals: 6, symbol: 'USDC' }, gate)
    const chainId = freshChain()

    const both = Promise.all([fetchTokenMeta(client, chainId, TOKEN), fetchTokenMeta(client, chainId, TOKEN)])
    open()
    const [a, b] = await both

    expect(calls).toEqual(['decimals', 'symbol'])
    expect(a).toEqual(b)
  })

  it('serves a completed fetch from the cache without reading again', async () => {
    const { client, calls } = fakeClient({ decimals: 18, symbol: 'WETH' })
    const chainId = freshChain()

    await fetchTokenMeta(client, chainId, TOKEN)
    await fetchTokenMeta(client, chainId, TOKEN)

    expect(calls).toEqual(['decimals', 'symbol'])
  })

  it('rejects a token whose decimals() fails, even when symbol() answered', async () => {
    const { client } = fakeClient({ decimals: new Error('execution reverted'), symbol: 'USDC' })
    await expect(fetchTokenMeta(client, freshChain(), TOKEN)).rejects.toThrow(UsageError)
  })

  it('does not cache a failed fetch — the next caller gets to try again', async () => {
    const chainId = freshChain()
    const failing = fakeClient({ decimals: new Error('rpc hiccup'), symbol: 'USDC' })
    await expect(fetchTokenMeta(failing.client, chainId, TOKEN)).rejects.toThrow(UsageError)

    const working = fakeClient({ decimals: 6, symbol: 'USDC' })
    expect(await fetchTokenMeta(working.client, chainId, TOKEN)).toEqual({ ref: TOKEN, symbol: 'USDC', decimals: 6 })
    expect(working.calls).toEqual(['decimals', 'symbol'])
  })

  it('falls back to the bytes32 symbol() when the string one fails', async () => {
    const { client, calls } = fakeClient({
      decimals: 18,
      symbol: new Error('returned bytes32'),
      // 'MKR' left-aligned in 32 bytes, exactly as an MKR-era token answers.
      symbolBytes32: `0x4d4b52${'00'.repeat(29)}`,
    })
    expect(await fetchTokenMeta(client, freshChain(), TOKEN)).toEqual({ ref: TOKEN, symbol: 'MKR', decimals: 18 })
    expect(calls).toEqual(['decimals', 'symbol', 'symbol:bytes32'])
  })

  it('falls back to a shortened address when neither symbol() shape answers', async () => {
    const { client } = fakeClient({
      decimals: 6,
      symbol: new Error('no symbol'),
      symbolBytes32: new Error('no symbol either'),
    })
    const meta = await fetchTokenMeta(client, freshChain(), TOKEN)
    expect(meta.decimals).toBe(6)
    expect(meta.symbol).toContain('…')
  })
})
