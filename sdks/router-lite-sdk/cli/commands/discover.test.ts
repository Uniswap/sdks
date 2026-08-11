import { afterEach, beforeAll, describe, expect, it } from 'bun:test'
import { encodeAbiParameters, encodeEventTopics } from 'viem'
import type { Address, Hex, PublicClient } from 'viem'

import { sortAddresses, v2PoolRef, v3PoolRef } from '../../src/experimental/index'
import { manifestFor } from '../../src/index'
import type { PoolRecord } from '../../src/index'
// deep import, deliberately unblessed: the `PairCreated` event ABI this test uses to BUILD a
// factory log the SDK will parse back. Same posture as `context.ts`'s `DEFAULT_CONCURRENCY` import —
// a private internal with no consumer-facing story, imported by path so the log this fixture emits
// and the log `v2Module.parsePoolLog` decodes can never disagree.
import { V2_FACTORY_ABI } from '../../src/internal/abis'
import { setColorEnabled } from '../ansi'
import { UsageError } from '../args'
import type { RenderCtx } from '../report'
import type { ResolvedToken } from '../tokens'

import { cmdDiscover, renderRecord, resolveCounterparty } from './discover'

// ---------------------------------------------------------------------------
// `discover`'s counterparty column, which is the whole point of every row: for
// a pool the SDK sees, WHICH OTHER currency does it hold?
//
// The answer is a currency-FAMILY question, not an identity one, and getting
// that wrong is invisible on most rows and wrong on half of them: native and
// wrapped-native are one graph node to the SDK, so a `discover eth` run finds
// WETH pools, and an identity test ("which side isn't `native`?") answers with
// whichever side the pool happened to sort first — naming WETH, the queried
// token itself, as its own counterparty.
// ---------------------------------------------------------------------------

beforeAll(() => setColorEnabled(false))

const WETH: Address = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2'
const USDT: Address = '0xdAC17F958D2ee523a2206206994597C13D831ec7'
const USDC: Address = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48'
const POOL: Address = '0x0d4a11d5EEaaC28EC3F61d100daF4d40471f1852'

const NATIVE_QUERY: ResolvedToken = { ref: 'native', symbol: 'ETH', decimals: 18 }

const CTX: RenderCtx = {
  views: new Map([
    ['native', { symbol: 'ETH', decimals: 18 }],
    [WETH.toLowerCase(), { symbol: 'WETH', decimals: 18 }],
    [USDT.toLowerCase(), { symbol: 'USDT', decimals: 6 }],
    [USDC.toLowerCase(), { symbol: 'USDC', decimals: 6 }],
  ]),
}

function record(pool: PoolRecord['pool']): PoolRecord {
  return { pool, source: 'event', createdAtBlock: 10_008_355n }
}

describe('discover’s counterparty column', () => {
  it('names the real counterpart of a WETH pool under a native query — never WETH itself', () => {
    // WETH (0xC02a…) sorts BEFORE USDT (0xdAC1…), so an identity test picks WETH here. That is the
    // bug: the row would read `↔ WETH` for a run whose whole subject is the native family.
    const row = renderRecord(record(v2PoolRef(POOL, WETH, USDT)), NATIVE_QUERY, CTX, WETH)
    expect(row).toContain('↔ USDT')
    expect(row).not.toContain('↔ WETH')
  })

  it('is order-independent — a counterpart that sorts first reads the same way', () => {
    // USDC (0xA0b8…) sorts BEFORE WETH, which is the arrangement the identity test got right by luck.
    const row = renderRecord(record(v3PoolRef(POOL, USDC, WETH, 500)), NATIVE_QUERY, CTX, WETH)
    expect(row).toContain('↔ USDC')
  })

  it('names the counterpart of an ordinary ERC-20 query too', () => {
    const usdt: ResolvedToken = { ref: USDT, symbol: 'USDT', decimals: 6 }
    const row = renderRecord(record(v2PoolRef(POOL, WETH, USDT)), usdt, CTX, WETH)
    expect(row).toContain('↔ WETH')
  })

  it('carries the pool’s provenance and quote history alongside the counterpart', () => {
    const rec: PoolRecord = { ...record(v2PoolRef(POOL, WETH, USDT)), source: 'hint', quoteFailureBlocks: 1, lastQuoteFailureBlock: 21_000_000n }
    const row = renderRecord(rec, NATIVE_QUERY, CTX, WETH)
    expect(row).toContain('hint')
    expect(row).toContain('1 failed block(s)')
  })
})

// ---------------------------------------------------------------------------
// `--via`, and the default when there is none.
//
// Three arms, and only one of them is on the command's happy path. The other
// two decide whether `discover` can ask a coherent question at all: routing a
// token against its own currency family produces a search with nothing to find,
// and the native query's default has to WALK the core intermediates rather than
// take the first one, because on every built-in chain that first one is the
// wrapped native — the same family the query already is.
// ---------------------------------------------------------------------------

const MAINNET_CHAIN = { chainId: 1, label: 'Ethereum', manifest: manifestFor(1), swaps: true }

