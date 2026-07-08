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
   * factory; superchains carry a super-uERC20 factory (mainnet has both). Both are optional: chains
   * that deploy neither support launches with pre-existing tokens only ({@link selectTokenFactory}
   * returns `undefined` there).
   */
  uerc20Factory?: Address
  usuperc20Factory?: Address
  /**
   * Canonical Uniswap v4 PositionManager (source: sdk-core `v4PositionManagerAddress`). Liquidity-lock
   * recipients hold migrated LP positions via this. Optional: lock is only offered where it's set.
   */
  positionManager?: Address
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

// Canonical Uniswap v4 PositionManager per chain (sdk-core CHAIN_TO_ADDRESSES_MAP[id].v4PositionManagerAddress).
const POSITION_MANAGER_MAINNET = getAddress('0xbD216513d74C8cf14cf4747E6AaA6420FF64ee9e')
const POSITION_MANAGER_UNICHAIN = getAddress('0x4529A01c7A0410167c5740C487A8DE60232617bf')
const POSITION_MANAGER_BASE = getAddress('0x7C5f5A4bBd8fD63184577525326123B519429bDc')
const POSITION_MANAGER_ARBITRUM = getAddress('0xd88F38F930b7952f2DB2432Cb002E7abbF3dD869')
const POSITION_MANAGER_AVALANCHE = getAddress('0xB74b1F14d2754AcfcbBe1a221023a5cf50Ab8ACD')
const POSITION_MANAGER_XLAYER = getAddress('0xcF1EAFC6928dC385A342E7C6491d371d2871458b')
const POSITION_MANAGER_ROBINHOOD = getAddress('0x58daec3116aae6D93017bAAea7749052E8a04fA7')
const POSITION_MANAGER_SEPOLIA = getAddress('0x429ba70129df741B2Ca2a85BC3A2a3328e5c09b4')
const POSITION_MANAGER_BASE_SEPOLIA = getAddress('0x4B2C77d209D3405F41a037Ec6c77F7F5b8e2ca80')

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
    positionManager: POSITION_MANAGER_MAINNET,
  },
  [SupportedChainId.UNICHAIN]: {
    liquidityLauncher: LIQUIDITY_LAUNCHER,
    lbpStrategy: getAddress('0x824A3eCDe463DD45cC156b64CEfA132596C9A000'),
    tokenSplitter: TOKEN_SPLITTER,
    ccaFactory: CCA_FACTORY,
    permit2: PERMIT2,
    usuperc20Factory: USUPERC20_FACTORY,
    positionManager: POSITION_MANAGER_UNICHAIN,
  },
  [SupportedChainId.BASE]: {
    liquidityLauncher: LIQUIDITY_LAUNCHER,
    lbpStrategy: getAddress('0x5bB4bAfafEc57BEd50D864AAA9D1ef992611e000'),
    tokenSplitter: TOKEN_SPLITTER,
    ccaFactory: CCA_FACTORY,
    permit2: PERMIT2,
    usuperc20Factory: USUPERC20_FACTORY,
    positionManager: POSITION_MANAGER_BASE,
  },
  [SupportedChainId.ARBITRUM_ONE]: {
    liquidityLauncher: LIQUIDITY_LAUNCHER,
    lbpStrategy: getAddress('0x18608AD558dcD233F7854242bbAef73988Bee000'),
    tokenSplitter: TOKEN_SPLITTER,
    ccaFactory: CCA_FACTORY,
    permit2: PERMIT2,
    uerc20Factory: UERC20_FACTORY,
    positionManager: POSITION_MANAGER_ARBITRUM,
  },
  [SupportedChainId.AVALANCHE]: {
    liquidityLauncher: LIQUIDITY_LAUNCHER,
    lbpStrategy: getAddress('0xcAcd77134b072b4AD5621f585b0b422C6Da4E000'),
    tokenSplitter: TOKEN_SPLITTER,
    ccaFactory: CCA_FACTORY,
    permit2: PERMIT2,
    uerc20Factory: UERC20_FACTORY,
    positionManager: POSITION_MANAGER_AVALANCHE,
  },
  [SupportedChainId.XLAYER]: {
    liquidityLauncher: LIQUIDITY_LAUNCHER,
    lbpStrategy: getAddress('0x95bcb80e3804a085d23778F2956c305d6488e000'),
    tokenSplitter: TOKEN_SPLITTER,
    ccaFactory: CCA_FACTORY,
    permit2: PERMIT2,
    uerc20Factory: UERC20_FACTORY,
    positionManager: POSITION_MANAGER_XLAYER,
  },
  [SupportedChainId.ROBINHOOD]: {
    liquidityLauncher: LIQUIDITY_LAUNCHER,
    lbpStrategy: getAddress('0x095e38a2135aeBcfFa98A5B6911591937f912000'),
    tokenSplitter: TOKEN_SPLITTER,
    ccaFactory: CCA_FACTORY,
    permit2: PERMIT2,
    uerc20Factory: UERC20_FACTORY,
    positionManager: POSITION_MANAGER_ROBINHOOD,
  },
  [SupportedChainId.SEPOLIA]: {
    liquidityLauncher: LIQUIDITY_LAUNCHER,
    lbpStrategy: getAddress('0x3f37838651B5AD71D4e01Ec9745862A5D9DF2000'),
    tokenSplitter: TOKEN_SPLITTER,
    ccaFactory: CCA_FACTORY,
    permit2: PERMIT2,
    uerc20Factory: UERC20_FACTORY,
    positionManager: POSITION_MANAGER_SEPOLIA,
  },
  [SupportedChainId.BASE_SEPOLIA]: {
    liquidityLauncher: LIQUIDITY_LAUNCHER,
    lbpStrategy: getAddress('0x0e1793a989c682117fcBfB3a9aA8e451D37D2000'),
    tokenSplitter: TOKEN_SPLITTER,
    ccaFactory: CCA_FACTORY,
    permit2: PERMIT2,
    usuperc20Factory: USUPERC20_FACTORY,
    positionManager: POSITION_MANAGER_BASE_SEPOLIA,
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
