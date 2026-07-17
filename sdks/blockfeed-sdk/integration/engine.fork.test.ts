import { Token } from '@uniswap/sdk-core'
import {
  createBlockFeed,
  type FeedEvent,
  type FeedStore,
  priceFromSqrtPriceX96,
  type PricePath,
  pricePathSource,
  type PricePathValue,
} from '@uniswap/blockfeed-sdk'
import { afterAll, describe, expect, it } from 'bun:test'
import {
  type Account,
  type Address,
  createPublicClient,
  createWalletClient,
  http,
  parseAbi,
  type PublicClient,
  type Transport,
  type WalletClient,
  webSocket,
} from 'viem'
import { base } from 'viem/chains'

import { type AnvilFork, anvilAvailable, FORK_RPC_BASE, startAnvilFork } from './anvil'

/**
 * The concrete Base-chain client type. Declaring it explicitly (rather than the bare `PublicClient`)
 * is what lets an OP-stack `createPublicClient({ chain: base })` flow through without an `as`
 * cast — its chain formatters are incompatible with the default `PublicClient` generic.
 */
type ForkPublicClient = PublicClient<Transport, typeof base>

const RUN = anvilAvailable() && process.env.BLOCKFEED_SKIP_FORK !== '1'

/**
 * Pinned Base block. Chosen at implementation time as a recent, well-behind-head block
 * (`cast block-number --rpc-url https://mainnet.base.org` returned ~48731085 on 2026-07-16);
 * 48_730_000 is a round block comfortably below head so the fork's historical state is stable and
 * anvil's on-disk cache makes reruns cheap.
 */
const FORK_BLOCK = 48_730_000n
const CHAIN_ID = 8453

// Base mainnet addresses (per the task brief and src/addresses.ts).
const POOL = '0xd0b53D9277642d899DF5C87A3966A349A798F224' as Address // WETH/USDC v3 0.05%
const SWAP_ROUTER_02 = '0x2626664c2603336E57B271c5C0b26F421741e481' as Address
const USDC_ADDR = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' as Address
const WETH_ADDR = '0x4200000000000000000000000000000000000006' as Address

/**
 * USDC whale, impersonated to move the pool. Found by probing `balanceOf(USDC)` at FORK_BLOCK across
 * a handful of known Base-active addresses (Circle/Coinbase/bridge/CEX hot wallets); this one is a
 * plain EOA (`eth_getCode` empty) holding ~526,886 USDC at the pinned block. An EOA matters because
 * an impersonated tx must originate from a code-less account — the larger holder 0xcDAC… was rejected
 * for being a contract (its `approve` reverted under impersonation).
 */
const USDC_WHALE = '0x20FE51A9229EEf2cF8Ad9E89d91CAb9312cF3b7A' as Address

const V3_SLOT0_ABI = parseAbi([
  'function slot0() view returns (uint160 sqrtPriceX96, int24 tick, uint16 observationIndex, uint16 observationCardinality, uint16 observationCardinalityNext, uint8 feeProtocol, bool unlocked)',
])
const ERC20_ABI = parseAbi([
  'function approve(address spender, uint256 amount) returns (bool)',
  'function transfer(address to, uint256 amount) returns (bool)',
  'function balanceOf(address account) view returns (uint256)',
  'event Transfer(address indexed from, address indexed to, uint256 value)',
])
const TRANSFER_EVENT = ERC20_ABI[3]
const SWAP_ROUTER_ABI = parseAbi([
  'struct ExactInputSingleParams { address tokenIn; address tokenOut; uint24 fee; address recipient; uint256 amountIn; uint256 amountOutMinimum; uint160 sqrtPriceLimitX96; }',
  'function exactInputSingle(ExactInputSingleParams params) payable returns (uint256 amountOut)',
])

// sdk-core currencies for the watched path (WETH priced in USDC over the single v3 leg).
const WETH = new Token(CHAIN_ID, WETH_ADDR, 18, 'WETH', 'Wrapped Ether')
const USDC = new Token(CHAIN_ID, USDC_ADDR, 6, 'USDC', 'USD Coin')
const WETH_USDC_PATH: PricePath = {
  base: WETH,
  quote: USDC,
  legs: [{ pool: { protocol: 'v3', pool: POOL }, base: WETH, quote: USDC }],
}

const USDC_UNIT = 10n ** 6n
const DEAD = '0x000000000000000000000000000000000000dEaD' as Address

/** Track live forks so `afterAll` can hard-reap any that a failing test left running. */
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

