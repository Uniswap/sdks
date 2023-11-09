import { BigNumber } from 'ethers'

type ChainConfig = {
  router: string
  creationBlock: number
  weth: string
  steth: string
  wsteth: string
}

export const NOT_SUPPORTED_ON_CHAIN = '0x0000000000000000000000000000000000000000'

const CHAIN_CONFIGS: { [key: number]: ChainConfig } = {
  // mainnet
  [1]: {
    router: '0x3fC91A3afd70395Cd496C647d5a6CC9D4B2b7FAD',
    weth: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
    steth: '0xae7ab96520de3a18e5e111b5eaab095312d7fe84',
    wsteth: '0x7f39c581f595b53c5cb19bd0b3f8da6c935e2ca0',
    creationBlock: 17143817,
  },
  // goerli
  [5]: {
    router: '0x3fC91A3afd70395Cd496C647d5a6CC9D4B2b7FAD',
    weth: '0xb4fbf271143f4fbf7b91a5ded31805e42b2208d6',
    steth: '0x1643E812aE58766192Cf7D2Cf9567dF2C37e9B7F',
    wsteth: '0x6320cD32aA674d2898A68ec82e869385Fc5f7E2f',
    creationBlock: 8940568,
  },
  // sepolia
  [11155111]: {
    router: '0x3fC91A3afd70395Cd496C647d5a6CC9D4B2b7FAD',
    weth: '0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14',
    steth: NOT_SUPPORTED_ON_CHAIN,
    wsteth: NOT_SUPPORTED_ON_CHAIN,
    creationBlock: 3543575,
  },
  // polygon
  [137]: {
    router: '0x643770E279d5D0733F21d6DC03A8efbABf3255B4',
    weth: '0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270',
    steth: NOT_SUPPORTED_ON_CHAIN,
    wsteth: NOT_SUPPORTED_ON_CHAIN,
    creationBlock: 46866777,
  },
  //polygon mumbai
  [80001]: {
    router: '0x3fC91A3afd70395Cd496C647d5a6CC9D4B2b7FAD',
    weth: '0x9c3C9283D3e44854697Cd22D3Faa240Cfb032889',
    steth: NOT_SUPPORTED_ON_CHAIN,
    wsteth: NOT_SUPPORTED_ON_CHAIN,
    creationBlock: 35176052,
  },
  //optimism
  [10]: {
    router: '0xeC8B0F7Ffe3ae75d7FfAb09429e3675bb63503e4',
    weth: '0x4200000000000000000000000000000000000006',
    steth: NOT_SUPPORTED_ON_CHAIN,
    wsteth: NOT_SUPPORTED_ON_CHAIN,
    creationBlock: 108825869,
  },
  // optimism goerli
  [420]: {
    router: '0x3fC91A3afd70395Cd496C647d5a6CC9D4B2b7FAD',
    weth: '0x4200000000000000000000000000000000000006',
    steth: NOT_SUPPORTED_ON_CHAIN,
    wsteth: NOT_SUPPORTED_ON_CHAIN,
    creationBlock: 8887728,
  },
  // arbitrum
  [42161]: {
    router: '0xeC8B0F7Ffe3ae75d7FfAb09429e3675bb63503e4',
    weth: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1',
    steth: NOT_SUPPORTED_ON_CHAIN,
    wsteth: NOT_SUPPORTED_ON_CHAIN,
    creationBlock: 125861718,
  },
  // arbitrum goerli
  [421613]: {
    router: '0x3fC91A3afd70395Cd496C647d5a6CC9D4B2b7FAD',
    weth: '0xe39Ab88f8A4777030A534146A9Ca3B52bd5D43A3',
    steth: NOT_SUPPORTED_ON_CHAIN,
    wsteth: NOT_SUPPORTED_ON_CHAIN,
    creationBlock: 18815277,
  },
  // celo
  [42220]: {
    router: '0x88a3ED7F21A3fCF6adb86b6F878C5B7a02D20e9b',
    weth: NOT_SUPPORTED_ON_CHAIN,
    steth: NOT_SUPPORTED_ON_CHAIN,
    wsteth: NOT_SUPPORTED_ON_CHAIN,
    creationBlock: 21116361,
  },
  // celo alfajores
  [44787]: {
    router: '0x3fC91A3afd70395Cd496C647d5a6CC9D4B2b7FAD',
    weth: NOT_SUPPORTED_ON_CHAIN,
    steth: NOT_SUPPORTED_ON_CHAIN,
    wsteth: NOT_SUPPORTED_ON_CHAIN,
    creationBlock: 17566658,
  },
  // binance smart chain
  [56]: {
    router: '0xeC8B0F7Ffe3ae75d7FfAb09429e3675bb63503e4',
    weth: '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c',
    steth: NOT_SUPPORTED_ON_CHAIN,
    wsteth: NOT_SUPPORTED_ON_CHAIN,
    creationBlock: 31254967,
  },
  // avalanche
  [43114]: {
    router: '0x82635AF6146972cD6601161c4472ffe97237D292',
    weth: '0xB31f66AA3C1e785363F0875A1B74E27b85FD66c7',
    steth: NOT_SUPPORTED_ON_CHAIN,
    wsteth: NOT_SUPPORTED_ON_CHAIN,
    creationBlock: 34491144,
  },
  // base goerli
  [84531]: {
    router: '0xd0872d928672ae2ff74bdb2f5130ac12229cafaf',
    weth: '0x4200000000000000000000000000000000000006',
    steth: NOT_SUPPORTED_ON_CHAIN,
    wsteth: NOT_SUPPORTED_ON_CHAIN,
    creationBlock: 6915289,
  },
  // base mainnet
  [8453]: {
    router: '0xeC8B0F7Ffe3ae75d7FfAb09429e3675bb63503e4',
    weth: '0x4200000000000000000000000000000000000006',
    steth: NOT_SUPPORTED_ON_CHAIN,
    wsteth: NOT_SUPPORTED_ON_CHAIN,
    creationBlock: 3229053,
  },
}

