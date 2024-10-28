import { ChainId } from '@x-swap-protocol/sdk-core'

// @deprecated please use FACTORY_ADDRESSES[ChainId]
export const FACTORY_ADDRESS = '0x30f317a9ec0f0d06d5de0f8d248ec3506b7e4a8a'

export const FACTORY_ADDRESSES: { [chainId in ChainId]: string } = {
  [ChainId.XDC]: '0x30f317a9ec0f0d06d5de0f8d248ec3506b7e4a8a',
  [ChainId.APOTHEM]: '0xe91bf417b470ccc6b7307e58a5aa0644572981d7',
}

export const ADDRESS_ZERO = '0x0000000000000000000000000000000000000000'

// @deprecated please use poolInitCodeHash(chainId: ChainId)
export const POOL_INIT_CODE_HASH = '0xd191442867020895af7761f344ec15480865676419d842260d75b06e75e00136'

export function poolInitCodeHash(chainId?: ChainId): string {
  switch (chainId) {
    // case ChainId.ZKSYNC:
    //   return '0x010013f177ea1fcbc4520f9a3ca7cd2d1d77959e05aa66484027cb38e712aeed'
    default:
      return POOL_INIT_CODE_HASH
  }
}

/**
 * The default factory enabled fee amounts, denominated in hundredths of bips.
 */
export enum FeeAmount {
  LOWEST = 100,
  LOW = 500,
  MEDIUM = 3000,
  HIGH = 10000,
}

/**
 * The default factory tick spacings by fee amount.
 */
export const TICK_SPACINGS: { [amount in FeeAmount]: number } = {
  [FeeAmount.LOWEST]: 1,
  [FeeAmount.LOW]: 10,
  [FeeAmount.MEDIUM]: 60,
  [FeeAmount.HIGH]: 200,
}
