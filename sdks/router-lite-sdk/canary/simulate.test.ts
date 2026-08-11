import type { EncodedTx, ExecutionRequirement, NeedsActionSwap, PoolRef, QuotedRoute } from '@uniswap/router-lite-sdk'
import { emptyReport } from '@uniswap/router-lite-sdk/experimental'
import { describe, expect, test } from 'bun:test'
import { encodeFunctionData, maxUint160, maxUint256, pad, parseAbi, parseEther, toHex, type Address, type Hex } from 'viem'

import {
  buildSimulateSwapPayload,
  evaluateSimulateResult,
  probeSimulateV1Support,
  traderInputCurrency,
  TRADER_NATIVE_BALANCE,
  type SimulateV1BlockResult,
} from './simulate'

// ---------------------------------------------------------------------------
// Pure unit tests — no RPC, no anvil. `buildSimulateSwapPayload` and
// `evaluateSimulateResult` are exactly the two functions that DON'T need a
// live provider, so this file is the fallback validation the task brief
// calls for when no live endpoint (and possibly no eth_simulateV1-capable
// local chain) is available: canned `SwapResult`s in, an exact request shape
// out; canned `eth_simulateV1` responses in, an exact `{ ok, outputReceived }`
// out.
// ---------------------------------------------------------------------------

const TRADER: Address = '0x1111111111111111111111111111111111111111'
const RECIPIENT: Address = '0x2222222222222222222222222222222222222222'
const TOKEN_IN: Address = '0x3333333333333333333333333333333333333333'
const TOKEN_OUT: Address = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48' // arbitrary, unused as an address per se
const UR: Address = '0x66a9893cC07D91D95644AEDD05D03f95e1dBA8Af'
const PERMIT2: Address = '0x000000000022D473030F116dDEE9F6B43aC78BA3'

const AMOUNT_IN = 1_000n * 10n ** 6n
const AMOUNT_OUT = 500n * 10n ** 18n

// Spelled out rather than built by a helper: this suite only ever sees the published package, and
// `PoolRef`'s derived fields (`id`, `currencies`) are part of what it publishes.
const POOL_ADDRESS = '0x4444444444444444444444444444444444444444'
const POOL: PoolRef = {
  protocol: 'v2',
  address: POOL_ADDRESS,
  token0: TOKEN_IN,
  token1: TOKEN_OUT,
  id: `v2:${POOL_ADDRESS.toLowerCase()}`,
  currencies: [TOKEN_IN, TOKEN_OUT],
}

function quotedRoute(currencyIn: Address | 'native', currencyOut: Address | 'native'): QuotedRoute {
  return {
    route: { legs: [{ pool: POOL, currencyIn, currencyOut }] },
    quote: { amountIn: AMOUNT_IN, amountOut: AMOUNT_OUT, intermediateAmounts: [AMOUNT_OUT] },
  }
}

const TX: EncodedTx = { to: UR, data: '0xdeadbeef' as Hex, value: 0n }

function needsActionResult(
  currencyIn: Address | 'native',
  currencyOut: Address | 'native',
  requirements: ExecutionRequirement[],
): NeedsActionSwap {
  return {
    status: 'needs-action',
    // `best` is the ranked route, same type as `alternatives`: a `needs-action` leader is
    // necessarily unverified (an unfunded trader cannot be honestly simulated), and says so.
    best: { ...quotedRoute(currencyIn, currencyOut), execution: 'needs-action' },
    tx: TX,
    requirements,
    limits: { minAmountOut: (AMOUNT_OUT * 99n) / 100n, deadline: 9_999_999_999n },
    alternatives: [],
    search: emptyReport(),
  }
}

const WETH: Address = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2'

/** A `needsActionResult` with an explicit `tx.value` — the discriminator `traderInputCurrency` reads.
 * Kept separate from {@link needsActionResult} so the existing cases keep asserting today's shape. */
function needsActionResultWithValue(
  currencyIn: Address | 'native',
  currencyOut: Address | 'native',
  requirements: ExecutionRequirement[],
  value: bigint,
): NeedsActionSwap {
  const base = needsActionResult(currencyIn, currencyOut, requirements)
  return { ...base, tx: { ...base.tx, value } }
}

