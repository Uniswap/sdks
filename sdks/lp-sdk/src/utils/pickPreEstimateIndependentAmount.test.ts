import { CurrencyAmount, Ether, Token } from '@uniswap/sdk-core'
import { pickPreEstimateIndependentAmount } from './pickPreEstimateIndependentAmount'

describe('pickPreEstimateIndependentAmount', () => {
  const USDC = new Token(1, '0x0000000000000000000000000000000000000001', 6, 'USDC')
  const WETH = new Token(1, '0x0000000000000000000000000000000000000002', 18, 'WETH')
  const ETH = Ether.onChain(1)

  it('returns null when both balances are zero', () => {
    const result = pickPreEstimateIndependentAmount(
      CurrencyAmount.fromRawAmount(USDC, 0),
      CurrencyAmount.fromRawAmount(WETH, 0)
    )
    expect(result).toBeNull()
  })

  it('returns the non-zero side when the other balance is zero', () => {
    const wethBalance = CurrencyAmount.fromRawAmount(WETH, (5n * 10n ** 18n).toString()) // 5 WETH
    const result = pickPreEstimateIndependentAmount(CurrencyAmount.fromRawAmount(USDC, 0), wethBalance)
    expect(result?.currency).toBe(WETH)
    expect(result?.quotient.toString()).toEqual((5n * 10n ** 18n).toString())
  })

  it('picks the side with the larger capped balance when both are below the cap', () => {
    // 100 USDC = 1e8 raw; 0.0001 WETH = 1e14 raw. WETH wins on raw units.
    const result = pickPreEstimateIndependentAmount(
      CurrencyAmount.fromRawAmount(USDC, (100n * 10n ** 6n).toString()),
      CurrencyAmount.fromRawAmount(WETH, (10n ** 14n).toString())
    )
    expect(result?.currency).toBe(WETH)
    expect(result?.quotient.toString()).toEqual((10n ** 14n).toString())
  })

  it('caps the returned amount at 10^(decimals + 3)', () => {
    // Whale: 1,000,000 WETH; cap for an 18-decimal token is 10^21 = 1000 WETH.
    const result = pickPreEstimateIndependentAmount(
      CurrencyAmount.fromRawAmount(USDC, 0),
      CurrencyAmount.fromRawAmount(WETH, (1_000_000n * 10n ** 18n).toString())
    )
    expect(result?.quotient.toString()).toEqual((10n ** 21n).toString())
  })

  it('prefers the first side when both sides cap equally', () => {
    const USDT = new Token(1, '0x0000000000000000000000000000000000000003', 6, 'USDT')
    const result = pickPreEstimateIndependentAmount(
      CurrencyAmount.fromRawAmount(USDC, (10n ** 9n).toString()),
      CurrencyAmount.fromRawAmount(USDT, (10n ** 9n).toString())
    )
    expect(result?.currency).toBe(USDC)
    expect(result?.quotient.toString()).toEqual((10n ** 9n).toString())
  })

  it('supports native currency balances', () => {
    const result = pickPreEstimateIndependentAmount(
      CurrencyAmount.fromRawAmount(ETH, (3n * 10n ** 18n).toString()),
      CurrencyAmount.fromRawAmount(USDC, (100n * 10n ** 6n).toString())
    )
    expect(result?.currency).toBe(ETH)
    expect(result?.quotient.toString()).toEqual((3n * 10n ** 18n).toString())
  })
})
