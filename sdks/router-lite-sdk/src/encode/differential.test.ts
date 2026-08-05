import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { MixedRouteSDK, Trade as RouterTrade } from '@uniswap/router-sdk'
import type { Currency } from '@uniswap/sdk-core'
import { CurrencyAmount, Ether, Percent, Token, TradeType } from '@uniswap/sdk-core'
import { SwapRouter, UniversalRouterVersion } from '@uniswap/universal-router-sdk'
import { Pair, Route as V2Route } from '@uniswap/v2-sdk'
import { FeeAmount, Pool as V3Pool, Route as V3Route, encodeSqrtRatioX96 } from '@uniswap/v3-sdk'
import { Pool as V4Pool, Route as V4Route } from '@uniswap/v4-sdk'
import { expect, test } from 'bun:test'
import type { Address, Hex } from 'viem'
import { zeroAddress } from 'viem'

import { UR_ADDRESS_THIS } from '../constants'
import { v2Ref, v3Ref, v4Ref } from '../internal/testing'
import { compileExecutionPlan } from '../plan/compile'
import type { ProtocolModule } from '../protocols/types'
import { v2Module } from '../protocols/v2'
import { v3Module } from '../protocols/v3'
import { v4Module } from '../protocols/v4'
import type {
  CurrencyRef,
  ExecutionPlan,
  Permit2PermitSingle,
  PoolRef,
  Protocol,
  RouteLeg,
  UniversalRouterDeployment,
} from '../types'

import { encodeExecutionPlan } from './ur20'

// ---------------------------------------------------------------------------
// Differential oracle: every supported route shape is built twice — once as a
// QuotedRoute -> ExecutionPlan -> our `ur-2.0` encoder, and once as a
// router-sdk Trade -> universal-router-sdk `SwapRouter.swapCallParameters` —
// and the two calldatas are compared byte for byte.
//
// Option pinning (each of these is a place where the two APIs do not map 1:1;
// the choice is made so the *semantics* line up, never to paper over a
// difference):
//
//  * slippage. We floor: minOut = amountOut * (10000 - bps) / 10000. Every
//    Uniswap Trade entity in this path (v2/v3/v4/router-sdk/mixed) floors
//    (1 - tolerance) * amountOut, so `Percent(bps, 10000)` is the exact same
//    rational and both sides floor the identical number. (Note this is *not*
//    sdk-core's `1 / (1 + tolerance)` convention used elsewhere.)
//  * `deadlineOrPreviousBlockhash` is always set, because SwapRouter drops to
//    the two-argument `execute(bytes,bytes[])` overload when it is absent and
//    we always emit the three-argument one.
//  * `urVersion: V2_0` — the command set we encode. V2_1_1+ appends
//    `minHopPriceX36` to every v2/v3/v4 swap payload.
//  * `safeMode`, `fee`, `flatFee`, `useRouterBalance`, `nativeErc20Input`,
//    `tokenTransferMode` are all left at their defaults: each adds commands
//    (an ETH sweep, PAY_PORTION, TRANSFER, a proxy wrapper) that have no
//    counterpart in an ExecutionPlan.
//  * exact-input only, one route, no split: an ExecutionPlan is a single
//    ordered custody chain. With >2 routes the SDK switches to an aggregated
//    slippage check, and with EXACT_OUTPUT it appends refund sweeps.
//  * price impact is kept small (pools are 1:1 with deep reserves and each hop
//    loses ~1%), because above 50% the SDK appends a partial-fill refund sweep.
//
// Two shapes are *not* byte-identical, by deliberate choice. Both are handled
// with a single documented substitution and are otherwise compared byte for
// byte, so the divergence is exactly one field and cannot grow silently:
//
//  A. `*->v2` hand-off. The SDK points the preceding section straight at the
//     v2 pair address it computed from the trade's own Pair entity. We send to
//     ADDRESS_THIS, because our pair address can originate in a caller-supplied
//     pool hint: a wrong hint would strand the funds at the hinted address,
//     whereas ADDRESS_THIS makes the router derive the pair itself.
//  B. trailing `wrap-native` (v4 produced native, the trade delivers wrapped
//     native). WRAP_ETH has no minimum, and the SDK zeroes the v4 swap's
//     `amountOutMinimum` because the router custodies — so its encoding carries
//     no slippage check at all. We keep the floor on the v4 swap.
// ---------------------------------------------------------------------------

const modules: Record<Protocol, ProtocolModule> = { v2: v2Module, v3: v3Module, v4: v4Module }

