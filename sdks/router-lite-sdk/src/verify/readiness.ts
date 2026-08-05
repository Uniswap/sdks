import type { Address, Hex, PublicClient } from 'viem'
import { decodeFunctionResult, encodeFunctionData, isAddressEqual } from 'viem'

import { DEFAULT_CONCURRENCY } from '../constants'
import { TransportError } from '../errors'
import { ERC20_ABI, PERMIT2_ABI } from '../internal/abis'
import { classifyRpcError, ethCall, mapConcurrent } from '../internal/rpc'
import type { Semaphore } from '../internal/rpc'
import type { CurrencyRef, ExecutionRequirement, Permit2PermitSingle } from '../types'

// ---------------------------------------------------------------------------
// Readiness checks — read-only preflight over balances/allowances, answering
// "what must the trader do before this plan can execute" without ever
// throwing for a business outcome. A native `currencyIn` only needs a balance
// check (gas headroom is out of scope: `required` is exactly `amountIn`).
// An ERC-20 `currencyIn` needs three reads — `balanceOf`, the direct
// token->Permit2 allowance, and Permit2's own token->router allowance —
// dispatched together as a single bounded-concurrency batch so this never
// costs more round trips than one `mapConcurrent` call.
//
// A supplied `permit` that is valid (right token, right spender, amount
// covers `amountIn`, not expired/past its sig deadline) embeds the Permit2
// allowance in the swap calldata itself, so no on-chain Permit2 allowance is
// required in that case — the permit *is* the allowance. Address comparisons
// are case-insensitive throughout since callers may pass either casing.
//
// A read that errors ON CHAIN (a non-ERC20 token, a decode failure — surfaced
// by `mapConcurrent` as an `Error` in that slot) is treated conservatively as
// that check failing — never as licence to throw — so it fails safe (more
// requirements reported, never fewer).
//
// A read that fails in the TRANSPORT (`TransportError`: 429, timeout, dropped
// socket) is different in kind, and "fails safe" is the wrong instinct there.
// Coercing an unread balance to `0n` states `insufficient-balance available:
// 0n` AS FACT and fabricates approval requirements the trader may already
// satisfy — a *confident wrong* `needs-action` that also short-circuits
// preflight, so nothing downstream ever notices. Such a read contributes NO
// requirement; instead the whole result is flagged `degraded`, and the caller
// (`search/waves.ts`) refuses to promise `needs-action` from a requirement set
// it knows is incomplete.
// ---------------------------------------------------------------------------

export type CheckReadinessArgs = {
  client: Pick<PublicClient, 'request'>
  trader: Address
  currencyIn: CurrencyRef
  amountIn: bigint
  permit2: Address
  router: Address
  permit?: Permit2PermitSingle
  blockNumber: bigint
  blockTimestamp: bigint
  /** The router's global request semaphore (C4-P6) — see `quote/quote.ts#QuoteCandidatesArgs.semaphore`. */
  semaphore?: Semaphore | undefined
}

async function getNativeBalance(
  client: Pick<PublicClient, 'request'>,
  trader: Address,
  blockNumber: bigint,
  semaphore?: Semaphore,
): Promise<bigint> {
  const blockTag = `0x${blockNumber.toString(16)}` as Hex
  await semaphore?.acquire()
  try {
    const result = (await client.request({ method: 'eth_getBalance', params: [trader, blockTag] } as any)) as Hex
    return BigInt(result)
  } finally {
    semaphore?.release()
  }
}

/**
 * A supplied permit embeds the Permit2 allowance only if it actually authorizes this trade: same
 * token, same spender (the router), enough amount, and not expired/past its signature deadline as
 * of `blockTimestamp` (the pinned block used everywhere else in this check, not wall-clock time).
 */
function isPermitValid(permit: Permit2PermitSingle, token: Address, router: Address, amountIn: bigint, blockTimestamp: bigint): boolean {
  // viem's `isAddressEqual` replaces a local `addressesEqual` helper that did the same lowercased
  // comparison (R3). Every address reaching here is already shape-validated — the permit's token and
  // the router by `router.ts#validateSwapRequest`, `token` by the same request path — which is what
  // makes `isAddressEqual` (which throws on malformed input) the right call rather than a hazard.
  if (!isAddressEqual(permit.details.token, token)) return false
  if (!isAddressEqual(permit.spender, router)) return false
  if (permit.details.amount < amountIn) return false
  if (permit.sigDeadline <= blockTimestamp) return false
  if (BigInt(permit.details.expiration) <= blockTimestamp) return false
  return true
}

type Erc20ReadKind = 'balance' | 'erc20Allowance' | 'permit2Allowance'
type Erc20ReadResult = bigint | readonly [bigint, number, number]

