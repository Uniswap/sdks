import {
  type Abi,
  type Address,
  type Hex,
  type TransactionReceipt,
  encodeAbiParameters,
  erc20Abi,
  formatUnits,
  keccak256,
  parseEventLogs,
  toHex,
} from 'viem'

import { type Ctx, V4_QUOTER } from './env'
import {
  MARGIN_ROUTER_ABI,
  MAX_UINT160,
  type Market,
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
export async function quoteSwapInput(
  ctx: Ctx,
  market: Market,
  input: Address,
  exactOut: bigint,
  slippageBps: number
): Promise<{ quoted: bigint; capped: bigint; zeroForOne: boolean }> {
  const zeroForOne = swapZeroForOne(market, input, ctx.poolKey)
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
