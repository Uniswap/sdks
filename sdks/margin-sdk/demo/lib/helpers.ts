import {
  type Abi,
  type Address,
  type Hex,
  type TransactionReceipt,
  createWalletClient,
  encodeAbiParameters,
  erc20Abi,
  formatUnits,
  http,
  isAddressEqual,
  keccak256,
  parseEventLogs,
  toHex,
  zeroAddress,
} from 'viem'
import { mainnet } from 'viem/chains'

import { type Ctx, V4_QUOTER } from './env'
import {
  LENDING_ADAPTER_ABI,
  MARGIN_ROUTER_ABI,
  MAX_UINT160,
  type Market,
  buildV4ExactOutRoute,
  decodeMorphoMarketData,
  swapZeroForOne,
  withSlippageUp,
  permit2ApproveCall,
} from '../../src'

// ---------------------------------------------------------------------------
// Logging & assertions
// ---------------------------------------------------------------------------

const GREEN = '\x1b[32m'
const CYAN = '\x1b[36m'
const DIM = '\x1b[2m'
const RESET = '\x1b[0m'

export function section(title: string): void {
  console.log(`\n${CYAN}━━━ ${title} ━━━${RESET}`)
}

export function ok(message: string): void {
  console.log(`  ${GREEN}✓${RESET} ${message}`)
}

export function note(message: string): void {
  console.log(`  ${DIM}· ${message}${RESET}`)
}

export function assert(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(`✗ assertion failed: ${message}`)
  ok(message)
}

/** Asserts `actual` is within `toleranceBps` of `expected`. */
export function assertApprox(actual: bigint, expected: bigint, toleranceBps: number, message: string): void {
  const diff = actual > expected ? actual - expected : expected - actual
  const bound = (expected * BigInt(toleranceBps)) / 10_000n
  assert(diff <= bound, `${message} (actual ${actual}, expected ~${expected} ±${toleranceBps}bps)`)
}

export function fmt(amount: bigint, decimals: number, symbol: string): string {
  const human = Number(formatUnits(amount, decimals))
  return `${human.toLocaleString('en-US', { maximumFractionDigits: 6 })} ${symbol}`
}

export function fmtWad(ratio: bigint): string {
  return `${(Number(formatUnits(ratio, 18)) * 100).toFixed(2)}%`
}

// ---------------------------------------------------------------------------
// Transactions
// ---------------------------------------------------------------------------

/** Simulates a write descriptor as the deployer (surfacing decoded reverts), then sends it. */
export async function send(
  ctx: Ctx,
  call: {
    address: Address
    abi: Abi | readonly unknown[]
    functionName: string
    args: readonly unknown[]
    value?: bigint
  }
): Promise<TransactionReceipt> {
  const { request } = await ctx.publicClient.simulateContract({
    account: ctx.deployer,
    address: call.address,
    abi: call.abi as Abi,
    functionName: call.functionName,
    args: call.args as unknown[],
    value: call.value,
  })
  // anvil's fork-mode gas estimates run a hair low (cold-slot surcharges on lazily-loaded
  // state), so pad the demo sends rather than trusting the estimate to the wei.
  const hash = await ctx.wallet.writeContract({ ...request, gas: 5_000_000n } as never)
  const receipt = await ctx.publicClient.waitForTransactionReceipt({ hash })
  if (receipt.status !== 'success') {
    // Replay as eth_call at the parent block to surface the revert reason.
    const tx = await ctx.publicClient.getTransaction({ hash })
    let reason = 'unknown'
    try {
      await ctx.publicClient.call({
        account: tx.from,
        to: tx.to!,
        data: tx.input,
        value: tx.value,
        gas: tx.gas,
        blockNumber: receipt.blockNumber - 1n,
      })
      reason = 'replay succeeded (state divergence between call and tx?)'
    } catch (error) {
      reason = (error as Error).message.split('\n').slice(0, 6).join(' | ')
    }
    throw new Error(
      `transaction reverted on-send: ${call.functionName} (gas used ${receipt.gasUsed}/${tx.gas}) → ${reason}`
    )
  }
  return receipt
}

/** Decodes the first `eventName` log in a receipt using the SDK router ABI. */
export function routerEvent<T = Record<string, unknown>>(
  receipt: TransactionReceipt,
  eventName: string
): T | undefined {
  const logs = parseEventLogs({ abi: MARGIN_ROUTER_ABI, logs: receipt.logs, eventName: eventName as never })
  return logs[0]?.args as T | undefined
}

// ---------------------------------------------------------------------------
// Token funding & approvals
// ---------------------------------------------------------------------------

