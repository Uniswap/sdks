import JSBI from 'jsbi'
import { ChainId, MaxUint256 } from '../../constants'
import { Token } from '../token'
import CurrencyAmount from './currencyAmount'
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

  it('token amount can be max uint256', () => {
    const amount = new TokenAmount(new Token(ChainId.MAINNET, ADDRESS_ONE, 18), MaxUint256)
    expect(amount.raw).toEqual(MaxUint256)
  })
})
