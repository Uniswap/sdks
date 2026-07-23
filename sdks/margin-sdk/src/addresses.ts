import { type Address, getAddress } from 'viem'

import { SupportedChainId } from './chains'

/** The lending venues integrated behind `ILendingAdapter` today. */
export type LendingVenue = 'morphoBlue' | 'aaveV3' | 'aaveV4'

/**
 * Per-chain addresses of the margin trading stack. Keyed by numeric chain id.
 */
export interface MarginAddresses {
  /** MarginRouter: the entry point and the manager of every MarginAccount it deploys. */
  marginRouter: Address
  /** The MarginAccount implementation every account clone delegates to (CWIA template). */
  marginAccountImplementation: Address
  /**
   * Deployed lending adapters by venue. Each is a singleton encoder over a governed market
   * routing table; the caller selects the venue per call by passing the matching adapter. The
   * Aave v4 adapter is bound to a single Spoke — a second Spoke is a second adapter instance.
   */
  lendingAdapters: Partial<Record<LendingVenue, Address>>
  /** Permit2 (canonical address on every chain). Equity/collateral is pulled through it. */
  permit2: Address
  /** The canonical Uniswap v4 PoolManager the leverage swaps run through. */
  poolManager: Address
  /** WETH9. Native-ETH equity is wrapped to this; the market collateral must then be WETH. */
  weth9: Address
}

const PERMIT2 = getAddress('0x000000000022D473030F116dDEE9F6B43aC78BA3')

/**
 * All deployed margin stacks, keyed by numeric chain id. Mainnet addresses are the
 * `DeployMargin.s.sol` deployment documented in v4-periphery `docs/margin-trading.md`, verified
 * onchain (router `accountImplementation()` / `manager()` / `isAdapterAllowed(...)` read back).
 */
export const MARGIN_ADDRESSES: Partial<Record<number, MarginAddresses>> = {
  [SupportedChainId.MAINNET]: {
    marginRouter: getAddress('0x0000000004BBC92D0657580CAe35aEBF054E5CDC'),
    marginAccountImplementation: getAddress('0x83Fc96d2B162dAF8532e5677C6Ec32A1Cb7882E4'),
    lendingAdapters: {
      morphoBlue: getAddress('0x9A7f8F5A9496D3c9dc0BEEfb44cCaC17CAAF28fa'),
      aaveV3: getAddress('0x8EeacdB24c7650478496845A61f03fF6BC263222'),
      aaveV4: getAddress('0x3a9Cc5eEbAC911E5a316de1F2bCD166016d7469E'),
    },
    permit2: PERMIT2,
    poolManager: getAddress('0x000000000004444c5dc75cB358380D2e3dE08A90'),
    weth9: getAddress('0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2'),
  },
}

/** Returns the margin addresses for a chain, or `undefined` if the stack is not deployed there. */
export function getMarginAddresses(chainId: number): MarginAddresses | undefined {
  return MARGIN_ADDRESSES[chainId]
}
