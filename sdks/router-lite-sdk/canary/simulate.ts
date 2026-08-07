import {
  createRouter,
  manifestFor,
  type EncodedTx,
  type ExecutionRequirement,
  type NeedsActionSwap,
  type ReadySwap,
} from '@uniswap/router-lite-sdk'
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

// `assertResultCoherent` and `DEFAULT_SLIPPAGE_BPS` are internal (unreachable through either public
// export path), so they are imported by relative path — the same escape hatch the fork harness uses
// (`integration/e2e.ts` -> `../src/internal/testing`). `canary/` sits next to `integration/` under
// the same package root, so the relative depth is identical.
import { DEFAULT_SLIPPAGE_BPS } from '../src/constants'
import { assertResultCoherent } from '../src/internal/testing'

// ---------------------------------------------------------------------------
// eth_simulateV1 — the execution proof for the live-RPC canary suite.
//
// The design decision this module exists to satisfy: canary runs carry NO
// keys and fund NO real trader. `getSwap` is called against a synthetic,
// permanently-unfunded address, which always comes back `needs-action` (the
// trader has no balance and no approvals). `simulateSwapE2E` is the other
// half — it proves the `tx` that came back is actually EXECUTABLE, by running
// the whole authorization chain a real trader would need, inside one
// `eth_simulateV1` request, with only a native-balance override (first-class
// in the RPC method; no storage-slot guessing) giving the synthetic trader
// spending power that exists nowhere on chain.
//
// The call chain, in order, all against the SAME block:
//   1. acquire  (skipped when tokenIn is native): a real Universal Router
//      native -> tokenIn swap, built by asking the SDK itself for one
//      (`resolveAcquisitionTx`) — self-hosting, so this module never needs
//      its own pricing logic or token list.
//   2. approve  tokenIn -> Permit2, for whatever `getSwap` reported as the
//      `erc20-approval` requirement's spender.
//   3. Permit2.approve(tokenIn, UR, ...), for whatever `getSwap` reported as
//      the `permit2-allowance` requirement's spender.
//   4. the SDK's returned `tx`, VERBATIM — this is the thing under test.
//
// `buildSimulateSwapPayload` and `evaluateSimulateResult` are pure (no RPC)
// and exported specifically so the payload shape and the log-decoding logic
// can be unit-tested with canned inputs/responses, independent of whether a
// live RPC (or even a working local eth_simulateV1) is available.
// ---------------------------------------------------------------------------

/** The synthetic trader every canary run uses: fixed, and never funded for real. */
export const CANARY_TRADER: Address = '0x1111111111111111111111111111111111111111'

/** Native balance the trader is given INSIDE the simulation only. */
export const TRADER_NATIVE_BALANCE = parseEther('100')

/** Budget spent on the acquisition leg — comfortably below the balance override, leaving headroom
 * for the approvals' and the final swap's own (trivial, but nonzero) gas cost. */
const ACQUIRE_NATIVE_BUDGET = (TRADER_NATIVE_BALANCE * 8n) / 10n

/** Permit2 expiration used for the synthetic approval — mirrors the fork harness's constant of the
 * same purpose (`integration/worldBuilder.ts`'s `PERMIT2_EXPIRATION`): far enough in the future to
 * never be the thing that fails, never computed from a block timestamp this module doesn't have. */
const FAR_FUTURE_EXPIRATION = 2_000_000_000

const ERC20_APPROVE_ABI = parseAbi(['function approve(address spender, uint256 amount) returns (bool)'])
const PERMIT2_APPROVE_ABI = parseAbi([
  'function approve(address token, address spender, uint160 amount, uint48 expiration)',
])
const TRANSFER_EVENT_ABI = parseAbi(['event Transfer(address indexed from, address indexed to, uint256 value)'])
/** Standard ERC-20 `Transfer` topic0 — also the shape `traceTransfers` synthesizes for native-value
 * transfers (observed against anvil 1.7.1: a native transfer surfaces as a `Transfer` log from the
 * sentinel address `0xeeee...eeee`, same topic0, `to` in topic2). Filtering on topic0 + topic2 alone
 * (never on `log.address`) is what makes one decode path cover both cases. */
const TRANSFER_TOPIC0 = encodeEventTopics({ abi: TRANSFER_EVENT_ABI, eventName: 'Transfer' })[0]!

const BPS = 10_000n

function computeMinAmountOut(amountOut: bigint, slippageBps: number): bigint {
  return (amountOut * (BPS - BigInt(slippageBps))) / BPS
}

// ---------------------------------------------------------------------------
// eth_simulateV1 wire types — this package's own minimal surface (no upstream
// types exist for this method; not part of viem's `PublicRpcSchema`).
// ---------------------------------------------------------------------------

export type SimulateV1Call = { from?: Address; to: Address; data: Hex; value?: Hex }

export type SimulateV1StateOverride = Record<string, { balance?: Hex }>

