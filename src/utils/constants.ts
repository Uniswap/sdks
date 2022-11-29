import { BigNumber } from 'ethers'

export const UNIVERSAL_ROUTER_ADDRESS = (chainId: number): string => {
  switch (chainId) {
    case 1:
      return '0xDE96ea98BcFDD9622F29c8372CE2D5E05e3A2233'
    case 137:
      return '0x349e281b85bab90B897482AA7314a26Dfe3Ab334'
    case 10:
      return '0x7ff71e37d86Bf2D1dF048FdBf01ee4F9ec2e4acb'
    case 42161:
      return '0xd739bbFD0cCeC066F7636A47e59294C6101160Bb'
    case 42220:
      return '0x422Ce07B37fbDF724aBB31C048c2AA7677346900'
    default:
      throw new Error(`Universal Router not deployed on chain ${chainId}`)
  }
}
export const PERMIT2_ADDRESS = '0x000000000022D473030F116dDEE9F6B43aC78BA3'

export const CONTRACT_BALANCE = BigNumber.from(2).pow(255)
export const ETH_ADDRESS = '0x0000000000000000000000000000000000000000'

export const MSG_SENDER = '0x0000000000000000000000000000000000000001'
export const ADDRESS_THIS = '0x0000000000000000000000000000000000000002'