const balanceSlotCache = new Map<Address, bigint>()

/**
 * Foundry-`deal` equivalent over anvil: probes the token's balance-mapping slot by writing
 * candidate `keccak256(abi.encode(holder, slot))` cells until `balanceOf` reflects the value.
 */
export async function deal(ctx: Ctx, token: Address, to: Address, amount: bigint): Promise<void> {
  const readBalance = () =>
    ctx.publicClient.readContract({ address: token, abi: erc20Abi, functionName: 'balanceOf', args: [to] })
  const writeCell = async (slot: bigint, value: Hex) => {
    const cell = keccak256(encodeAbiParameters([{ type: 'address' }, { type: 'uint256' }], [to, slot]))
    await ctx.testClient.setStorageAt({ address: token, index: cell, value })
    return cell
  }
  const cached = balanceSlotCache.get(token)
  const candidates = cached !== undefined ? [cached] : Array.from({ length: 50 }, (_, i) => BigInt(i))
  for (const slot of candidates) {
    const cell = keccak256(encodeAbiParameters([{ type: 'address' }, { type: 'uint256' }], [to, slot]))
    const previous = await ctx.publicClient.getStorageAt({ address: token, slot: cell })
    await writeCell(slot, toHex(amount, { size: 32 }))
    if ((await readBalance()) === amount) {
      balanceSlotCache.set(token, slot)
      return
    }
    await writeCell(slot, previous ?? toHex(0n, { size: 32 }))
  }
  throw new Error(`could not locate the balance mapping slot for ${token}`)
}

/** The two-step Permit2 setup for `token`: ERC20 → Permit2, then Permit2 → MarginRouter. */
export async function ensurePermit2(ctx: Ctx, token: Address): Promise<void> {
  await send(ctx, {
    address: token,
    abi: erc20Abi,
    functionName: 'approve',
    args: [ctx.addresses.permit2, (1n << 256n) - 1n],
  })
  await send(
    ctx,
    permit2ApproveCall({
      permit2: ctx.addresses.permit2,
      token,
      spender: ctx.addresses.marginRouter,
      amount: MAX_UINT160,
    })
  )
}

export async function balanceOf(ctx: Ctx, token: Address, owner: Address): Promise<bigint> {
  return ctx.publicClient.readContract({ address: token, abi: erc20Abi, functionName: 'balanceOf', args: [owner] })
}

/** Morpho Blue on mainnet, the venue the demo's long market lives on. */
const MORPHO_BLUE: Address = '0xBBBBBbbBBb9cC5e90e3b3Af64bdAF62C37EEFFCb'

const MORPHO_SUPPLY_ABI = [
  {
    type: 'function',
    name: 'supply',
    stateMutability: 'nonpayable',
    inputs: [
      {
        name: 'marketParams',
        type: 'tuple',
        components: [
          { name: 'loanToken', type: 'address' },
          { name: 'collateralToken', type: 'address' },
          { name: 'oracle', type: 'address' },
          { name: 'irm', type: 'address' },
          { name: 'lltv', type: 'uint256' },
        ],
      },
      { name: 'assets', type: 'uint256' },
      { name: 'shares', type: 'uint256' },
      { name: 'onBehalf', type: 'address' },
      { name: 'data', type: 'bytes' },
    ],
    outputs: [
      { name: 'assetsSupplied', type: 'uint256' },
      { name: 'sharesSupplied', type: 'uint256' },
    ],
  },
] as const

/**
 * Aave v3 mainnet governance executor (level 1), a pool admin on the Aave v3 ACL manager (checked
 * live before use); impersonated on the fork to restore a risk parameter governance zeroed.
 */
const AAVE_V3_POOL_ADMIN: Address = '0x5300A1a15135EA4dc7aD5a167152C01EFc9b192A'

/** The USDC LTV the demo's Aave v3 shorts assume: the value before governance zeroed it in 2026-11. */
const AAVE_V3_USDC_LTV_BPS = 7500n

const AAVE_V3_POOL_ABI = [
  {
    type: 'function',
    name: 'ADDRESSES_PROVIDER',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'address' }],
  },
  {
    type: 'function',
    name: 'getConfiguration',
    stateMutability: 'view',
    inputs: [{ name: 'asset', type: 'address' }],
    outputs: [{ name: '', type: 'tuple', components: [{ name: 'data', type: 'uint256' }] }],
  },
] as const

const AAVE_V3_ADDRESSES_PROVIDER_ABI = [
  {
    type: 'function',
    name: 'getPoolConfigurator',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'address' }],
  },
  { type: 'function', name: 'getACLManager', stateMutability: 'view', inputs: [], outputs: [{ type: 'address' }] },
] as const

