/**
 * Live-pricing demo: discovery → per-block price feed, against a real chain.
 *
 * Runs the full blockfeed pipeline end to end:
 *   1. fetches the token's decimals/symbol on-chain,
 *   2. DISCOVERS the best price path to USDC (holistic enumeration + executable probe quotes),
 *   3. watches the discovered path live — one atomic multicall per block, prices printed as they tick.
 *
 * Usage (chainz injects ETH_RPC_URL):
 *   chainz exec mainnet -- bun run examples/live-price.ts [tokenAddress]
 *
 * Default token: UNI. Ctrl-C to stop.
 */
import { erc20Abi, createPublicClient, http, isAddress, type Address } from 'viem'
import { mainnet } from 'viem/chains'

import {
  createBlockFeed,
  pricePathSource,
  toCurrency,
  type FeedEvent,
  type PricePathValue,
} from '../src/index'
import { discoverPricePath, isNoPathFound } from '../src/discovery/index'

const RPC_URL = process.env.ETH_RPC_URL
if (!RPC_URL) {
  console.error('ETH_RPC_URL not set — run via: chainz exec mainnet -- bun run examples/live-price.ts')
  process.exit(1)
}

const UNI: Address = '0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984'
const USDC: Address = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48'

const tokenAddress = (process.argv[2] as Address | undefined) ?? UNI
if (!isAddress(tokenAddress)) {
  console.error(`not an address: ${tokenAddress}`)
  process.exit(1)
}

const client = createPublicClient({ chain: mainnet, transport: http(RPC_URL) })

// --- 1. Token metadata straight from the chain (any ERC20 works). -------------------------------
const [decimals, symbol] = await Promise.all([
  client.readContract({ address: tokenAddress, abi: erc20Abi, functionName: 'decimals' }),
  client.readContract({ address: tokenAddress, abi: erc20Abi, functionName: 'symbol' }),
])
const base = toCurrency({ chainId: mainnet.id, address: tokenAddress, decimals, symbol })
const quote = toCurrency({ chainId: mainnet.id, address: USDC, decimals: 6, symbol: 'USDC' })
console.log(`token: ${symbol} (${tokenAddress}, ${decimals} decimals)`)

// --- 2. Discovery: enumerate v2/v3/v4 candidates, probe-quote both ways, pick the best path. ----
console.log('discovering price path → USDC (v2/v3 factories + v4 Initialize scan + probe quotes)…')
const t0 = Date.now()
const result = await discoverPricePath(client, { base, quote })
if (isNoPathFound(result)) {
  console.error(`no path: ${result.reason}`)
  process.exit(1)
}
const legLabel = (leg: (typeof result.legs)[number]): string => {
  const pool =
    leg.pool.protocol === 'v2' ? leg.pool.pair : leg.pool.protocol === 'v3' ? leg.pool.pool : `fee=${leg.pool.poolKey.fee}`
  return `${leg.base.symbol}→${leg.quote.symbol} [${leg.pool.protocol} ${pool}]`
}
console.log(`path (${((Date.now() - t0) / 1000).toFixed(1)}s): ${result.legs.map(legLabel).join('  ·  ')}`)

// --- 3. Live feed: one atomic multicall per block over the discovered path. ---------------------
const feed = createBlockFeed({ client }) // chainId derived from client.chain; mainnet polls every 3s
const store = feed.watch(pricePathSource(result))

let lastPrice: number | undefined
const unsub = store.subscribe((e: FeedEvent<PricePathValue>) => {
  if (e.type === 'tick') {
    const { price, priceFloat } = e.emission.value
    const at = new Date(Number(e.emission.identity.timestamp) * 1000).toISOString().slice(11, 19)
    const delta =
      lastPrice === undefined ? '' : priceFloat > lastPrice ? '  ▲' : priceFloat < lastPrice ? '  ▼' : '  ='
    console.log(
      `block ${e.emission.identity.blockNumber} ${at}  1 ${symbol} = ${price.toSignificant(6)} USDC${delta}`
    )
    lastPrice = priceFloat
  } else if (e.type === 'stale') {
    console.log(e.stale ? '⚠ feed stale (rpc failing)' : '✓ feed recovered')
  } else if (e.type === 'error') {
    console.log(`⚠ ${e.scope} error: ${String((e.error as Error)?.message ?? e.error)}`)
  } else if (e.type === 'gap') {
    console.log(`⚠ missed blocks ${e.fromBlock}–${e.toBlock}`)
  }
})

console.log('live — new price on every mainnet block that moves it (Ctrl-C to stop)\n')
const shutdown = (): void => {
  unsub()
  feed.stop()
  process.exit(0)
}
process.on('SIGINT', shutdown)
// Optional bounded run for demos/CI: DEMO_SECONDS=60 auto-exits.
if (process.env.DEMO_SECONDS) setTimeout(shutdown, Number(process.env.DEMO_SECONDS) * 1000)
