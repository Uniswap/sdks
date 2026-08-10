import {
  concatHex,
  encodeAbiParameters,
  encodeDeployData,
  getAddress,
  keccak256,
  maxUint160,
  maxUint256,
  pad,
  parseEther,
  toHex,
  zeroAddress,
  type Address,
  type Hex,
  type TransactionReceipt,
} from 'viem'
import { mainnet } from 'viem/chains'

import {
  ERC20_ABI,
  PERMIT2_ABI,
  V2_FACTORY_ABI,
  V2_PAIR_ABI,
  V3_FACTORY_ABI,
  V3_NFPM_ABI,
  V3_POOL_ABI,
  V4_POOL_MANAGER_ABI,
  V4_POSITION_MANAGER_ABI,
  WETH_ABI,
} from './abis'
import { ANVIL_DEPLOYER, type AnvilClient } from './anvil'
import ARTIFACTS from './artifacts/contracts.json'
// Type-only, from the public entry point rather than `@uniswap/router-lite-sdk`: the harness hands
// back the SDK's own `PoolRef`/`PoolKey` so refs can be passed straight into router hints, and a
// type-only import is erased before anything resolves, so this needs no build of the parent (unlike
// a runtime import of the package name, which resolves through `dist/`).
import type { CurrencyRef, PoolKey, PoolRef } from '../src/index'

// ---------------------------------------------------------------------------
// worldBuilder — the ground-truth factory every fork test builds on.
//
// The SDK's job is to DISCOVER and QUOTE pools it did not create. So the tests
// need pools whose exact shape is known a priori: tokens with chosen supply,
// reserves set to chosen numbers, hooks with chosen behavior. `createWorld`
// conjures those on a mainnet fork using the REAL deployed factories — the pools
// are synthetic, the protocol code they live in is not.
//
// Everything here is deliberately independent of `src/`: addresses, ABIs and the
// constant-product formula are all restated, so a bug in the SDK cannot hide by
// being reused as its own ground truth.
// ---------------------------------------------------------------------------

/** Real mainnet deployments the harness writes to. Restated (not imported from `src/manifest`) on purpose. */
export const ADDRESSES = {
  weth: getAddress('0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2'),
  permit2: getAddress('0x000000000022D473030F116dDEE9F6B43aC78BA3'),
  universalRouter: getAddress('0x66a9893cC07D91D95644AEDD05D03f95e1dBA8Af'),
  v2Factory: getAddress('0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f'),
  v3Factory: getAddress('0x1F98431c8aD98523631AE4a59f267346ea31F984'),
  v3PositionManager: getAddress('0xC36442b4a4522E871399CD717aBDD847Ab11FE88'),
  v4PoolManager: getAddress('0x000000000004444c5dc75cB358380D2e3dE08A90'),
  v4PositionManager: getAddress('0xbd216513d74c8cf14cf4747e6aaa6420ff64ee9e'),
  v4Quoter: getAddress('0x52f0e24d1c21c8a0cb1e5a5dd6198556bd9e1203'),
} as const

/** Behaviors `deployHook` can install. */
export type HookBehavior = 'none' | 'skim-fee-bps-30' | 'revert-if-sender-not' | 'revert-on-swap'

/**
 * Where each hook behavior gets installed, and why that address.
 *
 * v4 reads a hook's permissions out of the LOW 14 BITS OF ITS ADDRESS, so the address is not
 * incidental — it IS the permission set, and it must be chosen (not CREATE-derived). The high bytes
 * are per-behavior nonsense purely so the four hooks are distinguishable at a glance.
 *
 *   none                 …0080  beforeSwap                                (pass-through)
 *   revert-on-swap       …0080  beforeSwap                                (always reverts)
 *   revert-if-sender-not …0080  beforeSwap                                (reverts on wrong sender)
 *   skim-fee-bps-30      …0044  afterSwap | afterSwapReturnsDelta         (takes 0.30% of output)
 *
 * There is no zero-flag entry: `Hooks.isValidHookAddress` rejects a non-zero hook with no flags on a
 * static-fee pool, so `none` is a pass-through beforeSwap hook rather than a permission-less one.
 */