const AAVE_V3_ACL_MANAGER_ABI = [
  {
    type: 'function',
    name: 'isPoolAdmin',
    stateMutability: 'view',
    inputs: [{ name: 'admin', type: 'address' }],
    outputs: [{ type: 'bool' }],
  },
] as const

const AAVE_V3_POOL_CONFIGURATOR_ABI = [
  {
    type: 'function',
    name: 'configureReserveAsCollateral',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'asset', type: 'address' },
      { name: 'ltv', type: 'uint256' },
      { name: 'liquidationThreshold', type: 'uint256' },
      { name: 'liquidationBonus', type: 'uint256' },
    ],
    outputs: [],
  },
] as const

/**
 * Restores a nonzero LTV on the short market's collateral reserve in Aave v3 when governance has
 * zeroed it (an incident-response setting that keeps the liquidation threshold, so open positions
 * stay healthy while no new borrow can be opened against the asset). The demo shorts and the hedge
 * open exactly such a borrow, so the fork gets the pre-change LTV back from the impersonated pool
 * admin; the liquidation threshold and bonus are kept as read. A no-op while the LTV is nonzero.
 */
export async function restoreAaveV3Collateral(ctx: Ctx): Promise<void> {
  const adapter = ctx.addresses.lendingAdapters.aaveV3?.[0]
  if (!adapter) return
  const collateral = ctx.shortMarket.collateral
  const read = ctx.publicClient.readContract.bind(ctx.publicClient)
  const pool = await read({ address: adapter, abi: LENDING_ADAPTER_ABI, functionName: 'lendingProtocol' })
  const { data } = await read({
    address: pool,
    abi: AAVE_V3_POOL_ABI,
    functionName: 'getConfiguration',
    args: [collateral],
  })
  // reserve configuration bitmap: bits 0-15 LTV, 16-31 liquidation threshold, 32-47 liquidation bonus
  const ltv = data & 0xffffn
  if (ltv !== 0n) return
  const liquidationThreshold = (data >> 16n) & 0xffffn
  const liquidationBonus = (data >> 32n) & 0xffffn

  const provider = await read({ address: pool, abi: AAVE_V3_POOL_ABI, functionName: 'ADDRESSES_PROVIDER' })
  const configurator = await read({
    address: provider,
    abi: AAVE_V3_ADDRESSES_PROVIDER_ABI,
    functionName: 'getPoolConfigurator',
  })
  const aclManager = await read({
    address: provider,
    abi: AAVE_V3_ADDRESSES_PROVIDER_ABI,
    functionName: 'getACLManager',
  })
  const isAdmin = await read({
    address: aclManager,
    abi: AAVE_V3_ACL_MANAGER_ABI,
    functionName: 'isPoolAdmin',
    args: [AAVE_V3_POOL_ADMIN],
  })
  if (!isAdmin) throw new Error(`${AAVE_V3_POOL_ADMIN} is no longer an Aave v3 pool admin; update AAVE_V3_POOL_ADMIN`)

  await ctx.testClient.setBalance({ address: AAVE_V3_POOL_ADMIN, value: 10n ** 18n })
  const admin = createWalletClient({ chain: mainnet, transport: http(ctx.rpcUrl), account: AAVE_V3_POOL_ADMIN })
  const hash = await admin.writeContract({
    address: configurator,
    abi: AAVE_V3_POOL_CONFIGURATOR_ABI,
    functionName: 'configureReserveAsCollateral',
    args: [collateral, AAVE_V3_USDC_LTV_BPS, liquidationThreshold, liquidationBonus],
  })
  const receipt = await ctx.publicClient.waitForTransactionReceipt({ hash })
  if (receipt.status !== 'success') throw new Error('restoring the Aave v3 collateral LTV on the fork failed')
  note(`Aave v3 ${collateral} LTV restored to ${AAVE_V3_USDC_LTV_BPS} bps on the fork (governance has it at zero)`)
}

/**
 * Supplies `amount` of the long market's debt token into its Morpho Blue market from the deployer,
 * so the flows' leverage borrows never depend on how much idle liquidity the live market holds at
 * the fork block (Morpho reverts `insufficient liquidity` otherwise; the WETH/USDC 86% market held
 * about 1,000 idle USDC in November 2026). The deployer's token balance is left as it was.
 */