/** A client that answers only ERC-20 metadata, from a table — `fetchTokenMeta`'s two `readContract`
 * reads and nothing else, so any other RPC this path tried would fail loudly. */
function metaClient(table: Record<string, { symbol: string; decimals: number }>): PublicClient {
  return {
    async readContract({ address, functionName }: { address: Address; functionName: string }) {
      const meta = table[address.toLowerCase()]
      if (!meta) throw new Error(`metaClient: no metadata scripted for ${address}`)
      return functionName === 'decimals' ? meta.decimals : meta.symbol
    },
  } as unknown as PublicClient
}

describe('resolveCounterparty', () => {
  const ctxWith = (client: PublicClient) => ({ chain: MAINNET_CHAIN, client })

  it('rejects a --via in the token’s own currency family, native/wrapped included', async () => {
    // The trap the SDK's `sameFamily` exists for: WETH is not `native`, but it IS the same graph
    // node, so `discover eth --via <WETH>` would search for a route from a node to itself.
    const ctx = ctxWith(metaClient({ [WETH.toLowerCase()]: { symbol: 'WETH', decimals: 18 } }))
    await expect(resolveCounterparty(ctx, NATIVE_QUERY, WETH)).rejects.toThrow(UsageError)
    await expect(resolveCounterparty(ctx, NATIVE_QUERY, WETH)).rejects.toThrow(/same currency family/)

    // The literal spelling is caught too, without any metadata read at all.
    const bare = ctxWith(metaClient({}))
    await expect(resolveCounterparty(bare, NATIVE_QUERY, 'eth')).rejects.toThrow(/same currency family/)

    // ...and the mirror: an ERC-20 query may not be routed against itself either.
    const usdt: ResolvedToken = { ref: USDT, symbol: 'USDT', decimals: 6 }
    const usdtCtx = ctxWith(metaClient({ [USDT.toLowerCase()]: { symbol: 'USDT', decimals: 6 } }))
    await expect(resolveCounterparty(usdtCtx, usdt, USDT)).rejects.toThrow(/same currency family/)
  })

  it('defaults an ERC-20 query to native, with no metadata read at all', async () => {
    const usdt: ResolvedToken = { ref: USDT, symbol: 'USDT', decimals: 6 }
    // `metaClient({})` throws for every address: reaching the chain here would fail this test.
    const via = await resolveCounterparty(ctxWith(metaClient({})), usdt, undefined)
    expect(via).toEqual({ ref: 'native', symbol: 'ETH', decimals: 18 })
  })

  it('a NATIVE query walks past the wrapped native to the first core intermediate outside the family', async () => {
    // Mainnet's `coreIntermediates` lead with WETH; taking `[0]` would hand the native query its own
    // family back and produce the degenerate search the arm above rejects when a user asks for it.
    const ctx = ctxWith(metaClient({ [USDC.toLowerCase()]: { symbol: 'USDC', decimals: 6 } }))
    expect(MAINNET_CHAIN.manifest.coreIntermediates![0]!.toLowerCase()).toBe(WETH.toLowerCase())
    const via = await resolveCounterparty(ctx, NATIVE_QUERY, undefined)
    expect(via).toEqual({ ref: USDC, symbol: 'USDC', decimals: 6 })
  })

  it('a native query on a chain whose only core intermediate IS the native family asks for --via', async () => {
    const wrappedOnly = {
      ...MAINNET_CHAIN,
      manifest: { ...MAINNET_CHAIN.manifest, coreIntermediates: [WETH] },
    }
    await expect(resolveCounterparty({ chain: wrappedOnly, client: metaClient({}) }, NATIVE_QUERY, undefined)).rejects.toThrow(
      /pass --via/,
    )
  })
})

// ---------------------------------------------------------------------------
// The whole command, once, end to end over a stubbed wire.
//
// `cmdDiscover` is 90 lines of orchestration — flags, chain setup, token
// resolution, a full bounded search consumed to `final`, then the index read
// back and shaped — and none of it had ever run in a test. (The counterparty
// bug at the top of this file reached a release through exactly that gap: every
// PIECE was fine.) This runs the real `buildChainContext`, the real router over
// this working tree's source, and the real JSON writer, against a scripted
// JSON-RPC endpoint, and pins the two claims the command exists to make: the
// pool the search discovers is in the index it reads back, and it is reported
// against the counterparty the run actually used.
// ---------------------------------------------------------------------------

const RPC = 'https://rpc.example.invalid/'
const TOKEN: Address = '0x1111111111111111111111111111111111111111'
const PAIR: Address = '0x2222222222222222222222222222222222222222'
const HEAD = 10_001_000n // just above mainnet's v2 deployment (10,000,835): a tiny scan window
const PAIR_BLOCK = 10_000_900n

const MAINNET = manifestFor(1)

/** The fake Universal Router bytecode `validateManifest`'s immutable fingerprint reads: this
 * manifest's own addresses, concatenated. Nothing here asserts anything about real UR code — only
 * that the check runs against a deployment configured for THIS chain. */