const CHAIN_ID = 1
const ETHER = Ether.onChain(CHAIN_ID)
const WETH = new Token(CHAIN_ID, '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', 18, 'WETH')
const DAI = new Token(CHAIN_ID, '0x6B175474E89094C44Da98b954EedeAC495271d0F', 18, 'DAI')
const UNI = new Token(CHAIN_ID, '0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984', 18, 'UNI')
const COMP = new Token(CHAIN_ID, '0xc00e94Cb662C3520282E6f5717214004A7f26888', 18, 'COMP')

const TRADER = '0x2222222222222222222222222222222222222222' as Address
const RECIPIENT = '0x3333333333333333333333333333333333333333' as Address
const UR = '0x66a9893cC07D91D95644AEDD05D03f95e1dBA8Af' as Address
const PERMIT2 = '0x000000000022D473030F116dDEE9F6B43aC78BA3' as Address

const deployment: UniversalRouterDeployment = {
  address: UR,
  commandSet: 'ur-2.0',
  permit2: PERMIT2,
  wrappedNative: WETH.address as Address,
}

const DEADLINE = 1_700_000_000n
const SLIPPAGE_BPS = 100
/** See "slippage" above: this Percent reproduces our floor formula exactly. */
const SDK_SLIPPAGE = new Percent(SLIPPAGE_BPS, 10_000)

const AMOUNT_IN = 10n ** 18n
const RESERVE = 10n ** 24n
const LIQUIDITY = (10n ** 24n).toString()
const SQRT_RATIO_1_1 = encodeSqrtRatioX96(1, 1)

const PERMIT_SIGNATURE = `0x${'11'.repeat(32)}${'22'.repeat(32)}1b` as Hex

// ---------------------------------------------------------------------------
// Pools: one cache shared by both sides, so the two encodings can never be
// compared across different pool state.
// ---------------------------------------------------------------------------

/** A currency as the fixtures speak it: the literal native currency, or a concrete token. */
type Cur = 'native' | Token

type BuiltPool = { sdk: Pair | V3Pool | V4Pool; ref: PoolRef }

const pools = new Map<string, BuiltPool>()

function wrapped(currency: Cur): Token {
  return currency === 'native' ? WETH : currency
}

function ourRef(currency: Cur): CurrencyRef {
  return currency === 'native' ? 'native' : (currency.address as Address)
}

function sdkCurrency(currency: Cur): Currency {
  return currency === 'native' ? ETHER : currency
}

function poolKeyOf(protocol: Protocol, a: Cur, b: Cur): string {
  const [x, y] = [wrapped(a).address.toLowerCase(), wrapped(b).address.toLowerCase()].sort()
  return `${protocol}:${x}:${y}:${a === 'native' || b === 'native' ? 'native' : 'wrapped'}`
}

function buildPool(protocol: Protocol, a: Cur, b: Cur): BuiltPool {
  if (protocol === 'v2') {
    const [t0, t1] = wrapped(a).sortsBefore(wrapped(b)) ? [wrapped(a), wrapped(b)] : [wrapped(b), wrapped(a)]
    const pair = new Pair(
      CurrencyAmount.fromRawAmount(t0, RESERVE.toString()),
      CurrencyAmount.fromRawAmount(t1, RESERVE.toString()),
    )
    return { sdk: pair, ref: v2Ref(pair.liquidityToken.address as Address, t0.address as Address, t1.address as Address) }
  }
  if (protocol === 'v3') {
    const pool = new V3Pool(wrapped(a), wrapped(b), FeeAmount.MEDIUM, SQRT_RATIO_1_1, LIQUIDITY, 0)
    return {
      sdk: pool,
      ref: v3Ref(
        V3Pool.getAddress(pool.token0, pool.token1, pool.fee) as Address,
        pool.token0.address as Address,
        pool.token1.address as Address,
        pool.fee,
      ),
    }
  }
  const pool = new V4Pool(sdkCurrency(a), sdkCurrency(b), 3000, 60, zeroAddress, SQRT_RATIO_1_1, LIQUIDITY, 0)
  const key = {
    currency0: (pool.currency0.isNative ? zeroAddress : pool.currency0.address) as Address,
    currency1: (pool.currency1.isNative ? zeroAddress : pool.currency1.address) as Address,
    fee: pool.fee,
    tickSpacing: pool.tickSpacing,
    hooks: zeroAddress as Address,
  }
  return { sdk: pool, ref: v4Ref(key) }
}

