export const PERMIT_POST_MAPPING: { readonly [key: number]: string } = {
  1: '0x0000000000000000000000000000000000000000',
  12341234: '0xFD6D23eE2b6b136E34572fc80cbCd33E9787705e',
};

export const ORDER_QUOTER_MAPPING: { readonly [key: number]: string } = {
  1: '0x0000000000000000000000000000000000000000',
  12341234: '0x1D13fF25b10C9a6741DFdce229073bed652197c7',
};

export enum OrderType {
  DutchLimit = 'DutchLimit',
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
    [OrderType.DutchLimit]: '0x0000000000000000000000000000000000000000',
  },
  12341234: {
    [OrderType.DutchLimit]: '0x4DAf17c8142A483B2E2348f56ae0F2cFDAe22ceE',
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
