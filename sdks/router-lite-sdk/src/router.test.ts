import { afterEach, describe, expect, test } from 'bun:test'
import type { Address, Hex, Log, PublicClient } from 'viem'
import { decodeFunctionData, encodeAbiParameters, encodeEventTopics, toHex, zeroAddress } from 'viem'

import {
  MAX_DEADLINE_SECONDS,
  MAX_HINTS_PER_REQUEST,
  MAX_HOOK_DATA_BYTES,
  DEFAULT_REORG_OVERLAP_BLOCKS,
  UR_ADDRESS_THIS,
  UR_MSG_SENDER,
} from './constants'
import { RouterConfigError } from './errors'
import { MULTICALL3_ABI, V2_FACTORY_ABI } from './internal/abis'
import { sortAddresses } from './internal/currency'
import { MULTICALL3_ADDRESS } from './internal/multicall'
import {
  assertResultCoherent,
  emptyReport,
  headerNotFoundError,
  rateLimitHttpError,
  rateLimitRpcError,
  recordStubViolation,
  serveAggregate3,
  takeStubViolations,
  v4Ref,
} from './internal/testing'
import { manifestFor } from './manifest'
import { PoolIndex } from './pools/poolIndex'
import { computeV2PairAddress, v2Module } from './protocols/v2'
import { v4Module } from './protocols/v4'
import { classifyQuote, classifySwap, createRouter } from './router'
import type {
  ChainManifest,
  EncodedTx,
  ExecutionRequirement,
  Permit2PermitSingle,
  PoolHint,
  PoolKey,
  QuoteRequest,
  QuoteResult,
  RankedRoute,
  SearchReport,
  SwapRequest,
  SwapResult,
} from './types'

// ---------------------------------------------------------------------------
// The facade is exercised end to end against the *real* v2/v4 protocol
// modules (no stub ProtocolModule here — `createRouter` hardwires the real
// ones, so a test double for them would never catch a wiring bug between the
// facade and the actual encode/decode paths). Only the `PublicClient` is
// stubbed, scripted per test, with the "unregistered call reverts" convention:
// a measurement the script does not answer is a pool that is not there.
// ---------------------------------------------------------------------------

const TOKEN_A = `0x${'aa'.repeat(20)}` as Address
const TOKEN_B = `0x${'bb'.repeat(20)}` as Address
const MID = `0x${'cc'.repeat(20)}` as Address
const WRAPPED = `0x${'ee'.repeat(20)}` as Address
const TRADER = `0x${'11'.repeat(20)}` as Address
const UNIVERSAL_ROUTER = `0x${'22'.repeat(20)}` as Address
const PERMIT2 = `0x${'33'.repeat(20)}` as Address
const V2_FACTORY = `0x${'44'.repeat(20)}` as Address
const V4_POOL_MANAGER = `0x${'55'.repeat(20)}` as Address
const V4_QUOTER = `0x${'66'.repeat(20)}` as Address

const CHAIN_ID = 1
const BLOCK_NUMBER = 1_000_000n
const BLOCK_TIMESTAMP = 1_700_000_000n
const BLOCK_HASH = `0x${'ab'.repeat(32)}` as Hex
const AMOUNT_IN = 1000n

function baseManifest(opts: { v2Block?: bigint; v4?: boolean } = {}): ChainManifest {
  const m: ChainManifest = {
    chainId: CHAIN_ID,
    wrappedNative: WRAPPED,
    v2: { factory: V2_FACTORY, deploymentBlock: opts.v2Block ?? 100n },
    execution: { address: UNIVERSAL_ROUTER, commandSet: 'ur-2.0', permit2: PERMIT2, wrappedNative: WRAPPED },
    coreIntermediates: [],
  }
  if (opts.v4 ?? true) m.v4 = { poolManager: V4_POOL_MANAGER, deploymentBlock: 100n, quoter: V4_QUOTER }
  return m
}

// ---------------------------------------------------------------------------
// Stub client
// ---------------------------------------------------------------------------

type ClientScript = {
  calls?: Record<string, Hex>
  /** Logs for the given (lowercased) adjacency endpoint, pre-filtered by the caller is not
   * required — the stub itself clips to the requested [fromBlock, toBlock]. */
  logs?: (endpoint: string) => (Log & { blockNumber: bigint })[]
  /** Scripted preflight outcomes, in dispatch order; `hang` never settles — the deterministic way
   * to hold verification in flight while something else (an abort) decides the search. */
  preflight?: ('ok' | 'revert' | 'rate-limit' | 'hang')[]
  /** 429 every quote call (the quoter/pair `eth_call`s) while answering every other method — the
   * partial-outage shape a real provider produces when only `eth_call` is rate limited. */
  rateLimitQuotes?: boolean
  /** `header not found` on every quote call while `eth_getBlockByNumber` answers normally — the
   * load-balancer shape: the head came from one node, the pinned `eth_call`s go to another that is
   * behind it. Nothing here is a revert, and nothing is a 429 (C4-H1). */
  nodeStateQuotes?: boolean
  readiness?: { erc20Allowance?: bigint; permit2Allowance?: bigint; balance?: bigint }
  /** 429 the trader's `balanceOf` read while every other read lands — a throttled readiness check,
   * which must never be coerced into a stated `insufficient-balance available: 0n`. */
  rateLimitBalanceRead?: boolean
  /** Aborts this controller from *inside* the first quote call, after its answer is decided: the
   * route prices, and the loop's next cycle sees a fired signal. A deadline landing mid-search,
   * rather than between events. */
  abortOnQuote?: AbortController
  /** Fires from inside every quote call, after the answer is decided but before it is returned — the
   * same timing `abortOnQuote` uses, generalized to an arbitrary callback (C4-H5: a test's hook for
   * mutating router-level state, e.g. `clearIndex()`, at a precise point mid-search — standing in for
   * a host doing so from another task while this generator is paused on the event loop). */
  midSearch?: () => void
  chainId?: number
  /** A function rather than a value where a test needs the head to MOVE between (or within)
   * searches — the head-regression guard refetches once, so the fixture has to answer per call. */
  blockNumber?: bigint | (() => bigint)
  throwOnBlockFetch?: boolean
}

type Counters = { scans: number; preflights: number; scannedEndpoints: Set<string>; blockFetches: number }

