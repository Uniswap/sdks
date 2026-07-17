import { Token } from '@uniswap/sdk-core'
import { discoverPricePath } from '@uniswap/blockfeed-sdk/discovery'
import type { PoolRef, PricePath } from '@uniswap/blockfeed-sdk'
// enumerateCandidates is module-internal (not part of the public discovery surface); import from source.
import { enumerateCandidates } from '../src/discovery/enumerate'
import { ERC20_ABI, NPM_ABI, POOL_MANAGER_ABI, SWAP_ROUTER_ABI, V3_FACTORY_ABI, V3_POOL_ABI } from './abis'
import { describe, expect, it } from 'bun:test'
import {
  type Account,
  type Address,
  createPublicClient,
  createWalletClient,
  encodeAbiParameters,
  getAddress,
  http,
  type PublicClient,
  type Transport,
  type WalletClient,
} from 'viem'
import { base } from 'viem/chains'

import { type AnvilFork, forkTestsEnabled, FORK_RPC_BASE, startAnvilFork } from './anvil'
import { TEST_ERC20_CREATION_BYTECODE } from './testErc20.bytecode'

/** Concrete Base-chain client type — lets an OP-stack client flow into the SDK without an `as` cast. */
type ForkPublicClient = PublicClient<Transport, typeof base>

const RUN = forkTestsEnabled()

/** Pinned Base block — same fixture as the engine fork suite (see engine.fork.test.ts for provenance). */
const FORK_BLOCK = 48_730_000n
const CHAIN_ID = 8453

const WETH_ADDR = getAddress('0x4200000000000000000000000000000000000006')
const USDC_ADDR = getAddress('0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913')
// BRETT: a Base mid-cap that trades almost entirely against WETH on Uniswap. At the pinned block its
// BRETT/USDC v3 pools are empty or thin while its BRETT/WETH fee-10000 pool is deep (L≈6.7e22),
// verified via v3-factory getPool + pool.liquidity() at FORK_BLOCK — so the best path is 2-hop via
// WETH. (Aerodrome-native tokens like AERO were rejected: no Uniswap liquidity → NoPathFound.)
const BRETT_ADDR = getAddress('0x532f27101965dd16442E59d40670FaF5eBB142E4')

const V3_FACTORY = getAddress('0x33128a8fC17869897dcE68Ed026d694621f6FDfD')
const POOL_MANAGER = getAddress('0x498581fF718922c3f8e6A244956aF099B2652b2b') // v4 PoolManager (Base)
const NPM = getAddress('0x03a520b32C04BF3bEEf7BEb72E919cf822Ed34f1') // v3 NonfungiblePositionManager (Base)
const SWAP_ROUTER_02 = getAddress('0x2626664c2603336E57B271c5C0b26F421741e481')

/** USDC whale (EOA), same as the engine suite: ~526,886 USDC at FORK_BLOCK. */
const USDC_WHALE = getAddress('0x20FE51A9229EEf2cF8Ad9E89d91CAb9312cF3b7A')

/**
 * Known-deep WETH/USDC pools on Base at the pinned block (lowercased), cross-checked via
 * `pool.liquidity()`: the 0.05% pool (L≈1.05e18) and the 0.3% pool (L≈3.02e19). Scenario 1's direct
 * winner and scenario 2/4's WETH→USDC leg must be one of these.
 */
const DEEP_WETH_USDC = new Set([
  '0xd0b53d9277642d899df5c87a3966a349a798f224', // v3 0.05%
  '0x6c561b446416e1a00e8e93e221854d6ea4171372', // v3 0.30%
])

const WETH = new Token(CHAIN_ID, WETH_ADDR, 18, 'WETH', 'Wrapped Ether')
const USDC = new Token(CHAIN_ID, USDC_ADDR, 6, 'USDC', 'USD Coin')
const BRETT = new Token(CHAIN_ID, BRETT_ADDR, 18, 'BRETT', 'Brett')

