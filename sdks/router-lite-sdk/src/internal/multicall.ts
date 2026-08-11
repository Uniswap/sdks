import type { Address, Hex, PublicClient } from 'viem'
import { decodeFunctionResult, encodeFunctionData } from 'viem'

import { DEFAULT_CONCURRENCY } from '../constants'
import { AbortedCallError, TransportError } from '../errors'
import type { EthCall } from '../types'

import { MULTICALL3_ABI } from './abis'
import { ethCall, mapConcurrent } from './rpc'
import type { Semaphore } from './rpc'
import { classifyRpcError, isRequestTooLarge } from './rpcErrors'

// ---------------------------------------------------------------------------
// Multicall3 aggregation — many quotes per round trip, one round trip per
// rate-limit charge.
//
// A quoting round used to be N block-pinned `eth_call`s under the router's
// semaphore; this seam folds them into ceil(N / MULTICALL_CHUNK) `aggregate3`
// calls to the chain's Multicall3, each of which is STILL one ordinary
// `ethCall` — same transport classification, same semaphore permit, same
// abort-with-permit-in-hand semantics. Measured (feasibility study, 2026-08,
// against the SDK's own candidate sets at pinned blocks):
//
//   * FIDELITY — byte-identical results and per-call revert data vs individual
//     `eth_call`s, verified including `Error(string)` reverts, bare (data-less)
//     reverts, and the v2 empty-code shape (a call to an address with no
//     contract SUCCEEDS with `0x` return data inside `aggregate3` exactly as a
//     direct `eth_call` does, so the decode-failure accounting downstream is
//     unchanged).
//   * LATENCY — 2.8-4x wall-clock on a quoting round at ~0.8s RTT for N >= 50.
//   * RATE LIMITS — the decisive one: on a burst-limited public endpoint
//     (mainnet.base.org 429s bursts of >= 4), 20-concurrent individual quotes
//     lose ~95% of the round to 429s while ONE aggregate3 carrying the same
//     quotes is charged as ONE call and lands 100%. Aggregation turns a 3-5%
//     quote success rate into complete rounds on exactly the endpoints the
//     zero-config path meets.
//
// WHAT AN INNER FAILURE MEANS is the design's one load-bearing type decision.
// `aggregate3` ran ON-CHAIN: a `Result` with `success: false` is the EVM
// rejecting that sub-call — execution-channel evidence BY CONSTRUCTION, with
// the sub-call's revert data verbatim in `returnData`. It is materialized as
// {@link InnerCallFailure} directly off the decoded struct and NEVER passed
// through `classifyRpcError`: there is no error shape to classify, and routing
// it through a message parser would only manufacture ways to get a
// construction-time certainty wrong.
//
// eth_simulateV1 was evaluated as the aggregator and rejected: sparse/gated
// provider support and block-shaped semantics this package does not need,
// against a contract deployed at the same address on 250+ chains.
// ---------------------------------------------------------------------------

/**
 * The canonical Multicall3 deployment — the same CREATE2 address on every chain that has it (250+,
 * including all five built-in manifests' chains, each verified live; see the per-manifest comment
 * blocks in `manifest.ts`). A manifest may override it (`ChainManifest.multicall3`) for a chain that
 * deployed Multicall3 elsewhere; either way the router probes `eth_getCode` there once and falls
 * back to per-call quoting forever if nothing is deployed (`router.ts#resolveMulticall3`).
 */
export const MULTICALL3_ADDRESS: Address = '0xcA11bde05977b3631167028862bE2a173976CA11'

/**
 * Inner calls per `aggregate3` — a constant with a rationale, not a knob.
 *
 * The binding constraint is the provider's `eth_call` gas cap applied to the OUTER call: every
 * successful inner quote burns real gas inside it (a live two-hop QuoterV2 quote is ~185k). The
 * study's ceiling search found ALL-LIVE two-hop rounds succeeding through N=300 (~55M inner gas) on
 * free public endpoints and failing only beyond that, so 50 sits ~6x under the worst measured
 * ceiling — deep enough that a chain of unusually expensive quotes (hooked v4 pools running arbitrary
 * hook code) still clears it. Meanwhile 50 captures effectively all of the win: a measurement round
 * is capped at `PUMP_ROUND_CAP` legs, i.e. a handful of chunks where the per-call path spent one
 * permit per leg, and the burst-limited-endpoint fix (one charge per chunk) needs only that the
 * chunk count be small, not that it be 1. Larger chunks buy nothing further and spend headroom; smaller
 * ones re-approach the per-call burst behavior this exists to escape.
 */
