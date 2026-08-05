import { expect, test } from 'bun:test'
import type { Hex, PublicClient } from 'viem'
import { encodeFunctionData, encodeFunctionResult, getAddress } from 'viem'

import { ERC20_ABI, PERMIT2_ABI } from '../internal/abis'
import { rateLimitHttpError } from '../internal/testing'
import type { EthCall, Permit2PermitSingle } from '../types'

import { checkReadiness } from './readiness'

// ---------------------------------------------------------------------------
// Stub client — keyed by (to, data) for `eth_call`s, the full identity of a
// call, plus a separate slot for the one `eth_getBalance` a native-input
// check issues. Mirrors the stub in `quote/quote.test.ts`.
// ---------------------------------------------------------------------------

type StubEntry = Hex | 'revert' | 'rate-limit'

function callKey(to: string, data: string): string {
  return `${to.toLowerCase()}:${data}`
}

function stubClient(returns: Record<string, StubEntry>, balance?: bigint | 'revert' | 'rate-limit'): Pick<PublicClient, 'request'> {
  return {
    async request(args: any) {
      if (args.method === 'eth_getBalance') {
        if (balance === undefined) throw new Error('stubClient: no balance stub registered')
        if (balance === 'revert') throw new Error('rpc failure')
        if (balance === 'rate-limit') throw rateLimitHttpError()
        return `0x${balance.toString(16)}` as Hex
      }
      const [{ to, data }] = args.params
      const key = callKey(to, data)
      const entry = returns[key]
      if (entry === undefined) throw new Error(`stubClient: no stub registered for ${key}`)
      if (entry === 'revert') throw new Error('execution reverted')
      // A throttled read: the node never answered, so its value is unknown — not zero.
      if (entry === 'rate-limit') throw rateLimitHttpError()
      return entry
    },
  } as unknown as Pick<PublicClient, 'request'>
}

function entryFor(call: EthCall, value: StubEntry): Record<string, StubEntry> {
  return { [callKey(call.to, call.data)]: value }
}

const TOKEN = getAddress('0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48')
const TRADER = getAddress('0x0000000000000000000000000000000000000a11')
const PERMIT2 = getAddress('0x0000000000000000000000000000000000000a22')
const ROUTER = getAddress('0x0000000000000000000000000000000000000a33')

const BLOCK_NUMBER = 100n
const BLOCK_TIMESTAMP = 1_700_000_000n
const AMOUNT_IN = 1_000n

function balanceCall(): EthCall {
  return { to: TOKEN, data: encodeFunctionData({ abi: ERC20_ABI, functionName: 'balanceOf', args: [TRADER] }) }
}

function erc20AllowanceCall(): EthCall {
  return { to: TOKEN, data: encodeFunctionData({ abi: ERC20_ABI, functionName: 'allowance', args: [TRADER, PERMIT2] }) }
}

function permit2AllowanceCall(): EthCall {
  return { to: PERMIT2, data: encodeFunctionData({ abi: PERMIT2_ABI, functionName: 'allowance', args: [TRADER, TOKEN, ROUTER] }) }
}

function balanceReturn(amount: bigint): Hex {
  return encodeFunctionResult({ abi: ERC20_ABI, functionName: 'balanceOf', result: amount })
}

function erc20AllowanceReturn(amount: bigint): Hex {
  return encodeFunctionResult({ abi: ERC20_ABI, functionName: 'allowance', result: amount })
}

function permit2AllowanceReturn(amount: bigint, expiration: number, nonce = 0): Hex {
  return encodeFunctionResult({ abi: PERMIT2_ABI, functionName: 'allowance', result: [amount, expiration, nonce] })
}

function validPermit(overrides: Partial<Permit2PermitSingle> = {}): Permit2PermitSingle {
  return {
    details: { token: TOKEN, amount: AMOUNT_IN, expiration: Number(BLOCK_TIMESTAMP) + 3600, nonce: 0 },
    spender: ROUTER,
    sigDeadline: BLOCK_TIMESTAMP + 3600n,
    signature: '0x' as Hex,
    ...overrides,
  }
}

test('(a) fully approved erc20 -> no requirements', async () => {
  const client = stubClient({
    ...entryFor(balanceCall(), balanceReturn(AMOUNT_IN * 2n)),
    ...entryFor(erc20AllowanceCall(), erc20AllowanceReturn(AMOUNT_IN * 2n)),
    ...entryFor(permit2AllowanceCall(), permit2AllowanceReturn(AMOUNT_IN * 2n, Number(BLOCK_TIMESTAMP) + 3600)),
  })

  const { requirements } = await checkReadiness({
    client,
    trader: TRADER,
    currencyIn: TOKEN,
    amountIn: AMOUNT_IN,
    permit2: PERMIT2,
    router: ROUTER,
    blockNumber: BLOCK_NUMBER,
    blockTimestamp: BLOCK_TIMESTAMP,
  })

  expect(requirements).toEqual([])
})

