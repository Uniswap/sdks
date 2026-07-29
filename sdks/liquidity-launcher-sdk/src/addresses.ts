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
// Current CCA factory: the 2026-07-09 redeploy built against blocknumberish v1.1.0, which translates
// block.number on every chain that needs it (e.g. Arbitrum One and Robinhood/4663 — the earlier
// factory only handled Arbitrum, so on other translated chains it derived auction block ranges
// against the wrong clock). Every v3.1.0 LBPStrategy in LAUNCHER_ADDRESSES creates its auction
// through this factory (verified on-chain via LBPStrategy.initializerFactory()), so it is the
// ccaFactory for all chains.
const CCA_FACTORY = getAddress('0x000000001F26a0044BaA66024e7b6599c61963F8')
// Legacy CCA factory (built against blocknumberish v1.0.x), used by the pre-v3.1.0 strategies.
// Superseded as the per-chain ccaFactory by CCA_FACTORY above; retained only so the auction-factory
// registry can still resolve auctions created before the redeploy.
const CCA_FACTORY_LEGACY = getAddress('0x00cCa200BF124dBfA848937c553864f4B4CE0632')
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
    lbpStrategy: getAddress('0x49380c4EfaB1b491006aF7FabAB8B3459F0E6000'),
    tokenSplitter: TOKEN_SPLITTER,
    ccaFactory: CCA_FACTORY,
    permit2: PERMIT2,
    uerc20Factory: UERC20_FACTORY,
    usuperc20Factory: USUPERC20_FACTORY,
    positionManager: POSITION_MANAGER_MAINNET,
  },
  [SupportedChainId.UNICHAIN]: {
    liquidityLauncher: LIQUIDITY_LAUNCHER,
    lbpStrategy: getAddress('0x298eA05D0356B2Ae5cCAa3169E471783ee9EA000'),
    tokenSplitter: TOKEN_SPLITTER,
    ccaFactory: CCA_FACTORY,
    permit2: PERMIT2,
    usuperc20Factory: USUPERC20_FACTORY,
    positionManager: POSITION_MANAGER_UNICHAIN,
  },
  [SupportedChainId.BASE]: {
    liquidityLauncher: LIQUIDITY_LAUNCHER,
    lbpStrategy: getAddress('0x34385dD739FE5464892BF0bA4CC42492804dA000'),
    tokenSplitter: TOKEN_SPLITTER,
    ccaFactory: CCA_FACTORY,
    permit2: PERMIT2,
    usuperc20Factory: USUPERC20_FACTORY,
    positionManager: POSITION_MANAGER_BASE,
  },
  [SupportedChainId.ARBITRUM_ONE]: {
    liquidityLauncher: LIQUIDITY_LAUNCHER,
    lbpStrategy: getAddress('0x8Af0775a70Cc94D71DFc0fE809435e833F2Fe000'),
    tokenSplitter: TOKEN_SPLITTER,
    ccaFactory: CCA_FACTORY,
    permit2: PERMIT2,
    uerc20Factory: UERC20_FACTORY,
    positionManager: POSITION_MANAGER_ARBITRUM,
  },
  [SupportedChainId.AVALANCHE]: {
    liquidityLauncher: LIQUIDITY_LAUNCHER,
    lbpStrategy: getAddress('0x57BD0A9Cd933c89Ba55e086D53031367b6406000'),
    tokenSplitter: TOKEN_SPLITTER,
    ccaFactory: CCA_FACTORY,
    permit2: PERMIT2,
    uerc20Factory: UERC20_FACTORY,
    positionManager: POSITION_MANAGER_AVALANCHE,
  },
  [SupportedChainId.XLAYER]: {
    liquidityLauncher: LIQUIDITY_LAUNCHER,
    lbpStrategy: getAddress('0x58DF162fF41e5cB42B8515f75F90C1841938A000'),
    tokenSplitter: TOKEN_SPLITTER,
    ccaFactory: CCA_FACTORY,
    permit2: PERMIT2,
    uerc20Factory: UERC20_FACTORY,
    positionManager: POSITION_MANAGER_XLAYER,
  },
  [SupportedChainId.ROBINHOOD]: {
    liquidityLauncher: LIQUIDITY_LAUNCHER,
    lbpStrategy: getAddress('0x05d552391067389EE44fec3924157ed33F976000'),
    tokenSplitter: TOKEN_SPLITTER,
    ccaFactory: CCA_FACTORY,
    permit2: PERMIT2,
    uerc20Factory: UERC20_FACTORY,
    positionManager: POSITION_MANAGER_ROBINHOOD,
  },
  [SupportedChainId.SEPOLIA]: {
    liquidityLauncher: LIQUIDITY_LAUNCHER,
    lbpStrategy: getAddress('0x96641d91e223c766F45b19d09494F5925C3cE000'),
    tokenSplitter: TOKEN_SPLITTER,
    ccaFactory: CCA_FACTORY,
    permit2: PERMIT2,
    uerc20Factory: UERC20_FACTORY,
    positionManager: POSITION_MANAGER_SEPOLIA,
  },
  [SupportedChainId.BASE_SEPOLIA]: {
    liquidityLauncher: LIQUIDITY_LAUNCHER,
    lbpStrategy: getAddress('0xB06428b62c259eE982cE3D9BED47391dC9A5E000'),
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
    factory: CCA_FACTORY_LEGACY,
    tickDataLens: TICK_DATA_LENS_V2,
    description: 'v2 CCA factory (blocknumberish v1.0.x; superseded by the 2026-07-09 redeploy)',
  },
  {
    factory: CCA_FACTORY,
    tickDataLens: TICK_DATA_LENS_V2,
    description: 'v2 CCA factory (2026-07-09 blocknumberish v1.1.0 redeploy; current on all chains)',
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

// ---------------------------------------------------------------------------
// Instant Launch deployment registry (variant-keyed, append-only)
// ---------------------------------------------------------------------------

// Canonical chain-4663 (Robinhood) Instant Launch deployment, per the liquidity-launcher dev README
// (the single source of truth for these addresses). Creator-fee on/off is a **constructor immutable
// per strategy instance** (a zero `beneficiaryVault` immutable = fees off), so each variant is its
// own strategy + FeeSplitter pair; the FeeSplitter's split table is likewise immutable at
// construction. Strategies from commit dd232ed (includes the OZ H01 fix flooring launch positions
// at tick -208,980); periphery from commit 0b06e9f.
const INSTANT_LAUNCH_STRATEGY_FEES_ON_ROBINHOOD = getAddress('0x5B37F9a24e9CAb142Ca758A69a28Bf57B4c714D9')
const INSTANT_LAUNCH_STRATEGY_FEES_OFF_ROBINHOOD = getAddress('0x42cdE2f72B2292BE3973c59811b8901627930b2d')
const INSTANT_LAUNCH_FEE_SPLITTER_FEES_ON_ROBINHOOD = getAddress('0xf139e6835B1494c9AC57133B1Dc052B097328199')
const INSTANT_LAUNCH_FEE_SPLITTER_FEES_OFF_ROBINHOOD = getAddress('0xF165D5B169106e13bFB568C52af5d11977365630')
const UERC20_BENEFICIARY_VAULT_ROBINHOOD = getAddress('0xF3b8653B53d75ec9925d88b051CcFDabbd4894f5')
const COMPOUNDING_CLAIM_RECIPIENT_ROBINHOOD = getAddress('0x3fC7BA967295C10AFD2Ad4f098Dce3a71e6b8c73')

/** FeeSplitter splits are expressed in basis points summing to this denominator per currency side. */
export const FEE_SPLIT_BPS_DENOMINATOR = 10_000

/**
 * One Instant Launch strategy deployment: an InstantLaunchStrategy instance plus the immutable
 * contracts wired into it at construction. The creator-fee variant is a deployment property, not a
 * launch parameter — enabling/disabling creator fees means launching through a different strategy.
 */
export interface InstantLaunchDeployment {
  /** Chain the instance is deployed to. */
  chainId: number
  /** The InstantLaunchStrategy instance (`Distribution.strategy` of a launch). */
  strategy: Address
  /**
   * The strategy's immutable FeeSplitter — the permanent custodian of every launch LP NFT this
   * strategy mints (`TokenLaunched.finalPositionRecipient`) and the fee distributor for it.
   */
  feeSplitter: Address
  /**
   * Whether this instance carries a creator-fee share: `true` when the strategy's immutable
   * `beneficiaryVault` is set (each launch registers its `feeBeneficiary`, minting the transferable
   * beneficiary ERC721), `false` when it is zero (registration skipped; the config beneficiary is
   * ignored and 100% of fees autocompound).
   */
  creatorFeesEnabled: boolean
  /**
   * Share of each `FeesCollected` **native (ETH)** amount the splitter forwards to the beneficiary
   * vault, in bps of {@link FEE_SPLIT_BPS_DENOMINATOR}. The creator's accrual rate: 4000 on the
   * fees-on splitter, 0 on the fees-off one. The remainder autocompounds.
   */
  creatorFeeNativeBps: number
  /** Share of each `FeesCollected` **token** amount forwarded to the vault, in bps (0 on every current deploy). */
  creatorFeeTokenBps: number
  /** The strategy's immutable `initialTick` — the aligned tick the launch pool opens at. */
  initialTick: number
  /** Human-readable deployment tag (not an on-chain value). */
  description: string
  /** Block the strategy was deployed at, when recorded (indexer start height). */
  deployedAtBlock?: number
}

/**
 * The per-chain Instant Launch singletons shared by every strategy variant on that chain.
 */
export interface InstantLaunchChainContracts {
  /** LiquidityLauncher — the `multicall(createToken, distributeToken)` entrypoint (same registry value as {@link LauncherAddresses.liquidityLauncher}). */
  liquidityLauncher: Address
  /**
   * UERC20BeneficiaryVault — registers each fees-on launch's beneficiary as a transferable ERC721
   * and vaults the creator's share of split fees. Also lets the creator of a launcher-created
   * uERC20 claim unregistered positions via the token's graffiti.
   */
  beneficiaryVault: Address
  /**
   * CompoundingClaimRecipient — the protocol/autocompound split recipient of every FeeSplitter on
   * the chain. Its `Claimed` events prove same-transaction liquidity compounding.
   */
  compoundingClaimRecipient: Address
}

/**
 * Every Instant Launch strategy deployment — current and historical. **Append-only**: indexed
 * launches permanently reference the strategy that created them, so a redeploy appends new entries
 * and keeps the old ones; downstream indexers resolve a stored strategy address through
 * {@link getInstantLaunchDeployment} instead of hardcoding their own map, and transaction builders
 * select the current variant via {@link getInstantLaunchStrategy}. A contract redeploy is then just
 * an SDK release. The current deployment for a (chain, variant) pair is the **last** matching entry.
 */
export const INSTANT_LAUNCH_DEPLOYMENTS: readonly InstantLaunchDeployment[] = [
  {
    chainId: SupportedChainId.ROBINHOOD,
    strategy: INSTANT_LAUNCH_STRATEGY_FEES_ON_ROBINHOOD,
    feeSplitter: INSTANT_LAUNCH_FEE_SPLITTER_FEES_ON_ROBINHOOD,
    creatorFeesEnabled: true,
    creatorFeeNativeBps: 4000,
    creatorFeeTokenBps: 0,
    initialTick: 198060,
    description:
      'Instant Launch with creator fees (2026-07-29, liquidity-launcher dd232ed): splitter forwards 40% of native fees to the UERC20BeneficiaryVault, 60% native + 100% token to the CompoundingClaimRecipient',
  },
  {
    chainId: SupportedChainId.ROBINHOOD,
    strategy: INSTANT_LAUNCH_STRATEGY_FEES_OFF_ROBINHOOD,
    feeSplitter: INSTANT_LAUNCH_FEE_SPLITTER_FEES_OFF_ROBINHOOD,
    creatorFeesEnabled: false,
    creatorFeeNativeBps: 0,
    creatorFeeTokenBps: 0,
    initialTick: 198060,
    description:
      'Instant Launch without creator fees (2026-07-29, liquidity-launcher dd232ed): zero beneficiary vault; splitter forwards 100% of both fee sides to the CompoundingClaimRecipient',
  },
]

/** The per-chain Instant Launch singleton contracts, keyed by numeric chain id. */
export const INSTANT_LAUNCH_CONTRACTS: Partial<Record<number, InstantLaunchChainContracts>> = {
  [SupportedChainId.ROBINHOOD]: {
    liquidityLauncher: LIQUIDITY_LAUNCHER,
    beneficiaryVault: UERC20_BENEFICIARY_VAULT_ROBINHOOD,
    compoundingClaimRecipient: COMPOUNDING_CLAIM_RECIPIENT_ROBINHOOD,
  },
}

/**
 * Strategy address (lowercased) → deployment, derived from {@link INSTANT_LAUNCH_DEPLOYMENTS}.
 * Keys are lowercased so lookups are case-insensitive regardless of how the caller stored the
 * strategy address; prefer {@link getInstantLaunchDeployment}, which normalizes for you.
 */
export const INSTANT_LAUNCH_DEPLOYMENT_BY_STRATEGY: ReadonlyMap<string, InstantLaunchDeployment> = new Map(
  INSTANT_LAUNCH_DEPLOYMENTS.map((deployment) => [deployment.strategy.toLowerCase(), deployment])
)

/** Every Instant Launch strategy deployment on `chainId` (empty where none is deployed). */
export function getInstantLaunchDeployments(chainId: number): readonly InstantLaunchDeployment[] {
  return INSTANT_LAUNCH_DEPLOYMENTS.filter((deployment) => deployment.chainId === chainId)
}

/**
 * Selects the **current** strategy deployment for a chain and creator-fee variant — what a
 * transaction builder launches through. Returns the last matching registry entry (the registry is
 * append-only, so the newest deployment of a variant wins), or `undefined` where the variant is not
 * deployed.
 */
export function getInstantLaunchStrategy(
  chainId: number,
  options: { creatorFeesEnabled: boolean }
): InstantLaunchDeployment | undefined {
  const matching = INSTANT_LAUNCH_DEPLOYMENTS.filter(
    (deployment) => deployment.chainId === chainId && deployment.creatorFeesEnabled === options.creatorFeesEnabled
  )
  return matching[matching.length - 1]
}

/**
 * Reverse lookup for indexers/attribution: resolves a stored strategy address (case-insensitive) to
 * its deployment — chain, FeeSplitter, creator-fee variant and split bps. Returns `undefined` for a
 * strategy not in {@link INSTANT_LAUNCH_DEPLOYMENTS}.
 */
export function getInstantLaunchDeployment(strategyAddress: string): InstantLaunchDeployment | undefined {
  return INSTANT_LAUNCH_DEPLOYMENT_BY_STRATEGY.get(strategyAddress.toLowerCase())
}

/** The per-chain Instant Launch singletons, or `undefined` where Instant Launch is not deployed. */
export function getInstantLaunchContracts(chainId: number): InstantLaunchChainContracts | undefined {
  return INSTANT_LAUNCH_CONTRACTS[chainId]
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