async function readErc20State(
  client: Pick<PublicClient, 'request'>,
  kind: Erc20ReadKind,
  token: Address,
  trader: Address,
  permit2: Address,
  router: Address,
  blockNumber: bigint,
  semaphore?: Semaphore,
): Promise<Erc20ReadResult> {
  if (kind === 'balance') {
    const data = encodeFunctionData({ abi: ERC20_ABI, functionName: 'balanceOf', args: [trader] })
    const returnData = await ethCall(client, { to: token, data }, blockNumber, semaphore)
    return decodeFunctionResult({ abi: ERC20_ABI, functionName: 'balanceOf', data: returnData })
  }
  if (kind === 'erc20Allowance') {
    const data = encodeFunctionData({ abi: ERC20_ABI, functionName: 'allowance', args: [trader, permit2] })
    const returnData = await ethCall(client, { to: token, data }, blockNumber, semaphore)
    return decodeFunctionResult({ abi: ERC20_ABI, functionName: 'allowance', data: returnData })
  }
  const data = encodeFunctionData({ abi: PERMIT2_ABI, functionName: 'allowance', args: [trader, token, router] })
  const returnData = await ethCall(client, { to: permit2, data }, blockNumber, semaphore)
  return decodeFunctionResult({ abi: PERMIT2_ABI, functionName: 'allowance', data: returnData })
}

/**
 * What the readiness reads established.
 *
 * `degraded` means at least one read never got an answer (transport failure), so `requirements` is
 * known-INCOMPLETE and known-uninterpretable as "do exactly these things and the swap will work".
 * The missing check contributes no requirement — a fabricated one, stated with a hard number
 * (`available: 0n`), is worse than a reported gap in knowledge.
 */
export type ReadinessResult = { requirements: ExecutionRequirement[]; degraded: boolean }

/** True when this slot failed in the transport channel rather than on-chain — `NodeStateError`
 * (a node that could not serve the pinned block) included, since it extends `TransportError`.
 * Callers must neither trust the value nor invent one for it. */
function isTransportFailure(result: unknown): boolean {
  return result instanceof TransportError
}

/**
 * Computes the {@link ExecutionRequirement}s the trader still needs to satisfy before `amountIn` of
 * `currencyIn` can move, as of `blockNumber`/`blockTimestamp`. Never throws for a business outcome —
 * a read that fails *on chain* just widens the returned set rather than propagating, while a read
 * that fails in the *transport* sets `degraded` and adds nothing (see the module header).
 */
export async function checkReadiness(args: CheckReadinessArgs): Promise<ReadinessResult> {
  const { client, trader, currencyIn, amountIn, permit2, router, permit, blockNumber, blockTimestamp, semaphore } = args

  if (currencyIn === 'native') {
    let available: bigint
    try {
      available = await getNativeBalance(client, trader, blockNumber, semaphore)
    } catch (err) {
      // `eth_getBalance` goes out raw (not through `ethCall`), so classify it here rather than
      // looking for a `TransportError` that was never constructed. `!== 'execution'` covers the
      // node-state channel too (a replica that cannot serve the pinned block): an unread balance is
      // an unread balance whichever way the node failed to read it.
      if (classifyRpcError(err) !== 'execution') return { requirements: [], degraded: true }
      available = 0n
    }
    if (available < amountIn)
      return { requirements: [{ kind: 'insufficient-balance', token: currencyIn, required: amountIn, available }], degraded: false }
    return { requirements: [], degraded: false }
  }

  const token = currencyIn

  const kinds: Erc20ReadKind[] = ['balance', 'erc20Allowance', 'permit2Allowance']
  const results = await mapConcurrent(kinds, semaphore ?? DEFAULT_CONCURRENCY, (kind) =>
    readErc20State(client, kind, token, trader, permit2, router, blockNumber, semaphore),
  )
  const balanceResult = results[0] as bigint | Error
  const erc20AllowanceResult = results[1] as bigint | Error
  const permit2AllowanceResult = results[2] as readonly [bigint, number, number] | Error

  const requirements: ExecutionRequirement[] = []
  let degraded = false

  if (isTransportFailure(balanceResult)) {
    degraded = true
  } else {
    const available = balanceResult instanceof Error ? 0n : balanceResult
    if (available < amountIn) {
      requirements.push({ kind: 'insufficient-balance', token, required: amountIn, available })
    }
  }

  if (isTransportFailure(erc20AllowanceResult)) {
    degraded = true
  } else {
    const erc20Allowance = erc20AllowanceResult instanceof Error ? 0n : erc20AllowanceResult
    if (erc20Allowance < amountIn) {
      requirements.push({ kind: 'erc20-approval', token, spender: permit2, minimumAmount: amountIn })
    }
  }

  const permitCovers = permit !== undefined && isPermitValid(permit, token, router, amountIn, blockTimestamp)
  if (!permitCovers) {
    if (isTransportFailure(permit2AllowanceResult)) {
      degraded = true
    } else {
      const permit2Insufficient =
        permit2AllowanceResult instanceof Error ||
        permit2AllowanceResult[0] < amountIn ||
        BigInt(permit2AllowanceResult[1]) <= blockTimestamp
      if (permit2Insufficient) {
        requirements.push({ kind: 'permit2-allowance', token, spender: router, minimumAmount: amountIn })
      }
    }
  }

  return { requirements, degraded }
}