function getPool(protocol: Protocol, a: Cur, b: Cur): BuiltPool {
  const key = poolKeyOf(protocol, a, b)
  const cached = pools.get(key)
  if (cached) return cached
  const built = buildPool(protocol, a, b)
  pools.set(key, built)
  return built
}

// ---------------------------------------------------------------------------
// Shape specification
// ---------------------------------------------------------------------------

/** How an endpoint of the trade is denominated. `weth` is only interesting against a native v4 pool. */
type Endpoint = 'erc20' | 'native' | 'weth'

type Shape = {
  protocols: Protocol[]
  tokenIn: Endpoint
  tokenOut: Endpoint
  /** The currency the two legs hand off in. `native` forces a wrap/unwrap between the groups. */
  intermediate?: 'erc20' | 'native'
  permit?: boolean
}

/** The route currency at position `i` of the path, before any per-protocol form normalization. */
function positionCurrency(shape: Shape, index: number): Endpoint | 'intermediate' {
  if (index === 0) return shape.tokenIn
  if (index === shape.protocols.length) return shape.tokenOut
  return shape.intermediate === 'native' ? 'native' : 'intermediate'
}

/**
 * The concrete currency a pool actually holds at a path position. This is the compiler's "currency
 * form" rule stated from the fixture side: v4 holds native directly, v2/v3 can only hold wrapped
 * native. A `weth` endpoint against a v4 leg is the case that forces a leading unwrap or a trailing
 * wrap, which is exactly why it exists.
 */
function formAt(shape: Shape, index: number, protocol: Protocol): Cur {
  const position = positionCurrency(shape, index)
  if (position === 'native' || position === 'weth') return protocol === 'v4' ? 'native' : WETH
  if (position === 'intermediate') return COMP
  return index === 0 ? DAI : UNI
}

function endpointCurrency(endpoint: Endpoint, isInput: boolean): Cur {
  if (endpoint === 'native') return 'native'
  if (endpoint === 'weth') return WETH
  return isInput ? DAI : UNI
}

function shapeName(shape: Shape): string {
  const path = shape.protocols.join('→')
  const middle = shape.intermediate === 'native' ? ' via-native' : ''
  return `${path} ${shape.tokenIn}-in ${shape.tokenOut}-out${middle}${shape.permit ? ' +permit' : ''}`
}

type BuiltCase = {
  name: string
  legs: RouteLeg[]
  sdkPools: (Pair | V3Pool | V4Pool)[]
  tokenIn: CurrencyRef
  tokenOut: CurrencyRef
  inCurrency: Currency
  outCurrency: Currency
  amountIn: bigint
  amountOut: bigint
  permit?: Permit2PermitSingle | undefined
  /** The v2 pair a preceding section is pointed at by universal-router-sdk, when that applies. */
  directPairAddress?: Address | undefined
  /** True when the plan ends in a wrap, where we keep a slippage floor the SDK drops. */
  trailingWrap: boolean
}

