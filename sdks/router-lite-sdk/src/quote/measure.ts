import type { Address, Hex, PublicClient } from 'viem'

import { DEFAULT_CONCURRENCY } from '../constants'
import { AbortedCallError, TransportError } from '../errors'
import { aggregateCalls, InnerCallFailure, MULTICALL_CHUNK } from '../internal/multicall'
import { ethCall, mapConcurrent } from '../internal/rpc'
import type { Semaphore } from '../internal/rpc'
import { revertDataOf } from '../internal/rpcErrors'
import type { ProtocolModule } from '../protocols/types'
import type { ChainManifest, CurrencyRef, DecodedQuote, PoolRef, Protocol, QuoteCall } from '../types'

// ---------------------------------------------------------------------------
// Measurement — the one place a quote `eth_call` is dispatched.
//
// A ROUND (`runQuoteRound`) is the transport half: N encoded calls in, N slots
// out, block-pinned, either one `eth_call` each or chunked through `aggregate3`.
// It is deliberately vocabulary-free — every slot is a `DecodedQuote` or an
// `Error` — so the two dispatch paths stay interchangeable and only one place
// has to read the difference (`isAmountIndependentFailure`).
//
// A MEASUREMENT (`measureLegs`) is the engine's half: one pool, one direction,
// one amount, one {@link LegOutcome}. It owns the encode and the classification
// of a round's slots into that outcome vocabulary; nothing above it touches an
// `Error`, and nothing below it knows what a leg is.
// ---------------------------------------------------------------------------

export type RunRoundArgs = {
  client: Pick<PublicClient, 'request'>
  /** One entry per call: the encoded quote, or the `Error` its encoding threw. Encoding happens at
   * the caller under {@link encodeOr} rather than inside the dispatch workers, because the multicall
   * path holds a whole round's calls at once — but "one bad call never takes down the batch" is a
   * property of the ROUND, not of a dispatch strategy, so an encode failure travels as that call's
   * own slot. */
  calls: Array<QuoteCall | Error>
  blockNumber: bigint
  semaphore?: Semaphore | undefined
  signal?: AbortSignal | undefined
  multicall3?: Address | undefined
}

/** `encodeQuote`, with a throw demoted to the call's own slot — see {@link RunRoundArgs.calls}. */
export function encodeOr(encode: () => QuoteCall): QuoteCall | Error {
  try {
    return encode()
  } catch (err) {
    return err instanceof Error ? err : new Error(String(err))
  }
}

/**
 * Executes one quoting round — every `QuoteCall` in `calls`, block-pinned — and returns one slot per
 * call, in order: the decoded amount, or the `Error` that stopped it. THE TWO DISPATCH PATHS PRODUCE
 * THE SAME SLOT VOCABULARY, which is what lets every caller's classification stay single:
 *
 *  - `multicall3` absent (no deployment on this chain, or a caller below the router facade that
 *    never probed one): one `ethCall` per call under the shared semaphore.
 *  - `multicall3` present (`router.ts#resolveMulticall3` found code there): the round goes through
 *    `aggregate3` (`internal/multicall.ts#aggregateCalls`, chunked, one permit per chunk). An inner
 *    failure arrives as {@link InnerCallFailure} instead of a thrown provider error — see
 *    {@link isAmountIndependentFailure} for the one place that difference is read.
 *
 * A decode failure is a plain `Error` slot on BOTH paths (aggregate3 returns success + `0x` for a
 * call to a codeless address, exactly as a direct `eth_call` does — study-verified), so v2's
 * pool-absent shape (`getReserves()` where no pair exists) keeps its accounting either way.
 */
export async function runQuoteRound(args: RunRoundArgs): Promise<Array<DecodedQuote | Error>> {
  const { client, calls, blockNumber, semaphore, signal, multicall3 } = args

  if (multicall3 === undefined) {
    return mapConcurrent(calls, semaphore ?? DEFAULT_CONCURRENCY, async (quoteCall) => {
      // Thrown here so `mapConcurrent` captures an encode failure exactly as it captured the throw
      // when encoding ran inside this worker.
      if (quoteCall instanceof Error) throw quoteCall
      const returnData = await ethCall(client, quoteCall.call, blockNumber, semaphore, signal)
      return quoteCall.decode(returnData)
    })
  }

  const live = calls.flatMap((quoteCall, i) => (quoteCall instanceof Error ? [] : [{ quoteCall, i }]))
  const raw = await aggregateCalls({
    client,
    multicall3,
    calls: live.map(({ quoteCall }) => quoteCall.call),
    blockNumber,
    semaphore,
    signal,
  })
  const results: Array<DecodedQuote | Error> = calls.map((quoteCall) =>
    quoteCall instanceof Error ? quoteCall : new Error('unreachable: live slot never written'),
  )
  live.forEach(({ quoteCall, i }, j) => {
    const slot = raw[j]!
    if (slot instanceof Error) {
      results[i] = slot
      return
    }
    try {
      results[i] = quoteCall.decode(slot)
    } catch (err) {
      results[i] = err instanceof Error ? err : new Error(String(err))
    }
  })
  return results
}

