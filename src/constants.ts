export const PERMIT_POST_MAPPING: { [key: number]: string } = {
  1: '0x0000000000000000000000000000000000000000',
}

interface Reactors {
  dutchLimit: string;
}

export const REACTOR_ADDRESS_MAPPING: { [key: number]: Reactors } = {
  1: {
    dutchLimit: '0x0000000000000000000000000000000000000000',
  },
}
