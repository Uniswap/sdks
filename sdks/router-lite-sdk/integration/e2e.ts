import {
  MAINNET_MANIFEST,
  manifestFor,
  type ChainManifest,
  type CurrencyRef,
  type EncodedTx,
  type NeedsActionSwap,
  type QuoteResult,
  type ReadySwap,
  type SuccessfulQuote,
  type SwapResult,
} from '@uniswap/router-lite-sdk'
import {
  createPublicClient,
  custom,
  http,
  toHex,
  type Address,
  type Hex,
  type PublicClient,
  type TransactionReceipt,
} from 'viem'
import { mainnet } from 'viem/chains'

import { ERC20_ABI } from './abis'
import { FORK_BLOCK, type AnvilClient } from './anvil'
// `assertResultCoherent` is the SDK's own honesty checker. It is deliberately NOT part of the
// published surface (`src/internal/testing.ts` is reachable through neither export path), so it is
// imported by relative path — the same escape hatch `worldBuilder.ts` already uses for `../src/types`.
// Importing it is the point: every result this suite produces is held to the same invariants the
// unit suites hold theirs to, so a classification bug fails a test that was checking something else.
import { assertResultCoherent } from '../src/internal/testing'

// ---------------------------------------------------------------------------
// Shared machinery for the fork e2e suites (Task 19B).
//
// `worldBuilder.ts` builds the world; this file is the other half — everything
// needed to point the SDK at that world, then EXECUTE what it hands back:
//
//   forkManifest()   the real mainnet deployments, discovery floor moved to the
//                    pinned fork block
//   countingClient() a viem client that counts JSON-RPC methods (the zero-scan proof)
//   executeSwap()    impersonate the trader, broadcast the SDK's `tx`, and measure
//                    the output-balance delta the trade actually produced
//   readySwap()      narrow a SwapResult to `ready` (through assertResultCoherent)
//                    with a failure message that explains what the search saw
// ---------------------------------------------------------------------------

/**
 * The mainnet manifest with every protocol's `deploymentBlock` moved up to {@link FORK_BLOCK}.
 *
 * The addresses stay real — factories, quoters, PoolManager, Permit2 and the Universal Router are
 * all the genuine mainnet deployments the fork carries. Only the *historical floor* of log discovery
 * moves: a real floor would make every adjacency scan walk ~4M blocks of mainnet history in 10k-block
 * chunks, through anvil's upstream proxy, for pools that were all created on the fork seconds ago.
 *
 * Nothing this suite asserts depends on the floor. Pools known to mainnet are reached by speculative
 * probes (CREATE2 addresses and quoter calls — no logs involved), and every pool a scan is asked to
 * find is created on the fork, above {@link FORK_BLOCK}.
 */
export function forkManifest(overrides?: Partial<ChainManifest>): ChainManifest {
  return manifestFor(1, {
    v2: { ...MAINNET_MANIFEST.v2!, deploymentBlock: FORK_BLOCK },
    v3: { ...MAINNET_MANIFEST.v3!, deploymentBlock: FORK_BLOCK },
    v4: { ...MAINNET_MANIFEST.v4!, deploymentBlock: FORK_BLOCK },
    ...overrides,
  })
}

/** Real mainnet currencies the known-pool suites trade. */
export const WETH: Address = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2'
export const USDC: Address = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48'

/**
 * Circle's own USDC treasury EOA — the suite's USDC faucet.
 *
 * USDC cannot be minted or storage-poked honestly (the token is behind a proxy with a blocklist and
 * its own accounting), so a trader is funded by impersonating a holder and making a real `transfer`.
 * This address held ~57M USDC at {@link FORK_BLOCK} and is an EOA (no contract code to get in the
 * way of impersonation). If a future re-pin makes it unsuitable, `usdcWhaleBalance` fails loudly
 * rather than silently funding nothing.
 */
export const USDC_WHALE: Address = '0x55FE002aefF02F77364de339a1292923A15844B8'

// ---------------------------------------------------------------------------
// Clients
// ---------------------------------------------------------------------------

export type CountingClient = {
  client: PublicClient
  /** Calls seen per JSON-RPC method. */
  counts: Map<string, number>
  /** The filter object of every `eth_getLogs` issued, in order. */
  logQueries: { address?: Address; topics?: (Hex | null)[] }[]
  count(method: string): number
  reset(): void
}

/**
 * A `PublicClient` over the fork that counts every JSON-RPC method it forwards.
 *
 * This is how "resolved without touching the log stream" is proven rather than asserted: the router
 * gets an ordinary client, and the test reads the counter afterwards.
 */