export const UNIVERSAL_ROUTER_ADDRESS = (chainId: number): string => {
  if (!(chainId in CHAIN_CONFIGS)) throw new Error(`Universal Router not deployed on chain ${chainId}`)
  return CHAIN_CONFIGS[chainId].router
}

export const UNIVERSAL_ROUTER_CREATION_BLOCK = (chainId: number): number => {
  if (!(chainId in CHAIN_CONFIGS)) throw new Error(`Universal Router not deployed on chain ${chainId}`)
  return CHAIN_CONFIGS[chainId].creationBlock
}

export const WETH_ADDRESS = (chainId: number): string => {
  if (!(chainId in CHAIN_CONFIGS)) throw new Error(`Universal Router not deployed on chain ${chainId}`)

  if (CHAIN_CONFIGS[chainId].weth == NOT_SUPPORTED_ON_CHAIN) throw new Error(`Chain ${chainId} does not have WETH`)

  return CHAIN_CONFIGS[chainId].weth
}

export const STETH_ADDRESS = (chainId: number): string => {
  if (!(chainId in CHAIN_CONFIGS)) throw new Error(`Universal Router not deployed on chain ${chainId}`)

  if (CHAIN_CONFIGS[chainId].steth == NOT_SUPPORTED_ON_CHAIN)
    throw new Error(`Chain ${chainId} does not have STETH support`)

  return CHAIN_CONFIGS[chainId].steth
}

export const WSTETH_ADDRESS = (chainId: number): string => {
  if (!(chainId in CHAIN_CONFIGS)) throw new Error(`Universal Router not deployed on chain ${chainId}`)

  if (CHAIN_CONFIGS[chainId].wsteth == NOT_SUPPORTED_ON_CHAIN)
    throw new Error(`Chain ${chainId} does not have WSTETH support`)

  return CHAIN_CONFIGS[chainId].wsteth
}

export const PERMIT2_ADDRESS = '0x000000000022D473030F116dDEE9F6B43aC78BA3'

export const CONTRACT_BALANCE = BigNumber.from(2).pow(255)
export const ETH_ADDRESS = '0x0000000000000000000000000000000000000000'
export const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000'
export const MAX_UINT256 = BigNumber.from(2).pow(256).sub(1)
export const MAX_UINT160 = BigNumber.from(2).pow(160).sub(1)

export const SENDER_AS_RECIPIENT = '0x0000000000000000000000000000000000000001'
export const ROUTER_AS_RECIPIENT = '0x0000000000000000000000000000000000000002'

export const OPENSEA_CONDUIT_SPENDER_ID = 0
export const SUDOSWAP_SPENDER_ID = 1
