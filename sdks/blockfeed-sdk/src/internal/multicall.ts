import type { Address, PublicClient } from 'viem'

import type { CallResult } from '../types'

/**
 * A single contract read shaped for viem `multicall`. The `abi` is deliberately `unknown` (rather than
 * a typed viem `Abi`): the engine and discovery assemble heterogeneous reads whose ABIs are only known
 * at each call site, so the shared batch shape erases the ABI type. This is the ONE place the
 * corresponding `as never` cast into viem's overloaded `multicall` signature lives.
 */
export interface RawContract {
  address: Address
  abi: unknown
  functionName: string
  args: readonly unknown[]
}

/**
 * Execute one `multicall({ allowFailure: true })`, returning viem's per-call {@link CallResult} outcomes
 * in input order. Empty input issues no RPC and returns `[]`. `opts.batchSize` is forwarded verbatim
 * when provided (e.g. `0` to disable viem's internal calldata re-batching); omitted otherwise so viem's
 * default applies. This helper is the single home for the `as never` cast that bridges our erased
 * {@link RawContract} shape to viem's heavily-overloaded `multicall` signature.
 */
export async function multicallAllowFailure(
  client: Pick<PublicClient, 'multicall'>,
  contracts: RawContract[],
  opts?: { batchSize?: number }
): Promise<CallResult[]> {
  if (contracts.length === 0) return []
  const args: Record<string, unknown> = { contracts, allowFailure: true }
  if (opts?.batchSize !== undefined) args.batchSize = opts.batchSize
  return (await client.multicall(args as never)) as CallResult[]
}

/**
 * Scatter/gather multicall: issue ONLY the defined calls (skipping `undefined` slots) in a single
 * `multicall`, then return results re-aligned to the input array's indexes — an `undefined` input slot
 * yields an `undefined` result slot. Lets callers keep a parallel `Array<RawContract | undefined>`
 * (one entry per logical item, some un-issuable) without hand-rolling the index bookkeeping.
 */
export async function multicallSparse(
  client: Pick<PublicClient, 'multicall'>,
  calls: Array<RawContract | undefined>
): Promise<Array<CallResult | undefined>> {
  const defined: RawContract[] = []
  const originalIndex: number[] = []
  calls.forEach((call, i) => {
    if (call) {
      defined.push(call)
      originalIndex.push(i)
    }
  })
  const results = await multicallAllowFailure(client, defined)
  const out: Array<CallResult | undefined> = new Array(calls.length).fill(undefined)
  originalIndex.forEach((idx, k) => {
    out[idx] = results[k]
  })
  return out
}
