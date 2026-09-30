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
 * `DeployMargin.s.sol` CREATE2 deployment of 2026-08-26 (blocks 25842465-25842483), the
 * post-audit suite carrying the full OpenZeppelin fix set, verified onchain: contract code,
 * the governance read, `isAdapterAllowed(...)` for every adapter, and the canonical market
 * registrations read back true.
 *
 * The Universal Router is deliberately NOT part of this record: it is a per-call parameter
 * (`IncreaseParams`/`DecreaseParams`/`ROUTE_SWAP`) so callers pick the deployment their route
 * targets — it must carry already-unlocked `V4_SWAP` support.
 */
export const MARGIN_ADDRESSES: Partial<Record<number, MarginAddresses>> = {
  [SupportedChainId.MAINNET]: {
    marginRouter: getAddress('0x0000000000F57fCd0d5a78a19907240F1169EDEC'),
    marginAccountImplementation: getAddress('0xdDD0967e90bCBc2D1F026b3977bb4dE39133b109'),
    lendingAdapters: {
      morphoBlue: getAddress('0x766C34DcFBA565a1b72ce83ECD96712376Ca1f3D'),
      aaveV3: getAddress('0x7E1A543Bd8ed2F16D61DA4b6bC2eC5d240D098aC'),
      aaveV4: getAddress('0xAb3C2661c810295Db32125942f04b92c61fAE2Eb'),
      compoundV3: getAddress('0x77598B845d0200fc707bD32A8Ad6DCF85C995e0d'),
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
