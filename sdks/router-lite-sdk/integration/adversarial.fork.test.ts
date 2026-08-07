import {
  createRouter,
  MAINNET_MANIFEST,
  type CurrencyRef,
  type PoolKey,
  type ReadySwap,
  type RouteLeg,
  type Router,
} from '@uniswap/router-lite-sdk'
import { afterAll, beforeAll, describe, expect, it } from 'bun:test'
import {
  BaseError,
  ContractFunctionRevertedError,
  decodeErrorResult,
  getAddress,
  parseEther,
  type Address,
  type Hex,
} from 'viem'

import { ERC20_ABI, V4_QUOTER_ABI } from './abis'
import { FORK_BLOCK, forkTestsEnabled, startAnvilFork, type AnvilClient } from './anvil'
// Internal seams, imported by relative path — the same escape hatch `e2e.ts` uses for
// `assertResultCoherent`. Section 6 needs the raw dispatch primitives to compare the two envelopes
// (direct eth_call vs aggregate3) on EXACTLY the call the SDK builds, below the search's dedup.
import { aggregateCalls, InnerCallFailure, MULTICALL3_ADDRESS } from '../src/internal/multicall'
import { ethCall } from '../src/internal/rpc'
import { revertDataOf } from '../src/internal/rpcErrors'
import { v4Module } from '../src/protocols/v4'
import {
  balanceOf,
  executeSwap,
  forkManifest,
  minAmountOut,
  noRouteSwap,
  quoted,
  readySwap,
  routeProtocols,
} from './e2e'
import { createWorld, type World } from './worldBuilder'

// ---------------------------------------------------------------------------
// Adversarial worlds — the SDK must never overstate what it verified.
//
// Every other fork suite builds a world where the honest answer is "yes". This
// one builds worlds where the honest answer is "no", or "yes, but less than the
// arithmetic suggests", and asserts the SDK says exactly that. The four
// adversaries, in the order their deceptions get harder to notice:
//
//   skimming hook       the pool takes 30bps of the output after the swap. The
//                       V4Quoter runs the hook, so the quote is ALREADY
//                       post-skim — the deception is one the quoter defeats,
//                       and the test's job is to prove it (against a hookless
//                       twin pool) rather than assume it.
//   caller-sensitive    a hook that lets the QUOTER through and reverts on the
//   hook                ROUTER. Quoting says yes, execution says no. Only the
//                       preflight can tell the difference, and it has to fall
//                       through to a worse-but-real pool rather than ship the
//                       better-looking one.
//   fee-on-transfer     v2's reserve math is exactly right about a token that
//                       taxes its own transfers, and exactly wrong about what
//                       the trader receives. At 300bps the shortfall breaks the
//                       100bps slippage floor and the trade must die; at 50bps
//                       it does not, and `ready` is honest as long as what
//                       lands still clears the floor.
//   dust liquidity      a pool that quotes perfectly at one size and reverts
//                       `NotEnoughLiquidity` at another. A dropped candidate,
//                       counted in the report — never a crash.
//
// The single invariant underneath all of them: WHENEVER THE RESULT IS `ready`,
// THE BROADCAST TRANSACTION DELIVERS AT LEAST `minAmountOut`. That is what
// `executeWithFloor` checks, and every `ready` in this file goes through it.
// ---------------------------------------------------------------------------

const RUN = forkTestsEnabled()

/** Same shape for every hooked/plain twin: only the hook is allowed to differ. */
const V4_SHAPE = { fee: 500, tickSpacing: 10, liquidity: 10n ** 22n, priceApprox: 1 } as const

const ONE = 10n ** 18n
const BPS = 10_000n
const SKIM_BPS = 30n

/** Dust pool: a full-range position of 1e10 wei-liquidity, i.e. ~1e-8 tokens a side. */
const DUST_LIQUIDITY = 10n ** 10n
/** 1% of the dust pool's depth — small enough to quote and execute normally. */
const DUST_SMALL_IN = 10n ** 8n
/**
 * 1e20x the dust pool's liquidity. Draining a FULL-RANGE v4 position takes ~2^64 * L of input (the
 * price has to walk all the way to `MIN_SQRT_PRICE`), so "100x" would still fill comfortably — this
 * is the measured size at which the V4Quoter actually raises `NotEnoughLiquidity`, and the test
 * proves that with a direct quoter call before asking the SDK anything.
 */
