import type { Address, Hex, PublicClient } from 'viem'
import { decodeFunctionResult, encodeFunctionData, isAddress, isAddressEqual } from 'viem'

import { DEFAULT_CONCURRENCY } from '../constants'
import { AbortedCallError, TransportError } from '../errors'
import { ERC20_ABI, PERMIT2_ABI } from '../internal/abis'
import { ethCall, mapConcurrent } from '../internal/rpc'
import type { Semaphore } from '../internal/rpc'
import { classifyRpcError } from '../internal/rpcErrors'
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
// A read that fails ANY OTHER WAY — in the transport (429, timeout, dropped
// socket), in the node's own state (a replica that cannot serve the pinned
// block), or because the call was never sent at all — is different in kind, and
// "fails safe" is the wrong instinct there. Coercing an unread balance to `0n`
// states `insufficient-balance available: 0n` AS FACT and fabricates approval
// requirements the trader may already satisfy — a *confident wrong*
// `needs-action` that also short-circuits preflight, so nothing downstream ever
// notices. Such a read contributes NO requirement; instead the whole result is
// flagged `degraded`, and the caller (`search/verifier.ts`) refuses to promise
// `needs-action` from a requirement set it knows is incomplete.
//
// ONE PREDICATE DECIDES THAT, FOR BOTH BRANCHES ({@link isUnread}). The two used
// to disagree: the ERC-20 branch asked `result instanceof TransportError` while
// the native branch asked `classifyRpcError(err) !== 'execution'`, so the same
// failure could fabricate a `0n` balance on one path and report `degraded` on
// the other. The rule is stated once, in the terms the header uses — did this
// read get an ON-CHAIN ANSWER — rather than twice in two vocabularies.
// ---------------------------------------------------------------------------