test('(b) no balance and no erc20 approval -> both requirements', async () => {
  const client = stubClient({
    ...entryFor(balanceCall(), balanceReturn(100n)),
    ...entryFor(erc20AllowanceCall(), erc20AllowanceReturn(0n)),
    ...entryFor(permit2AllowanceCall(), permit2AllowanceReturn(AMOUNT_IN * 2n, Number(BLOCK_TIMESTAMP) + 3600)),
  })

  const { requirements } = await checkReadiness({
    client,
    trader: TRADER,
    currencyIn: TOKEN,
    amountIn: AMOUNT_IN,
    permit2: PERMIT2,
    router: ROUTER,
    blockNumber: BLOCK_NUMBER,
    blockTimestamp: BLOCK_TIMESTAMP,
  })

  expect(requirements).toEqual([
    { kind: 'insufficient-balance', token: TOKEN, required: AMOUNT_IN, available: 100n },
    { kind: 'erc20-approval', token: TOKEN, spender: PERMIT2, minimumAmount: AMOUNT_IN },
  ])
})

test('(c) erc20 approved, permit2 expired, no permit supplied -> permit2-allowance', async () => {
  const client = stubClient({
    ...entryFor(balanceCall(), balanceReturn(AMOUNT_IN * 2n)),
    ...entryFor(erc20AllowanceCall(), erc20AllowanceReturn(AMOUNT_IN * 2n)),
    ...entryFor(permit2AllowanceCall(), permit2AllowanceReturn(AMOUNT_IN * 2n, Number(BLOCK_TIMESTAMP) - 10)),
  })

  const { requirements } = await checkReadiness({
    client,
    trader: TRADER,
    currencyIn: TOKEN,
    amountIn: AMOUNT_IN,
    permit2: PERMIT2,
    router: ROUTER,
    blockNumber: BLOCK_NUMBER,
    blockTimestamp: BLOCK_TIMESTAMP,
  })

  expect(requirements).toEqual([{ kind: 'permit2-allowance', token: TOKEN, spender: ROUTER, minimumAmount: AMOUNT_IN }])
})

test('(d) same as (c) but a valid supplied permit embeds the allowance -> no requirements', async () => {
  const client = stubClient({
    ...entryFor(balanceCall(), balanceReturn(AMOUNT_IN * 2n)),
    ...entryFor(erc20AllowanceCall(), erc20AllowanceReturn(AMOUNT_IN * 2n)),
    ...entryFor(permit2AllowanceCall(), permit2AllowanceReturn(AMOUNT_IN * 2n, Number(BLOCK_TIMESTAMP) - 10)),
  })

  const { requirements } = await checkReadiness({
    client,
    trader: TRADER,
    currencyIn: TOKEN,
    amountIn: AMOUNT_IN,
    permit2: PERMIT2,
    router: ROUTER,
    permit: validPermit(),
    blockNumber: BLOCK_NUMBER,
    blockTimestamp: BLOCK_TIMESTAMP,
  })

  expect(requirements).toEqual([])
})

test('(e) native input with sufficient balance -> no requirements', async () => {
  const client = stubClient({}, AMOUNT_IN * 2n)

  const { requirements } = await checkReadiness({
    client,
    trader: TRADER,
    currencyIn: 'native',
    amountIn: AMOUNT_IN,
    permit2: PERMIT2,
    router: ROUTER,
    blockNumber: BLOCK_NUMBER,
    blockTimestamp: BLOCK_TIMESTAMP,
  })

  expect(requirements).toEqual([])
})

test('native input with insufficient balance -> insufficient-balance requirement (required has no gas headroom)', async () => {
  const client = stubClient({}, 100n)

  const { requirements } = await checkReadiness({
    client,
    trader: TRADER,
    currencyIn: 'native',
    amountIn: AMOUNT_IN,
    permit2: PERMIT2,
    router: ROUTER,
    blockNumber: BLOCK_NUMBER,
    blockTimestamp: BLOCK_TIMESTAMP,
  })

  expect(requirements).toEqual([{ kind: 'insufficient-balance', token: 'native', required: AMOUNT_IN, available: 100n }])
})

