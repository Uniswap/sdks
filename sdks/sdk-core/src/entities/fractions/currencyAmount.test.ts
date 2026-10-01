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

  describe('comparison', () => {
    const token1 = new Token(1, ADDRESS_ONE, 18)
    const token2 = new Token(1, '0x0000000000000000000000000000000000000002', 18)
    const amount1 = CurrencyAmount.fromRawAmount(token1, 100)
    const amount2 = CurrencyAmount.fromRawAmount(token1, 200)
    const amount3 = CurrencyAmount.fromRawAmount(token2, 100)

    it('lessThan', () => {
      expect(amount1.lessThan(amount2)).toBe(true)
      expect(amount2.lessThan(amount1)).toBe(false)
      expect(amount1.lessThan(0)).toBe(false)
      expect(amount1.lessThan(200)).toBe(true)
      expect(() => amount1.lessThan(amount3)).toThrow('CURRENCY')
    })

    it('equalTo', () => {
      expect(amount1.equalTo(amount2)).toBe(false)
      expect(amount1.equalTo(CurrencyAmount.fromRawAmount(token1, 100))).toBe(true)
      expect(amount1.equalTo(0)).toBe(false)
      expect(amount1.equalTo(100)).toBe(true)
      expect(() => amount1.equalTo(amount3)).toThrow('CURRENCY')
    })

    it('greaterThan', () => {
      expect(amount1.greaterThan(amount2)).toBe(false)
      expect(amount2.greaterThan(amount1)).toBe(true)
      expect(amount1.greaterThan(0)).toBe(true)
      expect(amount1.greaterThan(200)).toBe(false)
      expect(() => amount1.greaterThan(amount3)).toThrow('CURRENCY')
    })
  })
})
