import { BigNumber, constants } from 'ethers'

import { BASE_SCALING_FACTOR } from '../constants/v4'
import { CosignedHybridOrder } from '../order/v4/HybridOrder'

import { HybridOrderBuilder } from './HybridOrderBuilder'

const INPUT_TOKEN = '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48'
const OUTPUT_TOKEN = '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2'
const REACTOR_ADDRESS = '0x0000000000000000000000000000000000000001'
const RESOLVER_ADDRESS = '0x0000000000000000000000000000000000000002'

const INPUT_MAX_AMOUNT = BigNumber.from('1000000')
const OUTPUT_MIN_AMOUNT = BigNumber.from('1000000000000000000')
const VALID_COSIGNATURE =
  '0x1234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890'

describe('HybridOrderBuilder', () => {
  let builder: HybridOrderBuilder

  beforeEach(() => {
    builder = new HybridOrderBuilder(1, REACTOR_ADDRESS, RESOLVER_ADDRESS)
  })

  describe('Build valid orders', () => {
    it('Build a valid exact-in order', () => {
      const deadline = Math.floor(Date.now() / 1000) + 1000
      const order = builder
        .cosigner(constants.AddressZero)
        .cosignature(VALID_COSIGNATURE)
        .input({
          token: INPUT_TOKEN,
          maxAmount: INPUT_MAX_AMOUNT,
        })
        .output({
          token: OUTPUT_TOKEN,
          minAmount: OUTPUT_MIN_AMOUNT,
          recipient: constants.AddressZero,
        })
        .auctionStartBlock(100)
        .baselinePriorityFee(0)
        .scalingFactor(BASE_SCALING_FACTOR.mul(101).div(100)) // 1.01e18 (exact-in)
        .priceCurve([])
        .deadline(deadline)
        .swapper(constants.AddressZero)
        .nonce(BigNumber.from(100))
        .auctionTargetBlock(100)
        .supplementalPriceCurve([])
        .build()

      expect(order.info.reactor).toEqual(REACTOR_ADDRESS)
      expect(order.info.swapper).toEqual(constants.AddressZero)
      expect(order.info.outputs.length).toEqual(1)
      expect(order.info.scalingFactor).toEqual(BASE_SCALING_FACTOR.mul(101).div(100))
    })

    it('Build a valid exact-out order', () => {
      const deadline = Math.floor(Date.now() / 1000) + 1000
      const order = builder
        .cosigner(constants.AddressZero)
        .cosignature(VALID_COSIGNATURE)
        .input({
          token: INPUT_TOKEN,
          maxAmount: INPUT_MAX_AMOUNT,
        })
        .output({
          token: OUTPUT_TOKEN,
          minAmount: OUTPUT_MIN_AMOUNT,
          recipient: constants.AddressZero,
        })
        .auctionStartBlock(100)
        .baselinePriorityFee(0)
        .scalingFactor(BASE_SCALING_FACTOR.mul(99).div(100)) // 0.99e18 (exact-out)
        .priceCurve([])
        .deadline(deadline)
        .swapper(constants.AddressZero)
        .nonce(BigNumber.from(100))
        .auctionTargetBlock(100)
        .supplementalPriceCurve([])
        .build()

      expect(order.info.outputs.length).toEqual(1)
      expect(order.info.scalingFactor).toEqual(BASE_SCALING_FACTOR.mul(99).div(100))
    })

    it('Build a valid order with multiple outputs', () => {
      const deadline = Math.floor(Date.now() / 1000) + 1000
      const order = builder
        .cosigner(constants.AddressZero)
        .cosignature(VALID_COSIGNATURE)
        .deadline(deadline)
        .swapper(constants.AddressZero)
        .nonce(BigNumber.from(100))
        .input({
          token: INPUT_TOKEN,
          maxAmount: INPUT_MAX_AMOUNT,
        })
        .output({
          token: OUTPUT_TOKEN,
          minAmount: OUTPUT_MIN_AMOUNT,
          recipient: constants.AddressZero,
        })
        .output({
          token: OUTPUT_TOKEN,
          minAmount: OUTPUT_MIN_AMOUNT.div(2),
          recipient: '0x0000000000000000000000000000000000000003',
        })
        .auctionStartBlock(100)
        .baselinePriorityFee(BigNumber.from('1000000000'))
        .scalingFactor(BASE_SCALING_FACTOR)
        .priceCurve([])
        .auctionTargetBlock(100)
        .supplementalPriceCurve([])
        .build()

      expect(order.info.outputs.length).toEqual(2)
      expect(order.info.baselinePriorityFee).toEqual(BigNumber.from('1000000000'))
    })

    it('Build a valid order with price curve', () => {
      const deadline = Math.floor(Date.now() / 1000) + 1000
      // Price curve: duration=10 blocks, scaling factor=1.1e18
      const PRICE_CURVE_DURATION_SHIFT = 240
      const priceCurveElement = BigNumber.from(10)
        .shl(PRICE_CURVE_DURATION_SHIFT)
        .or(BASE_SCALING_FACTOR.mul(11).div(10))

      const order = builder
        .cosigner(constants.AddressZero)
        .cosignature(VALID_COSIGNATURE)
        .input({
          token: INPUT_TOKEN,
          maxAmount: INPUT_MAX_AMOUNT,
        })
        .output({
          token: OUTPUT_TOKEN,
          minAmount: OUTPUT_MIN_AMOUNT,
          recipient: constants.AddressZero,
        })
        .auctionStartBlock(100)
        .baselinePriorityFee(0)
        .scalingFactor(BASE_SCALING_FACTOR)
        .priceCurve([priceCurveElement])
        .deadline(deadline)
        .swapper(constants.AddressZero)
        .nonce(BigNumber.from(100))
        .auctionTargetBlock(100)
        .supplementalPriceCurve([])
        .build()

      expect(order.info.priceCurve.length).toEqual(1)
      expect(order.info.priceCurve[0]).toEqual(priceCurveElement)
    })

    it('Build a valid order with supplemental price curve', () => {
      const deadline = Math.floor(Date.now() / 1000) + 1000
      const supplemental = [BASE_SCALING_FACTOR.mul(105).div(100), BASE_SCALING_FACTOR.mul(102).div(100)]

      const order = builder
        .cosigner(constants.AddressZero)
        .cosignature(VALID_COSIGNATURE)
        .input({
          token: INPUT_TOKEN,
          maxAmount: INPUT_MAX_AMOUNT,
        })
        .output({
          token: OUTPUT_TOKEN,
          minAmount: OUTPUT_MIN_AMOUNT,
          recipient: constants.AddressZero,
        })
        .auctionStartBlock(100)
        .baselinePriorityFee(0)
        .scalingFactor(BASE_SCALING_FACTOR)
        .priceCurve([])
        .deadline(deadline)
        .swapper(constants.AddressZero)
        .nonce(BigNumber.from(100))
        .auctionTargetBlock(110)
        .supplementalPriceCurve(supplemental)
        .build()

      expect(order.info.cosignerData.supplementalPriceCurve).toEqual(supplemental)
      expect(order.info.cosignerData.auctionTargetBlock).toEqual(BigNumber.from(110))
    })

    it('Build a valid order with hooks', () => {
      const deadline = Math.floor(Date.now() / 1000) + 1000
      const hookAddress = '0x0000000000000000000000000000000000000123'
      const hookData = '0x1234'

      const order = builder
        .cosigner(constants.AddressZero)
        .cosignature(VALID_COSIGNATURE)
        .input({
          token: INPUT_TOKEN,
          maxAmount: INPUT_MAX_AMOUNT,
        })
        .output({
          token: OUTPUT_TOKEN,
          minAmount: OUTPUT_MIN_AMOUNT,
          recipient: constants.AddressZero,
        })
        .preExecutionHook(hookAddress, hookData)
        .postExecutionHook(hookAddress, hookData)
        .auctionResolver(RESOLVER_ADDRESS)
        .auctionStartBlock(100)
        .baselinePriorityFee(0)
        .scalingFactor(BASE_SCALING_FACTOR)
        .priceCurve([])
        .deadline(deadline)
        .swapper(constants.AddressZero)
        .nonce(BigNumber.from(100))
        .auctionTargetBlock(100)
        .supplementalPriceCurve([])
        .build()

      expect(order.info.preExecutionHook).toEqual(hookAddress)
      expect(order.info.preExecutionHookData).toEqual(hookData)
      expect(order.info.postExecutionHook).toEqual(hookAddress)
      expect(order.info.postExecutionHookData).toEqual(hookData)
      expect(order.info.auctionResolver).toEqual(RESOLVER_ADDRESS)
    })
  })

  describe('Error cases', () => {
    it('Reactor is set in constructor', () => {
      const deadline = Math.floor(Date.now() / 1000) + 1000
      const builderWithReactor = new HybridOrderBuilder(1, REACTOR_ADDRESS, RESOLVER_ADDRESS)

      const order = builderWithReactor
        .cosigner(constants.AddressZero)
        .cosignature(VALID_COSIGNATURE)
        .input({
          token: INPUT_TOKEN,
          maxAmount: INPUT_MAX_AMOUNT,
        })
        .output({
          token: OUTPUT_TOKEN,
          minAmount: OUTPUT_MIN_AMOUNT,
          recipient: constants.AddressZero,
        })
        .auctionStartBlock(100)
        .baselinePriorityFee(0)
        .scalingFactor(BASE_SCALING_FACTOR)
        .priceCurve([])
        .deadline(deadline)
        .swapper(constants.AddressZero)
        .nonce(BigNumber.from(100))
        .auctionTargetBlock(100)
        .supplementalPriceCurve([])
        .build()

      expect(order.info.reactor).toEqual(REACTOR_ADDRESS)
    })

    it('Throw if swapper is not set', () => {
      const deadline = Math.floor(Date.now() / 1000) + 1000
      expect(() =>
        builder
          .cosigner(constants.AddressZero)
          .cosignature(VALID_COSIGNATURE)
          .input({
            token: INPUT_TOKEN,
            maxAmount: INPUT_MAX_AMOUNT,
          })
          .output({
            token: OUTPUT_TOKEN,
            minAmount: OUTPUT_MIN_AMOUNT,
            recipient: constants.AddressZero,
          })
          .auctionStartBlock(100)
          .baselinePriorityFee(0)
          .scalingFactor(BASE_SCALING_FACTOR)
          .priceCurve([])
          .deadline(deadline)
          .nonce(BigNumber.from(100))
          .auctionTargetBlock(100)
          .supplementalPriceCurve([])
          .build()
      ).toThrow('Invariant failed: swapper not set')
    })

    it('Throw if nonce is not set', () => {
      const deadline = Math.floor(Date.now() / 1000) + 1000
      expect(() =>
        builder
          .cosigner(constants.AddressZero)
          .cosignature(VALID_COSIGNATURE)
          .input({
            token: INPUT_TOKEN,
            maxAmount: INPUT_MAX_AMOUNT,
          })
          .output({
            token: OUTPUT_TOKEN,
            minAmount: OUTPUT_MIN_AMOUNT,
            recipient: constants.AddressZero,
          })
          .auctionStartBlock(100)
          .baselinePriorityFee(0)
          .scalingFactor(BASE_SCALING_FACTOR)
          .priceCurve([])
          .deadline(deadline)
          .swapper(constants.AddressZero)
          .auctionTargetBlock(100)
          .supplementalPriceCurve([])
          .build()
      ).toThrow('Invariant failed: nonce not set')
    })

    it('Throw if deadline is not set', () => {
      expect(() =>
        builder
          .cosigner(constants.AddressZero)
          .cosignature(VALID_COSIGNATURE)
          .input({
            token: INPUT_TOKEN,
            maxAmount: INPUT_MAX_AMOUNT,
          })
          .output({
            token: OUTPUT_TOKEN,
            minAmount: OUTPUT_MIN_AMOUNT,
            recipient: constants.AddressZero,
          })
          .auctionStartBlock(100)
          .baselinePriorityFee(0)
          .scalingFactor(BASE_SCALING_FACTOR)
          .priceCurve([])
          .swapper(constants.AddressZero)
          .nonce(BigNumber.from(100))
          .auctionTargetBlock(100)
          .supplementalPriceCurve([])
          .build()
      ).toThrow('Invariant failed: deadline not set')
    })

    it('Throw if deadline already passed', () => {
      const deadline = 2121
      expect(() =>
        builder
          .cosigner(constants.AddressZero)
          .cosignature(VALID_COSIGNATURE)
          .input({
            token: INPUT_TOKEN,
            maxAmount: INPUT_MAX_AMOUNT,
          })
          .output({
            token: OUTPUT_TOKEN,
            minAmount: OUTPUT_MIN_AMOUNT,
            recipient: constants.AddressZero,
          })
          .auctionStartBlock(100)
          .baselinePriorityFee(0)
          .scalingFactor(BASE_SCALING_FACTOR)
          .priceCurve([])
          .deadline(deadline)
          .swapper(constants.AddressZero)
          .nonce(BigNumber.from(100))
          .auctionTargetBlock(100)
          .supplementalPriceCurve([])
          .build()
      ).toThrow('Invariant failed: Deadline must be in the future: 2121')
    })

    it('Cosigner defaults to zero address if not set', () => {
      const deadline = Math.floor(Date.now() / 1000) + 1000
      const order = builder
        .input({
          token: INPUT_TOKEN,
          maxAmount: INPUT_MAX_AMOUNT,
        })
        .output({
          token: OUTPUT_TOKEN,
          minAmount: OUTPUT_MIN_AMOUNT,
          recipient: constants.AddressZero,
        })
        .auctionStartBlock(100)
        .baselinePriorityFee(0)
        .scalingFactor(BASE_SCALING_FACTOR)
        .priceCurve([])
        .deadline(deadline)
        .swapper(constants.AddressZero)
        .nonce(BigNumber.from(100))
        .buildPartial()

      expect(order.info.cosigner).toEqual(constants.AddressZero)
    })

    it('Throw if input is not set', () => {
      const deadline = Math.floor(Date.now() / 1000) + 1000
      expect(() =>
        builder
          .cosigner(constants.AddressZero)
          .cosignature(VALID_COSIGNATURE)
          .output({
            token: OUTPUT_TOKEN,
            minAmount: OUTPUT_MIN_AMOUNT,
            recipient: constants.AddressZero,
          })
          .auctionStartBlock(100)
          .baselinePriorityFee(0)
          .scalingFactor(BASE_SCALING_FACTOR)
          .priceCurve([])
          .deadline(deadline)
          .swapper(constants.AddressZero)
          .nonce(BigNumber.from(100))
          .auctionTargetBlock(100)
          .supplementalPriceCurve([])
          .build()
      ).toThrow('Invariant failed: input not set')
    })

    it('Throw if outputs are not set', () => {
      const deadline = Math.floor(Date.now() / 1000) + 1000
      expect(() =>
        builder
          .cosigner(constants.AddressZero)
          .cosignature(VALID_COSIGNATURE)
          .input({
            token: INPUT_TOKEN,
            maxAmount: INPUT_MAX_AMOUNT,
          })
          .auctionStartBlock(100)
          .baselinePriorityFee(0)
          .scalingFactor(BASE_SCALING_FACTOR)
          .priceCurve([])
          .deadline(deadline)
          .swapper(constants.AddressZero)
          .nonce(BigNumber.from(100))
          .auctionTargetBlock(100)
          .supplementalPriceCurve([])
          .build()
      ).toThrow('Invariant failed: outputs not set')
    })

    it('Throw if auctionStartBlock is not set', () => {
      const deadline = Math.floor(Date.now() / 1000) + 1000
      expect(() =>
        builder
          .cosigner(constants.AddressZero)
          .cosignature(VALID_COSIGNATURE)
          .input({
            token: INPUT_TOKEN,
            maxAmount: INPUT_MAX_AMOUNT,
          })
          .output({
            token: OUTPUT_TOKEN,
            minAmount: OUTPUT_MIN_AMOUNT,
            recipient: constants.AddressZero,
          })
          .baselinePriorityFee(0)
          .scalingFactor(BASE_SCALING_FACTOR)
          .priceCurve([])
          .deadline(deadline)
          .swapper(constants.AddressZero)
          .nonce(BigNumber.from(100))
          .auctionTargetBlock(100)
          .supplementalPriceCurve([])
          .build()
      ).toThrow('Invariant failed: auctionStartBlock not set')
    })

    it('Throw if baselinePriorityFee is not set', () => {
      const deadline = Math.floor(Date.now() / 1000) + 1000
      expect(() =>
        builder
          .cosigner(constants.AddressZero)
          .cosignature(VALID_COSIGNATURE)
          .input({
            token: INPUT_TOKEN,
            maxAmount: INPUT_MAX_AMOUNT,
          })
          .output({
            token: OUTPUT_TOKEN,
            minAmount: OUTPUT_MIN_AMOUNT,
            recipient: constants.AddressZero,
          })
          .auctionStartBlock(100)
          .scalingFactor(BASE_SCALING_FACTOR)
          .priceCurve([])
          .deadline(deadline)
          .swapper(constants.AddressZero)
          .nonce(BigNumber.from(100))
          .auctionTargetBlock(100)
          .supplementalPriceCurve([])
          .build()
      ).toThrow('Invariant failed: baselinePriorityFee not set')
    })

    it('Throw if scalingFactor is not set', () => {
      const deadline = Math.floor(Date.now() / 1000) + 1000
      expect(() =>
        builder
          .cosigner(constants.AddressZero)
          .cosignature(VALID_COSIGNATURE)
          .input({
            token: INPUT_TOKEN,
            maxAmount: INPUT_MAX_AMOUNT,
          })
          .output({
            token: OUTPUT_TOKEN,
            minAmount: OUTPUT_MIN_AMOUNT,
            recipient: constants.AddressZero,
          })
          .auctionStartBlock(100)
          .baselinePriorityFee(0)
          .priceCurve([])
          .deadline(deadline)
          .swapper(constants.AddressZero)
          .nonce(BigNumber.from(100))
          .auctionTargetBlock(100)
          .supplementalPriceCurve([])
          .build()
      ).toThrow('Invariant failed: scalingFactor not set')
    })

    it('Throw if priceCurve is not set', () => {
      const deadline = Math.floor(Date.now() / 1000) + 1000
      expect(() =>
        builder
          .cosigner(constants.AddressZero)
          .cosignature(VALID_COSIGNATURE)
          .input({
            token: INPUT_TOKEN,
            maxAmount: INPUT_MAX_AMOUNT,
          })
          .output({
            token: OUTPUT_TOKEN,
            minAmount: OUTPUT_MIN_AMOUNT,
            recipient: constants.AddressZero,
          })
          .auctionStartBlock(100)
          .baselinePriorityFee(0)
          .scalingFactor(BASE_SCALING_FACTOR)
          .deadline(deadline)
          .swapper(constants.AddressZero)
          .nonce(BigNumber.from(100))
          .auctionTargetBlock(100)
          .supplementalPriceCurve([])
          .build()
      ).toThrow('Invariant failed: priceCurve not set')
    })

    it('Throw if cosignature is not set when calling build()', () => {
      const deadline = Math.floor(Date.now() / 1000) + 1000
      expect(() =>
        builder
          .cosigner(constants.AddressZero)
          .input({
            token: INPUT_TOKEN,
            maxAmount: INPUT_MAX_AMOUNT,
          })
          .output({
            token: OUTPUT_TOKEN,
            minAmount: OUTPUT_MIN_AMOUNT,
            recipient: constants.AddressZero,
          })
          .auctionStartBlock(100)
          .baselinePriorityFee(0)
          .scalingFactor(BASE_SCALING_FACTOR)
          .priceCurve([])
          .deadline(deadline)
          .swapper(constants.AddressZero)
          .nonce(BigNumber.from(100))
          .auctionTargetBlock(100)
          .supplementalPriceCurve([])
          .build()
      ).toThrow('Invariant failed: cosignature not set')
    })
  })

  describe('buildPartial', () => {
    it('Build a partial order without cosignature', () => {
      const deadline = Math.floor(Date.now() / 1000) + 1000
      const order = builder
        .cosigner(constants.AddressZero)
        .input({
          token: INPUT_TOKEN,
          maxAmount: INPUT_MAX_AMOUNT,
        })
        .output({
          token: OUTPUT_TOKEN,
          minAmount: OUTPUT_MIN_AMOUNT,
          recipient: constants.AddressZero,
        })
        .auctionStartBlock(100)
        .baselinePriorityFee(0)
        .scalingFactor(BASE_SCALING_FACTOR)
        .priceCurve([])
        .deadline(deadline)
        .swapper(constants.AddressZero)
        .nonce(BigNumber.from(100))
        .buildPartial()

      expect(order.info.reactor).toEqual(REACTOR_ADDRESS)
      expect(order.info.outputs.length).toEqual(1)
      expect(order.chainId).toEqual(1)
    })
  })

  describe('fromOrder', () => {
    it('Regenerate builder from order', () => {
      const deadline = Math.floor(Date.now() / 1000) + 1000
      const cosignature =
        '0x1234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890'
      const order = builder
        .cosigner(constants.AddressZero)
        .cosignature(cosignature)
        .input({
          token: INPUT_TOKEN,
          maxAmount: INPUT_MAX_AMOUNT,
        })
        .output({
          token: OUTPUT_TOKEN,
          minAmount: OUTPUT_MIN_AMOUNT,
          recipient: constants.AddressZero,
        })
        .auctionStartBlock(100)
        .baselinePriorityFee(0)
        .scalingFactor(BASE_SCALING_FACTOR)
        .priceCurve([])
        .deadline(deadline)
        .swapper(constants.AddressZero)
        .nonce(BigNumber.from(100))
        .auctionTargetBlock(100)
        .supplementalPriceCurve([])
        .build()

      const regeneratedBuilder = HybridOrderBuilder.fromOrder(order)
      const regeneratedOrder = regeneratedBuilder.build()

      expect(regeneratedOrder.toJSON()).toMatchObject(order.toJSON())
    })

    it('Regenerate builder from order and modify', () => {
      const deadline = Math.floor(Date.now() / 1000) + 1000
      const cosignature =
        '0x1234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890'
      const order = builder
        .cosigner(constants.AddressZero)
        .cosignature(cosignature)
        .input({
          token: INPUT_TOKEN,
          maxAmount: INPUT_MAX_AMOUNT,
        })
        .output({
          token: OUTPUT_TOKEN,
          minAmount: OUTPUT_MIN_AMOUNT,
          recipient: constants.AddressZero,
        })
        .auctionStartBlock(100)
        .baselinePriorityFee(0)
        .scalingFactor(BASE_SCALING_FACTOR)
        .priceCurve([])
        .deadline(deadline)
        .swapper(constants.AddressZero)
        .nonce(BigNumber.from(100))
        .auctionTargetBlock(100)
        .supplementalPriceCurve([])
        .build()

      const regeneratedBuilder = HybridOrderBuilder.fromOrder(order)
      regeneratedBuilder.auctionStartBlock(200)
      const regeneratedOrder = regeneratedBuilder.build()

      expect(regeneratedOrder.info.auctionStartBlock).toEqual(BigNumber.from(200))
      expect(regeneratedOrder.info.swapper).toEqual(constants.AddressZero)
    })

    it('Regenerate builder from order JSON', () => {
      const deadline = Math.floor(Date.now() / 1000) + 1000
      const cosignature =
        '0x1234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890'
      const order = builder
        .cosigner(constants.AddressZero)
        .cosignature(cosignature)
        .input({
          token: INPUT_TOKEN,
          maxAmount: INPUT_MAX_AMOUNT,
        })
        .output({
          token: OUTPUT_TOKEN,
          minAmount: OUTPUT_MIN_AMOUNT,
          recipient: constants.AddressZero,
        })
        .auctionStartBlock(100)
        .baselinePriorityFee(0)
        .scalingFactor(BASE_SCALING_FACTOR)
        .priceCurve([])
        .deadline(deadline)
        .swapper(constants.AddressZero)
        .nonce(BigNumber.from(100))
        .auctionTargetBlock(100)
        .supplementalPriceCurve([])
        .build()

      const json = order.toJSON()
      const orderFromJSON = CosignedHybridOrder.fromJSON(json, json.chainId, json.resolver)
      const regeneratedBuilder = HybridOrderBuilder.fromOrder(orderFromJSON)
      const regeneratedOrder = regeneratedBuilder.build()

      expect(regeneratedOrder.toJSON()).toMatchObject(order.toJSON())
    })
  })

  describe('Utility methods', () => {
    it('Does not throw before an order has been finished building', () => {
      const deadline = Math.floor(Date.now() / 1000) + 1000
      expect(() => builder.deadline(deadline).auctionStartBlock(100)).not.toThrowError()
    })

    it('Supports number inputs for BigNumber fields', () => {
      const deadline = Math.floor(Date.now() / 1000) + 1000
      const order = builder
        .cosigner(constants.AddressZero)
        .cosignature(VALID_COSIGNATURE)
        .input({
          token: INPUT_TOKEN,
          maxAmount: INPUT_MAX_AMOUNT,
        })
        .output({
          token: OUTPUT_TOKEN,
          minAmount: OUTPUT_MIN_AMOUNT,
          recipient: constants.AddressZero,
        })
        .auctionStartBlock(100) // number instead of BigNumber
        .baselinePriorityFee(1000000000) // number instead of BigNumber
        .scalingFactor(BASE_SCALING_FACTOR)
        .priceCurve([])
        .deadline(deadline)
        .swapper(constants.AddressZero)
        .nonce(BigNumber.from(100))
        .auctionTargetBlock(110) // number instead of BigNumber
        .supplementalPriceCurve([])
        .build()

      expect(order.info.auctionStartBlock).toEqual(BigNumber.from(100))
      expect(order.info.baselinePriorityFee).toEqual(BigNumber.from(1000000000))
      expect(order.info.cosignerData.auctionTargetBlock).toEqual(BigNumber.from(110))
    })
  })

  describe('Price curve direction validation', () => {
    const PRICE_CURVE_DURATION_SHIFT = 240

    const encodePriceCurveElement = (duration: number, scalingFactor: BigNumber): BigNumber => {
      return BigNumber.from(duration).shl(PRICE_CURVE_DURATION_SHIFT).or(scalingFactor)
    }

    it('Allows multi-segment price curve with all elements > 1e18', () => {
      const deadline = Math.floor(Date.now() / 1000) + 1000
      const priceCurve = [
        encodePriceCurveElement(5, BASE_SCALING_FACTOR.mul(102).div(100)), // 1.02e18
        encodePriceCurveElement(5, BASE_SCALING_FACTOR.mul(105).div(100)), // 1.05e18
      ]

      const order = builder
        .cosigner(constants.AddressZero)
        .cosignature(VALID_COSIGNATURE)
        .input({ token: INPUT_TOKEN, maxAmount: INPUT_MAX_AMOUNT })
        .output({ token: OUTPUT_TOKEN, minAmount: OUTPUT_MIN_AMOUNT, recipient: constants.AddressZero })
        .auctionStartBlock(100)
        .baselinePriorityFee(0)
        .scalingFactor(BASE_SCALING_FACTOR.mul(102).div(100))
        .priceCurve(priceCurve)
        .deadline(deadline)
        .swapper(constants.AddressZero)
        .nonce(BigNumber.from(100))
        .auctionTargetBlock(100)
        .supplementalPriceCurve([])
        .build()

      expect(order.info.priceCurve.length).toEqual(2)
    })

    it('Allows multi-segment price curve with all elements < 1e18', () => {
      const deadline = Math.floor(Date.now() / 1000) + 1000
      const priceCurve = [
        encodePriceCurveElement(5, BASE_SCALING_FACTOR.mul(98).div(100)), // 0.98e18
        encodePriceCurveElement(5, BASE_SCALING_FACTOR.mul(95).div(100)), // 0.95e18
      ]

      const order = builder
        .cosigner(constants.AddressZero)
        .cosignature(VALID_COSIGNATURE)
        .input({ token: INPUT_TOKEN, maxAmount: INPUT_MAX_AMOUNT })
        .output({ token: OUTPUT_TOKEN, minAmount: OUTPUT_MIN_AMOUNT, recipient: constants.AddressZero })
        .auctionStartBlock(100)
        .baselinePriorityFee(0)
        .scalingFactor(BASE_SCALING_FACTOR.mul(98).div(100))
        .priceCurve(priceCurve)
        .deadline(deadline)
        .swapper(constants.AddressZero)
        .nonce(BigNumber.from(100))
        .auctionTargetBlock(100)
        .supplementalPriceCurve([])
        .build()

      expect(order.info.priceCurve.length).toEqual(2)
    })

    it('Allows neutral (1e18) element between elements on same side', () => {
      const deadline = Math.floor(Date.now() / 1000) + 1000
      const priceCurve = [
        encodePriceCurveElement(5, BASE_SCALING_FACTOR.mul(102).div(100)), // 1.02e18
        encodePriceCurveElement(5, BASE_SCALING_FACTOR), // 1e18 (neutral)
        encodePriceCurveElement(5, BASE_SCALING_FACTOR.mul(105).div(100)), // 1.05e18
      ]

      const order = builder
        .cosigner(constants.AddressZero)
        .cosignature(VALID_COSIGNATURE)
        .input({ token: INPUT_TOKEN, maxAmount: INPUT_MAX_AMOUNT })
        .output({ token: OUTPUT_TOKEN, minAmount: OUTPUT_MIN_AMOUNT, recipient: constants.AddressZero })
        .auctionStartBlock(100)
        .baselinePriorityFee(0)
        .scalingFactor(BASE_SCALING_FACTOR)
        .priceCurve(priceCurve)
        .deadline(deadline)
        .swapper(constants.AddressZero)
        .nonce(BigNumber.from(100))
        .auctionTargetBlock(100)
        .supplementalPriceCurve([])
        .build()

      expect(order.info.priceCurve.length).toEqual(3)
    })

    it('Allows price curve starting with neutral (1e18) followed by > 1e18', () => {
      const deadline = Math.floor(Date.now() / 1000) + 1000
      const priceCurve = [
        encodePriceCurveElement(5, BASE_SCALING_FACTOR), // 1e18 (neutral)
        encodePriceCurveElement(5, BASE_SCALING_FACTOR.mul(105).div(100)), // 1.05e18
      ]

      const order = builder
        .cosigner(constants.AddressZero)
        .cosignature(VALID_COSIGNATURE)
        .input({ token: INPUT_TOKEN, maxAmount: INPUT_MAX_AMOUNT })
        .output({ token: OUTPUT_TOKEN, minAmount: OUTPUT_MIN_AMOUNT, recipient: constants.AddressZero })
        .auctionStartBlock(100)
        .baselinePriorityFee(0)
        .scalingFactor(BASE_SCALING_FACTOR)
        .priceCurve(priceCurve)
        .deadline(deadline)
        .swapper(constants.AddressZero)
        .nonce(BigNumber.from(100))
        .auctionTargetBlock(100)
        .supplementalPriceCurve([])
        .build()

      expect(order.info.priceCurve.length).toEqual(2)
    })

    it('Throws if price curve mixes directions (> 1e18 followed by < 1e18)', () => {
      const deadline = Math.floor(Date.now() / 1000) + 1000
      const priceCurve = [
        encodePriceCurveElement(5, BASE_SCALING_FACTOR.mul(102).div(100)), // 1.02e18
        encodePriceCurveElement(5, BASE_SCALING_FACTOR.mul(98).div(100)), // 0.98e18 - different direction!
      ]

      expect(() =>
        builder
          .cosigner(constants.AddressZero)
          .cosignature(VALID_COSIGNATURE)
          .input({ token: INPUT_TOKEN, maxAmount: INPUT_MAX_AMOUNT })
          .output({ token: OUTPUT_TOKEN, minAmount: OUTPUT_MIN_AMOUNT, recipient: constants.AddressZero })
          .auctionStartBlock(100)
          .baselinePriorityFee(0)
          .scalingFactor(BASE_SCALING_FACTOR)
          .priceCurve(priceCurve)
          .deadline(deadline)
          .swapper(constants.AddressZero)
          .nonce(BigNumber.from(100))
          .auctionTargetBlock(100)
          .supplementalPriceCurve([])
          .build()
      ).toThrow('Price curve scaling factors must share direction')
    })

    it('Throws if price curve has neutral then mixes directions', () => {
      const deadline = Math.floor(Date.now() / 1000) + 1000
      const priceCurve = [
        encodePriceCurveElement(5, BASE_SCALING_FACTOR), // 1e18 (neutral)
        encodePriceCurveElement(5, BASE_SCALING_FACTOR.mul(102).div(100)), // 1.02e18
        encodePriceCurveElement(5, BASE_SCALING_FACTOR.mul(98).div(100)), // 0.98e18 - different direction!
      ]

      expect(() =>
        builder
          .cosigner(constants.AddressZero)
          .cosignature(VALID_COSIGNATURE)
          .input({ token: INPUT_TOKEN, maxAmount: INPUT_MAX_AMOUNT })
          .output({ token: OUTPUT_TOKEN, minAmount: OUTPUT_MIN_AMOUNT, recipient: constants.AddressZero })
          .auctionStartBlock(100)
          .baselinePriorityFee(0)
          .scalingFactor(BASE_SCALING_FACTOR)
          .priceCurve(priceCurve)
          .deadline(deadline)
          .swapper(constants.AddressZero)
          .nonce(BigNumber.from(100))
          .auctionTargetBlock(100)
          .supplementalPriceCurve([])
          .build()
      ).toThrow('Price curve scaling factors must share direction')
    })

    it('Allows all neutral (1e18) elements', () => {
      const deadline = Math.floor(Date.now() / 1000) + 1000
      const priceCurve = [
        encodePriceCurveElement(5, BASE_SCALING_FACTOR), // 1e18
        encodePriceCurveElement(5, BASE_SCALING_FACTOR), // 1e18
      ]

      const order = builder
        .cosigner(constants.AddressZero)
        .cosignature(VALID_COSIGNATURE)
        .input({ token: INPUT_TOKEN, maxAmount: INPUT_MAX_AMOUNT })
        .output({ token: OUTPUT_TOKEN, minAmount: OUTPUT_MIN_AMOUNT, recipient: constants.AddressZero })
        .auctionStartBlock(100)
        .baselinePriorityFee(0)
        .scalingFactor(BASE_SCALING_FACTOR)
        .priceCurve(priceCurve)
        .deadline(deadline)
        .swapper(constants.AddressZero)
        .nonce(BigNumber.from(100))
        .auctionTargetBlock(100)
        .supplementalPriceCurve([])
        .build()

      expect(order.info.priceCurve.length).toEqual(2)
    })
  })

  describe('Edge cases', () => {
    it('Build order with zero baseline priority fee', () => {
      const deadline = Math.floor(Date.now() / 1000) + 1000
      const order = builder
        .cosigner(constants.AddressZero)
        .cosignature(VALID_COSIGNATURE)
        .input({
          token: INPUT_TOKEN,
          maxAmount: INPUT_MAX_AMOUNT,
        })
        .output({
          token: OUTPUT_TOKEN,
          minAmount: OUTPUT_MIN_AMOUNT,
          recipient: constants.AddressZero,
        })
        .auctionStartBlock(0)
        .baselinePriorityFee(0)
        .scalingFactor(BASE_SCALING_FACTOR)
        .priceCurve([])
        .deadline(deadline)
        .swapper(constants.AddressZero)
        .nonce(BigNumber.from(100))
        .auctionTargetBlock(0)
        .supplementalPriceCurve([])
        .build()

      expect(order.info.auctionStartBlock).toEqual(BigNumber.from(0))
      expect(order.info.baselinePriorityFee).toEqual(BigNumber.from(0))
    })

    it('Build order with neutral scaling factor (1e18)', () => {
      const deadline = Math.floor(Date.now() / 1000) + 1000
      const order = builder
        .cosigner(constants.AddressZero)
        .cosignature(VALID_COSIGNATURE)
        .input({
          token: INPUT_TOKEN,
          maxAmount: INPUT_MAX_AMOUNT,
        })
        .output({
          token: OUTPUT_TOKEN,
          minAmount: OUTPUT_MIN_AMOUNT,
          recipient: constants.AddressZero,
        })
        .auctionStartBlock(100)
        .baselinePriorityFee(0)
        .scalingFactor(BASE_SCALING_FACTOR) // neutral 1e18
        .priceCurve([])
        .deadline(deadline)
        .swapper(constants.AddressZero)
        .nonce(BigNumber.from(100))
        .auctionTargetBlock(100)
        .supplementalPriceCurve([])
        .build()

      expect(order.info.scalingFactor).toEqual(BASE_SCALING_FACTOR)
    })

    it('Build order with empty price curve', () => {
      const deadline = Math.floor(Date.now() / 1000) + 1000
      const order = builder
        .cosigner(constants.AddressZero)
        .cosignature(VALID_COSIGNATURE)
        .input({
          token: INPUT_TOKEN,
          maxAmount: INPUT_MAX_AMOUNT,
        })
        .output({
          token: OUTPUT_TOKEN,
          minAmount: OUTPUT_MIN_AMOUNT,
          recipient: constants.AddressZero,
        })
        .auctionStartBlock(0)
        .baselinePriorityFee(0)
        .scalingFactor(BASE_SCALING_FACTOR)
        .priceCurve([])
        .deadline(deadline)
        .swapper(constants.AddressZero)
        .nonce(BigNumber.from(100))
        .auctionTargetBlock(0)
        .supplementalPriceCurve([])
        .build()

      expect(order.info.priceCurve).toEqual([])
      expect(order.info.auctionStartBlock).toEqual(BigNumber.from(0))
    })

    it('Build order with very high scaling factor for exact-in', () => {
      const deadline = Math.floor(Date.now() / 1000) + 1000
      const highScalingFactor = BASE_SCALING_FACTOR.mul(2) // 2e18

      const order = builder
        .cosigner(constants.AddressZero)
        .cosignature(VALID_COSIGNATURE)
        .input({
          token: INPUT_TOKEN,
          maxAmount: INPUT_MAX_AMOUNT,
        })
        .output({
          token: OUTPUT_TOKEN,
          minAmount: OUTPUT_MIN_AMOUNT,
          recipient: constants.AddressZero,
        })
        .auctionStartBlock(100)
        .baselinePriorityFee(0)
        .scalingFactor(highScalingFactor)
        .priceCurve([])
        .deadline(deadline)
        .swapper(constants.AddressZero)
        .nonce(BigNumber.from(100))
        .auctionTargetBlock(100)
        .supplementalPriceCurve([])
        .build()

      expect(order.info.scalingFactor).toEqual(highScalingFactor)
    })

    it('Build order with very low scaling factor for exact-out', () => {
      const deadline = Math.floor(Date.now() / 1000) + 1000
      const lowScalingFactor = BASE_SCALING_FACTOR.div(2) // 0.5e18

      const order = builder
        .cosigner(constants.AddressZero)
        .cosignature(VALID_COSIGNATURE)
        .input({
          token: INPUT_TOKEN,
          maxAmount: INPUT_MAX_AMOUNT,
        })
        .output({
          token: OUTPUT_TOKEN,
          minAmount: OUTPUT_MIN_AMOUNT,
          recipient: constants.AddressZero,
        })
        .auctionStartBlock(100)
        .baselinePriorityFee(0)
        .scalingFactor(lowScalingFactor)
        .priceCurve([])
        .deadline(deadline)
        .swapper(constants.AddressZero)
        .nonce(BigNumber.from(100))
        .auctionTargetBlock(100)
        .supplementalPriceCurve([])
        .build()

      expect(order.info.scalingFactor).toEqual(lowScalingFactor)
    })
  })
})
