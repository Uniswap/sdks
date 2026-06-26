import { type Address, getAddress } from 'viem'

import { SupportedChainId } from './chains'

/**
 * Per-chain addresses of the Liquidity Launcher stack. Keyed by numeric chain id.
 */
export interface LauncherAddresses {
  /** LiquidityLauncher singleton (the `multicall` entry point a wallet calls). */
  liquidityLauncher: Address
  /** LBPStrategy singleton (passed as `Distribution.strategy`; owns `registeredPoolIds`). */
  lbpStrategy: Address
  /** TokenSplitter strategy: routes the creator's un-auctioned portion (returned supply). */
  tokenSplitter: Address
  /** ContinuousClearingAuction factory. */
  ccaFactory: Address
  /** Permit2 (canonical address on every chain). */
  permit2: Address
  /**
   * Registered token factories the new-token path may target. Ethereum-style chains carry a uERC20
   * factory; superchains carry a super-uERC20 factory. A chain has at least one (mainnet has both);
   * both are optional so superchain-only and Ethereum-only chains can each omit the one they lack.
   */
  uerc20Factory?: Address
  usuperc20Factory?: Address
}

const PERMIT2 = getAddress('0x000000000022D473030F116dDEE9F6B43aC78BA3')

// Deployed at the same CREATE2 address on every supported chain.
const LIQUIDITY_LAUNCHER = getAddress('0x00004c4ccc709Ef590F7C81102C0689F0263D4e9')
const CCA_FACTORY = getAddress('0x00cCa200BF124dBfA848937c553864f4B4CE0632')
const TOKEN_SPLITTER = getAddress('0x8B7DCeb5639DB986FCf86606C74e6300C40FE3cd')

// Token factories, split by token standard. The uERC20 factory shares a CREATE2 address across the
// Ethereum-style chains that deploy it; the super-uERC20 factory shares one across the superchains.
const UERC20_FACTORY = getAddress('0x000000e200088D55C39a11F609E5F667729ad49b')
const USUPERC20_FACTORY = getAddress('0xeEeeEEE204Afb6BABb1287ffed52cCD6BA0b0fb2')

/** All deployed launcher stacks, keyed by numeric chain id. */
export const LAUNCHER_ADDRESSES: Partial<Record<number, LauncherAddresses>> = {
  [SupportedChainId.MAINNET]: {
    liquidityLauncher: LIQUIDITY_LAUNCHER,
    lbpStrategy: getAddress('0xb98766A35cdc28415be0767D4EA41e39fBA3e000'),
    tokenSplitter: TOKEN_SPLITTER,
    ccaFactory: CCA_FACTORY,
    permit2: PERMIT2,
    uerc20Factory: UERC20_FACTORY,
    usuperc20Factory: USUPERC20_FACTORY,
  },
  [SupportedChainId.UNICHAIN]: {
    liquidityLauncher: LIQUIDITY_LAUNCHER,
    lbpStrategy: getAddress('0x824A3eCDe463DD45cC156b64CEfA132596C9A000'),
    tokenSplitter: TOKEN_SPLITTER,
    ccaFactory: CCA_FACTORY,
    permit2: PERMIT2,
    usuperc20Factory: USUPERC20_FACTORY,
  },
  [SupportedChainId.BASE]: {
    liquidityLauncher: LIQUIDITY_LAUNCHER,
    lbpStrategy: getAddress('0x5bB4bAfafEc57BEd50D864AAA9D1ef992611e000'),
    tokenSplitter: TOKEN_SPLITTER,
    ccaFactory: CCA_FACTORY,
    permit2: PERMIT2,
    usuperc20Factory: USUPERC20_FACTORY,
  },
  [SupportedChainId.ARBITRUM_ONE]: {
    liquidityLauncher: LIQUIDITY_LAUNCHER,
    lbpStrategy: getAddress('0x18608AD558dcD233F7854242bbAef73988Bee000'),
    tokenSplitter: TOKEN_SPLITTER,
    ccaFactory: CCA_FACTORY,
    permit2: PERMIT2,
    uerc20Factory: UERC20_FACTORY,
  },
  [SupportedChainId.SEPOLIA]: {
    liquidityLauncher: LIQUIDITY_LAUNCHER,
    lbpStrategy: getAddress('0x3f37838651B5AD71D4e01Ec9745862A5D9DF2000'),
    tokenSplitter: TOKEN_SPLITTER,
    ccaFactory: CCA_FACTORY,
    permit2: PERMIT2,
    uerc20Factory: UERC20_FACTORY,
  },
  [SupportedChainId.BASE_SEPOLIA]: {
    liquidityLauncher: LIQUIDITY_LAUNCHER,
    lbpStrategy: getAddress('0x0e1793a989c682117fcBfB3a9aA8e451D37D2000'),
    tokenSplitter: TOKEN_SPLITTER,
    ccaFactory: CCA_FACTORY,
    permit2: PERMIT2,
    usuperc20Factory: USUPERC20_FACTORY,
  },
}

/** Returns the launch addresses for a chain, or `undefined` if the stack is not deployed there. */
export function getLauncherAddresses(chainId: number): LauncherAddresses | undefined {
  return LAUNCHER_ADDRESSES[chainId]
}

/** Which token standard a new-token launch targets (selects its address-derivation scheme). */
export type TokenFactoryKind = 'uerc20' | 'usuperc20'

export interface SelectedTokenFactory {
  factory: Address
  kind: TokenFactoryKind
}

/**
 * Picks the new-token factory for a chain. Selection is chain-driven: prefer the uERC20 factory and
 * fall back to the super-uERC20 one. Mainnet deploys both and resolves to uERC20. Returns `undefined`
 * when the chain deploys neither (new-token launches unsupported there).
 */
export function selectTokenFactory(addresses: LauncherAddresses): SelectedTokenFactory | undefined {
  if (addresses.uerc20Factory) {
    return { factory: addresses.uerc20Factory, kind: 'uerc20' }
  }
  if (addresses.usuperc20Factory) {
    return { factory: addresses.usuperc20Factory, kind: 'usuperc20' }
  }
  return undefined
}
