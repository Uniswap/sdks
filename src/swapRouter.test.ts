import { BigintIsh, CurrencyAmount, Percent, Token, TradeType } from '@uniswap/sdk-core'
import { Pair, Route as V2Route, Trade as V2Trade } from '@uniswap/v2-sdk'
import {
  encodeSqrtRatioX96,
  FeeAmount,
  nearestUsableTick,
  Pool,
  Route as V3Route,
  TickMath,
  TICK_SPACINGS,
  Trade as V3Trade,
} from '@uniswap/v3-sdk'
import JSBI from 'jsbi'
import { SwapRouter, Trade } from '.'

describe('SwapRouter', () => {
  // const ETHER = Ether.onChain(1)
  const token0 = new Token(1, '0x0000000000000000000000000000000000000001', 18, 't0', 'token0')
  const token1 = new Token(1, '0x0000000000000000000000000000000000000002', 18, 't1', 'token1')
  // const token2 = new Token(1, '0x0000000000000000000000000000000000000003', 18, 't2', 'token2')
  // const token3 = new Token(1, '0x0000000000000000000000000000000000000004', 18, 't3', 'token3')

  const feeAmount = FeeAmount.MEDIUM
  const sqrtRatioX96 = encodeSqrtRatioX96(1, 1)
  const liquidity = 1_000_000
  // const WETH = WETH9[1]

  // v3
  const makePool = (token0: Token, token1: Token) => {
    return new Pool(token0, token1, feeAmount, sqrtRatioX96, liquidity, TickMath.getTickAtSqrtRatio(sqrtRatioX96), [
      {
        index: nearestUsableTick(TickMath.MIN_TICK, TICK_SPACINGS[feeAmount]),
        liquidityNet: liquidity,
        liquidityGross: liquidity,
      },
      {
        index: nearestUsableTick(TickMath.MAX_TICK, TICK_SPACINGS[feeAmount]),
        liquidityNet: -liquidity,
        liquidityGross: liquidity,
      },
    ])
  }

  // v2
  const makePair = (token0: Token, token1: Token, liquidity: BigintIsh) => {
    const amount0 = CurrencyAmount.fromRawAmount(token0, JSBI.BigInt(liquidity))
    const amount1 = CurrencyAmount.fromRawAmount(token1, JSBI.BigInt(liquidity))

    return new Pair(amount0, amount1)
  }

  const pool_0_1 = makePool(token0, token1)
  const pair_0_1 = makePair(token0, token1, liquidity)

  const slippageTolerance = new Percent(1, 100)
  const recipient = '0x0000000000000000000000000000000000000003'
  const deadline = 123

  describe('#swapCallParameters', () => {
    describe('different trade configurations result in identical calldata', () => {
      const expectedCalldata =
        '0x5ae401dc000000000000000000000000000000000000000000000000000000000000007b00000000000000000000000000000000000000000000000000000000000000400000000000000000000000000000000000000000000000000000000000000003000000000000000000000000000000000000000000000000000000000000006000000000000000000000000000000000000000000000000000000000000001a000000000000000000000000000000000000000000000000000000000000002e00000000000000000000000000000000000000000000000000000000000000104c5f4f6130000000000000000000000000000000000000000000000000000000000000064000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000a0000000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000002000000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000000000000000000000000000000020000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000001043176887e000000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000000000000000000000000000000020000000000000000000000000000000000000000000000000000000000000bb800000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000000000000000064000000000000000000000000000000000000000000000000000000000000006100000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000064df2ab5bb000000000000000000000000000000000000000000000000000000000000000200000000000000000000000000000000000000000000000000000000000000c3000000000000000000000000000000000000000000000000000000000000000300000000000000000000000000000000000000000000000000000000'
      const amountIn = CurrencyAmount.fromRawAmount(token0, JSBI.BigInt(100))

      const v2Trade = V2Trade.exactIn(new V2Route([pair_0_1], token0, token1), amountIn)
      const v3Trade = V3Trade.fromRoute(new V3Route([pool_0_1], token0, token1), amountIn, TradeType.EXACT_INPUT)

      it('array of trades', async () => {
        const trades = [v2Trade, await v3Trade]
        const { calldata, value } = SwapRouter.swapCallParameters(trades, {
          slippageTolerance,
          recipient,
          deadlineOrPreviousBlockhash: deadline,
        })
        expect(calldata).toEqual(expectedCalldata)
        expect(value).toBe('0x00')
      })

      it('meta-trade', async () => {
        const trades = await Trade.fromRoutes(
          [
            {
              routev2: v2Trade.route,
              amount: amountIn,
            },
          ],
          [
            {
              routev3: (await v3Trade).swaps[0].route,
              amount: amountIn,
            },
          ],
          TradeType.EXACT_INPUT
        )

        const { calldata, value } = SwapRouter.swapCallParameters(trades, {
          slippageTolerance,
          recipient,
          deadlineOrPreviousBlockhash: deadline,
        })
        expect(calldata).toEqual(expectedCalldata)
        expect(value).toBe('0x00')
      })
    })
  })
})
