import { afterEach, describe, expect, test } from 'bun:test'
import type { Address, Hex, Log, PublicClient } from 'viem'
import { decodeFunctionData, encodeAbiParameters, encodeEventTopics, toHex, zeroAddress } from 'viem'

import {
  MAX_DEADLINE_SECONDS,
  MAX_HINTS_PER_REQUEST,
  MAX_HOOK_DATA_BYTES,
  HINT_DISCREDIT_FAILURE_BLOCKS,
  UR_ADDRESS_THIS,
  UR_MSG_SENDER,
} from './constants'
import { RouterConfigError } from './errors'
import { MULTICALL3_ABI, V2_FACTORY_ABI } from './internal/abis'
import { sortAddresses } from './internal/currency'
import { MULTICALL3_ADDRESS } from './internal/multicall'
import {
  AMOUNT_IN,
  BLOCK_HASH,
  BLOCK_NUMBER,
  BLOCK_TIMESTAMP,
  baseManifest,
  CHAIN_ID,
  directProbes,
  entryFor,
  MID,
  PERMIT2,
  stubClient,
  TOKEN_A,
  TOKEN_B,
  TRADER,
  UNIVERSAL_ROUTER,
  V2_FACTORY,
  V4_POOL_MANAGER,
  v2Return,
  v4Return,
  WRAPPED,
} from './internal/routerFixture'
import {
  assertResultCoherent,
  rateLimitHttpError,
  recordStubViolation,
  serveAggregate3,
  takeStubViolations,
  v2Ref,
  v4Ref,
} from './internal/testing'
import { manifestFor } from './manifest'
import { isDiscredited, PoolIndex } from './pools/poolIndex'
import { computeV2PairAddress, v2Module } from './protocols/v2'
import { v4Module } from './protocols/v4'
import { createRouter } from './router'
import type { Router } from './router'
import type {
  ChainManifest,
  Permit2PermitSingle,
  PoolHint,
  PoolKey,
  QuoteRequest,
  QuoteResult,
  SwapRequest,
  SwapResult,
} from './types'

// ---------------------------------------------------------------------------
// The facade is exercised end to end against the *real* v2/v4 protocol
// modules (no stub ProtocolModule here — `createRouter` hardwires the real
// ones, so a test double for them would never catch a wiring bug between the
// facade and the actual encode/decode paths). Only the `PublicClient` is
// stubbed, scripted per test, with the "unregistered call reverts" convention:
// a measurement the script does not answer is a pool that is not there. The
// chain, the manifest and that scripted client are `internal/routerFixture.ts`,
// shared with the facade's two sibling suites.
//
// THIS FILE IS THE BODY: validation, the end-to-end swap/quote paths, hints and
// hookData, the index lifecycle, transport options, RPC sequencing, Multicall3
// adoption, and the two-searches-on-one-router properties. Two subjects that had
// grown into self-contained narratives live next door instead, because they are
// read as units and answer one question each:
//
//   * `router.classify.test.ts` — `classifyQuote`/`classifySwap` as PURE
//     functions over hand-built inputs, plus `assertResultCoherent`'s verdict on
//     each result. No client, no RPC.
//   * `router.degraded.test.ts` — what a degraded provider is allowed to make the
//     facade say: a 429 on `eth_call` alone, a lagging replica, a head that goes
//     backwards, a lost preflight or readiness read. Never a confident no-route.
// ---------------------------------------------------------------------------

/** A client that throws on every method — used to prove a validation failure happens before any
 * RPC: if validation ordering ever regressed, these tests would fail with *this* error instead of
 * the expected `RouterConfigError`, rather than silently passing because the stub happened to
 * tolerate the call. */
function poisonedClient(): PublicClient {
  const boom = (): never => {
    throw new Error('unexpected RPC call: validation should have thrown before any RPC')
  }
  return { request: boom, getLogs: boom, getChainId: boom } as unknown as PublicClient
}

/**
 * Asserts a request got *past* synchronous validation, without needing a working client.
 *
 * A rejected request throws `RouterConfigError` before any RPC; one that passes reaches
 * `ensureManifestValidated`, where {@link poisonedClient}'s throw is (correctly) swallowed into an
 * `rpc-unavailable` result rather than propagated. So "resolves at all, as `inconclusive`" is
 * exactly "validation let this through" — and it is the assertion that keeps every bound below
 * honest about its boundary: a cap that also rejected the legal value at the cap would fail here.
 */
async function expectPassesValidation(p: Promise<QuoteResult | SwapResult>): Promise<void> {
  expect((await p).status).toBe('inconclusive')
}