function buildCase(shape: Shape): BuiltCase {
  const legs: RouteLeg[] = []
  const sdkPools: (Pair | V3Pool | V4Pool)[] = []

  shape.protocols.forEach((protocol, i) => {
    const currencyIn = formAt(shape, i, protocol)
    const currencyOut = formAt(shape, i + 1, protocol)
    const pool = getPool(protocol, currencyIn, currencyOut)
    sdkPools.push(pool.sdk)
    legs.push({ pool: pool.ref, currencyIn: ourRef(currencyIn), currencyOut: ourRef(currencyOut) })
  })

  // v2 is the one protocol universal-router-sdk re-derives amounts for (it rebuilds a V2Trade from
  // the pair reserves), so a pure-v2 route's amountOut has to be the reserves' answer, not a made-up
  // one. Every other protocol is encoded from the amounts we hand it.
  let amountOut: bigint
  if (shape.protocols.every((protocol) => protocol === 'v2')) {
    let amount = CurrencyAmount.fromRawAmount(wrapped(formAt(shape, 0, 'v2')), AMOUNT_IN.toString())
    for (const pool of sdkPools) [amount] = (pool as Pair).getOutputAmount(amount)
    amountOut = BigInt(amount.quotient.toString())
  } else {
    amountOut = shape.protocols.reduce((amount) => (amount * 99n) / 100n, AMOUNT_IN)
  }

  // A permit always names the token the plan actually pulls, which for a `weth` input is WETH.
  const pulledToken = wrapped(endpointCurrency(shape.tokenIn, true))
  const permit: Permit2PermitSingle | undefined = shape.permit
    ? {
        details: { token: pulledToken.address as Address, amount: AMOUNT_IN, expiration: 2_000_000_000, nonce: 7 },
        spender: UR,
        sigDeadline: 1_900_000_000n,
        signature: PERMIT_SIGNATURE,
      }
    : undefined

  // universal-router-sdk points a section straight at the next v2 pair whenever the hand-off needs
  // no wrap/unwrap; with a native hand-off a transition intervenes and it uses the router instead.
  const directIndex = shape.protocols.findIndex(
    (protocol, i) => i > 0 && protocol === 'v2' && shape.protocols[i - 1] !== 'v2',
  )
  const directPairAddress =
    directIndex > 0 && shape.intermediate !== 'native'
      ? ((legs[directIndex]!.pool as Extract<PoolRef, { protocol: 'v2' }>).address as Address)
      : undefined

  const lastProtocol = shape.protocols[shape.protocols.length - 1]!
  const trailingWrap = shape.tokenOut === 'weth' && lastProtocol === 'v4'

  return {
    name: shapeName(shape),
    legs,
    sdkPools,
    tokenIn: shape.tokenIn === 'native' ? 'native' : (endpointCurrency(shape.tokenIn, true) as Token).address as Address,
    tokenOut:
      shape.tokenOut === 'native' ? 'native' : ((endpointCurrency(shape.tokenOut, false) as Token).address as Address),
    inCurrency: sdkCurrency(endpointCurrency(shape.tokenIn, true)),
    outCurrency: sdkCurrency(endpointCurrency(shape.tokenOut, false)),
    amountIn: AMOUNT_IN,
    amountOut,
    permit,
    directPairAddress,
    trailingWrap,
  }
}

// ---------------------------------------------------------------------------
// The two encoders
// ---------------------------------------------------------------------------

function encodeOurs(built: BuiltCase): { plan: ExecutionPlan; data: Hex; value: bigint } {
  const plan = compileExecutionPlan({
    quoted: {
      route: { legs: built.legs },
      quote: { amountIn: built.amountIn, amountOut: built.amountOut, intermediateAmounts: [] },
    },
    tokenIn: built.tokenIn,
    tokenOut: built.tokenOut,
    trader: TRADER,
    recipient: RECIPIENT,
    slippageBps: SLIPPAGE_BPS,
    ...(built.permit ? { permit: built.permit } : {}),
    wrappedNative: WETH.address as Address,
    modules,
  })
  const tx = encodeExecutionPlan(plan, deployment, DEADLINE)
  return { plan, data: tx.data, value: tx.value }
}

function encodeTheirs(built: BuiltCase): { data: Hex; value: bigint } {
  const inputAmount = CurrencyAmount.fromRawAmount(built.inCurrency, built.amountIn.toString())
  const outputAmount = CurrencyAmount.fromRawAmount(built.outCurrency, built.amountOut.toString())
  const protocols = new Set(built.sdkPools.map((pool) => (pool instanceof Pair ? 'v2' : pool instanceof V3Pool ? 'v3' : 'v4')))

  let trade: RouterTrade<Currency, Currency, TradeType.EXACT_INPUT>
  if (protocols.size > 1) {
    trade = new RouterTrade({
      mixedRoutes: [
        {
          mixedRoute: new MixedRouteSDK(built.sdkPools, built.inCurrency, built.outCurrency),
          inputAmount,
          outputAmount,
        },
      ],
      tradeType: TradeType.EXACT_INPUT,
    })
  } else if (protocols.has('v2')) {
    trade = new RouterTrade({
      v2Routes: [
        { routev2: new V2Route(built.sdkPools as Pair[], built.inCurrency, built.outCurrency), inputAmount, outputAmount },
      ],
      tradeType: TradeType.EXACT_INPUT,
    })
  } else if (protocols.has('v3')) {
    trade = new RouterTrade({
      v3Routes: [
        {
          routev3: new V3Route(built.sdkPools as V3Pool[], built.inCurrency, built.outCurrency),
          inputAmount,
          outputAmount,
        },
      ],
      tradeType: TradeType.EXACT_INPUT,
    })
  } else {
    trade = new RouterTrade({
      v4Routes: [
        {
          routev4: new V4Route(built.sdkPools as V4Pool[], built.inCurrency, built.outCurrency),
          inputAmount,
          outputAmount,
        },
      ],
      tradeType: TradeType.EXACT_INPUT,
    })
  }

  const params = SwapRouter.swapCallParameters(trade, {
    slippageTolerance: SDK_SLIPPAGE,
    recipient: RECIPIENT,
    deadlineOrPreviousBlockhash: DEADLINE.toString(),
    urVersion: UniversalRouterVersion.V2_0,
    ...(built.permit
      ? {
          inputTokenPermit: {
            details: {
              token: built.permit.details.token,
              amount: built.permit.details.amount.toString(),
              expiration: built.permit.details.expiration,
              nonce: built.permit.details.nonce,
            },
            spender: built.permit.spender,
            sigDeadline: built.permit.sigDeadline.toString(),
            signature: built.permit.signature,
          },
        }
      : {}),
  })
  return { data: params.calldata as Hex, value: BigInt(params.value) }
}

