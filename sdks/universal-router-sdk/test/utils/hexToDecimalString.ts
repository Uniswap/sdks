import { BigNumberish } from 'ethers'

export function hexToDecimalString(hex: BigNumberish) {
  return BigInt(hex).toString()
}