const HOOK_INSTALLS: Record<HookBehavior, { address: Address; artifact: keyof typeof ARTIFACTS }> = {
  none: { address: getAddress('0x1111111111111111111111111111111111110080'), artifact: 'NoopHook' },
  'revert-on-swap': { address: getAddress('0x4444444444444444444444444444444444440080'), artifact: 'RevertOnSwapHook' },
  'revert-if-sender-not': {
    address: getAddress('0x3333333333333333333333333333333333330080'),
    artifact: 'SenderGateHook',
  },
  'skim-fee-bps-30': { address: getAddress('0x2222222222222222222222222222222222220044'), artifact: 'SkimFeeHook' },
}

/** v4-periphery `Actions` values the harness encodes. */
const ACTION = { MINT_POSITION: 0x02, SETTLE_PAIR: 0x0d, SWEEP: 0x14 } as const

const Q96 = 2n ** 96n
const MAX_TICK = 887_272
const DEADLINE = 99_999_999_999n
/** Permit2 expirations are uint48 seconds; this is far past any fork's clock. */
const PERMIT2_EXPIRATION = 2_000_000_000

/** v3 fee tier -> tick spacing, as deployed on the mainnet v3 factory. */
const V3_TICK_SPACING: Record<number, number> = { 100: 1, 500: 10, 3000: 60, 10000: 200 }

export type World = ReturnType<typeof createWorld>

export type V3PoolOptions = { liquidity: bigint; priceApprox: number }

export type V4PoolOptions = {
  fee: number
  tickSpacing: number
  hooks?: Address
  liquidity: bigint
  /** Price of currency1 per currency0, in RAW units. Defaults to 1 (sqrtPriceX96 = 2^96). */
  priceApprox?: number
}

/**
 * Builds a `World` bound to a running fork. All writes originate from anvil's first prefunded dev
 * account ({@link ANVIL_DEPLOYER}) unless a method says otherwise.
 */
