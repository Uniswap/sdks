import { ChainId } from "@uniswap/sdk-core";
import { BigNumber } from "ethers";

type AddressMap = { readonly [key: number]: string };

const NETWORKS_WITH_SAME_ADDRESS: ChainId[] = [
  ChainId.MAINNET,
  ChainId.GOERLI,
  ChainId.POLYGON,
  ChainId.BASE,
  ChainId.UNICHAIN,
];

export function constructSameAddressMap<T>(
  address: T,
  additionalNetworks: ChainId[] = []
): { [chainId: number]: T } {
  return NETWORKS_WITH_SAME_ADDRESS.concat(additionalNetworks).reduce<{
    [chainId: number]: T;
  }>((memo, chainId) => {
    memo[chainId] = address;
    return memo;
  }, {});
}

export const PERMIT2_MAPPING: AddressMap = {
  ...constructSameAddressMap(
    "0x000000000022d473030f116ddee9f6b43ac78ba3",
    [11155111, 42161]
  ),
  12341234: "0x000000000022d473030f116ddee9f6b43ac78ba3",
  1301: "0x000000000022d473030f116ddee9f6b43ac78ba3",
};

export const UNISWAPX_ORDER_QUOTER_MAPPING: AddressMap = {
  ...constructSameAddressMap("0x54539967a06Fc0E3C3ED0ee320Eb67362D13C5fF"),
  11155111: "0xAA6187C48096e093c37d2cF178B1e8534A6934f7",
  12341234: "0xbea0901A41177811b099F787D753436b2c47690E",
  1: "0xc6ef4C96Ee89e48Eff1C35545DBEED4Ad8dAC9D4",
  10: "0xc6ef4C96Ee89e48Eff1C35545DBEED4Ad8dAC9D4",
  8453: "0xc6ef4C96Ee89e48Eff1C35545DBEED4Ad8dAC9D4",
  130: "0xc6ef4C96Ee89e48Eff1C35545DBEED4Ad8dAC9D4",
  42161: "0xc6ef4C96Ee89e48Eff1C35545DBEED4Ad8dAC9D4",
  1301: "0xBFE64A14130054E1C3aB09287bc69E7148471636",
};

export const EXCLUSIVE_FILLER_VALIDATION_MAPPING: AddressMap = {
  ...constructSameAddressMap("0x8A66A74e15544db9688B68B06E116f5d19e5dF90"),
  5: "0x0000000000000000000000000000000000000000",
  11155111: "0x0000000000000000000000000000000000000000",
  42161: "0x0000000000000000000000000000000000000000",
  12341234: "0x8A66A74e15544db9688B68B06E116f5d19e5dF90",
};

export enum KNOWN_EVENT_SIGNATURES {
  ERC20_TRANSFER = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef",
}

export enum OrderType {
  Dutch = "Dutch",
  Relay = "Relay",
  Dutch_V2 = "Dutch_V2",
  Dutch_V3 = "Dutch_V3",
  Limit = "Limit",
  Priority = "Priority",
  V4 = "V4",
  Hybrid = "Hybrid",
}

type Reactors = Partial<{
  [key in OrderType]: string;
}>;

type ReactorMapping = { readonly [key: number]: Reactors };
type ReverseReactorMapping = {
  [key: string]: { orderType: OrderType };
};

export const REACTOR_ADDRESS_MAPPING: ReactorMapping = {
  ...constructSameAddressMap({
    [OrderType.Dutch]: "0x6000da47483062A0D734Ba3dc7576Ce6A0B645C4",
    [OrderType.Hybrid]: "0x0000000000000000000000000000000000000000",
    [OrderType.Dutch_V2]: "0x0000000000000000000000000000000000000000",
    [OrderType.Relay]: "0x0000000000A4e21E2597DCac987455c48b12edBF",
  }),
  //test contract is only on mainnet
  1: {
    [OrderType.Dutch]: "0x6000da47483062A0D734Ba3dc7576Ce6A0B645C4",
    [OrderType.Dutch_V2]: "0x00000011F84B9aa48e5f8aA8B9897600006289Be",
    [OrderType.Priority]: "0x0000000000000000000000000000000000000000",
    [OrderType.Relay]: "0x0000000000A4e21E2597DCac987455c48b12edBF",
  },
  12341234: {
    [OrderType.Dutch]: "0xbD7F9D0239f81C94b728d827a87b9864972661eC",
    [OrderType.Dutch_V2]: "0x0000000000000000000000000000000000000000",
    [OrderType.Relay]: "0x0000000000A4e21E2597DCac987455c48b12edBF",
  },
  11155111: {
    [OrderType.Dutch_V2]: "0x0e22B6638161A89533940Db590E67A52474bEBcd",
    [OrderType.Dutch]: "0xD6c073F2A3b676B8f9002b276B618e0d8bA84Fad",
    [OrderType.Relay]: "0x0000000000A4e21E2597DCac987455c48b12edBF",
  },
  42161: {
    [OrderType.Dutch_V2]: "0x1bd1aAdc9E230626C44a139d7E70d842749351eb",
    [OrderType.Dutch]: "0x0000000000000000000000000000000000000000",
    [OrderType.Relay]: "0x0000000000000000000000000000000000000000",
    [OrderType.Dutch_V3]: "0xB274d5F4b833b61B340b654d600A864fB604a87c",
  },
  8453: {
    [OrderType.Dutch]: "0x0000000000000000000000000000000000000000",
    [OrderType.Dutch_V2]: "0x0000000000000000000000000000000000000000",
    [OrderType.Relay]: "0x0000000000000000000000000000000000000000",
    [OrderType.Priority]: "0x000000001Ec5656dcdB24D90DFa42742738De729",
  },
  130: {
    [OrderType.Dutch]: "0x0000000000000000000000000000000000000000",
    [OrderType.Dutch_V2]: "0x0000000000000000000000000000000000000000",
    [OrderType.Relay]: "0x0000000000000000000000000000000000000000",
    [OrderType.Priority]: "0x00000006021a6Bce796be7ba509BBBA71e956e37",
  },
  1301: {
    [OrderType.V4]: "0x000000c40Fe6C03a7A1111D0a66Ce522BDc9fC8f",
    [OrderType.Hybrid]: "0x000000c40Fe6C03a7A1111D0a66Ce522BDc9fC8f",
    [OrderType.Dutch]: "0x0000000000000000000000000000000000000000",
    [OrderType.Dutch_V2]: "0x0000000000000000000000000000000000000000",
    [OrderType.Relay]: "0x0000000000000000000000000000000000000000",
    [OrderType.Priority]: "0x0000000000000000000000000000000000000000",
  },
};