type CheckReadinessArgs = {
  client: Pick<PublicClient, 'request'>
  trader: Address
  currencyIn: CurrencyRef
  amountIn: bigint
  permit2: Address
  router: Address
  permit?: Permit2PermitSingle
  blockNumber: bigint
  blockTimestamp: bigint
  /** The router's global request semaphore (C4-P6) — see `internal/rpc.ts`'s gated set. */
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
  // comparison (R3) — but `isAddressEqual` THROWS on a malformed operand where the old helper simply
  // compared unequal, and this function is reached from `checkReadiness`, whose contract is that it
  // NEVER THROWS FOR A BUSINESS OUTCOME. The two permit-supplied fields are therefore shape-checked
  // here rather than assumed valid.
  //
  // ASSUMED-VALID IS NOT GOOD ENOUGH EVEN THOUGH `router.ts#validateSwapRequest` NOW CHECKS BOTH.
  // `checkReadiness` is called directly by tests and reachable by anyone assembling their own search
  // wiring, so the request-path check is a first line, not a guarantee — and a comment claiming
  // otherwise is exactly what let this ship: `permit.spender` was never validated anywhere at all
  // while a comment here asserted it was.
  //
  // A malformed field means "this permit does not authorize this trade", which is the SAFE answer:
  // the caller gets a `permit2-allowance` requirement rather than a swap built on a permit nothing
  // could verify. `router` and `token` come from the manifest/request and are validated upstream, so
  // only the permit's own two fields need the guard.
  if (!isAddress(permit.details.token, { strict: false }) || !isAddress(permit.spender, { strict: false })) return false
  if (!isAddressEqual(permit.details.token, token)) return false
  if (!isAddressEqual(permit.spender, router)) return false
  if (permit.details.amount < amountIn) return false
  if (permit.sigDeadline <= blockTimestamp) return false
  // `expiration` is the numeric twin of the two address fields above, and it fails the SAME WAY:
  // `BigInt(1.5)` / `BigInt(NaN)` / `BigInt('x')` is a `RangeError`/`SyntaxError` raised from this
  // line, out of a function that must never throw for a business outcome. It is checked here for
  // the same reason the addresses are — `router.ts#validateSwapRequest` now rejects it pre-RPC, but
  // that is a first line, not a guarantee, since `checkReadiness` is reachable by anyone assembling
  // their own search wiring — and it resolves the same way: a value that cannot be read as a
  // uint48 timestamp means THIS PERMIT DOES NOT AUTHORIZE THIS TRADE, so the caller gets a
  // `permit2-allowance` requirement rather than a swap built on a permit nothing could verify.
  if (!Number.isInteger(permit.details.expiration)) return false
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
 * `degraded` means at least one read never got an ON-CHAIN ANSWER ({@link isUnread}), so `requirements` is
 * known-INCOMPLETE and known-uninterpretable as "do exactly these things and the swap will work".
 * The missing check contributes no requirement — a fabricated one, stated with a hard number
 * (`available: 0n`), is worse than a reported gap in knowledge.
 */
type ReadinessResult = { requirements: ExecutionRequirement[]; degraded: boolean }

/**
 * True when this read never produced an ON-CHAIN ANSWER, so its value must be neither trusted nor
 * invented — the single predicate behind every `degraded` decision in this module (see the header).
 *
 * Three channels, one verdict:
 *
 *  - `TransportError` (and its `NodeStateError` subclass): what `ethCall` raises once it has already
 *    classified the provider's failure. Checked by identity because that is the fact it carries;
 *    re-classifying its *message* would be asking a second time and risking a different answer.
 *  - `AbortedCallError`: our own skip — the call never went to the wire, on our own instruction.
 *    {@link classifyRpcError} CANNOT SEE THIS. It reads provider vocabulary and defaults to
 *    `'execution'` for anything it does not recognize, which is the correct conservative default for
 *    a real error off a real wire and exactly the wrong one for a request that never made it there:
 *    an unsent call would otherwise fabricate `available: 0n` out of nothing at all.
 *  - anything else the classifier can place outside the execution channel (a raw transport/node-state
 *    error that reached this slot without passing through `ethCall`'s wrapping — a decode stage, a
 *    caller wiring its own client).
 *
 * Everything the classifier leaves in the `execution` channel — a real revert, a decode failure, an
 * unrecognized error off a live call — keeps the conservative treatment the header describes: that
 * check fails, widening the requirement set rather than hiding it behind `degraded`.
 */
function isUnread(err: unknown): boolean {
  if (err instanceof TransportError || err instanceof AbortedCallError) return true
  return classifyRpcError(err) !== 'execution'
}

/**
 * Computes the {@link ExecutionRequirement}s the trader still needs to satisfy before `amountIn` of
 * `currencyIn` can move, as of `blockNumber`/`blockTimestamp`. Never throws for a business outcome —
 * a read that fails *on chain* just widens the returned set rather than propagating, while a read
 * that never got an on-chain answer at all sets `degraded` and adds nothing (see the module header).
 */
export async function checkReadiness(args: CheckReadinessArgs): Promise<ReadinessResult> {
  const { client, trader, currencyIn, amountIn, permit2, router, permit, blockNumber, blockTimestamp, semaphore } = args

  if (currencyIn === 'native') {
    let available: bigint
    try {
      available = await getNativeBalance(client, trader, blockNumber, semaphore)
    } catch (err) {
      // `eth_getBalance` goes out raw (not through `ethCall`), so nothing here ever constructed a
      // `TransportError` — the classifier arm of {@link isUnread} is what carries this branch, and the
      // identity arms cost nothing. An unread balance is an unread balance whichever way the node
      // failed to read it.
      if (isUnread(err)) return { requirements: [], degraded: true }
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

  if (balanceResult instanceof Error && isUnread(balanceResult)) {
    degraded = true
  } else {
    const available = balanceResult instanceof Error ? 0n : balanceResult
    if (available < amountIn) {
      requirements.push({ kind: 'insufficient-balance', token, required: amountIn, available })
    }
  }

  if (erc20AllowanceResult instanceof Error && isUnread(erc20AllowanceResult)) {
    degraded = true
  } else {
    const erc20Allowance = erc20AllowanceResult instanceof Error ? 0n : erc20AllowanceResult
    if (erc20Allowance < amountIn) {
      requirements.push({ kind: 'erc20-approval', token, spender: permit2, minimumAmount: amountIn })
    }
  }

  const permitCovers = permit !== undefined && isPermitValid(permit, token, router, amountIn, blockTimestamp)
  if (!permitCovers) {
    if (permit2AllowanceResult instanceof Error && isUnread(permit2AllowanceResult)) {
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
