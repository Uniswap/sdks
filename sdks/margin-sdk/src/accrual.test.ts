import { describe, expect, test } from 'bun:test'
import { type Address, type PublicClient, parseUnits } from 'viem'

import {
  type BorrowRateSample,
  blocksToSeconds,
  estimateInterestAccrual,
  measureBorrowRatePerSecond,
  projectDebt,
  sizeFullClose,
} from './accrual.js'
import { WAD } from './constants.js'
import { MarginSdkError } from './errors.js'

const ADAPTER: Address = '0x9A7f8F5A9496D3c9dc0BEEfb44cCaC17CAAF28fa'
const ACCOUNT: Address = '0x64487fb85302b5A2f38EF91144155986D331D2Fe'
const WETH: Address = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2'
const USDC: Address = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48'
const MARKET = { collateral: WETH, debt: USDC }

/** ~5% APR as a WAD per-second rate: 0.05e18 / 31_536_000. */
const FIVE_PCT_APR_PER_SECOND = parseUnits('0.05', 18) / 31_536_000n

describe('blocksToSeconds', () => {
  test('defaults to 12-second mainnet blocks', () => {
    expect(blocksToSeconds(10n)).toBe(120n)
    expect(blocksToSeconds(10n, 2n)).toBe(20n)
  })

  test('rejects negative blocks and non-positive block times', () => {
    expect(() => blocksToSeconds(-1n)).toThrow(MarginSdkError)
    expect(() => blocksToSeconds(1n, 0n)).toThrow(MarginSdkError)
  })
})

describe('estimateInterestAccrual / projectDebt', () => {
  test('hand-computed vector: 1e-9 per second over 1000s on 1e12 debt', () => {
    // x = 1e9 * 1000 = 1e12 (1e-6 WAD)
    // growth = x + x^2/(2 WAD) + x^3/(6 WAD^2) = 1e12 + 500_000 + 0
    // accrual = ceil(1e12 * 1_000_000_500_000 / 1e18) = ceil(1_000_000.5) = 1_000_001
    const accrual = estimateInterestAccrual({
      debtAmount: 10n ** 12n,
      ratePerSecondWad: 10n ** 9n,
      seconds: 1000n,
    })
    expect(accrual).toBe(1_000_001n)
    expect(projectDebt({ debtAmount: 10n ** 12n, ratePerSecondWad: 10n ** 9n, seconds: 1000n })).toBe(
      10n ** 12n + 1_000_001n
    )
  })

  test('zero rate, zero horizon, and zero debt accrue nothing', () => {
    expect(estimateInterestAccrual({ debtAmount: 10n ** 18n, ratePerSecondWad: 0n, seconds: 3600n })).toBe(0n)
    expect(estimateInterestAccrual({ debtAmount: 10n ** 18n, ratePerSecondWad: 10n ** 9n, seconds: 0n })).toBe(0n)
    expect(estimateInterestAccrual({ debtAmount: 0n, ratePerSecondWad: 10n ** 9n, seconds: 3600n })).toBe(0n)
  })

  test('rounds up so the buffer always covers', () => {
    // x = 1 wei of WAD growth on 1 wei of debt: ceil(1 * 1 / 1e18) = 1
    expect(estimateInterestAccrual({ debtAmount: 1n, ratePerSecondWad: 1n, seconds: 1n })).toBe(1n)
  })

  test('~5% APR over 10 mainnet blocks on 2800 USDC is a few wei, not bps', () => {
    const debt = parseUnits('2800', 6)
    const accrual = estimateInterestAccrual({
      debtAmount: debt,
      ratePerSecondWad: FIVE_PCT_APR_PER_SECOND,
      seconds: blocksToSeconds(10n),
    })
    // 2800e6 * 0.05 * 120 / 31_536_000 ≈ 533 wei of USDC (plus ceil)
    expect(accrual).toBeGreaterThanOrEqual(533n)
    expect(accrual).toBeLessThan(600n)
    // the flat 10 bps buffer for the same close would be 2_800_000 wei: three orders of magnitude more
    expect(accrual * 1000n).toBeLessThan((debt * 10n) / 10_000n)
  })

  test('compounding stays within dust of linear on realistic horizons', () => {
    const debt = parseUnits('1000000', 6) // 1M USDC
    const seconds = 3600n // a very generous inclusion horizon
    const accrual = estimateInterestAccrual({ debtAmount: debt, ratePerSecondWad: FIVE_PCT_APR_PER_SECOND, seconds })
    const linear = (debt * FIVE_PCT_APR_PER_SECOND * seconds) / WAD
    // the compounding premium is x^2/2 of the linear term plus ceil rounding: ~17 wei of USDC
    // here, i.e. dust in value even at 1M debt over a full hour
    expect(accrual - linear).toBeGreaterThan(0n)
    expect(accrual - linear).toBeLessThan(25n)
  })

  test('rejects negative inputs', () => {
    expect(() => estimateInterestAccrual({ debtAmount: -1n, ratePerSecondWad: 0n, seconds: 0n })).toThrow(
      MarginSdkError
    )
    expect(() => estimateInterestAccrual({ debtAmount: 0n, ratePerSecondWad: -1n, seconds: 0n })).toThrow(
      MarginSdkError
    )
    expect(() => estimateInterestAccrual({ debtAmount: 0n, ratePerSecondWad: 0n, seconds: -1n })).toThrow(
      MarginSdkError
    )
  })
})