export type SimulateV1BlockStateCall = {
  blockOverrides?: Record<string, Hex>
  stateOverrides?: SimulateV1StateOverride
  calls: SimulateV1Call[]
}

export type SimulateV1Payload = {
  blockStateCalls: SimulateV1BlockStateCall[]
  validation?: boolean
  traceTransfers?: boolean
}

export type SimulateV1Log = { address: Address; topics: Hex[]; data: Hex }

export type SimulateV1CallResult = {
  status: Hex // '0x1' success, '0x0' failure
  returnData: Hex
  gasUsed: Hex
  logs: SimulateV1Log[]
  error?: { code: number; message: string }
}

export type SimulateV1BlockResult = { calls: SimulateV1CallResult[] }

export type SimulateSwapOutcome = { ok: boolean; outputReceived: bigint }

// ---------------------------------------------------------------------------
// Support probe
// ---------------------------------------------------------------------------

/**
 * A minimal `eth_simulateV1` call (one no-op call, no overrides) — the cheapest possible way to ask
 * "does this provider even implement this method". Never throws: an unsupported/erroring provider is
 * reported as `false` so the caller can skip that provider with a logged note, per the canary suite's
 * "never PR-blocking" rule.
 */
export async function probeSimulateV1Support(client: Pick<PublicClient, 'request'>): Promise<boolean> {
  try {
    const probe: SimulateV1Payload = {
      blockStateCalls: [{ calls: [{ to: zeroAddress, data: '0x' as Hex }] }],
      validation: false,
      traceTransfers: false,
    }
    await client.request({ method: 'eth_simulateV1', params: [probe, 'latest'] } as any)
    return true
  } catch {
    return false
  }
}

// ---------------------------------------------------------------------------
// Acquisition leg — the only piece that touches live RPC beyond the one
// eth_simulateV1 call. Built by asking the SDK for a plain native -> tokenIn
// swap for the same trader; the fact that the trader is unfunded in reality
// is irrelevant here, since only the ENCODED TX is taken from the result —
// the balance override inside the simulation is what makes it actually run.
// ---------------------------------------------------------------------------

/**
 * Resolves the Universal Router calldata for a native -> `tokenIn` swap, self-hosted via the SDK's
 * own `getSwap`. Throws (rather than returning a sentinel) when no route exists or when the route
 * found would not yield enough `tokenIn` to cover `requiredAmountIn` — both are real failures of the
 * "acquire it inside the simulation" strategy that the caller needs to see, not silently swallow.
 */
export async function resolveAcquisitionTx(
  client: PublicClient,
  tokenIn: Address,
  trader: Address,
  requiredAmountIn: bigint,
  nativeBudget: bigint = ACQUIRE_NATIVE_BUDGET,
): Promise<EncodedTx> {
  const chainId = await client.getChainId()
  const manifest = manifestFor(chainId)
  const acquireRouter = createRouter({ client, manifest })
  const acquireResult = await acquireRouter.getSwap({
    tokenIn: 'native',
    tokenOut: tokenIn,
    amountIn: nativeBudget,
    trader,
  })
  assertResultCoherent(acquireResult)
  if (acquireResult.status !== 'ready' && acquireResult.status !== 'needs-action') {
    const reason = 'reason' in acquireResult ? `: ${acquireResult.reason.code}: ${acquireResult.reason.detail}` : ''
    throw new Error(`resolveAcquisitionTx: no route from native -> ${tokenIn} for the synthetic trader (${acquireResult.status}${reason})`)
  }
  if (acquireResult.best.quote.amountOut < requiredAmountIn) {
    throw new Error(
      `resolveAcquisitionTx: acquiring ${nativeBudget} native only yields ${acquireResult.best.quote.amountOut} of ${tokenIn}, ` +
        `need >= ${requiredAmountIn} for the main swap (increase the acquisition budget or shrink the test amount)`,
    )
  }
  return acquireResult.tx
}

// ---------------------------------------------------------------------------
// Payload construction — pure, no RPC. Unit-testable with canned SwapResults.
// ---------------------------------------------------------------------------

function findRequirement<K extends ExecutionRequirement['kind']>(
  requirements: ExecutionRequirement[],
  kind: K,
): Extract<ExecutionRequirement, { kind: K }> | undefined {
  return requirements.find((r): r is Extract<ExecutionRequirement, { kind: K }> => r.kind === kind)
}

/**
 * Builds the exact `eth_simulateV1` payload for the chained acquire+approve+swap proof. Pure: takes
 * an already-resolved `acquisitionTx` (from {@link resolveAcquisitionTx}) rather than fetching one
 * itself, so the exact request shape can be asserted against canned inputs with no client at all.
 *
 * `acquisitionTx` is required whenever `tokenIn` is not native, and ignored otherwise (a native
 * input needs no acquisition — the balance override already gives the trader spending power).
 */
