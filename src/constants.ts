import JSBI from 'jsbi'

export enum SupportedChainId {
  MAINNET = 1,
  GOERLI = 5,

  ARBITRUM_ONE = 42161,
  ARBITRUM_GOERLI = 421613,

  OPTIMISM = 10,
  OPTIMISM_GOERLI = 420,

  POLYGON = 137,
  POLYGON_MUMBAI = 80001,

  CELO = 42220,
  CELO_ALFAJORES = 44787,

  BNB = 56
}

// exports for external consumption
export type BigintIsh = JSBI | string | number

export enum TradeType {
  EXACT_INPUT,
  EXACT_OUTPUT
}

export enum Rounding {
  ROUND_DOWN,
  ROUND_HALF_UP,
  ROUND_UP
}

export const MaxUint256 = JSBI.BigInt('0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff')