/** Impersonate the whale, fund it with gas ETH, and switch anvil to manual mining. */
async function prepareWhale(fork: AnvilFork): Promise<void> {
  await fork.rpc('anvil_impersonateAccount', [USDC_WHALE])
  await fork.rpc('anvil_setBalance', [USDC_WHALE, '0xDE0B6B3A7640000']) // 1 ETH
  await fork.rpc('evm_setAutomine', [false])
}

const blockNumberOf = async (fork: AnvilFork): Promise<bigint> => BigInt(await fork.rpc<string>('eth_blockNumber', []))
const mine = (fork: AnvilFork, n = 1): Promise<unknown> => fork.rpc('anvil_mine', [`0x${n.toString(16)}`])

/** Read the pool's slot0 at a specific block and price WETH in USDC exactly as the source does. */
async function poolPriceAt(pub: ForkPublicClient, blockNumber: bigint) {
  const slot0 = await pub.readContract({ address: POOL, abi: V3_SLOT0_ABI, functionName: 'slot0', blockNumber })
  return priceFromSqrtPriceX96({ sqrtPriceX96: slot0[0], token0: WETH, token1: USDC, base: WETH, quote: USDC })
}

interface Recorder<T> {
  events: FeedEvent<T>[]
  stop(): void
  /** Resolve on the first buffered-or-future event matching `pred`; reject after `timeoutMs`. */
  waitFor(pred: (e: FeedEvent<T>) => boolean, timeoutMs?: number): Promise<FeedEvent<T>>
}

/**
 * Subscribe once and buffer every event, so `waitFor` can match events that already fired (during the
 * mine/RPC `await`s) as well as future ones. A fresh subscription per wait would miss the block-tick
 * that lands between mining and subscribing — the engine emits eagerly.
 */
function record<T>(store: FeedStore<T>): Recorder<T> {
  const events: FeedEvent<T>[] = []
  const waiters = new Set<{ pred: (e: FeedEvent<T>) => boolean; resolve: (e: FeedEvent<T>) => void; timer: ReturnType<typeof setTimeout> }>()
  const unsub = store.subscribe((e) => {
    events.push(e)
    for (const w of [...waiters]) {
      if (!w.pred(e)) continue
      clearTimeout(w.timer)
      waiters.delete(w)
      w.resolve(e)
    }
  })
  return {
    events,
    stop: unsub,
    waitFor(pred, timeoutMs = 25_000) {
      const existing = events.find(pred)
      if (existing) return Promise.resolve(existing)
      return new Promise((resolve, reject) => {
        const w = {
          pred,
          resolve,
          timer: setTimeout(() => {
            waiters.delete(w)
            reject(new Error(`waitFor timed out after ${timeoutMs}ms`))
          }, timeoutMs),
        }
        waiters.add(w)
      })
    },
  }
}

const isTick = <T>(e: FeedEvent<T>): e is Extract<FeedEvent<T>, { type: 'tick' }> => e.type === 'tick'

/** Send an ERC20 approve of `amount` USDC to SwapRouter02 into the mempool (no mine). */
async function sendApprove(wallet: WalletClient, amount: bigint): Promise<void> {
  await wallet.writeContract({
    account: wallet.account as Account,
    chain: base,
    address: USDC_ADDR,
    abi: ERC20_ABI,
    functionName: 'approve',
    args: [SWAP_ROUTER_02, amount],
    gas: 100_000n,
  })
}

/** Send an exactInputSingle USDC->WETH swap into the mempool (no mine). Moves the pool price up. */
async function sendSwap(wallet: WalletClient, amountInUsdc: bigint): Promise<`0x${string}`> {
  return wallet.writeContract({
    account: wallet.account as Account,
    chain: base,
    address: SWAP_ROUTER_02,
    abi: SWAP_ROUTER_ABI,
    functionName: 'exactInputSingle',
    args: [
      {
        tokenIn: USDC_ADDR,
        tokenOut: WETH_ADDR,
        fee: 500,
        recipient: USDC_WHALE,
        amountIn: amountInUsdc,
        amountOutMinimum: 0n,
        sqrtPriceLimitX96: 0n,
      },
    ],
    gas: 400_000n,
  })
}

/**
 * The shared "price tick correctness" body, run over whichever transport the caller wires up. Asserts
 * the pre-swap tick matches a direct slot0 read, then that a single 50k-USDC swap produces a NEW tick
 * whose price (a) differs, (b) equals a fresh slot0 read at the new block, and (c) is tagged with it.
 */
