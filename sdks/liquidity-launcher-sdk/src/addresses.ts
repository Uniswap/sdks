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
// Robinhood-only redeploy (2026-07-09): CCA factory rebuilt against a blocknumberish that also
// recognizes chain 4663 (the original deployment only substituted arbBlockNumber on Arbitrum One).
const CCA_FACTORY_ROBINHOOD = getAddress('0x000000001F26a0044BaA66024e7b6599c61963F8')
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
    // Redeployed 2026-07-09 alongside CCA_FACTORY_ROBINHOOD (blocknumberish-aware).
    lbpStrategy: getAddress('0x843747f4c08E3393E55508F577296bA48E8Ca000'),
    tokenSplitter: TOKEN_SPLITTER,
    ccaFactory: CCA_FACTORY_ROBINHOOD,
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

// ---------------------------------------------------------------------------
// Auction factory deployment registry (chain-independent)
// ---------------------------------------------------------------------------

// Historical auction factories. Every factory is a CREATE2 deploy, so each address is the same on
// every chain it exists on — the registry below is therefore chain-independent.
const TWA_FACTORY_V1 = getAddress('0xcccccccae7503cac057829bf2811de42e16e0bd5')
const CCA_FACTORY_EARLY_TEST = getAddress('0x088ca22b591f2f4bf0ad2780d2a44fa692e948d0')

/** TickDataLens for v1 (TWA) auctions. CREATE2 — same address on every supported chain. */
export const TICK_DATA_LENS_V1: Address = getAddress('0x5fAE46790F3F48A35e3792f89A9eC54FC52b207a')
/** TickDataLens for v2 (CCA) auctions. CREATE2 — same address on every supported chain. */
export const TICK_DATA_LENS_V2: Address = getAddress('0xc3C65F5453A3674aDb693cbdA3C842545cD30f53')

/** One historical auction-factory deployment, paired with the lens that reads its auctions. */
export interface AuctionFactoryDeployment {
  /** The auction factory (CREATE2 — same address on every chain it is deployed to). */
  factory: Address
  /**
   * The TickDataLens that can read auctions created by this factory. The lens is 1:1 with the
   * auction implementation version: v1 (TWA) auctions can only be read by the v1 lens, v2 (CCA)
   * auctions by the v2 lens. Both lenses return the same tuple shape, so one ABI decodes either.
   */
  tickDataLens: Address
  /** Human-readable deployment tag (not an on-chain value). */
  description: string
}

/**
 * Every auction factory ever deployed — current and historical — each paired with its TickDataLens.
 * Append-only: indexed auctions permanently reference the factory that created them, so when a
 * factory is redeployed the new entry is added and the old ones are kept. Downstream indexers
 * resolve a stored factory address through this registry instead of hardcoding their own map, so a
 * redeploy only requires bumping this package.
 */
export const AUCTION_FACTORY_DEPLOYMENTS: readonly AuctionFactoryDeployment[] = [
  {
    factory: TWA_FACTORY_V1,
    tickDataLens: TICK_DATA_LENS_V1,
    description: 'v1 TWA auction factory',
  },
  {
    factory: CCA_FACTORY_EARLY_TEST,
    tickDataLens: TICK_DATA_LENS_V2,
    description: 'v2 CCA factory (early test deploy)',
  },
  {
    factory: CCA_FACTORY,
    tickDataLens: TICK_DATA_LENS_V2,
    description: 'v2 CCA factory (contracts v2.0.0, deployed on all supported chains)',
  },
  {
    factory: CCA_FACTORY_ROBINHOOD,
    tickDataLens: TICK_DATA_LENS_V2,
    description: 'v2 CCA factory (2026-07-09 blocknumberish-aware redeploy, contracts v1.1.x)',
  },
]

/**
 * Factory address (lowercased) → TickDataLens, derived from {@link AUCTION_FACTORY_DEPLOYMENTS}.
 * Keys are lowercased so lookups are case-insensitive regardless of how the caller stored the
 * factory address; prefer {@link getTickDataLensForFactory}, which normalizes for you.
 */
export const TICK_DATA_LENS_BY_FACTORY: ReadonlyMap<string, Address> = new Map(
  AUCTION_FACTORY_DEPLOYMENTS.map((deployment) => [deployment.factory.toLowerCase(), deployment.tickDataLens])
)

/**
 * Resolves the TickDataLens that reads auctions created by `factoryAddress` (case-insensitive).
 * Returns `undefined` for a factory not in {@link AUCTION_FACTORY_DEPLOYMENTS} — callers with
 * pre-registry rows (or a null stored factory) typically fall back to {@link TICK_DATA_LENS_V1},
 * since every auction indexed before factories were recorded is a v1 auction.
 */
export function getTickDataLensForFactory(factoryAddress: string): Address | undefined {
  return TICK_DATA_LENS_BY_FACTORY.get(factoryAddress.toLowerCase())
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
