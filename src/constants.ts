export const PERMIT_POST_MAPPING: { readonly [key: number]: string } = {
  1: '0x0000000000000000000000000000000000000000',
};

type Reactors = {
  readonly dutchLimit: string;
};

export const REACTOR_ADDRESS_MAPPING: { readonly [key: number]: Reactors } = {
  1: {
    dutchLimit: '0x0000000000000000000000000000000000000000',
  },
};
