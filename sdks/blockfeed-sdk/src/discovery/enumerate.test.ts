import { Ether, Token } from '@uniswap/sdk-core'
import { describe, expect, it } from 'bun:test'
import type { Log, PublicClient } from 'viem'
import { getAddress } from 'viem'

import { BlockfeedError } from '../errors'

import { enumerateCandidates } from './enumerate'

const ZERO = '0x0000000000000000000000000000000000000000'
const WETH = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2'
const USDC = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48'
const DAI = '0x6B175474E89094C44Da98b954EedeAC495271d0F'
const POOL_A = '0x' + 'a1'.repeat(20)
const POOL_B = '0x' + 'b2'.repeat(20)
const HOOK_BLOCKED = '0x' + '11'.repeat(20)
const HOOK_ALLOWED = '0x' + '22'.repeat(20)

const usdc = new Token(1, USDC, 6, 'USDC')
const dai = new Token(1, DAI, 18, 'DAI')
const weth = new Token(1, WETH, 18, 'WETH')
const ether = Ether.onChain(1)

type RawResult = { status: 'success'; result: unknown } | { status: 'failure'; error: Error }
interface RawContract {
  address: string
  functionName: string
  args: readonly unknown[]
}
const ok = (result: unknown): RawResult => ({ status: 'success', result })
const fail = (message: string): RawResult => ({ status: 'failure', error: new Error(message) })
const eqAddr = (a: string, b: string) => a.toLowerCase() === b.toLowerCase()

interface FakeOpts {
  factory?: (c: RawContract) => RawResult
  liquidity?: (c: RawContract) => RawResult
  logs?: (params: { fromBlock: bigint; toBlock: bigint; args: Record<string, unknown> }) => Log[]
  tip?: bigint
}

/** Build a v4 `Initialize` log (viem returns args already decoded when an `event` is passed). */
function initLog(a: {
  currency0: string
  currency1: string
  fee: number
  tickSpacing: number
  hooks: string
}): Log {
  return { args: { id: `0x${'0'.repeat(64)}`, sqrtPriceX96: 0n, tick: 0, ...a } } as unknown as Log
}

function makeClient(opts: FakeOpts = {}) {
  const getLogsCalls: Array<{ fromBlock: bigint; toBlock: bigint; args: Record<string, unknown> }> = []
  const multicallContracts: RawContract[][] = []
  const client = {
    multicall: async ({ contracts }: { contracts: RawContract[] }): Promise<RawResult[]> => {
      multicallContracts.push(contracts)
      return contracts.map((c) => {
        if (c.functionName === 'getPair' || c.functionName === 'getPool') {
          return (opts.factory ?? (() => ok(ZERO)))(c)
        }
        return (opts.liquidity ?? (() => ok(0n)))(c)
      })
    },
    getLogs: async (params: { fromBlock: bigint; toBlock: bigint; args: Record<string, unknown> }): Promise<Log[]> => {
      getLogsCalls.push(params)
      return (opts.logs ?? (() => []))(params)
    },
    getBlockNumber: async (): Promise<bigint> => opts.tip ?? 100n,
  }
  return { client: client as unknown as PublicClient, getLogsCalls, multicallContracts }
}