/** A real `PairCreated` log for (a, b) at `manifest`'s v2 factory — decodable by `v2Module.parsePoolLog`. */
function pairCreatedLog(manifest: ChainManifest, a: Address, b: Address, blockNumber: bigint): Log<bigint, number, false> {
  const [token0, token1] = sortAddresses(a, b)
  const pair = computeV2PairAddress(manifest.v2!.factory, a, b)
  return {
    address: manifest.v2!.factory,
    topics: encodeEventTopics({ abi: V2_FACTORY_ABI, eventName: 'PairCreated', args: { token0, token1 } }),
    data: encodeAbiParameters([{ type: 'address' }, { type: 'uint256' }], [pair, 1n]),
    blockNumber,
  } as unknown as Log<bigint, number, false>
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('createRouter — validation (before any RPC)', () => {
  test('tokenIn === tokenOut (family-normalized against wrappedNative) throws RouterConfigError', async () => {
    const manifest = baseManifest()
    const router = createRouter({ client: poisonedClient(), manifest })

    await expect(
      router.getSwap({ tokenIn: 'native', tokenOut: manifest.wrappedNative, amountIn: AMOUNT_IN, trader: TRADER }),
    ).rejects.toThrow(RouterConfigError)
    await expect(router.getQuote({ tokenIn: TOKEN_A, tokenOut: TOKEN_A, amountIn: AMOUNT_IN })).rejects.toThrow(RouterConfigError)
  })

  test('amountIn <= 0 throws RouterConfigError', async () => {
    const manifest = baseManifest()
    const router = createRouter({ client: poisonedClient(), manifest })

    await expect(router.getQuote({ tokenIn: TOKEN_A, tokenOut: TOKEN_B, amountIn: 0n })).rejects.toThrow(RouterConfigError)
    await expect(router.getQuote({ tokenIn: TOKEN_A, tokenOut: TOKEN_B, amountIn: -1n })).rejects.toThrow(RouterConfigError)
  })

  test('a swap request with no trader throws RouterConfigError', async () => {
    const manifest = baseManifest()
    const router = createRouter({ client: poisonedClient(), manifest })

    const req = { tokenIn: TOKEN_A, tokenOut: TOKEN_B, amountIn: AMOUNT_IN } as SwapRequest
    await expect(router.getSwap(req)).rejects.toThrow(RouterConfigError)
  })

  test('slippageBps out of range (non-integer, negative, or > 10000) throws RouterConfigError', async () => {
    const manifest = baseManifest()
    const router = createRouter({ client: poisonedClient(), manifest })
    const base: SwapRequest = { tokenIn: TOKEN_A, tokenOut: TOKEN_B, amountIn: AMOUNT_IN, trader: TRADER }

    await expect(router.getSwap({ ...base, slippageBps: 10_001 })).rejects.toThrow(RouterConfigError)
    await expect(router.getSwap({ ...base, slippageBps: -1 })).rejects.toThrow(RouterConfigError)
    await expect(router.getSwap({ ...base, slippageBps: 1.5 })).rejects.toThrow(RouterConfigError)
  })

  test('a zero-address or Universal Router sentinel trader/recipient throws RouterConfigError', async () => {
    const manifest = baseManifest()
    const router = createRouter({ client: poisonedClient(), manifest })
    const base: SwapRequest = { tokenIn: TOKEN_A, tokenOut: TOKEN_B, amountIn: AMOUNT_IN, trader: TRADER }

    await expect(router.getSwap({ ...base, trader: zeroAddress })).rejects.toThrow(RouterConfigError)
    await expect(router.getSwap({ ...base, trader: UR_MSG_SENDER })).rejects.toThrow(RouterConfigError)
    await expect(router.getSwap({ ...base, recipient: zeroAddress })).rejects.toThrow(RouterConfigError)
    await expect(router.getSwap({ ...base, recipient: UR_ADDRESS_THIS })).rejects.toThrow(RouterConfigError)
  })

  // -------------------------------------------------------------------------------------------
  // R3: a malformed address is a REQUEST error, named and thrown pre-RPC.
  //
  // `Address` is a compile-time claim about a value a stranger may have composed. Before these
  // checks, `'0xnope'` sailed through every lowercased string comparison in the request path and
  // surfaced much later as a raw viem `InvalidAddressError` thrown from inside an encoder or from
  // `eth_call` param formatting — a mid-search stack trace, from a package whose whole validation
  // posture is "reject the request synchronously, before any RPC". `poisonedClient` is what proves
  // the "pre-RPC" half: any RPC at all fails these with a different error.
  // -------------------------------------------------------------------------------------------

  const MALFORMED: Address[] = [
    '0xnope' as Address, // not hex, too short
    `0x${'aa'.repeat(19)}` as Address, // 19 bytes — one short, the classic truncation
    `0x${'aa'.repeat(21)}` as Address, // 21 bytes — one long
    'not-an-address-at-all' as Address, // no 0x prefix
  ]

  test("a malformed trader throws RouterConfigError before any RPC, not a viem InvalidAddressError (R3)", async () => {
    const router = createRouter({ client: poisonedClient(), manifest: baseManifest() })
    for (const trader of MALFORMED) {
      const p = router.getSwap({ tokenIn: TOKEN_A, tokenOut: TOKEN_B, amountIn: AMOUNT_IN, trader })
      await expect(p).rejects.toThrow(RouterConfigError)
      await expect(p).rejects.toThrow(/trader is not a valid address/)
    }
    // An EMPTY trader keeps its own, older message: `!req.trader` is checked first, and "you did
    // not supply one" is a more useful answer than "the one you supplied is malformed".
    await expect(
      router.getSwap({ tokenIn: TOKEN_A, tokenOut: TOKEN_B, amountIn: AMOUNT_IN, trader: '' as Address }),
    ).rejects.toThrow(/swap requests require a trader address/)
  })

  test('a malformed recipient throws RouterConfigError before any RPC (R3)', async () => {
    const router = createRouter({ client: poisonedClient(), manifest: baseManifest() })
    const base: SwapRequest = { tokenIn: TOKEN_A, tokenOut: TOKEN_B, amountIn: AMOUNT_IN, trader: TRADER }
    for (const recipient of MALFORMED) {
      await expect(router.getSwap({ ...base, recipient })).rejects.toThrow(/recipient is not a valid address/)
    }
  })

  test('a malformed tokenIn/tokenOut throws RouterConfigError, for quotes as well as swaps (R3)', async () => {
    const router = createRouter({ client: poisonedClient(), manifest: baseManifest() })
    for (const bad of MALFORMED) {
      await expect(router.getQuote({ tokenIn: bad, tokenOut: TOKEN_B, amountIn: AMOUNT_IN })).rejects.toThrow(
        /tokenIn must be 'native' or a valid address/,
      )
      await expect(router.getQuote({ tokenIn: TOKEN_A, tokenOut: bad, amountIn: AMOUNT_IN })).rejects.toThrow(
        /tokenOut must be 'native' or a valid address/,
      )
      await expect(
        router.getSwap({ tokenIn: bad, tokenOut: TOKEN_B, amountIn: AMOUNT_IN, trader: TRADER }),
      ).rejects.toThrow(RouterConfigError)
    }
    // 'native' is not an address and must still be accepted — the check is a union, not a narrowing.
    await expectPassesValidation(router.getQuote({ tokenIn: 'native', tokenOut: TOKEN_B, amountIn: AMOUNT_IN }))
  })

  test('a malformed hint address throws RouterConfigError naming the field, pre-RPC (R3)', async () => {
    const router = createRouter({ client: poisonedClient(), manifest: baseManifest() })
    const quote = (hints: PoolHint[]): Promise<QuoteResult> =>
      router.getQuote({ tokenIn: TOKEN_A, tokenOut: TOKEN_B, amountIn: AMOUNT_IN, hints })

    await expect(quote([{ protocol: 'v2', token0: '0xnope' as Address, token1: TOKEN_B }])).rejects.toThrow(
      /hint\[0\]\.token0 is not a valid address/,
    )
    await expect(quote([{ protocol: 'v2', token0: TOKEN_A, token1: '0xnope' as Address }])).rejects.toThrow(
      /hint\[0\]\.token1 is not a valid address/,
    )
    await expect(
      quote([{ protocol: 'v3', token0: TOKEN_A, token1: TOKEN_B, fee: 3000, pool: '0xnope' as Address }]),
    ).rejects.toThrow(/hint\[0\]\.pool is not a valid address/)
    // The index is 1-based on the offending entry, not on the array: a request may carry up to
    // MAX_HINTS_PER_REQUEST of them and the caller has to be able to find the bad one.
    await expect(
      quote([
        { protocol: 'v2', token0: TOKEN_A, token1: TOKEN_B },
        { protocol: 'v2', token0: TOKEN_A, token1: '0xnope' as Address },
      ]),
    ).rejects.toThrow(/hint\[1\]\.token1 is not a valid address/)
    // v4 spells its addresses inside `poolKey`; the field path in the error says so.
    await expect(
      quote([
        {
          protocol: 'v4',
          poolKey: { currency0: '0xnope' as Address, currency1: TOKEN_B, fee: 3000, tickSpacing: 60, hooks: zeroAddress },
        },
      ]),
    ).rejects.toThrow(/hint\[0\]\.poolKey\.currency0 is not a valid address/)
    // address(0) hooks is the no-hooks case and must remain perfectly valid.
    await expectPassesValidation(
      quote([
        {
          protocol: 'v4',
          poolKey: { currency0: TOKEN_A, currency1: TOKEN_B, fee: 3000, tickSpacing: 60, hooks: zeroAddress },
        },
      ]),
    )
  })

  test('ingestPool validates hint addresses too — the other door into the long-lived index (R3)', async () => {
    // A malformed address reaching the index through `ingestPool` would be a PERMANENT resident
    // (the index outlives the request), not a one-request mistake, so this door is checked as
    // strictly as the request path.
    const router = createRouter({ client: poisonedClient(), manifest: baseManifest() })
    await expect(router.ingestPool({ protocol: 'v2', token0: '0xnope' as Address, token1: TOKEN_B })).rejects.toThrow(
      /hint\[0\]\.token0 is not a valid address/,
    )
  })

  test('a lowercase (non-checksummed) address is accepted — strict: false is deliberate (R3)', async () => {
    // Every JSON-RPC response and most config files carry lowercase addresses, and every comparison
    // in this package is case-insensitive. Demanding EIP-55 casing would reject correct input.
    const router = createRouter({ client: poisonedClient(), manifest: baseManifest() })
    await expectPassesValidation(
      router.getSwap({
        tokenIn: TOKEN_A.toLowerCase() as Address,
        tokenOut: TOKEN_B.toLowerCase() as Address,
        amountIn: AMOUNT_IN,
        trader: TRADER.toLowerCase() as Address,
      }),
    )
  })

  test("a malformed permit.spender or permit.details.token throws RouterConfigError pre-RPC", async () => {
    // `permit.spender` is the field this wave initially MISSED: nothing validated it, yet
    // `verify/readiness.ts#isPermitValid` and `encode/ur20.ts` both began comparing it with
    // `isAddressEqual`, which throws. Downstream neither can report a `RouterConfigError` about a
    // request field — and `checkReadiness` is documented never to throw at all — so the request
    // path is where a malformed permit has to be caught.
    const router = createRouter({ client: poisonedClient(), manifest: baseManifest() })
    const permitBase: Permit2PermitSingle = {
      details: { token: TOKEN_A, amount: AMOUNT_IN, expiration: 2_000_000_000, nonce: 0 },
      spender: UNIVERSAL_ROUTER,
      sigDeadline: 2_000_000_000n,
      signature: '0xabcd' as Hex,
    }
    const swap = (permit: Permit2PermitSingle): Promise<SwapResult> =>
      router.getSwap({ tokenIn: TOKEN_A, tokenOut: TOKEN_B, amountIn: AMOUNT_IN, trader: TRADER, permit })

    for (const bad of MALFORMED) {
      await expect(swap({ ...permitBase, spender: bad })).rejects.toThrow(/permit\.spender is not a valid address/)
      await expect(swap({ ...permitBase, details: { ...permitBase.details, token: bad } })).rejects.toThrow(
        /permit\.details\.token is not a valid address/,
      )
    }
    for (const p of [swap({ ...permitBase, spender: '' as Address }), swap({ ...permitBase, details: { ...permitBase.details, token: '' as Address } })]) {
      await expect(p).rejects.toThrow(RouterConfigError)
    }
  })

  test("a permit's NUMERIC fields are validated pre-RPC too — a fractional expiration is not a mid-search RangeError", async () => {
    // The address half of a permit was checked; the numeric half was not. `expiration` and `nonce`
    // are plain `number`s reaching `BigInt(permit.details.expiration)` in
    // `verify/readiness.ts#isPermitValid` — the exact `slippageBps`/`deadlineSeconds` hazard, one
    // layer deeper: a fractional value is a bare `RangeError` thrown from inside the readiness
    // source, which `getSwap`/`swaps` do not catch (they catch `RpcUnavailableError` only),
    // out of a function whose header promises it NEVER THROWS FOR A BUSINESS OUTCOME.
    const router = createRouter({ client: poisonedClient(), manifest: baseManifest() })
    const permitBase: Permit2PermitSingle = {
      details: { token: TOKEN_A, amount: AMOUNT_IN, expiration: 2_000_000_000, nonce: 0 },
      spender: UNIVERSAL_ROUTER,
      sigDeadline: 2_000_000_000n,
      signature: '0xabcd' as Hex,
    }
    const swap = (permit: Permit2PermitSingle): Promise<SwapResult> =>
      router.getSwap({ tokenIn: TOKEN_A, tokenOut: TOKEN_B, amountIn: AMOUNT_IN, trader: TRADER, permit })
    const withDetails = (details: Partial<Permit2PermitSingle['details']>): Permit2PermitSingle => ({
      ...permitBase,
      details: { ...permitBase.details, ...details },
    })

    // uint48, so [0, 2^48) — and an integer, which is the half that turns into a `RangeError`.
    const UINT48 = 2 ** 48
    for (const expiration of [1.5, NaN, Infinity, -1, UINT48, 1e30]) {
      const p = swap(withDetails({ expiration }))
      await expect(p).rejects.toThrow(RouterConfigError)
      await expect(p).rejects.toThrow(/permit\.details\.expiration must be an integer in \[0, 281474976710656\)/)
    }
    for (const nonce of [1.5, NaN, -1, UINT48]) {
      const p = swap(withDetails({ nonce }))
      await expect(p).rejects.toThrow(RouterConfigError)
      await expect(p).rejects.toThrow(/permit\.details\.nonce must be an integer in \[0, 281474976710656\)/)
    }
    // `amount` is a uint160 on the wire and a `bigint` in the type — a number here is a caller who
    // built the struct by hand, and it compares (`<`) against `amountIn` without complaint.
    for (const amount of [-1n, 2n ** 160n, 1 as unknown as bigint]) {
      const p = swap(withDetails({ amount }))
      await expect(p).rejects.toThrow(RouterConfigError)
      await expect(p).rejects.toThrow(/permit\.details\.amount must be a bigint in \[0, 2\^160\)/)
    }
    for (const sigDeadline of [-1n, 1 as unknown as bigint]) {
      const p = swap({ ...permitBase, sigDeadline })
      await expect(p).rejects.toThrow(RouterConfigError)
      await expect(p).rejects.toThrow(/permit\.sigDeadline must be a non-negative bigint/)
    }

    // The boundaries themselves are legal: 0 and 2^48-1 for the uint48s, 0n and 2^160-1 for the
    // amount — a bound that also rejected the value AT the bound would be a second bug.
    await expectPassesValidation(swap(withDetails({ expiration: 0, nonce: 0, amount: 0n })))
    await expectPassesValidation(swap(withDetails({ expiration: UINT48 - 1, nonce: UINT48 - 1, amount: 2n ** 160n - 1n })))
    await expectPassesValidation(swap({ ...permitBase, sigDeadline: 0n }))
  })

  test('a manifest address field that is not an address throws RouterConfigError at createRouter, not a viem error', async () => {
    // `ChainManifest` types these as `Address`, but a caller assembles one by hand — from a config
    // file, a paste, an env var. Nothing checked them, and once `assertWrappedNativeConsistency`
    // started comparing with `isAddressEqual` a malformed one raised a raw viem
    // `InvalidAddressError` out of a config check whose whole job is `RouterConfigError`.
    const cases: [string, () => ChainManifest][] = [
      ['wrappedNative', () => ({ ...baseManifest(), wrappedNative: '0xnope' as Address })],
      [
        'execution.wrappedNative',
        () => ({ ...baseManifest(), execution: { ...baseManifest().execution!, wrappedNative: '0xnope' as Address } }),
      ],
      ['execution.permit2', () => ({ ...baseManifest(), execution: { ...baseManifest().execution!, permit2: '0xnope' as Address } })],
      ['execution.address', () => ({ ...baseManifest(), execution: { ...baseManifest().execution!, address: '0xnope' as Address } })],
      ['v2.factory', () => ({ ...baseManifest(), v2: { ...baseManifest().v2!, factory: '0xnope' as Address } })],
      ['v4.poolManager', () => ({ ...baseManifest(), v4: { ...baseManifest().v4!, poolManager: '0xnope' as Address } })],
      ['v4.quoter', () => ({ ...baseManifest(), v4: { ...baseManifest().v4!, quoter: '0xnope' as Address } })],
      ['coreIntermediates[0]', () => ({ ...baseManifest(), coreIntermediates: ['0xnope' as Address] })],
    ]
    for (const [label, build] of cases) {
      expect(() => createRouter({ client: poisonedClient(), manifest: build() }), label).toThrow(RouterConfigError)
      expect(() => createRouter({ client: poisonedClient(), manifest: build() }), label).toThrow(
        new RegExp(`manifest ${label.replace(/[.[\]]/g, '\\$&')} is not a valid address`),
      )
    }
  })

  test('amountIn at or above 2^128 (the v4 quoter uint128 ceiling) throws RouterConfigError, for quotes and swaps alike (C4-H4)', async () => {
    const manifest = baseManifest()
    const router = createRouter({ client: poisonedClient(), manifest })
    const ceiling = 2n ** 128n

    await expect(router.getQuote({ tokenIn: TOKEN_A, tokenOut: TOKEN_B, amountIn: ceiling })).rejects.toThrow(RouterConfigError)
    await expect(
      router.getSwap({ tokenIn: TOKEN_A, tokenOut: TOKEN_B, amountIn: ceiling, trader: TRADER }),
    ).rejects.toThrow(RouterConfigError)
    // One wei below the ceiling is a legal (if absurd) request: the bound is exclusive, not a
    // round-number sanity limit, so it must not reject the largest encodable amount.
    await expectPassesValidation(router.getQuote({ tokenIn: TOKEN_A, tokenOut: TOKEN_B, amountIn: ceiling - 1n }))
  })

  test(`more than ${MAX_HINTS_PER_REQUEST} hints throws RouterConfigError — hints are unbounded writes into a process-lived index (C4-H4)`, async () => {
    const manifest = baseManifest()
    const router = createRouter({ client: poisonedClient(), manifest })
    const hintAt = (i: number): PoolHint => ({
      protocol: 'v4',
      poolKey: {
        currency0: TOKEN_A,
        currency1: TOKEN_B,
        fee: 3000,
        tickSpacing: 60,
        // A distinct hooks address per hint, so these are genuinely distinct pool keys rather than
        // one key repeated — the cap is about how many the caller may assert, not how many are unique.
        hooks: `0x${i.toString(16).padStart(40, '0')}` as Address,
      },
    })
    const req = (n: number): QuoteRequest => ({
      tokenIn: TOKEN_A,
      tokenOut: TOKEN_B,
      amountIn: AMOUNT_IN,
      hints: Array.from({ length: n }, (_, i) => hintAt(i)),
    })

    await expect(router.getQuote(req(MAX_HINTS_PER_REQUEST + 1))).rejects.toThrow(RouterConfigError)
    await expect(router.getSwap({ ...req(MAX_HINTS_PER_REQUEST + 1), trader: TRADER })).rejects.toThrow(RouterConfigError)
    // Exactly at the cap is allowed — it gets as far as the first RPC, which the poisoned client refuses.
    await expectPassesValidation(router.getQuote(req(MAX_HINTS_PER_REQUEST)))
  })

  test('deadlineSeconds must be a positive integer no greater than a day (C4-H4)', async () => {
    const manifest = baseManifest()
    const router = createRouter({ client: poisonedClient(), manifest })
    const base: SwapRequest = { tokenIn: TOKEN_A, tokenOut: TOKEN_B, amountIn: AMOUNT_IN, trader: TRADER }

    // The regression this closes: a fractional deadline used to reach `BigInt(req.deadlineSeconds)`
    // in `search/verifier.ts` and throw a bare RangeError from the middle of a search.
    await expect(router.getSwap({ ...base, deadlineSeconds: 1.5 })).rejects.toThrow(RouterConfigError)
    await expect(router.getSwap({ ...base, deadlineSeconds: 0 })).rejects.toThrow(RouterConfigError)
    await expect(router.getSwap({ ...base, deadlineSeconds: -60 })).rejects.toThrow(RouterConfigError)
    await expect(router.getSwap({ ...base, deadlineSeconds: MAX_DEADLINE_SECONDS + 1 })).rejects.toThrow(RouterConfigError)
    await expectPassesValidation(router.getSwap({ ...base, deadlineSeconds: MAX_DEADLINE_SECONDS }))
  })

  test('a recipient that is one of the plan\'s own contracts (tokenIn/tokenOut/UR/Permit2/WETH) throws RouterConfigError (C4-H4)', async () => {
    const manifest = baseManifest()
    const router = createRouter({ client: poisonedClient(), manifest })
    const base: SwapRequest = { tokenIn: TOKEN_A, tokenOut: TOKEN_B, amountIn: AMOUNT_IN, trader: TRADER }

    for (const recipient of [TOKEN_A, TOKEN_B, UNIVERSAL_ROUTER, PERMIT2, WRAPPED]) {
      await expect(router.getSwap({ ...base, recipient })).rejects.toThrow(RouterConfigError)
      // Case is not a loophole: these are compared case-insensitively.
      await expect(router.getSwap({ ...base, recipient: recipient.toUpperCase().replace('0X', '0x') as Address })).rejects.toThrow(
        RouterConfigError,
      )
    }
    // An ordinary third-party recipient still sails through to the first RPC.
    await expectPassesValidation(router.getSwap({ ...base, recipient: MID }))
  })

  test('malformed or oversized v4 hookData throws RouterConfigError naming the offending hint (C4-H4)', async () => {
    const manifest = baseManifest()
    const router = createRouter({ client: poisonedClient(), manifest })
    const poolKey: PoolKey = { currency0: TOKEN_A, currency1: TOKEN_B, fee: 3000, tickSpacing: 60, hooks: zeroAddress }
    const withHookData = (hookData: Hex): QuoteRequest => ({
      tokenIn: TOKEN_A,
      tokenOut: TOKEN_B,
      amountIn: AMOUNT_IN,
      hints: [{ protocol: 'v4', poolKey, hookData }],
    })

    const oversized = `0x${'ab'.repeat(MAX_HOOK_DATA_BYTES + 1)}` as Hex
    await expect(router.getQuote(withHookData(oversized))).rejects.toThrow(RouterConfigError)
    await expect(router.getQuote(withHookData('0xabc' as Hex))).rejects.toThrow(RouterConfigError) // odd-length
    await expect(router.getQuote(withHookData('abcd' as Hex))).rejects.toThrow(RouterConfigError) // no 0x prefix
    await expect(router.getQuote(withHookData('0xzz' as Hex))).rejects.toThrow(RouterConfigError) // not hex at all
    // The message must identify WHICH hint, since a request may carry up to MAX_HINTS_PER_REQUEST of them.
    await expect(router.getQuote(withHookData(oversized))).rejects.toThrow(new RegExp(TOKEN_A, 'i'))

    // Exactly at the cap, and empty data, are both fine.
    await expectPassesValidation(router.getQuote(withHookData(`0x${'ab'.repeat(MAX_HOOK_DATA_BYTES)}` as Hex)))
    await expectPassesValidation(router.getQuote(withHookData('0x')))
  })

  test('a Permit2 permit on a native tokenIn throws RouterConfigError', async () => {
    const manifest = baseManifest()
    const router = createRouter({ client: poisonedClient(), manifest })
    const permit: Permit2PermitSingle = {
      details: { token: TOKEN_B, amount: AMOUNT_IN, expiration: 2_000_000_000, nonce: 0 },
      spender: UNIVERSAL_ROUTER,
      sigDeadline: 2_000_000_000n,
      signature: '0x',
    }

    await expect(
      router.getSwap({ tokenIn: 'native', tokenOut: TOKEN_B, amountIn: AMOUNT_IN, trader: TRADER, permit }),
    ).rejects.toThrow(RouterConfigError)
  })

  test('a permit whose token does not match tokenIn throws RouterConfigError', async () => {
    const manifest = baseManifest()
    const router = createRouter({ client: poisonedClient(), manifest })
    // permit is for TOKEN_B, but tokenIn is TOKEN_A.
    const permit: Permit2PermitSingle = {
      details: { token: TOKEN_B, amount: AMOUNT_IN, expiration: 2_000_000_000, nonce: 0 },
      spender: UNIVERSAL_ROUTER,
      sigDeadline: 2_000_000_000n,
      signature: '0x',
    }

    await expect(
      router.getSwap({ tokenIn: TOKEN_A, tokenOut: TOKEN_B, amountIn: AMOUNT_IN, trader: TRADER, permit }),
    ).rejects.toThrow(RouterConfigError)
  })

  test('a manifest/client chainId mismatch throws RouterConfigError, cached across calls (no repeat getChainId)', async () => {
    const manifest = baseManifest()
    let chainIdCalls = 0
    const { client: base } = stubClient({ chainId: 8453 })
    const client = { ...base, getChainId: async () => (chainIdCalls++, 8453) } as unknown as PublicClient
    const router = createRouter({ client, manifest })

    await expect(router.getQuote({ tokenIn: TOKEN_A, tokenOut: TOKEN_B, amountIn: AMOUNT_IN })).rejects.toThrow(RouterConfigError)
    // Second call hits the same cached (rejected) validation rather than re-deriving it.
    await expect(router.getQuote({ tokenIn: TOKEN_A, tokenOut: TOKEN_B, amountIn: AMOUNT_IN })).rejects.toThrow(RouterConfigError)
    expect(chainIdCalls).toBe(1)
  })

  test('a transient (non-RouterConfigError) chainId RPC failure is NOT cached: this call is inconclusive, the next call retries and can succeed', async () => {
    const manifest = baseManifest()
    const [probe] = directProbes(v2Module, TOKEN_A, TOKEN_B, AMOUNT_IN, manifest)
    const [token0] = sortAddresses(TOKEN_A, TOKEN_B)
    const zeroForOne = token0.toLowerCase() === TOKEN_A.toLowerCase()

    const { client: base } = stubClient({ calls: entryFor(probe!.quote.call, v2Return(10n ** 24n, 10n ** 24n, zeroForOne)) })
    let chainIdCalls = 0
    const client = {
      ...base,
      async getChainId() {
        chainIdCalls++
        if (chainIdCalls === 1) throw new Error('network hiccup')
        return CHAIN_ID
      },
    } as unknown as PublicClient
    const router = createRouter({ client, manifest })

    const first = await router.getQuote({ tokenIn: TOKEN_A, tokenOut: TOKEN_B, amountIn: AMOUNT_IN })
    expect(first.status).toBe('inconclusive')
    if (first.status === 'inconclusive') expect(first.reason.code).toBe('rpc-unavailable')
    assertResultCoherent(first)

    const second = await router.getQuote({ tokenIn: TOKEN_A, tokenOut: TOKEN_B, amountIn: AMOUNT_IN })
    expect(second.status).toBe('quote') // not permanently bricked by the first call's transient failure
    expect(chainIdCalls).toBe(2) // retried rather than short-circuited by a cached rejection
    assertResultCoherent(second)
  })
})

describe('quote-only manifests (C4-P3)', () => {
  /** `baseManifest()` minus its `execution` bundle — a price-feed-only manifest that states
   * `wrappedNative` (still required at the top level) but never configures a Universal Router,
   * Permit2, or commandSet it will never use. */
  function quoteOnlyManifest(): ChainManifest {
    const { execution: _execution, ...rest } = baseManifest()
    return rest
  }

  test('getQuote works end to end with no execution bundle at all', async () => {
    const manifest = quoteOnlyManifest()
    expect(manifest.execution).toBeUndefined()
    const [probe] = directProbes(v2Module, TOKEN_A, TOKEN_B, AMOUNT_IN, manifest)
    const [token0] = sortAddresses(TOKEN_A, TOKEN_B)
    const zeroForOne = token0.toLowerCase() === TOKEN_A.toLowerCase()

    const { client } = stubClient({ calls: entryFor(probe!.quote.call, v2Return(10n ** 24n, 10n ** 24n, zeroForOne)) })
    const router = createRouter({ client, manifest })

    const res = await router.getQuote({ tokenIn: TOKEN_A, tokenOut: TOKEN_B, amountIn: AMOUNT_IN })
    expect(res.status).toBe('quote')
    if (res.status === 'quote') expect(res.best.quote.amountOut).toBeGreaterThan(0n)
    assertResultCoherent(res)
  })

  test('getSwap throws RouterConfigError before any RPC when the manifest has no execution bundle', async () => {
    const manifest = quoteOnlyManifest()
    const router = createRouter({ client: poisonedClient(), manifest })
    const req: SwapRequest = { tokenIn: TOKEN_A, tokenOut: TOKEN_B, amountIn: AMOUNT_IN, trader: TRADER }

    await expect(router.getSwap(req)).rejects.toThrow(RouterConfigError)
    await expect(router.getSwap(req)).rejects.toThrow(/no execution bundle/)
  })

  test('swaps() throws synchronously (before the async generator is ever driven) for the same reason', () => {
    const manifest = quoteOnlyManifest()
    const router = createRouter({ client: poisonedClient(), manifest })
    const req: SwapRequest = { tokenIn: TOKEN_A, tokenOut: TOKEN_B, amountIn: AMOUNT_IN, trader: TRADER }

    // `swaps()` validates before returning the generator (see `router.ts`), so the throw happens on
    // this call, not on the iterator's first `.next()`.
    expect(() => router.swaps(req)).toThrow(RouterConfigError)
  })

  // `quotes()`'s twin of the `swaps()` case above — both entry points share `startSearch` (`router.ts`),
  // whose synchronous `validate(req, manifest)` call runs before the async generator it returns is ever
  // constructed, for either request shape. A malformed `amountIn` (rather than the swap-only "no
  // execution bundle" check above) is what `validateQuoteRequest` alone can reject.
  test('quotes() throws synchronously (before the async generator is ever driven), same as swaps()', () => {
    const manifest = quoteOnlyManifest()
    const router = createRouter({ client: poisonedClient(), manifest })
    const req: QuoteRequest = { tokenIn: TOKEN_A, tokenOut: TOKEN_B, amountIn: 0n }

    expect(() => router.quotes(req)).toThrow(RouterConfigError)
  })

  test('manifest.wrappedNative disagreeing with manifest.execution.wrappedNative throws RouterConfigError at createRouter', () => {
    const manifest: ChainManifest = { ...baseManifest(), wrappedNative: `0x${'ff'.repeat(20)}` as Address }
    expect(() => createRouter({ client: poisonedClient(), manifest })).toThrow(RouterConfigError)
    expect(() => createRouter({ client: poisonedClient(), manifest })).toThrow(/does not match/)
  })

  test('manifest.wrappedNative disagreeing with manifest.execution.wrappedNative throws RouterConfigError at manifestFor', () => {
    expect(() =>
      manifestFor(1, { wrappedNative: `0x${'ff'.repeat(20)}` as Address }),
    ).toThrow(RouterConfigError)
  })
})

test('getSwap end-to-end: a pre-ingested v4 hint (on a fee tier no module speculates on) resolves to ready', async () => {
  const manifest = baseManifest()
  // fee/tickSpacing outside STANDARD_V4_CONFIGS: unreachable by the module's own `hypotheses`, only
  // by the hint the caller ingests up front.
  const poolKey: PoolKey = { currency0: TOKEN_A, currency1: TOKEN_B, fee: 2500, tickSpacing: 50, hooks: zeroAddress }
  const hint: PoolHint = { protocol: 'v4', poolKey }
  const leg = { pool: v4Ref(poolKey), currencyIn: TOKEN_A, currencyOut: TOKEN_B }
  const quoteCall = v4Module.encodeQuote([leg], AMOUNT_IN, manifest).call

  const { client } = stubClient({ calls: entryFor(quoteCall, v4Return(500n)) })
  const router = createRouter({ client, manifest })
  await router.ingestPool(hint)

  const req: SwapRequest = { tokenIn: TOKEN_A, tokenOut: TOKEN_B, amountIn: AMOUNT_IN, trader: TRADER }
  const res = await router.getSwap(req)

  expect(res.status).toBe('ready')
  if (res.status === 'ready') {
    expect(res.tx.to).toBe(manifest.execution!.address)
    expect(res.best.quote.amountOut).toBe(500n)
    // `best` is the ranked route, so the verification it is claiming is readable on it directly —
    // no reaching into `alternatives` to find out what happened to the leader.
    expect(res.best.execution).toBe('verified')
    expect(res.execution.verifiedAtBlock.number).toBeGreaterThan(0n)
    expect(res.execution.verifiedAtBlock.number).toBe(res.search.block.number)
    // C4-P7: `limits` echoes the compiled plan's own minAmountOut/deadline — the default 100bps
    // slippage against a 500-unit quote leaves 495; the default deadline window is 300s.
    expect(res.limits.minAmountOut).toBe(495n)
    expect(res.limits.deadline).toBeGreaterThan(0n)
  }
  assertResultCoherent(res)
})

test('a quote result carries plain QuotedRoutes: no execution/revertData rides along (FW5/P3 regression)', async () => {
  // Two direct pools price, so both `best` and `alternatives` are exercised. The engine's routes
  // always carry `execution` internally; a `QuoteResult` says they do not, and this is that claim.
  const manifest = baseManifest()
  const poolKey: PoolKey = { currency0: TOKEN_A, currency1: TOKEN_B, fee: 2500, tickSpacing: 50, hooks: zeroAddress }
  const v4Leg = { pool: v4Ref(poolKey), currencyIn: TOKEN_A, currencyOut: TOKEN_B }
  const [v2Probe] = directProbes(v2Module, TOKEN_A, TOKEN_B, AMOUNT_IN, manifest)
  const [token0] = sortAddresses(TOKEN_A, TOKEN_B)
  const zeroForOne = token0.toLowerCase() === TOKEN_A.toLowerCase()

  const { client } = stubClient({
    calls: {
      ...entryFor(v2Probe!.quote.call, v2Return(10n ** 24n, 10n ** 24n, zeroForOne)),
      ...entryFor(v4Module.encodeQuote([v4Leg], AMOUNT_IN, manifest).call, v4Return(500n)),
    },
  })
  const router = createRouter({ client, manifest })
  await router.ingestPool({ protocol: 'v4', poolKey })

  const res = await router.getQuote({ tokenIn: TOKEN_A, tokenOut: TOKEN_B, amountIn: AMOUNT_IN })

  expect(res.status).toBe('quote')
  if (res.status === 'quote') {
    expect(res.alternatives.length).toBeGreaterThan(0)
    for (const route of [res.best, ...res.alternatives]) {
      expect(Object.keys(route).sort()).toEqual(['quote', 'route'])
    }
  }
  assertResultCoherent(res)
})

test('an abort before the leader could be simulated resolves inconclusive WITH the route and its tx (FW5/P1 regression)', async () => {
  // The end-to-end half of the P1 regression. The deadline fires *inside* the first measurement
  // round, so the search prices a route and compiles its calldata, but its simulation never settles
  // (the scripted preflight hangs — the §5 carve-out: an in-flight preflight is not cancelled, and
  // its late answer must never decide anything) — leaving the leader `unverified`: nobody ruled it
  // out, nobody could confirm it. Everything the search established has to survive that.
  const manifest = baseManifest({ v2Block: BLOCK_NUMBER - 500n, v4: false })
  const [probe] = directProbes(v2Module, TOKEN_A, TOKEN_B, AMOUNT_IN, manifest)
  const [token0] = sortAddresses(TOKEN_A, TOKEN_B)
  const zeroForOne = token0.toLowerCase() === TOKEN_A.toLowerCase()

  const controller = new AbortController()
  const { client } = stubClient({
    calls: entryFor(probe!.quote.call, v2Return(10n ** 24n, 10n ** 24n, zeroForOne)),
    abortOnQuote: controller, // stands in for `AbortSignal.timeout(900)` firing mid-search
    preflight: ['hang'], // if one was dispatched before the abort was seen, it never answers
  })
  const router = createRouter({ client, manifest })

  const res = await router.getSwap({ tokenIn: TOKEN_A, tokenOut: TOKEN_B, amountIn: AMOUNT_IN, trader: TRADER, signal: controller.signal })

  expect(res.status).toBe('inconclusive')
  if (res.status === 'inconclusive') {
    expect(res.reason.code).toBe('aborted')
    expect(res.best?.quote.amountOut).toBeGreaterThan(0n) // the priced route survived the abort
    expect(res.best?.execution).toBe('unverified') // never simulated, never ruled out
    expect(res.tx?.to).toBe(manifest.execution!.address) // ...and so did the calldata compiled for it
  }
  expect(res.search.aborted).toBe(true)
  expect(res.alternatives).toEqual([]) // status-agnostic, and honestly empty: only one pool priced
  assertResultCoherent(res)
})

test('an abort whose leader had already REVERTED hands it back as an alternative, not as a lead (FINDING 1)', async () => {
  // Same abort, later in the search: the leader's preflight got through and the node rejected the
  // route, so the search kept looking and the deadline fired on the first adjacency scan. The
  // verdict is still `inconclusive` — discovery never finished — but the one thing the search *does*
  // know is that this candidate reverts, so it is reported as a failed alternative (with its
  // verbatim revert data) and its calldata is withheld.
  const manifest = baseManifest({ v2Block: BLOCK_NUMBER - 500n, v4: false })
  const [probe] = directProbes(v2Module, TOKEN_A, TOKEN_B, AMOUNT_IN, manifest)
  const [token0] = sortAddresses(TOKEN_A, TOKEN_B)
  const zeroForOne = token0.toLowerCase() === TOKEN_A.toLowerCase()

  const controller = new AbortController()
  const { client } = stubClient({
    calls: entryFor(probe!.quote.call, v2Return(10n ** 24n, 10n ** 24n, zeroForOne)),
    preflight: ['revert'],
    logs: () => {
      controller.abort()
      return []
    },
  })
  const router = createRouter({ client, manifest })

  const res = await router.getSwap({ tokenIn: TOKEN_A, tokenOut: TOKEN_B, amountIn: AMOUNT_IN, trader: TRADER, signal: controller.signal })

  expect(res.status).toBe('inconclusive')
  if (res.status === 'inconclusive') {
    expect(res.reason.code).toBe('aborted')
    expect(res.best).toBeUndefined() // the chain rejected it: not a lead, abort or no abort
    expect(res.tx).toBeUndefined()
  }
  expect(res.search.aborted).toBe(true)
  expect(res.alternatives).toHaveLength(1)
  expect(res.alternatives[0]!.execution).toBe('failed')
  expect(res.alternatives[0]!.revertData).toBe('0xdeadbeef') // declared on RankedRoute, not smuggled
  assertResultCoherent(res)
})

test('ingestPool rejects a hint with an unknown protocol as a RouterConfigError, not a bare TypeError', async () => {
  const manifest = baseManifest()
  const { client } = stubClient({})
  const router = createRouter({ client, manifest })
  const badHint = { protocol: 'v5', poolKey: {} } as unknown as PoolHint

  await expect(router.ingestPool(badHint)).rejects.toThrow(RouterConfigError)
})

test('needs-action carries requirements and an encoded tx when Permit2 allowance is unmet', async () => {
  const manifest = baseManifest()
  const [probe] = directProbes(v2Module, TOKEN_A, TOKEN_B, AMOUNT_IN, manifest)
  const [token0] = sortAddresses(TOKEN_A, TOKEN_B)
  const zeroForOne = token0.toLowerCase() === TOKEN_A.toLowerCase()

  const { client } = stubClient({
    calls: entryFor(probe!.quote.call, v2Return(10n ** 24n, 10n ** 24n, zeroForOne)),
    readiness: { erc20Allowance: 0n },
  })
  const router = createRouter({ client, manifest })

  const req: SwapRequest = { tokenIn: TOKEN_A, tokenOut: TOKEN_B, amountIn: AMOUNT_IN, trader: TRADER }
  const res = await router.getSwap(req)

  expect(res.status).toBe('needs-action')
  if (res.status === 'needs-action') {
    expect(res.requirements[0]!.kind).toBe('erc20-approval')
    expect(res.tx).toBeDefined()
    // C4-P7: the plan still compiles (and its limits are still echoed) even though execution is
    // gated on the trader meeting the listed requirements first.
    expect(res.limits.minAmountOut).toBeGreaterThan(0n)
    expect(res.limits.deadline).toBeGreaterThan(0n)
  }
  assertResultCoherent(res)
})

test('a total RPC outage (block-fetch failure) resolves to inconclusive, never throws — the report is manifest-derived, not aborted', async () => {
  const manifest = baseManifest() // v2 + v4 configured, v3 absent
  const { client } = stubClient({ throwOnBlockFetch: true })
  const router = createRouter({ client, manifest })

  const quoteRes = await router.getQuote({ tokenIn: TOKEN_A, tokenOut: TOKEN_B, amountIn: AMOUNT_IN })
  expect(quoteRes.status).toBe('inconclusive')
  if (quoteRes.status === 'inconclusive') {
    expect(quoteRes.reason.code).toBe('rpc-unavailable')
    // The search never ran long enough to be "aborted" — it never got a pinned block at all.
    expect(quoteRes.search.aborted).toBe(false)
    expect(quoteRes.search.discovery.v2.status).toBe('failed') // configured, but unreachable
    expect(quoteRes.search.discovery.v4.status).toBe('failed')
    expect(quoteRes.search.discovery.v3.status).toBe('disabled') // never configured at all
  }
  assertResultCoherent(quoteRes)

  const swapRes = await router.getSwap({ tokenIn: TOKEN_A, tokenOut: TOKEN_B, amountIn: AMOUNT_IN, trader: TRADER })
  expect(swapRes.status).toBe('inconclusive')
  if (swapRes.status === 'inconclusive') expect(swapRes.reason.code).toBe('rpc-unavailable')
  assertResultCoherent(swapRes)

  // The iterator-shaped surface gets the same treatment — never a rejected iterator: the outage is
  // the stream's one `final`, carrying the same result the promise surface answers with.
  const events = []
  for await (const e of router.quotes({ tokenIn: TOKEN_A, tokenOut: TOKEN_B, amountIn: AMOUNT_IN })) events.push(e)
  expect(events.map((e) => e.type)).toEqual(['final'])
  const finalEvent = events[0]!
  if (finalEvent.type === 'final') expect(finalEvent.result.status).toBe('inconclusive')
})

test('a completed search whose only candidate fails preflight resolves to no-route, with it returned as an alternative', async () => {
  // v2's deployment block sits above the stub's pinned head, so `uncovered()` is empty for every
  // adjacency scan and discovery reports `complete` without a single `getLogs` call — the search
  // still runs to genuine completion, it just never finds a second candidate to fall through to.
  const manifest = baseManifest({ v2Block: BLOCK_NUMBER + 1_000_000n, v4: false })
  const [probe] = directProbes(v2Module, TOKEN_A, TOKEN_B, AMOUNT_IN, manifest)
  const [token0] = sortAddresses(TOKEN_A, TOKEN_B)
  const zeroForOne = token0.toLowerCase() === TOKEN_A.toLowerCase()

  const { client, counters } = stubClient({
    calls: entryFor(probe!.quote.call, v2Return(10n ** 24n, 10n ** 24n, zeroForOne)),
    preflight: ['revert'],
  })
  const router = createRouter({ client, manifest })

  const req: SwapRequest = { tokenIn: TOKEN_A, tokenOut: TOKEN_B, amountIn: AMOUNT_IN, trader: TRADER }
  const res = await router.getSwap(req)

  expect(res.status).toBe('no-route')
  if (res.status === 'no-route') {
    expect(res.reason.code).toBe('no-route-verified') // C4-P5: priced, but nothing verified
    expect(res.alternatives).toHaveLength(1)
    expect(res.alternatives[0]!.execution).toBe('failed')
    expect(res.alternatives[0]!.revertData).toBe('0xdeadbeef')
  }
  expect(counters.scans).toBe(0) // nothing to scan, but the search still ran to completion
  assertResultCoherent(res)
})

test('a second identical getQuote call reuses the persisted PoolIndex and issues no further log scans', async () => {
  // No direct pool exists — the only route is the two-hop through MID, and MID becomes an
  // intermediate only when it is a neighbor of BOTH endpoints, which only the adjacency scans can
  // establish (coreIntermediates is empty, so nothing probes MID on its own).
  const manifest = baseManifest({ v2Block: BLOCK_NUMBER - 500n, v4: false })
  const leg1Call = directProbes(v2Module, TOKEN_A, MID, AMOUNT_IN, manifest)[0]!.quote.call
  const leg2Call = directProbes(v2Module, MID, TOKEN_B, AMOUNT_IN, manifest)[0]!.quote.call
  const [aMidToken0] = sortAddresses(TOKEN_A, MID)
  const [midBToken0] = sortAddresses(MID, TOKEN_B)

  const { client, counters } = stubClient({
    calls: {
      ...entryFor(leg1Call, v2Return(500n, 1000n, aMidToken0.toLowerCase() === TOKEN_A.toLowerCase())),
      ...entryFor(leg2Call, v2Return(1000n, 500n, midBToken0.toLowerCase() === MID.toLowerCase())),
    },
    logs: (endpoint) =>
      endpoint === TOKEN_A.toLowerCase()
        ? [pairCreatedLog(manifest, TOKEN_A, MID, manifest.v2!.deploymentBlock + 1n)]
        : endpoint === TOKEN_B.toLowerCase()
          ? [pairCreatedLog(manifest, MID, TOKEN_B, manifest.v2!.deploymentBlock + 2n)]
          : [],
  })
  const router = createRouter({ client, manifest })

  const req: QuoteRequest = { tokenIn: TOKEN_A, tokenOut: TOKEN_B, amountIn: AMOUNT_IN }
  const first = await router.getQuote(req)
  expect(first.status).toBe('quote')
  const scansAfterFirst = counters.scans
  expect(scansAfterFirst).toBeGreaterThan(0) // the first call genuinely had to scan for MID

  const second = await router.getQuote(req)
  expect(second.status).toBe('quote')
  expect(counters.scans).toBe(scansAfterFirst) // resolved from the cached index — no new scans

  assertResultCoherent(first)
  assertResultCoherent(second)
})

test('ingestLogs (and ingestReceipt) upsert pools ahead of time, so a route resolves with no scanning at all', async () => {
  const manifest = baseManifest({ v2Block: BLOCK_NUMBER - 500n, v4: false })
  const leg1Call = directProbes(v2Module, TOKEN_A, MID, AMOUNT_IN, manifest)[0]!.quote.call
  const leg2Call = directProbes(v2Module, MID, TOKEN_B, AMOUNT_IN, manifest)[0]!.quote.call
  const [aMidToken0] = sortAddresses(TOKEN_A, MID)
  const [midBToken0] = sortAddresses(MID, TOKEN_B)

  const { client, counters } = stubClient({
    calls: {
      ...entryFor(leg1Call, v2Return(500n, 1000n, aMidToken0.toLowerCase() === TOKEN_A.toLowerCase())),
      ...entryFor(leg2Call, v2Return(1000n, 500n, midBToken0.toLowerCase() === MID.toLowerCase())),
    },
  })
  const router = createRouter({ client, manifest })

  router.ingestLogs([pairCreatedLog(manifest, TOKEN_A, MID, manifest.v2!.deploymentBlock + 1n)])
  router.ingestReceipt({ logs: [pairCreatedLog(manifest, MID, TOKEN_B, manifest.v2!.deploymentBlock + 2n)] })

  const res = await router.getQuote({ tokenIn: TOKEN_A, tokenOut: TOKEN_B, amountIn: AMOUNT_IN })

  expect(res.status).toBe('quote')
  expect(counters.scans).toBe(0) // both pools were already known before the search started
  assertResultCoherent(res)
})

test('ingestLogs survives malformed entries: every valid log is still indexed, nothing throws (C4-H4)', async () => {
  // v2 AND v4 enabled, so all three parsers get handed the garbage, not just the one that matches.
  const manifest = baseManifest({ v2Block: BLOCK_NUMBER - 500n })
  const leg1Call = directProbes(v2Module, TOKEN_A, MID, AMOUNT_IN, manifest)[0]!.quote.call
  const leg2Call = directProbes(v2Module, MID, TOKEN_B, AMOUNT_IN, manifest)[0]!.quote.call
  const [aMidToken0] = sortAddresses(TOKEN_A, MID)
  const [midBToken0] = sortAddresses(MID, TOKEN_B)

  const { client } = stubClient({
    calls: {
      ...entryFor(leg1Call, v2Return(500n, 1000n, aMidToken0.toLowerCase() === TOKEN_A.toLowerCase())),
      ...entryFor(leg2Call, v2Return(1000n, 500n, midBToken0.toLowerCase() === MID.toLowerCase())),
    },
  })
  const router = createRouter({ client, manifest })

  const valid1 = pairCreatedLog(manifest, TOKEN_A, MID, manifest.v2!.deploymentBlock + 1n)
  const valid2 = pairCreatedLog(manifest, MID, TOKEN_B, manifest.v2!.deploymentBlock + 2n)
  // The shapes a caller actually produces by accident: a sparse/filtered array leaving holes, a
  // hand-built object with no `address` at all, and a log from the right factory whose `data` is
  // truncated so decoding throws rather than returning null. A valid log sits AFTER all of them, so
  // the test fails if the batch aborts at the first bad entry rather than skipping it.
  const truncated = { ...valid1, data: '0x00' as Hex }
  router.ingestLogs([valid1, null, undefined, { nonsense: true }, { address: 42 }, truncated, valid2] as unknown as Log[])

  const res = await router.getQuote({ tokenIn: TOKEN_A, tokenOut: TOKEN_B, amountIn: AMOUNT_IN })

  // Both valid pools made it in: the only route to TOKEN_B is the two-hop through MID they form.
  expect(res.status).toBe('quote')
  if (res.status === 'quote') {
    expect(res.best.route.legs).toHaveLength(2)
    expect(res.best.route.legs.map((l) => l.pool.protocol)).toEqual(['v2', 'v2'])
  }
  assertResultCoherent(res)
})

test('a quote whose amountOut overflows uint128 degrades that candidate instead of throwing: the search falls through to the next (C4-H4)', async () => {
  // `amountIn` is bounded below 2^128 by validation, but `amountOut` comes from the chain — a
  // hostile/broken quoter or a hooked pool can answer with a number whose slippage floor does not
  // fit the Universal Router's `uint128 amountOutMinimum`. viem throws IntegerOutOfRangeError deep
  // inside the encoder; that must degrade the candidate, not abort the whole search.
  const manifest = baseManifest({ v2Block: BLOCK_NUMBER - 500n })
  const v4Probe = directProbes(v4Module, TOKEN_A, TOKEN_B, AMOUNT_IN, manifest)[0]!
  const v2Probe = directProbes(v2Module, TOKEN_A, TOKEN_B, AMOUNT_IN, manifest)[0]!
  const [token0] = sortAddresses(TOKEN_A, TOKEN_B)
  const zeroForOne = token0.toLowerCase() === TOKEN_A.toLowerCase()

  const { client } = stubClient({
    calls: {
      // Ranks first by a mile, and is un-encodable: 2^129 * (1 - 1%) is still over uint128.
      ...entryFor(v4Probe.quote.call, v4Return(2n ** 129n)),
      ...entryFor(v2Probe.quote.call, v2Return(10n ** 24n, 10n ** 24n, zeroForOne)),
    },
  })
  const router = createRouter({ client, manifest })

  const res = await router.getSwap({ tokenIn: TOKEN_A, tokenOut: TOKEN_B, amountIn: AMOUNT_IN, trader: TRADER })

  expect(res.status).toBe('ready')
  if (res.status === 'ready') {
    // The runner-up, not the leader: the absurd v4 quote was demoted rather than crashing the search.
    expect(res.best.route.legs[0]!.pool.protocol).toBe('v2')
    const overflowed = res.alternatives.find((a) => a.route.legs[0]!.pool.protocol === 'v4')
    expect(overflowed?.execution).toBe('failed')
  }
  assertResultCoherent(res)
})

test('quotes() streams SearchEvents: a lead per IMPROVEMENT, one final always last', async () => {
  // THREE routes of strictly increasing quality, and the two better ones reachable only through the
  // adjacency scans — the second of them from an OLDER chunk of the same scan than the first. That
  // staging is what makes "a lead per improvement" observable at all: a one-pool world produces
  // exactly one lead, which a stream that only ever announced its FINAL answer would satisfy just as
  // well, and a world whose last improvement lands on the terminating cycle produces one too (the
  // terminal cycle emits its `final` INSTEAD of a lead). Here the stream has to carry the direct
  // pair, then the route that outprices it, while the search is still running.
  const V2_BLOCK = BLOCK_NUMBER - 30_000n // wide enough that the adjacency walk takes several chunks
  const manifest = baseManifest({ v2Block: V2_BLOCK, v4: false })
  const MID2 = `0x${'dd'.repeat(20)}` as Address
  const [probe] = directProbes(v2Module, TOKEN_A, TOKEN_B, AMOUNT_IN, manifest)
  const [token0] = sortAddresses(TOKEN_A, TOKEN_B)

  /** `getReserves` for one hop, oriented for a trade that enters through `from`. */
  const hop = (from: Address, to: Address, reserveIn: bigint, reserveOut: bigint): Record<string, Hex> =>
    entryFor(
      directProbes(v2Module, from, to, AMOUNT_IN, manifest)[0]!.quote.call,
      v2Return(reserveIn, reserveOut, sortAddresses(from, to)[0]!.toLowerCase() === from.toLowerCase()),
    )

  const { client: scripted } = stubClient({
    calls: {
      // The direct pair is priced 2:1 AGAINST the trade (~498 out). The MID two-hop is 1:1 on both
      // hops (~993 after two lots of v2 fee), and the MID2 two-hop's first hop pays 2:1 IN FAVOUR
      // (~1988). So the leader improves twice, in that order.
      ...entryFor(probe!.quote.call, v2Return(2n * 10n ** 24n, 10n ** 24n, token0.toLowerCase() === TOKEN_A.toLowerCase())),
      ...hop(TOKEN_A, MID, 10n ** 24n, 10n ** 24n),
      ...hop(MID, TOKEN_B, 10n ** 24n, 10n ** 24n),
      ...hop(TOKEN_A, MID2, 10n ** 24n, 2n * 10n ** 24n),
      ...hop(MID2, TOKEN_B, 10n ** 24n, 10n ** 24n),
    },
    // MID/MID2 become intermediates only once each is a neighbor of BOTH endpoints, which only these
    // scans establish (coreIntermediates is empty). MID's pairs sit next to the head, MID2's at the
    // v2 deployment block — and the walk goes newest-first, so MID2 arrives chunks later than MID.
    logs: (endpoint) =>
      endpoint === TOKEN_A.toLowerCase()
        ? [pairCreatedLog(manifest, TOKEN_A, MID, BLOCK_NUMBER - 100n), pairCreatedLog(manifest, TOKEN_A, MID2, V2_BLOCK + 1n)]
        : endpoint === TOKEN_B.toLowerCase()
          ? [pairCreatedLog(manifest, MID, TOKEN_B, BLOCK_NUMBER - 100n), pairCreatedLog(manifest, MID2, TOKEN_B, V2_BLOCK + 1n)]
          : [],
  })
  // The oldest chunk — the one carrying MID2's pairs — is held for a few macrotasks, which is what
  // keeps the search from CONVERGING on the cycle that first prices the MID two-hop. A terminating
  // cycle emits its `final` instead of a lead, so without something still in flight the whole
  // improvement story arrives as one closing event and this test could not tell a streaming engine
  // from a batch one.
  const client = {
    ...scripted,
    async request(args: { method: string; params: [{ fromBlock: Hex; toBlock: Hex }] }) {
      const range = args.method === 'eth_getLogs' ? args.params[0] : undefined
      if (range && BigInt(range.fromBlock) <= V2_BLOCK + 1n && V2_BLOCK + 1n <= BigInt(range.toBlock)) {
        for (let i = 0; i < 4; i++) await new Promise((resolve) => setTimeout(resolve, 0))
      }
      return scripted.request(args as never)
    },
  } as unknown as PublicClient
  const router = createRouter({ client, manifest })

  const events = []
  for await (const e of router.quotes({ tokenIn: TOKEN_A, tokenOut: TOKEN_B, amountIn: AMOUNT_IN })) events.push(e)

  // Two leads at least, each a STRICT improvement on the one before it: the direct pair leads while
  // it is all there is, and a two-hop takes over when the scans deliver one that outprices it.
  const leads = events.flatMap((e) => (e.type === 'lead' && e.result.status === 'quote' ? [e.result.best] : []))
  // A price is a price: `classifyQuote` reports a leader as `quote` however incomplete the search that
  // found it, so every lead in a quote stream narrows — a lead that did not would be its own bug.
  expect(events.filter((e) => e.type === 'lead')).toHaveLength(leads.length)
  expect(leads.length).toBeGreaterThanOrEqual(2)
  for (let i = 1; i < leads.length; i++) {
    expect(leads[i]!.quote.amountOut > leads[i - 1]!.quote.amountOut).toBe(true)
  }
  expect(leads[0]!.route.legs).toHaveLength(1) // the direct pair led first
  expect(leads.at(-1)!.route.legs).toHaveLength(2) // and a two-hop had taken over before the final
  // Exactly one final closed the stream, last, and it leads with the best of the three.
  expect(events.filter((e) => e.type === 'final')).toHaveLength(1)
  expect(events.at(-1)!.type).toBe('final')
  for (const e of events) {
    // Every lead/final carries a FULL interim result held to the same honesty invariants; progress
    // carries the report alone.
    if (e.type === 'progress') expect(e.search.block.number).toBe(BLOCK_NUMBER)
    else assertResultCoherent(e.result)
  }
  const last = events.at(-1)!
  if (last.type === 'final') {
    expect(last.result.status).toBe('quote')
    expect(last.result.search.aborted).toBe(false)
    if (last.result.status === 'quote') {
      expect(last.result.best.quote.amountOut).toBeGreaterThanOrEqual(leads.at(-1)!.quote.amountOut)
    }
  }
})

describe('hookData (request-scoped, keyed by lowercased poolId)', () => {
  test('a hint hookData reaches the materialized v4 leg through a full getQuote, keyed by poolId regardless of the hint currency order', async () => {
    const manifest = baseManifest()
    const hookData = '0x1234' as Hex
    const [sorted0, sorted1] = sortAddresses(TOKEN_A, TOKEN_B)
    // Deliberately unsorted relative to how the pool actually gets indexed/materialized.
    const hint: PoolHint = {
      protocol: 'v4',
      poolKey: { currency0: sorted1, currency1: sorted0, fee: 2500, tickSpacing: 50, hooks: zeroAddress },
      hookData,
    }

    const sortedPoolKey: PoolKey = { currency0: sorted0, currency1: sorted1, fee: 2500, tickSpacing: 50, hooks: zeroAddress }
    const leg = { pool: v4Ref(sortedPoolKey), currencyIn: TOKEN_A, currencyOut: TOKEN_B, hookData }
    const quoteCall = v4Module.encodeQuote([leg], AMOUNT_IN, manifest).call

    const { client } = stubClient({ calls: entryFor(quoteCall, v4Return(500n)) })
    const router = createRouter({ client, manifest })

    const res = await router.getQuote({ tokenIn: TOKEN_A, tokenOut: TOKEN_B, amountIn: AMOUNT_IN, hints: [hint] })

    expect(res.status).toBe('quote')
    if (res.status === 'quote') expect(res.best.route.legs[0]!.hookData).toBe(hookData)
    assertResultCoherent(res)
  })

  test('hookData is request-scoped: it does not persist into a later call that omits it, even though the pool itself stays cached', async () => {
    const manifest = baseManifest()
    const hookData = '0x1234' as Hex
    const [sorted0, sorted1] = sortAddresses(TOKEN_A, TOKEN_B)
    const poolKey: PoolKey = { currency0: sorted0, currency1: sorted1, fee: 2500, tickSpacing: 50, hooks: zeroAddress }
    const hint: PoolHint = { protocol: 'v4', poolKey, hookData }

    const legWith = { pool: v4Ref(poolKey), currencyIn: TOKEN_A, currencyOut: TOKEN_B, hookData }
    const legWithout = { pool: v4Ref(poolKey), currencyIn: TOKEN_A, currencyOut: TOKEN_B }
    const callWith = v4Module.encodeQuote([legWith], AMOUNT_IN, manifest).call
    const callWithout = v4Module.encodeQuote([legWithout], AMOUNT_IN, manifest).call

    const { client } = stubClient({
      calls: { ...entryFor(callWith, v4Return(500n)), ...entryFor(callWithout, v4Return(500n)) },
    })
    const router = createRouter({ client, manifest })

    const first = await router.getQuote({ tokenIn: TOKEN_A, tokenOut: TOKEN_B, amountIn: AMOUNT_IN, hints: [hint] })
    expect(first.status).toBe('quote')
    if (first.status === 'quote') expect(first.best.route.legs[0]!.hookData).toBe(hookData)
    assertResultCoherent(first)

    // Same pair, same (now-cached) pool, but no hints this time.
    const second = await router.getQuote({ tokenIn: TOKEN_A, tokenOut: TOKEN_B, amountIn: AMOUNT_IN })
    expect(second.status).toBe('quote')
    if (second.status === 'quote') expect(second.best.route.legs[0]!.hookData).toBeUndefined()
    assertResultCoherent(second)
  })
})

test('a hint discredited by two real searches is restored by a creation log ingested MID-SEARCH, and prices again after', async () => {
  // THE TWO UNIT HALVES, COMPOSED THROUGH REAL SEARCHES (C4-T14). Each end of this already has a
  // test: `search/pump.test.ts` proves the engine's own data-less reverts feed the discredit history
  // at two distinct blocks, and `pools/poolIndex.test.ts` proves an event-sourced upsert clears that
  // history. Neither says the two ever meet — that a hint demoted by what the ENGINE measured is
  // restored by what a HOST ingests while a search is in flight, and that the restored record is then
  // usable rather than merely differently-shaped.
  let head = BLOCK_NUMBER
  const manifest = baseManifest({ v2Block: BLOCK_NUMBER - 500n, v4: false })
  const hint: PoolHint = { protocol: 'v2', token0: TOKEN_A, token1: TOKEN_B }
  const hintedPool = v2Ref(computeV2PairAddress(V2_FACTORY, TOKEN_A, TOKEN_B), TOKEN_A, TOKEN_B)
  const quoteCall = v2Module.encodeQuote([{ pool: hintedPool, currencyIn: TOKEN_A, currencyOut: TOKEN_B }], AMOUNT_IN, manifest).call

  // `calls` starts EMPTY, so the hinted pair's `getReserves` throws a data-less "execution reverted"
  // — the pool-absent shape, and the only shape that discredits (a liquidity or hook revert carries
  // data and must not).
  const calls: Record<string, Hex> = {}
  // Injected warm, holding the hint record already — the state a host reaches by handing on an index
  // that has seen this hint before. A hint pool that has NEVER been in the index does not get
  // discredited by a revert at all: it is negative-cached and simply not upserted (see
  // `pump.test.ts`, "a hint hypothesis that reverts data-less is negative-cached, never upserted").
  // The ladder this test is about only applies to a record that already claimed top provenance.
  const index = new PoolIndex(manifest.wrappedNative)
  index.upsert({ pool: hintedPool, source: 'hint' })
  const recordOf = () => index.pair(TOKEN_A, TOKEN_B).find((r) => r.pool.id === hintedPool.id)!

  let midSearch: (() => void) | undefined
  const { client } = stubClient({ calls, blockNumber: () => head, midSearch: () => midSearch?.() })
  const router = createRouter({ client, manifest, index })
  const quote = () => router.getQuote({ tokenIn: TOKEN_A, tokenOut: TOKEN_B, amountIn: AMOUNT_IN, hints: [hint] })

  // Two searches at two DISTINCT blocks — one block's failures are one piece of evidence however
  // many times they repeat, which is what keeps a busy caller from discrediting its own good hint.
  await quote()
  expect(recordOf().quoteFailureBlocks).toBe(1)
  expect(isDiscredited(recordOf())).toBe(false)

  head = BLOCK_NUMBER + 1n
  await quote()
  expect(recordOf().quoteFailureBlocks).toBe(HINT_DISCREDIT_FAILURE_BLOCKS)
  expect(isDiscredited(recordOf())).toBe(true)
  expect(recordOf().source).toBe('hint') // demoted, never deleted and never downgraded

  // THE THIRD SEARCH. Its quote call still reverts — the pool is not funded yet — but partway through
  // it, standing in for another task on the host, the pair's creation log arrives. The log lands
  // BEFORE this search records its own failure, which is what makes the arithmetic below legible:
  // two accumulated blocks are wiped, then this search's revert counts as the first block of a fresh
  // history. Without the ingestion the record would be sitting on three failed blocks and still
  // discredited; with it, one block and restored.
  head = BLOCK_NUMBER + 2n
  midSearch = () => {
    midSearch = undefined // once: a pair is created once, not on every call
    router.ingestLogs([pairCreatedLog(manifest, TOKEN_A, TOKEN_B, head)])
  }
  await quote()

  expect(recordOf().quoteFailureBlocks).toBe(1)
  expect(isDiscredited(recordOf())).toBe(false)
  expect(recordOf().source).toBe('hint') // restored, not downgraded to the 'event' that restored it

  // ...and the restored record is a working one, not just a differently-shaped one: once the pool
  // actually answers, the search the caller opened having written it off quotes straight through it,
  // and the success clears the remaining failure block outright.
  head = BLOCK_NUMBER + 3n
  Object.assign(calls, entryFor(quoteCall, v2Return(10n ** 21n, 10n ** 21n, sortAddresses(TOKEN_A, TOKEN_B)[0] === TOKEN_A)))
  const priced = await quote()

  assertResultCoherent(priced)
  expect(priced.status).toBe('quote')
  if (priced.status !== 'quote') throw new Error('unreachable')
  expect(priced.best.route.legs[0]!.pool.id).toBe(hintedPool.id)
  // The success is recorded, and THAT — not a rewritten counter — is what holds the demotion off from
  // here on: `isDiscredited` requires `lastQuoteSuccessBlock === undefined`, so the failed block stays
  // on the record as history while ceasing to count against it. The two recovery routes leave
  // different traces on purpose, and this is the one that says "it worked" rather than "it exists".
  expect(recordOf().quoteFailureBlocks).toBe(1)
  expect(recordOf().lastQuoteSuccessBlock).toBe(BLOCK_NUMBER + 3n)
  expect(isDiscredited(recordOf())).toBe(false)
})

describe('PoolIndex lifecycle (C4-H5): stats, clearIndex, injection, bounded mode', () => {
  const EMPTY_STATS = { pools: 0, adjacencyEdges: 0, coverageScopes: 0, negativeCacheBlocks: 0, enabledFeeFactories: 0 }

  test('createRouter rejects an injected index whose wrappedNative does not match the manifest, before any RPC', () => {
    const manifest = baseManifest()
    const mismatchedIndex = new PoolIndex(`0x${'99'.repeat(20)}` as Address)

    expect(() => createRouter({ client: poisonedClient(), manifest, index: mismatchedIndex })).toThrow(RouterConfigError)
  })

  // C4-P1: the reorg overlap is the SECOND chain fact an index is built with and cannot re-derive.
  test('createRouter rejects an injected index whose reorgOverlapBlocks does not match the manifest', () => {
    const manifest = baseManifest()
    const wrongDepth = new PoolIndex(manifest.wrappedNative, { reorgOverlapBlocks: 600n })

    expect(() => createRouter({ client: poisonedClient(), manifest, index: wrongDepth })).toThrow(RouterConfigError)
  })

  test('an injected index built for the manifest\'s own chain overlap is accepted', () => {
    // The mirror of the two rejections above: a manifest that states a deeper (L2-shaped) rewind
    // depth accepts exactly the index built with it, and rejects a mainnet-default one.
    const manifest: ChainManifest = { ...baseManifest(), chain: { blockTimeSeconds: 2, reorgOverlapBlocks: 600n } }
    const matching = new PoolIndex(manifest.wrappedNative, { reorgOverlapBlocks: 600n })

    expect(() => createRouter({ client: poisonedClient(), manifest, index: matching })).not.toThrow()
    expect(() =>
      createRouter({ client: poisonedClient(), manifest, index: new PoolIndex(manifest.wrappedNative) }),
    ).toThrow(RouterConfigError)
  })

  test('a router allocating its OWN index builds it with the manifest\'s reorg depth', () => {
    const manifest: ChainManifest = { ...baseManifest({ v2Block: BLOCK_NUMBER - 500n, v4: false }), chain: { reorgOverlapBlocks: 600n } }
    const { client } = stubClient({})
    // Round-trips through injection: an index this router would build is one it also accepts.
    const router = createRouter({ client, manifest })
    expect(router.stats()).toEqual(EMPTY_STATS)
    expect(() =>
      createRouter({ client, manifest, index: new PoolIndex(manifest.wrappedNative, { reorgOverlapBlocks: 600n }) }),
    ).not.toThrow()
  })

  test('createRouter rejects a malformed chain bundle synchronously, before any RPC', () => {
    const manifest: ChainManifest = { ...baseManifest(), chain: { blockTimeSeconds: 0 } }
    expect(() => createRouter({ client: poisonedClient(), manifest })).toThrow(RouterConfigError)
  })

  test('router.stats() counts ingested pools/adjacency accurately, and starts empty', () => {
    const manifest = baseManifest({ v2Block: BLOCK_NUMBER - 500n, v4: false })
    const { client } = stubClient({})
    const router = createRouter({ client, manifest })

    expect(router.stats()).toEqual(EMPTY_STATS)

    router.ingestLogs([pairCreatedLog(manifest, TOKEN_A, MID, manifest.v2!.deploymentBlock + 1n)])
    router.ingestLogs([pairCreatedLog(manifest, MID, TOKEN_B, manifest.v2!.deploymentBlock + 2n)])

    const stats = router.stats()
    expect(stats.pools).toBe(2)
    expect(stats.adjacencyEdges).toBe(4) // TOKEN_A<->MID and MID<->TOKEN_B, two directed edges each
  })

  test(
    "clearIndex empties the router's index for the NEXT call, but a search already in flight completes " +
      'against its own already-pinned (old) index',
    async () => {
      const manifest = baseManifest({ v2Block: BLOCK_NUMBER - 500n, v4: false })
      const leg1Call = directProbes(v2Module, TOKEN_A, MID, AMOUNT_IN, manifest)[0]!.quote.call
      const leg2Call = directProbes(v2Module, MID, TOKEN_B, AMOUNT_IN, manifest)[0]!.quote.call
      const [aMidToken0] = sortAddresses(TOKEN_A, MID)
      const [midBToken0] = sortAddresses(MID, TOKEN_B)

      let cleared = false
      const { client } = stubClient({
        calls: {
          ...entryFor(leg1Call, v2Return(500n, 1000n, aMidToken0.toLowerCase() === TOKEN_A.toLowerCase())),
          ...entryFor(leg2Call, v2Return(1000n, 500n, midBToken0.toLowerCase() === MID.toLowerCase())),
        },
        // Stands in for a host calling `clearIndex()` from another task while this generator is
        // paused on the event loop mid-drain — fires well after `buildContext` already copied the
        // router's (old) index reference into this search's own `SearchContext`.
        midSearch: () => {
          if (!cleared) {
            cleared = true
            router.clearIndex()
          }
        },
      })
      const router = createRouter({ client, manifest })
      router.ingestLogs([pairCreatedLog(manifest, TOKEN_A, MID, manifest.v2!.deploymentBlock + 1n)])
      router.ingestLogs([pairCreatedLog(manifest, MID, TOKEN_B, manifest.v2!.deploymentBlock + 2n)])
      expect(router.stats().pools).toBe(2) // seeded, before the search or the clear

      const res = await router.getQuote({ tokenIn: TOKEN_A, tokenOut: TOKEN_B, amountIn: AMOUNT_IN })

      // The search completed successfully, having found and quoted the two-hop route through the
      // pools that were ingested into the OLD index — proof it never saw the clear.
      expect(res.status).toBe('quote')
      if (res.status === 'quote') expect(res.best.route.legs).toHaveLength(2)
      assertResultCoherent(res)
      expect(cleared).toBe(true) // the clear really fired mid-search, not merely got skipped

      // The router's CURRENT index (what the next call would see) is the fresh one `clearIndex`
      // swapped in — completely empty, even though the search that just finished wrote plenty into
      // the now-orphaned old one.
      expect(router.stats()).toEqual(EMPTY_STATS)
    },
  )

  test("injection: an index warmed via one router's ingest is handed to a second router, which routes from it with zero scans (warm handoff)", async () => {
    const manifest = baseManifest({ v2Block: BLOCK_NUMBER - 500n, v4: false })
    const leg1Call = directProbes(v2Module, TOKEN_A, MID, AMOUNT_IN, manifest)[0]!.quote.call
    const leg2Call = directProbes(v2Module, MID, TOKEN_B, AMOUNT_IN, manifest)[0]!.quote.call
    const [aMidToken0] = sortAddresses(TOKEN_A, MID)
    const [midBToken0] = sortAddresses(MID, TOKEN_B)
    const calls = {
      ...entryFor(leg1Call, v2Return(500n, 1000n, aMidToken0.toLowerCase() === TOKEN_A.toLowerCase())),
      ...entryFor(leg2Call, v2Return(1000n, 500n, midBToken0.toLowerCase() === MID.toLowerCase())),
    }

    const sharedIndex = new PoolIndex(manifest.wrappedNative)

    // Router A: the host that "warms" the index — the only one that ever calls `ingestLogs`.
    const { client: clientA } = stubClient({ calls })
    const routerA = createRouter({ client: clientA, manifest, index: sharedIndex })
    routerA.ingestLogs([pairCreatedLog(manifest, TOKEN_A, MID, manifest.v2!.deploymentBlock + 1n)])
    routerA.ingestLogs([pairCreatedLog(manifest, MID, TOKEN_B, manifest.v2!.deploymentBlock + 2n)])
    expect(routerA.stats().pools).toBe(2)

    // Router B: a brand-new router instance, handed the SAME warmed index — no ingestion of its own,
    // nothing but the injection.
    const { client: clientB, counters: countersB } = stubClient({ calls })
    const routerB = createRouter({ client: clientB, manifest, index: sharedIndex })

    const res = await routerB.getQuote({ tokenIn: TOKEN_A, tokenOut: TOKEN_B, amountIn: AMOUNT_IN })

    expect(res.status).toBe('quote')
    if (res.status === 'quote') expect(res.best.route.legs).toHaveLength(2)
    expect(countersB.scans).toBe(0) // both pools were already known via the injected index
    assertResultCoherent(res)
    expect(routerB.stats().pools).toBe(2) // same shared instance — B sees exactly what A put there
  })

  test('createRouter({ maxPools }) wires the bound into the index it allocates', () => {
    const manifest = baseManifest({ v2Block: BLOCK_NUMBER - 500n, v4: false })
    const { client } = stubClient({})
    const router = createRouter({ client, manifest, maxPools: 1 })

    router.ingestLogs([pairCreatedLog(manifest, TOKEN_A, MID, manifest.v2!.deploymentBlock + 1n)])
    router.ingestLogs([pairCreatedLog(manifest, MID, TOKEN_B, manifest.v2!.deploymentBlock + 3n)])

    // Cap is 1: the second ingested pool (touched at a later block) pushes the index over, evicting
    // the first — `stats().pools` never exceeds the configured bound.
    expect(router.stats().pools).toBe(1)
  })

  test('maxPools is ignored when index is injected — the injected index keeps its own bound (or lack of one)', () => {
    const manifest = baseManifest({ v2Block: BLOCK_NUMBER - 500n, v4: false })
    const unboundedIndex = new PoolIndex(manifest.wrappedNative) // no maxPools of its own
    const { client } = stubClient({})
    const router = createRouter({ client, manifest, index: unboundedIndex, maxPools: 1 })

    router.ingestLogs([pairCreatedLog(manifest, TOKEN_A, MID, manifest.v2!.deploymentBlock + 1n)])
    router.ingestLogs([pairCreatedLog(manifest, MID, TOKEN_B, manifest.v2!.deploymentBlock + 3n)])

    // Both survive: the injected index was built unbounded, and this router's `maxPools` never
    // attaches to an index it did not allocate.
    expect(router.stats().pools).toBe(2)
  })
})

// ---------------------------------------------------------------------------
// Transport options (C4-P6): `concurrency` is a REAL global bound, and
// `logChunkBlocks` overrides the log scanner's window per router.
// ---------------------------------------------------------------------------

describe('transport options (C4-P6)', () => {
  const V3_FACTORY = `0x${'77'.repeat(20)}` as Address
  const V3_QUOTER = `0x${'88'.repeat(20)}` as Address

  // -------------------------------------------------------------------------
  // F1/F4: `concurrency`/`logChunkBlocks` are validated synchronously, before any RPC. A degenerate
  // value for either one does not fail loudly on its own — `concurrency <= 0` hangs `createSemaphore`
  // forever (every `acquire()` queues and never resolves, empirically confirmed by the reviewer), and
  // `logChunkBlocks` below `MIN_CHUNK` burns `scanLogs`'s whole request budget on an inverted range —
  // so both are rejected up front instead, the same posture as every other caller-supplied number
  // this package bounds (`validateQuoteRequest`'s `amountIn`/`slippageBps`/etc.).
  // -------------------------------------------------------------------------

  // -------------------------------------------------------------------------
  // `assumeChainId`: the facade's half. `manifest.test.ts` owns what the option
  // does to validation itself; these two pin that the router plumbs it and
  // bounds it like every other caller-supplied number.
  // -------------------------------------------------------------------------

  for (const assumeChainId of [0, -1, 1.5, NaN]) {
    test(`createRouter throws RouterConfigError for assumeChainId=${assumeChainId}`, () => {
      const manifest = baseManifest()
      expect(() => createRouter({ client: poisonedClient(), manifest, assumeChainId })).toThrow(RouterConfigError)
      expect(() => createRouter({ client: poisonedClient(), manifest, assumeChainId })).toThrow(/assumeChainId/)
    })
  }

  test('assumeChainId reaches validateManifest: a client that cannot answer eth_chainId still searches', async () => {
    const manifest = baseManifest()
    const [probe] = directProbes(v2Module, TOKEN_A, TOKEN_B, AMOUNT_IN, manifest)
    const [token0] = sortAddresses(TOKEN_A, TOKEN_B)
    const zeroForOne = token0.toLowerCase() === TOKEN_A.toLowerCase()
    const { client } = stubClient({ calls: entryFor(probe!.quote.call, v2Return(10n ** 24n, 10n ** 24n, zeroForOne)) })
    // The only way to prove the read was skipped rather than merely correct: make the read fail.
    const noChainId = { ...client, getChainId: async () => Promise.reject(new Error('eth_chainId is not served')) } as typeof client

    const router = createRouter({ client: noChainId, manifest, assumeChainId: CHAIN_ID })
    const result = await router.getQuote({ tokenIn: TOKEN_A, tokenOut: TOKEN_B, amountIn: AMOUNT_IN })

    expect(result.status).toBe('quote')
  })

  // -------------------------------------------------------------------------
  // The streaming surface: the first `lead` event IS the early notification a
  // streaming consumer wants — a full interim result, ahead of `final`.
  // -------------------------------------------------------------------------

  test("quotes(): the first lead is the early answer, and getQuote() resolves with that same result", async () => {
    const manifest = baseManifest()
    const [probe] = directProbes(v2Module, TOKEN_A, TOKEN_B, AMOUNT_IN, manifest)
    const [token0] = sortAddresses(TOKEN_A, TOKEN_B)
    const zeroForOne = token0.toLowerCase() === TOKEN_A.toLowerCase()
    const { client } = stubClient({ calls: entryFor(probe!.quote.call, v2Return(10n ** 24n, 10n ** 24n, zeroForOne)) })
    const router = createRouter({ client, manifest })

    let firstLead: QuoteResult | undefined
    for await (const e of router.quotes({ tokenIn: TOKEN_A, tokenOut: TOKEN_B, amountIn: AMOUNT_IN })) {
      if (e.type === 'lead') {
        firstLead = e.result
        break // the getQuote shape: an actionable lead is where a promise-shaped consumer stops
      }
      if (e.type === 'final') throw new Error('final before any lead — the pool should have priced')
    }

    expect(firstLead?.status).toBe('quote')
    if (firstLead?.status === 'quote') expect(firstLead.best.quote.amountOut).toBeGreaterThan(0n)
    // ...and the promise surface is a consumer of the same stream: identical answer.
    const resolved = await router.getQuote({ tokenIn: TOKEN_A, tokenOut: TOKEN_B, amountIn: AMOUNT_IN })
    expect(resolved.status).toBe('quote')
  })

  test('swaps(): an interim lead is a LEAD, not a verdict — only a later event is entitled to say ready', async () => {
    const manifest = baseManifest()
    const [probe] = directProbes(v2Module, TOKEN_A, TOKEN_B, AMOUNT_IN, manifest)
    const [token0] = sortAddresses(TOKEN_A, TOKEN_B)
    const zeroForOne = token0.toLowerCase() === TOKEN_A.toLowerCase()
    const { client } = stubClient({ calls: entryFor(probe!.quote.call, v2Return(10n ** 24n, 10n ** 24n, zeroForOne)) })
    const router = createRouter({ client, manifest })

    const leads: SwapResult[] = []
    let finalResult: SwapResult | undefined
    for await (const e of router.swaps({ tokenIn: TOKEN_A, tokenOut: TOKEN_B, amountIn: AMOUNT_IN, trader: TRADER })) {
      if (e.type === 'lead') leads.push(e.result)
      if (e.type === 'final') finalResult = e.result
    }

    // The first lead fires the moment the route prices — its simulation is still in flight, so the
    // interim result must NOT claim `ready`: nothing has been verified yet.
    expect(leads.length).toBeGreaterThan(0)
    expect(leads[0]!.status).not.toBe('ready')
    for (const lead of leads) assertResultCoherent(lead)
    // The verdict arrives on a later event, once the preflight lands.
    expect(finalResult?.status).toBe('ready')
  })

  for (const concurrency of [0, -1, -20, NaN]) {
    test(`createRouter throws RouterConfigError for concurrency=${concurrency} rather than hanging forever`, () => {
      const manifest = baseManifest()
      expect(() => createRouter({ client: poisonedClient(), manifest, concurrency })).toThrow(RouterConfigError)
      expect(() => createRouter({ client: poisonedClient(), manifest, concurrency })).toThrow(/concurrency/)
    })
  }

  test('createRouter throws RouterConfigError for a non-integer concurrency', () => {
    const manifest = baseManifest()
    expect(() => createRouter({ client: poisonedClient(), manifest, concurrency: 2.5 })).toThrow(RouterConfigError)
  })

  test('createRouter throws RouterConfigError for concurrency above the MAX_CONCURRENCY ceiling', () => {
    const manifest = baseManifest()
    expect(() => createRouter({ client: poisonedClient(), manifest, concurrency: 1025 })).toThrow(RouterConfigError)
    expect(() => createRouter({ client: poisonedClient(), manifest, concurrency: 1_000_000 })).toThrow(RouterConfigError)
  })

  test('concurrency at the boundaries (1 and MAX_CONCURRENCY) is accepted', async () => {
    const manifest = baseManifest()
    const [probe] = directProbes(v2Module, TOKEN_A, TOKEN_B, AMOUNT_IN, manifest)
    const [token0] = sortAddresses(TOKEN_A, TOKEN_B)
    const zeroForOne = token0.toLowerCase() === TOKEN_A.toLowerCase()
    const { client } = stubClient({ calls: entryFor(probe!.quote.call, v2Return(10n ** 24n, 10n ** 24n, zeroForOne)) })

    const low = createRouter({ client, manifest, concurrency: 1 })
    const high = createRouter({ client, manifest, concurrency: 1024 })
    const [lowRes, highRes] = await Promise.all([
      low.getSwap({ tokenIn: TOKEN_A, tokenOut: TOKEN_B, amountIn: AMOUNT_IN, trader: TRADER }),
      high.getSwap({ tokenIn: TOKEN_A, tokenOut: TOKEN_B, amountIn: AMOUNT_IN, trader: TRADER }),
    ])
    expect(lowRes.status).toBe('ready')
    expect(highRes.status).toBe('ready')
  })

  for (const logChunkBlocks of [0n, -1n, -100n, 1n, 127n]) {
    test(`createRouter throws RouterConfigError for logChunkBlocks=${logChunkBlocks} (below MIN_CHUNK)`, () => {
      const manifest = baseManifest()
      expect(() => createRouter({ client: poisonedClient(), manifest, logChunkBlocks })).toThrow(RouterConfigError)
      expect(() => createRouter({ client: poisonedClient(), manifest, logChunkBlocks })).toThrow(/logChunkBlocks/)
    })
  }

  test('logChunkBlocks exactly at MIN_CHUNK (128n) is accepted', () => {
    const manifest = baseManifest()
    expect(() => createRouter({ client: poisonedClient(), manifest, logChunkBlocks: 128n })).not.toThrow()
  })

  test('createRouter({ concurrency }) is a REAL global bound: peak in-flight eth_call across a whole first cycle (concurrent hint measurements and readiness) never exceeds it', async () => {
    // The old bug (C4-P6): each concurrent activity fired its OWN `mapConcurrent(items,
    // MAX_CONCURRENT_CALLS, ...)` batch, so the real peak was the SUM of every concurrently-running
    // batch's own limit — 10 hinted-tier measurements + the standard-tier hypotheses + 3 readiness
    // reads, comfortably over a `concurrency` of 5 if nothing coordinated them globally. With the
    // shared semaphore, the peak recorded below must never exceed 5, however many calls the first
    // measurement round fires at once.
    const CONCURRENCY = 5
    const HINT_COUNT = 10
    const manifest: ChainManifest = {
      ...baseManifest({ v2Block: BLOCK_NUMBER + 1_000_000n, v4: false }),
      v3: { factory: V3_FACTORY, deploymentBlock: BLOCK_NUMBER + 1_000_000n, v3QuoterV2: V3_QUOTER },
    }

    let active = 0
    let peak = 0
    const ZERO_BLOB = `0x${'00'.repeat(256)}` as Hex // decodes harmlessly (zero) for any call shape below
    const client: PublicClient = {
      async getChainId() {
        return CHAIN_ID
      },
      async request(args: any) {
        if (args.method === 'eth_getBlockByNumber') {
          return { number: toHex(BLOCK_NUMBER), hash: BLOCK_HASH, timestamp: toHex(BLOCK_TIMESTAMP) }
        }
        if (args.method === 'eth_getCode') {
          // `validateManifest`'s immutable cross-check fetches the execution address's code
          // unconditionally — fabricate code embedding this manifest's own immutables so validation
          // passes and the test proceeds to the actual wave-0 concurrency it means to measure.
          const embed = [WRAPPED, PERMIT2, V2_FACTORY, V3_FACTORY].map((a) => a.slice(2).toLowerCase()).join('')
          return `0x${embed}` as Hex
        }
        if (args.method === 'eth_call') {
          active++
          peak = Math.max(peak, active)
          // A real async gap: without one, every "concurrent" call could settle within the same
          // microtask turn and never actually overlap, making the peak assertion vacuous.
          await new Promise((resolve) => setTimeout(resolve, 2))
          active--
          return ZERO_BLOB
        }
        throw new Error(`unexpected method ${args.method}`)
      },
    } as unknown as PublicClient

    const router = createRouter({ client, manifest, concurrency: CONCURRENCY })
    // Ten v3 hints on distinct (fabricated) fee tiers: none is a real pool — the point is purely
    // the RPC load their measurements fire, one `eth_call` per hinted tier, concurrently.
    const hints: PoolHint[] = Array.from({ length: HINT_COUNT }, (_, i) => ({
      protocol: 'v3',
      token0: TOKEN_A,
      token1: TOKEN_B,
      fee: i + 1,
    }))

    const res = await router.getSwap({ tokenIn: TOKEN_A, tokenOut: TOKEN_B, amountIn: AMOUNT_IN, trader: TRADER, hints })

    expect(res.status).not.toBe('ready') // nothing here was ever a real, quotable pool
    // EXACTLY the bound, not merely under it. The first round fires more calls than `CONCURRENCY`
    // (ten hinted tiers plus the standard-tier hypotheses plus three readiness reads) and every one
    // of them parks on a real timer, so a correctly-shared semaphore has all five permits out at
    // once — while `<= CONCURRENCY` would also pass for a bound of one, i.e. for a router that
    // accidentally serialized the whole round.
    expect(peak).toBe(CONCURRENCY)
  })

  test('createRouter({ logChunkBlocks }) overrides the eth_getLogs window (starting AND regrowth ceiling) for every scan this router issues', async () => {
    // v2 adjacency is skipped (deployment above the head) so the first scan in play is v4's eager
    // exact-pair Initialize scan, whose recent window (~50,400 blocks on mainnet defaults) is far
    // wider than the 2,000-block override — so its FIRST `eth_getLogs` chunk must span exactly that
    // override, not the 10k Alchemy-shaped default.
    const manifest = baseManifest({ v2Block: BLOCK_NUMBER + 1_000_000n })
    const spans: bigint[] = []
    const client: PublicClient = {
      async getChainId() {
        return CHAIN_ID
      },
      async request(args: any) {
        if (args.method === 'eth_getBlockByNumber') {
          return { number: toHex(BLOCK_NUMBER), hash: BLOCK_HASH, timestamp: toHex(BLOCK_TIMESTAMP) }
        }
        if (args.method === 'eth_getCode') {
          // Same reason as the concurrency test above: satisfy the unconditional immutable
          // cross-check so this test reaches the log-scan behavior it actually exercises.
          const embed = [WRAPPED, PERMIT2, V2_FACTORY, V4_POOL_MANAGER].map((a) => a.slice(2).toLowerCase()).join('')
          return `0x${embed}` as Hex
        }
        if (args.method === 'eth_getLogs') {
          const filter = args.params[0]
          spans.push(BigInt(filter.toBlock) - BigInt(filter.fromBlock) + 1n)
          return []
        }
        throw new Error('execution reverted') // no pool anywhere — irrelevant to this test
      },
    } as unknown as PublicClient

    const router = createRouter({ client, manifest, logChunkBlocks: 2_000n })
    await router.getQuote({ tokenIn: TOKEN_A, tokenOut: TOKEN_B, amountIn: AMOUNT_IN })

    expect(spans.length).toBeGreaterThan(0)
    expect(spans[0]).toBe(2_000n)
    expect(spans.every((s) => s <= 2_000n)).toBe(true) // the override is also the regrowth ceiling
  })

  test('defaults are unchanged: omitting concurrency/logChunkBlocks behaves exactly as before these options existed', async () => {
    // A plain end-to-end swap, no new options passed — the zero-config path stays exactly as it was.
    const manifest = baseManifest()
    const [probe] = directProbes(v2Module, TOKEN_A, TOKEN_B, AMOUNT_IN, manifest)
    const [token0] = sortAddresses(TOKEN_A, TOKEN_B)
    const zeroForOne = token0.toLowerCase() === TOKEN_A.toLowerCase()

    const { client } = stubClient({ calls: entryFor(probe!.quote.call, v2Return(10n ** 24n, 10n ** 24n, zeroForOne)) })
    const router = createRouter({ client, manifest })

    const res = await router.getSwap({ tokenIn: TOKEN_A, tokenOut: TOKEN_B, amountIn: AMOUNT_IN, trader: TRADER })

    expect(res.status).toBe('ready')
    assertResultCoherent(res)
  })
})

// ---------------------------------------------------------------------------
// C5-A: the pre-search RPC sequence's depth, pinned so it cannot regress.
//
// `getQuote` used to have THREE round trips strictly ahead of the first measurement dispatch:
// manifest validation's `eth_chainId`+`eth_getCode` (already concurrent with each other), the
// multicall3 probe's own `eth_getCode` (already concurrent with validation), and — the one this
// fixes — the engine's pinned-block `eth_getBlockByNumber`, which did not even DISPATCH until a
// `SearchContext` existed, which needed validation and the multicall probe to have already
// RESOLVED. `router.ts#dispatchPinnedBlock` fires that read the moment a request comes in, same as
// the other two, so all three now share one round and only one release round separates the request
// from the first measurement dispatch.
//
// MEASURED BY RELEASE ROUNDS, NOT WALL-CLOCK TIME. Every RPC method the pre-search sequence touches
// is gated behind a manually-resolved promise; nothing advances until this test releases it. That
// makes "how many round trips are strictly sequential" a fact about the PROMISE GRAPH — provable
// without a timer, and immune to the flakiness a `setTimeout`-based measurement would carry.
// ---------------------------------------------------------------------------

describe('pre-search RPC sequencing (C5-A)', () => {
  test('the pinned block overlaps validation and the multicall probe: one release round, not two, precedes the first measurement dispatch', async () => {
    const manifest = baseManifest({ v4: false })
    const [probe] = directProbes(v2Module, TOKEN_A, TOKEN_B, AMOUNT_IN, manifest)
    const quoteTarget = probe!.quote.call.to.toLowerCase()

    type Gate = { key: string; resolve: (v: unknown) => void }
    const pendingGates: Gate[] = []
    let wave = 0
    // First-seen wave per key — the metric this test exists to pin.
    const waveOf = new Map<string, number>()
    const record = (key: string): void => {
      if (!waveOf.has(key)) waveOf.set(key, wave)
    }
    const gated = (key: string): Promise<unknown> => {
      record(key)
      return new Promise((resolve) => pendingGates.push({ key, resolve }))
    }

    const client: PublicClient = {
      async getChainId() {
        return gated('eth_chainId') as Promise<number>
      },
      async request(args: any) {
        if (args.method === 'eth_getBlockByNumber') return gated('eth_getBlockByNumber')
        if (args.method === 'eth_getCode') {
          const [addr] = args.params as [Address]
          return gated(`eth_getCode:${addr.toLowerCase()}`)
        }
        if (args.method === 'eth_getLogs') {
          // The coverage worker runs concurrently with the pump and is never awaited ahead of a
          // measurement, so its scans are deliberately left ungated here: gating them would inject
          // a sequential round this test would then misattribute to the pre-search sequence. An
          // empty answer is fine — only the dispatch of the first measurement matters.
          record('eth_getLogs')
          return []
        }
        if (args.method === 'eth_call') {
          const [{ to }] = args.params as [{ to: Address }]
          const target = to.toLowerCase()
          record(target === quoteTarget ? 'quote' : `eth_call:${target}`)
          if (target === quoteTarget) throw new Error('execution reverted') // no pool; only the dispatch matters
          return '0x'
        }
        throw new Error(`unexpected method ${args.method}`)
      },
    } as unknown as PublicClient

    const router = createRouter({ client, manifest })
    const result = router.getQuote({ tokenIn: TOKEN_A, tokenOut: TOKEN_B, amountIn: AMOUNT_IN })

    // Drains every dispatch the current promise graph can reach WITHOUT a gate being released —
    // i.e., everything the pre-search sequence issues on its own.
    const flush = async (): Promise<void> => {
      for (let i = 0; i < 30; i++) await Promise.resolve()
    }
    await flush()

    // Release whatever is outstanding, one round at a time, until the quote probe has been
    // dispatched. The number of rounds this loop needs IS the sequential depth.
    while (!waveOf.has('quote') && pendingGates.length > 0) {
      wave++
      const batch = pendingGates.splice(0, pendingGates.length)
      for (const g of batch) {
        if (g.key === 'eth_chainId') g.resolve(CHAIN_ID)
        else if (g.key === 'eth_getBlockByNumber') g.resolve({ number: toHex(BLOCK_NUMBER), hash: BLOCK_HASH, timestamp: toHex(BLOCK_TIMESTAMP) })
        else if (g.key.startsWith('eth_getCode:')) {
          const addr = g.key.slice('eth_getCode:'.length)
          // The execution address needs its immutables embedded to pass validation; anything else
          // (the multicall probe's address) answers '0x' — no deployment, so quoting stays per-call
          // and the multicall probe's own once-cell resolves to `null` without another round trip.
          const embed = [WRAPPED, PERMIT2, V2_FACTORY].map((a) => a.slice(2).toLowerCase()).join('')
          g.resolve(addr === UNIVERSAL_ROUTER.toLowerCase() ? `0x${embed}` : '0x')
        }
      }
      await flush()
    }

    // Nothing left to gate — let the rest of the search play out so the promise settles.
    await result

    // WHAT A RED HERE MEANS, so a maintainer does not have to reverse-engineer it from a bare
    // `expected 1, got 2`. These four numbers are RELEASE ROUNDS, not assertions about correctness:
    // round 0 is everything dispatched before this test resolved anything, round 1 is everything
    // that could only dispatch once round 0's answers landed. A number that grew by one means some
    // read that used to be concurrent now waits on another — usually a new `await` inserted ahead of
    // `dispatchPinnedBlock`/`resolveMulticall3` in `router.ts`, or a `SearchContext` field that
    // cannot be built until an earlier round resolves. Nothing is *broken* when this fails; the
    // search got one round trip slower on its critical path, which is the whole thing C5-A bought
    // and the only reason this test exists. Fix the ordering, or — if the extra round is genuinely
    // unavoidable — move the number here and say why in this comment.
    const depth = (key: string): string => `${key} dispatched in release round ${waveOf.get(key)}`

    expect(waveOf.get('quote'), `pre-search depth regressed: ${depth('quote')}, expected 1`).toBe(1)
    // The three reads that used to span two sequential rounds now share the same wave: chain
    // validation, the execution address's code (also validation), and the pinned block all dispatch
    // BEFORE anything is released.
    expect(waveOf.get('eth_chainId'), `${depth('eth_chainId')}, expected 0 — manifest validation must dispatch immediately`).toBe(0)
    expect(
      waveOf.get(`eth_getCode:${UNIVERSAL_ROUTER.toLowerCase()}`),
      `${depth(`eth_getCode:${UNIVERSAL_ROUTER.toLowerCase()}`)}, expected 0 — the immutable fingerprint read is part of the same validation batch`,
    ).toBe(0)
    expect(
      waveOf.get('eth_getBlockByNumber'),
      `${depth('eth_getBlockByNumber')}, expected 0 — C5-A: the pinned block must dispatch on request arrival, not after the SearchContext exists`,
    ).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// Multicall3 adoption at the facade: the once-per-router probe and both of its
// permanent verdicts. Every OTHER test in this file runs the per-call path
// because `stubClient` answers `eth_getCode` with '0x' for anything that is
// not the Universal Router — i.e. the fleet above doubles as coverage that a
// chain with no Multicall3 deployment behaves exactly as before adoption.
// The wrapper here decodes each aggregate3 envelope and REPLAYS its inner
// calls through the same base stub, so the aggregated path is served by the
// identical scripting the per-call path uses — plus counters over what
// actually hit the wire, which is what these tests are about.
// ---------------------------------------------------------------------------

describe('Multicall3 probe and aggregation (facade)', () => {
  afterEach(() => {
    expect(takeStubViolations(), 'the aggregate3 stub was asked something no test scripted').toEqual([])
  })

  type MulticallWrap = {
    client: PublicClient
    /** eth_getCode calls per (lowercased) address. */
    codeProbes: Map<string, number>
    aggregate3Calls: number
    directQuoteCalls: number
  }

  /** Wraps a `stubClient` so the given multicall address (canonical by default) HAS code and serves
   * aggregate3 by replaying each inner call through the base stub — throws and their `data` become
   * `{ success: false, returnData }`, the deployed contract's own allowFailure behavior. */
  function withMulticall(
    base: PublicClient,
    opts: { address?: Address; code?: Hex | 'absent'; failProbes?: number } = {},
  ): MulticallWrap {
    const address = (opts.address ?? MULTICALL3_ADDRESS).toLowerCase()
    const wrap: MulticallWrap = { client: undefined as unknown as PublicClient, codeProbes: new Map(), aggregate3Calls: 0, directQuoteCalls: 0 }
    let remainingProbeFailures = opts.failProbes ?? 0
    wrap.client = {
      ...base,
      async request(args: any) {
        if (args.method === 'eth_getCode') {
          const probed = (args.params[0] as string).toLowerCase()
          if (probed === address) {
            wrap.codeProbes.set(probed, (wrap.codeProbes.get(probed) ?? 0) + 1)
            if (remainingProbeFailures > 0) {
              remainingProbeFailures--
              throw rateLimitHttpError()
            }
            return opts.code === 'absent' ? '0x' : (opts.code ?? '0x600180') // any non-empty bytecode
          }
          return base.request(args)
        }
        if (args.method === 'eth_call') {
          const [{ to, data }, blockTag] = args.params
          if ((to as string).toLowerCase() === address) {
            wrap.aggregate3Calls++
            // The inner calls are replayed through the base stub, which is ASYNC, while
            // `serveAggregate3` (like the deployed contract) is synchronous — so they are resolved
            // first and the shared envelope handler serves from the resolved table. That handler is
            // what asserts `allowFailure` and the block tag here; this copy used to assert neither,
            // which made `router.test.ts` the most permissive of the four aggregate3 fixtures while
            // being the one that exercises the whole facade.
            const inner = decodeFunctionData({ abi: MULTICALL3_ABI, data })
              .args[0] as readonly { target: Address; allowFailure: boolean; callData: Hex }[]
            const answers = new Map<string, Hex | Error>()
            await Promise.all(
              inner.map(async (c) => {
                const key = `${c.target.toLowerCase()}:${c.callData}`
                try {
                  answers.set(key, (await base.request({ method: 'eth_call', params: [{ to: c.target, data: c.callData }, blockTag] } as never)) as Hex)
                } catch (err) {
                  answers.set(key, err as Error)
                }
              }),
            )
            return serveAggregate3({
              data,
              blockTag,
              expectBlockNumber: BigInt(blockTag as string),
              serve: (target, callData) => {
                const answer = answers.get(`${target}:${callData}`)
                if (answer === undefined) recordStubViolation(`withMulticall: no answer resolved for ${target}:${callData}`)
                if (answer instanceof Error) throw answer
                return answer
              },
            })
          }
          // Readiness/preflight targets are legitimate direct calls; anything else is a quote.
          const special = [UNIVERSAL_ROUTER, PERMIT2, TOKEN_A, TOKEN_B].map((a) => a.toLowerCase())
          if (!special.includes((to as string).toLowerCase())) wrap.directQuoteCalls++
          return base.request(args)
        }
        return base.request(args)
      },
    } as unknown as PublicClient
    return wrap
  }

  const manifest = (): ChainManifest => baseManifest()

  function v2World(): { client: PublicClient } {
    const m = manifest()
    const [probe] = directProbes(v2Module, TOKEN_A, TOKEN_B, AMOUNT_IN, m)
    const [token0] = sortAddresses(TOKEN_A, TOKEN_B)
    const zeroForOne = token0.toLowerCase() === TOKEN_A.toLowerCase()
    return stubClient({ calls: entryFor(probe!.quote.call, v2Return(10n ** 24n, 10n ** 24n, zeroForOne)) })
  }

  const req: QuoteRequest = { tokenIn: TOKEN_A, tokenOut: TOKEN_B, amountIn: AMOUNT_IN }

  test('code at the canonical address: every quoting round travels as aggregate3, and the probe runs once per router', async () => {
    const wrap = withMulticall(v2World().client)
    const router = createRouter({ client: wrap.client, manifest: manifest() })

    const first = await router.getQuote(req)
    expect(first.status).toBe('quote')
    assertResultCoherent(first)
    expect(wrap.aggregate3Calls).toBeGreaterThan(0)
    expect(wrap.directQuoteCalls).toBe(0) // nothing escaped the envelope

    const before = wrap.codeProbes.get(MULTICALL3_ADDRESS.toLowerCase())
    expect(before).toBe(1)
    const second = await router.getQuote(req)
    expect(second.status).toBe('quote')
    expect(wrap.codeProbes.get(MULTICALL3_ADDRESS.toLowerCase())).toBe(1) // cached: no re-probe, ever
  })

  test('no code at the address: per-call quoting forever, and the absent verdict is cached (no re-probe)', async () => {
    const wrap = withMulticall(v2World().client, { code: 'absent' })
    const router = createRouter({ client: wrap.client, manifest: manifest() })

    const first = await router.getQuote(req)
    expect(first.status).toBe('quote')
    assertResultCoherent(first)
    expect(wrap.aggregate3Calls).toBe(0)
    expect(wrap.directQuoteCalls).toBeGreaterThan(0)

    await router.getQuote(req)
    expect(wrap.codeProbes.get(MULTICALL3_ADDRESS.toLowerCase())).toBe(1) // absence is permanent for this router
    expect(wrap.aggregate3Calls).toBe(0)
  })

  test('a transient probe failure is NOT cached: this search quotes per-call, the next probes again and aggregates', async () => {
    const wrap = withMulticall(v2World().client, { failProbes: 1 })
    const router = createRouter({ client: wrap.client, manifest: manifest() })

    const first = await router.getQuote(req)
    expect(first.status).toBe('quote') // the conservative path needs no probe to be safe
    expect(wrap.aggregate3Calls).toBe(0)
    expect(wrap.directQuoteCalls).toBeGreaterThan(0)

    const second = await router.getQuote(req)
    expect(second.status).toBe('quote')
    expect(wrap.codeProbes.get(MULTICALL3_ADDRESS.toLowerCase())).toBe(2) // retried, not bricked
    expect(wrap.aggregate3Calls).toBeGreaterThan(0)
  })

  test('manifest.multicall3 overrides where BOTH the probe and the aggregation go', async () => {
    const custom = `0x${'77'.repeat(20)}` as Address
    const wrap = withMulticall(v2World().client, { address: custom })
    const router = createRouter({ client: wrap.client, manifest: { ...manifest(), multicall3: custom } })

    const result = await router.getQuote(req)
    expect(result.status).toBe('quote')
    expect(wrap.codeProbes.get(custom.toLowerCase())).toBe(1)
    expect(wrap.codeProbes.get(MULTICALL3_ADDRESS.toLowerCase())).toBeUndefined() // canonical never touched
    expect(wrap.aggregate3Calls).toBeGreaterThan(0)
    expect(wrap.directQuoteCalls).toBe(0)
  })

  test('a malformed manifest.multicall3 is rejected synchronously, before any RPC', () => {
    expect(() =>
      createRouter({ client: poisonedClient(), manifest: { ...baseManifest(), multicall3: '0xnope' as Address } }),
    ).toThrow(RouterConfigError)
  })

  test('a swap through aggregate3 still preflights directly and stays honest end to end', async () => {
    const m = manifest()
    const [probe] = directProbes(v2Module, TOKEN_A, TOKEN_B, AMOUNT_IN, m)
    const [token0] = sortAddresses(TOKEN_A, TOKEN_B)
    const zeroForOne = token0.toLowerCase() === TOKEN_A.toLowerCase()
    const base = stubClient({ calls: entryFor(probe!.quote.call, v2Return(10n ** 24n, 10n ** 24n, zeroForOne)) })
    const wrap = withMulticall(base.client)
    const router = createRouter({ client: wrap.client, manifest: m })

    const result = await router.getSwap({ ...req, trader: TRADER })
    expect(result.status).toBe('ready')
    assertResultCoherent(result)
    expect(wrap.aggregate3Calls).toBeGreaterThan(0)
    expect(wrap.directQuoteCalls).toBe(0)
    expect(base.counters.preflights).toBe(1) // the simulation went out as itself, never aggregated
  })
})

// ---------------------------------------------------------------------------
// Ported from the deleted `waves.test.ts`, at the layer that now owns each
// claim, plus the concurrency scenarios spec §8 asks for. Everything here runs
// through the REAL facade — two searches really do race on one router, and the
// index they share is a real `PoolIndex` under a real bound.
// ---------------------------------------------------------------------------

/** Wraps a client to count `eth_call`s per (lowercased) target and, optionally, to reject one
 * target's calls with real revert DATA — the shape the negative cache must refuse to generalize. */
function countingClient(
  base: PublicClient,
  opts: { revertWithData?: Address } = {},
): { client: PublicClient; callsTo: (target: Address) => number } {
  const counts = new Map<string, number>()
  const client = {
    ...base,
    async request(args: any) {
      if (args.method === 'eth_call') {
        const target = ((args.params[0] as { to: string }).to ?? '').toLowerCase()
        counts.set(target, (counts.get(target) ?? 0) + 1)
        if (opts.revertWithData !== undefined && target === opts.revertWithData.toLowerCase()) {
          throw Object.assign(new Error('execution reverted'), { data: '0xf29b7f98' })
        }
      }
      return base.request(args)
    },
  } as unknown as PublicClient
  return { client, callsTo: (target) => counts.get(target.toLowerCase()) ?? 0 }
}

test('the head-regression self-heal bound scales with the manifest\'s reorg depth, not a mainnet constant', async () => {
  // `maxPlausibleHeadRegression` is a multiple of THIS chain's overlap. The same 200-block drop is
  // two different facts on two different chains: on mainnet (overlap 32) it is far outside anything
  // a replica or a reorg produces, so the WATERMARK is what was wrong and it self-heals; on a chain
  // that rewinds 600 blocks it is an ordinary lagging replica, and reporting it is the whole point
  // of the axis. A bound pinned to mainnet's number silently converts the second case into the first.
  async function regressBy(reorgOverlapBlocks: bigint, drop: bigint): Promise<boolean> {
    const manifest: ChainManifest = {
      ...baseManifest({ v2Block: BLOCK_NUMBER + 1_000_000n, v4: false }),
      chain: { blockTimeSeconds: 12, reorgOverlapBlocks },
    }
    let head = BLOCK_NUMBER
    const { client } = stubClient({ blockNumber: () => head })
    const router = createRouter({ client, manifest })
    const req: SwapRequest = { tokenIn: TOKEN_A, tokenOut: TOKEN_B, amountIn: AMOUNT_IN, trader: TRADER }

    await router.getSwap(req) // watermark: N
    head = BLOCK_NUMBER - drop
    const after = await router.getSwap(req)
    assertResultCoherent(after)
    return after.search.headRegressed
  }

  expect(await regressBy(32n, 200n)).toBe(false) // mainnet-shaped: beyond the bound, so the watermark heals
  expect(await regressBy(600n, 200n)).toBe(true) // deep-reorg chain: 200 is well inside it, an ordinary lag
})

test('a data-less revert is negative-cached across searches at the same head; a data-carrying one is re-quoted', async () => {
  // Two properties of ONE cache, both about the same shared `PoolIndex` the router holds across
  // requests. A data-less revert is the pool-absent shape and generalizes: a second search at the
  // same block must not re-ask. A data-carrying revert (NotEnoughLiquidity, a hook rejection, a
  // rounding revert) is potentially amount- or context-dependent and generalizes to nothing, so a
  // second search — standing in for a concurrent request at another amount — has to re-quote it.
  const manifest = baseManifest({ v2Block: BLOCK_NUMBER + 1_000_000n, v4: false })
  const pair = computeV2PairAddress(V2_FACTORY, TOKEN_A, TOKEN_B)
  const req: QuoteRequest = { tokenIn: TOKEN_A, tokenOut: TOKEN_B, amountIn: AMOUNT_IN }

  // Nothing registered for the pair: every call is the default data-less "no pool there" revert.
  const bare = countingClient(stubClient({}).client)
  const bareRouter = createRouter({ client: bare.client, manifest })
  await bareRouter.getQuote(req)
  expect(bare.callsTo(pair)).toBe(1)
  await bareRouter.getQuote(req)
  expect(bare.callsTo(pair)).toBe(1) // skipped entirely — the pool is negative at this block

  const withData = countingClient(stubClient({}).client, { revertWithData: pair })
  const dataRouter = createRouter({ client: withData.client, manifest })
  await dataRouter.getQuote(req)
  expect(withData.callsTo(pair)).toBe(1)
  await dataRouter.getQuote(req)
  expect(withData.callsTo(pair)).toBe(2) // re-quoted: this verdict was never entitled to generalize
})

test('a warm dense index finds the route a cold search finds — warm and cold converge by construction', async () => {
  // THE LIVE SHAPE THIS PINS (mainnet, 2026-08-07): `rl quote XPR USDC 100` found 0.2575 USDC
  // against a cold cache and 0.0460 — 5.6x worse — against a warmed 655k-pool index, because leg
  // selection ranked by creation recency and handed every slot to freshly-created junk, so the
  // liquid pool was never quoted at all. The cold search only won by accident of arrival order.
  //
  // The engine has no leg slots any more and the intermediates frontier is a growing set rather
  // than a chosen one, so warm and cold have to converge — but "by construction" is a claim about
  // code, and this is the scenario that would have caught the old one: MORE intermediates than one
  // frontier batch (INTERMEDIATES_BATCH = 8), with the liquid pair sitting in the middle of them.
  const manifest = baseManifest({ v2Block: BLOCK_NUMBER - 500n, v4: false })
  const xs = Array.from({ length: 11 }, (_, i) => `0x${(0xd0 + i).toString(16)}${'0'.repeat(38)}` as Address)
  const LIQUID = xs[7]! // neither first nor last in any ordering the frontier might use

  const calls: Record<string, Hex> = {}
  for (const x of xs) {
    const inCall = directProbes(v2Module, TOKEN_A, x, AMOUNT_IN, manifest)[0]!.quote.call
    const outCall = directProbes(v2Module, x, TOKEN_B, AMOUNT_IN, manifest)[0]!.quote.call
    const inZeroForOne = sortAddresses(TOKEN_A, x)[0]!.toLowerCase() === TOKEN_A.toLowerCase()
    const outZeroForOne = sortAddresses(x, TOKEN_B)[0]!.toLowerCase() === x.toLowerCase()
    const deep = x === LIQUID
    Object.assign(
      calls,
      entryFor(inCall, v2Return(10n ** 18n, deep ? 10n ** 21n : 10n ** 18n, inZeroForOne)),
      entryFor(outCall, v2Return(10n ** 18n, deep ? 10n ** 21n : 10n ** 18n, outZeroForOne)),
    )
  }
  const creationLogs = (endpoint: string): Log<bigint, number, false>[] => {
    // The junk pairs are the NEWEST — the ordering that used to decide which pools got quoted.
    if (endpoint === TOKEN_A.toLowerCase()) {
      return xs.map((x, i) => pairCreatedLog(manifest, TOKEN_A, x, x === LIQUID ? BLOCK_NUMBER - 400n : BLOCK_NUMBER - 10n + BigInt(i)))
    }
    if (endpoint === TOKEN_B.toLowerCase()) {
      return xs.map((x, i) => pairCreatedLog(manifest, x, TOKEN_B, x === LIQUID ? BLOCK_NUMBER - 400n : BLOCK_NUMBER - 10n + BigInt(i)))
    }
    return []
  }
  const req: QuoteRequest = { tokenIn: TOKEN_A, tokenOut: TOKEN_B, amountIn: AMOUNT_IN }

  async function drainToFinal(router: ReturnType<typeof createRouter>): Promise<QuoteResult> {
    let last: QuoteResult | undefined
    for await (const e of router.quotes(req)) {
      if (e.type === 'progress') continue
      last = e.result
      assertResultCoherent(e.result)
    }
    return last!
  }

  // COLD: an empty index; every pool arrives during the search, from the adjacency scans.
  const cold = stubClient({ calls, logs: creationLogs })
  const coldRouter = createRouter({ client: cold.client, manifest })
  const coldResult = await drainToFinal(coldRouter)

  // WARM: the same world already in the index before the search starts (a cache/pool-list load), so
  // enumeration faces the full density from the very first cycle.
  const warm = stubClient({ calls, logs: creationLogs })
  const warmRouter = createRouter({ client: warm.client, manifest })
  warmRouter.ingestLogs([...creationLogs(TOKEN_A.toLowerCase()), ...creationLogs(TOKEN_B.toLowerCase())])
  expect(warmRouter.stats().pools).toBe(xs.length * 2)
  const warmResult = await drainToFinal(warmRouter)

  expect(cold.counters.scans).toBeGreaterThan(0) // the cold run really had to discover the world
  expect(coldResult.status).toBe('quote')
  expect(warmResult.status).toBe('quote')
  if (coldResult.status !== 'quote' || warmResult.status !== 'quote') throw new Error('unreachable')

  // The core promise: an index that knows MORE must never route WORSE.
  const via = (r: QuoteResult & { status: 'quote' }): string[] => r.best.route.legs.map((l) => String(l.currencyOut).toLowerCase())
  expect(via(coldResult)).toEqual([LIQUID.toLowerCase(), TOKEN_B.toLowerCase()])
  expect(via(warmResult)).toEqual([LIQUID.toLowerCase(), TOKEN_B.toLowerCase()])
  expect(warmResult.best.quote.amountOut).toBe(coldResult.best.quote.amountOut)
})

// ---------------------------------------------------------------------------
// Two searches on ONE router (spec §8). The router is a long-lived object with
// one shared `PoolIndex`, so concurrency is the normal case, not an edge one:
// every write one search makes is visible to the other mid-flight.
// ---------------------------------------------------------------------------

test('two concurrent searches on one router: different pairs, same head — both coherent, and the shared index holds both', async () => {
  const manifest = baseManifest({ v2Block: BLOCK_NUMBER - 500n, v4: false })
  const aMid = directProbes(v2Module, TOKEN_A, MID, AMOUNT_IN, manifest)[0]!.quote.call
  const midB = directProbes(v2Module, MID, TOKEN_B, AMOUNT_IN, manifest)[0]!.quote.call
  const aMidZeroForOne = sortAddresses(TOKEN_A, MID)[0]!.toLowerCase() === TOKEN_A.toLowerCase()
  const midBZeroForOne = sortAddresses(MID, TOKEN_B)[0]!.toLowerCase() === MID.toLowerCase()

  const { client } = stubClient({
    calls: {
      ...entryFor(aMid, v2Return(10n ** 18n, 10n ** 18n, aMidZeroForOne)),
      ...entryFor(midB, v2Return(10n ** 18n, 10n ** 18n, midBZeroForOne)),
    },
    logs: (endpoint) =>
      endpoint === TOKEN_A.toLowerCase()
        ? [pairCreatedLog(manifest, TOKEN_A, MID, BLOCK_NUMBER - 400n)]
        : endpoint === TOKEN_B.toLowerCase()
          ? [pairCreatedLog(manifest, MID, TOKEN_B, BLOCK_NUMBER - 400n)]
          : endpoint === MID.toLowerCase()
            ? [pairCreatedLog(manifest, TOKEN_A, MID, BLOCK_NUMBER - 400n)]
            : [],
  })
  const router = createRouter({ client, manifest })

  // The two-hop A -> MID -> B and the direct A -> MID, launched together: they share the A/MID pool
  // and the A endpoint's adjacency coverage, and one is a SWAP, so a preflight rides along too.
  const [twoHop, direct] = await Promise.all([
    router.getQuote({ tokenIn: TOKEN_A, tokenOut: TOKEN_B, amountIn: AMOUNT_IN }),
    router.getSwap({ tokenIn: TOKEN_A, tokenOut: MID, amountIn: AMOUNT_IN, trader: TRADER }),
  ])

  assertResultCoherent(twoHop)
  assertResultCoherent(direct)
  expect(twoHop.status).toBe('quote')
  if (twoHop.status === 'quote') expect(twoHop.best.route.legs).toHaveLength(2)
  expect(direct.status).toBe('ready')
  if (direct.status === 'ready') expect(direct.best.route.legs).toHaveLength(1)
  // Both searches' pools are in the one shared index, and neither clobbered the other's.
  expect(router.stats().pools).toBe(2)
})

test('two concurrent searches under maxPools pressure: one search\'s scans evict the other\'s intermediates, and both still terminate coherently', async () => {
  // The ROUTER-level twin of the loop's frontier-shrink regression (`search/loop.test.ts`). There
  // the eviction is simulated inside one search; here it is REAL and caused by the other search:
  // two live searches sharing one bounded index, each upserting pools that push the other's
  // never-quoted neighbor pools out — WITHOUT bumping the victim's `indexVersion`. That is exactly
  // the interleaving that used to park a search one comparison short of `final`, forever, so the
  // load-bearing assertion is that both promises settle at all.
  const manifest = baseManifest({ v2Block: BLOCK_NUMBER - 500n, v4: false })
  const OTHER_IN = `0x${'a7'.repeat(20)}` as Address
  const OTHER_OUT = `0x${'b7'.repeat(20)}` as Address
  const MID2 = `0x${'c7'.repeat(20)}` as Address

  const pairs: [Address, Address][] = [
    [TOKEN_A, MID],
    [MID, TOKEN_B],
    [OTHER_IN, MID2],
    [MID2, OTHER_OUT],
  ]
  const calls: Record<string, Hex> = {}
  for (const [a, b] of pairs) {
    const call = directProbes(v2Module, a, b, AMOUNT_IN, manifest)[0]!.quote.call
    Object.assign(calls, entryFor(call, v2Return(10n ** 18n, 10n ** 18n, sortAddresses(a, b)[0]!.toLowerCase() === a.toLowerCase())))
  }
  const byEndpoint = new Map<string, Log<bigint, number, false>[]>()
  // DISTINCT creation blocks: the LRU touch a scan-sourced upsert records is the pool's creation
  // block, and a pool touched at the block the triggering upsert itself names is protected — so
  // four pools all created at one block would fill the index without ever evicting anything.
  pairs.forEach(([a, b], i) => {
    const log = pairCreatedLog(manifest, a, b, BLOCK_NUMBER - 400n + BigInt(i))
    for (const endpoint of [a, b]) {
      const key = endpoint.toLowerCase()
      byEndpoint.set(key, [...(byEndpoint.get(key) ?? []), log])
    }
  })
  // Both runs below share this one world description; each gets its own client so neither inherits
  // the other's call history.
  const newClient = () => stubClient({ calls, logs: (endpoint) => byEndpoint.get(endpoint) ?? [] }).client

  /** Runs the two searches concurrently on one router, resolving to `'hung'` rather than waiting
   * forever if the interleaving parks a search short of `final` — the regression this test exists for. */
  const raceBothSearches = (router: Router) =>
    Promise.race([
      Promise.all([
        router.getQuote({ tokenIn: TOKEN_A, tokenOut: TOKEN_B, amountIn: AMOUNT_IN }),
        router.getQuote({ tokenIn: OTHER_IN, tokenOut: OTHER_OUT, amountIn: AMOUNT_IN }),
      ]),
      // 2s, not 5s: bun's default per-test timeout is 5s, so a 5s sentinel raced the runner and a
      // genuinely parked search reported as an anonymous test timeout rather than as this test's own
      // 'hung' — the crafted diagnostic has to win that race.
      new Promise<'hung'>((resolve) => setTimeout(() => resolve('hung'), 2_000)),
    ])

  // THE CONTROL, and the reason this test can claim anything about eviction at all. Same world, same
  // two searches, an UNBOUNDED index: all four pools are reachable, all four are retained, and both
  // searches find their two-hop. Without this run, the bounded run below asserts nothing — a bounded
  // index cannot report more pools than its bound, so `pools < 4` there is true whether four pools
  // entered it or one did (which is exactly what the assertion it replaced, C4-T14, was doing).
  const controlIndex = new PoolIndex(manifest.wrappedNative) // no maxPools
  const control = await raceBothSearches(createRouter({ client: newClient(), manifest, index: controlIndex }))
  expect(control).not.toBe('hung')
  if (control === 'hung') throw new Error('unreachable')
  expect(control.map((r) => r.status)).toEqual(['quote', 'quote'])
  expect(pairs.filter(([a, b]) => controlIndex.pair(a, b).length > 0)).toHaveLength(4)
  expect(controlIndex.stats().pools).toBe(4)

  // Two pools is half of what the two searches between them need, so every scan that lands evicts
  // something the OTHER search is mid-way through reasoning about. The index is INJECTED rather than
  // configured through `maxPools` so the assertions below can ask it per-pair what it still holds.
  const index = new PoolIndex(manifest.wrappedNative, { maxPools: 2 })
  const router = createRouter({ client: newClient(), manifest, index })
  const settled = await raceBothSearches(router)

  expect(settled).not.toBe('hung')
  if (settled === 'hung') throw new Error('unreachable')
  for (const result of settled) assertResultCoherent(result)

  // EVICTION, OBSERVED — as a delta against the control, per-pair. Four pairs entered this index (the
  // control proves this world offers exactly four and that both searches reach all of them); two of
  // them are gone. That is a pool the index accepted and then threw away, which is the thing the word
  // "eviction" names.
  const stillHeld = pairs.filter(([a, b]) => index.pair(a, b).length > 0)
  expect(stillHeld).toHaveLength(2)
  expect(index.stats().pools).toBe(2)
  // Eviction tears down the adjacency scaffolding with the pool (`evictPool` unlinks both
  // directions), so a stale edge pointing at an evicted pool would show up here as a count above
  // `2 * pools` — the leak that would leave the index reporting neighbours it can no longer resolve.
  // The control's 8 is the same arithmetic on four surviving pools.
  expect(index.stats().adjacencyEdges).toBe(4)
  expect(controlIndex.stats().adjacencyEdges).toBe(8)
})