// Skipping the v4 Initialize scan from the PoolManager deploy block (~25.3M) to tip would force anvil
// into a ~23M-block upstream getLogs. Every discovery call caps the scan to fork-local blocks.
const LOCAL_V4_SCAN = { fromBlockOverride: FORK_BLOCK + 1n }


const liveForks = new Set<AnvilFork>()

async function newFork(port: number): Promise<AnvilFork> {
  const fork = await startAnvilFork({ forkUrl: FORK_RPC_BASE, forkBlock: FORK_BLOCK, port })
  liveForks.add(fork)
  return fork
}
async function teardown(fork: AnvilFork): Promise<void> {
  await fork.stop()
  liveForks.delete(fork)
}
const mine = (fork: AnvilFork, n = 1): Promise<unknown> => fork.rpc('anvil_mine', [`0x${n.toString(16)}`])

/** Impersonate the whale, fund with gas/wrap ETH (100 ETH), and switch anvil to manual mining. */
async function prepareWhale(fork: AnvilFork): Promise<void> {
  await fork.rpc('anvil_impersonateAccount', [USDC_WHALE])
  await fork.rpc('anvil_setBalance', [USDC_WHALE, '0x56BC75E2D63100000']) // 100 ETH
  await fork.rpc('evm_setAutomine', [false])
}

const httpClient = (fork: AnvilFork): ForkPublicClient =>
  createPublicClient({ chain: base, transport: http(fork.rpcUrl) })
const whaleWallet = (fork: AnvilFork): WalletClient =>
  createWalletClient({ account: USDC_WHALE, chain: base, transport: http(fork.rpcUrl) })

/** viem `writeContract` from the impersonated whale (manual-mine; caller mines). Loosely typed: the
 * per-call ABIs vary and viem's overloads don't survive a generic spread — the on-chain calls are the
 * real check. */
function write(wallet: WalletClient, params: Record<string, unknown>): Promise<`0x${string}`> {
  const call = wallet.writeContract as unknown as (a: Record<string, unknown>) => Promise<`0x${string}`>
  return call({ account: wallet.account, chain: base, ...params })
}

function isPricePath(r: PricePath | { kind: 'no-path' }): r is PricePath {
  return !('kind' in r)
}
const poolAddress = (ref: PoolRef): string | undefined =>
  ref.protocol === 'v3' ? ref.pool.toLowerCase() : ref.protocol === 'v2' ? ref.pair.toLowerCase() : undefined

