/**
 * Shared test doubles for the engine/tick tests. NOT part of the package's public surface: this file
 * lives under `src/internal/` but is excluded from the emitted build (see the build tsconfigs' `exclude`
 * alongside `*.test.ts`), so `dist` never ships it. It IS typechecked (`tsc -p tsconfig.base.json`),
 * which is the point of {@link createFakeClient} typing its return as {@link BlockfeedClient} with no
 * cast — a structural pin that the fake stays assignable to the real engine client contract.
 */
import type { Log } from 'viem'

import type { BlockfeedClient, CallResult } from '../types'

import type { Scheduler } from './scheduler'

export const ok = (result: unknown): CallResult => ({ status: 'success', result })
export const fail = (message: string): CallResult => ({ status: 'failure', error: new Error(message) })

/** Real-macrotask flush so all pending microtasks/promises settle (engine's injected scheduler is fake). */
export const flush = (): Promise<void> => new Promise((r) => globalThis.setTimeout(r, 0))

/** Manual-clock scheduler: `advance(ms)` fires due timers in fire-time order, flushing between each. */
export function createFakeScheduler() {
  let now = 0
  let seq = 0
  const timers = new Map<number, { fireAt: number; cb: () => void }>()
  const scheduler: Scheduler = {
    setTimeout(cb, ms) {
      const id = ++seq
      timers.set(id, { fireAt: now + ms, cb })
      return id
    },
    clearTimeout(handle) {
      if (typeof handle === 'number') timers.delete(handle)
    },
  }
  async function advance(ms: number): Promise<void> {
    now += ms
    for (;;) {
      const due = [...timers.entries()]
        .filter(([, t]) => t.fireAt <= now)
        .sort((a, b) => a[1].fireAt - b[1].fireAt)
      if (due.length === 0) break
      const [id, t] = due[0]!
      timers.delete(id)
      t.cb()
      await flush()
    }
  }
  return {
    scheduler,
    advance,
    pendingDelays: () => [...timers.values()].map((t) => t.fireAt - now).sort((a, b) => a - b),
    timerCount: () => timers.size,
  }
}

export interface FakeBlock {
  number: bigint
  hash: `0x${string}`
  ts: bigint
}

export interface FakeClientOpts {
  ws?: boolean
  /** `client.chain.id`. Default 1. Pass `null` to omit `chain` entirely (no chain-id fallback). */
  chainId?: number | null
  block?: () => FakeBlock
  resolveCall?: (c: { address: string; functionName: string; args: readonly unknown[] }) => CallResult
  logs?: () => Log[]
  failMulticall?: () => boolean
  /**
   * Optional per-invocation gate: `multicall` awaits `gate(idx)` (idx = 0-based invocation index)
   * AFTER capturing the block, letting a test suspend a tick mid-flight (overlap/coalescing tests).
   */
  gate?: (idx: number) => Promise<void>
}

export interface FakeClientState {
  multicallCount: number
  getLogsCount: number
  contractsSeen: Array<Array<{ address: string; functionName: string; args: readonly unknown[] }>>
  getLogsParams: Array<{ fromBlock: bigint; toBlock: bigint }>
  watchCount: number
  unwatchCount: number
  push: undefined | ((b: bigint) => void)
}

/**
 * A structural {@link BlockfeedClient} fake over a synthetic block + resolver. Returned typed as
 * `BlockfeedClient` so every test call site passes `client` to `createBlockFeed` with NO cast — the
 * ONE unavoidable cast (viem's `multicall`/`getLogs`/`watchBlockNumber` are generic/overloaded and a
 * hand fake cannot match them structurally) is centralized here instead of repeated per test. Every
 * multicall captures the block BEFORE any `gate`, so a block change while a tick is suspended is
 * observed by the NEXT tick, not the gated one.
 */
export function createFakeClient(opts: FakeClientOpts = {}): { client: BlockfeedClient; state: FakeClientState } {
  const block = opts.block ?? (() => ({ number: 100n, hash: `0x${'ab'.repeat(32)}`, ts: 1700n }))
  const state: FakeClientState = {
    multicallCount: 0,
    getLogsCount: 0,
    contractsSeen: [],
    getLogsParams: [],
    watchCount: 0,
    unwatchCount: 0,
    push: undefined,
  }
  const client = {
    transport: { type: opts.ws ? 'webSocket' : 'http' },
    ...(opts.chainId === null ? {} : { chain: { id: opts.chainId ?? 1 } }),
    multicall: async ({ contracts }: { contracts: Array<{ address: string; functionName: string; args: readonly unknown[] }> }) => {
      const idx = state.multicallCount
      state.multicallCount += 1
      state.contractsSeen.push(contracts)
      if (opts.failMulticall?.()) throw new Error('rpc down')
      const b = block()
      if (opts.gate) await opts.gate(idx)
      return contracts.map((c) => {
        if (c.functionName === 'getBlockNumber') return ok(b.number)
        if (c.functionName === 'getLastBlockHash') return ok(b.hash)
        if (c.functionName === 'getCurrentBlockTimestamp') return ok(b.ts)
        return opts.resolveCall ? opts.resolveCall(c) : ok(0n)
      })
    },
    getLogs: async (params: { fromBlock: bigint; toBlock: bigint }) => {
      state.getLogsCount += 1
      state.getLogsParams.push(params)
      return opts.logs ? opts.logs() : []
    },
    watchBlockNumber: ({ onBlockNumber }: { onBlockNumber: (b: bigint) => void }) => {
      state.watchCount += 1
      state.push = onBlockNumber
      return () => {
        state.unwatchCount += 1
        state.push = undefined
      }
    },
    getBlockNumber: async () => block().number,
  } as unknown as BlockfeedClient
  return { client, state }
}