export const MULTICALL_CHUNK = 50

/**
 * One inner call the EVM rejected inside a successfully-served `aggregate3` — the multicall path's
 * spelling of an execution-channel revert, carrying the sub-call's revert bytes verbatim.
 *
 * `revertData === undefined` means the revert carried NO bytes (aggregate3 returns `0x` for it) —
 * the same amount-independent, pool-absent shape `revertDataOf(err) === undefined` identifies on the
 * per-call path, and the only shape `quote/measure.ts` may hand to the negative cache (C4-H3). It is
 * an `Error` subclass so `mapConcurrent`-shaped result slots (`R | Error`) hold it without a new
 * union arm, but it deliberately carries no `data` field: nothing about it is meant to survive a
 * `collectFacts` walk, because it never came from a transport and must never be re-classified as if
 * it had.
 */
export class InnerCallFailure extends Error {
  readonly revertData?: Hex

  constructor(revertData?: Hex) {
    super(
      revertData === undefined
        ? 'inner call reverted inside aggregate3 with no revert data'
        : `inner call reverted inside aggregate3 (revert data ${revertData.length > 22 ? `${revertData.slice(0, 22)}…` : revertData})`,
    )
    this.name = 'InnerCallFailure'
    if (revertData !== undefined) this.revertData = revertData
    // Restore prototype chain for instanceof across the ts→es target downlevel.
    Object.setPrototypeOf(this, InnerCallFailure.prototype)
  }
}

export type AggregateCallsArgs = {
  client: Pick<PublicClient, 'request'>
  /** The probed Multicall3 deployment (`router.ts#resolveMulticall3`) — callers must not pass the
   * canonical address on faith; an aggregate3 sent to an address with no code "succeeds" with `0x`
   * and every inner result is silently lost to the outer decode. */
  multicall3: Address
  calls: EthCall[]
  blockNumber: bigint
  /** The router's global request semaphore (C4-P6). Each CHUNK holds one permit — the whole point:
   * a rate limiter (and the semaphore itself) charges one aggregate3 as one call. */
  semaphore?: Semaphore | undefined
  signal?: AbortSignal | undefined
}

