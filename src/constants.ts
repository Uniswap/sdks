export const PERMIT_POST_MAPPING: { readonly [key: number]: string } = {
  1: "0x320b2ADcf134128D067693417Be59754F221D9DE",
  12341234: "0xF5c9D4eFCAe2e36993C0815d3A8Dfd3E8985b677",
};

export const ORDER_QUOTER_MAPPING: { readonly [key: number]: string } = {
  1: "0x16731f587daE8414fE636fC12BC4b5100907cCA9",
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
    [OrderType.DutchLimit]: "0xE9781560d93c27aa4C4F3543631d191D10608d20",
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