/** tokenIn is always {@link TOKEN_A} across these tests, so the ERC20 branch only needs to answer for it. */
function stubClient(script: ClientScript): { client: PublicClient; counters: Counters } {
  const counters: Counters = { scans: 0, preflights: 0, scannedEndpoints: new Set(), blockFetches: 0 }
  const calls = script.calls ?? {}
  const balance = script.readiness?.balance ?? 10n ** 24n
  const erc20Allowance = script.readiness?.erc20Allowance ?? 10n ** 24n
  const permit2Allowance = script.readiness?.permit2Allowance ?? 10n ** 24n
  const headOf = (): bigint => (typeof script.blockNumber === 'function' ? script.blockNumber() : script.blockNumber ?? BLOCK_NUMBER)
  let preflightIndex = 0

  const client = {
    async getChainId() {
      return script.chainId ?? CHAIN_ID
    },
    async request(args: any) {
      if (args.method === 'eth_getBlockByNumber') {
        counters.blockFetches++
        if (script.throwOnBlockFetch) throw new Error('rpc unavailable')
        return { number: toHex(headOf()), hash: BLOCK_HASH, timestamp: toHex(BLOCK_TIMESTAMP) }
      }
      if (args.method === 'eth_getBalance') return toHex(balance)
      if (args.method === 'eth_getCode') {
        // `validateManifest`'s immutable cross-check (manifest.ts) fetches the execution address's
        // code unconditionally whenever `execution` is present, codeHash or not. This stub's fake
        // "bytecode" is just this manifest's own immutables concatenated — enough to satisfy that
        // substring check without asserting anything about real Universal Router bytecode.
        const [addr] = args.params as [string]
        if (addr.toLowerCase() !== UNIVERSAL_ROUTER.toLowerCase()) return '0x'
        const embed = [WRAPPED, PERMIT2, V2_FACTORY, V4_POOL_MANAGER].map((a) => a.slice(2).toLowerCase()).join('')
        return `0x${embed}` as Hex
      }
      if (args.method === 'eth_getLogs') {
        const filter = args.params[0]
        counters.scans++
        // An unfiltered query would make a real provider return every log the factory ever emitted;
        // the scanner is supposed to always send its topic filter (see `internal/logScan.ts`).
        if (!Array.isArray(filter.topics) || filter.topics.length === 0)
          throw new Error('stubClient: eth_getLogs arrived with no topic filter')
        // A topic position holds `null` (anything), one value, or — since C5-C — an ARRAY of accepted
        // values, which is how one adjacency request carries BOTH of the trade's endpoints. Indexed
        // address topics are 32-byte left-padded; unpad back to plain lowercase addresses so callers
        // can key `logs`/`scannedEndpoints` by the address itself, not its topic encoding.
        const slot = (topic: unknown): string[] =>
          (topic === null || topic === undefined ? [] : Array.isArray(topic) ? topic : [topic]).filter((t): t is string => typeof t === 'string')
        const bound = [filter.topics[1], filter.topics[2]].map(slot).find((values) => values.length > 0) ?? []
        const endpoints = bound.map((t) => `0x${t.slice(-40)}`.toLowerCase() as Address)
        for (const endpoint of endpoints) counters.scannedEndpoints.add(endpoint)
        if (!script.logs || endpoints.length === 0) return []
        const from = BigInt(filter.fromBlock)
        const to = BigInt(filter.toBlock)
        // A node answers a merged filter with the union over its accepted values, so this stub does
        // too; ingestion is idempotent, so a log matching both endpoints arriving twice is harmless.
        return endpoints.flatMap((endpoint) => script.logs!(endpoint)).filter((log) => log.blockNumber >= from && log.blockNumber <= to)
      }
      if (args.method !== 'eth_call') throw new Error(`stubClient: unexpected method ${args.method}`)

      const [{ to, data }] = args.params
      const target = (to as string).toLowerCase()

      if (target === UNIVERSAL_ROUTER.toLowerCase()) {
        counters.preflights++
        const outcome = script.preflight?.[preflightIndex++] ?? 'ok'
        if (outcome === 'revert') throw Object.assign(new Error('execution reverted'), { data: '0xdeadbeef' })
        if (outcome === 'rate-limit') throw rateLimitHttpError()
        if (outcome === 'hang') return new Promise(() => {}) // never settles
        return '0x'
      }
      if (target === PERMIT2.toLowerCase()) {
        return encodeAbiParameters([{ type: 'uint160' }, { type: 'uint48' }, { type: 'uint48' }], [permit2Allowance, 2_000_000_000, 0])
      }
      if (target === TOKEN_A.toLowerCase()) {
        // balanceOf(address) has one argument; allowance(address,address) has two.
        const isBalanceOf = (data as string).length <= 10 + 64
        if (isBalanceOf && script.rateLimitBalanceRead) throw rateLimitHttpError()
        const value = isBalanceOf ? balance : erc20Allowance
        return encodeAbiParameters([{ type: 'uint256' }], [value])
      }

      // Quote calls (quoters, v2 pairs) — the only branch the partial outage touches.
      if (script.rateLimitQuotes) throw rateLimitRpcError()
      if (script.nodeStateQuotes) throw headerNotFoundError()
      const entry = calls[`${target}:${data}`]
      script.abortOnQuote?.abort() // the answer is already decided; the deadline lands on the way out
      script.midSearch?.()
      if (entry === undefined) throw new Error('execution reverted') // no pool there
      return entry
    },
  } as unknown as PublicClient

  return { client, counters }
}

function v2Return(reserveIn: bigint, reserveOut: bigint, zeroForOne: boolean): Hex {
  const [reserve0, reserve1] = zeroForOne ? [reserveIn, reserveOut] : [reserveOut, reserveIn]
  return encodeAbiParameters([{ type: 'uint112' }, { type: 'uint112' }, { type: 'uint32' }], [reserve0, reserve1, 0])
}

function v4Return(amountOut: bigint): Hex {
  return encodeAbiParameters([{ type: 'uint256' }, { type: 'uint256' }], [amountOut, 0n])
}

function entryFor(call: { to: Address; data: Hex }, value: Hex): Record<string, Hex> {
  return { [`${call.to.toLowerCase()}:${call.data}`]: value }
}

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
    const [probe] = v2Module.speculativeDirect(TOKEN_A, TOKEN_B, AMOUNT_IN, manifest)
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
    const [probe] = v2Module.speculativeDirect(TOKEN_A, TOKEN_B, AMOUNT_IN, manifest)
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

test('classifySwap: requirements present but no candidate ever compiled falls through to terminal classification, never asserting a missing tx (C1 regression)', () => {
  // The exact repro shape: a `best` exists (something was quoted and ranked), top-level
  // `requirements` is non-empty (readiness found something missing), but nothing ever compiled
  // into an executable plan, so `tx` is `undefined`. Before the fix, the `needs-action` branch
  // asserted `e.tx!` unconditionally and produced a result with `tx: undefined`, which
  // `assertResultCoherent` rejects.
  const fakeBest: RankedRoute = {
    route: { legs: [] },
    quote: { amountIn: 1n, amountOut: 1n, intermediateAmounts: [] },
    execution: 'failed',
  }
  const requirement: ExecutionRequirement = { kind: 'erc20-approval', token: TOKEN_A, spender: PERMIT2, minimumAmount: 1n }

  const completeReport = emptyReport() // aborted:false, all `disabled`, unattempted:0 -> isSearchComplete = true
  const complete = classifySwap({ best: fakeBest, alternatives: [], requirements: [requirement], report: completeReport })
  expect(complete.status).toBe('no-route')
  if (complete.status === 'no-route') expect(complete.alternatives).toContainEqual(fakeBest)
  assertResultCoherent(complete)

  const incompleteReport = { ...emptyReport(), discovery: { ...emptyReport().discovery, v2: { status: 'partial' as const, coveredRanges: [], demandFloor: 0n } } }
  const incomplete = classifySwap({ best: fakeBest, alternatives: [], requirements: [requirement], report: incompleteReport })
  expect(incomplete.status).toBe('inconclusive')
  // This candidate is `execution: 'failed'` — the chain rejected it — so it is demoted into
  // `alternatives` on the incomplete path too, exactly as on the completed `no-route` path above. An
  // authoritative revert does not become provisional because some other part of the search was cut
  // short, so `inconclusive` never *leads* with it.
  if (incomplete.status === 'inconclusive') {
    expect(incomplete.best).toBeUndefined()
    expect(incomplete.tx).toBeUndefined()
  }
  expect(incomplete.alternatives).toContainEqual(fakeBest)
  assertResultCoherent(incomplete)
})

