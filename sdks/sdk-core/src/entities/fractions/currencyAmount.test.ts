import JSBI from 'jsbi'
import { MaxUint256 } from '../../constants'
import { Ether } from '../ether'
import { Token } from '../token'
import { CurrencyAmount } from './currencyAmount'
import { Percent } from './percent'

describe('CurrencyAmount', () => {
  const ADDRESS_ONE = '0x0000000000000000000000000000000000000001'

  describe('constructor', () => {
    it('works', () => {
      const token = new Token(1, ADDRESS_ONE, 18)
      const amount = CurrencyAmount.fromRawAmount(token, 100)
      expect(amount.quotient).toEqual(JSBI.BigInt(100))
    })
  })

  describe('#quotient', () => {
    it('returns the amount after multiplication', () => {
      const token = new Token(1, ADDRESS_ONE, 18)
      const amount = CurrencyAmount.fromRawAmount(token, 100).multiply(new Percent(15, 100))
      expect(amount.quotient).toEqual(JSBI.BigInt(15))
    })
  })

  describe('#ether', () => {
    it('produces ether amount', () => {
      const amount = CurrencyAmount.fromRawAmount(Ether.onChain(1), 100)
      expect(amount.quotient).toEqual(JSBI.BigInt(100))
      expect(amount.currency).toEqual(Ether.onChain(1))
    })
  })

  it('token amount can be max uint256', () => {
    const amount = CurrencyAmount.fromRawAmount(new Token(1, ADDRESS_ONE, 18), MaxUint256)
    expect(amount.quotient).toEqual(MaxUint256)
  })
  it('token amount cannot exceed max uint256', () => {
    expect(() =>
      CurrencyAmount.fromRawAmount(new Token(1, ADDRESS_ONE, 18), JSBI.add(MaxUint256, JSBI.BigInt(1)))
    ).toThrow('AMOUNT')
  })
  it('token amount quotient cannot exceed max uint256', () => {
    expect(() =>
      CurrencyAmount.fromFractionalAmount(
        new Token(1, ADDRESS_ONE, 18),
        JSBI.add(JSBI.multiply(MaxUint256, JSBI.BigInt(2)), JSBI.BigInt(2)),
        JSBI.BigInt(2)
      )
    ).toThrow('AMOUNT')
  })
  it('token amount numerator can be gt. uint256 if denominator is gt. 1', () => {
    const amount = CurrencyAmount.fromFractionalAmount(
      new Token(1, ADDRESS_ONE, 18),
      JSBI.add(MaxUint256, JSBI.BigInt(2)),
      2
    )
    expect(amount.numerator).toEqual(JSBI.add(JSBI.BigInt(2), MaxUint256))
  })

  describe('#toFixed', () => {
    it('throws for decimals > currency.decimals', () => {
      const token = new Token(1, ADDRESS_ONE, 0)
      const amount = CurrencyAmount.fromRawAmount(token, 1000)
      expect(() => amount.toFixed(3)).toThrow('DECIMALS')
    })
    it('is correct for 0 decimals', () => {
      const token = new Token(1, ADDRESS_ONE, 0)
      const amount = CurrencyAmount.fromRawAmount(token, 123456)
      expect(amount.toFixed(0)).toEqual('123456')
    })
    it('is correct for 18 decimals', () => {
      const token = new Token(1, ADDRESS_ONE, 18)
      const amount = CurrencyAmount.fromRawAmount(token, 1e15)
      expect(amount.toFixed(9)).toEqual('0.001000000')
    })
  })

  describe('#toSignificant', () => {
    it('does not throw for sig figs > currency.decimals', () => {
      const token = new Token(1, ADDRESS_ONE, 0)
      const amount = CurrencyAmount.fromRawAmount(token, 1000)
      expect(amount.toSignificant(3)).toEqual('1000')
    })
    it('is correct for 0 decimals', () => {
      const token = new Token(1, ADDRESS_ONE, 0)
      const amount = CurrencyAmount.fromRawAmount(token, 123456)
      expect(amount.toSignificant(4)).toEqual('123400')
    })
    it('is correct for 18 decimals', () => {
      const token = new Token(1, ADDRESS_ONE, 18)
      const amount = CurrencyAmount.fromRawAmount(token, 1e15)
      expect(amount.toSignificant(9)).toEqual('0.001')
    })
  })

  describe('comparators', () => {
    const tokenA = new Token(1, ADDRESS_ONE, 18)
    const tokenB = new Token(1, '0x0000000000000000000000000000000000000002', 18)

    it('lessThan returns true when first amount is smaller', () => {
      const a = CurrencyAmount.fromRawAmount(tokenA, 1)
      const b = CurrencyAmount.fromRawAmount(tokenA, 2)
      expect(a.lessThan(b)).toBe(true)
      expect(b.lessThan(a)).toBe(false)
    })

    it('equalTo returns true for equal amounts of the same currency', () => {
      const a = CurrencyAmount.fromRawAmount(tokenA, 100)
      const b = CurrencyAmount.fromRawAmount(tokenA, 100)
      expect(a.equalTo(b)).toBe(true)
    })

    it('greaterThan returns true when first amount is larger', () => {
      const a = CurrencyAmount.fromRawAmount(tokenA, 5)
      const b = CurrencyAmount.fromRawAmount(tokenA, 1)
      expect(a.greaterThan(b)).toBe(true)
    })

    it('comparison against the literal 0 sentinel works without currency check', () => {
      const zero = CurrencyAmount.fromRawAmount(tokenA, 0)
      const nonZero = CurrencyAmount.fromRawAmount(tokenA, 1)
      expect(zero.equalTo(0)).toBe(true)
      expect(nonZero.greaterThan(0)).toBe(true)
      expect(zero.lessThan(0)).toBe(false)
    })

    it('only the literal 0 sentinel is accepted as a non-CurrencyAmount operand', () => {
      const amount = CurrencyAmount.fromRawAmount(tokenA, 1)
      // @ts-expect-error — non-zero BigintIsh is rejected by the narrowed type
      expect(() => amount.greaterThan(JSBI.BigInt(5))).toThrow()
      // @ts-expect-error — strings are rejected by the narrowed type
      expect(() => amount.equalTo('1')).toThrow()
    })

    it('throws CURRENCY when comparing different currencies', () => {
      const a = CurrencyAmount.fromRawAmount(tokenA, 1)
      const b = CurrencyAmount.fromRawAmount(tokenB, 1)
      expect(() => a.lessThan(b)).toThrow('CURRENCY')
      expect(() => a.equalTo(b)).toThrow('CURRENCY')
      expect(() => a.greaterThan(b)).toThrow('CURRENCY')
    })
  })

  describe('#toExact', () => {
    it('does not throw for sig figs > currency.decimals', () => {
      const token = new Token(1, ADDRESS_ONE, 0)
      const amount = CurrencyAmount.fromRawAmount(token, 1000)
      expect(amount.toExact()).toEqual('1000')
    })
    it('is correct for 0 decimals', () => {
      const token = new Token(1, ADDRESS_ONE, 0)
      const amount = CurrencyAmount.fromRawAmount(token, 123456)
      expect(amount.toExact()).toEqual('123456')
    })
    it('is correct for 18 decimals', () => {
      const token = new Token(1, ADDRESS_ONE, 18)
      const amount = CurrencyAmount.fromRawAmount(token, 123e13)
      expect(amount.toExact()).toEqual('0.00123')
    })
  })
})