/**
 * Issues `calls` (block-pinned) through Multicall3 `aggregate3` with `allowFailure: true`, chunked
 * at {@link MULTICALL_CHUNK}, and returns one slot per input call, in input order:
 *
 *  - `Hex` — the sub-call succeeded; raw return data, exactly what a direct `ethCall` would return.
 *    (A sub-call to an address with no code is a SUCCESS with `0x` — identical to direct
 *    `eth_call` — so a caller's decode failure means the same thing on both paths.)
 *  - {@link InnerCallFailure} — the EVM rejected the sub-call; execution-channel by construction,
 *    revert data attached when the revert carried any.
 *  - `TransportError` (incl. `NodeStateError`) — the chunk's OUTER call failed in the transport /
 *    node-state channel, replicated across every slot the chunk carried. Coarser granularity than
 *    per-call, deliberately: nothing was learned about ANY of those calls, and since transport
 *    failures are never negative-cached (they only make the search `rpc-degraded`), marking a whole
 *    chunk's candidates transport-failed can never poison anything — the cost is precision in a
 *    report axis that already means "retry / distrust completeness".
 *  - `AbortedCallError` — the chunk was never sent (the signal fired first, checked by `ethCall`
 *    with the permit in hand); replicated across the chunk's slots so each candidate gets the
 *    standard never-attempted treatment.
 *
 * AN OUTER FAILURE THE EXECUTION CHANNEL CLAIMS IS NOT BELIEVED. `aggregate3` with
 * `allowFailure: true` at a code-verified address does not revert for anything an inner call did,
 * so an outer execution-shaped failure (or outer return data that does not decode as `Result[]`, or
 * a result count that disagrees with the chunk) is an aggregator/provider anomaly, not evidence
 * about any route. It is wrapped in `TransportError` — the conservative direction: an inconclusive
 * (`rpc-degraded`) search and no negative-cache writes — rather than fanned out as N fabricated
 * on-chain reverts, which is exactly the C4-H1 failure mode with a new spelling.
 *
 * BUT IT IS ASKED AGAIN, SMALLER, FIRST. Before writing off a chunk, an outer failure that is
 * DETERMINISTIC and about the envelope — the node's `eth_call` gas cap, or an execution-shaped
 * refusal — makes the chunk split in half and both halves retry (see {@link shouldBisect}). Written
 * off instead, one such failure costs the whole chunk permanently, because the engine's retry
 * re-sends the identical oversized batch; that is exactly how a warm index on a wide mainnet pair
 * turned a perfectly answerable round into a `rpc-degraded` search (C4-T14, found by
 * `integration/swap.fork.test.ts`). Transport failures and aborts are NOT re-asked — answering "you
 * are sending too much" or "the caller gave up" with more requests is the one direction that makes
 * things worse. The write-off above is what a bisected chunk lands on when it reaches size 1.
 *
 * SENDER- AND VALUE-CARRYING CALLS ARE NEVER AGGREGATED. `aggregate3` cannot forward a per-call
 * `from` (inner `msg.sender` is Multicall3) or `value`; a call that sets either is dispatched as an
 * individual `ethCall` — same slot semantics, same channel classification as the per-call path —
 * so the spec's "never Multicall3 for sender-sensitive quotes" holds mechanically, by the shape of
 * the call, not by callers remembering. (No quote call this package builds today sets either; see
 * the fork-verified sender-insensitivity note in `integration/adversarial.fork.test.ts`.)
 */
export async function aggregateCalls(args: AggregateCallsArgs): Promise<Array<Hex | Error>> {
  const { client, multicall3, calls, blockNumber, semaphore, signal } = args
  const results: Array<Hex | Error> = new Array(calls.length)

  const aggregatable: number[] = []
  const individual: number[] = []
  for (let i = 0; i < calls.length; i++) {
    ;(calls[i]!.from === undefined && calls[i]!.value === undefined ? aggregatable : individual).push(i)
  }

  const chunks: number[][] = []
  for (let i = 0; i < aggregatable.length; i += MULTICALL_CHUNK) chunks.push(aggregatable.slice(i, i + MULTICALL_CHUNK))

  // Neither runner below ever throws — every outcome is written into its slot — so this Promise.all
  // is a join, not a failure channel, and one chunk's outage can never take down the others (the
  // same per-slot isolation `mapConcurrent` gives the per-call path).
  await Promise.all([
    mapConcurrent(chunks, semaphore ?? DEFAULT_CONCURRENCY, async (chunk) => {
      await runChunk(chunk)
    }),
    mapConcurrent(individual, semaphore ?? DEFAULT_CONCURRENCY, async (i) => {
      try {
        results[i] = await ethCall(client, calls[i]!, blockNumber, semaphore, signal)
      } catch (err) {
        results[i] = err instanceof Error ? err : new Error(String(err))
      }
    }),
  ])
  return results

  async function runChunk(chunk: number[]): Promise<void> {
    const data = encodeFunctionData({
      abi: MULTICALL3_ABI,
      functionName: 'aggregate3',
      args: [chunk.map((i) => ({ target: calls[i]!.to, allowFailure: true, callData: calls[i]!.data }))],
    })

    let raw: Hex
    try {
      raw = await ethCall(client, { to: multicall3, data }, blockNumber, semaphore, signal)
    } catch (err) {
      if (chunk.length > 1 && shouldBisect(err)) {
        const half = Math.ceil(chunk.length / 2)
        await Promise.all([runChunk(chunk.slice(0, half)), runChunk(chunk.slice(half))])
        return
      }
      const shared = coarsenOuterFailure(err, chunk.length)
      for (const i of chunk) results[i] = shared
      return
    }

    let decoded: readonly { success: boolean; returnData: Hex }[]
    try {
      decoded = decodeFunctionResult({ abi: MULTICALL3_ABI, functionName: 'aggregate3', data: raw })
      if (decoded.length !== chunk.length) {
        throw new Error(`aggregate3 returned ${decoded.length} results for ${chunk.length} calls`)
      }
    } catch (err) {
      const shared = coarsenOuterFailure(err, chunk.length)
      for (const i of chunk) results[i] = shared
      return
    }

    decoded.forEach((result, j) => {
      results[chunk[j]!] = result.success
        ? result.returnData
        : // aggregate3 spells "reverted with no data" as `0x` — normalized to `undefined` here so the
          // amount-independence read (`failure.revertData === undefined`) matches `revertDataOf`'s
          // zero-length rule on the per-call path exactly.
          new InnerCallFailure(result.returnData === '0x' ? undefined : result.returnData)
    })
  }
}

