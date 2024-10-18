export enum ChainId {
  XDC = 50,
  APOTHEM = 51,
}

export const SUPPORTED_CHAINS = [ChainId.XDC, ChainId.APOTHEM] as const
export type SupportedChainsType = (typeof SUPPORTED_CHAINS)[number]

export enum NativeCurrencyName {
  // Strings match input for CLI
  XDC = 'XDC',
  APOTHEM = 'TXDC',
}