export async function seedMorphoLiquidity(ctx: Ctx, amount: bigint): Promise<void> {
  const { collateral, debt, data } = ctx.longMarket
  const { oracle, irm, lltv } = decodeMorphoMarketData(data)
  const before = await balanceOf(ctx, debt, ctx.deployer)
  await deal(ctx, debt, ctx.deployer, before + amount)
  await send(ctx, { address: debt, abi: erc20Abi, functionName: 'approve', args: [MORPHO_BLUE, amount] })
  await send(ctx, {
    address: MORPHO_BLUE,
    abi: MORPHO_SUPPLY_ABI,
    functionName: 'supply',
    args: [{ loanToken: debt, collateralToken: collateral, oracle, irm, lltv }, amount, 0n, ctx.deployer, '0x'],
  })
}

// ---------------------------------------------------------------------------
// Real quotes via the canonical mainnet v4 Quoter
// ---------------------------------------------------------------------------

const QUOTER_ABI = [
  {
    type: 'function',
    name: 'quoteExactOutputSingle',
    stateMutability: 'nonpayable',
    inputs: [
      {
        name: 'params',
        type: 'tuple',
        components: [
          {
            name: 'poolKey',
            type: 'tuple',
            components: [
              { name: 'currency0', type: 'address' },
              { name: 'currency1', type: 'address' },
              { name: 'fee', type: 'uint24' },
              { name: 'tickSpacing', type: 'int24' },
              { name: 'hooks', type: 'address' },
            ],
          },
          { name: 'zeroForOne', type: 'bool' },
          { name: 'exactAmount', type: 'uint128' },
          { name: 'hookData', type: 'bytes' },
        ],
      },
    ],
    outputs: [
      { name: 'amountIn', type: 'uint256' },
      { name: 'gasEstimate', type: 'uint256' },
    ],
  },
] as const

/**
 * Quotes the exact-output swap a margin flow performs — `input` is the currency sold (the
 * market's debt on an open, its collateral on a close/decrease) — and returns the quoted input
 * plus a slippage-buffered cap, the way the docs instruct integrators to derive `maxDebtIn` /
 * `maxCollateralIn` (from a quote, never spot).
 */
/**
 * The `zeroForOne` flag for selling `input` through the demo pool. On a native pool, ETH is
 * currency0 and stands for the market's WETH (the SDK's `swapZeroForOne` serves pools whose
 * currencies are the market pair itself).
 */
function demoZeroForOne(ctx: Ctx, market: Market, input: Address): boolean {
  if (isAddressEqual(ctx.poolKey.currency0, zeroAddress)) return isAddressEqual(input, ctx.weth)
  return swapZeroForOne(market, input, ctx.poolKey)
}

export async function quoteSwapInput(
  ctx: Ctx,
  market: Market,
  input: Address,
  exactOut: bigint,
  slippageBps: number
): Promise<{ quoted: bigint; capped: bigint; zeroForOne: boolean }> {
  const zeroForOne = demoZeroForOne(ctx, market, input)
  const { result } = await ctx.publicClient.simulateContract({
    address: V4_QUOTER,
    abi: QUOTER_ABI,
    functionName: 'quoteExactOutputSingle',
    args: [{ poolKey: ctx.poolKey, zeroForOne, exactAmount: exactOut, hookData: '0x' }],
  })
  const quoted = result[0]
  return { quoted, capped: withSlippageUp(quoted, slippageBps), zeroForOne }
}

/** A demo deadline 30 minutes past the fork head. */
export async function deadline(ctx: Ctx): Promise<bigint> {
  const block = await ctx.publicClient.getBlock()
  return block.timestamp + 1_800n
}

// ---------------------------------------------------------------------------
// Universal Router routes
// ---------------------------------------------------------------------------

/**
 * Builds the route fields a curated position call consumes: the single-pool v4 exact-output route
 * over the demo pool (buy `amountOut` of `output` with `input`, delivered to `recipient` — the
 * caller's MarginAccount) paired with the fork's Universal Router. Spread the result into
 * `IncreaseParams`/`DecreaseParams`.
 */
export function demoRoute(
  ctx: Ctx,
  p: { input: Address; output: Address; amountOut: bigint; maxIn: bigint; recipient: Address }
): { universalRouter: Address; routeCommands: Hex; routeInputs: Hex[] } {
  const { commands, inputs } = buildV4ExactOutRoute({
    poolKey: ctx.poolKey,
    input: p.input,
    output: p.output,
    amountOut: p.amountOut,
    amountInMaximum: p.maxIn,
    recipient: p.recipient,
    weth9: ctx.weth,
  })
  return { universalRouter: ctx.universalRouter, routeCommands: commands, routeInputs: inputs }
}