async function runPriceTickScenario(fork: AnvilFork, pub: ForkPublicClient, wallet: WalletClient): Promise<void> {
  const feed = createBlockFeed({ client: pub, chainId: CHAIN_ID, pollIntervalMs: 200 })
  const store = feed.watch(pricePathSource(WETH_USDC_PATH))
  const rec = record(store)
  try {
    const firstTick = await rec.waitFor((e) => isTick(e) && e.emission.identity.blockNumber === FORK_BLOCK)
    if (!isTick(firstTick)) throw new Error('unreachable')
    const before = firstTick.emission.value as PricePathValue

    expect(before.price.equalTo(await poolPriceAt(pub, FORK_BLOCK))).toBe(true)
    expect(firstTick.emission.identity.blockNumber).toBe(FORK_BLOCK)

    // One 50k USDC -> WETH swap, approve + swap batched into the next mined block.
    await sendApprove(wallet, 50_000n * USDC_UNIT)
    await sendSwap(wallet, 50_000n * USDC_UNIT)
    await mine(fork)
    const newBlock = await blockNumberOf(fork)
    expect(newBlock).toBe(FORK_BLOCK + 1n)

    const nextTick = await rec.waitFor((e) => isTick(e) && e.emission.identity.blockNumber === newBlock)
    if (!isTick(nextTick)) throw new Error('unreachable')
    const after = nextTick.emission.value as PricePathValue

    // (a) price moved, (b) equals a fresh direct slot0 read at the new block, (c) tagged with it.
    expect(after.price.equalTo(before.price)).toBe(false)
    expect(after.price.equalTo(await poolPriceAt(pub, newBlock))).toBe(true)
    expect(nextTick.emission.identity.blockNumber).toBe(newBlock)
    expect(nextTick.emission.identity.chainId).toBe(CHAIN_ID)
  } finally {
    rec.stop()
    feed.stop()
  }
}

