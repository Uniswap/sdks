import { ChainId } from '../constants'
import { CurrencyAmount, Token, WETH9 } from '../entities'
import { wrappedCurrencyAmount } from './wrappedCurrencyAmount'

describe('#wrappedCurrencyAmount', () => {
  const token = new Token(ChainId.MAINNET, '0x0000000000000000000000000000000000000001', 18)

  it('wraps ether', () => {
    expect(wrappedCurrencyAmount(CurrencyAmount.ether(10), ChainId.RINKEBY)).toEqual(
      CurrencyAmount.fromRawAmount(WETH9[ChainId.RINKEBY], 10)
    )
  })
  it('does nothing to tokens', () => {
    expect(wrappedCurrencyAmount(CurrencyAmount.fromRawAmount(token, 10), ChainId.MAINNET)).toEqual(
      CurrencyAmount.fromRawAmount(token, 10)
    )
  })
  it('throws if different network ', () => {
    expect(() => wrappedCurrencyAmount(CurrencyAmount.fromRawAmount(token, 10), ChainId.RINKEBY)).toThrow('CHAIN_ID')
  })
})
