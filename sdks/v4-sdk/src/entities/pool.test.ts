import { Token, CurrencyAmount, WETH9 } from '@uniswap/sdk-core'
import { Pool } from './pool'
import JSBI from 'jsbi'
import { nearestUsableTick, encodeSqrtRatioX96, TickMath } from '@uniswap/v3-sdk'
import { constants } from 'ethers'


const FEE_AMOUNT_LOW = 100
const FEE_AMOUNT_MEDIUM = 3000
const FEE_AMOUNT_HIGHEST = 10_000
const TICK_SPACING_TEN = 10
const ONE_ETHER = JSBI.exponentiate(JSBI.BigInt(10), JSBI.BigInt(18))
const NEGATIVE_ONE = JSBI.BigInt(-1)
const ADDRESS_ZERO = constants.AddressZero

describe('Pool', () => {
  const USDC = new Token(1, '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', 6, 'USDC', 'USD Coin')
  const DAI = new Token(1, '0x6B175474E89094C44Da98b954EedeAC495271d0F', 18, 'DAI', 'DAI Stablecoin')

  describe('constructor', () => {
    it('cannot be used for currencies on different chains', () => {
      expect(() => {
        new Pool(USDC, WETH9[3], FEE_AMOUNT_MEDIUM, TICK_SPACING_TEN, ADDRESS_ZERO, encodeSqrtRatioX96(1, 1), 0, 0, [])
      }).toThrow('CHAIN_IDS')
    })

    it('fee must be integer', () => {
      expect(() => {
        new Pool(USDC, WETH9[1], FEE_AMOUNT_MEDIUM + 0.5, TICK_SPACING_TEN, ADDRESS_ZERO, encodeSqrtRatioX96(1, 1), 0, 0, [])
      }).toThrow('FEE')
    })

    it('fee cannot be more than 1e6', () => {
      expect(() => {
        new Pool(USDC, WETH9[1], 1e6, TICK_SPACING_TEN, ADDRESS_ZERO, encodeSqrtRatioX96(1, 1), 0, 0, [])
      }).toThrow('FEE')
    })

    it('cannot be given two of the same currency', () => {
      expect(() => {
        new Pool(USDC, USDC, FEE_AMOUNT_MEDIUM, TICK_SPACING_TEN, ADDRESS_ZERO, encodeSqrtRatioX96(1, 1), 0, 0, [])
      }).toThrow('ADDRESSES')
    })

    it('price must be within tick price bounds', () => {
      expect(() => {
        new Pool(USDC, WETH9[1], FEE_AMOUNT_MEDIUM, TICK_SPACING_TEN, ADDRESS_ZERO, encodeSqrtRatioX96(1, 1), 0, 1, [])
      }).toThrow('PRICE_BOUNDS')
      expect(() => {
        new Pool(USDC, WETH9[1], FEE_AMOUNT_MEDIUM,  TICK_SPACING_TEN, ADDRESS_ZERO, JSBI.add(encodeSqrtRatioX96(1, 1), JSBI.BigInt(1)), 0, -1, [])
      }).toThrow('PRICE_BOUNDS')
    })

    it('works with valid arguments for empty pool medium fee', () => {
      new Pool(USDC, WETH9[1], FEE_AMOUNT_MEDIUM, TICK_SPACING_TEN, ADDRESS_ZERO, encodeSqrtRatioX96(1, 1), 0, 0, [])
    })

    it('works with valid arguments for empty pool lowest fee', () => {
      new Pool(USDC, WETH9[1], 1, TICK_SPACING_TEN, ADDRESS_ZERO, encodeSqrtRatioX96(1, 1), 0, 0, [])
    })

    it('works with valid arguments for empty pool highest fee', () => {
      new Pool(USDC, WETH9[1], FEE_AMOUNT_HIGHEST, TICK_SPACING_TEN, ADDRESS_ZERO, encodeSqrtRatioX96(1, 1), 0, 0, [])
    })
  })

  describe('#getPoolId', () => {
    it('matches an example', () => {
      const result = Pool.getPoolId(USDC, DAI, FEE_AMOUNT_LOW, TICK_SPACING_TEN, ADDRESS_ZERO)
      expect(result).toEqual('0x503fb8d73fd2351c645ae9fea85381bac6b16ea0c2038e14dc1e96d447c8ffbb')
    })
  })

  describe('#currency0', () => {
    it('always is the currency that sorts before', () => {
      let pool = new Pool(USDC, DAI, FEE_AMOUNT_LOW, TICK_SPACING_TEN, ADDRESS_ZERO, encodeSqrtRatioX96(1, 1), 0, 0, [])
      expect(pool.currency0).toEqual(DAI)
      pool = new Pool(DAI, USDC, FEE_AMOUNT_LOW, TICK_SPACING_TEN, ADDRESS_ZERO, encodeSqrtRatioX96(1, 1), 0, 0, [])
      expect(pool.currency0).toEqual(DAI)
    })
  })
  describe('#currency1', () => {
    it('always is the currency that sorts after', () => {
      let pool = new Pool(USDC, DAI, FEE_AMOUNT_LOW, TICK_SPACING_TEN, ADDRESS_ZERO, encodeSqrtRatioX96(1, 1), 0, 0, [])
      expect(pool.currency1).toEqual(USDC)
      pool = new Pool(DAI, USDC, FEE_AMOUNT_LOW, TICK_SPACING_TEN, ADDRESS_ZERO, encodeSqrtRatioX96(1, 1), 0, 0, [])
      expect(pool.currency1).toEqual(USDC)
    })
  })

  describe('#currency0Price', () => {
    it('returns price of currency0 in terms of currency1', () => {
      expect(
        new Pool(
          USDC,
          DAI,
          FEE_AMOUNT_LOW,
          TICK_SPACING_TEN,
          ADDRESS_ZERO,
          encodeSqrtRatioX96(101e6, 100e18),
          0,
          TickMath.getTickAtSqrtRatio(encodeSqrtRatioX96(101e6, 100e18)),
          []
        ).currency0Price.toSignificant(5)
      ).toEqual('1.01')
      expect(
        new Pool(
          DAI,
          USDC,
          FEE_AMOUNT_LOW,
          TICK_SPACING_TEN,
          ADDRESS_ZERO,
          encodeSqrtRatioX96(101e6, 100e18),
          0,
          TickMath.getTickAtSqrtRatio(encodeSqrtRatioX96(101e6, 100e18)),
          []
        ).currency0Price.toSignificant(5)
      ).toEqual('1.01')
    })
  })

  describe('#currency1Price', () => {
    it('returns price of currency1 in terms of currency0', () => {
      expect(
        new Pool(
          USDC,
          DAI,
          FEE_AMOUNT_LOW,
          TICK_SPACING_TEN,
          ADDRESS_ZERO,
          encodeSqrtRatioX96(101e6, 100e18),
          0,
          TickMath.getTickAtSqrtRatio(encodeSqrtRatioX96(101e6, 100e18)),
          []
        ).currency1Price.toSignificant(5)
      ).toEqual('0.9901')
      expect(
        new Pool(
          DAI,
          USDC,
          FEE_AMOUNT_LOW,
          TICK_SPACING_TEN,
          ADDRESS_ZERO,
          encodeSqrtRatioX96(101e6, 100e18),
          0,
          TickMath.getTickAtSqrtRatio(encodeSqrtRatioX96(101e6, 100e18)),
          []
        ).currency1Price.toSignificant(5)
      ).toEqual('0.9901')
    })
  })

  describe('#priceOf', () => {
    const pool = new Pool(USDC, DAI, FEE_AMOUNT_LOW, TICK_SPACING_TEN, ADDRESS_ZERO, encodeSqrtRatioX96(1, 1), 0, 0, [])
    it('returns price of currency in terms of other currency', () => {
      expect(pool.priceOf(DAI)).toEqual(pool.currency0Price)
      expect(pool.priceOf(USDC)).toEqual(pool.currency1Price)
    })

    it('throws if invalid currency', () => {
      expect(() => pool.priceOf(WETH9[1])).toThrow('CURRENCY')
    })
  })

  describe('#chainId', () => {
    it('returns the currency0 chainId', () => {
      let pool = new Pool(USDC, DAI, FEE_AMOUNT_LOW, TICK_SPACING_TEN, ADDRESS_ZERO, encodeSqrtRatioX96(1, 1), 0, 0, [])
      expect(pool.chainId).toEqual(1)
      pool = new Pool(DAI, USDC, FEE_AMOUNT_LOW, TICK_SPACING_TEN, ADDRESS_ZERO, encodeSqrtRatioX96(1, 1), 0, 0, [])
      expect(pool.chainId).toEqual(1)
    })
  })

  describe('#involvesCurrency', () => {
    const pool = new Pool(USDC, DAI, FEE_AMOUNT_LOW, TICK_SPACING_TEN, ADDRESS_ZERO, encodeSqrtRatioX96(1, 1), 0, 0, [])
    expect(pool.involvesCurrency(USDC)).toEqual(true)
    expect(pool.involvesCurrency(DAI)).toEqual(true)
    expect(pool.involvesCurrency(WETH9[1])).toEqual(false)
  })

  describe('swaps', () => {
    let pool: Pool

    beforeEach(() => {
      pool = new Pool(USDC, DAI, FEE_AMOUNT_LOW, TICK_SPACING_TEN, ADDRESS_ZERO, encodeSqrtRatioX96(1, 1), ONE_ETHER, 0, [
        {
          index: nearestUsableTick(TickMath.MIN_TICK, TICK_SPACING_TEN),
          liquidityNet: ONE_ETHER,
          liquidityGross: ONE_ETHER,
        },
        {
          index: nearestUsableTick(TickMath.MAX_TICK, TICK_SPACING_TEN),
          liquidityNet: JSBI.multiply(ONE_ETHER, NEGATIVE_ONE),
          liquidityGross: ONE_ETHER,
        },
      ])
    })

    describe('#getOutputAmount', () => {
      it('USDC -> DAI', async () => {
        const inputAmount = CurrencyAmount.fromRawAmount(USDC, 100)
        const [outputAmount] = await pool.getOutputAmount(inputAmount)
        expect(outputAmount.currency.equals(DAI)).toBe(true)
        expect(outputAmount.quotient).toEqual(JSBI.BigInt(98))
      })

      it('DAI -> USDC', async () => {
        const inputAmount = CurrencyAmount.fromRawAmount(DAI, 100)
        const [outputAmount] = await pool.getOutputAmount(inputAmount)
        expect(outputAmount.currency.equals(USDC)).toBe(true)
        expect(outputAmount.quotient).toEqual(JSBI.BigInt(98))
      })
    })

    describe('#getInputAmount', () => {
      it('USDC -> DAI', async () => {
        const outputAmount = CurrencyAmount.fromRawAmount(DAI, 98)
        const [inputAmount] = await pool.getInputAmount(outputAmount)
        expect(inputAmount.currency.equals(USDC)).toBe(true)
        expect(inputAmount.quotient).toEqual(JSBI.BigInt(100))
      })

      it('DAI -> USDC', async () => {
        const outputAmount = CurrencyAmount.fromRawAmount(USDC, 98)
        const [inputAmount] = await pool.getInputAmount(outputAmount)
        expect(inputAmount.currency.equals(DAI)).toBe(true)
        expect(inputAmount.quotient).toEqual(JSBI.BigInt(100))
      })
    })
  })

  describe('#bigNums', () => {
    let pool: Pool
    const bigNum1 = JSBI.add(JSBI.BigInt(Number.MAX_SAFE_INTEGER), JSBI.BigInt(1))
    const bigNum2 = JSBI.add(JSBI.BigInt(Number.MAX_SAFE_INTEGER), JSBI.BigInt(1))
    beforeEach(() => {
      pool = new Pool(USDC, DAI, FEE_AMOUNT_LOW, TICK_SPACING_TEN, ADDRESS_ZERO, encodeSqrtRatioX96(bigNum1, bigNum2), ONE_ETHER, 0, [
        {
          index: nearestUsableTick(TickMath.MIN_TICK, TICK_SPACING_TEN),
          liquidityNet: ONE_ETHER,
          liquidityGross: ONE_ETHER,
        },
        {
          index: nearestUsableTick(TickMath.MAX_TICK, TICK_SPACING_TEN),
          liquidityNet: JSBI.multiply(ONE_ETHER, NEGATIVE_ONE),
          liquidityGross: ONE_ETHER,
        },
      ])
    })

    describe('#priceLimit', () => {
      it('correctly compares two BigIntegers', async () => {
        expect(bigNum1).toEqual(bigNum2)
      })
      it('correctly handles two BigIntegers', async () => {
        const inputAmount = CurrencyAmount.fromRawAmount(USDC, 100)
        const [outputAmount] = await pool.getOutputAmount(inputAmount)
        pool.getInputAmount(outputAmount)
        expect(outputAmount.currency.equals(DAI)).toBe(true)
        // if output is correct, function has succeeded
      })
    })
  })
})
