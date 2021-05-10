import { ChainId } from '../constants'
import { ETHER, Token } from '../entities'
import { currencyEquals } from './currencyEquals'

describe('#currencyEquals', () => {
  const ADDRESS_ZERO = '0x0000000000000000000000000000000000000000'
  const ADDRESS_ONE = '0x0000000000000000000000000000000000000001'

  const t0 = new Token(ChainId.MAINNET, ADDRESS_ZERO, 18)
  const t1 = new Token(ChainId.MAINNET, ADDRESS_ONE, 18)

  it('ether is ether', () => {
    expect(currencyEquals(ETHER, ETHER)).toStrictEqual(true)
  })
  it('ether is not token0', () => {
    expect(currencyEquals(ETHER, t0)).toStrictEqual(false)
  })
  it('token1 is not token0', () => {
    expect(currencyEquals(t1, t0)).toStrictEqual(false)
  })
  it('token0 is token0', () => {
    expect(currencyEquals(t0, t0)).toStrictEqual(true)
  })
  it('token0 is equal to another token0', () => {
    expect(currencyEquals(t0, new Token(ChainId.MAINNET, ADDRESS_ZERO, 18, 'symbol', 'name'))).toStrictEqual(true)
  })
})