/** Replaces the single occurrence of `find` in `calldata`, failing loudly if it is not unique. */
function substituteOnce(calldata: string, find: string, replace: string, what: string): string {
  const occurrences = calldata.split(find).length - 1
  expect(occurrences, `expected exactly one ${what} in the calldata`).toBe(1)
  return calldata.replace(find, replace)
}

const word = (value: bigint): string => value.toString(16).padStart(64, '0')
const addressWord = (address: string): string => address.toLowerCase().slice(2)

/**
 * Compares our calldata with universal-router-sdk's, normalizing away exactly the divergences
 * documented at the top of this file — and only those, each of which must be present exactly once.
 */
function assertMatches(built: BuiltCase, ours: { data: Hex; value: bigint }, theirs: { data: Hex; value: bigint }): void {
  let mine = ours.data.toLowerCase()
  let sdk = theirs.data.toLowerCase()

  // A substitution that is no longer needed is a divergence that quietly went away: the comment
  // explaining it would now be wrong, so fail rather than normalize a difference that is not there.
  if (built.directPairAddress || built.trailingWrap)
    expect(mine, `${built.name}: expected a documented divergence, found none`).not.toBe(sdk)

  if (built.directPairAddress) {
    // Divergence A: they hand off straight to the pair, we hand off to the router.
    sdk = substituteOnce(sdk, addressWord(built.directPairAddress), addressWord(UR_ADDRESS_THIS), 'v2 pair recipient')
  }
  if (built.trailingWrap) {
    // Divergence B: we keep the slippage floor on the v4 swap, they zero it.
    const minOut = (built.amountOut * BigInt(10_000 - SLIPPAGE_BPS)) / 10_000n
    mine = substituteOnce(mine, word(minOut), word(0n), 'v4 amountOutMinimum floor')
  }

  expect(mine, built.name).toBe(sdk)
  expect(ours.value, built.name).toBe(theirs.value)
}

// ---------------------------------------------------------------------------
// The matrix
// ---------------------------------------------------------------------------

const PROTOCOL_SHAPES: Protocol[][] = [
  ['v2'],
  ['v3'],
  ['v4'],
  ['v2', 'v2'],
  ['v3', 'v3'],
  ['v4', 'v4'],
  ['v2', 'v3'],
  ['v3', 'v2'],
  ['v2', 'v4'],
  ['v4', 'v2'],
  ['v3', 'v4'],
  ['v4', 'v3'],
]

const ENDPOINT_COMBINATIONS: { tokenIn: Endpoint; tokenOut: Endpoint; permit?: boolean }[] = [
  { tokenIn: 'erc20', tokenOut: 'erc20' },
  { tokenIn: 'erc20', tokenOut: 'erc20', permit: true },
  { tokenIn: 'erc20', tokenOut: 'native' },
  { tokenIn: 'erc20', tokenOut: 'native', permit: true },
  { tokenIn: 'native', tokenOut: 'erc20' },
  // { tokenIn: 'native', tokenOut: 'native' } — skipped: same currency family, the compiler rejects it.
  // { tokenIn: 'native', ..., permit: true } — skipped: a permit cannot be attached to a value send.
]

