import { Token } from '@uniswap/sdk-core'
import { Pool } from './pool'
import { Position } from './position'
import { EMPTY_HOOK, SQRT_PRICE_1_1, FeeAmount } from '../internalConstants'
import { Percent } from '@uniswap/sdk-core'
import JSBI from 'jsbi'

describe('Position', () => {
  const currency0 = new Token(1, '0x0000000000000000000000000000000000000001', 18, 't0', 'currency0')
  const currency1 = new Token(1, '0x0000000000000000000000000000000000000002', 18, 't1', 'currency1')
  const fee = FeeAmount.MEDIUM
  const tickSpacing = 60 // for MEDIUM
  const pool_0_1 = new Pool(currency0, currency1, fee, tickSpacing, EMPTY_HOOK, SQRT_PRICE_1_1.toString(), 0, 0, [])
  const slippageTolerance = new Percent(1, 100) // 1% slippage

  it('will bound the maximum amounts', () => {
    const position = new Position({
      pool: pool_0_1,
      liquidity: 1000000000000000000000000,
      tickLower: -180,
      tickUpper: 180,
    })
    const { amount0: initializedAmount0, amount1: initializedAmount1 } = position.mintAmounts

    const {amount0: adjustedAmount0, amount1: adjustedAmount1, liquidity: adjustedLiquidity} = position.maxAmountsAndLiquidityWithSlippage(slippageTolerance)

    expect(JSBI.lessThanOrEqual(adjustedAmount0, initializedAmount0)).toBe(true)
    expect(JSBI.lessThanOrEqual(adjustedAmount1, initializedAmount1)).toBe(true)
    expect(JSBI.lessThanOrEqual(adjustedLiquidity, position.liquidity)).toBe(true)
  })
})
