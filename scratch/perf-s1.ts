/**
 * S1 adaptive-scan-window benchmark: cold getQuote latency + a wave-2-deep drain.
 *
 * Run: chainz exec 1 -- bun scratch/perf-s1.ts
 * Never prints the RPC URL.
 */
import { createPublicClient, http, parseEther, type PublicClient } from 'viem'
import { mainnet } from 'viem/chains'

import { createRouter, manifestFor } from '../sdks/router-lite-sdk/src/index'

const USDC = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48'
const AMOUNT = parseEther('1')

type Counts = { total: number; byMethod: Record<string, number>; getLogsSpans: bigint[] }

function countingClient(url: string): { client: PublicClient; counts: Counts } {
  const counts: Counts = { total: 0, byMethod: {}, getLogsSpans: [] }
  const inner = createPublicClient({ chain: mainnet, transport: http(url, { timeout: 30_000 }) }) as PublicClient
  const request = inner.request.bind(inner)
  const client = new Proxy(inner, {
    get(target, prop, recv) {
      if (prop === 'request') {
        return async (args: any, opts?: any) => {
          counts.total++
          counts.byMethod[args.method] = (counts.byMethod[args.method] ?? 0) + 1
          if (args.method === 'eth_getLogs') {
            const f = args.params[0]
            counts.getLogsSpans.push(BigInt(f.toBlock) - BigInt(f.fromBlock) + 1n)
          }
          return request(args, opts)
        }
      }
      return Reflect.get(target, prop, recv)
    },
  }) as PublicClient
  return { client, counts }
}

function coveredBlocks(ranges: { fromBlock: bigint; toBlock: bigint }[]): bigint {
  return ranges.reduce((s, r) => s + (r.toBlock - r.fromBlock + 1n), 0n)
}

function summarize(counts: Counts): Record<string, unknown> {
  const spans = counts.getLogsSpans
  return {
    requests: counts.total,
    byMethod: counts.byMethod,
    getLogs: spans.length,
    widestSpan: spans.length ? spans.reduce((a, b) => (b > a ? b : a)).toString() : '0',
    firstSpan: spans.length ? spans[0]!.toString() : '0',
  }
}

async function main(): Promise<void> {
  const url = process.env.ETH_RPC_URL
  if (!url) throw new Error('ETH_RPC_URL not set — run under `chainz exec 1 --`')

  // ---- A: cold getQuote(eth -> usdc), first-actionable latency -------------
  {
    const { client, counts } = countingClient(url)
    const router = createRouter({ client, manifest: manifestFor(1) })
    const t0 = Date.now()
    const res = await router.getQuote({
      tokenIn: 'native',
      tokenOut: USDC,
      amountIn: AMOUNT,
      signal: AbortSignal.timeout(120_000),
    })
    const ms = Date.now() - t0
    console.log(
      JSON.stringify({
        phase: 'cold-getQuote',
        firstActionableMs: ms,
        status: res.status,
        amountOut: res.status === 'quote' ? res.best.quote.amountOut.toString() : null,
        ...summarize(counts),
        discovery: Object.fromEntries(
          Object.entries(res.search.discovery).map(([p, d]) => [
            p,
            { status: d.status, blocks: coveredBlocks(d.coveredRanges).toString() },
          ]),
        ),
      }),
    )
  }

  // ---- B: wave-2-deep drain under a 60s budget ----------------------------
  {
    const { client, counts } = countingClient(url)
    const router = createRouter({ client, manifest: manifestFor(1) })
    const t0 = Date.now()
    const waves: unknown[] = []
    let last: any
    for await (const r of router.quotes({
      tokenIn: 'native',
      tokenOut: USDC,
      amountIn: AMOUNT,
      signal: AbortSignal.timeout(60_000),
    })) {
      last = r
      waves.push({
        ms: Date.now() - t0,
        status: r.status,
        amountOut: r.status === 'quote' ? r.best.quote.amountOut.toString() : null,
        requests: counts.total,
        discovery: Object.fromEntries(
          Object.entries(r.search.discovery).map(([p, d]: any) => [
            p,
            `${d.status}:${coveredBlocks(d.coveredRanges).toString()}`,
          ]),
        ),
      })
    }
    console.log(
      JSON.stringify({
        phase: 'drain-60s',
        totalMs: Date.now() - t0,
        firstActionableMs: (waves[0] as any)?.ms ?? null,
        waveCount: waves.length,
        ...summarize(counts),
        finalDiscovery: last
          ? Object.fromEntries(
              Object.entries(last.search.discovery).map(([p, d]: any) => [
                p,
                { status: d.status, blocks: coveredBlocks(d.coveredRanges).toString() },
              ]),
            )
          : null,
        waves,
      }),
    )
  }
}

await main()
