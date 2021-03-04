// exports for external consumption
export type BigintIsh = bigint | string

export enum ChainId {
  MAINNET = 1,
  ROPSTEN = 3,
  RINKEBY = 4,
  GÖRLI = 5,
  KOVAN = 42
}

export enum TradeType {
  EXACT_INPUT,
  EXACT_OUTPUT
}

export enum Rounding {
  ROUND_DOWN,
  ROUND_HALF_UP,
  ROUND_UP
}

// exports for internal consumption
export const ZERO = BigInt(0)
export const ONE = BigInt(1)
export const TWO = BigInt(2)
export const THREE = BigInt(3)
export const TEN = BigInt(10)
export const ONE_HUNDRED = BigInt(100)
export const MaxUint256 = BigInt('0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff')