describe('enumerateCandidates', () => {
  it('fans out v3 across fee tiers, skips the zero v2 pair, and backfills liquidity (failed read → undefined)', async () => {
    const { client, multicallContracts } = makeClient({
      factory: (c) => {
        if (c.functionName === 'getPair') return ok(ZERO) // v2 zero-pair → skipped
        const fee = c.args[2] as number
        if (fee === 100) return ok(POOL_A)
        if (fee === 3000) return ok(POOL_B)
        return ok(ZERO)
      },
      liquidity: (c) => {
        if (eqAddr(c.address, POOL_A)) return ok(111n)
        if (eqAddr(c.address, POOL_B)) return fail('revert') // failed read → kept, undefined
        return ok(0n)
      },
      tip: 100n,
    })

    const out = await enumerateCandidates(client, 1, usdc, dai, { fromBlockOverride: 0n })

    // All four v3 fee tiers were queried on the factory (plus the v2 getPair).
    const round1 = multicallContracts[0]!
    expect(round1.filter((c) => c.functionName === 'getPool').map((c) => c.args[2])).toEqual([100, 500, 3000, 10000])
    expect(round1.some((c) => c.functionName === 'getPair')).toBe(true)

    // Only the two non-zero v3 pools become candidates; no v2 candidate.
    expect(out.every((c) => c.ref.protocol === 'v3')).toBe(true)
    expect(out.length).toBe(2)
    const byPool = Object.fromEntries(out.map((c) => [(c.ref as { pool: string }).pool.toLowerCase(), c]))
    expect(byPool[POOL_A.toLowerCase()]!.inRangeLiquidity).toBe(111n)
    expect(byPool[POOL_B.toLowerCase()]!.inRangeLiquidity).toBeUndefined()
    // Candidates carry the caller's own currencies.
    expect(out[0]!.currencyA).toBe(usdc)
    expect(out[0]!.currencyB).toBe(dai)
  })

  it('turns v4 Initialize logs into candidates (incl. nonstandard fee 2500), filtering hooks by allowlist', async () => {
    const { client } = makeClient({
      logs: () => [
        initLog({ currency0: DAI, currency1: USDC, fee: 2500, tickSpacing: 50, hooks: ZERO }), // kept (hookless)
        initLog({ currency0: DAI, currency1: USDC, fee: 3000, tickSpacing: 60, hooks: HOOK_BLOCKED }), // dropped
        initLog({ currency0: DAI, currency1: USDC, fee: 500, tickSpacing: 10, hooks: HOOK_ALLOWED }), // kept (allowlisted)
      ],
      liquidity: () => ok(999n),
      tip: 100n,
    })

    const out = await enumerateCandidates(client, 1, usdc, dai, {
      hookAllowlist: [HOOK_ALLOWED as `0x${string}`],
      fromBlockOverride: 0n,
    })

    expect(out.every((c) => c.ref.protocol === 'v4')).toBe(true)
    const fees = out.map((c) => (c.ref as { poolKey: { fee: number } }).poolKey.fee).sort((a, b) => a - b)
    expect(fees).toEqual([500, 2500])
    expect(out.every((c) => c.inRangeLiquidity === 999n)).toBe(true)
    // The dropped hooked pool's hook is nowhere in the output.
    expect(out.some((c) => eqAddr((c.ref as { poolKey: { hooks: string } }).poolKey.hooks, HOOK_BLOCKED))).toBe(false)
    // The allowlisted hook survives with checksummed address.
    const allowed = out.find((c) => (c.ref as { poolKey: { fee: number } }).poolKey.fee === 500)!
    expect((allowed.ref as { poolKey: { hooks: string } }).poolKey.hooks).toBe(getAddress(HOOK_ALLOWED))
  })

  it('issues the native (0x0) variant query when a side is WETH, deduping shared pools by poolId', async () => {
    const nativePoolLog = initLog({ currency0: ZERO, currency1: USDC, fee: 500, tickSpacing: 10, hooks: ZERO })
    const { client, getLogsCalls } = makeClient({
      logs: () => [nativePoolLog], // both queries return the same pool
      liquidity: () => ok(5n),
      tip: 100n,
    })

    const out = await enumerateCandidates(client, 1, weth, usdc, { fromBlockOverride: 0n })

    // Two queries: (WETH, USDC) and the native-substituted (0x0, USDC), each sorted currency0<currency1.
    expect(getLogsCalls.length).toBe(2)
    const queried = getLogsCalls.map((q) => `${(q.args.currency0 as string).toLowerCase()}/${(q.args.currency1 as string).toLowerCase()}`)
    expect(queried).toContain(`${USDC.toLowerCase()}/${WETH.toLowerCase()}`) // USDC < WETH
    expect(queried).toContain(`${ZERO.toLowerCase()}/${USDC.toLowerCase()}`) // 0x0 sorts first
    // Same pool returned by both queries → deduped to one candidate.
    expect(out.length).toBe(1)
    expect(out[0]!.ref.protocol).toBe('v4')
  })

  it('also issues the native variant when a side is native ETH', async () => {
    const { client, getLogsCalls } = makeClient({ tip: 100n })
    await enumerateCandidates(client, 1, ether, usdc, { fromBlockOverride: 0n })
    expect(getLogsCalls.length).toBe(2)
    const queried = getLogsCalls.map((q) => `${(q.args.currency0 as string).toLowerCase()}/${(q.args.currency1 as string).toLowerCase()}`)
    expect(queried).toContain(`${ZERO.toLowerCase()}/${USDC.toLowerCase()}`)
    expect(queried).toContain(`${USDC.toLowerCase()}/${WETH.toLowerCase()}`)
  })

  it('bisects the block range and concatenates when the provider errors on a wide window', async () => {
    let returned = false
    const { client, getLogsCalls } = makeClient({
      logs: ({ fromBlock, toBlock }) => {
        if (toBlock - fromBlock > 10n) throw new Error('query returned more than 10000 results / range too wide')
        if (!returned) {
          returned = true
          return [initLog({ currency0: DAI, currency1: USDC, fee: 3000, tickSpacing: 60, hooks: ZERO })]
        }
        return []
      },
      liquidity: () => ok(1n),
      tip: 100n,
    })

    const out = await enumerateCandidates(client, 1, usdc, dai, { fromBlockOverride: 0n })

    expect(getLogsCalls.length).toBeGreaterThan(1) // bisection happened
    expect(out.length).toBe(1)
    expect(out[0]!.ref.protocol).toBe('v4')
  })

  it('rethrows a BlockfeedError when the provider keeps erroring past the bisection depth', async () => {
    const { client } = makeClient({
      logs: () => {
        throw new Error('persistent provider failure')
      },
      tip: 100n,
    })

    await expect(enumerateCandidates(client, 1, usdc, dai, { fromBlockOverride: 0n })).rejects.toBeInstanceOf(
      BlockfeedError
    )
  })
})