export function countingClient(rpcUrl: string): CountingClient {
  const counts = new Map<string, number>()
  const logQueries: { address?: Address; topics?: (Hex | null)[] }[] = []
  const inner = http(rpcUrl, { timeout: 120_000 })({ chain: mainnet })

  const transport = custom({
    async request({ method, params }: { method: string; params?: unknown }) {
      counts.set(method, (counts.get(method) ?? 0) + 1)
      if (method === 'eth_getLogs' && Array.isArray(params)) {
        logQueries.push(params[0] as { address?: Address; topics?: (Hex | null)[] })
      }
      return inner.request({ method, params } as never)
    },
  })

  return {
    client: createPublicClient({ chain: mainnet, transport }) as PublicClient,
    counts,
    logQueries,
    count: (method: string) => counts.get(method) ?? 0,
    reset() {
      counts.clear()
      logQueries.length = 0
    },
  }
}

/**
 * Splits observed `eth_getLogs` filters into exact-pair queries (both currency slots pinned) and
 * adjacency queries (one endpoint pinned, the rest of the pair open).
 *
 * The distinction is the whole cost story: an exact-pair query answers "is there a pool for THIS
 * pair", an adjacency query answers "what pools touch this token at all" and is the expensive one
 * the hint/ingest fast path is supposed to avoid.
 */
export function classifyLogQueries(queries: { topics?: (Hex | null)[] }[]): {
  exactPair: number
  adjacency: number
} {
  let exactPair = 0
  let adjacency = 0
  for (const q of queries) {
    const pinned = (q.topics ?? []).slice(1).filter((t) => t !== null && t !== undefined).length
    if (pinned >= 2) exactPair++
    else adjacency++
  }
  return { exactPair, adjacency }
}

// ---------------------------------------------------------------------------
// Balances and execution
// ---------------------------------------------------------------------------

export async function balanceOf(anvil: AnvilClient, currency: CurrencyRef, holder: Address): Promise<bigint> {
  if (currency === 'native') return anvil.publicClient.getBalance({ address: holder })
  return (await anvil.publicClient.readContract({
    address: currency,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: [holder],
  })) as bigint
}

/**
 * Funds `to` with real mainnet USDC by impersonating {@link USDC_WHALE} and making a real transfer.
 *
 * Deliberately a transfer and not a storage poke: USDC's balances live behind a proxy with its own
 * accounting and a blocklist, so a written slot is a balance no real trader could hold — and the
 * blocklist checks the swap will run into would be tested against a fiction.
 */
export async function fundUsdc(anvil: AnvilClient, to: Address, amount: bigint): Promise<void> {
  const held = await balanceOf(anvil, USDC, USDC_WHALE)
  if (held < amount) {
    throw new Error(`USDC whale ${USDC_WHALE} holds ${held} at the pinned block, less than the ${amount} requested`)
  }
  await anvil.rpc('anvil_impersonateAccount', [USDC_WHALE])
  try {
    await anvil.rpc('anvil_setBalance', [USDC_WHALE, toHex(10n ** 19n)])
    const wallet = anvil.walletFor(USDC_WHALE)
    const write = wallet.writeContract as unknown as (a: Record<string, unknown>) => Promise<Hex>
    const hash = await write({
      account: USDC_WHALE,
      chain: mainnet,
      address: USDC,
      abi: ERC20_ABI,
      functionName: 'transfer',
      args: [to, amount],
    })
    const receipt = await anvil.publicClient.waitForTransactionReceipt({ hash })
    if (receipt.status !== 'success') throw new Error(`USDC transfer from the whale reverted (tx ${hash})`)
  } finally {
    await anvil.rpc('anvil_stopImpersonatingAccount', [USDC_WHALE])
  }
}

/** Broadcasts `tx` from `trader` on the fork via impersonation, and waits for the receipt. */
export async function sendAsTrader(anvil: AnvilClient, trader: Address, tx: EncodedTx): Promise<TransactionReceipt> {
  await anvil.rpc('anvil_impersonateAccount', [trader])
  try {
    const hash = await anvil.rpc<Hex>('eth_sendTransaction', [
      {
        from: trader,
        to: tx.to,
        data: tx.data,
        gas: toHex(4_000_000n),
        ...(tx.value > 0n ? { value: toHex(tx.value) } : {}),
      },
    ])
    return await anvil.publicClient.waitForTransactionReceipt({ hash })
  } finally {
    await anvil.rpc('anvil_stopImpersonatingAccount', [trader])
  }
}

export type ExecutionOutcome = {
  receipt: TransactionReceipt
  /** Output received, gas-adjusted for a native output so it is comparable to `quote.amountOut`. */
  delta: bigint
  gasCost: bigint
}

/**
 * The other half of every `ready` assertion: actually send the transaction the SDK produced, from
 * the trader it was built for, and measure what the recipient received.
 *
 * A native output is measured net of gas — the trade's proceeds and the transaction's own fee land
 * in the same balance, and only the former is what the quote promised.
 */
