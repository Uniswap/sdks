import { ChainId } from '../../constants'
import { Token } from '../token'
import CurrencyAmount from './currencyAmount'
import Price from './price'

describe('Price', () => {
  const ADDRESS_ZERO = '0x0000000000000000000000000000000000000000'
  const ADDRESS_ONE = '0x0000000000000000000000000000000000000001'

  const t0 = new Token(ChainId.MAINNET, ADDRESS_ZERO, 18)
  const t1 = new Token(ChainId.MAINNET, ADDRESS_ONE, 18)

  describe('#quote', () => {
    it('returns correct value', () => {
      const price = new Price(t0, t1, 1, 5)
      expect(price.quote(CurrencyAmount.fromRawAmount(t0, 10))).toEqual(CurrencyAmount.fromRawAmount(t1, 50))
    })
  })
})