const SHAPES: Shape[] = [
  ...PROTOCOL_SHAPES.flatMap((protocols) =>
    ENDPOINT_COMBINATIONS.map((endpoints) => ({ protocols, ...endpoints }) as Shape),
  ),
  // Native hand-off between two groups: the wrap/unwrap that lives *between* operations.
  { protocols: ['v4', 'v3'], tokenIn: 'erc20', tokenOut: 'erc20', intermediate: 'native' },
  { protocols: ['v3', 'v4'], tokenIn: 'erc20', tokenOut: 'erc20', intermediate: 'native' },
  { protocols: ['v4', 'v2'], tokenIn: 'erc20', tokenOut: 'erc20', intermediate: 'native' },
  { protocols: ['v2', 'v4'], tokenIn: 'erc20', tokenOut: 'erc20', intermediate: 'native' },
  // Wrapped-native endpoints against a native v4 pool: the leading unwrap and the trailing wrap.
  { protocols: ['v4'], tokenIn: 'weth', tokenOut: 'erc20' },
  { protocols: ['v4'], tokenIn: 'weth', tokenOut: 'erc20', permit: true },
  { protocols: ['v4', 'v3'], tokenIn: 'weth', tokenOut: 'erc20' },
  { protocols: ['v4'], tokenIn: 'erc20', tokenOut: 'weth' },
  { protocols: ['v4', 'v4'], tokenIn: 'erc20', tokenOut: 'weth' },
  // A trailing wrap reached through a mixed route, and a leading unwrap in front of one.
  { protocols: ['v3', 'v4'], tokenIn: 'erc20', tokenOut: 'weth' },
  { protocols: ['v2', 'v4'], tokenIn: 'erc20', tokenOut: 'weth' },
  { protocols: ['v4', 'v2'], tokenIn: 'weth', tokenOut: 'erc20' },
  // A permit in front of a plan that also carries an intermediate conversion.
  { protocols: ['v4', 'v3'], tokenIn: 'erc20', tokenOut: 'erc20', intermediate: 'native', permit: true },
]

// ---------------------------------------------------------------------------
// Goldens
//
// The differential comparison is only as good as the fixtures feeding it: a
// silent change to a pool, an amount or the option pinning above would move
// *both* sides together and still be "byte-identical". `goldens.json` freezes
// every shape's plan and its calldata, so any such drift shows up as a diff in
// a reviewable file rather than as a green test.
//
// Regenerate deliberately, never reflexively — a golden that changed is a
// change in what users would broadcast:
//
//     UPDATE_GOLDENS=1 bun test src/encode/differential.test.ts
// ---------------------------------------------------------------------------

const GOLDENS_PATH = fileURLToPath(new URL('./goldens.json', import.meta.url))
const UPDATE_GOLDENS = process.env['UPDATE_GOLDENS'] === '1'

type Golden = { plan: unknown; calldata: string; value: string }

/** Tags bigints so an ExecutionPlan survives a JSON round trip unambiguously. */
function withTaggedBigints(value: unknown): string {
  return JSON.stringify(value, (_key, raw) => (typeof raw === 'bigint' ? { $bigint: raw.toString() } : raw), 2)
}

const storedGoldens: Record<string, Golden> = existsSync(GOLDENS_PATH)
  ? JSON.parse(readFileSync(GOLDENS_PATH, 'utf8'))
  : {}
const producedGoldens: Record<string, Golden> = {}

for (const shape of SHAPES) {
  const name = shapeName(shape)
  test(`byte-identical with universal-router-sdk: ${name}`, () => {
    const built = buildCase(shape)
    const ours = encodeOurs(built)
    assertMatches(built, ours, encodeTheirs(built))
    producedGoldens[name] = {
      plan: JSON.parse(withTaggedBigints(ours.plan)),
      calldata: ours.data,
      value: ours.value.toString(),
    }
  })
}

/** Lowercases each golden's `calldata` so the comparison below is over BYTES, not their spelling —
 * the same normalization {@link assertMatches} applies to the universal-router-sdk side. See the
 * long note on the golden replay in `ur20.test.ts` for why the stored file carries mixed casing in
 * its v3 path bytes and is deliberately not regenerated over it. */
function normalizeCalldata(goldens: Record<string, Golden>): Record<string, Golden> {
  return Object.fromEntries(Object.entries(goldens).map(([k, g]) => [k, { ...g, calldata: g.calldata.toLowerCase() }]))
}

test('goldens.json covers every shape and matches the current encoding', () => {
  if (UPDATE_GOLDENS) {
    writeFileSync(GOLDENS_PATH, `${JSON.stringify(producedGoldens, null, 2)}\n`)
    return
  }
  expect(Object.keys(producedGoldens).sort()).toEqual(Object.keys(storedGoldens).sort())
  expect(normalizeCalldata(producedGoldens)).toEqual(normalizeCalldata(storedGoldens))
})
