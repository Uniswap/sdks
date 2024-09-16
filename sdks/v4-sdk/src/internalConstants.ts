import JSBI from 'jsbi'
import { constants } from 'ethers'
import {encodeSqrtRatioX96} from '@uniswap/v3-sdk'

// constants used internally but not expected to be used externally
export const ADDRESS_ZERO = constants.AddressZero
export const NEGATIVE_ONE = JSBI.BigInt(-1)
export const ZERO = JSBI.BigInt(0)
export const ONE = JSBI.BigInt(1)
export const ONE_ETHER = JSBI.exponentiate(JSBI.BigInt(10), JSBI.BigInt(18))

// used in liquidity amount math
export const Q96 = JSBI.exponentiate(JSBI.BigInt(2), JSBI.BigInt(96))
export const Q192 = JSBI.exponentiate(Q96, JSBI.BigInt(2))

// pool setup
export const FEE_AMOUNT_LOW = 100
export const FEE_AMOUNT_MEDIUM = 3000
export const FEE_AMOUNT_HIGHEST = 10_000
export const TICK_SPACING_TEN = 10
export const TICK_SPACING_SIXTY = 60

// used in position manager math
export const MIN_SLIPPAGE_DECREASE = 0

// default prices
export const SQRT_PRICE_1_1 = encodeSqrtRatioX96(1, 1)

// default hook addresses
export const EMPTY_HOOK = '0x0000000000000000000000000000000000000000'

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
