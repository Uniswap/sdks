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
   * Deployed lending adapters, listed per venue; a venue can have several. Each is a stateless
   * singleton encoder bound to one venue deployment; the caller selects the venue per call by
   * passing the matching adapter and names the market through `Market.data`, which the adapter
   * validates. The Aave v4 adapter is bound to a single Spoke and the Compound v3 adapter to a
   * single Comet (whose base token is the only borrowable debt); a second Spoke/Comet is a second
   * adapter instance in that venue's list. A venue absent from the record has no deployment on
   * that chain, so no adapter is deployed for it there either.
   */
  lendingAdapters: Partial<Record<LendingVenue, readonly Address[]>>
  /** Permit2 (canonical address on every chain). Equity/collateral is pulled through it. */
  permit2: Address
  /** The canonical Uniswap v4 PoolManager the leverage swaps run through. */
  poolManager: Address
  /** WETH9. Native-ETH equity is wrapped to this; the market collateral must then be WETH. */
  weth9: Address
}

const PERMIT2 = getAddress('0x000000000022D473030F116dDEE9F6B43aC78BA3')

/**
 * The suite's contracts, at the same address on every supported chain. The `DeployMargin.s.sol`
 * deployment of 2026-11-19 (v4-periphery commit dce24b92188c471deb9f3645c1cfe428bcf6d699) goes
 * through CreateX's CREATE3 path with salts permissioned to the deployer, so an address depends on
 * neither the chain nor the per-chain constructor arguments. Verified onchain after the deploy:
 * code at every address, and the router's immutables and every adapter's venue read back per chain.
 */
const MARGIN_ROUTER = getAddress('0x000000000e69bAAd36D7569eA3Bd9cd07e3AA084')
const MARGIN_ACCOUNT_IMPLEMENTATION = getAddress('0x0000000059D9B1aF8Aff1197dCd58c516E3C51ef')
const MORPHO_LENDING_ADAPTER = getAddress('0x00000000726B1941Ab9aE01f701428dDF556eCaE')
const AAVE_LENDING_ADAPTER = getAddress('0x0000000099e0dA20B62Bce6A0486522902d0db6D')
const AAVE_V4_LENDING_ADAPTER = getAddress('0x0000000069fAdFCb9dd203fb8EA34Aea3e0c7e2B')
const COMPOUND_V3_LENDING_ADAPTER = getAddress('0x00000000E7b8e964b29954cD7E28E14B09555de0')

/**
 * All deployed margin stacks, keyed by numeric chain id. An adapter is listed only where its venue
 * is deployed: mainnet has all four; Base and Arbitrum One have Morpho Blue, Aave v3 and Compound
 * v3 (Base's Aave v4 spoke serves tokenized equities and is not registered, Arbitrum has no Aave
 * v4); Robinhood Chain has Morpho Blue only, so its stack is the router, the account
 * implementation and the Morpho adapter until another venue launches there.
 *
 * Deploy blocks: mainnet 26450629-26450670, Base 59594629-59594630, Arbitrum One
 * 525681421-525681429, Robinhood Chain 118399702-118399756. This supersedes the 2026-10-22 mainnet
 * suite (router `0x0000000000890d0ee01040c8855A0423e37c757B`), which stays live for the positions
 * opened there; this SDK version is bound to the new suite's ABI.
 *
 * The Universal Router is deliberately NOT part of this record: it is a per-call parameter
 * (`IncreaseParams`/`DecreaseParams`/`ROUTE_SWAP`) so callers pick the deployment their route
 * targets, which must run `V4_SWAP` inside an existing PoolManager unlock (universal-router #491
 * or later).
 */
export const MARGIN_ADDRESSES: Partial<Record<number, MarginAddresses>> = {
  [SupportedChainId.MAINNET]: {
    marginRouter: MARGIN_ROUTER,
    marginAccountImplementation: MARGIN_ACCOUNT_IMPLEMENTATION,
    lendingAdapters: {
      morphoBlue: [MORPHO_LENDING_ADAPTER],
      aaveV3: [AAVE_LENDING_ADAPTER],
      aaveV4: [AAVE_V4_LENDING_ADAPTER],
      compoundV3: [COMPOUND_V3_LENDING_ADAPTER],
    },
    permit2: PERMIT2,
    poolManager: getAddress('0x000000000004444c5dc75cB358380D2e3dE08A90'),
    weth9: getAddress('0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2'),
  },
  [SupportedChainId.BASE]: {
    marginRouter: MARGIN_ROUTER,
    marginAccountImplementation: MARGIN_ACCOUNT_IMPLEMENTATION,
    lendingAdapters: {
      morphoBlue: [MORPHO_LENDING_ADAPTER],
      aaveV3: [AAVE_LENDING_ADAPTER],
      compoundV3: [COMPOUND_V3_LENDING_ADAPTER],
    },
    permit2: PERMIT2,
    poolManager: getAddress('0x498581fF718922c3f8e6A244956aF099B2652b2b'),
    weth9: getAddress('0x4200000000000000000000000000000000000006'),
  },
  [SupportedChainId.ARBITRUM_ONE]: {
    marginRouter: MARGIN_ROUTER,
    marginAccountImplementation: MARGIN_ACCOUNT_IMPLEMENTATION,
    lendingAdapters: {
      morphoBlue: [MORPHO_LENDING_ADAPTER],
      aaveV3: [AAVE_LENDING_ADAPTER],
      compoundV3: [COMPOUND_V3_LENDING_ADAPTER],
    },
    permit2: PERMIT2,
    poolManager: getAddress('0x360E68faCcca8cA495c1B759Fd9EEe466db9FB32'),
    weth9: getAddress('0x82aF49447D8a07e3bd95BD0d56f35241523fBab1'),
  },
  [SupportedChainId.ROBINHOOD_CHAIN]: {
    marginRouter: MARGIN_ROUTER,
    marginAccountImplementation: MARGIN_ACCOUNT_IMPLEMENTATION,
    lendingAdapters: {
      morphoBlue: [MORPHO_LENDING_ADAPTER],
    },
    permit2: PERMIT2,
    poolManager: getAddress('0x8366a39CC670B4001A1121B8F6A443A643e40951'),
    weth9: getAddress('0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73'),
  },
}

/** Returns the margin addresses for a chain, or `undefined` if the stack is not deployed there. */
export function getMarginAddresses(chainId: number): MarginAddresses | undefined {
  return MARGIN_ADDRESSES[chainId]
}