describe.skipIf(!RUN)('discovery fork scenarios (Base)', () => {
  it(
    'scenario 1: known-token selection — WETH/USDC resolves to a single direct leg on a known deep pool',
    async () => {
      const fork = await newFork(8651)
      try {
        const pub = httpClient(fork)
        const result = await discoverPricePath(pub, { base: WETH, quote: USDC, options: LOCAL_V4_SCAN })
        expect(isPricePath(result)).toBe(true)
        if (!isPricePath(result)) throw new Error('unreachable')

        expect(result.legs.length).toBe(1)
        const leg = result.legs[0]
        expect(leg.pool.protocol).toBe('v3')
        expect(DEEP_WETH_USDC.has(poolAddress(leg.pool)!)).toBe(true)
      } finally {
        await teardown(fork)
      }
    },
    120_000
  )

  it(
    'scenario 2: 2-hop — BRETT/USDC resolves to two legs through WETH',
    async () => {
      const fork = await newFork(8652)
      try {
        const pub = httpClient(fork)
        const result = await discoverPricePath(pub, { base: BRETT, quote: USDC, options: LOCAL_V4_SCAN })
        expect(isPricePath(result)).toBe(true)
        if (!isPricePath(result)) throw new Error('unreachable')

        expect(result.legs.length).toBe(2)
        // Leg 0: BRETT -> WETH; Leg 1: WETH -> USDC on a known deep pool.
        expect(result.legs[0].base.wrapped.address).toBe(BRETT_ADDR)
        expect(result.legs[0].quote.wrapped.address).toBe(WETH_ADDR)
        expect(result.legs[1].base.wrapped.address).toBe(WETH_ADDR)
        expect(result.legs[1].quote.wrapped.address).toBe(USDC_ADDR)
        expect(DEEP_WETH_USDC.has(poolAddress(result.legs[1].pool)!)).toBe(true)
      } finally {
        await teardown(fork)
      }
    },
    240_000
  )

  it(
    'scenario 3: v4 nonstandard-fee enumeration — a freshly-initialized fee-2500 pool is found via the Initialize log scan',
    async () => {
      const fork = await newFork(8653)
      try {
        await prepareWhale(fork)
        const pub = httpClient(fork)
        const wallet = whaleWallet(fork)

        // Deploy a fresh ERC20 (constructor: total supply).
        const deployData = (TEST_ERC20_CREATION_BYTECODE +
          encodeAbiParameters([{ type: 'uint256' }], [10n ** 24n]).slice(2)) as `0x${string}`
        const deployHash = await wallet.sendTransaction({
          account: wallet.account as Account,
          chain: base,
          data: deployData,
          gas: 1_500_000n,
        })
        await mine(fork)
        const deployReceipt = await pub.getTransactionReceipt({ hash: deployHash })
        expect(deployReceipt.status).toBe('success')
        const token = getAddress(deployReceipt.contractAddress as Address)
        const deployBlock = deployReceipt.blockNumber

        // Permissionless v4 initialize: fee 2500 / tickSpacing 50 / hookless, price 1 (sqrtP = 2^96).
        const [currency0, currency1] =
          BigInt(token) < BigInt(WETH_ADDR) ? [token, WETH_ADDR] : [WETH_ADDR, token]
        const initHash = await write(wallet, {
          address: POOL_MANAGER,
          abi: POOL_MANAGER_ABI,
          functionName: 'initialize',
          args: [{ currency0, currency1, fee: 2500, tickSpacing: 50, hooks: '0x0000000000000000000000000000000000000000' }, 79228162514264337593543950336n],
          gas: 1_000_000n,
        })
        await mine(fork)
        expect((await pub.getTransactionReceipt({ hash: initHash })).status).toBe('success')

        // The Initialize log scan (bounded to fork-local blocks) must surface exactly this pool.
        const tokenCurrency = new Token(CHAIN_ID, token, 18, 'TT', 'TestToken')
        const candidates = await enumerateCandidates(pub, CHAIN_ID, tokenCurrency, WETH, {
          fromBlockOverride: deployBlock,
        })
        const v4 = candidates.filter((c) => c.ref.protocol === 'v4')
        expect(v4.length).toBe(1)
        const ref = v4[0].ref
        if (ref.protocol !== 'v4') throw new Error('unreachable')
        expect(ref.poolKey.fee).toBe(2500)
        expect(ref.poolKey.tickSpacing).toBe(50)
        expect(ref.poolKey.hooks.toLowerCase()).toBe('0x0000000000000000000000000000000000000000')
      } finally {
        await teardown(fork)
      }
    },
    120_000
  )

  it(
    'scenario 4: adversarial trap — a fantasy-priced thin direct pool does not divert discovery from the honest 2-hop',
    async () => {
      const fork = await newFork(8654)
      try {
        await prepareWhale(fork)
        const pub = httpClient(fork)
        const wallet = whaleWallet(fork)

        // Acquire a little BRETT (wrap ETH, swap WETH->BRETT on the deep fee-10000 pool) to seed the trap.
        await write(wallet, { address: WETH_ADDR, abi: ERC20_ABI, functionName: 'deposit', value: 10n ** 18n, gas: 100_000n })
        await write(wallet, { address: WETH_ADDR, abi: ERC20_ABI, functionName: 'approve', args: [SWAP_ROUTER_02, 10n ** 18n], gas: 100_000n })
        await mine(fork)
        await write(wallet, {
          address: SWAP_ROUTER_02,
          abi: SWAP_ROUTER_ABI,
          functionName: 'exactInputSingle',
          args: [{ tokenIn: WETH_ADDR, tokenOut: BRETT_ADDR, fee: 10000, recipient: USDC_WHALE, amountIn: 5n * 10n ** 16n, amountOutMinimum: 0n, sqrtPriceLimitX96: 0n }],
          gas: 500_000n,
        })
        await mine(fork)
        const brettBalance = (await pub.readContract({ address: BRETT_ADDR, abi: ERC20_ABI, functionName: 'balanceOf', args: [USDC_WHALE] })) as bigint
        expect(brettBalance).toBeGreaterThan(0n)

        // Create the trap: BRETT/USDC at the FREE fee-100 tier, initialized at a fantasy price
        // (~$50/BRETT vs a real ~$0.05), with a single-tick-band dust position. token0=BRETT<USDC=token1.
        const FANTASY_SQRT_PRICE = 560343750349860000000000n // ≈ sqrt(50e6/1e18) * 2^96
        await write(wallet, {
          address: NPM,
          abi: NPM_ABI,
          functionName: 'createAndInitializePoolIfNecessary',
          args: [BRETT_ADDR, USDC_ADDR, 100, FANTASY_SQRT_PRICE],
          gas: 6_000_000n,
        })
        await mine(fork)
        const trapPool = getAddress(
          (await pub.readContract({ address: V3_FACTORY, abi: V3_FACTORY_ABI, functionName: 'getPool', args: [BRETT_ADDR, USDC_ADDR, 100] })) as Address
        )
        const slot0 = (await pub.readContract({ address: trapPool, abi: V3_POOL_ABI, functionName: 'slot0' })) as readonly [bigint, number, ...unknown[]]
        const currentTick = Number(slot0[1])

        await write(wallet, { address: BRETT_ADDR, abi: ERC20_ABI, functionName: 'approve', args: [NPM, brettBalance], gas: 100_000n })
        await write(wallet, { address: USDC_ADDR, abi: ERC20_ABI, functionName: 'approve', args: [NPM, 10n ** 9n], gas: 100_000n })
        await mine(fork)
        await write(wallet, {
          address: NPM,
          abi: NPM_ABI,
          functionName: 'mint',
          args: [{
            token0: BRETT_ADDR,
            token1: USDC_ADDR,
            fee: 100,
            tickLower: currentTick, // tickSpacing 1: [tick, tick+1] is a single-tick band around spot
            tickUpper: currentTick + 1,
            amount0Desired: 10n ** 15n,
            amount1Desired: 10n ** 5n,
            amount0Min: 0n,
            amount1Min: 0n,
            recipient: USDC_WHALE,
            deadline: 99_999_999_999n,
          }],
          gas: 2_000_000n,
        })
        await mine(fork)
        const trapLiquidity = (await pub.readContract({ address: trapPool, abi: V3_POOL_ABI, functionName: 'liquidity' })) as bigint
        expect(trapLiquidity).toBeGreaterThan(0n) // the trap is live (fakes a spot price)

        // Despite the trap, discovery must still select the honest 2-hop; the trap's two-way probe
        // collapses (its thin single-tick band can't fill a 1000-USDC round trip).
        const result = await discoverPricePath(pub, { base: BRETT, quote: USDC, options: LOCAL_V4_SCAN })
        expect(isPricePath(result)).toBe(true)
        if (!isPricePath(result)) throw new Error('unreachable')

        expect(result.legs.length).toBe(2)
        expect(result.legs[0].quote.wrapped.address).toBe(WETH_ADDR)
        expect(DEEP_WETH_USDC.has(poolAddress(result.legs[1].pool)!)).toBe(true)
        // The trap pool is never part of the selected path.
        for (const leg of result.legs) expect(poolAddress(leg.pool)).not.toBe(trapPool.toLowerCase())
      } finally {
        await teardown(fork)
      }
    },
    300_000
  )
})
