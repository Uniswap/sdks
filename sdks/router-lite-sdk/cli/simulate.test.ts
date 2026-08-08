import { describe, expect, it } from 'bun:test'
import { encodeAbiParameters, pad, toHex, type Address, type Hex } from 'viem'

import type { NeedsActionSwap, ReadySwap, SearchReport } from '../src/index'
import { emptyReport } from '../src/internal/testing'

import {
  buildSimulatePayload,
  evaluateSimulateResult,
  SIM_NATIVE_BALANCE,
  traderInputCurrency,
  type SimulateBlockResult,
} from './simulate'


const TRADER: Address = '0x1111111111111111111111111111111111111111'
const UR: Address = '0x66a9893cC07D91D95644AEDD05D03f95e1dBA8Af'
const PERMIT2: Address = '0x000000000022D473030F116dDEE9F6B43aC78BA3'
const USDC: Address = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48'
const TRANSFER_TOPIC0: Hex = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef'

// A structurally-complete canned report; its contents are irrelevant to payload construction —
// `simulate.ts` never reads one. The SDK's own all-zero report says exactly that, and says it
// without a literal that would need editing every time `SearchReport` grows a field.
const SEARCH: SearchReport = emptyReport()

const BEST = {
  route: {
    legs: [
      {
        pool: {
          id: 'v2:0x0000000000000000000000000000000000000002',
          currencies: [USDC, '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2'] as [Address, Address],
          protocol: 'v2' as const,
          address: '0x0000000000000000000000000000000000000002' as Address,
          token0: USDC,
          token1: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2' as Address,
        },
        currencyIn: USDC,
        currencyOut: 'native' as const,
      },
    ],
  },
  quote: { amountIn: 250_000_000n, amountOut: 10n ** 17n, intermediateAmounts: [] },
  execution: 'needs-action' as const,
}

const NEEDS_ACTION: NeedsActionSwap = {
  status: 'needs-action',
  best: BEST,
  tx: { to: UR, data: '0xdeadbeef', value: 0n },
  requirements: [
    { kind: 'erc20-approval', token: USDC, spender: PERMIT2, minimumAmount: 250_000_000n },
    { kind: 'permit2-allowance', token: USDC, spender: UR, minimumAmount: 250_000_000n },
  ],
  limits: { minAmountOut: 99_000_000_000_000_000n, deadline: 2_000_000_000n },
  search: SEARCH,
  alternatives: [],
}

const READY_NATIVE: ReadySwap = {
  status: 'ready',
  best: { ...BEST, execution: 'verified' },
  tx: { to: UR, data: '0xdeadbeef', value: 10n ** 18n },
  execution: { verifiedAtBlock: SEARCH.block },
  limits: { minAmountOut: 99_000_000_000_000_000n, deadline: 2_000_000_000n },
  search: SEARCH,
  alternatives: [],
}

describe('traderInputCurrency', () => {
  it('reads native off tx.value, not off the first leg', () => {
    expect(traderInputCurrency(READY_NATIVE)).toBe('native')
  })

  it('reads an ERC-20 input off the requirements', () => {
    expect(traderInputCurrency(NEEDS_ACTION)).toBe(USDC)
  })
})

describe('buildSimulatePayload', () => {
  it('native input: one call, balance override, verbatim tx', () => {
    const payload = buildSimulatePayload(READY_NATIVE, TRADER)
    const block = payload.blockStateCalls[0]!
    expect(block.calls).toEqual([{ from: TRADER, to: UR, data: '0xdeadbeef', value: toHex(10n ** 18n) }])
    expect(block.stateOverrides).toEqual({ [TRADER]: { balance: toHex(SIM_NATIVE_BALANCE) } })
    expect(payload.traceTransfers).toBe(true)
  })

  it('ERC-20 input: acquire → approve → permit2 → swap, in order', () => {
    const acquisitionTx = { to: UR, data: '0xacac' as Hex, value: 10n ** 18n }
    const payload = buildSimulatePayload(NEEDS_ACTION, TRADER, { acquisitionTx })
    const calls = payload.blockStateCalls[0]!.calls
    expect(calls).toHaveLength(4)
    expect(calls[0]).toEqual({ from: TRADER, to: UR, data: '0xacac', value: toHex(10n ** 18n) })
    expect(calls[1]!.to).toBe(USDC) // ERC-20 approve
    expect(calls[2]!.to).toBe(PERMIT2) // Permit2.approve
    expect(calls[3]).toEqual({ from: TRADER, to: UR, data: '0xdeadbeef', value: toHex(0n) })
  })

  it('refuses an ERC-20 input with no acquisition tx', () => {
    expect(() => buildSimulatePayload(NEEDS_ACTION, TRADER)).toThrow(/acquisitionTx/)
  })
})

describe('evaluateSimulateResult', () => {
  const transferLog = (to: Address, value: bigint) => ({
    address: USDC,
    topics: [TRANSFER_TOPIC0, pad(UR, { size: 32 }), pad(to, { size: 32 })] as Hex[],
    data: encodeAbiParameters([{ type: 'uint256' }], [value]),
  })
  const ok = (logs: ReturnType<typeof transferLog>[]) => ({ status: '0x1' as Hex, returnData: '0x' as Hex, gasUsed: '0x0' as Hex, logs })

  it('passes when every call succeeds and the final call delivers the floor', () => {
    const block: SimulateBlockResult = { calls: [ok([]), ok([transferLog(TRADER, 100_000_000_000_000_000n)])] }
    const outcome = evaluateSimulateResult(block, TRADER, 99_000_000_000_000_000n)
    expect(outcome).toEqual({ ok: true, outputReceived: 100_000_000_000_000_000n, callCount: 2 })
  })

  it('fails and names the call when any call in the chain reverts', () => {
    const block: SimulateBlockResult = {
      calls: [ok([]), { status: '0x0', returnData: '0x', gasUsed: '0x0', logs: [] }],
    }
    const outcome = evaluateSimulateResult(block, TRADER, 1n)
    expect(outcome.ok).toBe(false)
    expect(outcome.failedCallIndex).toBe(1)
  })

  it('fails when output lands below the floor, and ignores transfers to others', () => {
    const other: Address = '0x2222222222222222222222222222222222222222'
    const block: SimulateBlockResult = {
      calls: [ok([transferLog(TRADER, 1n), transferLog(other, 10n ** 18n)])],
    }
    const outcome = evaluateSimulateResult(block, TRADER, 99_000_000_000_000_000n)
    expect(outcome.ok).toBe(false)
    expect(outcome.outputReceived).toBe(1n)
  })
})
