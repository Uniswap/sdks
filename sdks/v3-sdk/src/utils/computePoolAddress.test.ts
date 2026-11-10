import { ChainId, Token } from '@uniswap/sdk-core'
import { FeeAmount } from '../constants'
import { computePoolAddress } from './computePoolAddress'

describe('#computePoolAddress', () => {
  const factoryAddress = '0x1111111111111111111111111111111111111111'
  it('should correctly compute the pool address', () => {
    const tokenA = new Token(1, '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', 18, 'USDC', 'USD Coin')
    const tokenB = new Token(1, '0x6B175474E89094C44Da98b954EedeAC495271d0F', 18, 'DAI', 'DAI Stablecoin')
    const result = computePoolAddress({
      factoryAddress,
      fee: FeeAmount.LOW,
      tokenA,
      tokenB,
    })

    expect(result).toEqual('0x90B1b09A9715CaDbFD9331b3A7652B24BfBEfD32')
  })

  it('should correctly compute the pool address', () => {
    const USDC = new Token(1, '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', 18, 'USDC', 'USD Coin')
    const DAI = new Token(1, '0x6B175474E89094C44Da98b954EedeAC495271d0F', 18, 'DAI', 'DAI Stablecoin')
    let tokenA = USDC
    let tokenB = DAI
    const resultA = computePoolAddress({
      factoryAddress,
      fee: FeeAmount.LOW,
      tokenA,
      tokenB,
    })

    tokenA = DAI

    tokenB = USDC
    const resultB = computePoolAddress({
      factoryAddress,
      fee: FeeAmount.LOW,
      tokenA,
      tokenB,
    })

    expect(resultA).toEqual(resultB)
  })

  it('should correctly compute zkSync pool addresses in either token order', () => {
    const USDCE = new Token(324, '0x3355df6D4c9C3035724Fd0e3914dE96A5a83aaf4', 6, 'USDC.e', 'Bridged USDC (zkSync)')
    const WETH = new Token(324, '0x5AEa5775959fBC2557Cc8789bC1bf90A239D9a91', 18, 'WETH', 'Wrapped Ether')
    const factoryAddress = '0x8FdA5a7a8dCA67BBcDd10F02Fa0649A937215422'
    const expectedAddress = '0xff577f0E828a878743Ecc5E2632cbf65ceCf17cF'

    expect(
      computePoolAddress({
        factoryAddress,
        tokenA: USDCE,
        tokenB: WETH,
        fee: FeeAmount.MEDIUM,
        chainId: ChainId.ZKSYNC,
      })
    ).toEqual(expectedAddress)
    expect(
      computePoolAddress({
        factoryAddress,
        tokenA: WETH,
        tokenB: USDCE,
        fee: FeeAmount.MEDIUM,
        chainId: ChainId.ZKSYNC,
      })
    ).toEqual(expectedAddress)
  })
})
