import { BigNumber } from '@ethersproject/bignumber'

export const MaxUint160 = BigNumber.from('0xffffffffffffffffffffffffffffffffffffffff')
export const MaxUint256: BigNumber = BigNumber.from(
  '0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff'
)
export const MaxUint48: BigNumber = BigNumber.from('0xffffffffffff')

export const InstantExpiration: BigNumber = BigNumber.from(0)