test('a reverting read is treated conservatively, never thrown', async () => {
  const client = stubClient({
    ...entryFor(balanceCall(), 'revert'),
    ...entryFor(erc20AllowanceCall(), erc20AllowanceReturn(AMOUNT_IN * 2n)),
    ...entryFor(permit2AllowanceCall(), permit2AllowanceReturn(AMOUNT_IN * 2n, Number(BLOCK_TIMESTAMP) + 3600)),
  })

  const { requirements } = await checkReadiness({
    client,
    trader: TRADER,
    currencyIn: TOKEN,
    amountIn: AMOUNT_IN,
    permit2: PERMIT2,
    router: ROUTER,
    blockNumber: BLOCK_NUMBER,
    blockTimestamp: BLOCK_TIMESTAMP,
  })

  expect(requirements).toEqual([{ kind: 'insufficient-balance', token: TOKEN, required: AMOUNT_IN, available: 0n }])
})

test('an invalid supplied permit (wrong spender) falls back to the on-chain permit2 allowance check', async () => {
  const client = stubClient({
    ...entryFor(balanceCall(), balanceReturn(AMOUNT_IN * 2n)),
    ...entryFor(erc20AllowanceCall(), erc20AllowanceReturn(AMOUNT_IN * 2n)),
    ...entryFor(permit2AllowanceCall(), permit2AllowanceReturn(AMOUNT_IN * 2n, Number(BLOCK_TIMESTAMP) + 3600)),
  })

  const { requirements } = await checkReadiness({
    client,
    trader: TRADER,
    currencyIn: TOKEN,
    amountIn: AMOUNT_IN,
    permit2: PERMIT2,
    router: ROUTER,
    permit: validPermit({ spender: TRADER }),
    blockNumber: BLOCK_NUMBER,
    blockTimestamp: BLOCK_TIMESTAMP,
  })

  expect(requirements).toEqual([])
})

// ---------------------------------------------------------------------------
// Transport failures never become requirements.
//
// Coercing an unread balance to `0n` reports `insufficient-balance available:
// 0n` as a fact and fabricates approvals the trader may already hold — and
// because any requirement short-circuits preflight, nothing downstream ever
// notices. A throttled read contributes nothing and sets `degraded` instead.
// ---------------------------------------------------------------------------

test('a throttled balanceOf fabricates NO insufficient-balance requirement, and reports degraded', async () => {
  const client = stubClient({
    ...entryFor(balanceCall(), 'rate-limit'),
    ...entryFor(erc20AllowanceCall(), erc20AllowanceReturn(AMOUNT_IN * 2n)),
    ...entryFor(permit2AllowanceCall(), permit2AllowanceReturn(AMOUNT_IN * 2n, Number(BLOCK_TIMESTAMP) + 3600)),
  })

  const result = await checkReadiness({
    client,
    trader: TRADER,
    currencyIn: TOKEN,
    amountIn: AMOUNT_IN,
    permit2: PERMIT2,
    router: ROUTER,
    blockNumber: BLOCK_NUMBER,
    blockTimestamp: BLOCK_TIMESTAMP,
  })

  expect(result).toEqual({ requirements: [], degraded: true })
})

test('a throttled read leaves the genuine requirements from the reads that DID land, still degraded', async () => {
  const client = stubClient({
    ...entryFor(balanceCall(), 'rate-limit'),
    ...entryFor(erc20AllowanceCall(), erc20AllowanceReturn(0n)), // genuinely unapproved
    ...entryFor(permit2AllowanceCall(), 'rate-limit'),
  })

  const result = await checkReadiness({
    client,
    trader: TRADER,
    currencyIn: TOKEN,
    amountIn: AMOUNT_IN,
    permit2: PERMIT2,
    router: ROUTER,
    blockNumber: BLOCK_NUMBER,
    blockTimestamp: BLOCK_TIMESTAMP,
  })

  // Only the observed gap; no phantom insufficient-balance, no phantom permit2-allowance.
  expect(result).toEqual({
    requirements: [{ kind: 'erc20-approval', token: TOKEN, spender: PERMIT2, minimumAmount: AMOUNT_IN }],
    degraded: true,
  })
})

test('a throttled native eth_getBalance reports degraded rather than a zero balance', async () => {
  const client = stubClient({}, 'rate-limit')

  const result = await checkReadiness({
    client,
    trader: TRADER,
    currencyIn: 'native',
    amountIn: AMOUNT_IN,
    permit2: PERMIT2,
    router: ROUTER,
    blockNumber: BLOCK_NUMBER,
    blockTimestamp: BLOCK_TIMESTAMP,
  })

  expect(result).toEqual({ requirements: [], degraded: true })
})

