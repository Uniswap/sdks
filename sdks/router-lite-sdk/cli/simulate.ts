// ---------------------------------------------------------------------------
// `--simulate` — prove a swap's `tx` executes, with no keys and no funds,
// via one `eth_simulateV1` request.
//
// Adapted from `canary/simulate.ts` (same chained design, same rationale):
// a native-balance state override gives the trader spending power inside the
// simulated block, then the calls run in order against that same block —
//
//   1. acquire   (ERC-20 input only) a real native → tokenIn swap, built by
//                asking THIS CLI's router for one — self-hosting, no token list;
//   2. approve   tokenIn → Permit2, per the result's own `erc20-approval`
//                requirement;
//   3. permit2   Permit2.approve(tokenIn, UR, …), per `permit2-allowance`;
//   4. the SDK's returned `tx`, VERBATIM — the thing under test.
//
// Deliberately re-implemented rather than imported from canary/: that module
// resolves the SDK by package name (the built `dist/`), and this CLI's
// contract is "always the current source" — a `--simulate` that silently
// exercised a stale build would report on the wrong code. The payload/eval
// helpers stay pure and unit-tested here, exactly as they are there.
//
// The success bar uses the result's own `limits.minAmountOut` — the number
// asserted inside `tx` — rather than re-deriving it from slippage.
// ---------------------------------------------------------------------------

import {
  decodeAbiParameters,
  encodeEventTopics,
  encodeFunctionData,
  maxUint160,
  maxUint256,
  pad,
  parseAbi,
  parseEther,
  toHex,
  zeroAddress,
  type Address,
  type Hex,
  type PublicClient,
} from 'viem'

import type { CurrencyRef, EncodedTx, ExecutionRequirement, NeedsActionSwap, ReadySwap, Router } from '../src/index'

/** Native balance the trader is given INSIDE the simulation only. */
export const SIM_NATIVE_BALANCE = parseEther('100')

/** Budget for the acquisition leg — headroom left for approvals and the swap itself. */
const ACQUIRE_NATIVE_BUDGET = (SIM_NATIVE_BALANCE * 8n) / 10n

/** Far-future Permit2 expiration — never the thing that fails (mirrors the fork harness). */
const FAR_FUTURE_EXPIRATION = 2_000_000_000

const ERC20_APPROVE_ABI = parseAbi(['function approve(address spender, uint256 amount) returns (bool)'])
const PERMIT2_APPROVE_ABI = parseAbi(['function approve(address token, address spender, uint160 amount, uint48 expiration)'])
const TRANSFER_EVENT_ABI = parseAbi(['event Transfer(address indexed from, address indexed to, uint256 value)'])
const TRANSFER_TOPIC0 = encodeEventTopics({ abi: TRANSFER_EVENT_ABI, eventName: 'Transfer' })[0]!

// eth_simulateV1 wire types — minimal, this CLI's own (not part of viem's PublicRpcSchema).
export type SimulateCall = { from?: Address; to: Address; data: Hex; value?: Hex }
export type SimulatePayload = {
  blockStateCalls: Array<{ stateOverrides?: Record<string, { balance?: Hex }>; calls: SimulateCall[] }>
  validation?: boolean
  traceTransfers?: boolean
}
export type SimulateLog = { address: Address; topics: Hex[]; data: Hex }
export type SimulateCallResult = { status: Hex; returnData: Hex; gasUsed: Hex; logs: SimulateLog[]; error?: { code: number; message: string } }
export type SimulateBlockResult = { calls: SimulateCallResult[] }

export type SimulateOutcome = { ok: boolean; outputReceived: bigint; failedCallIndex?: number; callCount: number }

/** Cheapest possible "does this provider implement eth_simulateV1" probe. Never throws. */
export async function probeSimulateV1Support(client: Pick<PublicClient, 'request'>): Promise<boolean> {
  try {
    const probe: SimulatePayload = {
      blockStateCalls: [{ calls: [{ to: zeroAddress, data: '0x' as Hex }] }],
      validation: false,
      traceTransfers: false,
    }
    await client.request({ method: 'eth_simulateV1', params: [probe, 'latest'] } as never)
    return true
  } catch {
    return false
  }
}

function findRequirement<K extends ExecutionRequirement['kind']>(
  requirements: ExecutionRequirement[],
  kind: K,
): Extract<ExecutionRequirement, { kind: K }> | undefined {
  return requirements.find((r): r is Extract<ExecutionRequirement, { kind: K }> => r.kind === kind)
}

/**
 * The currency THE TRADER must supply — read off `tx.value` first, then the readiness requirements,
 * then (last resort) the first leg. NOT simply `legs[0].currencyIn`: a route's legs describe POOL
 * currencies, and the Universal Router bridges native/wrapped with an implicit wrap — see
 * `canary/simulate.ts#traderInputCurrency` for the live failure that taught this.
 */
export function traderInputCurrency(result: ReadySwap | NeedsActionSwap): CurrencyRef {
  if (result.tx.value > 0n) return 'native'
  const requirement = result.status === 'needs-action' ? result.requirements[0] : undefined
  if (requirement) return requirement.token
  const leg = result.best.route.legs[0]
  if (!leg) throw new Error('traderInputCurrency: result.best.route has no legs')
  return leg.currencyIn
}