export function createWorld(anvil: AnvilClient) {
  const deployer = ANVIL_DEPLOYER
  /** Tokens this world deployed — the only ones it can mint freely. */
  const ownTokens = new Set<string>()

  // -------------------------------------------------------------------------
  // Low-level plumbing
  // -------------------------------------------------------------------------

  /**
   * Send a contract write and wait for its receipt, throwing on revert. Loosely typed on purpose:
   * viem's `writeContract` overloads do not survive a generic spread, and the real check is the
   * on-chain status we assert here.
   */
  async function write(params: {
    address: Address
    abi: readonly unknown[]
    functionName: string
    args?: readonly unknown[]
    value?: bigint
    from?: Address
    gas?: bigint
  }): Promise<TransactionReceipt> {
    const account = params.from ?? deployer
    const wallet = anvil.walletFor(account)
    const call = wallet.writeContract as unknown as (a: Record<string, unknown>) => Promise<Hex>
    const hash = await call({ ...params, account, chain: mainnet })
    const receipt = await anvil.publicClient.waitForTransactionReceipt({ hash })
    if (receipt.status !== 'success') {
      throw new Error(`${params.functionName}() reverted on ${params.address} (tx ${hash})`)
    }
    return receipt
  }

  async function read<T>(params: {
    address: Address
    abi: readonly unknown[]
    functionName: string
    args?: readonly unknown[]
  }): Promise<T> {
    const call = anvil.publicClient.readContract as unknown as (a: Record<string, unknown>) => Promise<T>
    return call(params)
  }

  /** Deploy `bytecode` (creation) from the deployer and return the resulting address. */
  async function deploy(data: Hex): Promise<Address> {
    const wallet = anvil.walletFor(deployer)
    const send = wallet.sendTransaction as unknown as (a: Record<string, unknown>) => Promise<Hex>
    const hash = await send({ account: deployer, chain: mainnet, data })
    const receipt = await anvil.publicClient.waitForTransactionReceipt({ hash })
    if (receipt.status !== 'success' || !receipt.contractAddress) throw new Error(`deployment reverted (tx ${hash})`)
    return getAddress(receipt.contractAddress)
  }

  /** Guarantee `account` can pay for gas without disturbing a balance it already has. */
  async function ensureGas(account: Address): Promise<void> {
    const balance = await anvil.publicClient.getBalance({ address: account })
    if (balance < parseEther('1')) await anvil.rpc('anvil_setBalance', [account, toHex(parseEther('100'))])
  }

  /**
   * Put `amount` of `token` into `to`'s balance.
   *
   * Only two sources exist, deliberately: tokens this world minted (open `mint`) and WETH (wrap real
   * fork ETH). Anything else — a real mainnet token like USDC — has no honest source here and throws
   * rather than silently producing a balance a real trader could never have; use an impersonated
   * whale or a storage `deal` in the test if you need one.
   */
  async function supply(token: Address, to: Address, amount: bigint): Promise<void> {
    if (amount === 0n) return
    const normalized = getAddress(token)
    if (ownTokens.has(normalized)) {
      await write({ address: normalized, abi: ERC20_ABI, functionName: 'mint', args: [to, amount] })
      return
    }
    if (normalized === ADDRESSES.weth) {
      // Top up the deployer so the wrap can never fail on a large seed, then wrap and forward.
      await anvil.rpc('anvil_setBalance', [deployer, toHex(amount + parseEther('10000'))])
      await write({ address: ADDRESSES.weth, abi: WETH_ABI, functionName: 'deposit', value: amount })
      if (getAddress(to) !== deployer) {
        await write({ address: ADDRESSES.weth, abi: ERC20_ABI, functionName: 'transfer', args: [to, amount] })
      }
      return
    }
    throw new Error(
      `worldBuilder cannot mint ${normalized}: it is neither a world-deployed token nor WETH. ` +
        `Impersonate a whale or write the balance slot directly in the test.`
    )
  }

  /** ERC20 approval from `owner`, idempotent-ish (always re-approves; cheap on a fork). */
  async function approve(token: Address, owner: Address, spender: Address, amount: bigint): Promise<void> {
    await write({ address: token, abi: ERC20_ABI, functionName: 'approve', args: [spender, amount], from: owner })
  }

  // -------------------------------------------------------------------------
  // Math (restated locally — never imported from the SDK under test)
  // -------------------------------------------------------------------------

  /**
   * `sqrt(price) * 2^96`, where `price` is currency1-per-currency0 in RAW units.
   *
   * Done via the float's own mantissa/exponent so extreme prices (1e-12, 1e18) keep ~15 significant
   * digits instead of collapsing through a single `Number -> BigInt` step.
   */
  function encodeSqrtPriceX96(price: number): bigint {
    if (!(price > 0) || !Number.isFinite(price)) throw new Error(`priceApprox must be a positive finite number`)
    const root = Math.sqrt(price)
    const exponent = Math.floor(Math.log2(root))
    const mantissa = BigInt(Math.round((root / 2 ** exponent) * 2 ** 52)) // 53-bit, exact as a BigInt
    const shift = 96 + exponent - 52
    return shift >= 0 ? mantissa << BigInt(shift) : mantissa >> BigInt(-shift)
  }

  /** Widest tick range representable at `tickSpacing`. */
  function fullRange(tickSpacing: number): { tickLower: number; tickUpper: number } {
    const bound = Math.floor(MAX_TICK / tickSpacing) * tickSpacing
    return { tickLower: -bound, tickUpper: bound }
  }

  /**
   * Token amounts a full-range position of `liquidity` needs at `sqrtPriceX96`, with headroom.
   *
   * Full range collapses the exact formulas to `L*2^96/sqrtP` and `L*sqrtP/2^96` (the sqrt ratios at
   * the extreme ticks are ~0 and ~infinity). The 2% headroom covers that approximation and the tick
   * rounding: both position managers pull only what the position actually needs, so over-supplying
   * costs nothing and under-supplying silently mints less liquidity than asked for.
   */
  function fullRangeAmounts(liquidity: bigint, sqrtPriceX96: bigint): { amount0: bigint; amount1: bigint } {
    const headroom = (x: bigint): bigint => (x * 102n) / 100n + 1n
    return {
      amount0: headroom((liquidity * Q96) / sqrtPriceX96),
      amount1: headroom((liquidity * sqrtPriceX96) / Q96),
    }
  }

  /** Uniswap v2 constant-product with the 0.30% fee — the three lines the SDK must agree with. */
  function getAmountOut(amountIn: bigint, reserveIn: bigint, reserveOut: bigint): bigint {
    if (amountIn <= 0n || reserveIn <= 0n || reserveOut <= 0n) return 0n
    const amountInWithFee = amountIn * 997n
    return (amountInWithFee * reserveOut) / (reserveIn * 1000n + amountInWithFee)
  }

  /** `'native'` means WETH everywhere except v4, where it means the zero address. */
  const asErc20 = (c: Address | 'native'): Address => (c === 'native' ? ADDRESSES.weth : getAddress(c))
  const asV4Currency = (c: CurrencyRef): Address => (c === 'native' ? zeroAddress : getAddress(c))
  const sortPair = (a: Address, b: Address): [Address, Address] => (BigInt(a) < BigInt(b) ? [a, b] : [b, a])

  // -------------------------------------------------------------------------
  // Public surface
  // -------------------------------------------------------------------------

  /**
   * Deploy a fresh 18-decimal ERC20 with an open `mint`. With `feeOnTransferBps` it deploys the
   * fee-on-transfer variant instead, which skims that many bps into the token contract on every
   * `transfer`/`transferFrom` (mints are NOT taxed, so seeded reserves stay exact).
   */
  async function deployToken(name: string, opts?: { feeOnTransferBps?: number }): Promise<Address> {
    const symbol =
      name
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, '')
        .slice(0, 6) || 'TT'
    const fot = opts?.feeOnTransferBps
    const data =
      fot === undefined
        ? encodeDeployData({
            abi: [{ type: 'constructor', inputs: [{ type: 'string' }, { type: 'string' }] }] as const,
            bytecode: ARTIFACTS.TestERC20.creation as Hex,
            args: [name, symbol],
          })
        : encodeDeployData({
            abi: [
              { type: 'constructor', inputs: [{ type: 'string' }, { type: 'string' }, { type: 'uint256' }] },
            ] as const,
            bytecode: ARTIFACTS.TestFeeOnTransferERC20.creation as Hex,
            args: [name, symbol, BigInt(fot)],
          })
    const address = await deploy(data)
    ownTokens.add(address)
    return address
  }

  /**
   * Create a v2 pair on the real factory and seed it with exactly `reserveA`/`reserveB`.
   *
   * Reserves are minted straight to the pair (not transferred through it), so a fee-on-transfer
   * token's reserves are exactly the numbers asked for — the tax then shows up where it matters, on
   * the swap path.
   */
  async function createV2Pool(
    a: Address | 'native',
    b: Address | 'native',
    reserveA: bigint,
    reserveB: bigint
  ): Promise<PoolRef> {
    const tokenA = asErc20(a)
    const tokenB = asErc20(b)
    const [token0, token1] = sortPair(tokenA, tokenB)

    let pair = await read<Address>({
      address: ADDRESSES.v2Factory,
      abi: V2_FACTORY_ABI,
      functionName: 'getPair',
      args: [tokenA, tokenB],
    })
    if (getAddress(pair) === zeroAddress) {
      await write({
        address: ADDRESSES.v2Factory,
        abi: V2_FACTORY_ABI,
        functionName: 'createPair',
        args: [tokenA, tokenB],
      })
      pair = await read<Address>({
        address: ADDRESSES.v2Factory,
        abi: V2_FACTORY_ABI,
        functionName: 'getPair',
        args: [tokenA, tokenB],
      })
    }
    const address = getAddress(pair)

    await supply(tokenA, address, reserveA)
    await supply(tokenB, address, reserveB)
    await write({ address, abi: V2_PAIR_ABI, functionName: 'mint', args: [deployer], gas: 5_000_000n })

    return v2Ref(address, token0, token1)
  }

  /**
   * Create (or reuse) a v3 pool at `fee`, initialize it at `priceApprox`, and add a full-range
   * position of ~`liquidity` through the real NonfungiblePositionManager.
   *
   * `priceApprox` is the raw-unit price of `b` per one `a` — i.e. the number the caller thinks in,
   * before sorting; the harness flips it if `a` turns out to be token1.
   */
  async function createV3Pool(
    a: Address | 'native',
    b: Address | 'native',
    fee: number,
    opts: V3PoolOptions
  ): Promise<PoolRef> {
    const tickSpacing = V3_TICK_SPACING[fee]
    if (tickSpacing === undefined) throw new Error(`unsupported v3 fee tier ${fee}`)

    const tokenA = asErc20(a)
    const tokenB = asErc20(b)
    const [token0, token1] = sortPair(tokenA, tokenB)
    const price1per0 = token0 === tokenA ? opts.priceApprox : 1 / opts.priceApprox
    const sqrtPriceX96 = encodeSqrtPriceX96(price1per0)

    let pool = await read<Address>({
      address: ADDRESSES.v3Factory,
      abi: V3_FACTORY_ABI,
      functionName: 'getPool',
      args: [token0, token1, fee],
    })
    if (getAddress(pool) === zeroAddress) {
      await write({
        address: ADDRESSES.v3Factory,
        abi: V3_FACTORY_ABI,
        functionName: 'createPool',
        args: [token0, token1, fee],
        gas: 6_000_000n,
      })
      pool = await read<Address>({
        address: ADDRESSES.v3Factory,
        abi: V3_FACTORY_ABI,
        functionName: 'getPool',
        args: [token0, token1, fee],
      })
    }
    const address = getAddress(pool)

    const slot0 = await read<readonly [bigint, number, ...unknown[]]>({
      address,
      abi: V3_POOL_ABI,
      functionName: 'slot0',
    })
    if (slot0[0] === 0n) {
      await write({ address, abi: V3_POOL_ABI, functionName: 'initialize', args: [sqrtPriceX96] })
    }

    if (opts.liquidity > 0n) {
      const { amount0, amount1 } = fullRangeAmounts(opts.liquidity, sqrtPriceX96)
      await supply(token0, deployer, amount0)
      await supply(token1, deployer, amount1)
      await approve(token0, deployer, ADDRESSES.v3PositionManager, maxUint256)
      await approve(token1, deployer, ADDRESSES.v3PositionManager, maxUint256)

      const { tickLower, tickUpper } = fullRange(tickSpacing)
      await write({
        address: ADDRESSES.v3PositionManager,
        abi: V3_NFPM_ABI,
        functionName: 'mint',
        args: [
          {
            token0,
            token1,
            fee,
            tickLower,
            tickUpper,
            amount0Desired: amount0,
            amount1Desired: amount1,
            amount0Min: 0n,
            amount1Min: 0n,
            recipient: deployer,
            deadline: DEADLINE,
          },
        ],
        gas: 6_000_000n,
      })
    }

    return v3Ref(address, token0, token1, fee)
  }

  /**
   * Initialize a v4 pool on the real PoolManager and (when `liquidity > 0`) add a full-range position
   * through the real v4 PositionManager.
   *
   * Returns the `Initialize` transaction's receipt alongside the ref: pool discovery in this SDK is
   * log-driven, so tests need the actual on-fork log — its block number bounds their scan, and its
   * topics are what discovery must decode.
   */
  async function createV4Pool(
    a: CurrencyRef,
    b: CurrencyRef,
    opts: V4PoolOptions
  ): Promise<{ ref: PoolRef; receipt: TransactionReceipt }> {
    const currencyA = asV4Currency(a)
    const currencyB = asV4Currency(b)
    const [currency0, currency1] = sortPair(currencyA, currencyB)
    const price1per0 = currency0 === currencyA ? opts.priceApprox ?? 1 : 1 / (opts.priceApprox ?? 1)
    const sqrtPriceX96 = encodeSqrtPriceX96(price1per0)

    const poolKey: PoolKey = {
      currency0,
      currency1,
      fee: opts.fee,
      tickSpacing: opts.tickSpacing,
      hooks: opts.hooks ? getAddress(opts.hooks) : zeroAddress,
    }

    const receipt = await write({
      address: ADDRESSES.v4PoolManager,
      abi: V4_POOL_MANAGER_ABI,
      functionName: 'initialize',
      args: [poolKey, sqrtPriceX96],
      gas: 2_000_000n,
    })

    if (opts.liquidity > 0n) {
      const { amount0, amount1 } = fullRangeAmounts(opts.liquidity, sqrtPriceX96)
      const nativeValue = currency0 === zeroAddress ? amount0 : 0n

      for (const [currency, amount] of [
        [currency0, amount0],
        [currency1, amount1],
      ] as const) {
        if (currency === zeroAddress) {
          await anvil.rpc('anvil_setBalance', [deployer, toHex(amount + parseEther('10000'))])
          continue
        }
        await supply(currency, deployer, amount)
        // v4's PositionManager pulls funds through Permit2, so both legs must be approved.
        await approve(currency, deployer, ADDRESSES.permit2, maxUint256)
        await write({
          address: ADDRESSES.permit2,
          abi: PERMIT2_ABI,
          functionName: 'approve',
          args: [currency, ADDRESSES.v4PositionManager, maxUint160, PERMIT2_EXPIRATION],
        })
      }

      const { tickLower, tickUpper } = fullRange(opts.tickSpacing)
      const actions: number[] = [ACTION.MINT_POSITION, ACTION.SETTLE_PAIR]
      const params: Hex[] = [
        encodeAbiParameters(
          [
            {
              type: 'tuple',
              components: [
                { type: 'address' },
                { type: 'address' },
                { type: 'uint24' },
                { type: 'int24' },
                { type: 'address' },
              ],
            },
            { type: 'int24' },
            { type: 'int24' },
            { type: 'uint256' },
            { type: 'uint128' },
            { type: 'uint128' },
            { type: 'address' },
            { type: 'bytes' },
          ],
          [
            [poolKey.currency0, poolKey.currency1, poolKey.fee, poolKey.tickSpacing, poolKey.hooks],
            tickLower,
            tickUpper,
            opts.liquidity,
            amount0,
            amount1,
            deployer,
            '0x',
          ]
        ),
        encodeAbiParameters([{ type: 'address' }, { type: 'address' }], [currency0, currency1]),
      ]
      if (nativeValue > 0n) {
        // Native settles from msg.value; SWEEP returns whatever the position did not consume.
        actions.push(ACTION.SWEEP)
        params.push(encodeAbiParameters([{ type: 'address' }, { type: 'address' }], [zeroAddress, deployer]))
      }

      const unlockData = encodeAbiParameters(
        [{ type: 'bytes' }, { type: 'bytes[]' }],
        [concatHex(actions.map((a2) => toHex(a2, { size: 1 }))), params]
      )
      await write({
        address: ADDRESSES.v4PositionManager,
        abi: V4_POSITION_MANAGER_ABI,
        functionName: 'modifyLiquidities',
        args: [unlockData, DEADLINE],
        value: nativeValue,
        gas: 8_000_000n,
      })
    }

    return { ref: v4Ref(poolKey), receipt }
  }

  /**
   * Install a test hook at its permission-encoding address (see {@link HOOK_INSTALLS}) via
   * `anvil_setCode` and return that address.
   *
   * `setCode` does not run constructors, so `revert-if-sender-not` is configured by writing storage
   * slot 0 directly. It defaults to the Universal Router — the interesting gate, since `sender` as
   * v4 sees it is the calling CONTRACT, not the trader EOA.
   */
  async function deployHook(behavior: HookBehavior, opts?: { allowedSender?: Address }): Promise<Address> {
    const install = HOOK_INSTALLS[behavior]
    if (!install) throw new Error(`unknown hook behavior ${behavior}`)

    await anvil.rpc('anvil_setCode', [install.address, ARTIFACTS[install.artifact].deployed])
    if (behavior === 'revert-if-sender-not') {
      const allowed = getAddress(opts?.allowedSender ?? ADDRESSES.universalRouter)
      await anvil.rpc('anvil_setStorageAt', [install.address, pad('0x0', { size: 32 }), pad(allowed, { size: 32 })])
    }
    return install.address
  }

  /** Give a trader ETH and token balances. `eth` REPLACES the balance; token amounts are additive. */
  async function fundTrader(t: Address, opts: { eth?: bigint; tokens?: Array<[Address, bigint]> }): Promise<void> {
    const trader = getAddress(t)
    if (opts.eth !== undefined) await anvil.rpc('anvil_setBalance', [trader, toHex(opts.eth)])
    for (const [token, amount] of opts.tokens ?? []) await supply(token, trader, amount)
  }

  /**
   * Wire up the trader's spend path: ERC20 -> Permit2 always, and Permit2 -> Universal Router when
   * `toRouter` is set (the second leg is what a real swap needs, and what the SDK's readiness checks
   * are supposed to notice is missing).
   */
  async function approvePermit2(t: Address, token: Address, opts?: { toRouter?: boolean }): Promise<void> {
    const trader = getAddress(t)
    await anvil.rpc('anvil_impersonateAccount', [trader])
    try {
      await ensureGas(trader)
      await approve(getAddress(token), trader, ADDRESSES.permit2, maxUint256)
      if (opts?.toRouter) {
        await write({
          address: ADDRESSES.permit2,
          abi: PERMIT2_ABI,
          functionName: 'approve',
          args: [getAddress(token), ADDRESSES.universalRouter, maxUint160, PERMIT2_EXPIRATION],
          from: trader,
        })
      }
    } finally {
      await anvil.rpc('anvil_stopImpersonatingAccount', [trader])
    }
  }

  /**
   * Ground-truth v2 output for `amountIn`, read from the pool's ACTUAL on-fork reserves.
   *
   * `tokenIn` defaults to the pool's token0. This is the number the SDK's quote must reproduce; it is
   * computed here from `getReserves()` and the constant-product formula, never from the SDK.
   */
  async function expectedV2Out(amountIn: bigint, pool: PoolRef, tokenIn?: Address): Promise<bigint> {
    if (pool.protocol !== 'v2') throw new Error(`expectedV2Out needs a v2 pool, got ${pool.protocol}`)
    const [reserve0, reserve1] = await read<readonly [bigint, bigint, number]>({
      address: pool.address,
      abi: V2_PAIR_ABI,
      functionName: 'getReserves',
    })
    const zeroForOne = tokenIn === undefined || getAddress(tokenIn) === getAddress(pool.token0)
    return zeroForOne ? getAmountOut(amountIn, reserve0, reserve1) : getAmountOut(amountIn, reserve1, reserve0)
  }

  return {
    anvil,
    deployer,
    addresses: ADDRESSES,
    deployToken,
    createV2Pool,
    createV3Pool,
    createV4Pool,
    deployHook,
    fundTrader,
    approvePermit2,
    expectedV2Out,
    // Escape hatches for suites that need one more call than the surface above.
    read,
    write,
    supply,
    encodeSqrtPriceX96,
    getAmountOut,
  }
}

