import JSBI from 'jsbi'
import { ChainId } from '../../constants'
import { Token } from '../token'
import CurrencyAmount from './CurrencyAmount'
import TokenAmount from './tokenAmount'

describe('CurrencyAmount', () => {
  const ADDRESS_ONE = '0x0000000000000000000000000000000000000001'

  describe('constructor', () => {
    it('works', () => {
      const token = new Token(ChainId.MAINNET, ADDRESS_ONE, 18)
      const amount = new TokenAmount(token, 100)
      expect(amount.raw).toEqual(JSBI.BigInt(100))
    })
  })

  describe('#ether', () => {
    it('produces ether amount', () => {
      const amount = CurrencyAmount.ether(100)
      expect(amount.raw).toEqual(JSBI.BigInt(100))
    })
  })
})