export async function executeSwap(
  anvil: AnvilClient,
  args: { trader: Address; recipient?: Address; tx: EncodedTx; currencyOut: CurrencyRef },
): Promise<ExecutionOutcome> {
  const recipient = args.recipient ?? args.trader
  const before = await balanceOf(anvil, args.currencyOut, recipient)
  const receipt = await sendAsTrader(anvil, args.trader, args.tx)
  const after = await balanceOf(anvil, args.currencyOut, recipient)

  const gasCost = receipt.gasUsed * receipt.effectiveGasPrice
  const paidGas = args.currencyOut === 'native' && recipient.toLowerCase() === args.trader.toLowerCase()
  return { receipt, delta: after - before + (paidGas ? gasCost : 0n), gasCost }
}

// ---------------------------------------------------------------------------
// Result narrowing
// ---------------------------------------------------------------------------

const BPS = 10_000n

/** The slippage floor the SDK put in the calldata, recomputed from the public result. */
export function minAmountOut(amountOut: bigint, slippageBps = 100): bigint {
  return (amountOut * (BPS - BigInt(slippageBps))) / BPS
}

/**
 * A one-line summary of what a search saw — the difference between a useful failure and a puzzle.
 *
 * Every field this reads is either on the result union's base (`search`, `alternatives`), reached by
 * narrowing on the status tag, or — for the leader alone — probed with `'best' in r`. That one
 * exception is the QUOTE/SWAP seam rather than sloppiness: a swap's `inconclusive` can carry a
 * leader (verification is a step that can be cut short with the route already priced), while a
 * quote's cannot exist at all, since anything priced is reported as `status: 'quote'` however
 * incomplete the search (`types.ts#QuoteResult`). Two unions, one function, and no tag distinguishes
 * them — so the leader is the one field that has to be asked for rather than narrowed to.
 */
export function describeResult(r: QuoteResult | SwapResult): string {
  const discovery = Object.entries(r.search.discovery)
    .map(([p, d]) => `${p}:${d.status}`)
    .join(',')
  const q = r.search.quoting
  // `reason` and `best` are genuinely per-status (a `ready` has no reason; a `no-route` has no
  // leader), so they narrow on the tag — `inconclusive` included, since it now carries the best
  // route whenever the search got far enough to find one. `reason.code` (C4-P5) is the stable part;
  // `detail` is the human-readable prose, appended only when it says more than the code alone.
  const reason = r.status === 'no-route' || r.status === 'inconclusive' ? ` reason="${r.reason.code}: ${r.reason.detail}"` : ''
  const leader = 'best' in r ? r.best : undefined
  const best =
    leader !== undefined
      ? ` best=[${leader.route.legs.map((l) => l.pool.protocol).join('>')}] out=${leader.quote.amountOut}`
      : ''
  // `attempted/succeeded/failed~transportFailed+unattempted` — the transport tally is called out
  // separately because "the provider dropped the call" and "the call reverted" are the difference
  // between a puzzle and an obvious answer when a fork run comes back inconclusive.
  const degraded = r.search.verificationDegraded ? ' verificationDegraded=true' : ''
  // Same reasoning for the head: a fork/canary run that comes back inconclusive with every other
  // axis clean was searching a block the router had already been past (a lagging replica), which is
  // otherwise invisible — nothing failed, the node just answered about an older chain.
  const regressed = r.search.headRegressed ? ' headRegressed=true' : ''
  return `${r.status}${reason}${best} alts=${r.alternatives.length} discovery=${discovery} quoting=${q.attempted}/${q.succeeded}/${q.failed}~${q.transportFailed}+${q.unattempted} aborted=${r.search.aborted}${degraded}${regressed}`
}

/** Asserts coherence, then narrows to `ready` — throwing with the search summary when it is not. */
export function readySwap(r: SwapResult): ReadySwap {
  assertResultCoherent(r)
  if (r.status !== 'ready') throw new Error(`expected a ready swap, got ${describeResult(r)}`)
  return r
}

/** Asserts coherence, then narrows to `needs-action`. */
export function needsAction(r: SwapResult): NeedsActionSwap {
  assertResultCoherent(r)
  if (r.status !== 'needs-action') throw new Error(`expected needs-action, got ${describeResult(r)}`)
  return r
}

/** Asserts coherence, then narrows to `no-route` — the shape a *completed* search that found nothing
 * executable takes. Keeps the `alternatives` visible, which is where a candidate that quoted but
 * could not execute is reported. */
export function noRouteSwap(r: SwapResult): Extract<SwapResult, { status: 'no-route' }> {
  assertResultCoherent(r)
  if (r.status !== 'no-route') throw new Error(`expected no-route, got ${describeResult(r)}`)
  return r
}

/** Asserts coherence, then narrows to `quote`. */
export function quoted(r: QuoteResult): SuccessfulQuote {
  assertResultCoherent(r)
  if (r.status !== 'quote') throw new Error(`expected a quote, got ${describeResult(r)}`)
  return r
}

/** The protocols a route traverses, in order — the shape assertions read off this. */
export function routeProtocols(route: { legs: { pool: { protocol: string } }[] }): string[] {
  return route.legs.map((l) => l.pool.protocol)
}
