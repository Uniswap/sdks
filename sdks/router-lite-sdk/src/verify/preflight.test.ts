import { expect, test } from 'bun:test'
import type { Hex, PublicClient } from 'viem'
import { getAddress } from 'viem'

import {
  connectionRefusedError,
  headerNotFoundError,
  nonexistentBlockError,
  rateLimitHttpError,
  rateLimitRpcError,
  timeoutError,
} from '../internal/testing'
import type { EncodedTx } from '../types'

import { preflightTx } from './preflight'

// ---------------------------------------------------------------------------
// Stub client — simple keyed by (method, to, data) to simulate success or
// error responses with revert data.
// ---------------------------------------------------------------------------

function stubClient(response: { ok: true; data: Hex } | { ok: false; error: Error }): Pick<PublicClient, 'request'> {
  return {
    async request(_args: any) {
      if (response.ok) {
        return response.data
      } else {
        throw response.error
      }
    },
  } as unknown as Pick<PublicClient, 'request'>
}

const ROUTER = getAddress('0x0000000000000000000000000000000000000001')
const TRADER = getAddress('0x0000000000000000000000000000000000000002')
const BLOCK_NUMBER = 100n

// Scenario 1: Success (any return data) → { ok: true }
test('(1) successful eth_call returns { ok: true }', async () => {
  const tx: EncodedTx = {
    to: ROUTER,
    data: '0x12345678' as Hex,
    value: 0n,
  }

  const client = stubClient({ ok: true, data: '0xabcd' as Hex })

  const result = await preflightTx(client, tx, TRADER, BLOCK_NUMBER)

  expect(result).toEqual({ ok: true })
})

// Scenario 2: Revert with data → { ok: false, revertData }
test('(2) revert with data extracts revertData verbatim', async () => {
  const tx: EncodedTx = {
    to: ROUTER,
    data: '0x12345678' as Hex,
    value: 0n,
  }

  const revertData = '0x08c379a00000000000000000000000000000000000000000000000000000000000000020' as Hex
  const error = new Error('execution reverted')
  ;(error as any).data = revertData

  const client = stubClient({ ok: false, error })

  const result = await preflightTx(client, tx, TRADER, BLOCK_NUMBER)

  expect(result).toEqual({ ok: false, kind: 'reverted', revertData })
})

// Scenario 3: Revert without data → { ok: false, kind: 'reverted' }
test("(3) revert without revert data returns { ok: false, kind: 'reverted' }", async () => {
  const tx: EncodedTx = {
    to: ROUTER,
    data: '0x12345678' as Hex,
    value: 1000n,
  }

  const error = new Error('execution reverted')

  const client = stubClient({ ok: false, error })

  const result = await preflightTx(client, tx, TRADER, BLOCK_NUMBER)

  expect(result).toEqual({ ok: false, kind: 'reverted' })
})

// ---------------------------------------------------------------------------
// Scenario 4: the failure channel. A revert is a verdict on the transaction; a
// 429/timeout/dead socket is a verdict on the provider and none on the
// transaction. `verifyLeader` fails a route over the first and only marks it
// `unverified` for the second, so the two must never collapse into one
// `{ ok: false }` (FW2 — the shape that let a provider hiccup during
// verification be reported as a confident `no-route`).
// ---------------------------------------------------------------------------

const TX: EncodedTx = { to: ROUTER, data: '0x12345678' as Hex, value: 0n }

test("(4) a transport failure is kind 'transport', never a revert verdict, and carries no revertData", async () => {
  for (const makeError of [rateLimitHttpError, rateLimitRpcError, timeoutError, connectionRefusedError]) {
    const result = await preflightTx(stubClient({ ok: false, error: makeError() }), TX, TRADER, BLOCK_NUMBER)
    expect(result).toEqual({ ok: false, kind: 'transport' })
  }
})

test("(5) a 429 that also happens to carry revert data is still a revert — real revert evidence wins", async () => {
  // Defense against a provider that returns a revert payload inside an unlucky HTTP status: the
  // revert data is authoritative evidence about the call, so it must not be discarded as a hiccup.
  const error = Object.assign(rateLimitHttpError(), { data: '0xdeadbeef' as Hex })

  const result = await preflightTx(stubClient({ ok: false, error }), TX, TRADER, BLOCK_NUMBER)

  expect(result).toEqual({ ok: false, kind: 'reverted', revertData: '0xdeadbeef' })
})

test("(6) a node that cannot serve the pinned block is kind 'transport', never a fabricated 'reverted' (C4-H1)", async () => {
  // The preflight half of C4-H1. None of these mentions a revert, so they used to fall through the
  // classifier's `execution` default and land in the `reverted` branch below — inventing an
  // authoritative "this transaction would fail" out of a call the node never executed, which
  // `verifyLeader` then wrote into the route as `execution: 'failed'`.
  for (const makeError of [headerNotFoundError, nonexistentBlockError]) {
    const result = await preflightTx(stubClient({ ok: false, error: makeError() }), TX, TRADER, BLOCK_NUMBER)
    expect(result).toEqual({ ok: false, kind: 'transport' })
  }

  for (const message of ['missing trie node 0xabcd', 'unknown block', 'state at block 100 is not available']) {
    const result = await preflightTx(stubClient({ ok: false, error: new Error(message) }), TX, TRADER, BLOCK_NUMBER)
    expect(result).toEqual({ ok: false, kind: 'transport' })
  }
})

// ---------------------------------------------------------------------------
// Scenario 7 (R1): the geth-shaped nested revert. This is the shape a real geth
// node's revert arrives in through viem — the payload two levels down, at
// `cause.data.data` — and it is exactly what this file's now-deleted local
// `extractRevertData` could not see: that copy looked at `err.data` and
// `err.cause.data` only, never stepping INTO `cause.data` to read its `.data`.
// So against every geth/erigon endpoint `RankedRoute.revertData` came back
// empty precisely when a caller wanted the reason bytes. `revertDataOf` (the
// one walker in `internal/rpcErrors.ts`) reads it, so preflight does now too.
//
// Note the error carries NO `code: 3` and no revert TEXT — classification here
// rides on the revert data itself, which is what makes this the shape that
// regresses silently rather than loudly.
// ---------------------------------------------------------------------------

test('(7) a geth-shaped nested revert (cause.data.data) surfaces its revertData', async () => {
  const error = Object.assign(new Error('Execution reverted for an unknown reason.'), {
    cause: { data: { data: '0x1234abcd' as Hex } },
  })

  const result = await preflightTx(stubClient({ ok: false, error }), TX, TRADER, BLOCK_NUMBER)

  expect(result).toEqual({ ok: false, kind: 'reverted', revertData: '0x1234abcd' })
})

test("(8) a data-less revert omits `revertData` entirely — never the empty '0x'", async () => {
  // The other half of the old copy's damage, and the one that corrupts a downstream DECISION rather
  // than merely losing information: `quote/quote.ts` treats "no revert data" as the amount-
  // independent, pool-absent shape that may be cached across requests. A literal '0x' reported as
  // data says "this revert named a reason" when it named none. The field must be ABSENT, so
  // `'revertData' in result` is false — not present-and-empty.
  for (const shape of [{ data: '0x' as Hex }, { cause: { data: { data: '0x' as Hex } } }]) {
    const error = Object.assign(new Error('execution reverted'), shape)
    const result = await preflightTx(stubClient({ ok: false, error }), TX, TRADER, BLOCK_NUMBER)
    expect(result).toEqual({ ok: false, kind: 'reverted' })
    expect('revertData' in result).toBe(false)
  }
})
