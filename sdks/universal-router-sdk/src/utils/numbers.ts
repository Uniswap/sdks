import JSBI from 'jsbi'
import bn from 'bignumber.js'
import { Percent } from '@uniswap/sdk-core'
import { toHex } from '@uniswap/v3-sdk'

export function expandTo18DecimalsBN(n: number): bigint {
  // use bn intermediately to allow decimals in intermediate calculations
  return BigInt(new bn(n).times(new bn(10).pow(18)).toFixed())
}

export function expandTo18Decimals(n: number): JSBI {
  return JSBI.BigInt((BigInt(n) * 10n ** 18n).toString())
}

export function encodeFeeBips(fee: Percent): string {
  return toHex(fee.multiply(10_000).quotient)
}

const FULL_PORTION_PRECISION = JSBI.exponentiate(JSBI.BigInt(10), JSBI.BigInt(18))

export function encodeFee1e18(fee: Percent): string {
  return toHex(fee.multiply(FULL_PORTION_PRECISION).quotient)
}
