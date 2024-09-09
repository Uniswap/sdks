import { Percent, Token, CurrencyAmount, WETH9, Ether } from '@uniswap/sdk-core'
import { FeeAmount, TICK_SPACINGS } from './internalConstants'
import { Pool } from './entities/pool'
import { Position } from './entities/position'
import { V4PositionManager } from './PositionManager'
import { encodeSqrtRatioX96 } from './utils/encodeSqrtRatioX96'
import { Multicall } from './multicall'
import { ActionType, encodeAction } from './utils/actions'

describe('V4 Position Manager', () => {
  const token0 = new Token(1, '0x0000000000000000000000000000000000000001', 18, 't0', 'token0')
  const token1 = new Token(1, '0x0000000000000000000000000000000000000002', 18, 't1', 'token1')

  const fee = FeeAmount.MEDIUM
  const tickSpacing = 60 // for MEDIUM

  const pool_0_1 = new Pool(
    token0,
    token1,
    fee,
    tickSpacing,
    '0x0000000000000000000000000000000000000000',
    encodeSqrtRatioX96(1, 1).toString(),
    0,
    0,
    []
  )
  const pool_1_weth = new Pool(
    token1,
    WETH9[1],
    fee,
    tickSpacing,
    '0x0000000000000000000000000000000000000000',
    encodeSqrtRatioX96(1, 1).toString(),
    0,
    0,
    []
  )

  const recipient = '0x0000000000000000000000000000000000000003'
  const sender = '0x0000000000000000000000000000000000000004'
  const tokenId = 1
  const slippageTolerance = new Percent(1, 100)
  const deadline = 123

  describe('#initializeCallParameters', () => {
    it('succeeds', () => {
      const { calldata, value } = V4PositionManager.initializeCallParameters(pool_0_1.poolKey, 0)

      /**
       * 1) "initializePool((address,address,uint24,int24,address),uint160,bytes)"
            (0x0000000000000000000000000000000000000001, 0x0000000000000000000000000000000000000002, 3000, 60, 0x0000000000000000000000000000000000000000)
            0
            0x00
       */
      expect(calldata).toEqual(
        '0x3b1fda97000000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000000000000000000000000000000020000000000000000000000000000000000000000000000000000000000000bb8000000000000000000000000000000000000000000000000000000000000003c0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000e00000000000000000000000000000000000000000000000000000000000000000'
      )
      expect(value).toEqual('0x00')
    })
  })

  describe('#addCallParameters', () => {
    it('throws if liquidity is 0', () => {
      expect(() =>
        V4PositionManager.addCallParameters(
          new Position({
            pool: pool_0_1,
            tickLower: -TICK_SPACINGS[FeeAmount.MEDIUM],
            tickUpper: TICK_SPACINGS[FeeAmount.MEDIUM],
            liquidity: 0,
          }),
          { recipient, slippageTolerance, deadline }
        )
      ).toThrow('ZERO_LIQUIDITY')
    })

    // TODO: throws if pool involves ETH but useNative is not used

    it('succeeds for mint', () => {
      const { calldata, value } = V4PositionManager.addCallParameters(
        new Position({
          pool: pool_0_1,
          tickLower: -TICK_SPACINGS[FeeAmount.MEDIUM],
          tickUpper: TICK_SPACINGS[FeeAmount.MEDIUM],
          liquidity: 1,
        }),
        { recipient, slippageTolerance, deadline }
      )

      const calldatas = Multicall.decodeMulticall(calldata)
      // Expect mint position to be called correctly
      expect(calldatas[0]).toEqual(
        encodeAction(ActionType.MINT_POSITION, [
          pool_0_1.poolKey,
          -TICK_SPACINGS[FeeAmount.MEDIUM],
          TICK_SPACINGS[FeeAmount.MEDIUM],
          1,
          0,
          0,
          recipient,
          '0x',
        ]).encodedInput
      )
      // Expect there to be a settle pair call afterwards
      expect(calldatas[1]).toEqual(
        encodeAction(ActionType.SETTLE_PAIR, [pool_0_1.token0.wrapped.address, pool_0_1.token1.wrapped.address])
          .encodedInput
      )
      expect(value).toEqual('0x00')
    })

    it('succeeds for increase', () => {
      const { calldata, value } = V4PositionManager.addCallParameters(
        new Position({
          pool: pool_0_1,
          tickLower: -TICK_SPACINGS[FeeAmount.MEDIUM],
          tickUpper: TICK_SPACINGS[FeeAmount.MEDIUM],
          liquidity: 1,
        }),
        { tokenId, slippageTolerance, deadline }
      )

      const calldatas = Multicall.decodeMulticall(calldata)
      // Expect increase liquidity to be called correctly
      expect(calldatas[0]).toEqual(encodeAction(ActionType.INCREASE_LIQUIDITY, [tokenId, 1, 0, 0, '0x']).encodedInput)
      // Expect there to be a settle pair call afterwards
      expect(calldatas[1]).toEqual(
        encodeAction(ActionType.SETTLE_PAIR, [pool_0_1.token0.wrapped.address, pool_0_1.token1.wrapped.address])
          .encodedInput
      )

      expect(value).toEqual('0x00')
    })

    it('createPool initializes pool if does not exist', () => {
      const { calldata, value } = V4PositionManager.addCallParameters(
        new Position({
          pool: pool_0_1,
          tickLower: -TICK_SPACINGS[FeeAmount.MEDIUM],
          tickUpper: TICK_SPACINGS[FeeAmount.MEDIUM],
          liquidity: 1,
        }),
        { recipient, slippageTolerance, deadline, createPool: true, sqrtPriceX96: 0 }
      )

      const calldatas = Multicall.decodeMulticall(calldata)
      // Expect initializePool to be called correctly
      expect(calldatas[0]).toEqual(
        // from initialize pool above
        '0x3b1fda97000000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000000000000000000000000000000020000000000000000000000000000000000000000000000000000000000000bb8000000000000000000000000000000000000000000000000000000000000003c0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000e00000000000000000000000000000000000000000000000000000000000000000'
      )
      // Expect position to be minted correctly
      expect(calldatas[1]).toEqual(
        encodeAction(ActionType.MINT_POSITION, [
          pool_0_1.poolKey,
          -TICK_SPACINGS[FeeAmount.MEDIUM],
          TICK_SPACINGS[FeeAmount.MEDIUM],
          1,
          0,
          0,
          recipient,
          '0x',
        ]).encodedInput
      )
      // Expect there to be a settle pair call afterwards
      expect(calldatas[2]).toEqual(
        encodeAction(ActionType.SETTLE_PAIR, [pool_0_1.token0.wrapped.address, pool_0_1.token1.wrapped.address])
          .encodedInput
      )

      expect(value).toEqual('0x00')
    })
  })

  describe('#collectCallParameters', () => {
    it('works', () => {
      const { calldata, value } = V4PositionManager.collectCallParameters({
        tokenId,
        expectedCurrencyOwed0: CurrencyAmount.fromRawAmount(token0, 0),
        expectedCurrencyOwed1: CurrencyAmount.fromRawAmount(token1, 0),
        recipient,
        slippageTolerance: new Percent(1),
      })

      const calldatas = Multicall.decodeMulticall(calldata)
      // Expect decrease liquidity to be called correctly with 0 amounts
      expect(calldatas[0]).toEqual(encodeAction(ActionType.DECREASE_LIQUIDITY, [tokenId, 0, 0, 0, '0x']).encodedInput)
      // Expect take pair to be called correctly
      expect(calldatas[1]).toEqual(
        encodeAction(ActionType.TAKE_PAIR, [
          pool_0_1.token0.wrapped.address,
          pool_0_1.token1.wrapped.address,
          recipient,
        ]).encodedInput
      )
      expect(value).toEqual('0x00')
    })

    // TODO: test with ETH
  })

  describe('#removeCallParameters', () => {
    it('throws for 0 liquidity', () => {
      expect(() =>
        V4PositionManager.removeCallParameters(
          new Position({
            pool: pool_0_1,
            tickLower: -TICK_SPACINGS[FeeAmount.MEDIUM],
            tickUpper: TICK_SPACINGS[FeeAmount.MEDIUM],
            liquidity: 0,
          }),
          {
            tokenId,
            liquidityPercentage: new Percent(1),
            slippageTolerance,
            deadline,
            collectOptions: {
              expectedCurrencyOwed0: CurrencyAmount.fromRawAmount(token0, 0),
              expectedCurrencyOwed1: CurrencyAmount.fromRawAmount(token1, 0),
              recipient,
            },
          }
        )
      ).toThrow('ZERO_LIQUIDITY')
    })

    it('throws for 0 liquidity from small percentage', () => {
      expect(() =>
        V4PositionManager.removeCallParameters(
          new Position({
            pool: pool_0_1,
            tickLower: -TICK_SPACINGS[FeeAmount.MEDIUM],
            tickUpper: TICK_SPACINGS[FeeAmount.MEDIUM],
            liquidity: 50,
          }),
          {
            tokenId,
            liquidityPercentage: new Percent(1, 100),
            slippageTolerance,
            deadline,
            collectOptions: {
              expectedCurrencyOwed0: CurrencyAmount.fromRawAmount(token0, 0),
              expectedCurrencyOwed1: CurrencyAmount.fromRawAmount(token1, 0),
              recipient,
            },
          }
        )
      ).toThrow('ZERO_LIQUIDITY')
    })

    it('throws for bad burn', () => {
      expect(() =>
        V4PositionManager.removeCallParameters(
          new Position({
            pool: pool_0_1,
            tickLower: -TICK_SPACINGS[FeeAmount.MEDIUM],
            tickUpper: TICK_SPACINGS[FeeAmount.MEDIUM],
            liquidity: 50,
          }),
          {
            tokenId,
            liquidityPercentage: new Percent(99, 100),
            slippageTolerance,
            deadline,
            burnToken: true,
            collectOptions: {
              expectedCurrencyOwed0: CurrencyAmount.fromRawAmount(token0, 0),
              expectedCurrencyOwed1: CurrencyAmount.fromRawAmount(token1, 0),
              recipient,
            },
          }
        )
      ).toThrow('CANNOT_BURN')
    })

    it('works', () => {
      const { calldata, value } = V4PositionManager.removeCallParameters(
        new Position({
          pool: pool_0_1,
          tickLower: -TICK_SPACINGS[FeeAmount.MEDIUM],
          tickUpper: TICK_SPACINGS[FeeAmount.MEDIUM],
          liquidity: 100,
        }),
        {
          tokenId,
          liquidityPercentage: new Percent(1),
          slippageTolerance,
          deadline,
          collectOptions: {
            expectedCurrencyOwed0: CurrencyAmount.fromRawAmount(token0, 0),
            expectedCurrencyOwed1: CurrencyAmount.fromRawAmount(token1, 0),
            recipient,
          },
        }
      )

      const calldatas = Multicall.decodeMulticall(calldata)
      expect(calldatas.length).toEqual(3)
      // Expect decrease liquidity to be called correctly with amounts
      expect(calldatas[0]).toEqual(encodeAction(ActionType.DECREASE_LIQUIDITY, [tokenId, 100, 0, 0, '0x']).encodedInput)
      // Expect take pair to be called correctly
      expect(calldatas[1]).toEqual(
        encodeAction(ActionType.TAKE_PAIR, [
          pool_0_1.token0.wrapped.address,
          pool_0_1.token1.wrapped.address,
          recipient,
        ]).encodedInput
      )
      expect(calldatas[2]).toEqual(encodeAction(ActionType.BURN_POSITION, [tokenId, 0, 0, '0x']).encodedInput)

      expect(value).toEqual('0x00')
    })

    it('works for partial', () => {
      const { calldata, value } = V4PositionManager.removeCallParameters(
        new Position({
          pool: pool_0_1,
          tickLower: -TICK_SPACINGS[FeeAmount.MEDIUM],
          tickUpper: TICK_SPACINGS[FeeAmount.MEDIUM],
          liquidity: 100,
        }),
        {
          tokenId,
          liquidityPercentage: new Percent(1, 2),
          slippageTolerance,
          deadline,
          collectOptions: {
            expectedCurrencyOwed0: CurrencyAmount.fromRawAmount(token0, 0),
            expectedCurrencyOwed1: CurrencyAmount.fromRawAmount(token1, 0),
            recipient,
          },
        }
      )

      expect(calldata).toEqual(
        '0xac9650d8000000000000000000000000000000000000000000000000000000000000002000000000000000000000000000000000000000000000000000000000000000020000000000000000000000000000000000000000000000000000000000000040000000000000000000000000000000000000000000000000000000000000012000000000000000000000000000000000000000000000000000000000000000a40c49ccbe0000000000000000000000000000000000000000000000000000000000000001000000000000000000000000000000000000000000000000000000000000003200000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000007b000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000084fc6f78650000000000000000000000000000000000000000000000000000000000000001000000000000000000000000000000000000000000000000000000000000000300000000000000000000000000000000ffffffffffffffffffffffffffffffff00000000000000000000000000000000ffffffffffffffffffffffffffffffff00000000000000000000000000000000000000000000000000000000'
      )
      expect(value).toEqual('0x00')
    })

    it('works with eth', () => {
      const ethAmount = CurrencyAmount.fromRawAmount(Ether.onChain(1), 0)
      const tokenAmount = CurrencyAmount.fromRawAmount(token1, 0)

      const { calldata, value } = V4PositionManager.removeCallParameters(
        new Position({
          pool: pool_1_weth,
          tickLower: -TICK_SPACINGS[FeeAmount.MEDIUM],
          tickUpper: TICK_SPACINGS[FeeAmount.MEDIUM],
          liquidity: 100,
        }),
        {
          tokenId,
          liquidityPercentage: new Percent(1),
          slippageTolerance,
          deadline,
          collectOptions: {
            expectedCurrencyOwed0: pool_1_weth.token0.equals(token1) ? tokenAmount : ethAmount,
            expectedCurrencyOwed1: pool_1_weth.token0.equals(token1) ? ethAmount : tokenAmount,
            recipient,
          },
        }
      )

      expect(calldata).toEqual(
        '0xac9650d80000000000000000000000000000000000000000000000000000000000000020000000000000000000000000000000000000000000000000000000000000000400000000000000000000000000000000000000000000000000000000000000800000000000000000000000000000000000000000000000000000000000000160000000000000000000000000000000000000000000000000000000000000022000000000000000000000000000000000000000000000000000000000000002a000000000000000000000000000000000000000000000000000000000000000a40c49ccbe0000000000000000000000000000000000000000000000000000000000000001000000000000000000000000000000000000000000000000000000000000006400000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000007b000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000084fc6f78650000000000000000000000000000000000000000000000000000000000000001000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000ffffffffffffffffffffffffffffffff00000000000000000000000000000000ffffffffffffffffffffffffffffffff00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000004449404b7c00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000003000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000064df2ab5bb00000000000000000000000000000000000000000000000000000000000000020000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000300000000000000000000000000000000000000000000000000000000'
      )
      expect(value).toEqual('0x00')
    })

    it('works for partial with eth', () => {
      const ethAmount = CurrencyAmount.fromRawAmount(Ether.onChain(1), 0)
      const tokenAmount = CurrencyAmount.fromRawAmount(token1, 0)

      const { calldata, value } = V4PositionManager.removeCallParameters(
        new Position({
          pool: pool_1_weth,
          tickLower: -TICK_SPACINGS[FeeAmount.MEDIUM],
          tickUpper: TICK_SPACINGS[FeeAmount.MEDIUM],
          liquidity: 100,
        }),
        {
          tokenId,
          liquidityPercentage: new Percent(1, 2),
          slippageTolerance,
          deadline,
          collectOptions: {
            expectedCurrencyOwed0: pool_1_weth.token0.equals(token1) ? tokenAmount : ethAmount,
            expectedCurrencyOwed1: pool_1_weth.token0.equals(token1) ? ethAmount : tokenAmount,
            recipient,
          },
        }
      )

      expect(calldata).toEqual(
        '0xac9650d80000000000000000000000000000000000000000000000000000000000000020000000000000000000000000000000000000000000000000000000000000000400000000000000000000000000000000000000000000000000000000000000800000000000000000000000000000000000000000000000000000000000000160000000000000000000000000000000000000000000000000000000000000022000000000000000000000000000000000000000000000000000000000000002a000000000000000000000000000000000000000000000000000000000000000a40c49ccbe0000000000000000000000000000000000000000000000000000000000000001000000000000000000000000000000000000000000000000000000000000003200000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000007b000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000084fc6f78650000000000000000000000000000000000000000000000000000000000000001000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000ffffffffffffffffffffffffffffffff00000000000000000000000000000000ffffffffffffffffffffffffffffffff00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000004449404b7c00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000003000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000064df2ab5bb00000000000000000000000000000000000000000000000000000000000000020000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000300000000000000000000000000000000000000000000000000000000'
      )
      expect(value).toEqual('0x00')
    })
  })
  describe('#transferFromParams', () => {
    it('succeeds', () => {
      const options = {
        sender,
        recipient,
        tokenId,
      }
      const { calldata, value } = V4PositionManager.transferFromParameters(options)

      expect(calldata).toEqual(
        '0x23b872dd000000000000000000000000000000000000000000000000000000000000000400000000000000000000000000000000000000000000000000000000000000030000000000000000000000000000000000000000000000000000000000000001'
      )
      expect(value).toEqual('0x00')
    })
  })
})
