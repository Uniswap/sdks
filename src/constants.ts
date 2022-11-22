import { BigNumber } from '@ethersproject/bignumber'

export const PERMIT2_ADDRESS = '0x000000000022D473030F116dDEE9F6B43aC78BA3'

export const MaxUint160 = BigNumber.from('0xffffffffffffffffffffffffffffffffffffffff')
export const MaxUint256: BigNumber = BigNumber.from(
  '0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff'
)
export const MaxUint48: BigNumber = BigNumber.from('0xffffffffffff')

// alias max types for their usages
export const MaxAllowanceTransferAmount = MaxUint160
export const MaxSignatureTransferAmount: BigNumber = MaxUint256
export const MaxAllowanceExpiration: BigNumber = MaxUint48
export const MaxOrderedNonce: BigNumber = MaxUint48
export const MaxUnorderedNonce: BigNumber = MaxUint256
export const MaxSigDeadline: BigNumber = MaxUint256

export const InstantExpiration: BigNumber = BigNumber.from(0)