const UR_CODE = `0x${[MAINNET.wrappedNative, MAINNET.execution!.permit2, MAINNET.v2!.factory, MAINNET.v3!.factory, MAINNET.v4!.poolManager]
  .map((a) => a.slice(2).toLowerCase())
  .join('')}`

const PAIR_CREATED_LOG = {
  address: MAINNET.v2!.factory,
  topics: encodeEventTopics({
    abi: V2_FACTORY_ABI,
    eventName: 'PairCreated',
    args: { token0: sortAddresses(TOKEN, MAINNET.wrappedNative)[0], token1: sortAddresses(TOKEN, MAINNET.wrappedNative)[1] },
  }),
  data: encodeAbiParameters([{ type: 'address' }, { type: 'uint256' }], [PAIR, 1n]),
  blockNumber: `0x${PAIR_BLOCK.toString(16)}`,
  blockHash: `0x${'ab'.repeat(32)}`,
  transactionHash: `0x${'cd'.repeat(32)}`,
  logIndex: '0x0',
  transactionIndex: '0x0',
  removed: false,
}

/** One JSON-RPC answer, or an `Error` to return as a JSON-RPC error object (a revert, for the
 * quote calls nothing here scripts a pool for). */
function answerFor(method: string, params: any[]): unknown {
  if (method === 'eth_chainId') return '0x1'
  if (method === 'eth_getBlockByNumber') {
    return { number: `0x${HEAD.toString(16)}`, hash: `0x${'ab'.repeat(32)}`, timestamp: '0x5f5e100' }
  }
  if (method === 'eth_getCode') {
    return String(params[0]).toLowerCase() === MAINNET.execution!.address.toLowerCase() ? UR_CODE : '0x'
  }
  if (method === 'eth_getLogs') {
    const { fromBlock, toBlock } = params[0] as { fromBlock: Hex; toBlock: Hex }
    return BigInt(fromBlock) <= PAIR_BLOCK && PAIR_BLOCK <= BigInt(toBlock) ? [PAIR_CREATED_LOG] : []
  }
  if (method === 'eth_call') {
    const { to, data } = params[0] as { to: Address; data: Hex }
    if (to.toLowerCase() === TOKEN.toLowerCase()) {
      if (data.startsWith('0x313ce567')) return encodeAbiParameters([{ type: 'uint8' }], [18]) // decimals()
      if (data.startsWith('0x95d89b41')) return encodeAbiParameters([{ type: 'string' }], ['TKN']) // symbol()
    }
    // Every quote: the "no pool there" convention. The command's subject is the INDEX, not a price.
    return new Error('execution reverted')
  }
  return new Error(`unscripted method ${method}`)
}

describe('cmdDiscover, end to end', () => {
  const realFetch = globalThis.fetch
  const realLog = console.log
  afterEach(() => {
    globalThis.fetch = realFetch
    console.log = realLog
  })

  it('runs a bounded search and reports the pool it discovered, against the counterparty it used', async () => {
    globalThis.fetch = (async (_input: any, init: any) => {
      const body = JSON.parse(String(init?.body ?? 'null'))
      const reply = (one: any): unknown => {
        const answer = answerFor(one.method, one.params ?? [])
        return answer instanceof Error
          ? { jsonrpc: '2.0', id: one.id, error: { code: 3, message: answer.message } }
          : { jsonrpc: '2.0', id: one.id, result: answer }
      }
      const payload = Array.isArray(body) ? body.map(reply) : reply(body)
      return new Response(JSON.stringify(payload), { status: 200, headers: { 'content-type': 'application/json' } })
    }) as typeof fetch

    const out: string[] = []
    console.log = (...parts: unknown[]) => out.push(parts.map(String).join(' '))

    // `--via eth` pins the counterparty without a second metadata read; `--no-cache` keeps the run
    // off the developer's `~/.cache` (see `cache.test.ts`, which owns that surface).
    const code = await cmdDiscover([TOKEN, '--rpc', RPC, '--via', 'eth', '--json', '--no-cache'])

    expect(code).toBe(0)
    expect(out).toHaveLength(1)
    const report = JSON.parse(out[0]!)
    expect(report.token).toEqual({ ref: TOKEN, symbol: 'TKN' })
    expect(report.counterparty).toEqual({ ref: 'native', symbol: 'ETH' })
    // THE CLAIM: the pool existed nowhere but in a `PairCreated` log the search's own scan fetched,
    // and it comes back out of the index the command reads.
    expect(report.pools).toHaveLength(1)
    expect(report.pools[0].pool.protocol).toBe('v2')
    expect(report.pools[0].pool.address.toLowerCase()).toBe(PAIR.toLowerCase())
    expect(report.pools[0].source).toBe('event')
    expect(report.pools[0].discredited).toBe(false)
    expect(report.stats.pools).toBe(1)
    // The search really ran to completion against the pinned head, and its report rides out.
    expect(report.search.block.number).toBe(HEAD.toString())
    expect(report.search.quoting.attempted).toBeGreaterThan(0)
  })
})