test('a genuine zero balance (a read that landed) is still an insufficient-balance requirement, never degraded', async () => {
  const client = stubClient({
    ...entryFor(balanceCall(), balanceReturn(0n)),
    ...entryFor(erc20AllowanceCall(), erc20AllowanceReturn(AMOUNT_IN * 2n)),
    ...entryFor(permit2AllowanceCall(), permit2AllowanceReturn(AMOUNT_IN * 2n, Number(BLOCK_TIMESTAMP) + 3600)),
  })

  const result = await checkReadiness({
    client,
    trader: TRADER,
    currencyIn: TOKEN,
    amountIn: AMOUNT_IN,
    permit2: PERMIT2,
    router: ROUTER,
    blockNumber: BLOCK_NUMBER,
    blockTimestamp: BLOCK_TIMESTAMP,
  })

  expect(result).toEqual({
    requirements: [{ kind: 'insufficient-balance', token: TOKEN, required: AMOUNT_IN, available: 0n }],
    degraded: false,
  })
})

test('an on-chain read failure (a non-ERC20 token reverting) still fails safe to a requirement, not degraded', async () => {
  const client = stubClient({
    ...entryFor(balanceCall(), 'revert'),
    ...entryFor(erc20AllowanceCall(), erc20AllowanceReturn(AMOUNT_IN * 2n)),
    ...entryFor(permit2AllowanceCall(), permit2AllowanceReturn(AMOUNT_IN * 2n, Number(BLOCK_TIMESTAMP) + 3600)),
  })

  const result = await checkReadiness({
    client,
    trader: TRADER,
    currencyIn: TOKEN,
    amountIn: AMOUNT_IN,
    permit2: PERMIT2,
    router: ROUTER,
    blockNumber: BLOCK_NUMBER,
    blockTimestamp: BLOCK_TIMESTAMP,
  })

  expect(result.degraded).toBe(false)
  expect(result.requirements).toEqual([{ kind: 'insufficient-balance', token: TOKEN, required: AMOUNT_IN, available: 0n }])
})

// ---------------------------------------------------------------------------
// The never-throws contract, against a MALFORMED permit.
//
// `checkReadiness` promises never to throw for a business outcome — every
// failure widens the requirement set instead. Adopting viem's `isAddressEqual`
// (R3) put that promise at risk in a way a lowercased string compare never
// could: `isAddressEqual` THROWS `InvalidAddressError` on a malformed operand
// where the old helper simply returned false. `permit.details.token` and
// `permit.spender` are the only two operands here that a caller supplies, and
// `permit.spender` in particular was validated NOWHERE at the time — while a
// comment in this module asserted that it was.
//
// `router.ts#validateSwapRequest` now rejects both pre-RPC, but that is a first
// line rather than a guarantee: `checkReadiness` is called directly by tests
// and reachable by anyone assembling their own search wiring. So the contract
// is tested where the contract lives.
// ---------------------------------------------------------------------------

test('(k) a malformed permit address does not throw — the permit simply does not cover the trade', async () => {
  const client = stubClient({
    ...entryFor(balanceCall(), balanceReturn(AMOUNT_IN * 2n)),
    ...entryFor(erc20AllowanceCall(), erc20AllowanceReturn(AMOUNT_IN * 2n)),
    // Deliberately the shape of case (c): the on-chain Permit2 allowance is EXPIRED, so the only
    // thing that could make this trade ready is the supplied permit. If the malformed field were
    // ignored rather than rejected, this would come back with no requirements at all.
    ...entryFor(permit2AllowanceCall(), permit2AllowanceReturn(AMOUNT_IN * 2n, Number(BLOCK_TIMESTAMP) - 10)),
  })

  const malformed = [
    validPermit({ spender: '0xnope' as never }),
    validPermit({ details: { ...validPermit().details, token: '0xnope' as never } }),
    validPermit({ spender: `0x${'aa'.repeat(19)}` as never }), // 19 bytes — the classic truncation
  ]

  for (const permit of malformed) {
    const result = await checkReadiness({
      client,
      trader: TRADER,
      currencyIn: TOKEN,
      amountIn: AMOUNT_IN,
      permit2: PERMIT2,
      router: ROUTER,
      permit,
      blockNumber: BLOCK_NUMBER,
      blockTimestamp: BLOCK_TIMESTAMP,
    })
    // Fails SAFE: an unverifiable permit yields the requirement, never a silently-accepted one.
    expect(result.requirements).toEqual([{ kind: 'permit2-allowance', token: TOKEN, spender: ROUTER, minimumAmount: AMOUNT_IN }])
    // ...and not by way of `degraded`, which would wrongly claim a read never landed.
    expect(result.degraded).toBe(false)
  }
})