describe('measureBorrowRatePerSecond', () => {
  /** A stub client: latest block 164 @ t=1768, lookback block @ t=1000, debt grows 1e9 → 1.0001e9. */
  function stubClient(p?: { debtBefore?: bigint; debtAfter?: bigint; fromTimestamp?: bigint }): PublicClient {
    const debtBefore = p?.debtBefore ?? 1_000_000_000n
    const debtAfter = p?.debtAfter ?? 1_000_100_000n
    return {
      getBlock: async (args?: { blockNumber?: bigint }) =>
        args?.blockNumber !== undefined
          ? { number: args.blockNumber, timestamp: p?.fromTimestamp ?? 1_000n }
          : { number: 164n, timestamp: 1_768n },
      readContract: async (args: { blockNumber?: bigint }) => [
        5n * 10n ** 18n,
        args.blockNumber === 100n ? debtBefore : debtAfter,
      ],
    } as unknown as PublicClient
  }

  test('derives the realized per-second rate from two positionOf samples', async () => {
    const sample: BorrowRateSample = await measureBorrowRatePerSecond(stubClient(), {
      adapter: ADAPTER,
      account: ACCOUNT,
      market: MARKET,
    })
    // (1_000_100_000 - 1_000_000_000) * 1e18 / (1_000_000_000 * 768)
    expect(sample.ratePerSecondWad).toBe((100_000n * WAD) / (1_000_000_000n * 768n))
    expect(sample.elapsedSeconds).toBe(768n)
    expect(sample.fromBlock).toBe(100n)
    expect(sample.toBlock).toBe(164n)
    expect(sample.debtBefore).toBe(1_000_000_000n)
    expect(sample.debtAfter).toBe(1_000_100_000n)
  })

  test('throws when the position had no debt at the lookback block', async () => {
    expect(
      measureBorrowRatePerSecond(stubClient({ debtBefore: 0n }), { adapter: ADAPTER, account: ACCOUNT, market: MARKET })
    ).rejects.toThrow(/shrink lookbackBlocks/)
  })

  test('throws when debt decreased across the window (repay inside it)', async () => {
    expect(
      measureBorrowRatePerSecond(stubClient({ debtBefore: 2_000_000_000n }), {
        adapter: ADAPTER,
        account: ACCOUNT,
        market: MARKET,
      })
    ).rejects.toThrow(/repay landed inside/)
  })

  test('throws when the sampled blocks share a timestamp', async () => {
    expect(
      measureBorrowRatePerSecond(stubClient({ fromTimestamp: 1_768n }), {
        adapter: ADAPTER,
        account: ACCOUNT,
        market: MARKET,
      })
    ).rejects.toThrow(/increase lookbackBlocks/)
  })

  test('rejects a non-positive or too-deep lookback', async () => {
    const client = stubClient()
    expect(
      measureBorrowRatePerSecond(client, { adapter: ADAPTER, account: ACCOUNT, market: MARKET, lookbackBlocks: 0n })
    ).rejects.toThrow(MarginSdkError)
    expect(
      measureBorrowRatePerSecond(client, { adapter: ADAPTER, account: ACCOUNT, market: MARKET, lookbackBlocks: 200n })
    ).rejects.toThrow(/below block 0/)
  })
})

describe('sizeFullClose', () => {
  const base = {
    debtAmount: parseUnits('2800', 6),
    ratePerSecondWad: FIVE_PCT_APR_PER_SECOND,
    horizonBlocks: 10n,
    priceCollateralPerDebtToken: parseUnits('0.00025', 18), // 1 USDC = 0.00025 WETH (4000 USDC/WETH)
    debtDecimals: 6,
    slippageBps: 50,
  }

  test('separates the accrual buffer from the swap-slippage cap', () => {
    const { debtToBuy, maxCollateralIn, accrualBuffer } = sizeFullClose(base)
    // buffer = projected accrual (~534 wei) + 1 bps of the projection (~280_000 wei)
    expect(accrualBuffer).toBe(debtToBuy - base.debtAmount)
    expect(debtToBuy).toBeGreaterThan(base.debtAmount)
    // an order of magnitude tighter than the old flat 10 bps on the debt
    expect(accrualBuffer).toBeLessThan((base.debtAmount * 10n) / 10_000n / 5n)
    // the collateral cap carries the full swap-slippage headroom
    const quotedAtDebt = (debtToBuy * base.priceCollateralPerDebtToken) / 10n ** 6n
    expect(maxCollateralIn).toBe((quotedAtDebt * 10_050n) / 10_000n)
  })

  test('extraBufferBps 0 leaves only the projected accrual', () => {
    const { accrualBuffer } = sizeFullClose({ ...base, extraBufferBps: 0 })
    expect(accrualBuffer).toBeGreaterThanOrEqual(533n)
    expect(accrualBuffer).toBeLessThan(600n)
  })

  test('rejects a zero-debt close (swap-free path needs no route)', () => {
    expect(() => sizeFullClose({ ...base, debtAmount: 0n })).toThrow(MarginSdkError)
  })
})
