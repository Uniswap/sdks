import { ChainId, SUPPORTED_CHAINS, SupportedChainsType } from './chains'

type AddressMap = { [chainId: number]: string }

type ChainAddresses = {
  v3CoreFactoryAddress: string
  multicallAddress: string
  quoterAddress: string
  v3MigratorAddress?: string
  nonfungiblePositionManagerAddress?: string
  tickLensAddress?: string
  swapRouter02Address?: string
  v1MixedRouteQuoterAddress?: string
}

const DEFAULT_NETWORKS = [ChainId.XDC, ChainId.APOTHEM]

function constructSameAddressMap(address: string, additionalNetworks: ChainId[] = []): AddressMap {
  return DEFAULT_NETWORKS.concat(additionalNetworks).reduce<AddressMap>((memo, chainId) => {
    memo[chainId] = address
    return memo
  }, {})
}

export const XSP_ADDRESSES: AddressMap = {
  [ChainId.XDC]: '0x36726235dAdbdb4658D33E62a249dCA7c4B2bC68',
  [ChainId.APOTHEM]: '0x339c94081D1F7808FeEa3E6E5B1feA864c3cef43',
}

export const XTT_ADDRESSES: AddressMap = {
  [ChainId.XDC]: '0x17476dc3eda45aD916cEAdDeA325B240A7FB259D',
  [ChainId.APOTHEM]: '0xFdCf8bD44EC46a71a13f00F4328F6b65adc8BCf9',
}

export const V2_FACTORY_ADDRESSES: AddressMap = {
  [ChainId.XDC]: '0x347D14b13a68457186b2450bb2a6c2Fd7B38352f',
  [ChainId.APOTHEM]: '0xCae66ac135d6489BDF5619Ae8F8f1e724765eb8f',
}

/**
 * @deprecated use V2_ROUTER_ADDRESSES instead
 */
export const V2_ROUTER_ADDRESSES: AddressMap = {
  [ChainId.XDC]: '0xf9c5E4f6E627201aB2d6FB6391239738Cf4bDcf9',
  [ChainId.APOTHEM]: '0x3F11A24EB45d3c3737365b97A996949dA6c2EdDf',
}

// XDC v3 addresses
const XDC_ADDRESSES: ChainAddresses = {
  v3CoreFactoryAddress: '0x30f317a9ec0f0d06d5de0f8d248ec3506b7e4a8a',
  multicallAddress: '0x6d4393cf8b3adb3534a185d277db0c2ab4bac116',
  quoterAddress: '0x4d8a32353c9c25903e771c47e258c051931c2ef5',
  v3MigratorAddress: '0x12f6ee73261bc0987c564ded087a022cfa63a6a7',
  nonfungiblePositionManagerAddress: '0x6d22833398772d7da9a7cbcfdee98342cce154d4',
  tickLensAddress: '0xb823682d6b7e794a0dba656a60e7c1d6de52a389',
  swapRouter02Address: '0x3b9edecc4286ba33ea6e27119c2a4db99829839d',
  v1MixedRouteQuoterAddress: '0x02a7f84d622e4deb1ffe81df3657d9748b1e8531',
}
const APOTHEM_ADDRESSES: ChainAddresses = {
  v3CoreFactoryAddress: '0xe91bf417b470ccc6b7307e58a5aa0644572981d7',
  multicallAddress: '0xb6bf4d922c537e1214c1e6fe339135234cd4a8c5',
  quoterAddress: '0xbebe711b0bf5a66f651b25aadf0a3a0a57c4cd10',
  v3MigratorAddress: '0xa8bc88bfd7ff8935e207c9a917b9c46b20b19fa5',
  nonfungiblePositionManagerAddress: '0x36131c27b9031ea0032c2635257a70bc5926b9ec',
  tickLensAddress: '0x8dfe961177d66006fe3e785e302e5160b3172ec0',
  swapRouter02Address: '0x689c2fb173691b325146c188458adfe418b4772a',
  v1MixedRouteQuoterAddress: '0x1a9908822ad4fd7e6f2e76c6c3d6bd86701a186c',
}

export const CHAIN_TO_ADDRESSES_MAP: Record<SupportedChainsType, ChainAddresses> = {
  [ChainId.XDC]: XDC_ADDRESSES,
  [ChainId.APOTHEM]: APOTHEM_ADDRESSES,
}

/* V3 Contract Addresses */
export const V3_CORE_FACTORY_ADDRESSES: AddressMap = {
  ...SUPPORTED_CHAINS.reduce<AddressMap>((memo, chainId) => {
    memo[chainId] = CHAIN_TO_ADDRESSES_MAP[chainId].v3CoreFactoryAddress
    return memo
  }, {}),
}

export const V3_MIGRATOR_ADDRESSES: AddressMap = {
  ...SUPPORTED_CHAINS.reduce<AddressMap>((memo, chainId) => {
    const v3MigratorAddress = CHAIN_TO_ADDRESSES_MAP[chainId].v3MigratorAddress
    if (v3MigratorAddress) {
      memo[chainId] = v3MigratorAddress
    }
    return memo
  }, {}),
}

export const MULTICALL_ADDRESSES: AddressMap = {
  ...SUPPORTED_CHAINS.reduce<AddressMap>((memo, chainId) => {
    memo[chainId] = CHAIN_TO_ADDRESSES_MAP[chainId].multicallAddress
    return memo
  }, {}),
}

export const QUOTER_ADDRESSES: AddressMap = {
  ...SUPPORTED_CHAINS.reduce<AddressMap>((memo, chainId) => {
    memo[chainId] = CHAIN_TO_ADDRESSES_MAP[chainId].quoterAddress
    return memo
  }, {}),
}

export const NONFUNGIBLE_POSITION_MANAGER_ADDRESSES: AddressMap = {
  ...SUPPORTED_CHAINS.reduce<AddressMap>((memo, chainId) => {
    const nonfungiblePositionManagerAddress = CHAIN_TO_ADDRESSES_MAP[chainId].nonfungiblePositionManagerAddress
    if (nonfungiblePositionManagerAddress) {
      memo[chainId] = nonfungiblePositionManagerAddress
    }
    return memo
  }, {}),
}

export const ENS_REGISTRAR_ADDRESSES: AddressMap = {
  ...constructSameAddressMap('0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e'),
}

export const TICK_LENS_ADDRESSES: AddressMap = {
  ...SUPPORTED_CHAINS.reduce<AddressMap>((memo, chainId) => {
    const tickLensAddress = CHAIN_TO_ADDRESSES_MAP[chainId].tickLensAddress
    if (tickLensAddress) {
      memo[chainId] = tickLensAddress
    }
    return memo
  }, {}),
}

export const MIXED_ROUTE_QUOTER_V1_ADDRESSES: AddressMap = SUPPORTED_CHAINS.reduce<AddressMap>((memo, chainId) => {
  const v1MixedRouteQuoterAddress = CHAIN_TO_ADDRESSES_MAP[chainId].v1MixedRouteQuoterAddress
  if (v1MixedRouteQuoterAddress) {
    memo[chainId] = v1MixedRouteQuoterAddress
  }
  return memo
}, {})

export const SWAP_ROUTER_02_ADDRESSES = (chainId: number) => {
  if (SUPPORTED_CHAINS.includes(chainId)) {
    const id = chainId as SupportedChainsType
    return CHAIN_TO_ADDRESSES_MAP[id].swapRouter02Address ?? '0x3b9edecc4286ba33ea6e27119c2a4db99829839d'
  }
  return ''
}