export function buildSimulateSwapPayload(
  result: ReadySwap | NeedsActionSwap,
  trader: Address,
  opts?: { acquisitionTx?: EncodedTx; nativeBalance?: bigint },
): SimulateV1Payload {
  const legs = result.best.route.legs
  if (legs.length === 0) throw new Error('buildSimulateSwapPayload: result.best.route has no legs')
  const tokenIn = legs[0]!.currencyIn

  const calls: SimulateV1Call[] = []

  if (tokenIn !== 'native') {
    if (!opts?.acquisitionTx) {
      throw new Error(
        'buildSimulateSwapPayload: tokenIn is not native but no acquisitionTx was supplied — call resolveAcquisitionTx first',
      )
    }
    calls.push({
      from: trader,
      to: opts.acquisitionTx.to,
      data: opts.acquisitionTx.data,
      value: toHex(opts.acquisitionTx.value),
    })

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
    // The Permit2 approval's target contract is exactly the ERC-20 approval's spender (Permit2
    // itself); without an erc20-approval requirement there is no known Permit2 address to call.
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
      {
        stateOverrides: { [trader]: { balance: toHex(opts?.nativeBalance ?? TRADER_NATIVE_BALANCE) } },
        calls,
      },
    ],
    validation: false,
    traceTransfers: true,
  }
}

// ---------------------------------------------------------------------------
// Result evaluation — pure, no RPC. Unit-testable with canned simulateV1
// responses.
// ---------------------------------------------------------------------------

/** Sums every `Transfer`-shaped log's value where the `to` topic is `recipient` — covers both a real
 * ERC-20 `Transfer` (the common case) and the synthetic native-transfer log `traceTransfers` adds
 * (observed, against anvil 1.7.1, as the same topic0 from the sentinel address
 * `0xeeee...eeee`) without needing to special-case either. */
function sumTransfersTo(logs: SimulateV1Log[], recipient: Address): bigint {
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

/**
 * Evaluates one `eth_simulateV1` block result against the honesty bar: every call in the chain
 * succeeded, AND the recipient actually received at least `minAmountOut` in the FINAL call's logs
 * (the acquire/approve legs' logs are not considered — only the swap under test's own output counts).
 */
export function evaluateSimulateResult(blockResult: SimulateV1BlockResult, recipient: Address, minAmountOut: bigint): SimulateSwapOutcome {
  const allSucceeded = blockResult.calls.length > 0 && blockResult.calls.every((c) => c.status === '0x1')
  const finalCall = blockResult.calls[blockResult.calls.length - 1]
  const outputReceived = finalCall ? sumTransfersTo(finalCall.logs, recipient) : 0n
  return { ok: allSucceeded && outputReceived >= minAmountOut, outputReceived }
}

// ---------------------------------------------------------------------------
// The public entry point.
// ---------------------------------------------------------------------------

/**
 * Simulates the full acquire+approve+swap chain for `result` (a `getSwap` response for
 * {@link CANARY_TRADER} or any other permanently-unfunded synthetic trader) via one
 * `eth_simulateV1` request, and reports whether it would actually execute successfully with output
 * meeting the SDK's own slippage floor.
 *
 * No keys, no funds, ever: `trader`'s only spending power is the native-balance override this
 * function sets up inside the simulated block, which exists nowhere on chain before or after the
 * call. `slippageBps` defaults to the SDK's own default (100) since `SwapResult` does not carry the
 * request's slippage back — pass the value your `getSwap` call actually used if it was overridden.
 */
export async function simulateSwapE2E(
  client: PublicClient,
  result: ReadySwap | NeedsActionSwap,
  trader: Address,
  opts?: { slippageBps?: number; recipient?: Address; nativeBalance?: bigint; acquireNativeBudget?: bigint },
): Promise<SimulateSwapOutcome> {
  assertResultCoherent(result)

  const legs = result.best.route.legs
  if (legs.length === 0) throw new Error('simulateSwapE2E: result.best.route has no legs')
  const tokenIn = legs[0]!.currencyIn
  const recipient = opts?.recipient ?? trader
  const slippageBps = opts?.slippageBps ?? DEFAULT_SLIPPAGE_BPS
  const minAmountOut = computeMinAmountOut(result.best.quote.amountOut, slippageBps)

  const acquisitionTx =
    tokenIn === 'native'
      ? undefined
      : await resolveAcquisitionTx(client, tokenIn, trader, result.best.quote.amountIn, opts?.acquireNativeBudget)

  const payload = buildSimulateSwapPayload(result, trader, { acquisitionTx, nativeBalance: opts?.nativeBalance })

  const blockResults = (await client.request({
    method: 'eth_simulateV1',
    params: [payload, 'latest'],
  } as any)) as SimulateV1BlockResult[]

  const blockResult = blockResults[0]
  if (!blockResult) throw new Error('simulateSwapE2E: eth_simulateV1 returned no block results')

  return evaluateSimulateResult(blockResult, recipient, minAmountOut)
}
