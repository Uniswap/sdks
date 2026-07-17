import type { Hex, PublicClient } from 'viem'
import { parseAbi } from 'viem'

import { DEFAULT_MAX_CALLS_PER_CHUNK, MULTICALL3_ADDRESS } from '../constants'
import { TickFailedError } from '../errors'
import type { CallResult, SpeculativeCall, TickIdentity } from '../types'

/**
 * Minimal ABI for the three Multicall3 self-calls that anchor every tick's identity. Bundling them
 * as the first calls of the same `aggregate3` batch is what makes the read atomic: block number,
 * parent hash, and timestamp come from the exact same EVM call as the state below them.
 */
export const MULTICALL3_HELPER_ABI = parseAbi([
  'function getBlockNumber() view returns (uint256 blockNumber)',
  'function getLastBlockHash() view returns (bytes32 blockHash)',
  'function getCurrentBlockTimestamp() view returns (uint256 timestamp)',
])

/** The keyed reads to execute this tick. Keys are already namespaced by the engine (`${sourceKey}:${callKey}`). */
export interface TickReadRequest {
  keyed: Record<string, SpeculativeCall>
}

/** One atomic tick: the identity anchored to it plus every keyed call's result. */
export interface TickReadResult {
  identity: Omit<TickIdentity, 'chainId'>
  results: Record<string, CallResult>
}

/** The three identity self-calls, in the order they occupy at the head of the batch. */
const IDENTITY_FUNCTIONS = ['getBlockNumber', 'getLastBlockHash', 'getCurrentBlockTimestamp'] as const

/** viem-shaped per-call outcome from a multicall with `allowFailure: true`. */
type RawResult = { status: 'success'; result: unknown } | { status: 'failure'; error: Error }

interface BatchContract {
  address: string
  abi: unknown
  functionName: string
  args: readonly unknown[]
}

/**
 * Execute one atomic tick read: a single Multicall3 `aggregate3` batch whose first three calls are
 * Multicall3's own identity helpers, followed by the request's keyed calls in deterministic
 * (sorted-key) order. Large batches are split into sequential chunks bounded by `maxCallsPerChunk`;
 * the identity calls live only in the first chunk and all chunks share that identity.
 *
 * @throws {TickFailedError} if any identity call fails, or any non-speculative keyed call fails.
 */
export async function readTick(
  client: Pick<PublicClient, 'multicall'>,
  request: TickReadRequest,
  opts?: { maxCallsPerChunk?: number }
): Promise<TickReadResult> {
  const maxCallsPerChunk = opts?.maxCallsPerChunk ?? DEFAULT_MAX_CALLS_PER_CHUNK

  const identityContracts: BatchContract[] = IDENTITY_FUNCTIONS.map((functionName) => ({
    address: MULTICALL3_ADDRESS,
    abi: MULTICALL3_HELPER_ABI,
    functionName,
    args: [],
  }))

  // Deterministic ordering: identity calls first, then keyed calls sorted by key.
  const sortedKeys = Object.keys(request.keyed).sort()
  const keyedContracts: BatchContract[] = sortedKeys.map((key) => {
    const call = request.keyed[key] as SpeculativeCall
    return { address: call.address, abi: call.abi, functionName: call.functionName, args: call.args }
  })

  const contracts = [...identityContracts, ...keyedContracts]

  // Chunk sequentially. Because the identity calls head the array, simple in-order chunking keeps
  // them in the first chunk only. Chunks run one at a time to bound provider pressure.
  //
  // `batchSize: 0` disables viem's internal calldata-size re-batching (default splits at ~1KB). That
  // internal split would issue multiple eth_calls for one chunk, breaking the identity/state atomicity
  // that is THE core invariant here — every result in a chunk MUST come from one aggregate3 call.
  const results: RawResult[] = []
  for (let i = 0; i < contracts.length; i += maxCallsPerChunk) {
    const chunk = contracts.slice(i, i + maxCallsPerChunk)
    const chunkResults = (await client.multicall({
      contracts: chunk,
      allowFailure: true,
      batchSize: 0,
    } as never)) as RawResult[]
    // Defensive: a well-behaved aggregate3 returns exactly one result per call. A short return means the
    // atomic mapping is broken — fail the tick rather than mis-align keyed results.
    if (chunkResults.length < chunk.length) {
      throw new TickFailedError(
        `Tick read returned ${chunkResults.length} results for ${chunk.length} calls`,
        []
      )
    }
    results.push(...chunkResults)
  }

  // Rule 3: an identity-call failure invalidates the whole tick.
  const [blockNumberR, blockHashR, timestampR] = results
  const identityFailures = IDENTITY_FUNCTIONS.filter((_, idx) => results[idx]?.status === 'failure')
  if (identityFailures.length > 0) {
    const cause = [blockNumberR, blockHashR, timestampR].find((r) => r?.status === 'failure') as
      | { status: 'failure'; error: Error }
      | undefined
    throw new TickFailedError(
      `Tick identity read failed: ${identityFailures.join(', ')}`,
      [...identityFailures],
      cause?.error
    )
  }

  const identity: Omit<TickIdentity, 'chainId'> = {
    blockNumber: (blockNumberR as { status: 'success'; result: unknown }).result as bigint,
    parentBlockHash: (blockHashR as { status: 'success'; result: unknown }).result as Hex,
    timestamp: (timestampR as { status: 'success'; result: unknown }).result as bigint,
  }

  // Rules 4 & 5: map keyed outcomes back by key; a non-speculative failure fails the tick.
  const keyedResults = results.slice(IDENTITY_FUNCTIONS.length)
  const resultsByKey: Record<string, CallResult> = {}
  const failedKeys: string[] = []
  let firstFailure: Error | undefined

  sortedKeys.forEach((key, idx) => {
    const raw = keyedResults[idx] as RawResult
    if (raw.status === 'success') {
      resultsByKey[key] = { status: 'success', result: raw.result }
      return
    }
    if (request.keyed[key]?.allowFailure === true) {
      resultsByKey[key] = { status: 'failure', error: raw.error }
    } else {
      failedKeys.push(key)
      firstFailure ??= raw.error
    }
  })

  if (failedKeys.length > 0) {
    throw new TickFailedError(`Tick keyed read failed: ${failedKeys.join(', ')}`, failedKeys, firstFailure)
  }

  return { identity, results: resultsByKey }
}