function rankedRoute(out: bigint, execution: RankedRoute['execution'], revertData?: Hex): RankedRoute {
  return {
    route: { legs: [] },
    quote: { amountIn: AMOUNT_IN, amountOut: out, intermediateAmounts: [] },
    execution,
    ...(revertData !== undefined && { revertData }),
  }
}

test('classifyQuote: a leader outpriced by its own alternative keeps the marker that explains it (live Base regression)', () => {
  // The defect, exactly as it shipped. On Base, `rl quote eth usdc 1` ranked a hooked v4 pool top at
  // 1,906.567949 USDC and `rankRoutes`' 5-bps simplicity margin (1.6 bps here) promoted a plain v3
  // pool at 1,906.256081 ahead of it — correct, spec'd behaviour, and marked `promotedOverComplex`
  // precisely so a caller can tell it apart from a broken sort. `toQuoted` then rebuilt every quote
  // route from `{ route, quote }`, and the marker was the collateral: what reached `QuoteResult`
  // (and the CLI panel, and any SDK consumer) was a `best` beaten by its own `alternatives[0]` with
  // nothing anywhere to explain it. The marker is a fact about RANKING, which quoting performs; only
  // `execution`/`revertData` are facts about verification, and only those two may be stripped.
  const promoted: RankedRoute = { ...rankedRoute(1_906_256_081n, 'unverified'), promotedOverComplex: true }
  const outpricing: RankedRoute = rankedRoute(1_906_567_949n, 'unverified')

  const r = classifyQuote({ best: promoted, alternatives: [outpricing], report: emptyReport() })
  expect(r.status).toBe('quote')
  if (r.status !== 'quote') return
  expect(r.best.promotedOverComplex).toBe(true)
  // Still stripped: the verification fields say nothing a quote is entitled to claim.
  expect(Object.keys(r.best).sort()).toEqual(['promotedOverComplex', 'quote', 'route'])
  expect(Object.keys(r.alternatives[0]!).sort()).toEqual(['quote', 'route'])
  assertResultCoherent(r)
})

test('assertResultCoherent: an UNMARKED quote inversion is the bug, and it is rejected', () => {
  // The systemic half of the fix. An alternative pricing above `best` is legal — but only while the
  // route says why. Drop the marker (which is precisely what `toQuoted` used to do) and the same
  // result is indistinguishable from a sort bug, so it must not pass.
  const best = rankedRoute(1_906_256_081n, 'unverified')
  const outpricing = rankedRoute(1_906_567_949n, 'unverified')
  const unmarked = classifyQuote({ best, alternatives: [outpricing], report: emptyReport() })
  expect(() => assertResultCoherent(unmarked)).toThrow(/outpriced by an alternative/)

  // And an ordinary, correctly-ordered quote is untouched by the check.
  const ordered = classifyQuote({ best: outpricing, alternatives: [best], report: emptyReport() })
  expect(() => assertResultCoherent(ordered)).not.toThrow()
})

test('assertResultCoherent: a marker that OUTLIVED its promotion is the bug too, in the other direction', () => {
  // The stale half. The engine re-ranks the accumulated composed set every cycle, so a marker set
  // in one cycle is an input to the next — and if it survives a re-rank that promoted nothing, it is a
  // false explanation attached to a leader that simply won outright. (`rankRoutes` strips input
  // markers precisely so this cannot happen; this is the assertion that would catch it if that ever
  // regressed.)
  const stale: RankedRoute = { ...rankedRoute(1_906_567_949n, 'unverified'), promotedOverComplex: true }
  const lower = rankedRoute(1_000_000_000n, 'unverified')
  const r = classifyQuote({ best: stale, alternatives: [lower], report: emptyReport() })
  expect(() => assertResultCoherent(r)).toThrow(/marker outlived the promotion/)

  // The bound is `>=`, not `>`: a promotion over a route pricing EXACTLY equal is legal (the margin
  // is inclusive, and `compareRoutes`' tie-breaks decide who led), so an equal-priced alternative
  // must satisfy the check.
  const tied = classifyQuote({
    best: { ...rankedRoute(1_906_567_949n, 'unverified'), promotedOverComplex: true },
    alternatives: [rankedRoute(1_906_567_949n, 'unverified')],
    report: emptyReport(),
  })
  expect(() => assertResultCoherent(tied)).not.toThrow()
})

test('classifySwap: promotedOverComplex survives onto the public SwapResult.best untouched (C4-P7)', () => {
  // `rankRoutes` (quote/rank.ts) is what actually sets this marker; this test pins the OTHER half of
  // the contract — that `classifySwap` is a pure passthrough for it, just as `classifyQuote`'s
  // `toQuoted` now is (it strips only the two verification fields). A `RankedRoute`
  // already carrying the marker (as if `rankRoutes` had promoted it) must reach `SwapResult.best`
  // exactly as-is for both statuses that lead with `best`.
  const promoted: RankedRoute = { ...rankedRoute(100n, 'verified'), promotedOverComplex: true }
  const tx: EncodedTx = { to: UNIVERSAL_ROUTER, data: '0xfeedface', value: 0n }
  const limits = { minAmountOut: 99n, deadline: 9_999_999_999n }

  const ready = classifySwap({ best: promoted, alternatives: [], tx, limits, report: emptyReport() })
  expect(ready.status).toBe('ready')
  if (ready.status === 'ready') expect(ready.best.promotedOverComplex).toBe(true)
  assertResultCoherent(ready)

  const needsActionBest: RankedRoute = { ...rankedRoute(100n, 'needs-action'), promotedOverComplex: true }
  const requirement: ExecutionRequirement = { kind: 'erc20-approval', token: TOKEN_A, spender: PERMIT2, minimumAmount: 1n }
  const needsAction = classifySwap({
    best: needsActionBest,
    alternatives: [],
    tx,
    limits,
    requirements: [requirement],
    report: emptyReport(),
  })
  expect(needsAction.status).toBe('needs-action')
  if (needsAction.status === 'needs-action') expect(needsAction.best.promotedOverComplex).toBe(true)
  assertResultCoherent(needsAction)
})