describe.skipIf(!RUN)('engine fork scenarios (Base)', () => {
  it(
    'scenario 1: price tick correctness over HTTP',
    async () => {
      const fork = await newFork(8601)
      try {
        await prepareWhale(fork)
        const pub = createPublicClient({ chain: base, transport: http(fork.rpcUrl) })
        const wallet = createWalletClient({ account: USDC_WHALE, chain: base, transport: http(fork.rpcUrl) })
        await runPriceTickScenario(fork, pub, wallet)
      } finally {
        await teardown(fork)
      }
    },
    90_000
  )

  it(
    'scenario 3: price tick correctness over WebSocket',
    async () => {
      const fork = await newFork(8602)
      try {
        await prepareWhale(fork)
        // WS drives the feed's push heartbeat; an HTTP wallet sends txs. `reconnect: false`: viem's
        // default reconnecting socket races anvil's local WS and reports a spurious "Failed to
        // connect"; a single non-reconnecting socket connects reliably here.
        const pub = createPublicClient({
          chain: base,
          transport: webSocket(fork.wsUrl, { reconnect: false }),
        })
        const wallet = createWalletClient({ account: USDC_WHALE, chain: base, transport: http(fork.rpcUrl) })
        expect((pub as unknown as { transport: { type: string } }).transport.type).toBe('webSocket')
        await runPriceTickScenario(fork, pub, wallet)
      } finally {
        await teardown(fork)
      }
    },
    90_000
  )

  it(
    'scenario 2: retraction honesty — a reorg that drops a watched log emits a retraction with its (txHash, logIndex)',
    async () => {
      const fork = await newFork(8603)
      try {
        await prepareWhale(fork)
        const pub = createPublicClient({ chain: base, transport: http(fork.rpcUrl) })
        const wallet = createWalletClient({ account: USDC_WHALE, chain: base, transport: http(fork.rpcUrl) })

        // Mine past the pinned block onto locally-mined (empty) blocks BEFORE watching, so every log
        // window stays over local blocks — avoids a slow upstream getLogs over the real, USDC-heavy
        // block 48730000.
        await mine(fork, 3)
        const baseBlock = await blockNumberOf(fork)

        // A source that watches USDC Transfer logs (any log exercises the reconciliation mechanism)
        // and prices nothing — derive returns undefined, so only log/retraction events flow.
        const logSource = {
          key: 'usdc-transfers',
          calls: () => ({}),
          logFilters: () => [{ address: USDC_ADDR, event: TRANSFER_EVENT }],
          derive: () => undefined,
        }
        const feed = createBlockFeed({ client: pub, chainId: CHAIN_ID, pollIntervalMs: 200 })
        const store = feed.watch(logSource)
        const rec = record(store)
        try {
          // Snapshot the clean tip so we can revert the transfer away later (anvil_reorg is
          // unavailable on this fork — it returns "Resource not found"; this is the brief's
          // evm_snapshot/evm_revert fallback).
          const snapshotId = await fork.rpc<string>('evm_snapshot', [])

          // Transfer from the whale, then two empty blocks so the log sits mid-window (K=3 default).
          const transferHash = await wallet.writeContract({
            account: wallet.account as Account,
            chain: base,
            address: USDC_ADDR,
            abi: ERC20_ABI,
            functionName: 'transfer',
            args: [DEAD, 1_000n * USDC_UNIT],
            gas: 120_000n,
          })
          await mine(fork, 1)
          await mine(fork, 2)
          const headWithLog = await blockNumberOf(fork)
          const logReceipt = await pub.getTransactionReceipt({ hash: transferHash })
          const expectedLogIndex = logReceipt.logs[0].logIndex

          const logEvent = await rec.waitFor(
            (e) => e.type === 'log' && e.log.txHash.toLowerCase() === transferHash.toLowerCase()
          )
          if (logEvent.type !== 'log') throw new Error('unreachable')
          expect(logEvent.log.blockNumber).toBe(logReceipt.blockNumber)
          expect(logEvent.log.eventName).toBe('Transfer')

          // Reorg: revert to the pre-transfer snapshot and re-mine the same height, empty. The log's
          // block is re-scanned, the log is gone -> retraction.
          expect(await fork.rpc<boolean>('evm_revert', [snapshotId])).toBe(true)
          await mine(fork, Number(headWithLog - baseBlock))
          expect(await blockNumberOf(fork)).toBe(headWithLog)

          const retraction = await rec.waitFor(
            (e) => e.type === 'retraction' && e.ref.txHash.toLowerCase() === transferHash.toLowerCase()
          )
          if (retraction.type !== 'retraction') throw new Error('unreachable')
          expect(retraction.ref.txHash.toLowerCase()).toBe(transferHash.toLowerCase())
          expect(retraction.ref.logIndex).toBe(expectedLogIndex)
          expect(retraction.ref.blockNumber).toBe(logReceipt.blockNumber)
        } finally {
          rec.stop()
          feed.stop()
        }
      } finally {
        await teardown(fork)
      }
    },
    90_000
  )

  it(
    'scenario 4: multicall atomicity — every emission is block-monotone and matches slot0 at its own block',
    async () => {
      const fork = await newFork(8604)
      try {
        await prepareWhale(fork)
        const pub = createPublicClient({ chain: base, transport: http(fork.rpcUrl) })
        const wallet = createWalletClient({ account: USDC_WHALE, chain: base, transport: http(fork.rpcUrl) })

        const feed = createBlockFeed({ client: pub, chainId: CHAIN_ID, pollIntervalMs: 120 })
        const store = feed.watch(pricePathSource(WETH_USDC_PATH))
        const rec = record(store)
        try {
          await rec.waitFor((e) => isTick(e) && e.emission.identity.blockNumber === FORK_BLOCK)

          // Approve once for the whole burst, mined in its own block. This block moves no price, so
          // the engine suppresses its (unchanged-value) tick — don't wait for one.
          await sendApprove(wallet, 100_000n * USDC_UNIT)
          await mine(fork)

          // Burst: five swaps, each in its own mined block; wait for the engine to observe each head.
          for (let i = 0; i < 5; i++) {
            await sendSwap(wallet, 8_000n * USDC_UNIT)
            await mine(fork)
            const head = await blockNumberOf(fork)
            await rec.waitFor((e) => isTick(e) && e.emission.identity.blockNumber >= head)
          }

          const ticks = rec.events
            .filter(isTick)
            .map((e) => ({ blockNumber: e.emission.identity.blockNumber, value: e.emission.value as PricePathValue }))
          expect(ticks.length).toBeGreaterThanOrEqual(6)

          // (a) Block numbers are monotonically nondecreasing across every emission.
          for (let i = 1; i < ticks.length; i++) {
            expect(ticks[i].blockNumber >= ticks[i - 1].blockNumber).toBe(true)
          }

          // (b) Each tick's price equals the direct slot0 read at that same block — no mixed-block
          // (torn) read is ever emitted. This is the atomicity guarantee.
          for (const t of ticks) {
            expect(t.value.price.equalTo(await poolPriceAt(pub, t.blockNumber))).toBe(true)
          }

          // Sanity: the burst actually advanced the chain and moved the price.
          const last = ticks[ticks.length - 1]
          expect(last.blockNumber).toBeGreaterThanOrEqual(FORK_BLOCK + 5n)
          expect(last.value.price.equalTo(ticks[0].value.price)).toBe(false)
        } finally {
          rec.stop()
          feed.stop()
        }
      } finally {
        await teardown(fork)
      }
    },
    120_000
  )
})

afterAll(async () => {
  for (const fork of liveForks) {
    try {
      await fork.stop()
    } catch {
      // best-effort reap
    }
  }
  liveForks.clear()
})