/**
 * Classifies a failed OUTER aggregate3 call into the one slot value shared across its chunk. An
 * abort and a real transport/node-state failure pass through as themselves (each already carries
 * the semantics every counting site keys on); anything else — an execution-shaped outer failure, or
 * outer bytes that would not decode — becomes a `TransportError`, per the header above: an anomaly
 * of the aggregation machinery says nothing about the chunk's calls, and the only safe direction to
 * be wrong in is the one that never fabricates on-chain evidence and never negative-caches.
 */
/**
 * Should a failed OUTER aggregate3 be RE-ASKED as two halves rather than written off?
 *
 * Yes for exactly two shapes, and the reasoning is the same one for both: the failure is
 * DETERMINISTIC and about the ENVELOPE, so re-sending the identical batch can only fail identically,
 * while a smaller batch has a real chance — and a batch of one cannot have the problem at all.
 *
 *  1. {@link isRequestTooLarge} — the node ran out of the gas an `eth_call` may burn. This is the
 *     one that brought the fix: on a wide mainnet pair with a warm index, ~39 v3/v4 quoter
 *     simulations in one envelope exceed anvil's cap and the WHOLE round is lost, deterministically
 *     and forever (the retry re-sends the same oversized batch). It arrives wearing the transport
 *     channel on anvil and the execution channel on geth, which is exactly why the predicate is a
 *     shape read rather than a channel test.
 *  2. An execution-channel outer failure. `aggregate3` with `allowFailure: true`, at an address this
 *     package verified has code, does not revert for anything an inner call did — so this is either
 *     case 1 in geth's dialect or one genuinely poisonous inner call. Halving isolates which, and at
 *     size 1 the answer lands on the single call that caused it instead of on all 50.
 *
 * NO ON THE TRANSPORT CHANNEL OTHERWISE, which is the important half. A 429, a dropped socket, a
 * gateway timeout — these say the provider is under pressure, and the answer to "you are sending too
 * much" is emphatically not to turn one request into two. Those keep {@link coarsenOuterFailure}'s
 * write-off, and the search reports `rpc-degraded` as it always has.
 *
 * NO ON AN ABORT, for the same reason `ethCall` checks the signal with the permit in hand: the
 * search is over, and bisecting would put requests on the wire that the caller has already said it
 * no longer wants.
 *
 * TERMINATION is structural rather than a depth budget: every recursion strictly halves a chunk that
 * `chunk.length > 1` guarantees is at least 2, so the worst case is ceil(log2(MULTICALL_CHUNK)) ≈ 6
 * levels and at most 2N-1 envelopes for an N-call chunk — and only ever on a shape that would
 * otherwise have lost all N. No new constant, and nothing to keep in sync with `MULTICALL_CHUNK`.
 */
function shouldBisect(err: unknown): boolean {
  if (err instanceof AbortedCallError) return false
  if (isRequestTooLarge(err)) return true
  return classifyRpcError(err) === 'execution'
}

function coarsenOuterFailure(err: unknown, chunkSize: number): Error {
  if (err instanceof AbortedCallError) return err
  if (err instanceof TransportError) return err
  return new TransportError(
    `aggregate3 wrapping ${chunkSize} calls failed as a whole — an aggregator anomaly, not evidence about any inner call`,
    { cause: err },
  )
}