const DUST_HUGE_IN = DUST_LIQUIDITY * 10n ** 20n

const SKIM_TRADER: Address = '0x00000000000000000000000000000000000adf01'
const GATE_TRADER: Address = '0x00000000000000000000000000000000000adf02'
const SOLO_TRADER: Address = '0x00000000000000000000000000000000000adf03'
const FOT_HIGH_TRADER: Address = '0x00000000000000000000000000000000000adf04'
const FOT_LOW_TRADER: Address = '0x00000000000000000000000000000000000adf05'
const DUST_TRADER: Address = '0x00000000000000000000000000000000000adf06'
const DUST_HUGE_TRADER: Address = '0x00000000000000000000000000000000000adf07'
const FALLTHROUGH_TRADER: Address = '0x00000000000000000000000000000000000adf08'

describe.skipIf(!RUN)('adversarial worlds (fork)', () => {
  let anvil: AnvilClient
  let world: World
  let router: Router

  beforeAll(async () => {
    anvil = await startAnvilFork({ port: 8650 })
    world = createWorld(anvil)
    router = createRouter({ client: anvil.publicClient, manifest: forkManifest() })
  }, 300_000)

  afterAll(async () => {
    await anvil?.stop()
  })

  /**
   * Broadcasts a `ready` result's transaction and asserts the one promise `ready` makes: the trade
   * lands, and it delivers at least the floor the SDK wrote into the calldata. Returns what was
   * actually received so the caller can go on to assert something sharper.
   */
  async function executeWithFloor(
    ready: ReadySwap,
    trader: Address,
    currencyOut: CurrencyRef,
  ): Promise<bigint> {
    const { receipt, delta } = await executeSwap(anvil, { trader, tx: ready.tx, currencyOut })
    expect(receipt.status).toBe('success')
    expect(delta).toBeGreaterThanOrEqual(minAmountOut(ready.best.quote.amountOut))
    return delta
  }

  /** Ground-truth V4Quoter call, straight at the deployed quoter — never through the SDK. */
  async function quoteDirect(poolKey: PoolKey, zeroForOne: boolean, exactAmount: bigint): Promise<bigint> {
    const { result } = await anvil.publicClient.simulateContract({
      address: world.addresses.v4Quoter,
      abi: V4_QUOTER_ABI,
      functionName: 'quoteExactInputSingle',
      args: [{ poolKey, zeroForOne, exactAmount, hookData: '0x' }],
      account: world.deployer,
    })
    return (result as readonly [bigint, bigint])[0]
  }

  /**
   * The name of the custom error a V4Quoter call reverted with.
   *
   * Unwrapping is needed because the quoter returns its answer BY REVERTING (`QuoteSwap`), so a
   * genuine failure comes back one layer down, re-thrown inside `UnexpectedRevertBytes`. Falls back
   * to the raw selector rather than throwing, so a surprise failure names itself in the assertion
   * diff instead of blowing up the helper.
   */
  async function quoterRevertName(poolKey: PoolKey, zeroForOne: boolean, exactAmount: bigint): Promise<string> {
    try {
      const amountOut = await quoteDirect(poolKey, zeroForOne, exactAmount)
      return `no revert (quoted ${amountOut})`
    } catch (err) {
      const walked =
        err instanceof BaseError ? err.walk((e) => e instanceof ContractFunctionRevertedError) : null
      const reverted = walked as ContractFunctionRevertedError | null
      const outer = reverted?.data
      if (!outer) return `undecodable revert (${reverted?.signature ?? String(err)})`
      if (outer.errorName !== 'UnexpectedRevertBytes') return outer.errorName
      const inner = (outer.args as readonly Hex[] | undefined)?.[0]
      if (!inner) return outer.errorName
      try {
        return decodeErrorResult({ abi: V4_QUOTER_ABI, data: inner }).errorName
      } catch {
        return `unknown inner revert (${inner.slice(0, 10)})`
      }
    }
  }

  // -------------------------------------------------------------------------
  // 1. Quoter/execution divergence — the skimming hook
  // -------------------------------------------------------------------------

  it('a skimming hook: the quote is already post-skim, and what executes is that quote to the wei', async () => {
    // Two pools, identical in every respect a swap can see — same fee, same tick spacing, same
    // full-range liquidity, same price — on two disjoint pairs, so neither can be routed through
    // the other. The ONLY difference is the afterSwap hook on one of them, which makes the plain
    // pool's quote the exact pre-skim baseline for the hooked pool's.
    const hook = await world.deployHook('skim-fee-bps-30')
    const skimIn = await world.deployToken('SkimIn')
    const skimOut = await world.deployToken('SkimOut')
    const plainIn = await world.deployToken('PlainIn')
    const plainOut = await world.deployToken('PlainOut')
    await world.createV4Pool(skimIn, skimOut, { ...V4_SHAPE, hooks: hook })
    await world.createV4Pool(plainIn, plainOut, V4_SHAPE)

    await world.fundTrader(SKIM_TRADER, { eth: parseEther('10'), tokens: [[skimIn, ONE]] })
    await world.approvePermit2(SKIM_TRADER, skimIn, { toRouter: true })

    // The hookless twin, quoted through the same SDK at the same size: the number the hooked pool
    // would return if the hook did nothing.
    const twin = quoted(await router.getQuote({ tokenIn: plainIn, tokenOut: plainOut, amountIn: ONE }))
    expect(routeProtocols(twin.best.route)).toEqual(['v4'])
    const baseline = twin.best.quote.amountOut
    expect(baseline).toBeGreaterThan(0n)
    const skimmed = baseline - (baseline * SKIM_BPS) / BPS

    // WHICH BRANCH REALITY TOOK: the V4Quoter runs the pool's hooks inside its own `unlock`, so the
    // amount it returns is already net of the skim. There is no naive quote to reject — the SDK's
    // quote IS the post-skim number, so `ready` with an accurate quote is the correct outcome.
    const ready = readySwap(
      await router.getSwap({ tokenIn: skimIn, tokenOut: skimOut, amountIn: ONE, trader: SKIM_TRADER }),
    )
    expect(routeProtocols(ready.best.route)).toEqual(['v4'])
    const leg = ready.best.route.legs[0]!
    if (leg.pool.protocol !== 'v4') throw new Error('unreachable')
    expect(getAddress(leg.pool.poolKey.hooks)).toBe(getAddress(hook))
    expect(ready.best.quote.amountOut).toBe(skimmed)
    expect(ready.best.quote.amountOut).toBeLessThan(baseline)

    const hookBefore = await balanceOf(anvil, skimOut, hook)
    const delta = await executeWithFloor(ready, SKIM_TRADER, skimOut)

    // The quote was honest about the hook: what the trader received is exactly what was promised,
    // and it is exactly 30bps below what the identical hookless pool would have paid.
    expect(delta).toBe(ready.best.quote.amountOut)
    expect(delta).toBe(skimmed)
    // ...and the missing 30bps is not rounding or gas: it is sitting in the hook.
    expect((await balanceOf(anvil, skimOut, hook)) - hookBefore).toBe((baseline * SKIM_BPS) / BPS)
  }, 300_000)

  // -------------------------------------------------------------------------
  // 2. Caller-sensitive hook — quotable, unexecutable
  // -------------------------------------------------------------------------

  it('a hook that allows the quoter and reverts on the router: the search falls through to the plain pool', async () => {
    // `sender` as a v4 hook sees it is the CONTRACT calling the PoolManager, so pointing the gate at
    // the V4Quoter is precisely the trap: every quote succeeds, and every execution — which arrives
    // through the Universal Router — reverts. Nothing but a real simulation can tell them apart.
    const gate = await world.deployHook('revert-if-sender-not', { allowedSender: forkManifest().v4!.quoter })
    const gateIn = await world.deployToken('GateIn')
    const gateOut = await world.deployToken('GateOut')
    const { ref } = await world.createV4Pool(gateIn, gateOut, { ...V4_SHAPE, hooks: gate })
    if (ref.protocol !== 'v4') throw new Error('unreachable')
    // A plain v2 pool for the same pair, priced ~2% worse: comfortably outside the 5bps simplicity
    // margin, so the hooked pool genuinely leads the ranking and is the candidate preflight tries first.
    await world.createV2Pool(gateIn, gateOut, 1_000_000n * ONE, 980_000n * ONE)

    await world.fundTrader(GATE_TRADER, { eth: parseEther('10'), tokens: [[gateIn, ONE]] })
    await world.approvePermit2(GATE_TRADER, gateIn, { toRouter: true })

    // Ground truth first: the quoter really can swap this pool, so the candidate is not being
    // dropped at quote time. Everything below is about execution.
    const gateZeroForOne = getAddress(ref.poolKey.currency0) === getAddress(gateIn)
    expect(await quoteDirect(ref.poolKey, gateZeroForOne, ONE)).toBeGreaterThan(0n)

    const ready = readySwap(
      await router.getSwap({ tokenIn: gateIn, tokenOut: gateOut, amountIn: ONE, trader: GATE_TRADER }),
    )
    // The fall-through happened: the executable-but-worse pool leads the result.
    expect(routeProtocols(ready.best.route)).toEqual(['v2'])

    const hooked = ready.alternatives.find((a) => a.route.legs[0]!.pool.protocol === 'v4')
    expect(hooked).toBeDefined()
    expect(hooked!.execution).toBe('failed')
    // And it lost on EXECUTION, not on price: it was quoting a strictly better trade the whole time.
    expect(hooked!.quote.amountOut).toBeGreaterThan(ready.best.quote.amountOut)

    const delta = await executeWithFloor(ready, GATE_TRADER, gateOut)
    expect(delta).toBe(ready.best.quote.amountOut)
  }, 300_000)

  it('the same hook with no alternative: no-route, with the failed candidate still visible', async () => {
    const gate = await world.deployHook('revert-if-sender-not', { allowedSender: forkManifest().v4!.quoter })
    const soloIn = await world.deployToken('SoloIn')
    const soloOut = await world.deployToken('SoloOut')
    await world.createV4Pool(soloIn, soloOut, { ...V4_SHAPE, hooks: gate })

    await world.fundTrader(SOLO_TRADER, { eth: parseEther('10'), tokens: [[soloIn, ONE]] })
    await world.approvePermit2(SOLO_TRADER, soloIn, { toRouter: true })

    const result = noRouteSwap(
      await router.getSwap({ tokenIn: soloIn, tokenOut: soloOut, amountIn: ONE, trader: SOLO_TRADER }),
    )
    // A COMPLETED search whose every candidate failed to execute is `no-route`, not `inconclusive`
    // (`noRouteSwap` enforces the discovery half of that through `assertResultCoherent`).
    expect(result.search.quoting.succeeded).toBeGreaterThan(0) // the quote worked...
    expect(result.alternatives.length).toBeGreaterThan(0)
    for (const alternative of result.alternatives) expect(alternative.execution).toBe('failed') // ...the execution did not
    expect(result.alternatives[0]!.quote.amountOut).toBeGreaterThan(0n)
    expect(routeProtocols(result.alternatives[0]!.route)).toEqual(['v4'])
  }, 300_000)

  // -------------------------------------------------------------------------
  // 3. Fee-on-transfer — the arithmetic is right and the outcome is wrong
  // -------------------------------------------------------------------------

  it('a 300bps fee-on-transfer input breaks the 100bps floor: preflight rejects, and no-route is the answer', async () => {
    // The pair's reserves are seeded by MINTING (untaxed), so the reserve math the SDK quotes from is
    // exactly right about the pool. It is the trip from the trader to the pair that loses 3% — which
    // the quote cannot see and the simulation cannot miss.
    const taxed = await world.deployToken('TaxHigh', { feeOnTransferBps: 300 })
    const out = await world.deployToken('TaxHighOut')
    const pool = await world.createV2Pool(taxed, out, 1_000_000n * ONE, 1_000_000n * ONE)

    const amountIn = 1_000n * ONE
    await world.fundTrader(FOT_HIGH_TRADER, { eth: parseEther('10'), tokens: [[taxed, amountIn]] })
    await world.approvePermit2(FOT_HIGH_TRADER, taxed, { toRouter: true })

    // What the reserves say, and what would actually arrive — the gap is the whole test.
    const naive = await world.expectedV2Out(amountIn, pool, taxed)
    const real = await world.expectedV2Out(amountIn - (amountIn * 300n) / BPS, pool, taxed)
    expect(real).toBeLessThan(minAmountOut(naive)) // below the 100bps floor: the trade cannot settle

    const result = noRouteSwap(
      await router.getSwap({ tokenIn: taxed, tokenOut: out, amountIn, trader: FOT_HIGH_TRADER }),
    )
    expect(result.alternatives).toHaveLength(1)
    expect(result.alternatives[0]!.execution).toBe('failed')
    // The overstated number is still reported — as a quote that failed verification, never as `ready`.
    expect(result.alternatives[0]!.quote.amountOut).toBe(naive)
    expect(await balanceOf(anvil, out, FOT_HIGH_TRADER)).toBe(0n)
  }, 300_000)

  it('a 50bps fee-on-transfer input stays inside the floor: ready, and what lands still clears it', async () => {
    const taxed = await world.deployToken('TaxLow', { feeOnTransferBps: 50 })
    const out = await world.deployToken('TaxLowOut')
    const pool = await world.createV2Pool(taxed, out, 1_000_000n * ONE, 1_000_000n * ONE)

    const amountIn = 1_000n * ONE
    await world.fundTrader(FOT_LOW_TRADER, { eth: parseEther('10'), tokens: [[taxed, amountIn]] })
    await world.approvePermit2(FOT_LOW_TRADER, taxed, { toRouter: true })

    const naive = await world.expectedV2Out(amountIn, pool, taxed)
    const real = await world.expectedV2Out(amountIn - (amountIn * 50n) / BPS, pool, taxed)
    expect(real).toBeLessThan(naive) // still overstated...
    expect(real).toBeGreaterThanOrEqual(minAmountOut(naive)) // ...but inside the slippage the caller asked for

    const ready = readySwap(
      await router.getSwap({ tokenIn: taxed, tokenOut: out, amountIn, trader: FOT_LOW_TRADER }),
    )
    expect(ready.best.quote.amountOut).toBe(naive)

    // The accurate-enough case: the quote is high, the delivered amount is what the tax leaves, and
    // the floor written into the calldata is the thing that stayed true.
    const delta = await executeWithFloor(ready, FOT_LOW_TRADER, out)
    expect(delta).toBe(real)
    expect(delta).toBeLessThan(ready.best.quote.amountOut)
  }, 300_000)

  // -------------------------------------------------------------------------
  // 4. Dust liquidity — the same pool, quotable at one size and not at another
  // -------------------------------------------------------------------------

  it('a dust pool quotes and executes small, and surfaces NotEnoughLiquidity at size instead of crashing', async () => {
    const dustIn = await world.deployToken('DustIn')
    const dustOut = await world.deployToken('DustOut')
    const { ref } = await world.createV4Pool(dustIn, dustOut, { ...V4_SHAPE, liquidity: DUST_LIQUIDITY })
    if (ref.protocol !== 'v4') throw new Error('unreachable')
    const zeroForOne = getAddress(ref.poolKey.currency0) === getAddress(dustIn)

    for (const [trader, amount] of [
      [DUST_TRADER, DUST_SMALL_IN],
      [DUST_HUGE_TRADER, DUST_HUGE_IN],
    ] as const) {
      await world.fundTrader(trader, { eth: parseEther('10'), tokens: [[dustIn, amount]] })
      await world.approvePermit2(trader, dustIn, { toRouter: true })
    }

    // Ground truth, from the deployed quoter: the same pool answers one size and refuses the other.
    expect(await quoteDirect(ref.poolKey, zeroForOne, DUST_SMALL_IN)).toBeGreaterThan(0n)
    expect(await quoterRevertName(ref.poolKey, zeroForOne, DUST_HUGE_IN)).toBe('NotEnoughLiquidity')

    const ready = readySwap(
      await router.getSwap({ tokenIn: dustIn, tokenOut: dustOut, amountIn: DUST_SMALL_IN, trader: DUST_TRADER }),
    )
    expect(routeProtocols(ready.best.route)).toEqual(['v4'])
    expect(await executeWithFloor(ready, DUST_TRADER, dustOut)).toBe(ready.best.quote.amountOut)

    // At size the only pool in this world cannot fill the trade. That is a dropped candidate counted
    // in the report — not an exception, and not a route.
    const result = noRouteSwap(
      await router.getSwap({ tokenIn: dustIn, tokenOut: dustOut, amountIn: DUST_HUGE_IN, trader: DUST_HUGE_TRADER }),
    )
    expect(result.search.quoting.failed).toBeGreaterThan(0)
    expect(result.search.quoting.succeeded).toBe(0)
    expect(result.alternatives).toHaveLength(0)
  }, 600_000)

  it('at size, a dust pool is skipped and a deeper pool for the same pair carries the trade', async () => {
    const shallowIn = await world.deployToken('DeepIn')
    const shallowOut = await world.deployToken('DeepOut')
    await world.createV4Pool(shallowIn, shallowOut, { ...V4_SHAPE, liquidity: DUST_LIQUIDITY })
    const deep = await world.createV2Pool(shallowIn, shallowOut, 2n * 10n ** 31n, 2n * 10n ** 31n)

    await world.fundTrader(FALLTHROUGH_TRADER, { eth: parseEther('10'), tokens: [[shallowIn, DUST_HUGE_IN]] })
    await world.approvePermit2(FALLTHROUGH_TRADER, shallowIn, { toRouter: true })

    const ready = readySwap(
      await router.getSwap({
        tokenIn: shallowIn,
        tokenOut: shallowOut,
        amountIn: DUST_HUGE_IN,
        trader: FALLTHROUGH_TRADER,
      }),
    )
    expect(routeProtocols(ready.best.route)).toEqual(['v2'])
    expect(ready.best.quote.amountOut).toBe(await world.expectedV2Out(DUST_HUGE_IN, deep, shallowIn))
    // The dust pool was tried and lost its quote; nothing about that stopped the search.
    expect(ready.search.quoting.failed).toBeGreaterThan(0)

    expect(await executeWithFloor(ready, FALLTHROUGH_TRADER, shallowOut)).toBe(ready.best.quote.amountOut)
  }, 600_000)

  // -------------------------------------------------------------------------
  // 5. Sender visibility through the aggregator (Multicall3 adoption)
  //
  // The spec's rule is "never Multicall3 for sender-sensitive quotes", and the
  // question this answers ON THE FORK, not from theory, is whether the SDK's
  // quoter calls are sender-sensitive at all — i.e. whether wrapping one in
  // aggregate3 (inner msg.sender: Multicall3 instead of the unset tx sender)
  // changes anything a hook can see. It cannot: a v4 hook's `sender` parameter
  // is the address that called the PoolManager, which is the V4Quoter in BOTH
  // envelopes. The SenderGateHook is the recorder — `SenderNotAllowed(address
  // sender)` puts the hook-observed sender into the revert data itself.
  // -------------------------------------------------------------------------

  it('aggregate3 does not change the hook-visible sender: same recorded sender, byte-identical revert data, equal quotes', async () => {
    const manifest = forkManifest()

    // (a) CLOSED gate — allowedSender is a stranger, so the hook reverts and thereby RECORDS whom it
    // saw. Both dispatch paths must record the same address, and it must be the quoter.
    const stranger: Address = '0x00000000000000000000000000000000000adf20'
    const gate = await world.deployHook('revert-if-sender-not', { allowedSender: stranger })
    const recIn = await world.deployToken('SenderRecIn')
    const recOut = await world.deployToken('SenderRecOut')
    const { ref } = await world.createV4Pool(recIn, recOut, { ...V4_SHAPE, hooks: gate })
    if (ref.protocol !== 'v4') throw new Error('unreachable')

    const leg: RouteLeg = { pool: ref, currencyIn: recIn, currencyOut: recOut }
    const quote = v4Module.encodeQuote([leg], ONE, manifest)
    // The premise, asserted rather than assumed: the SDK's quoter calls carry no `from` and no
    // `value` today, so there is no tx-level sender for the aggregation envelope to displace —
    // and `aggregateCalls` refuses to aggregate any future call that does carry one.
    expect(quote.call.from).toBeUndefined()
    expect(quote.call.value).toBeUndefined()

    const head = await anvil.publicClient.getBlockNumber()

    let directRevert: Hex | undefined
    try {
      await ethCall(anvil.publicClient, quote.call, head)
      throw new Error('expected the gated quote to revert')
    } catch (err) {
      directRevert = revertDataOf(err)
    }
    expect(directRevert).toBeDefined()

    const [slot] = await aggregateCalls({
      client: anvil.publicClient,
      multicall3: MULTICALL3_ADDRESS, // the real canonical deployment, live on the mainnet fork
      calls: [quote.call],
      blockNumber: head,
    })
    expect(slot).toBeInstanceOf(InnerCallFailure)
    const aggRevert = (slot as InnerCallFailure).revertData
    expect(aggRevert?.toLowerCase()).toBe(directRevert!.toLowerCase()) // byte-identical, recorded sender included

    // Whose sender did the hook record? The V4Quoter's — the contract that actually calls the
    // PoolManager — in BOTH envelopes; never Multicall3, whatever the inner msg.sender was.
    const quoterNeedle = manifest.v4!.quoter.slice(2).toLowerCase()
    expect(directRevert!.toLowerCase()).toContain(quoterNeedle)
    expect(aggRevert!.toLowerCase()).toContain(quoterNeedle)
    expect(aggRevert!.toLowerCase()).not.toContain(MULTICALL3_ADDRESS.slice(2).toLowerCase())

    // (b) OPEN gate — reconfigure the same hook to allow the quoter: both dispatch paths now pass,
    // and all three witnesses (direct eth_call, aggregate3 inner, ground-truth quoter simulation)
    // agree on the amount to the wei.
    await world.deployHook('revert-if-sender-not', { allowedSender: manifest.v4!.quoter })
    const directOut = quote.decode(await ethCall(anvil.publicClient, quote.call, head))
    const [openSlot] = await aggregateCalls({
      client: anvil.publicClient,
      multicall3: MULTICALL3_ADDRESS,
      calls: [quote.call],
      blockNumber: head,
    })
    expect(typeof openSlot).toBe('string')
    const aggOut = quote.decode(openSlot as Hex)
    expect(directOut).toBeGreaterThan(0n)
    expect(aggOut).toBe(directOut)
    const zeroForOne = getAddress(ref.poolKey.currency0) === getAddress(recIn)
    expect(await quoteDirect(ref.poolKey, zeroForOne, ONE)).toBe(directOut)
  }, 300_000)

  // -------------------------------------------------------------------------
  // 6. The manifest itself
  // -------------------------------------------------------------------------

  it('every address the mainnet manifest names has code at the pinned fork block', async () => {
    const named: [string, Address][] = [
      ['v2.factory', MAINNET_MANIFEST.v2!.factory],
      ['v3.factory', MAINNET_MANIFEST.v3!.factory],
      ['v3.v3QuoterV2', MAINNET_MANIFEST.v3!.v3QuoterV2],
      ['v4.poolManager', MAINNET_MANIFEST.v4!.poolManager],
      ['v4.quoter', MAINNET_MANIFEST.v4!.quoter],
      ['execution.address', MAINNET_MANIFEST.execution!.address],
      ['execution.permit2', MAINNET_MANIFEST.execution!.permit2],
      ['execution.wrappedNative', MAINNET_MANIFEST.execution!.wrappedNative],
    ]

    for (const [label, address] of named) {
      const code = await anvil.publicClient.getCode({ address, blockNumber: FORK_BLOCK })
      // An address with no code is a manifest that would fail silently: every `eth_call` against it
      // returns `0x`, which reads as "this protocol has nothing" rather than "this is misconfigured".
      if ((code?.length ?? 0) <= 2) throw new Error(`${label} (${address}) has no code at block ${FORK_BLOCK}`)
    }

    // The wrapped native the manifest binds is the one the Universal Router itself is built around,
    // so it must also be a real WETH — checked by reading it, not by trusting the address.
    const wrapped = MAINNET_MANIFEST.execution!.wrappedNative
    expect(await world.read<string>({ address: wrapped, abi: ERC20_ABI, functionName: 'symbol' })).toBe('WETH')
  }, 120_000)
})
