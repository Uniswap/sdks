import { Token } from '@uniswap/sdk-core'
import { describe, expect, it } from 'bun:test'
import { parseAbiItem } from 'viem'

import type {
  CallResult,
  ContractCall,
  DecodedFeedLog,
  FeedEvent,
  FeedSnapshot,
  LogFilter,
  PoolRef,
  PricePath,
  Source,
  SourceEmission,
  TickData,
  TickIdentity,
} from './types'

const IDENTITY: TickIdentity = {
  chainId: 1,
  blockNumber: 100n,
  parentBlockHash: '0xabc',
  timestamp: 1700000000n,
}

// A concrete Source implementation exercises calls/derive/valueEquals signatures at compile time.
const counterSource: Source<number> = {
  key: 'counter',
  calls: () => {
    const call: ContractCall = {
      address: '0x000000000004444c5dc75cB358380D2e3dE08A90',
      abi: [],
      functionName: 'foo',
      args: [],
      allowFailure: true,
    }
    return { foo: call }
  },
  logFilters: () => {
    const filter: LogFilter = {
      address: '0x000000000004444c5dc75cB358380D2e3dE08A90',
      event: parseAbiItem('event Transfer(address indexed from, address indexed to, uint256 value)') as never,
    }
    return [filter]
  },
  derive: (tick: TickData): SourceEmission<number> | undefined => {
    const r: CallResult | undefined = tick.results['foo']
    if (!r || r.status !== 'success') return undefined
    return { value: Number(r.result), identity: tick.identity }
  },
  valueEquals: (a, b) => a === b,
}

describe('core types', () => {
  it('a Source can be evaluated over a TickData', () => {
    const log: DecodedFeedLog = {
      txHash: '0xdead',
      logIndex: 0,
      blockNumber: 100n,
      address: '0x000000000004444c5dc75cB358380D2e3dE08A90',
      eventName: 'Transfer',
      args: {},
    }
    const tick: TickData = {
      identity: IDENTITY,
      results: { foo: { status: 'success', result: 42 } },
      logs: [log],
      retractions: [
        { txHash: '0xbeef', logIndex: 1, blockNumber: 99n, address: '0x0', eventName: 'Transfer', args: {} },
      ],
    }
    const emission = counterSource.derive(tick, undefined)
    expect(emission?.value).toBe(42)
    expect(counterSource.valueEquals?.(1, 1)).toBe(true)
  })

  it('FeedEvent is a discriminated union covering every variant', () => {
    const events: FeedEvent<number>[] = [
      { type: 'tick', emission: { value: 1, identity: IDENTITY } },
      { type: 'log', log: { txHash: '0x1', logIndex: 0, blockNumber: 1n, address: '0x0', eventName: 'E', args: {} } },
      { type: 'retraction', log: { txHash: '0x1', logIndex: 0, blockNumber: 1n, address: '0x0', eventName: 'E', args: {} } },
      { type: 'gap', fromBlock: 1n, toBlock: 2n },
      { type: 'stale', stale: true },
      { type: 'error', scope: 'tick', error: new Error('boom'), identity: IDENTITY },
    ]
    // Compile-time exhaustiveness: the switch must handle every FeedEvent variant. Adding a variant to
    // the union without a case here makes the `never` default fail to type-check — so this test's
    // "every variant" claim can never silently go stale.
    const kindOf = (e: FeedEvent<number>): FeedEvent<number>['type'] => {
      switch (e.type) {
        case 'tick':
        case 'log':
        case 'retraction':
        case 'gap':
        case 'stale':
        case 'error':
          return e.type
        default: {
          const _exhaustive: never = e
          return _exhaustive
        }
      }
    }
    expect(events.map(kindOf)).toEqual(['tick', 'log', 'retraction', 'gap', 'stale', 'error'])
  })

  it('FeedSnapshot and PoolRef/PricePath compose with sdk-core Currency', () => {
    const snapshot: FeedSnapshot<number> = {
      current: { value: 1, identity: IDENTITY },
      buffer: [{ value: 1, identity: IDENTITY }],
      logs: [],
      stale: false,
      lastTick: IDENTITY,
      lastError: undefined,
    }
    expect(snapshot.buffer.length).toBe(1)

    const usdc = new Token(1, '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', 6, 'USDC')
    const weth = new Token(1, '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', 18, 'WETH')
    const pool: PoolRef = { protocol: 'v3', pool: '0x0' }
    const path: PricePath = {
      base: weth,
      quote: usdc,
      legs: [{ pool, base: weth, quote: usdc }],
    }
    expect(path.legs[0]!.pool.protocol).toBe('v3')
  })
})
