import { ChainId } from '../chains'
import { Ether } from './ether'
import { CurrencyAmount } from './fractions/currencyAmount'

describe('Ether', () => {
  it('static constructor uses cache', () => {
    // eslint-disable-next-line no-self-compare
    expect(Ether.onChain(1) === Ether.onChain(1)).toEqual(true)
  })
  it('caches once per chain ID', () => {
    expect(Ether.onChain(1) !== Ether.onChain(2)).toEqual(true)
  })
  it('#equals returns false for diff chains', () => {
    expect(Ether.onChain(1).equals(Ether.onChain(2))).toEqual(false)
  })
  it('#equals returns true for same chains', () => {
    expect(Ether.onChain(1).equals(Ether.onChain(1))).toEqual(true)
  })
  it('#wrapped returns Abstract WETH and preserves native amounts', () => {
    const ether = Ether.onChain(ChainId.ABSTRACT)
    const wrapped = ether.wrapped
    expect(wrapped.chainId).toEqual(ChainId.ABSTRACT)
    expect(wrapped.address).toEqual('0x3439153EB7AF838Ad19d56E1571FBD09333C2809')
    expect(wrapped.decimals).toEqual(18)
    expect(wrapped.symbol).toEqual('WETH')
    const amount = CurrencyAmount.fromRawAmount(ether, '1234567890123456789')
    expect(amount.wrapped.currency.equals(wrapped)).toEqual(true)
    expect(amount.wrapped.quotient.toString()).toEqual(amount.quotient.toString())
  })
  it('#wrapped returns Robinhood WETH', () => {
    expect(Ether.onChain(4663).wrapped.address).toEqual('0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73')
  })
  it('#wrapped throws for Arc because WETH is unsupported', () => {
    expect(() => Ether.onChain(5042).wrapped).toThrow('WRAPPED')
  })
})
