export const PERMIT2_MAPPING: { readonly [key: number]: string } = {
  1: "0x000000000022d473030f116ddee9f6b43ac78ba3",
  5: "0x000000000022d473030f116ddee9f6b43ac78ba3",
  12341234: "0xF5c9D4eFCAe2e36993C0815d3A8Dfd3E8985b677",
};

export const ORDER_QUOTER_MAPPING: { readonly [key: number]: string } = {
  1: "0x437c3c08892B5c814E9978E4544df849b8313951",
  5: "0x3946398638B21cE394841537EC1c1F557491971a",
  12341234: "0x0836D41eBFFFF6cD0849770f82c922Cf14C9De95",
};

export const EXCLUSIVE_FILLER_VALIDATION_MAPPING: {
  readonly [key: number]: string;
} = {
  1: "0x8A66A74e15544db9688B68B06E116f5d19e5dF90",
  5: "0x0000000000000000000000000000000000000000",
  12341234: "0x0000000000000000000000000000000000000000",
};

export enum KNOWN_EVENT_SIGNATURES {
  ERC20_TRANSFER = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef",
}

export enum OrderType {
  DutchLimit = "DutchLimit",
}

type Reactors = {
  [key in OrderType]: string;
};

type ReactorMapping = { readonly [key: number]: Reactors };
type ReverseReactorMapping = {
  [key: string]: { chainId: number; orderType: OrderType };
};

export const REACTOR_ADDRESS_MAPPING: ReactorMapping = {
  1: {
    [OrderType.DutchLimit]: "0x81f570f48BE8d3D358404f257b5bDC4A88eefA50",
  },
  5: {
    [OrderType.DutchLimit]: "0xE5D50eB6e669C32D797379aF3907478FE491036D",
  },
  12341234: {
    [OrderType.DutchLimit]: "0xFF086b7696Dc4116B336Dd0e42ecd2164FC2712B",
  },
};

export const REVERSE_REACTOR_MAPPING: ReverseReactorMapping = Object.entries(
  REACTOR_ADDRESS_MAPPING
).reduce((acc: ReverseReactorMapping, [chainId, orderTypes]) => {
  for (const [orderType, reactorAddress] of Object.entries(orderTypes)) {
    // lowercase for consistency when parsing orders
    acc[reactorAddress.toLowerCase()] = {
      chainId: parseInt(chainId),
      orderType: OrderType[orderType as keyof typeof OrderType],
    };
  }

  return acc;
}, {});
