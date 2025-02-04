import { Ether, Percent, Token } from '@uniswap/sdk-core'
import { ethers } from 'ethers'
import {
  EMPTY_BYTES,
  EMPTY_HOOK,
  FeeAmount,
  CANNOT_BURN,
  NATIVE_NOT_SET,
  OPEN_DELTA,
  SQRT_PRICE_1_1,
  TICK_SPACINGS,
  ZERO_LIQUIDITY,
  PositionFunctions,
} from './internalConstants'
import { Pool } from './entities/pool'
import { Position } from './entities/position'
import { BatchPermitOptions, CollectOptions, RemoveLiquidityOptions, V4PositionManager } from './PositionManager'
import { Multicall } from './multicall'
import { Actions, toHex, V4Planner } from './utils'
import { PoolKey } from './entities/pool'
import { toAddress } from './utils/currencyMap'
import { MSG_SENDER } from './actionConstants'
import { V4PositionPlanner } from './utils'

describe('PositionManager', () => {
  const currency0 = new Token(1, '0x0000000000000000000000000000000000000001', 18, 't0', 'currency0')
  const currency1 = new Token(1, '0x0000000000000000000000000000000000000002', 18, 't1', 'currency1')
  const currency_native = Ether.onChain(1)

  const fee = FeeAmount.MEDIUM
  const tickSpacing = 60 // for MEDIUM

  const pool_key_0_1 = Pool.getPoolKey(currency0, currency1, fee, tickSpacing, EMPTY_HOOK)

  const pool_0_1 = new Pool(currency0, currency1, fee, tickSpacing, EMPTY_HOOK, SQRT_PRICE_1_1.toString(), 0, 0, [])

  const pool_1_eth = new Pool(
    currency_native,
    currency1,
    fee,
    tickSpacing,
    EMPTY_HOOK,
    SQRT_PRICE_1_1.toString(),
    0,
    0,
    []
  )

  const tokenId = 1
  const slippageTolerance = new Percent(1, 100)
  const deadline = 123

  const mockOwner = '0x000000000000000000000000000000000000000a'
  const mockSpender = '0x000000000000000000000000000000000000000b'
  const recipient = '0x000000000000000000000000000000000000000c'
  const mockBytes32 = '0x0000000000000000000000000000000000000000000000000000000000000000'

  let planner: V4Planner

  beforeEach(() => {
    planner = new V4Planner()
  })

  describe('#createCallParameters', () => {
    it('succeeds', () => {
      const { calldata, value } = V4PositionManager.createCallParameters(pool_key_0_1, SQRT_PRICE_1_1)
      /**
       * 1) "initializePool((address,address,uint24,int24,address),uint160,bytes)"
            (0x0000000000000000000000000000000000000001, 0x0000000000000000000000000000000000000002, 3000, 60, 0x0000000000000000000000000000000000000000)
            79228162514264337593543950336
       */
      expect(calldata).toEqual(
        '0xf7020405000000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000000000000000000000000000000020000000000000000000000000000000000000000000000000000000000000bb8000000000000000000000000000000000000000000000000000000000000003c00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000001000000000000000000000000'
      )
      expect(value).toEqual('0x00')
    })

    it('succeeds with nonzero hook', () => {
      let hook = '0x1100000000000000000000000000000000002401'
      let poolKey: PoolKey = Pool.getPoolKey(currency0, currency1, fee, tickSpacing, hook)

      const { calldata, value } = V4PositionManager.createCallParameters(poolKey, SQRT_PRICE_1_1)
      /**
       * 1) "initializePool((address,address,uint24,int24,address),uint160,bytes)"
            (0x0000000000000000000000000000000000000001, 0x0000000000000000000000000000000000000002, 3000, 60, 0x1100000000000000000000000000000000002401)
            79228162514264337593543950336
       */
      expect(calldata).toEqual(
        '0xf7020405000000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000000000000000000000000000000020000000000000000000000000000000000000000000000000000000000000bb8000000000000000000000000000000000000000000000000000000000000003c00000000000000000000000011000000000000000000000000000000000024010000000000000000000000000000000000000001000000000000000000000000'
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

    it('throws if pool does not involve ether and useNative is set', () => {
      expect(() =>
        V4PositionManager.addCallParameters(
          new Position({
            pool: pool_0_1,
            tickLower: -TICK_SPACINGS[FeeAmount.MEDIUM],
            tickUpper: TICK_SPACINGS[FeeAmount.MEDIUM],
            liquidity: 8888888,
          }),
          { recipient, slippageTolerance, deadline, useNative: currency_native }
        )
      ).toThrow(NATIVE_NOT_SET)
    })

    it('throws if pool involves ether and useNative is not set', () => {
      expect(() =>
        V4PositionManager.addCallParameters(
          new Position({
            pool: pool_1_eth,
            tickLower: -TICK_SPACINGS[FeeAmount.MEDIUM],
            tickUpper: TICK_SPACINGS[FeeAmount.MEDIUM],
            liquidity: 8888888,
          }),
          { recipient, slippageTolerance, deadline } // useNative not set
        )
      ).toThrow(NATIVE_NOT_SET)
    })

    it('throws if createPool is true but there is no sqrtPrice defined', () => {
      let createPool: boolean = true
      expect(() =>
        V4PositionManager.addCallParameters(
          new Position({
            pool: pool_0_1,
            tickLower: -TICK_SPACINGS[FeeAmount.MEDIUM],
            tickUpper: TICK_SPACINGS[FeeAmount.MEDIUM],
            liquidity: 1,
          }),
          { createPool, recipient, slippageTolerance, deadline }
        )
      ).toThrow('NO_SQRT_PRICE')
    })

    it('succeeds for mint', () => {
      const position: Position = new Position({
        pool: pool_0_1,
        tickLower: -TICK_SPACINGS[FeeAmount.MEDIUM],
        tickUpper: TICK_SPACINGS[FeeAmount.MEDIUM],
        liquidity: 5000000,
      })
      const { calldata, value } = V4PositionManager.addCallParameters(position, {
        recipient,
        slippageTolerance,
        deadline,
      })

      // Rebuild the calldata with the planner for the expected mint.
      // Note that this test verifies that the applied logic in addCallParameters is correct but does not necessarily test the validity of the calldata itself.
      const { amount0: amount0Max, amount1: amount1Max } = position.mintAmountsWithSlippage(slippageTolerance)
      planner.addAction(Actions.MINT_POSITION, [
        pool_0_1.poolKey,
        -TICK_SPACINGS[FeeAmount.MEDIUM],
        TICK_SPACINGS[FeeAmount.MEDIUM],
        5000000,
        toHex(amount0Max),
        toHex(amount1Max),
        recipient,
        EMPTY_BYTES,
      ])
      // Expect there to be a settle pair call afterwards
      planner.addAction(Actions.SETTLE_PAIR, [toAddress(pool_0_1.currency0), toAddress(pool_0_1.currency1)])

      expect(calldata).toEqual(V4PositionManager.encodeModifyLiquidities(planner.finalize(), deadline))
      expect(value).toEqual('0x00')
    })

    it('succeeds for increase', () => {
      const position: Position = new Position({
        pool: pool_0_1,
        tickLower: -TICK_SPACINGS[FeeAmount.MEDIUM],
        tickUpper: TICK_SPACINGS[FeeAmount.MEDIUM],
        liquidity: 666,
      })

      const { calldata, value } = V4PositionManager.addCallParameters(position, {
        tokenId,
        slippageTolerance,
        deadline,
      })

      // Rebuild the calldata with the planner for increase
      const planner = new V4Planner()
      const { amount0: amount0Max, amount1: amount1Max } = position.mintAmountsWithSlippage(slippageTolerance)
      planner.addAction(Actions.INCREASE_LIQUIDITY, [
        tokenId.toString(),
        666,
        toHex(amount0Max),
        toHex(amount1Max),
        EMPTY_BYTES,
      ])
      // Expect there to be a settle pair call afterwards
      planner.addAction(Actions.SETTLE_PAIR, [toAddress(pool_0_1.currency0), toAddress(pool_0_1.currency1)])
      expect(calldata).toEqual(V4PositionManager.encodeModifyLiquidities(planner.finalize(), deadline))
      expect(value).toEqual('0x00')
    })

    it('succeeds when createPool is true', () => {
      const position: Position = new Position({
        pool: pool_0_1,
        tickLower: -TICK_SPACINGS[FeeAmount.MEDIUM],
        tickUpper: TICK_SPACINGS[FeeAmount.MEDIUM],
        liquidity: 90000000000000,
      })
      const { calldata, value } = V4PositionManager.addCallParameters(position, {
        recipient,
        slippageTolerance,
        deadline,
        createPool: true,
        sqrtPriceX96: SQRT_PRICE_1_1,
      })

      // The resulting calldata should be multicall with two calls: initializePool and modifyLiquidities
      const calldataList = Multicall.decodeMulticall(calldata)
      // Expect initializePool to be called correctly
      expect(calldataList[0]).toEqual(
        V4PositionManager.INTERFACE.encodeFunctionData('initializePool', [pool_0_1.poolKey, SQRT_PRICE_1_1.toString()])
      )
      const planner = new V4Planner()
      const { amount0: amount0Max, amount1: amount1Max } = position.mintAmountsWithSlippage(slippageTolerance)
      // Expect position to be minted correctly
      planner.addAction(Actions.MINT_POSITION, [
        pool_0_1.poolKey,
        -TICK_SPACINGS[FeeAmount.MEDIUM],
        TICK_SPACINGS[FeeAmount.MEDIUM],
        90000000000000,
        toHex(amount0Max),
        toHex(amount1Max),
        recipient,
        EMPTY_BYTES,
      ])
      planner.addAction(Actions.SETTLE_PAIR, [toAddress(pool_0_1.currency0), toAddress(pool_0_1.currency1)])
      expect(calldataList[1]).toEqual(V4PositionManager.encodeModifyLiquidities(planner.finalize(), deadline))
      expect(value).toEqual('0x00')
    })

    it('succeeds when useNative is set', () => {
      const position: Position = new Position({
        pool: pool_1_eth,
        tickLower: -TICK_SPACINGS[FeeAmount.MEDIUM],
        tickUpper: TICK_SPACINGS[FeeAmount.MEDIUM],
        liquidity: 1,
      })
      const { calldata, value } = V4PositionManager.addCallParameters(position, {
        recipient,
        slippageTolerance,
        deadline,
        useNative: currency_native,
      })

      // Rebuild the data with the planner for the expected mint. MUST sweep since we are using the native currency.

      const planner = new V4Planner()
      const { amount0: amount0Max, amount1: amount1Max } = position.mintAmountsWithSlippage(slippageTolerance)
      // Expect position to be minted correctly
      planner.addAction(Actions.MINT_POSITION, [
        pool_1_eth.poolKey,
        -TICK_SPACINGS[FeeAmount.MEDIUM],
        TICK_SPACINGS[FeeAmount.MEDIUM],
        1,
        toHex(amount0Max),
        toHex(amount1Max),
        recipient,
        EMPTY_BYTES,
      ])

      planner.addAction(Actions.SETTLE_PAIR, [toAddress(pool_1_eth.currency0), toAddress(pool_1_eth.currency1)])
      planner.addAction(Actions.SWEEP, [toAddress(pool_1_eth.currency0), MSG_SENDER])
      expect(calldata).toEqual(V4PositionManager.encodeModifyLiquidities(planner.finalize(), deadline))

      expect(value).toEqual(toHex(amount0Max))
    })

    it('succeeds when migrate is true', () => {
      const position: Position = new Position({
        pool: pool_0_1,
        tickLower: -TICK_SPACINGS[FeeAmount.MEDIUM],
        tickUpper: TICK_SPACINGS[FeeAmount.MEDIUM],
        liquidity: 1,
      })
      const { calldata, value } = V4PositionManager.addCallParameters(position, {
        recipient,
        slippageTolerance,
        deadline,
        migrate: true,
      })

      // Rebuild the data with the planner for the expected mint. MUST sweep since we are using the native currency.
      const planner = new V4Planner()
      const { amount0: amount0Max, amount1: amount1Max } = position.mintAmountsWithSlippage(slippageTolerance)
      // Expect position to be minted correctly
      planner.addAction(Actions.MINT_POSITION, [
        pool_0_1.poolKey,
        -TICK_SPACINGS[FeeAmount.MEDIUM],
        TICK_SPACINGS[FeeAmount.MEDIUM],
        1,
        toHex(amount0Max),
        toHex(amount1Max),
        recipient,
        EMPTY_BYTES,
      ])

      planner.addAction(Actions.SETTLE, [toAddress(pool_0_1.currency0), OPEN_DELTA, false])
      planner.addAction(Actions.SETTLE, [toAddress(pool_0_1.currency1), OPEN_DELTA, false])
      planner.addAction(Actions.SWEEP, [toAddress(pool_0_1.currency0), recipient])
      planner.addAction(Actions.SWEEP, [toAddress(pool_0_1.currency1), recipient])
      expect(calldata).toEqual(V4PositionManager.encodeModifyLiquidities(planner.finalize(), deadline))

      expect(value).toEqual('0x00')
    })

    it('succeeds when migrating to an eth position', () => {
      const position: Position = new Position({
        pool: pool_1_eth,
        tickLower: -TICK_SPACINGS[FeeAmount.MEDIUM],
        tickUpper: TICK_SPACINGS[FeeAmount.MEDIUM],
        liquidity: 1,
      })
      const { calldata, value } = V4PositionManager.addCallParameters(position, {
        recipient,
        slippageTolerance,
        deadline,
        migrate: true,
        useNative: currency_native,
      })

      // Rebuild the data with the planner for the expected mint. MUST sweep since we are using the native currency.
      const planner = new V4Planner()
      const { amount0: amount0Max, amount1: amount1Max } = position.mintAmountsWithSlippage(slippageTolerance)
      // Expect position to be minted correctly
      planner.addAction(Actions.MINT_POSITION, [
        pool_1_eth.poolKey,
        -TICK_SPACINGS[FeeAmount.MEDIUM],
        TICK_SPACINGS[FeeAmount.MEDIUM],
        1,
        toHex(amount0Max),
        toHex(amount1Max),
        recipient,
        EMPTY_BYTES,
      ])

      planner.addAction(Actions.UNWRAP, [OPEN_DELTA])
      planner.addAction(Actions.SETTLE, [toAddress(pool_1_eth.currency0), OPEN_DELTA, false])
      planner.addAction(Actions.SETTLE, [toAddress(pool_1_eth.currency1), OPEN_DELTA, false])
      planner.addAction(Actions.SWEEP, [toAddress(pool_1_eth.currency0.wrapped), recipient])
      planner.addAction(Actions.SWEEP, [toAddress(pool_1_eth.currency1), recipient])
      expect(calldata).toEqual(V4PositionManager.encodeModifyLiquidities(planner.finalize(), deadline))

      expect(value).toEqual('0x00')
    })

    it('succeeds for batchPermit', () => {
      const position: Position = new Position({
        pool: pool_0_1,
        tickLower: -TICK_SPACINGS[FeeAmount.MEDIUM],
        tickUpper: TICK_SPACINGS[FeeAmount.MEDIUM],
        liquidity: 1,
      })

      const batchPermit: BatchPermitOptions = {
        owner: mockOwner,
        permitBatch: {
          details: [],
          sigDeadline: deadline,
          spender: mockSpender,
        },
        signature: mockBytes32,
      }

      const { calldata, value } = V4PositionManager.addCallParameters(position, {
        recipient,
        slippageTolerance,
        deadline,
        batchPermit,
      })

      const calldataList = Multicall.decodeMulticall(calldata)
      // Expect permitBatch to be called correctly
      expect(calldataList[0]).toEqual(
        V4PositionManager.INTERFACE.encodeFunctionData(PositionFunctions.PERMIT_BATCH, [
          batchPermit.owner,
          batchPermit.permitBatch,
          batchPermit.signature,
        ])
      )

      const planner = new V4Planner()
      const { amount0: amount0Max, amount1: amount1Max } = position.mintAmountsWithSlippage(slippageTolerance)

      planner.addAction(Actions.MINT_POSITION, [
        pool_0_1.poolKey,
        -TICK_SPACINGS[FeeAmount.MEDIUM],
        TICK_SPACINGS[FeeAmount.MEDIUM],
        1,
        toHex(amount0Max),
        toHex(amount1Max),
        recipient,
        EMPTY_BYTES,
      ])
      planner.addAction(Actions.SETTLE_PAIR, [toAddress(pool_0_1.currency0), toAddress(pool_0_1.currency1)])
      expect(calldataList[1]).toEqual(V4PositionManager.encodeModifyLiquidities(planner.finalize(), deadline))
      expect(value).toEqual('0x00')
    })
  })

  describe('#removeCallParameters', () => {
    const position = new Position({
      pool: pool_0_1,
      tickLower: -TICK_SPACINGS[FeeAmount.MEDIUM],
      tickUpper: TICK_SPACINGS[FeeAmount.MEDIUM],
      liquidity: 100,
    })

    const removeLiqOptions: RemoveLiquidityOptions = {
      tokenId,
      liquidityPercentage: new Percent(1),
      slippageTolerance,
      deadline,
    }

    const partialRemoveOptions: RemoveLiquidityOptions = {
      tokenId,
      liquidityPercentage: new Percent(1, 100),
      slippageTolerance,
      deadline,
    }

    const burnLiqOptions: RemoveLiquidityOptions = {
      burnToken: true,
      ...removeLiqOptions,
    }

    const burnLiqWithPermitOptions: RemoveLiquidityOptions = {
      ...burnLiqOptions,
      permit: {
        spender: mockSpender,
        tokenId,
        deadline,
        nonce: 1,
        signature: '0x00',
      },
    }

    it('throws for 0 liquidity', () => {
      const zeroLiquidityPosition = new Position({
        ...position,
        liquidity: 0,
      })

      expect(() => V4PositionManager.removeCallParameters(zeroLiquidityPosition, removeLiqOptions)).toThrow(
        ZERO_LIQUIDITY
      )
    })

    it('throws when burn is true but liquidityPercentage is not 100%', () => {
      const fullLiquidityPosition = new Position({
        ...position,
        liquidity: 999,
      })

      let invalidBurnLiqOptions = {
        burnToken: true,
        liquidityPercentage: new Percent(1, 100),
        tokenId,
        slippageTolerance,
        deadline,
      }

      expect(() => V4PositionManager.removeCallParameters(fullLiquidityPosition, invalidBurnLiqOptions)).toThrow(
        CANNOT_BURN
      )
    })

    it('succeeds for burn', () => {
      const { calldata, value } = V4PositionManager.removeCallParameters(position, burnLiqOptions)

      const { amount0: amount0Min, amount1: amount1Min } = position.burnAmountsWithSlippage(slippageTolerance)

      const planner = new V4PositionPlanner()

      planner.addAction(Actions.BURN_POSITION, [
        tokenId.toString(),
        amount0Min.toString(),
        amount1Min.toString(),
        EMPTY_BYTES,
      ])
      planner.addAction(Actions.TAKE_PAIR, [toAddress(currency0), toAddress(currency1), MSG_SENDER])

      expect(calldata).toEqual(V4PositionManager.encodeModifyLiquidities(planner.finalize(), burnLiqOptions.deadline))
      expect(value).toEqual('0x00')
    })

    it('succeeds for remove partial liquidity', () => {
      // remove 1% of 100, 1
      let amountToRemove = '1'
      const { calldata, value } = V4PositionManager.removeCallParameters(position, partialRemoveOptions)
      const { amount0: amount0Min, amount1: amount1Min } = position.burnAmountsWithSlippage(slippageTolerance)

      const planner = new V4Planner()

      planner.addAction(Actions.DECREASE_LIQUIDITY, [
        tokenId.toString(),
        amountToRemove,
        amount0Min.toString(),
        amount1Min.toString(),
        EMPTY_BYTES,
      ])
      planner.addAction(Actions.TAKE_PAIR, [toAddress(currency0), toAddress(currency1), MSG_SENDER])

      expect(calldata).toEqual(
        V4PositionManager.encodeModifyLiquidities(planner.finalize(), partialRemoveOptions.deadline)
      )
      expect(value).toEqual('0x00')
    })

    it('succeeds for burn with permit', () => {
      const { calldata, value } = V4PositionManager.removeCallParameters(position, burnLiqWithPermitOptions)

      const { amount0: amount0Min, amount1: amount1Min } = position.burnAmountsWithSlippage(slippageTolerance)

      const planner = new V4PositionPlanner()

      planner.addAction(Actions.BURN_POSITION, [
        tokenId.toString(),
        amount0Min.toString(),
        amount1Min.toString(),
        EMPTY_BYTES,
      ])
      planner.addAction(Actions.TAKE_PAIR, [toAddress(currency0), toAddress(currency1), MSG_SENDER])

      // The resulting calldata should be multicall with two calls: ERC721Permit_Permit and modifyLiquidities
      const calldataList = Multicall.decodeMulticall(calldata)
      // Expect ERC721Permit_Permit to be called correctly
      expect(calldataList[0]).toEqual(
        V4PositionManager.INTERFACE.encodeFunctionData(PositionFunctions.ERC721PERMIT_PERMIT, [
          burnLiqWithPermitOptions.permit!.spender,
          tokenId.toString(),
          burnLiqWithPermitOptions.permit!.deadline,
          burnLiqWithPermitOptions.permit!.nonce,
          burnLiqWithPermitOptions.permit!.signature,
        ])
      )
      // Expect modifyLiquidities to be called correctly
      expect(calldataList[1]).toEqual(
        V4PositionManager.encodeModifyLiquidities(planner.finalize(), burnLiqOptions.deadline)
      )
      expect(value).toEqual('0x00')
    })
  })

  describe('#collectCallParameters', () => {
    const position = new Position({
      pool: pool_0_1,
      tickLower: -TICK_SPACINGS[FeeAmount.MEDIUM],
      tickUpper: TICK_SPACINGS[FeeAmount.MEDIUM],
      liquidity: 100,
    })

    const collectLiqOptions: CollectOptions = {
      tokenId,
      slippageTolerance,
      deadline,
      recipient,
    }

    it('succeeds', () => {
      const { calldata, value } = V4PositionManager.collectCallParameters(position, collectLiqOptions)

      const planner = new V4Planner()

      planner.addAction(Actions.DECREASE_LIQUIDITY, [tokenId.toString(), '0', '0', '0', EMPTY_BYTES])

      planner.addAction(Actions.TAKE_PAIR, [toAddress(currency0), toAddress(currency1), recipient])

      expect(calldata).toEqual(
        V4PositionManager.encodeModifyLiquidities(planner.finalize(), collectLiqOptions.deadline)
      )
      expect(value).toEqual('0x00')
    })
  })

  describe('#getPermitData', () => {
    it('succeeds', () => {
      const permit = {
        spender: mockSpender,
        tokenId: 1,
        deadline: 123,
        nonce: 1,
      }
      const { domain, types, values } = V4PositionManager.getPermitData(permit, mockOwner, 1)
      expect(domain).toEqual({
        name: 'Uniswap V4 Positions NFT',
        chainId: 1,
        verifyingContract: mockOwner,
      })
      expect(types).toEqual({
        Permit: [
          { name: 'spender', type: 'address' },
          { name: 'tokenId', type: 'uint256' },
          { name: 'nonce', type: 'uint256' },
          { name: 'deadline', type: 'uint256' },
        ],
      })
      expect(values).toEqual(permit)
      // get typehash
      const encodedType = ethers.utils._TypedDataEncoder.from(types).encodeType('Permit')

      // Compute the type hash by hashing the encoded type
      const typeHash = ethers.utils.id(encodedType)
      // ref https://github.com/Uniswap/v3-periphery/blob/main/contracts/base/ERC721Permit.sol
      expect(typeHash).toEqual('0x49ecf333e5b8c95c40fdafc95c1ad136e8914a8fb55e9dc8bb01eaa83a2df9ad')
    })
  })
})
