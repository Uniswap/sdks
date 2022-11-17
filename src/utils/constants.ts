import { BigNumber } from 'ethers'

export const UNIVERSAL_ROUTER_ADDRESS = (chainId: number): string => {
  switch (chainId) {
    case 1:
      return '0x0000000052BE00bA3a005edbE83a0fB9aaDB964C'
    case 137:
      return '0x0Fe79af880457F544a8751B9360FfbB3D99fC60a'
    case 10:
      return '0xFcCF1af487bE1A1bB663a61334AE0C4C93bbCE21'
    case 42161:
      return '0x901712919bCDC37AA92E4AfC227d4a2D20621BB2'
    case 42220:
      return '0x17858afB362e9f8c327D90Cf558fa9518b20aE0C'
    default:
      throw new Error(`Universal Router not deployed on chain ${chainId}`)
  }
}
export const PERMIT2_ADDRESS = '0x6fEe9BeC3B3fc8f9DA5740f0efc6BbE6966cd6A6'

export const CONTRACT_BALANCE = BigNumber.from(2).pow(255)
export const ETH_ADDRESS = '0x0000000000000000000000000000000000000000'

export const MSG_SENDER = '0x0000000000000000000000000000000000000001'
export const ADDRESS_THIS = '0x0000000000000000000000000000000000000002'