test('classifySwap: `needs-action` is gated on the ROUTE\'s discriminant, not on the requirement count', () => {
  // The two used to be read as interchangeable, and they are only interchangeable because of the
  // order of `verifyLeader`'s body (`search/verifier.ts`, "DO NOT REORDER"). This is the shape that
  // tells them apart: a full requirement list, a compiled tx, a clean report — and a leader the
  // engine did NOT gate on those requirements. `needs-action` would be a promise about a route
  // nothing gated, and `assertResultCoherent` rejects exactly that result ("needs-action whose best
  // route is unverified"), so the classifier must not produce it in the first place.
  const requirement: ExecutionRequirement = { kind: 'erc20-approval', token: TOKEN_A, spender: PERMIT2, minimumAmount: 1n }
  const tx: EncodedTx = { to: UNIVERSAL_ROUTER, data: '0xfeedface', value: 0n }
  const limits = { minAmountOut: 99n, deadline: 9_999_999_999n }
  const abortedReport: SearchReport = { ...emptyReport(), aborted: true }

  const r = classifySwap({
    best: rankedRoute(100n, 'unverified'),
    alternatives: [],
    tx,
    limits,
    requirements: [requirement],
    report: abortedReport,
  })

  expect(r.status).toBe('inconclusive')
  assertResultCoherent(r)

  // And the positive control: same everything, leader marked `needs-action` by the engine.
  const gated = classifySwap({
    best: rankedRoute(100n, 'needs-action'),
    alternatives: [],
    tx,
    limits,
    requirements: [requirement],
    report: emptyReport(),
  })
  expect(gated.status).toBe('needs-action')
  assertResultCoherent(gated)
})

test('classifySwap: an aborted search hands back everything it computed — best, tx, and alternatives (FW5/P1 regression)', () => {
  // The `AbortSignal.timeout(900)` shape the README recommends: the search priced routes and even
  // compiled the leader's calldata, then the deadline fired. Nobody simulated the leader, so it
  // cannot be promised `ready` — but nothing ruled it out either, and discarding the priced routes
  // and the encoded tx (as this branch used to) leaves the caller a bare reason string.
  const best = rankedRoute(900n, 'unverified')
  const alternatives = [rankedRoute(800n, 'unverified'), rankedRoute(700n, 'failed', '0xdeadbeef')]
  const tx: EncodedTx = { to: UNIVERSAL_ROUTER, data: '0xfeedface', value: 0n }
  const abortedReport: SearchReport = { ...emptyReport(), aborted: true }

  const r = classifySwap({ best, alternatives, tx, report: abortedReport })

  expect(r.status).toBe('inconclusive')
  if (r.status === 'inconclusive') {
    expect(r.reason.code).toBe('aborted')
    expect(r.best).toBe(best)
    expect(r.tx).toBe(tx)
  }
  // `alternatives` and `search` are status-agnostic: reachable with no narrowing at all. A candidate
  // that reverted keeps its verbatim `revertData`, which `RankedRoute` declares.
  expect(r.alternatives).toEqual(alternatives)
  expect(r.alternatives[1]!.revertData).toBe('0xdeadbeef')
  expect(r.search.aborted).toBe(true)
  assertResultCoherent(r)
})

test('classifySwap: an aborted search whose leader REVERTED demotes it to an alternative — no best, no tx (FINDING 1)', () => {
  // The sibling of the test above, and the one line between "we could not verify this" and "we are
  // handing you calldata the chain already rejected". `execution: 'failed'` is the node answering
  // authoritatively about this block; an abort elsewhere in the search does not soften it.
  const failed = rankedRoute(900n, 'failed', '0xdeadbeef')
  const alternatives = [rankedRoute(800n, 'failed', '0xfeed')]
  const tx: EncodedTx = { to: UNIVERSAL_ROUTER, data: '0xfeedface', value: 0n }
  const abortedReport: SearchReport = { ...emptyReport(), aborted: true }

  const r = classifySwap({ best: failed, alternatives, tx, report: abortedReport })

  expect(r.status).toBe('inconclusive')
  if (r.status === 'inconclusive') {
    expect(r.best).toBeUndefined() // never a lead the chain rejected...
    expect(r.tx).toBeUndefined() // ...and never its calldata
  }
  // The ranking survives the demotion: the nominal leader is still the head of the list.
  expect(r.alternatives).toEqual([failed, ...alternatives])
  assertResultCoherent(r)
})

test('classifySwap: partial discovery (no best) classifies inconclusive/discovery-incomplete (C4-P5)', () => {
  // Every other axis is clean (not aborted, nothing unattempted, no transport/verification/head
  // trouble) — the ONLY thing standing between this search and a completed verdict is one protocol's
  // discovery never finishing. `inconclusiveReason` must name that axis specifically, not fall back
  // to a generic code.
  const report: SearchReport = { ...emptyReport(), discovery: { ...emptyReport().discovery, v2: { status: 'partial', coveredRanges: [], demandFloor: 0n } } }

  const r = classifySwap({ alternatives: [], report })

  expect(r.status).toBe('inconclusive')
  if (r.status === 'inconclusive') {
    expect(r.reason.code).toBe('discovery-incomplete')
    expect(r.reason.detail).toContain('v2:partial')
  }
  assertResultCoherent(r)
})

test('classifySwap: unattempted quote candidates (no best) classify inconclusive/quotes-unattempted (C4-P5)', () => {
  // Discovery is complete (every protocol `disabled` in `emptyReport`), nothing aborted, nothing
  // degraded — the search was simply cut off with candidates still unquoted, which is its own
  // incompleteness axis and must not be folded into a generic "did not complete" message.
  // `unattempted` sits outside the `attempted` sum and outside `legsMeasured`: these are legs that
  // were planned and never dispatched, so nothing settled for them.
  const report: SearchReport = {
    ...emptyReport(),
    quoting: { ...emptyReport().quoting, unattempted: 3 },
  }

  const r = classifySwap({ alternatives: [], report })

  expect(r.status).toBe('inconclusive')
  if (r.status === 'inconclusive') {
    expect(r.reason.code).toBe('quotes-unattempted')
    expect(r.reason.detail).toContain('3')
  }
  assertResultCoherent(r)
})