/**
 * The `PoolRef` constructors, restated for the same reason `poolIdOf` is: the harness's refs — their
 * identity strings and their domain-form currencies included — must be built independently of the
 * SDK's own `protocols/poolRef.ts`, or a ref the SDK builds wrong would be "confirmed" by a fixture
 * built exactly as wrong.
 */
function v2Ref(address: Address, token0: Address, token1: Address): PoolRef {
  return { protocol: 'v2', address, token0, token1, id: `v2:${address.toLowerCase()}`, currencies: [token0, token1] }
}

function v3Ref(address: Address, token0: Address, token1: Address, fee: number): PoolRef {
  return { protocol: 'v3', address, token0, token1, fee, id: `v3:${address.toLowerCase()}`, currencies: [token0, token1] }
}

function v4Ref(poolKey: PoolKey): PoolRef {
  const poolId = poolIdOf(poolKey)
  const domain = (c: Address): CurrencyRef => (getAddress(c) === zeroAddress ? 'native' : c)
  return {
    protocol: 'v4',
    poolId,
    poolKey,
    id: `v4:${poolId.toLowerCase()}`,
    currencies: [domain(poolKey.currency0), domain(poolKey.currency1)],
  }
}

/**
 * v4 pool id: `keccak256(abi.encode(poolKey))`. Restated here (rather than imported from
 * `src/internal/poolId`) so the harness's ids are independent of the SDK's.
 */
export function poolIdOf(key: PoolKey): Hex {
  return keccak256(
    encodeAbiParameters(
      [{ type: 'address' }, { type: 'address' }, { type: 'uint24' }, { type: 'int24' }, { type: 'address' }],
      [key.currency0, key.currency1, key.fee, key.tickSpacing, key.hooks]
    )
  )
}