/**
 * Whether an execution-channel quote failure is the amount-independent, pool-absent shape — the only
 * kind a caller may negative-cache (C4-H3). "Reverted with NO data" has two spellings, one per
 * dispatch path: an {@link InnerCallFailure} carries the sub-call's revert bytes on `revertData`
 * directly off aggregate3's decoded `Result` (never through `classifyRpcError` — it was constructed,
 * not classified), while a per-call revert is a thrown provider error whose bytes `revertDataOf`
 * digs out of the cause chain. Same question, asked in one place so the two can never drift.
 */
export function isAmountIndependentFailure(err: Error): boolean {
  if (err instanceof InnerCallFailure) return err.revertData === undefined
  return revertDataOf(err) === undefined
}

/**
 * One pool priced in one direction at one amount — the unit of work the engine dispatches.
 *
 * `key` is the caller's own `search/state.ts#legKey`, carried through untouched and echoed on the
 * outcome: this executor neither computes nor dedupes keys (the pump owns both, since only it knows
 * what is already measured or in flight), it only guarantees the key comes back attached to the
 * right answer.
 */
export type LegRequest = {
  key: string
  pool: PoolRef
  currencyIn: CurrencyRef
  currencyOut: CurrencyRef
  amountIn: bigint
  /** v4 only: the request-scoped hook data for this pool, which the caller keys per pool — one value
   * per pool per search, so it never varies within a `key` and takes no part in leg identity. It
   * must be threaded HERE and not at composition: this is where the quote is encoded, and a hooked
   * pool quoted without its hook data is priced against a call the swap will not make. */
  hookData?: Hex
}

/**
 * What measuring one leg established. The four arms are the four evidentiary states, and keeping
 * them apart is the point:
 *
 *  - `success` — the chain priced it. `gasEstimate` is present only when the protocol's quoter
 *    reports one (v3/v4 do; v2's local reserve math does not).
 *  - `reverted` — execution-channel evidence: this pool cannot price this leg at this block.
 *    `amountIndependent` (see {@link isAmountIndependentFailure}) says whether that is a fact about
 *    the pool's existence — safe to remember — or a reason that may depend on the amount asked for.
 *  - `transport` — evidence about the PROVIDER (429, timeout, dropped socket, a node that could not
 *    serve the pinned block) and none about the pool. Never negative-cacheable, and the reason a
 *    search reports itself degraded rather than authoritative.
 *  - `unattempted` — the call was never sent (the signal fired while it queued for a permit). Not
 *    attempted, not failed, and emphatically not the provider's fault.
 */
export type LegOutcome =
  | { key: string; kind: 'success'; amountOut: bigint; gasEstimate?: bigint }
  | { key: string; kind: 'reverted'; amountIndependent: boolean }
  | { key: string; kind: 'transport' }
  | { key: string; kind: 'unattempted' }

export type MeasureLegsArgs = {
  client: Pick<PublicClient, 'request'>
  modules: Record<Protocol, ProtocolModule>
  manifest: ChainManifest
  legs: LegRequest[]
  blockNumber: bigint
  /** The router's global request semaphore (C4-P6). Omitted (unit tests), calls go ungated. */
  semaphore?: Semaphore | undefined
  /** The chain's PROBED Multicall3 deployment, when the router found one — routes the round through
   * `aggregate3`. Omitted, the per-call path runs. See {@link runQuoteRound}. */
  multicall3?: Address | undefined
  signal?: AbortSignal | undefined
  /**
   * The chunk-granular delivery seam: present, the round is dispatched as concurrent
   * {@link MULTICALL_CHUNK}-sized groups (each exactly one `aggregate3` envelope on the multicall
   * path — the same wire shape `aggregateCalls`' own chunking produced, now settled independently),
   * and this is called once per group AS IT SETTLES, with that group's outcomes. A caller can
   * therefore act on the first envelope's answers while later envelopes are still in flight — the
   * measurement half of the design's chunk-arrival granularity (spec §3: knowledge lands at scan-
   * chunk cadence; prices land at envelope cadence).
   *
   * The RETURN VALUE IS UNCHANGED — every outcome, index-aligned — so an outcome delivered here is
   * seen twice by a caller that reads both. Dedup is the caller's job, by `key` (the pump's round
   * bookkeeping already owns exactly that). Absent, dispatch is one undivided round, byte-for-byte
   * as before.
   */
  onOutcomes?: ((outcomes: LegOutcome[]) => void) | undefined
}