describe('traderInputCurrency', () => {
  // The C4-T4b live regression, in one test: a `tokenIn: 'native'` request routed through a
  // WETH-paired v4 pool, so the leg reports WETH while the trader is paying native. Reading the leg
  // sent the acquisition step off to buy WETH with native, which the SDK rejects outright.
  test('a native-paying swap through a WETH-paired pool is native, not the leg currency', () => {
    const result = needsActionResultWithValue(WETH, TOKEN_OUT, [], parseEther('0.01'))
    expect(result.best.route.legs[0]!.currencyIn).toBe(WETH) // what the route says
    expect(traderInputCurrency(result)).toBe('native') // what the trader actually pays
  })

  // The mirror case, which fails silently rather than loudly: an ERC-20 input routed through a v4
  // NATIVE pool reports `legs[0].currencyIn === 'native'`, and believing it would skip the approval
  // chain entirely and simulate a swap the real trader could never send.
  test('an ERC-20 input routed through a native pool is the ERC-20, not native', () => {
    const result = needsActionResultWithValue(
      'native',
      TOKEN_OUT,
      [{ kind: 'erc20-approval', token: TOKEN_IN, spender: PERMIT2, minimumAmount: AMOUNT_IN }],
      0n,
    )
    expect(result.best.route.legs[0]!.currencyIn).toBe('native')
    expect(traderInputCurrency(result)).toBe(TOKEN_IN)
  })

  test('falls back to the first leg when nothing else can name the input', () => {
    // A fully-approved ERC-20 trader: zero value, no requirements to read a token off.
    const result = needsActionResultWithValue(TOKEN_IN, TOKEN_OUT, [], 0n)
    expect(traderInputCurrency(result)).toBe(TOKEN_IN)
  })
})

describe('buildSimulateSwapPayload', () => {
  test('native tokenIn: no acquisition/approval calls, just the final tx', () => {
    const result = needsActionResult('native', TOKEN_OUT, [{ kind: 'insufficient-balance', token: 'native', required: AMOUNT_IN, available: 0n }])
    const payload = buildSimulateSwapPayload(result, TRADER)

    expect(payload.validation).toBe(false)
    expect(payload.traceTransfers).toBe(true)
    expect(payload.blockStateCalls).toHaveLength(1)
    const bsc = payload.blockStateCalls[0]!
    expect(bsc.stateOverrides).toEqual({ [TRADER]: { balance: toHex(TRADER_NATIVE_BALANCE) } })
    expect(bsc.calls).toEqual([{ from: TRADER, to: TX.to, data: TX.data, value: toHex(TX.value) }])
  })

  test('ERC-20 tokenIn with both requirements: acquire -> approve -> permit2.approve -> final tx, in order', () => {
    const acquisitionTx: EncodedTx = { to: UR, data: '0xacacacac' as Hex, value: parseEther('40') }
    const requirements: ExecutionRequirement[] = [
      { kind: 'insufficient-balance', token: TOKEN_IN, required: AMOUNT_IN, available: 0n },
      { kind: 'erc20-approval', token: TOKEN_IN, spender: PERMIT2, minimumAmount: AMOUNT_IN },
      { kind: 'permit2-allowance', token: TOKEN_IN, spender: UR, minimumAmount: AMOUNT_IN },
    ]
    const result = needsActionResult(TOKEN_IN, 'native', requirements)
    const payload = buildSimulateSwapPayload(result, TRADER, { acquisitionTx })

    const calls = payload.blockStateCalls[0]!.calls
    expect(calls).toHaveLength(4)

    expect(calls[0]).toEqual({ from: TRADER, to: acquisitionTx.to, data: acquisitionTx.data, value: toHex(acquisitionTx.value) })

    const erc20Abi = parseAbi(['function approve(address spender, uint256 amount) returns (bool)'])
    expect(calls[1]).toEqual({
      from: TRADER,
      to: TOKEN_IN,
      data: encodeFunctionData({ abi: erc20Abi, functionName: 'approve', args: [PERMIT2, maxUint256] }),
    })

    const permit2Abi = parseAbi(['function approve(address token, address spender, uint160 amount, uint48 expiration)'])
    expect(calls[2]).toEqual({
      from: TRADER,
      to: PERMIT2,
      data: encodeFunctionData({ abi: permit2Abi, functionName: 'approve', args: [TOKEN_IN, UR, maxUint160, 2_000_000_000] }),
    })

    expect(calls[3]).toEqual({ from: TRADER, to: TX.to, data: TX.data, value: toHex(TX.value) })
  })

  test('ERC-20 tokenIn without an acquisitionTx throws', () => {
    const result = needsActionResult(TOKEN_IN, 'native', [{ kind: 'erc20-approval', token: TOKEN_IN, spender: PERMIT2, minimumAmount: AMOUNT_IN }])
    expect(() => buildSimulateSwapPayload(result, TRADER)).toThrow(/acquisitionTx/)
  })

  test('only the requirements actually present get calls built for them', () => {
    // erc20-approval already satisfied (not in the list) — only the Permit2 leg is missing. Without
    // the erc20-approval requirement there is no known Permit2 address, so no call is built for it
    // either: correct behavior is "nothing we can act on", not a wrong address.
    const acquisitionTx: EncodedTx = { to: UR, data: '0xacacacac' as Hex, value: parseEther('10') }
    const result = needsActionResult(TOKEN_IN, 'native', [{ kind: 'permit2-allowance', token: TOKEN_IN, spender: UR, minimumAmount: AMOUNT_IN }])
    const payload = buildSimulateSwapPayload(result, TRADER, { acquisitionTx })
    const calls = payload.blockStateCalls[0]!.calls
    // Just [acquire, final] — no approve call could be built without the erc20-approval requirement.
    expect(calls).toHaveLength(2)
  })

  test('a custom nativeBalance override is honored', () => {
    const result = needsActionResult('native', TOKEN_OUT, [])
    const payload = buildSimulateSwapPayload(result, TRADER, { nativeBalance: parseEther('7') })
    expect(payload.blockStateCalls[0]!.stateOverrides).toEqual({ [TRADER]: { balance: toHex(parseEther('7')) } })
  })
})