test('getSwap end-to-end: a pre-ingested v4 hint (on a fee tier no module speculates on) resolves to ready', async () => {
  const manifest = baseManifest()
  // fee/tickSpacing outside STANDARD_V4_CONFIGS: unreachable by speculativeDirect guessing, only by
  // the hint the caller ingests up front.
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
  const [v2Probe] = v2Module.speculativeDirect(TOKEN_A, TOKEN_B, AMOUNT_IN, manifest)
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
  const [probe] = v2Module.speculativeDirect(TOKEN_A, TOKEN_B, AMOUNT_IN, manifest)
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
  const [probe] = v2Module.speculativeDirect(TOKEN_A, TOKEN_B, AMOUNT_IN, manifest)
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
  const [probe] = v2Module.speculativeDirect(TOKEN_A, TOKEN_B, AMOUNT_IN, manifest)
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
  const [probe] = v2Module.speculativeDirect(TOKEN_A, TOKEN_B, AMOUNT_IN, manifest)
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

// ---------------------------------------------------------------------------
// A PARTIAL RPC OUTAGE IS NEVER A NO-ROUTE (FW2).
//
// Both tests below are a reviewer's probes, kept permanently. Each one used to
// produce a *confident* `no-route` — the first with "search complete: no viable
// route found" over stats reading 99 attempted / 0 succeeded / 99 failed, the
// second with "no candidate route verified successfully" — because a 429 was
// folded into the same bucket as an on-chain revert. Every other axis looked
// perfect (all protocols' discovery `complete`, nothing aborted, nothing
// unattempted), which is exactly what made the lie so convincing.
// ---------------------------------------------------------------------------

test('a no-route caused by nothing being COMPILABLE names the cause, not just the verdict (C4-H4)', async () => {
  // Same shape as the preflight-revert test above (deployment block above the head, so discovery
  // completes with no scans), but the candidate never reaches preflight at all: the recipient is
  // the very v2 pair the route trades through, which `assertPlanInvariants` rejects. Without the
  // cause attached, the caller is told "no candidate route verified successfully" for a request it
  // could have fixed itself — and the pool address is not knowable at request-validation time, so
  // this is the only layer that can say it.
  const manifest = baseManifest({ v2Block: BLOCK_NUMBER + 1_000_000n, v4: false })
  const [probe] = v2Module.speculativeDirect(TOKEN_A, TOKEN_B, AMOUNT_IN, manifest)
  const [token0] = sortAddresses(TOKEN_A, TOKEN_B)
  const zeroForOne = token0.toLowerCase() === TOKEN_A.toLowerCase()
  const pairAddress = computeV2PairAddress(manifest.v2!.factory, TOKEN_A, TOKEN_B)

  const { client, counters } = stubClient({
    calls: entryFor(probe!.quote.call, v2Return(10n ** 24n, 10n ** 24n, zeroForOne)),
  })
  const router = createRouter({ client, manifest })

  const res = await router.getSwap({
    tokenIn: TOKEN_A,
    tokenOut: TOKEN_B,
    amountIn: AMOUNT_IN,
    trader: TRADER,
    recipient: pairAddress,
  })

  expect(res.status).toBe('no-route')
  if (res.status === 'no-route') {
    expect(res.reason.code).toBe('no-route-verified') // same code as a preflight-revert no-route; `detail` carries the cause
    expect(res.reason.detail).toContain('recipient')
    expect(res.reason.detail.toLowerCase()).toContain(pairAddress.toLowerCase())
  }
  // It failed at compile time, so no simulation was ever spent on it.
  expect(counters.preflights).toBe(0)
  assertResultCoherent(res)
})

test('a provider that 429s only eth_call is inconclusive/rpc-degraded, never a confident no-route', async () => {
  // Same "discovery completes without a single scan" setup as the test above, so the *only* thing
  // standing between this search and an authoritative `no-route` is the transport axis.
  const manifest = baseManifest({ v2Block: BLOCK_NUMBER + 1_000_000n, v4: false })
  const { client, counters } = stubClient({ rateLimitQuotes: true })
  const router = createRouter({ client, manifest })

  const res = await router.getSwap({ tokenIn: TOKEN_A, tokenOut: TOKEN_B, amountIn: AMOUNT_IN, trader: TRADER })

  expect(res.status).toBe('inconclusive')
  expect(res.status).not.toBe('no-route')
  if (res.status === 'inconclusive') {
    expect(res.reason.code).toBe('rpc-degraded') // distinct from the total-outage 'rpc-unavailable'
    expect(res.search.quoting.transportFailed).toBeGreaterThan(0)
    expect(res.search.quoting.succeeded).toBe(0)
    // Nothing reverted: not one of those dropped calls was evidence about the chain.
    expect(res.search.quoting.failed).toBe(0)
    // The giveaway from the original bug report — discovery genuinely IS complete here, and the
    // classification must still refuse to conclude.
    expect(res.search.discovery.v2.status).toBe('complete')
    expect(res.search.aborted).toBe(false)
    expect(res.search.enumeration.exhaustiveWithinMaxHops).toBe(false)
  }
  expect(counters.preflights).toBe(0) // nothing ever quoted, so nothing to verify
  assertResultCoherent(res)

  // The quote-shaped surface tells the same story.
  const quoteRes = await router.getQuote({ tokenIn: TOKEN_A, tokenOut: TOKEN_B, amountIn: AMOUNT_IN })
  expect(quoteRes.status).toBe('inconclusive')
  if (quoteRes.status === 'inconclusive') expect(quoteRes.reason.code).toBe('rpc-degraded')
  assertResultCoherent(quoteRes)
})

test('a node two blocks behind ("header not found" on every quote) is inconclusive/rpc-degraded, never a confident no-route (C4-H1)', async () => {
  // THE C4-H1 REPRO. `eth_getBlockByNumber` is answered by a healthy node; the pinned `eth_call`s
  // are load-balanced onto one that does not have that block's state yet. Not one of those errors
  // mentions a revert, is a 429, or carries a status — so every one of them used to land on the
  // classifier's `execution` default and be tallied as `quoting.failed`: on-chain evidence the
  // search never had, and (with discovery genuinely complete here) a CONFIDENT `no-route` from a
  // search that never touched chain state.
  const manifest = baseManifest({ v2Block: BLOCK_NUMBER + 1_000_000n, v4: false })
  const { client } = stubClient({ nodeStateQuotes: true })
  const router = createRouter({ client, manifest })

  const res = await router.getSwap({ tokenIn: TOKEN_A, tokenOut: TOKEN_B, amountIn: AMOUNT_IN, trader: TRADER })

  expect(res.status).toBe('inconclusive')
  expect(res.status).not.toBe('no-route')
  if (res.status === 'inconclusive') {
    expect(res.reason.code).toBe('rpc-degraded')
    // Counted on the transport axis, not the on-chain one: `NodeStateError extends TransportError`.
    expect(res.search.quoting.transportFailed).toBeGreaterThan(0)
    expect(res.search.quoting.failed).toBe(0) // nothing reverted — nothing executed at all
    expect(res.search.quoting.succeeded).toBe(0)
    expect(res.search.discovery.v2.status).toBe('complete') // the axis that made the old lie convincing
    expect(res.search.aborted).toBe(false)
    expect(res.search.enumeration.exhaustiveWithinMaxHops).toBe(false)
  }
  assertResultCoherent(res)

  const quoteRes = await router.getQuote({ tokenIn: TOKEN_A, tokenOut: TOKEN_B, amountIn: AMOUNT_IN })
  expect(quoteRes.status).toBe('inconclusive')
  if (quoteRes.status === 'inconclusive') expect(quoteRes.reason.code).toBe('rpc-degraded')
  assertResultCoherent(quoteRes)
})

test('a head that goes BACKWARDS between searches is inconclusive/rpc-degraded with headRegressed, and recovers on the next advance (C4-H1)', async () => {
  // The quiet half of the same failure: the lagging node does not error, it just answers about an
  // older chain. Nothing is 429'd, nothing reverts in the transport sense — so without its own axis
  // this search would report a perfectly confident `no-route` computed against state the router had
  // already been past.
  const manifest = baseManifest({ v2Block: BLOCK_NUMBER + 1_000_000n, v4: false })
  let head = BLOCK_NUMBER
  const { client } = stubClient({ blockNumber: () => head })
  const router = createRouter({ client, manifest })
  const req: SwapRequest = { tokenIn: TOKEN_A, tokenOut: TOKEN_B, amountIn: AMOUNT_IN, trader: TRADER }

  // 1. A normal search at N: discovery completes without a scan, nothing prices, verdict is honest.
  const first = await router.getSwap(req)
  expect(first.status).toBe('no-route')
  if (first.status === 'no-route') expect(first.reason.code).toBe('no-viable-route') // C4-P5: nothing was ever priced
  expect(first.search.headRegressed).toBe(false)
  expect(first.search.block.number).toBe(BLOCK_NUMBER)
  assertResultCoherent(first)

  // 2. The load balancer now answers from a replica two blocks behind — and keeps doing so, so the
  //    guard's single refetch does not shake it off.
  head = BLOCK_NUMBER - 2n
  const second = await router.getSwap(req)
  expect(second.status).toBe('inconclusive')
  expect(second.status).not.toBe('no-route')
  if (second.status === 'inconclusive') expect(second.reason.code).toBe('rpc-degraded')
  expect(second.search.headRegressed).toBe(true)
  expect(second.search.block.number).toBe(BLOCK_NUMBER - 2n) // searched where the node actually is
  assertResultCoherent(second)

  // 3. The head advances past the watermark: back to a plain authoritative verdict, with no sticky
  //    degradation left over from the blip.
  head = BLOCK_NUMBER + 1n
  const third = await router.getSwap(req)
  expect(third.status).toBe('no-route')
  expect(third.search.headRegressed).toBe(false)
  expect(third.search.block.number).toBe(BLOCK_NUMBER + 1n)
  assertResultCoherent(third)
})

test('a transient head blip is absorbed by the single refetch: no degradation reported at all', async () => {
  // The guard refetches once precisely so one unlucky request to a lagging replica costs a round
  // trip rather than a caller-visible `inconclusive`.
  const manifest = baseManifest({ v2Block: BLOCK_NUMBER + 1_000_000n, v4: false })
  // Search 1 pins N (watermark N). Search 2's first fetch lands on the lagging replica (N-2); its
  // one refetch lands on a healthy node (N+1), so the search proceeds normally at N+1.
  const heads = [BLOCK_NUMBER, BLOCK_NUMBER - 2n, BLOCK_NUMBER + 1n]
  let served = 0
  const { client } = stubClient({ blockNumber: () => heads[Math.min(served++, heads.length - 1)]! })
  const router = createRouter({ client, manifest })
  const req: SwapRequest = { tokenIn: TOKEN_A, tokenOut: TOKEN_B, amountIn: AMOUNT_IN, trader: TRADER }

  const first = await router.getSwap(req)
  expect(first.search.block.number).toBe(BLOCK_NUMBER)

  const second = await router.getSwap(req)
  expect(second.status).toBe('no-route')
  expect(second.search.headRegressed).toBe(false)
  expect(second.search.block.number).toBe(BLOCK_NUMBER + 1n) // the refetch's answer, not the blip's
  expect(served).toBe(3) // exactly one extra round trip: the guard refetches once, never in a loop
  assertResultCoherent(second)
})

test('two searches at the SAME head are not a regression — the guard fires on strictly-below only', async () => {
  // A quiet chain (or two calls inside one block) is the common case, not a degradation: `<` vs `<=`
  // here is the difference between an honest verdict and permanent `rpc-degraded` on every idle
  // chain, and it costs a second head round trip per search on top.
  const manifest = baseManifest({ v2Block: BLOCK_NUMBER + 1_000_000n, v4: false })
  const { client, counters } = stubClient({ blockNumber: () => BLOCK_NUMBER })
  const router = createRouter({ client, manifest })
  const req: SwapRequest = { tokenIn: TOKEN_A, tokenOut: TOKEN_B, amountIn: AMOUNT_IN, trader: TRADER }

  const first = await router.getSwap(req)
  const second = await router.getSwap(req)

  expect(first.search.headRegressed).toBe(false)
  expect(second.status).toBe('no-route') // still entitled to an authoritative verdict
  expect(second.search.headRegressed).toBe(false)
  expect(counters.blockFetches).toBe(2) // one per search: the equal head never triggered the refetch
  assertResultCoherent(second)
})

test('the watermark never moves BACKWARD on a within-bound lagging head', async () => {
  // The monotone-max property, observed from outside: after a lagging search at N-2, a later search
  // at N-1 is still behind the *watermark* (N) and must still report it. A watermark that tracked the
  // most recent head instead would call N-1 an advance over N-2 and hand back a confident verdict
  // computed two blocks behind where this router has already been.
  const manifest = baseManifest({ v2Block: BLOCK_NUMBER + 1_000_000n, v4: false })
  let head = BLOCK_NUMBER
  const { client } = stubClient({ blockNumber: () => head })
  const router = createRouter({ client, manifest })
  const req: SwapRequest = { tokenIn: TOKEN_A, tokenOut: TOKEN_B, amountIn: AMOUNT_IN, trader: TRADER }

  await router.getSwap(req) // watermark: N

  head = BLOCK_NUMBER - 2n
  const lagging = await router.getSwap(req)
  expect(lagging.search.headRegressed).toBe(true)

  head = BLOCK_NUMBER - 1n // higher than the last pinned block, still below the watermark
  const stillLagging = await router.getSwap(req)
  expect(stillLagging.status).toBe('inconclusive')
  expect(stillLagging.search.headRegressed).toBe(true)
  expect(stillLagging.search.block.number).toBe(BLOCK_NUMBER - 1n)
  assertResultCoherent(stillLagging)
})

test('a bogus high head does not poison the router forever: the watermark self-heals on two agreeing sane answers', async () => {
  // The failure mode a plain monotone maximum has: one glitched answer sits above every real head
  // for the life of the router, so every later search reports `rpc-degraded` (never again an
  // authoritative `no-route`) and pays two head round trips to do it. Two independent answers
  // hundreds of millions of blocks below the record are evidence about the RECORD, not the chain.
  const manifest = baseManifest({ v2Block: BLOCK_NUMBER + 1_000_000n, v4: false })
  let head = 9_999_999_999n // a provider glitch, far outside any plausible reorg or replica lag
  const { client, counters } = stubClient({ blockNumber: () => head })
  const router = createRouter({ client, manifest })
  const req: SwapRequest = { tokenIn: TOKEN_A, tokenOut: TOKEN_B, amountIn: AMOUNT_IN, trader: TRADER }

  await router.getSwap(req) // watermark poisoned: 9_999_999_999

  head = BLOCK_NUMBER
  const healing = await router.getSwap(req)
  expect(healing.status).toBe('no-route') // the fetch and its refetch agree, so nothing regressed
  expect(healing.search.headRegressed).toBe(false)
  expect(healing.search.block.number).toBe(BLOCK_NUMBER)

  const fetchesBefore = counters.blockFetches
  head = BLOCK_NUMBER + 1n
  const after = await router.getSwap(req)
  expect(after.status).toBe('no-route')
  expect(after.search.headRegressed).toBe(false)
  // Healed for good: back to one head round trip per search, not two forever.
  expect(counters.blockFetches - fetchesBefore).toBe(1)
  assertResultCoherent(after)
})

test('a within-bound regression is NOT self-healed away — the ordinary lagging replica still reports', async () => {
  // The other side of the self-heal bound: a two-block lag is exactly what the axis exists for, and
  // must not be explained away as a bad watermark.
  const manifest = baseManifest({ v2Block: BLOCK_NUMBER + 1_000_000n, v4: false })
  let head = BLOCK_NUMBER
  const { client } = stubClient({ blockNumber: () => head })
  const router = createRouter({ client, manifest })
  const req: SwapRequest = { tokenIn: TOKEN_A, tokenOut: TOKEN_B, amountIn: AMOUNT_IN, trader: TRADER }

  await router.getSwap(req)
  head = BLOCK_NUMBER - DEFAULT_REORG_OVERLAP_BLOCKS // well inside the plausible-lag bound
  const lagging = await router.getSwap(req)

  expect(lagging.status).toBe('inconclusive')
  expect(lagging.search.headRegressed).toBe(true)
  // And the watermark stayed put, so the next lagging search reports too.
  const again = await router.getSwap(req)
  expect(again.search.headRegressed).toBe(true)
  assertResultCoherent(lagging)
})

test('a failed head REFETCH degrades the search rather than escalating it to a total outage', async () => {
  // The refetch is a diagnostic. Letting it throw would take a search that already has a perfectly
  // usable pinned block and report `rpc-unavailable` — a strictly worse answer than the degraded one
  // the guard exists to produce.
  const manifest = baseManifest({ v2Block: BLOCK_NUMBER + 1_000_000n, v4: false })
  let fetches = 0
  const { client } = stubClient({
    blockNumber: () => {
      fetches++
      if (fetches === 1) return BLOCK_NUMBER // search 1: establishes the watermark
      if (fetches === 2) return BLOCK_NUMBER - 2n // search 2: behind, so the guard refetches...
      throw new Error('connection reset by peer') // ...and the refetch dies
    },
  })
  const router = createRouter({ client, manifest })
  const req: SwapRequest = { tokenIn: TOKEN_A, tokenOut: TOKEN_B, amountIn: AMOUNT_IN, trader: TRADER }

  await router.getSwap(req)
  const res = await router.getSwap(req)

  expect(res.status).toBe('inconclusive')
  if (res.status === 'inconclusive') expect(res.reason.code).toBe('rpc-degraded') // NOT 'rpc-unavailable'
  expect(res.search.headRegressed).toBe(true)
  expect(res.search.block.number).toBe(BLOCK_NUMBER - 2n) // the first answer, kept and searched at
  assertResultCoherent(res)
})

test('a 429 on the preflight call alone is inconclusive/rpc-degraded — the route stays unverified, never failed and never ready', async () => {
  const manifest = baseManifest({ v2Block: BLOCK_NUMBER + 1_000_000n, v4: false })
  const [probe] = v2Module.speculativeDirect(TOKEN_A, TOKEN_B, AMOUNT_IN, manifest)
  const [token0] = sortAddresses(TOKEN_A, TOKEN_B)
  const zeroForOne = token0.toLowerCase() === TOKEN_A.toLowerCase()

  const { client, counters } = stubClient({
    calls: entryFor(probe!.quote.call, v2Return(10n ** 24n, 10n ** 24n, zeroForOne)),
    // Every verification attempt is rate limited, so the degradation never resolves.
    preflight: Array<'rate-limit'>(8).fill('rate-limit'),
  })
  const router = createRouter({ client, manifest })

  const res = await router.getSwap({ tokenIn: TOKEN_A, tokenOut: TOKEN_B, amountIn: AMOUNT_IN, trader: TRADER })

  expect(res.status).toBe('inconclusive')
  expect(res.status).not.toBe('no-route')
  expect(res.status).not.toBe('ready')
  if (res.status === 'inconclusive') {
    expect(res.reason.code).toBe('rpc-degraded')
    expect(res.search.verificationDegraded).toBe(true)
    // The quote itself succeeded — this is purely a verification-channel failure.
    expect(res.search.quoting.succeeded).toBeGreaterThan(0)
    expect(res.search.quoting.transportFailed).toBe(0)
    expect(res.search.discovery.v2.status).toBe('complete')
    // FW5/P1: the route priced and encoded fine, so it comes back — as `unverified`, which is
    // exactly what a lost simulation leaves behind. The caller can retry it against a healthier
    // endpoint instead of re-running the whole search.
    expect(res.best?.execution).toBe('unverified')
    expect(res.tx?.to).toBe(manifest.execution!.address)
  }
  expect(counters.preflights).toBeGreaterThan(0)
  assertResultCoherent(res)
})

test('a throttled readiness read never becomes a stated requirement: inconclusive/rpc-degraded, never a confident needs-action', async () => {
  // The sibling of the two probes above, one layer over: readiness reads flow through the same
  // `ethCall`, and coercing a throttled `balanceOf` to `0n` used to state `insufficient-balance
  // available: 0n` as fact — then short-circuit preflight, so nothing downstream could notice.
  const manifest = baseManifest({ v2Block: BLOCK_NUMBER + 1_000_000n, v4: false })
  const [probe] = v2Module.speculativeDirect(TOKEN_A, TOKEN_B, AMOUNT_IN, manifest)
  const [token0] = sortAddresses(TOKEN_A, TOKEN_B)
  const zeroForOne = token0.toLowerCase() === TOKEN_A.toLowerCase()

  const { client, counters } = stubClient({
    calls: entryFor(probe!.quote.call, v2Return(10n ** 24n, 10n ** 24n, zeroForOne)),
    rateLimitBalanceRead: true,
    // The trader is genuinely unapproved, so a real requirement is observed alongside the lost read:
    // the list is non-empty but INCOMPLETE, which is exactly what must not be promised.
    readiness: { erc20Allowance: 0n },
  })
  const router = createRouter({ client, manifest })

  const res = await router.getSwap({ tokenIn: TOKEN_A, tokenOut: TOKEN_B, amountIn: AMOUNT_IN, trader: TRADER })

  expect(res.status).toBe('inconclusive')
  expect(res.status).not.toBe('needs-action')
  if (res.status === 'inconclusive') {
    expect(res.reason.code).toBe('rpc-degraded')
    expect(res.search.verificationDegraded).toBe(true)
    expect(res.search.quoting.succeeded).toBeGreaterThan(0) // the route itself priced fine
    // FW5/P1: no `needs-action` errand is promised off a half-read funding state — but the route and
    // its calldata are still handed over, which is strictly more than this path used to return.
    expect(res.best?.quote.amountOut).toBeGreaterThan(0n)
    expect(res.tx?.to).toBe(manifest.execution!.address)
  }
  expect(counters.preflights).toBe(0) // funding state unknown ⇒ no simulation to misread
  assertResultCoherent(res)
})

test('a genuinely unmet requirement (reads all landed) is still needs-action — the fix does not blunt real requirements', async () => {
  const manifest = baseManifest({ v2Block: BLOCK_NUMBER + 1_000_000n, v4: false })
  const [probe] = v2Module.speculativeDirect(TOKEN_A, TOKEN_B, AMOUNT_IN, manifest)
  const [token0] = sortAddresses(TOKEN_A, TOKEN_B)
  const zeroForOne = token0.toLowerCase() === TOKEN_A.toLowerCase()

  const { client } = stubClient({
    calls: entryFor(probe!.quote.call, v2Return(10n ** 24n, 10n ** 24n, zeroForOne)),
    readiness: { balance: 0n }, // a read that LANDED and said zero
  })
  const router = createRouter({ client, manifest })

  const res = await router.getSwap({ tokenIn: TOKEN_A, tokenOut: TOKEN_B, amountIn: AMOUNT_IN, trader: TRADER })

  expect(res.status).toBe('needs-action')
  if (res.status === 'needs-action') {
    expect(res.requirements).toContainEqual({ kind: 'insufficient-balance', token: TOKEN_A, required: AMOUNT_IN, available: 0n })
    expect(res.search.verificationDegraded).toBe(false)
  }
  assertResultCoherent(res)
})

test('a preflight lost to the transport does not write the SEARCH off: the verifier falls through to the next candidate', async () => {
  // The 'unverified' vs 'failed' distinction, observable from outside: a transport loss says nothing
  // about the route, so the candidate is passed over (never demoted to `failed`) and the walk goes
  // on — a runner-up whose simulation gets through still returns `ready`.
  const manifest = baseManifest({ v2Block: BLOCK_NUMBER + 1_000_000n })
  const poolKey: PoolKey = { currency0: TOKEN_A, currency1: TOKEN_B, fee: 2500, tickSpacing: 50, hooks: zeroAddress }
  const v4Leg = { pool: v4Ref(poolKey), currencyIn: TOKEN_A, currencyOut: TOKEN_B }
  const [v2Probe] = v2Module.speculativeDirect(TOKEN_A, TOKEN_B, AMOUNT_IN, manifest)
  const [token0] = sortAddresses(TOKEN_A, TOKEN_B)
  const zeroForOne = token0.toLowerCase() === TOKEN_A.toLowerCase()

  const { client, counters } = stubClient({
    // The v4 pool outprices the v2 one, so its preflight goes first — and is rate limited.
    calls: {
      ...entryFor(v4Module.encodeQuote([v4Leg], AMOUNT_IN, manifest).call, v4Return(10n ** 21n)),
      ...entryFor(v2Probe!.quote.call, v2Return(10n ** 24n, 10n ** 24n, zeroForOne)),
    },
    preflight: ['rate-limit', 'ok'],
  })
  const router = createRouter({ client, manifest })
  await router.ingestPool({ protocol: 'v4', poolKey })

  const res = await router.getSwap({ tokenIn: TOKEN_A, tokenOut: TOKEN_B, amountIn: AMOUNT_IN, trader: TRADER })

  expect(res.status).toBe('ready')
  if (res.status === 'ready') {
    expect(res.execution.verifiedAtBlock.number).toBe(res.search.block.number)
    // The transport-lost leader was never blamed: it sits in `alternatives` as `unverified`.
    const lost = res.alternatives.find((a) => a.execution === 'unverified')
    expect(lost).toBeDefined()
    expect(res.search.verificationDegraded).toBe(true) // a lost call still degrades the report
  }
  expect(counters.preflights).toBe(2)
  assertResultCoherent(res)
})

test('a second identical getQuote call reuses the persisted PoolIndex and issues no further log scans', async () => {
  // No direct pool exists — the only route is the two-hop through MID, and MID becomes an
  // intermediate only when it is a neighbor of BOTH endpoints, which only the adjacency scans can
  // establish (coreIntermediates is empty, so nothing probes MID on its own).
  const manifest = baseManifest({ v2Block: BLOCK_NUMBER - 500n, v4: false })
  const leg1Call = v2Module.speculativeDirect(TOKEN_A, MID, AMOUNT_IN, manifest)[0]!.quote.call
  const leg2Call = v2Module.speculativeDirect(MID, TOKEN_B, AMOUNT_IN, manifest)[0]!.quote.call
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
  const leg1Call = v2Module.speculativeDirect(TOKEN_A, MID, AMOUNT_IN, manifest)[0]!.quote.call
  const leg2Call = v2Module.speculativeDirect(MID, TOKEN_B, AMOUNT_IN, manifest)[0]!.quote.call
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
  const leg1Call = v2Module.speculativeDirect(TOKEN_A, MID, AMOUNT_IN, manifest)[0]!.quote.call
  const leg2Call = v2Module.speculativeDirect(MID, TOKEN_B, AMOUNT_IN, manifest)[0]!.quote.call
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
  const v4Probe = v4Module.speculativeDirect(TOKEN_A, TOKEN_B, AMOUNT_IN, manifest)[0]!
  const v2Probe = v2Module.speculativeDirect(TOKEN_A, TOKEN_B, AMOUNT_IN, manifest)[0]!
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

test('quotes() streams SearchEvents: a lead per improvement, coalesced progress, one final always last', async () => {
  const manifest = baseManifest({ v2Block: BLOCK_NUMBER - 500n, v4: false })
  const [probe] = v2Module.speculativeDirect(TOKEN_A, TOKEN_B, AMOUNT_IN, manifest)
  const [token0] = sortAddresses(TOKEN_A, TOKEN_B)
  const zeroForOne = token0.toLowerCase() === TOKEN_A.toLowerCase()

  const { client } = stubClient({
    calls: entryFor(probe!.quote.call, v2Return(10n ** 24n, 10n ** 24n, zeroForOne)),
    logs: () => [],
  })
  const router = createRouter({ client, manifest })

  const events = []
  for await (const e of router.quotes({ tokenIn: TOKEN_A, tokenOut: TOKEN_B, amountIn: AMOUNT_IN })) events.push(e)

  // A lead arrived (the pool priced), and exactly one final closed the stream, last.
  expect(events.some((e) => e.type === 'lead')).toBe(true)
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
      const leg1Call = v2Module.speculativeDirect(TOKEN_A, MID, AMOUNT_IN, manifest)[0]!.quote.call
      const leg2Call = v2Module.speculativeDirect(MID, TOKEN_B, AMOUNT_IN, manifest)[0]!.quote.call
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
    const leg1Call = v2Module.speculativeDirect(TOKEN_A, MID, AMOUNT_IN, manifest)[0]!.quote.call
    const leg2Call = v2Module.speculativeDirect(MID, TOKEN_B, AMOUNT_IN, manifest)[0]!.quote.call
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
    const [probe] = v2Module.speculativeDirect(TOKEN_A, TOKEN_B, AMOUNT_IN, manifest)
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
    const [probe] = v2Module.speculativeDirect(TOKEN_A, TOKEN_B, AMOUNT_IN, manifest)
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
    const [probe] = v2Module.speculativeDirect(TOKEN_A, TOKEN_B, AMOUNT_IN, manifest)
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
    const [probe] = v2Module.speculativeDirect(TOKEN_A, TOKEN_B, AMOUNT_IN, manifest)
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
    expect(peak).toBeGreaterThan(0) // the stub was actually exercised
    expect(peak).toBeLessThanOrEqual(CONCURRENCY) // the whole point: a real cross-batch bound
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
    const [probe] = v2Module.speculativeDirect(TOKEN_A, TOKEN_B, AMOUNT_IN, manifest)
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
    const [probe] = v2Module.speculativeDirect(TOKEN_A, TOKEN_B, AMOUNT_IN, manifest)
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
    const [probe] = v2Module.speculativeDirect(TOKEN_A, TOKEN_B, AMOUNT_IN, m)
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
    const [probe] = v2Module.speculativeDirect(TOKEN_A, TOKEN_B, AMOUNT_IN, m)
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