/**
 * Measures every leg at `blockNumber` in ONE round, and returns one {@link LegOutcome} per input leg,
 * index-aligned — a total function over the input: every leg gets an answer, and no failure of any
 * kind escapes as a throw.
 *
 * This is the only place the new engine issues a quote `eth_call`, so it is also the only place an
 * `Error` is turned into evidence. An encode throw is that leg's own `reverted` slot (a plain
 * `Error` carries no revert data, so it reads amount-independent — the conservative reading for a
 * defect that is, by construction, about the pool's own shape rather than the amount).
 */
export async function measureLegs(args: MeasureLegsArgs): Promise<LegOutcome[]> {
  const { client, modules, manifest, legs, blockNumber, semaphore, multicall3, signal, onOutcomes } = args
  if (legs.length === 0) return []

  const calls = legs.map((leg) =>
    encodeOr(() =>
      modules[leg.pool.protocol].encodeQuote(
        [
          {
            pool: leg.pool,
            currencyIn: leg.currencyIn,
            currencyOut: leg.currencyOut,
            // Absent stays ABSENT rather than becoming an explicit `undefined` — `RouteLeg.hookData`
            // is an optional property under `exactOptionalPropertyTypes`.
            ...(leg.hookData !== undefined && { hookData: leg.hookData }),
          },
        ],
        leg.amountIn,
        manifest,
      ),
    ),
  )

  const toOutcome = (leg: LegRequest, result: DecodedQuote | Error): LegOutcome => {
    // Order is load-bearing: `AbortedCallError` is deliberately NOT a `TransportError`, and
    // `NodeStateError` deliberately IS one.
    if (result instanceof AbortedCallError) return { key: leg.key, kind: 'unattempted' }
    if (result instanceof TransportError) return { key: leg.key, kind: 'transport' }
    if (result instanceof Error) return { key: leg.key, kind: 'reverted', amountIndependent: isAmountIndependentFailure(result) }
    return {
      key: leg.key,
      kind: 'success',
      amountOut: result.amountOut,
      ...(result.gasEstimate !== undefined && { gasEstimate: result.gasEstimate }),
    }
  }

  /** One dispatch group: the legs at `indices`, sent as one `runQuoteRound` (one aggregate3 envelope
   * on the multicall path — an encode-failure slot travels inside its own group, so every group's
   * outcome batch is exactly its slice of the round). */
  const run = async (indices: number[]): Promise<LegOutcome[]> => {
    const results = await runQuoteRound({
      client,
      calls: indices.map((i) => calls[i]!),
      blockNumber,
      semaphore,
      signal,
      multicall3,
    })
    return indices.map((legIndex, j) => toOutcome(legs[legIndex]!, results[j]!))
  }

  if (onOutcomes === undefined) {
    return run(legs.map((_, i) => i))
  }

  // Chunk-granular dispatch: MULTICALL_CHUNK-sized groups, concurrently (the same shape
  // `aggregateCalls` gave the undivided round — its chunks already ran under `mapConcurrent`, and
  // every group here still holds one semaphore permit per envelope/call). Each group's outcomes are
  // delivered the moment IT settles; the return still carries all of them, index-aligned.
  const groups: number[][] = []
  for (let i = 0; i < legs.length; i += MULTICALL_CHUNK) {
    groups.push(legs.map((_, j) => j).slice(i, i + MULTICALL_CHUNK))
  }
  const all: LegOutcome[] = new Array<LegOutcome>(legs.length)
  await Promise.all(
    groups.map(async (group) => {
      const outcomes = await run(group)
      group.forEach((legIndex, j) => {
        all[legIndex] = outcomes[j]!
      })
      onOutcomes(outcomes)
    }),
  )
  return all
}
