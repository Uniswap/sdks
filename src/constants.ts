export const PERMIT_POST_MAPPING: { readonly [key: number]: string } = {
  1: "0x33d86A12Fb907fC6f49eF0A04524648117825cda",
  12341234: "0xF5c9D4eFCAe2e36993C0815d3A8Dfd3E8985b677",
};

export const ORDER_QUOTER_MAPPING: { readonly [key: number]: string } = {
  1: "0x78FdE388B0FfB1D692e48370192583e5f5609CB7",
  12341234: "0x0836D41eBFFFF6cD0849770f82c922Cf14C9De95",
};

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
    [OrderType.DutchLimit]: "0x4ee00c53aB86Ad44b405E6367F8be72333a7b7C9",
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