// aliasing for backwards compatibility
export const REACTOR_CONTRACT_MAPPING: ReactorMapping = REACTOR_ADDRESS_MAPPING;

// https://github.com/mds1/multicall
export const multicallAddressOn = (chainId = 1) => {
  switch (chainId) {
    // multicall3 is deployed to a different address on zksync than all other EVM chains
    // due to differences in create2 address derivation
    // deployment address from: https://github.com/mds1/multicall/blob/d7b62458c99c650ce1efa7464ffad69d2059ad56/deployments.json#L927
    case 324:
      return "0xF9cda624FBC7e059355ce98a31693d299FACd963";
    default:
      return "0xcA11bde05977b3631167028862bE2a173976CA11";
  }
};

export const RELAY_SENTINEL_RECIPIENT =
  "0x0000000000000000000000000000000000000000";

export const REVERSE_REACTOR_MAPPING: ReverseReactorMapping = Object.entries(
  REACTOR_ADDRESS_MAPPING
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
).reduce((acc: ReverseReactorMapping, [_, orderTypes]) => {
  for (const [orderType, reactorAddress] of Object.entries(orderTypes)) {
    // lowercase for consistency when parsing orders
    acc[reactorAddress.toLowerCase()] = {
      orderType: OrderType[orderType as keyof typeof OrderType],
    };
  }

  return acc;
}, {});

export const BPS = 10000;

export const MPS = BigNumber.from(10).pow(7);

export enum PermissionedTokenInterface {
  DSTokenInterface = "DSTokenInterface",
  ISuperstateTokenV4 = "ISuperstateTokenV4",
}

export enum PermissionedTokenProxyType {
  None = "None",
  Standard = "Standard", // for the current Proxy
  ERC1967 = "ERC1967",
}

export type PermissionedToken = {
  address: string;
  chainId: ChainId;
  symbol: string;
  proxyType?: PermissionedTokenProxyType;
  interface: PermissionedTokenInterface;
}

export const PERMISSIONED_TOKENS: PermissionedToken[] = [
  {
    address: "0x7712c34205737192402172409a8F7ccef8aA2AEc",
    chainId: ChainId.MAINNET,
    symbol: "BUIDL",
    proxyType: PermissionedTokenProxyType.None,
    interface: PermissionedTokenInterface.DSTokenInterface,
  },
  {
    address: "0x14d60E7FDC0D71d8611742720E4C50E7a974020c",
    chainId: ChainId.MAINNET,
    symbol: "USCC",
    proxyType: PermissionedTokenProxyType.ERC1967,
    interface: PermissionedTokenInterface.ISuperstateTokenV4,
  },
]

/**
 * V4 Resolver address mapping for resolver-based order type detection
 * Maps chainId to resolver contract addresses
 */
type ResolverMapping = { readonly [chainId: number]: string };

export const HYBRID_RESOLVER_ADDRESS_MAPPING: ResolverMapping = {
  1301: "0x000000B380393337109C04e3e29eD993667E0f89",
};

type ReverseResolverMapping = {
  [address: string]: { orderType: OrderType };
};

export const REVERSE_RESOLVER_MAPPING: ReverseResolverMapping = Object.entries(
  HYBRID_RESOLVER_ADDRESS_MAPPING
).reduce((acc: ReverseResolverMapping, [, resolverAddress]) => {
  acc[resolverAddress.toLowerCase()] = { orderType: OrderType.Hybrid };
  return acc;
}, {});
