import { type Address, getAddress } from 'viem'

import { SupportedChainId } from './chains.js'

/** The lending venues integrated behind `ILendingAdapter` today. */
export type LendingVenue = 'morphoBlue' | 'aaveV3' | 'aaveV4' | 'compoundV3'

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
   * Aave v4 adapter is bound to a single Spoke and the Compound v3 adapter to a single Comet
   * (whose base token is the only borrowable debt) — a second Spoke/Comet is a second adapter
   * instance. A venue absent from the record is not in that chain's live deployment yet.
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
 * `DeployMargin.s.sol` CREATE2 deployment of the Universal-Router-per-call MarginRouter (the
 * router that routes position swaps via `ROUTE_SWAP`), verified onchain: contract code, the
 * governance read, and `isAdapterAllowed(...)` for every adapter read back true.
 *
 * The Universal Router is deliberately NOT part of this record: it is a per-call parameter
 * (`IncreaseParams`/`DecreaseParams`/`ROUTE_SWAP`) so callers pick the deployment their route
 * targets — it must carry already-unlocked `V4_SWAP` support.
 */
export const MARGIN_ADDRESSES: Partial<Record<number, MarginAddresses>> = {
  [SupportedChainId.MAINNET]: {
    marginRouter: getAddress('0x000000000075e82F7B7DdC5DD1B4984b560eF5D4'),
    marginAccountImplementation: getAddress('0x36e5317CEE9F70c0A41A97A4676899Dfe9a10239'),
    lendingAdapters: {
      morphoBlue: getAddress('0x70fD13dF8C827ab71AE300D24b771C19B67d178A'),
      aaveV3: getAddress('0x79D243C83e2D351aBbe8010a7E95162998475719'),
      aaveV4: getAddress('0x917D08052E2994B75cF82bDaF6314b07532f2556'),
      compoundV3: getAddress('0x3625D6F7ccA2e8F95aF2E6497075D1a3E32dC5C6'),
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
