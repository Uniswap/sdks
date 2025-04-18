import { Token } from '@uniswap/sdk-core'
import { Pool } from './pool'
import { Position } from './position'
import { EMPTY_HOOK, SQRT_PRICE_1_1, FeeAmount, TICK_SPACING_TEN, ADDRESS_ZERO } from '../internalConstants'
import { Percent } from '@uniswap/sdk-core'
import JSBI from 'jsbi'
import { maxLiquidityForAmounts, nearestUsableTick, TickMath } from '@uniswap/v3-sdk'
import { encodeSqrtRatioX96 } from '@uniswap/v3-sdk'

describe('Position', () => {
  const currency0 = new Token(1, '0x0000000000000000000000000000000000000001', 18, 't0', 'currency0')
  const currency1 = new Token(1, '0x0000000000000000000000000000000000000002', 18, 't1', 'currency1')
  const fee = FeeAmount.MEDIUM
  const tickSpacing = 60 // for MEDIUM
  const pool_0_1 = new Pool(currency0, currency1, fee, tickSpacing, EMPTY_HOOK, SQRT_PRICE_1_1.toString(), 0, 0, [])
  const slippageTolerance = new Percent(1, 100) // 1% slippage

  describe('bounds the maximum amounts', () => {
    it('in range', () => {
      const position = new Position({
        pool: pool_0_1,
        liquidity: 100e18,
        tickLower: -180,
        tickUpper: 180,
      })
      const { amount0: initializedAmount0, amount1: initializedAmount1 } = position.mintAmounts

      const { amount0: adjustedAmount0, amount1: adjustedAmount1 } =
        position.maxAmountsAndLiquidityWithSlippage(slippageTolerance)

      expect(JSBI.lessThanOrEqual(adjustedAmount0, initializedAmount0)).toBe(true)
      expect(JSBI.lessThanOrEqual(adjustedAmount1, initializedAmount1)).toBe(true)
      expect(JSBI.equal(adjustedAmount0, initializedAmount0) || JSBI.equal(adjustedAmount1, initializedAmount1)).toBe(
        true
      )
    })

    it('below range', () => {
      const position = new Position({
        pool: pool_0_1,
        liquidity: 100e18,
        tickLower: -180,
        tickUpper: -60,
      })
      const { amount0: initializedAmount0, amount1: initializedAmount1 } = position.mintAmounts

      const { amount0: adjustedAmount0, amount1: adjustedAmount1 } =
        position.maxAmountsAndLiquidityWithSlippage(slippageTolerance)

      expect(JSBI.lessThanOrEqual(adjustedAmount0, initializedAmount0)).toBe(true)
      expect(JSBI.lessThanOrEqual(adjustedAmount1, initializedAmount1)).toBe(true)
      expect(JSBI.equal(adjustedAmount0, initializedAmount0) || JSBI.equal(adjustedAmount1, initializedAmount1)).toBe(
        true
      )
    })

    it('above range', () => {
      const position = new Position({
        pool: pool_0_1,
        liquidity: 100e18,
        tickLower: 60,
        tickUpper: 180,
      })
      const { amount0: initializedAmount0, amount1: initializedAmount1 } = position.mintAmounts

      const { amount0: adjustedAmount0, amount1: adjustedAmount1 } =
        position.maxAmountsAndLiquidityWithSlippage(slippageTolerance)

      expect(JSBI.lessThanOrEqual(adjustedAmount0, initializedAmount0)).toBe(true)
      expect(JSBI.lessThanOrEqual(adjustedAmount1, initializedAmount1)).toBe(true)
      expect(JSBI.equal(adjustedAmount0, initializedAmount0) || JSBI.equal(adjustedAmount1, initializedAmount1)).toBe(
        true
      )
    })
  })

  describe('#mintAmounts', () => {
    const USDC = new Token(1, '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', 6, 'USDC', 'USD Coin')
    const DAI = new Token(1, '0x6B175474E89094C44Da98b954EedeAC495271d0F', 18, 'DAI', 'DAI Stablecoin')

    const POOL_SQRT_RATIO_START = encodeSqrtRatioX96(100e6, 100e18)
    const POOL_TICK_CURRENT = TickMath.getTickAtSqrtRatio(POOL_SQRT_RATIO_START)
    const TICK_SPACING = TICK_SPACING_TEN

    const DAI_USDC_POOL = new Pool(
      DAI,
      USDC,
      500,
      TICK_SPACING,
      ADDRESS_ZERO,
      POOL_SQRT_RATIO_START,
      0,
      POOL_TICK_CURRENT,
      []
    )

    describe('0 slippage', () => {
      const slippageTolerance = new Percent(0)

      it('is correct for positions below', () => {
        // amount0: 49949961958869841738198
        // amount1: 0
        // calculate liquidity from amount0 and amount1
        const liquidity = maxLiquidityForAmounts(
          DAI_USDC_POOL.sqrtRatioX96,
          TickMath.getSqrtRatioAtTick(nearestUsableTick(POOL_TICK_CURRENT, TICK_SPACING) + TICK_SPACING),
          TickMath.getSqrtRatioAtTick(nearestUsableTick(POOL_TICK_CURRENT, TICK_SPACING) + TICK_SPACING * 2),
          '49949961958869841738198',
          '0',
          true
        )

        const position = new Position({
          pool: DAI_USDC_POOL,
          liquidity: liquidity,
          tickLower: nearestUsableTick(POOL_TICK_CURRENT, TICK_SPACING) + TICK_SPACING,
          tickUpper: nearestUsableTick(POOL_TICK_CURRENT, TICK_SPACING) + TICK_SPACING * 2,
        })

        const { amount0, amount1 } = position.getMintAmountsWithSlippage(slippageTolerance)

        expect(amount0.toString()).toEqual('49949961958869841738198')
        expect(amount1.toString()).toEqual('0')
      })

      it('is correct for positions above', () => {
        // amount0: 0
        // amount1: 49970077053
        // calculate liquidity from amount0 and amount1
        const liquidity = maxLiquidityForAmounts(
          DAI_USDC_POOL.sqrtRatioX96,
          TickMath.getSqrtRatioAtTick(nearestUsableTick(POOL_TICK_CURRENT, TICK_SPACING) - TICK_SPACING * 2),
          TickMath.getSqrtRatioAtTick(nearestUsableTick(POOL_TICK_CURRENT, TICK_SPACING) - TICK_SPACING),
          '0',
          '49970077053',
          true
        )

        const position = new Position({
          pool: DAI_USDC_POOL,
          liquidity: liquidity,
          tickLower: nearestUsableTick(POOL_TICK_CURRENT, TICK_SPACING) - TICK_SPACING * 2,
          tickUpper: nearestUsableTick(POOL_TICK_CURRENT, TICK_SPACING) - TICK_SPACING,
        })

        const { amount0, amount1 } = position.getMintAmountsWithSlippage(slippageTolerance)

        expect(amount0.toString()).toEqual('0')
        expect(amount1.toString()).toEqual('49970077053')
      })

      it('is correct for positions within', () => {
        // amount0: 120054069145287995740584
        // amount1: 79831926243
        // calculate liquidity from amount0 and amount1
        const liquidity = maxLiquidityForAmounts(
          DAI_USDC_POOL.sqrtRatioX96,
          TickMath.getSqrtRatioAtTick(nearestUsableTick(POOL_TICK_CURRENT, TICK_SPACING) - TICK_SPACING * 2),
          TickMath.getSqrtRatioAtTick(nearestUsableTick(POOL_TICK_CURRENT, TICK_SPACING) + TICK_SPACING * 2),
          '120054069145287995740584',
          '79831926243',
          true
        )

        const position = new Position({
          pool: DAI_USDC_POOL,
          liquidity: liquidity,
          tickLower: nearestUsableTick(POOL_TICK_CURRENT, TICK_SPACING) - TICK_SPACING * 2,
          tickUpper: nearestUsableTick(POOL_TICK_CURRENT, TICK_SPACING) + TICK_SPACING * 2,
        })

        const { amount0, amount1 } = position.getMintAmountsWithSlippage(slippageTolerance)

        expect(amount0.toString()).toEqual('120054069145287995740584')
        expect(amount1.toString()).toEqual('79831926243')
      })
    })
  })
})