describe('evaluateSimulateResult', () => {
  const TRANSFER_TOPIC0 = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef' as Hex
  const recipientTopic = pad(RECIPIENT, { size: 32 })

  function blockResult(opts: { statuses: Hex[]; finalLogs: { to: Hex; value: bigint }[] }): SimulateV1BlockResult {
    const calls = opts.statuses.map((status, i) => ({
      status,
      returnData: '0x' as Hex,
      gasUsed: '0x5208' as Hex,
      logs:
        i === opts.statuses.length - 1
          ? opts.finalLogs.map((l) => ({
              address: '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee' as Address,
              topics: [TRANSFER_TOPIC0, pad(TRADER, { size: 32 }), l.to],
              data: toHex(l.value, { size: 32 }),
            }))
          : [],
    }))
    return { calls }
  }

  test('all calls succeed and output meets the floor: ok', () => {
    const br = blockResult({ statuses: ['0x1', '0x1'], finalLogs: [{ to: recipientTopic, value: AMOUNT_OUT }] })
    const outcome = evaluateSimulateResult(br, RECIPIENT, AMOUNT_OUT - 1n)
    expect(outcome).toEqual({ ok: true, outputReceived: AMOUNT_OUT })
  })

  test('a reverted call anywhere in the chain fails the whole thing, even with good output', () => {
    const br = blockResult({ statuses: ['0x0', '0x1'], finalLogs: [{ to: recipientTopic, value: AMOUNT_OUT }] })
    const outcome = evaluateSimulateResult(br, RECIPIENT, 0n)
    expect(outcome.ok).toBe(false)
    expect(outcome.outputReceived).toBe(AMOUNT_OUT) // still reported honestly
  })

  test('output below minAmountOut fails even when every call succeeded', () => {
    const br = blockResult({ statuses: ['0x1'], finalLogs: [{ to: recipientTopic, value: AMOUNT_OUT }] })
    const outcome = evaluateSimulateResult(br, RECIPIENT, AMOUNT_OUT + 1n)
    expect(outcome.ok).toBe(false)
  })

  test('transfers to someone other than the recipient are not counted', () => {
    const someoneElse = pad('0x9999999999999999999999999999999999999999', { size: 32 })
    const br = blockResult({ statuses: ['0x1'], finalLogs: [{ to: someoneElse, value: AMOUNT_OUT }] })
    const outcome = evaluateSimulateResult(br, RECIPIENT, 0n)
    expect(outcome.outputReceived).toBe(0n)
  })

  test('multiple transfers to the recipient in the final call are summed', () => {
    const br = blockResult({
      statuses: ['0x1'],
      finalLogs: [
        { to: recipientTopic, value: AMOUNT_OUT / 2n },
        { to: recipientTopic, value: AMOUNT_OUT / 2n },
      ],
    })
    const outcome = evaluateSimulateResult(br, RECIPIENT, AMOUNT_OUT)
    expect(outcome.outputReceived).toBe(AMOUNT_OUT)
    expect(outcome.ok).toBe(true)
  })

  test('no calls at all is never ok', () => {
    const outcome = evaluateSimulateResult({ calls: [] }, RECIPIENT, 0n)
    expect(outcome.ok).toBe(false)
  })
})

describe('probeSimulateV1Support', () => {
  test('a client that answers eth_simulateV1 reports supported', async () => {
    const client = { request: async () => [{ calls: [] }] }
    expect(await probeSimulateV1Support(client as any)).toBe(true)
  })

  test('a client that throws (method not found, or any other error) reports unsupported', async () => {
    const client = {
      request: async () => {
        throw new Error('the method eth_simulateV1 does not exist/is not available')
      },
    }
    expect(await probeSimulateV1Support(client as any)).toBe(false)
  })
})
