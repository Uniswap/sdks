import { describe, expect, it } from 'bun:test'
import type { Address, PublicClient } from 'viem'

import type { ChainManifest } from '../src/index'

import { UsageError } from './args'
import { fetchTokenMeta, resolveToken, RpcError } from './tokens'

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

  // -------------------------------------------------------------------------
  // A LOST CALL IS NOT A VERDICT ABOUT THE TOKEN. Both branches below are a
  // failed `decimals()` read; only one of them is evidence that there is no
  // ERC-20 at the address. Reporting them identically told a user checking a
  // rate-limited endpoint that USDC "does not answer decimals()" — and exited 3
  // (fix your arguments) for something a retry would have fixed.
  // -------------------------------------------------------------------------

  it('blames the ENDPOINT, not the token, when decimals() is lost in the transport', async () => {
    // The live shape: a budgeted run sets `retryCount: 0`, so one 429 fails the read outright.
    const rateLimited = Object.assign(new Error('HTTP request failed.\nStatus: 429\nURL: https://rpc.example/key'), {
      status: 429,
    })
    const { client } = fakeClient({ decimals: rateLimited, symbol: 'USDC' })

    const failure = fetchTokenMeta(client, freshChain(), TOKEN)
    await expect(failure).rejects.toThrow(RpcError)
    await expect(failure).rejects.toThrow(/rpc unavailable while resolving token/)
    // ...and it must NOT make the claim it has no evidence for.
    await expect(failure).rejects.not.toThrow(/is it an ERC-20/)
  })

  it('keeps the not-an-ERC-20 message for a genuine execution result', async () => {
    // The node answered and the EVM rejected the call: nothing there answers `decimals()`. That IS
    // about the address, and the message that names it stays exactly as it was.
    const { client } = fakeClient({ decimals: new Error('execution reverted'), symbol: 'USDC' })

    const failure = fetchTokenMeta(client, freshChain(), TOKEN)
    await expect(failure).rejects.toThrow(UsageError)
    await expect(failure).rejects.toThrow(/is it an ERC-20 on this chain\?/)
  })

  it('treats a node that cannot serve the block as unavailable too, not as a missing token', async () => {
    // `unavailable` (a replica behind the load balancer: `header not found`) carries the same weight
    // as `transport` — none, about the chain — which is the SDK's own classification, read rather
    // than re-derived here.
    const { client } = fakeClient({ decimals: new Error('header not found'), symbol: 'USDC' })
    await expect(fetchTokenMeta(client, freshChain(), TOKEN)).rejects.toThrow(RpcError)
  })

  it('does not cache a failed fetch — the next caller gets to try again', async () => {
    const chainId = freshChain()
    const failing = fakeClient({ decimals: new Error('execution reverted'), symbol: 'USDC' })
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

// ---------------------------------------------------------------------------
// `resolveToken` — and specifically what a symbol argument costs.
//
// Resolving `usdc` reads the metadata of EVERY core intermediate the manifest
// carries (five on mainnet), because the manifest's own on-chain symbols are
// the only token list this CLI has. That fan-out is the whole risk surface: one
// of those reads failing is a fact about a token the user did not type and the
// command does not need, and it used to end the run all the same.
// ---------------------------------------------------------------------------

const WETH = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2' as Address
const WBTC = '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599' as Address

/** A 429 exactly as a budgeted run (`retryCount: 0`) surfaces it — one lost read, no retry. */
function rateLimited(): Error {
  return Object.assign(new Error('HTTP request failed.\nStatus: 429\nURL: https://rpc.example/key'), { status: 429 })
}

/** A client answering per ADDRESS: `{ symbol, decimals }` to serve it, an `Error` to fail its reads. */
function chainClient(meta: Record<string, { symbol: string; decimals: number } | Error>): PublicClient {
  return {
    readContract: async (args: { address: Address; functionName: string }): Promise<unknown> => {
      const entry = meta[args.address]
      if (entry === undefined || entry instanceof Error) throw entry ?? new Error(`no stub for ${args.address}`)
      return args.functionName === 'decimals' ? entry.decimals : entry.symbol
    },
  } as unknown as PublicClient
}

function manifest(): ChainManifest {
  return { chainId: freshChain(), wrappedNative: WETH, coreIntermediates: [TOKEN, WBTC] }
}

describe('resolveToken', () => {
  it('resolves a symbol against the manifest’s own on-chain names', async () => {
    const client = chainClient({
      [WETH]: { symbol: 'WETH', decimals: 18 },
      [TOKEN]: { symbol: 'USDC', decimals: 6 },
      [WBTC]: { symbol: 'WBTC', decimals: 8 },
    })
    const m = manifest()

    expect(await resolveToken(client, m, 'usdc')).toEqual({ ref: TOKEN, symbol: 'USDC', decimals: 6 })
    expect(await resolveToken(client, m, 'WETH')).toEqual({ ref: WETH, symbol: 'WETH', decimals: 18 }) // case-insensitive
    // The two forms that never fan out at all.
    expect(await resolveToken(client, m, 'eth')).toEqual({ ref: 'native', symbol: 'ETH', decimals: 18 })
    expect(await resolveToken(client, m, WBTC)).toEqual({ ref: WBTC, symbol: 'WBTC', decimals: 8 })
  })

  it('a lost read on a token the user never typed does not kill a resolution that succeeded', async () => {
    // THE BUG THIS EXISTS FOR, in the shape it was reported in: `rl quote eth usdc 1` on a budgeted
    // run died with `rpc unavailable while resolving token 0x2260…C599` — wBTC, whose metadata the
    // command neither asked for nor needed, because `Promise.all` discarded USDC's answer along
    // with it.
    const client = chainClient({
      [WETH]: { symbol: 'WETH', decimals: 18 },
      [TOKEN]: { symbol: 'USDC', decimals: 6 },
      [WBTC]: rateLimited(),
    })

    expect(await resolveToken(client, manifest(), 'usdc')).toEqual({ ref: TOKEN, symbol: 'USDC', decimals: 6 })
  })

  it('with no match and ONE unread candidate, that candidate’s own error is the answer', async () => {
    // Here the failure is load-bearing: the unread token is the only one whose symbol is unknown, so
    // it is exactly the doubt. Its error is rethrown verbatim — including its class, which is what
    // gets the run exit 2 (ask again) rather than exit 3 (fix your arguments).
    const client = chainClient({
      [WETH]: { symbol: 'WETH', decimals: 18 },
      [TOKEN]: { symbol: 'USDC', decimals: 6 },
      [WBTC]: rateLimited(),
    })

    const failure = resolveToken(client, manifest(), 'wbtc')
    await expect(failure).rejects.toThrow(RpcError)
    await expect(failure).rejects.toThrow(/rpc unavailable while resolving token/)
    // And it must not claim the chain does not have the token — nothing here established that.
    await expect(failure).rejects.not.toThrow(/unknown token/)
  })

  it('with no match and SEVERAL unread candidates, it is inconclusive — not a usage error', async () => {
    const client = chainClient({
      [WETH]: { symbol: 'WETH', decimals: 18 },
      [TOKEN]: rateLimited(),
      [WBTC]: rateLimited(),
    })

    const failure = resolveToken(client, manifest(), 'usdc')
    await expect(failure).rejects.toThrow(RpcError)
    await expect(failure).rejects.not.toThrow(UsageError)
    await expect(failure).rejects.toThrow(/2 of this chain's 3 core intermediates did not answer/)
    await expect(failure).rejects.toThrow(/WETH/) // ...and it still says what DID resolve
  })

  it('with every candidate read and none matching, the token really is unknown here', async () => {
    // The only case where "unknown token" is a fact rather than a guess: the chain was read
    // completely. The message names what would have worked, which is the whole point of resolving
    // through the manifest instead of a hardcoded list.
    const client = chainClient({
      [WETH]: { symbol: 'WETH', decimals: 18 },
      [TOKEN]: { symbol: 'USDC', decimals: 6 },
      [WBTC]: { symbol: 'WBTC', decimals: 8 },
    })

    const failure = resolveToken(client, manifest(), 'dai')
    await expect(failure).rejects.toThrow(UsageError)
    await expect(failure).rejects.toThrow(/unknown token 'dai' on this chain/)
    await expect(failure).rejects.toThrow(/eth, WETH, USDC, WBTC/)
  })
})
