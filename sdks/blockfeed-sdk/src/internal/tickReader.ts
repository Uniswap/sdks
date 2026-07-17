import type { Hex, PublicClient } from 'viem'

import { MULTICALL3_HELPER_ABI } from '../abis'
import { DEFAULT_MAX_CALLS_PER_CHUNK, MULTICALL3_ADDRESS } from '../constants'
import { TickFailedError } from '../errors'
import type { CallResult, ContractCall, TickIdentity } from '../types'

import { type RawContract, multicallAllowFailure } from './multicall'

/** One atomic tick: the identity anchored to it plus every keyed call's result. */
export interface TickReadResult {
  identity: Omit<TickIdentity, 'chainId'>
  results: Record<string, CallResult>
}

/** The three identity self-calls, in the order they occupy at the head of the batch. */
const IDENTITY_FUNCTIONS = ['getBlockNumber', 'getLastBlockHash', 'getCurrentBlockTimestamp'] as const

/**
 * Execute one atomic tick read: a single Multicall3 `aggregate3` batch whose first three calls are
 * Multicall3's own identity helpers, followed by the request's keyed calls in deterministic
 * (sorted-key) order. Large batches are split into sequential chunks bounded by `maxCallsPerChunk`;
 * the identity calls live only in the first chunk and all chunks share that identity.
 *
 * `keyed` is the reads to execute this tick; its keys are already namespaced by the engine
 * (`${sourceKey}:${callKey}`).
 *
 * @throws {TickFailedError} if any identity call fails, or any non-speculative keyed call fails.
 */
export async function readTick(
  client: Pick<PublicClient, 'multicall'>,
  keyed: Record<string, ContractCall>,
  opts?: { maxCallsPerChunk?: number }
): Promise<TickReadResult> {
  const maxCallsPerChunk = opts?.maxCallsPerChunk ?? DEFAULT_MAX_CALLS_PER_CHUNK

  // The three Multicall3 identity self-calls (MULTICALL3_HELPER_ABI) head the batch so block number,
  // parent hash, and timestamp come from the exact same `aggregate3` EVM call as the state below them
  // — this bundling is what makes a tick atomic.
  const identityContracts: RawContract[] = IDENTITY_FUNCTIONS.map((functionName) => ({
    address: MULTICALL3_ADDRESS,
    abi: MULTICALL3_HELPER_ABI,
    functionName,
    args: [],
  }))

  // Deterministic ordering: identity calls first, then keyed calls sorted by key.
  const sortedKeys = Object.keys(keyed).sort()
  const keyedContracts: RawContract[] = sortedKeys.map((key) => {
    const call = keyed[key] as ContractCall
    return { address: call.address, abi: call.abi, functionName: call.functionName, args: call.args }
  })

  const contracts = [...identityContracts, ...keyedContracts]

  // Chunk sequentially. Because the identity calls head the array, simple in-order chunking keeps
  // them in the first chunk only. Chunks run one at a time to bound provider pressure.
  //
  // `batchSize: 0` disables viem's internal calldata-size re-batching (default splits at ~1KB). That
  // internal split would issue multiple eth_calls for one chunk, breaking the identity/state atomicity
  // that is THE core invariant here — every result in a chunk MUST come from one aggregate3 call.
  const results: CallResult[] = []
  for (let i = 0; i < contracts.length; i += maxCallsPerChunk) {
    const chunk = contracts.slice(i, i + maxCallsPerChunk)
    const chunkResults = await multicallAllowFailure(client, chunk, { batchSize: 0 })
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
    const raw = keyedResults[idx] as CallResult
    if (raw.status === 'success') {
      resultsByKey[key] = { status: 'success', result: raw.result }
      return
    }
    if (keyed[key]?.allowFailure === true) {
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
