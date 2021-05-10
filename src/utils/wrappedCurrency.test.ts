import { ChainId } from '../constants'
import { ETHER, Token, WETH9 } from '../entities'
import { wrappedCurrency } from './wrappedCurrency'

describe('#wrappedCurrency', () => {
  const token = new Token(ChainId.MAINNET, '0x0000000000000000000000000000000000000001', 18)

  it('wraps ether', () => {
    expect(wrappedCurrency(ETHER, ChainId.RINKEBY)).toStrictEqual(WETH9[ChainId.RINKEBY])
  })
  it('does nothing to tokens', () => {
    expect(wrappedCurrency(token, ChainId.MAINNET)).toStrictEqual(token)
  })
  it('throws if different network ', () => {
    expect(() => wrappedCurrency(token, ChainId.RINKEBY)).toThrow('CHAIN_ID')
  })
})