/** Builds the chained acquire→approve→permit2→swap payload. Pure — unit-testable with canned results. */
export function buildSimulatePayload(
  result: ReadySwap | NeedsActionSwap,
  trader: Address,
  opts?: { acquisitionTx?: EncodedTx; nativeBalance?: bigint },
): SimulatePayload {
  const tokenIn = traderInputCurrency(result)
  const calls: SimulateCall[] = []

  if (tokenIn !== 'native') {
    if (!opts?.acquisitionTx) {
      throw new Error('buildSimulatePayload: ERC-20 input needs an acquisitionTx — resolve one first')
    }
    calls.push({ from: trader, to: opts.acquisitionTx.to, data: opts.acquisitionTx.data, value: toHex(opts.acquisitionTx.value) })

    const requirements = result.status === 'needs-action' ? result.requirements : []
    const erc20Req = findRequirement(requirements, 'erc20-approval')
    const permit2Req = findRequirement(requirements, 'permit2-allowance')
    if (erc20Req) {
      calls.push({
        from: trader,
        to: tokenIn,
        data: encodeFunctionData({ abi: ERC20_APPROVE_ABI, functionName: 'approve', args: [erc20Req.spender, maxUint256] }),
      })
    }
    // Permit2's own address is only known via the erc20-approval requirement's spender.
    if (permit2Req && erc20Req) {
      calls.push({
        from: trader,
        to: erc20Req.spender,
        data: encodeFunctionData({
          abi: PERMIT2_APPROVE_ABI,
          functionName: 'approve',
          args: [tokenIn, permit2Req.spender, maxUint160, FAR_FUTURE_EXPIRATION],
        }),
      })
    }
  }

  calls.push({ from: trader, to: result.tx.to, data: result.tx.data, value: toHex(result.tx.value) })

  return {
    blockStateCalls: [
      { stateOverrides: { [trader]: { balance: toHex(opts?.nativeBalance ?? SIM_NATIVE_BALANCE) } }, calls },
    ],
    validation: false,
    traceTransfers: true,
  }
}

/** Sums Transfer-shaped log values to `recipient` — covers real ERC-20 transfers and the synthetic
 * native-transfer logs `traceTransfers` adds, without special-casing either. */
function sumTransfersTo(logs: SimulateLog[], recipient: Address): bigint {
  const target = pad(recipient, { size: 32 }).toLowerCase()
  let total = 0n
  for (const log of logs) {
    if (log.topics[0] !== TRANSFER_TOPIC0) continue
    if (log.topics.length < 3) continue
    if (log.topics[2]!.toLowerCase() !== target) continue
    const [value] = decodeAbiParameters([{ type: 'uint256' }], log.data)
    total += value as bigint
  }
  return total
}

/** Every call must succeed AND the final call's logs must deliver ≥ `minAmountOut` to `recipient`. */
export function evaluateSimulateResult(block: SimulateBlockResult, recipient: Address, minAmountOut: bigint): SimulateOutcome {
  const failedCallIndex = block.calls.findIndex((c) => c.status !== '0x1')
  const finalCall = block.calls[block.calls.length - 1]
  const outputReceived = finalCall ? sumTransfersTo(finalCall.logs, recipient) : 0n
  const ok = block.calls.length > 0 && failedCallIndex < 0 && outputReceived >= minAmountOut
  return failedCallIndex >= 0 ? { ok, outputReceived, failedCallIndex, callCount: block.calls.length } : { ok, outputReceived, callCount: block.calls.length }
}

/**
 * Runs the whole proof for `result` against `client`. `router` (the command's own, source-fresh
 * router) prices the acquisition leg when the input is an ERC-20; the caller has already checked
 * {@link probeSimulateV1Support}.
 */
export async function simulateSwap(
  client: PublicClient,
  router: Router,
  result: ReadySwap | NeedsActionSwap,
  trader: Address,
  recipient: Address,
): Promise<SimulateOutcome> {
  const tokenIn = traderInputCurrency(result)

  let acquisitionTx: EncodedTx | undefined
  if (tokenIn !== 'native') {
    const acquire = await router.getSwap({ tokenIn: 'native', tokenOut: tokenIn, amountIn: ACQUIRE_NATIVE_BUDGET, trader })
    if (acquire.status !== 'ready' && acquire.status !== 'needs-action') {
      const reason = 'reason' in acquire ? ` (${acquire.reason.code})` : ''
      throw new Error(`--simulate: no acquisition route native → tokenIn for the trader${reason} — cannot fund the simulated swap`)
    }
    if (acquire.best.quote.amountOut < result.best.quote.amountIn) {
      throw new Error('--simulate: the acquisition leg cannot buy enough tokenIn to fund the swap — try a smaller amount')
    }
    acquisitionTx = acquire.tx
  }

  const payload = buildSimulatePayload(result, trader, acquisitionTx ? { acquisitionTx } : undefined)
  const blocks = (await client.request({ method: 'eth_simulateV1', params: [payload, 'latest'] } as never)) as SimulateBlockResult[]
  const block = blocks[0]
  if (!block) throw new Error('--simulate: eth_simulateV1 returned no block results')
  return evaluateSimulateResult(block, recipient, result.limits.minAmountOut)
}
