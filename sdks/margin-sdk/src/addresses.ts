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
 * `DeployMargin.s.sol` CREATE2 deployment of 2026-10-22 (blocks 26244491-26244496, commit
 * fd5dcdb435606dfc2a845ed3cfc6d68941ab84f1), the permissionless-market-key suite: the router has
 * no governance or adapter allowlist, and market selection is a caller-supplied `Market` (adapter
 * address plus venue-decoded `bytes data`) validated per call by the adapter itself. Verified
 * onchain: contract code at every address below. This supersedes the 2026-08-26 post-audit suite,
 * which predates this ABI and is no longer compatible with this SDK version.
 *
 * The Universal Router is deliberately NOT part of this record: it is a per-call parameter
 * (`IncreaseParams`/`DecreaseParams`/`ROUTE_SWAP`) so callers pick the deployment their route
 * targets — it must carry already-unlocked `V4_SWAP` support.
 */
export const MARGIN_ADDRESSES: Partial<Record<number, MarginAddresses>> = {
  [SupportedChainId.MAINNET]: {
    marginRouter: getAddress('0x0000000000890d0ee01040c8855A0423e37c757B'),
    marginAccountImplementation: getAddress('0xD9568a09F242fDDd01Be180359f67FbE31D4FaB7'),
    lendingAdapters: {
      morphoBlue: getAddress('0x9770eB2e1e4e50126aC290F40340D4eB86c9ba91'),
      aaveV3: getAddress('0xBcdd5ae0cf217439d0B84Bc2ABA5E5238200Ee75'),
      aaveV4: getAddress('0x6ED39e59c72aa67488a72b4544C680369373d81B'),
      compoundV3: getAddress('0x13352E9b6C57261Ce906a2984A15356547B40708'),
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
