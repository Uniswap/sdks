import type { Address, Hex, PublicClient } from 'viem'

import type { Semaphore } from '../internal/rpc'
import { classifyRpcError, revertDataOf } from '../internal/rpcErrors'
import type { EncodedTx } from '../types'

// ---------------------------------------------------------------------------
// Preflight verification — dry-run a transaction via `eth_call` at a pinned
// block to check whether it would execute successfully or revert, capturing
// revert data if present and never throwing.
//
// The revert data (if any) is preserved verbatim from the error and returned
// in the result; it is never decoded or interpreted — that's the caller's job.
//
// What IS classified is the error *channel*: a revert is an authoritative
// on-chain answer ("this tx would fail"), while a 429/timeout/dropped socket
// says nothing at all about the transaction. Collapsing the two into a single
// `{ ok: false }` is what let a provider hiccup during verification be
// reported as a confident `no-route`; the caller (`search/waves.ts`) needs
// them apart to mark such a route `unverified` instead of `failed`. This is
// still not revert-reason interpretation — the reason stays opaque.
// ---------------------------------------------------------------------------

export type PreflightResult =
  | { ok: true }
  /** The node executed the call and the EVM rejected it. Authoritative: this tx would not succeed. */
  | { ok: false; kind: 'reverted'; revertData?: Hex }
  /**
   * The call never got an on-chain answer. Says nothing about the tx. Two shapes land here and are
   * deliberately reported as one: the transport proper (HTTP/timeout/rate limit), and a node that
   * could not serve the pinned block (`header not found`, `missing trie node`, a lagging replica
   * behind a load balancer). The latter used to be classified `reverted` — a fabricated
   * authoritative verdict from a call that never executed — which is the C4-H1 bug.
   */
  | { ok: false; kind: 'transport' }

/**
 * Executes a dry-run of the encoded transaction at a specific block, returning success, an
 * authoritative revert (with any revert data present in the error, verbatim), or a transport
 * failure. Never throws.
 *
 * @param client A viem PublicClient (or stub) with a `request` method
 * @param tx The encoded transaction to simulate
 * @param trader The address to simulate as the caller (from field)
 * @param blockNumber The block at which to simulate
 * @param semaphore The router's global request semaphore (C4-P6), acquired around the `eth_call`
 *   below and released however it settles — optional so direct unit tests need not construct one;
 *   every real search always supplies `ctx.semaphore` (see `search/leader.ts#verifyLeader`).
 * @returns Promise resolving to a preflight result: success, `reverted` (with optional revert data), or `transport`
 */
export async function preflightTx(
  client: Pick<PublicClient, 'request'>,
  tx: EncodedTx,
  trader: Address,
  blockNumber: bigint,
  semaphore?: Semaphore,
): Promise<PreflightResult> {
  try {
    const transaction: { to: Address; data: Hex; from?: Address; value?: Hex } = {
      to: tx.to,
      data: tx.data,
    }

    // Include from (trader) and value only if they have non-zero values
    transaction.from = trader
    if (tx.value > 0n) {
      transaction.value = `0x${tx.value.toString(16)}` as Hex
    }

    const blockTag = `0x${blockNumber.toString(16)}` as Hex

    // Issue the raw eth_call request
    await semaphore?.acquire()
    try {
      await client.request({ method: 'eth_call', params: [transaction, blockTag] } as any)
    } finally {
      semaphore?.release()
    }

    // Any successful response (including empty return data) means success
    return { ok: true }
  } catch (err) {
    // A transport failure is not a verdict on the transaction — the caller must not fail the route
    // over it (see `search/waves.ts`'s `verifyLeader`). Neither is a node that could not serve the
    // pinned block: `!== 'execution'` rather than `=== 'transport'` so the node-state channel can
    // never be laundered into the `reverted` branch below and read as revert-data-free rejection.
    if (classifyRpcError(err) !== 'execution') return { ok: false, kind: 'transport' }
    // Revert data comes out of `internal/rpcErrors.ts`'s ONE cause-chain walker — the same one
    // `classifyRpcError` just used, and the same one `quote/quote.ts` reads for its
    // amount-independence rule. This file used to keep a third, weaker copy: it looked only one
    // level down the `cause` chain, never stepped into geth's nested `data.data`, and accepted a
    // zero-length `'0x'` as if it were payload. Against a real geth node — whose revert arrives as
    // `{ cause: { data: { data: '0x…' } } }` — that copy found nothing, so `RankedRoute.revertData`
    // was empty for the leader in exactly the case a caller wants the reason bytes, and `'0x'` was
    // reported as data whenever the node reverted without any.
    const revertData = revertDataOf(err)
    return { ok: false, kind: 'reverted', ...(revertData !== undefined && { revertData }) }
  }
}
