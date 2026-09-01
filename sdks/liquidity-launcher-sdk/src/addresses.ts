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
   * UniversalRouterStrategy singleton: the launcher-gated strategy that runs a caller-supplied
   * Universal Router route, so a launch and a creator buy fit in one `multicall`. Passed as the
   * `strategy` of `distributeWithNative` (native input) or of a `Distribution` (ERC-20 input).
   * Optional — deployed only on chains that carry the liquidity-launcher #223/#227 launcher.
   */
  universalRouterStrategy?: Address
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
// The #223/#227 redeployed launcher: the redeploy changed the launcher's bytecode so the original
// mined vanity salt no longer resolves to LIQUIDITY_LAUNCHER. Deployed on Robinhood (4663, the
// 2026-08-05 full redeploy) and Arc (5042); once it is deployed on every chain, this constant
// collapses back into LIQUIDITY_LAUNCHER.
//
// 2026-08-05 full redeploy: the re-mined launcher, superseding the v3.1.1 interim launcher
// `0x7A6C474b…` (which itself superseded the never-launched v3.1.0 dev launcher `0xe050309b…`).
// Unlike the v3.1.0 removal, the v3.1.1 generation has indexed launches, so its strategy pair
// stays registered in {@link INSTANT_LAUNCH_DEPLOYMENTS} below — only the "current" pointers move.
const LIQUIDITY_LAUNCHER_REDEPLOYED = getAddress('0x0000FffFBE8efE702c8703aE3477FF5dE3d319C0')
// UniversalRouterStrategy, pinned to LIQUIDITY_LAUNCHER_REDEPLOYED as a constructor immutable.
// Deployed via CREATE2 at salt 0 through the canonical deployer (liquidity-launcher#227
// `DeployUniversalRouterStrategy.s.sol`) — but it is only deployed per-chain so far, hence the
// per-chain optional field. 2026-08-05 full redeploy; supersedes the v3.1.1 `0x4962907c…` (and the
// v3.1.0 `0xB7fF4d94…` before it).
const UNIVERSAL_ROUTER_STRATEGY_ROBINHOOD = getAddress('0x1242c9439d589cAE85E121B1f79f2aF51e91DCEE')
// Arc deploy of the UniversalRouterStrategy (a different address than Robinhood's despite the same
// launcher immutable — read back from the 5042 deploy; `launcher()` verified on-chain).
const UNIVERSAL_ROUTER_STRATEGY_ARC = getAddress('0x0A122717bc36E3C7A7958128a5C789E0b070b3Ae')
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
// 2026-08-05 full-redeploy TokenSplitter, chain 4663 only — the rest of the chains keep the shared
// TOKEN_SPLITTER above. Same collapse caveat as LIQUIDITY_LAUNCHER_REDEPLOYED.
const TOKEN_SPLITTER_ROBINHOOD = getAddress('0x4F5E3FBb9745358A92Da5674305FAb8D2B8a73cE')

// Token factories, split by token standard. The uERC20 factory shares a CREATE2 address across the
// Ethereum-style chains that deploy it; the super-uERC20 factory shares one across the superchains.
const UERC20_FACTORY = getAddress('0x000000e200088D55C39a11F609E5F667729ad49b')
const USUPERC20_FACTORY = getAddress('0xeEeeEEE204Afb6BABb1287ffed52cCD6BA0b0fb2')
// Arc's uERC20 factory is not at the shared CREATE2 address.
const UERC20_FACTORY_ARC = getAddress('0xFf99D8f6C994607576eB652EDCf12E04a7EbfBf6')

// Canonical Uniswap v4 PositionManager per chain (sdk-core CHAIN_TO_ADDRESSES_MAP[id].v4PositionManagerAddress).
const POSITION_MANAGER_MAINNET = getAddress('0xbD216513d74C8cf14cf4747E6AaA6420FF64ee9e')
const POSITION_MANAGER_UNICHAIN = getAddress('0x4529A01c7A0410167c5740C487A8DE60232617bf')
const POSITION_MANAGER_BASE = getAddress('0x7C5f5A4bBd8fD63184577525326123B519429bDc')
const POSITION_MANAGER_ARBITRUM = getAddress('0xd88F38F930b7952f2DB2432Cb002E7abbF3dD869')
const POSITION_MANAGER_AVALANCHE = getAddress('0xB74b1F14d2754AcfcbBe1a221023a5cf50Ab8ACD')
const POSITION_MANAGER_XLAYER = getAddress('0xcF1EAFC6928dC385A342E7C6491d371d2871458b')
const POSITION_MANAGER_ROBINHOOD = getAddress('0x58daec3116aae6D93017bAAea7749052E8a04fA7')
const POSITION_MANAGER_ARC = getAddress('0x6049c9a0e26405C0985f9E3685C87d0aE917f82B')
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
    liquidityLauncher: LIQUIDITY_LAUNCHER_REDEPLOYED,
    lbpStrategy: getAddress('0x05d552391067389EE44fec3924157ed33F976000'),
    tokenSplitter: TOKEN_SPLITTER_ROBINHOOD,
    ccaFactory: CCA_FACTORY,
    permit2: PERMIT2,
    universalRouterStrategy: UNIVERSAL_ROUTER_STRATEGY_ROBINHOOD,
    uerc20Factory: UERC20_FACTORY,
    positionManager: POSITION_MANAGER_ROBINHOOD,
  },
  [SupportedChainId.ARC]: {
    liquidityLauncher: LIQUIDITY_LAUNCHER_REDEPLOYED,
    lbpStrategy: getAddress('0xe9f36bcc222a6d2e459529D787f8c060d543A000'),
    // Arc keeps the shared TokenSplitter (verified deployed on 5042), unlike Robinhood's
    // full-redeploy splitter. ccaFactory verified on-chain via LBPStrategy.initializerFactory().
    tokenSplitter: TOKEN_SPLITTER,
    ccaFactory: CCA_FACTORY,
    permit2: PERMIT2,
    universalRouterStrategy: UNIVERSAL_ROUTER_STRATEGY_ARC,
    uerc20Factory: UERC20_FACTORY_ARC,
    positionManager: POSITION_MANAGER_ARC,
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

// Canonical chain-4663 (Robinhood) Instant Launch deployments, per the liquidity-launcher dev
// README (the single source of truth for these addresses). Creator-fee on/off is a **constructor
// immutable per strategy instance** (a zero `beneficiaryVault` immutable = fees off), so each
// variant is its own strategy + FeeSplitter pair; the FeeSplitter's split table is likewise
// immutable at construction.
//
// Five strategy generations are registered (append-only — indexed launches permanently reference
// the strategy that created them; see {@link INSTANT_LAUNCH_DEPLOYMENTS}):
//  - c3f9506 pair (2026-07-29): OZ notes/L-04 round + the 1e20 compounding floor; still carries
//    the OZ H01 fix flooring launch positions at tick -208,980. Has indexed launches, so it stays.
//  - 8e40a35 pair (2026-07-30): caps the instant-launch initial tick at 251,340 — a deploy-script/
//    constructor-side change only, no ABI or event changes.
//  - 3e05da8 pair (2026-07-30): comment/natspec cleanup on the same logic.
//  - v3.1.1 pair (2026-08-05): forced by the launcher redeploy in liquidity-launcher #223/#227.
//    The strategy logic is untouched (neither PR modifies InstantLaunchStrategy.sol) — each runtime
//    is byte-identical to its 3e05da8 counterpart except at the three sites embedding the
//    `launcher` immutable, which holds the interim v3.1.1 launcher `0x7A6C474b…`. A pure re-pin.
//    This pair also carries a new fees-on FeeSplitter (`0x6CC1b74F…`) and a new
//    UERC20BeneficiaryVault (`0xa5889CaF…`), unlike the earlier three generations which all reuse
//    the c3f9506 splitters and vault.
//  - 2026-08-05 full-redeploy pair (current): the whole 4663 stack was redeployed the same day —
//    launcher (re-mined `0x0000FffF…`), strategies, both FeeSplitters, UERC20BeneficiaryVault,
//    CompoundingClaimRecipient, TokenSplitter and UniversalRouterStrategy. NOT a pure re-pin,
//    unlike v3.1.1: the strategy was recompiled with a new pool shape — TICK_SPACING 60 → 25,
//    initialTick 198,060 → 198,050, MIN_LAUNCH_TICK -208,980 → -160,100 (all read back from the
//    deployed contracts' getters, 2026-08-05).
//
// The v3.1.0 dev pair (`0xF0C0a0f3…` / `0x3fe607E7…`) that shipped in 1.6.0 is **removed rather than
// retained**: it was mis-pinned to the previous launcher, was never launched against, and therefore
// has no indexed launches for the append-only rule to protect. Every generation that does have
// indexed launches is still registered below.
//
// Every generation up to and including v3.1.1 opens pools at initialTick 198,060 (spacing 60); the
// 2026-08-05 full-redeploy pair opens at 198,050 (spacing 25). Pools are permanent, so BOTH pool
// shapes trade forever — see the per-entry `tickSpacing` / `initialTick` / `minLaunchTick` fields.
const INSTANT_LAUNCH_STRATEGY_FEES_ON_ROBINHOOD_C3F9506 = getAddress('0x60D73b21cDf2EA846ab3d58699BBbb8F29d72491')
const INSTANT_LAUNCH_STRATEGY_FEES_OFF_ROBINHOOD_C3F9506 = getAddress('0xFCe92C70f1fc017b72f6DD7a00D9E38725C7fBd1')
const INSTANT_LAUNCH_STRATEGY_FEES_ON_ROBINHOOD_8E40A35 = getAddress('0xcE57498D3474DCC244dFb6710fFbE6D4441cD2b2')
const INSTANT_LAUNCH_STRATEGY_FEES_OFF_ROBINHOOD_8E40A35 = getAddress('0x583a7903152b95831e82ffF534448Dee081754ec')
const INSTANT_LAUNCH_STRATEGY_FEES_ON_ROBINHOOD_3E05DA8 = getAddress('0x9F67B864B565966dfCc2E0C6bA2483b2D5fF4b00')
const INSTANT_LAUNCH_STRATEGY_FEES_OFF_ROBINHOOD_3E05DA8 = getAddress('0x16b63f1c8415FD68591c31FB3c6796a333DD640C')
// v3.1.1, re-pinned to the interim v3.1.1 launcher `0x7A6C474b…`.
const INSTANT_LAUNCH_STRATEGY_FEES_ON_ROBINHOOD_V311 = getAddress('0x3f556B542105D5EFBBefe7C766a4919C76B960Fb')
const INSTANT_LAUNCH_STRATEGY_FEES_OFF_ROBINHOOD_V311 = getAddress('0x36bdB859518C89F764337cd5C24762d2Aa650f3C')
// 2026-08-05 full redeploy, re-pinned to LIQUIDITY_LAUNCHER_REDEPLOYED.
const INSTANT_LAUNCH_STRATEGY_FEES_ON_ROBINHOOD_20260805 = getAddress('0x23f8209572b4a1C2AD88A42749E830791Fb027f1')
const INSTANT_LAUNCH_STRATEGY_FEES_OFF_ROBINHOOD_20260805 = getAddress('0xAD44D55E7f8337C3cE113fBb591486E85be104b2')
// FeeSplitters. The fees-on side got a fresh splitter in v3.1.1 (it points at the v3.1.1 beneficiary
// vault, likewise a new deploy at the time); the 2026-08-05 full redeploy replaces **both** sides —
// the first time the fees-off splitter moves. Superseded splitters stay registered on their
// generations — indexed launches migrated LP positions to them permanently, so they must keep
// classifying.
const INSTANT_LAUNCH_FEE_SPLITTER_FEES_ON_ROBINHOOD_C3F9506 = getAddress('0x7198C32a497c09497e04C86cf8F77A244A9E4b8F')
const INSTANT_LAUNCH_FEE_SPLITTER_FEES_ON_ROBINHOOD_V311 = getAddress('0x6CC1b74Fc1BE1ff373Fa07f3381856f38103e653')
const INSTANT_LAUNCH_FEE_SPLITTER_FEES_ON_ROBINHOOD_20260805 = getAddress('0xeFF166AAf189323c58dc27eD1206EB2C37FaACDf')
// The c3f9506 fees-off splitter served every generation up to and including v3.1.1.
const INSTANT_LAUNCH_FEE_SPLITTER_FEES_OFF_ROBINHOOD_C3F9506 = getAddress('0xDF50f4ea2207F9D2A753a3DaE729B36FDEF13b23')
const INSTANT_LAUNCH_FEE_SPLITTER_FEES_OFF_ROBINHOOD_20260805 = getAddress('0x222D6d4f1ce59b0d48D5505114eC8Addc90A4359')
// UERC20BeneficiaryVault. The 2026-08-05 full redeploy deploys a new one; it is the vault the
// current fees-on splitter forwards the creator share to, and the one a new launch registers its
// beneficiary with. Supersedes the v3.1.1 vault `0xa5889CaF…` (and the c3f9506 vault `0x587D2fDD…`
// before it), which remain the claim surfaces for beneficiaries registered by older generations.
const UERC20_BENEFICIARY_VAULT_ROBINHOOD = getAddress('0xd35E9CA72F64C7F93BE30fad67524323396B36D7')
// CompoundingClaimRecipient. 2026-08-05 full redeploy; supersedes `0x666DA634…`, which remains the
// autocompound claim surface of the older generations' splitters.
const COMPOUNDING_CLAIM_RECIPIENT_ROBINHOOD = getAddress('0xf9526Dd3361fe0ba6b7a99533ed471D3E808E99a')

// Arc (5042) Instant Launch stack. Arc's native currency is 18-decimal USDC, so initialTick is
// USDC-denominated (122,050 ≈ $5k FDV on 1e9 supply), not Robinhood's ETH-denominated 198,050.
// Fees-on/fees-off assignment follows the deploy-log order; confirm via beneficiaryVault()
// (fees-on = the Arc vault, fees-off = address(0)).
const INSTANT_LAUNCH_STRATEGY_FEES_ON_ARC = getAddress('0xfe7Be4EbBE6CcDfA57EE8c36fe9a767B033eB056')
const INSTANT_LAUNCH_STRATEGY_FEES_OFF_ARC = getAddress('0xff301aCB22816D210d75D71F31Ac13C771093EF3')
const INSTANT_LAUNCH_FEE_SPLITTER_FEES_ON_ARC = getAddress('0xC2F1D91599d7CB04E6BB156AB3D10972cC2da607')
const INSTANT_LAUNCH_FEE_SPLITTER_FEES_OFF_ARC = getAddress('0xCDDC6103dD64dd05Cf634166326a21Be06B3165A')
const UERC20_BENEFICIARY_VAULT_ARC = getAddress('0x3892aB3Dcf62785Ee3077ea008486c3a6bCf51Af')
const COMPOUNDING_CLAIM_RECIPIENT_ARC = getAddress('0xBE5A26C5E7ABC4f049971e18214301931e23D1Db')

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
  /**
   * The strategy's compile-time pool tick spacing (`TICK_SPACING`) — the spacing every pool this
   * generation minted has forever. 25 on the 2026-08-05 full-redeploy pair, 60 on every earlier
   * generation.
   */
  tickSpacing: number
  /** The strategy's immutable `initialTick` — the aligned tick the launch pool opens at. */
  initialTick: number
  /**
   * The strategy's compile-time lower tick of every launch position (`MIN_LAUNCH_TICK`).
   * -160,100 on the 2026-08-05 full-redeploy pair, -208,980 (the OZ H01 floor) on every earlier
   * generation.
   */
  minLaunchTick: number
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
    strategy: INSTANT_LAUNCH_STRATEGY_FEES_ON_ROBINHOOD_C3F9506,
    feeSplitter: INSTANT_LAUNCH_FEE_SPLITTER_FEES_ON_ROBINHOOD_C3F9506,
    creatorFeesEnabled: true,
    creatorFeeNativeBps: 4000,
    creatorFeeTokenBps: 0,
    tickSpacing: 60,
    initialTick: 198060,
    minLaunchTick: -208980,
    description:
      'Instant Launch with creator fees (2026-07-29, liquidity-launcher c3f9506): splitter forwards 40% of native fees to the UERC20BeneficiaryVault, 60% native + 100% token to the CompoundingClaimRecipient',
  },
  {
    chainId: SupportedChainId.ROBINHOOD,
    strategy: INSTANT_LAUNCH_STRATEGY_FEES_OFF_ROBINHOOD_C3F9506,
    feeSplitter: INSTANT_LAUNCH_FEE_SPLITTER_FEES_OFF_ROBINHOOD_C3F9506,
    creatorFeesEnabled: false,
    creatorFeeNativeBps: 0,
    creatorFeeTokenBps: 0,
    tickSpacing: 60,
    initialTick: 198060,
    minLaunchTick: -208980,
    description:
      'Instant Launch without creator fees (2026-07-29, liquidity-launcher c3f9506): zero beneficiary vault; splitter forwards 100% of both fee sides to the CompoundingClaimRecipient',
  },
  {
    chainId: SupportedChainId.ROBINHOOD,
    strategy: INSTANT_LAUNCH_STRATEGY_FEES_ON_ROBINHOOD_8E40A35,
    feeSplitter: INSTANT_LAUNCH_FEE_SPLITTER_FEES_ON_ROBINHOOD_C3F9506,
    creatorFeesEnabled: true,
    creatorFeeNativeBps: 4000,
    creatorFeeTokenBps: 0,
    tickSpacing: 60,
    initialTick: 198060,
    minLaunchTick: -208980,
    description:
      'Instant Launch with creator fees (2026-07-30, liquidity-launcher 8e40a35 — initial-tick cap): same c3f9506 FeeSplitter; splitter forwards 40% of native fees to the UERC20BeneficiaryVault, 60% native + 100% token to the CompoundingClaimRecipient',
  },
  {
    chainId: SupportedChainId.ROBINHOOD,
    strategy: INSTANT_LAUNCH_STRATEGY_FEES_OFF_ROBINHOOD_8E40A35,
    feeSplitter: INSTANT_LAUNCH_FEE_SPLITTER_FEES_OFF_ROBINHOOD_C3F9506,
    creatorFeesEnabled: false,
    creatorFeeNativeBps: 0,
    creatorFeeTokenBps: 0,
    tickSpacing: 60,
    initialTick: 198060,
    minLaunchTick: -208980,
    description:
      'Instant Launch without creator fees (2026-07-30, liquidity-launcher 8e40a35 — initial-tick cap): zero beneficiary vault; same c3f9506 FeeSplitter forwarding 100% of both fee sides to the CompoundingClaimRecipient',
  },
  {
    chainId: SupportedChainId.ROBINHOOD,
    strategy: INSTANT_LAUNCH_STRATEGY_FEES_ON_ROBINHOOD_3E05DA8,
    feeSplitter: INSTANT_LAUNCH_FEE_SPLITTER_FEES_ON_ROBINHOOD_C3F9506,
    creatorFeesEnabled: true,
    creatorFeeNativeBps: 4000,
    creatorFeeTokenBps: 0,
    tickSpacing: 60,
    initialTick: 198060,
    minLaunchTick: -208980,
    description:
      'Instant Launch with creator fees (2026-07-30, liquidity-launcher 3e05da8): same c3f9506 FeeSplitter; splitter forwards 40% of native fees to the UERC20BeneficiaryVault, 60% native + 100% token to the CompoundingClaimRecipient',
  },
  {
    chainId: SupportedChainId.ROBINHOOD,
    strategy: INSTANT_LAUNCH_STRATEGY_FEES_OFF_ROBINHOOD_3E05DA8,
    feeSplitter: INSTANT_LAUNCH_FEE_SPLITTER_FEES_OFF_ROBINHOOD_C3F9506,
    creatorFeesEnabled: false,
    creatorFeeNativeBps: 0,
    creatorFeeTokenBps: 0,
    tickSpacing: 60,
    initialTick: 198060,
    minLaunchTick: -208980,
    description:
      'Instant Launch without creator fees (2026-07-30, liquidity-launcher 3e05da8): zero beneficiary vault; same c3f9506 FeeSplitter forwarding 100% of both fee sides to the CompoundingClaimRecipient',
  },
  {
    chainId: SupportedChainId.ROBINHOOD,
    strategy: INSTANT_LAUNCH_STRATEGY_FEES_ON_ROBINHOOD_V311,
    feeSplitter: INSTANT_LAUNCH_FEE_SPLITTER_FEES_ON_ROBINHOOD_V311,
    creatorFeesEnabled: true,
    creatorFeeNativeBps: 4000,
    creatorFeeTokenBps: 0,
    tickSpacing: 60,
    initialTick: 198060,
    minLaunchTick: -208980,
    description:
      'Instant Launch with creator fees (2026-08-05, liquidity-launcher v3.1.1): unchanged 3e05da8 logic re-pinned to the interim v3.1.1 LiquidityLauncher; own FeeSplitter forwarding 40% of native fees to the v3.1.1 UERC20BeneficiaryVault, 60% native + 100% token to the CompoundingClaimRecipient',
  },
  {
    chainId: SupportedChainId.ROBINHOOD,
    strategy: INSTANT_LAUNCH_STRATEGY_FEES_OFF_ROBINHOOD_V311,
    feeSplitter: INSTANT_LAUNCH_FEE_SPLITTER_FEES_OFF_ROBINHOOD_C3F9506,
    creatorFeesEnabled: false,
    creatorFeeNativeBps: 0,
    creatorFeeTokenBps: 0,
    tickSpacing: 60,
    initialTick: 198060,
    minLaunchTick: -208980,
    description:
      'Instant Launch without creator fees (2026-08-05, liquidity-launcher v3.1.1): unchanged 3e05da8 logic re-pinned to the interim v3.1.1 LiquidityLauncher; zero beneficiary vault; same c3f9506 FeeSplitter forwarding 100% of both fee sides to the CompoundingClaimRecipient',
  },
  {
    chainId: SupportedChainId.ROBINHOOD,
    strategy: INSTANT_LAUNCH_STRATEGY_FEES_ON_ROBINHOOD_20260805,
    feeSplitter: INSTANT_LAUNCH_FEE_SPLITTER_FEES_ON_ROBINHOOD_20260805,
    creatorFeesEnabled: true,
    creatorFeeNativeBps: 4000,
    creatorFeeTokenBps: 0,
    tickSpacing: 25,
    initialTick: 198050,
    minLaunchTick: -160100,
    description:
      'Instant Launch with creator fees (2026-08-05, full 4663 stack redeploy, current): recompiled with the new pool shape (TICK_SPACING 25, initialTick 198,050, MIN_LAUNCH_TICK -160,100) and pinned to the final re-mined LiquidityLauncher; new FeeSplitter forwarding 40% of native fees to the new UERC20BeneficiaryVault, 60% native + 100% token to the new CompoundingClaimRecipient',
  },
  {
    chainId: SupportedChainId.ROBINHOOD,
    strategy: INSTANT_LAUNCH_STRATEGY_FEES_OFF_ROBINHOOD_20260805,
    feeSplitter: INSTANT_LAUNCH_FEE_SPLITTER_FEES_OFF_ROBINHOOD_20260805,
    creatorFeesEnabled: false,
    creatorFeeNativeBps: 0,
    creatorFeeTokenBps: 0,
    tickSpacing: 25,
    initialTick: 198050,
    minLaunchTick: -160100,
    description:
      'Instant Launch without creator fees (2026-08-05, full 4663 stack redeploy, current): recompiled with the new pool shape (TICK_SPACING 25, initialTick 198,050, MIN_LAUNCH_TICK -160,100) and pinned to the final re-mined LiquidityLauncher; zero beneficiary vault; new FeeSplitter forwarding 100% of both fee sides to the new CompoundingClaimRecipient',
  },
  {
    chainId: SupportedChainId.ARC,
    strategy: INSTANT_LAUNCH_STRATEGY_FEES_ON_ARC,
    feeSplitter: INSTANT_LAUNCH_FEE_SPLITTER_FEES_ON_ARC,
    creatorFeesEnabled: true,
    creatorFeeNativeBps: 4000,
    creatorFeeTokenBps: 0,
    tickSpacing: 25,
    initialTick: 122050,
    minLaunchTick: -160100,
    description:
      'Instant Launch with creator fees (Arc/5042, current): native-USDC pool shape (TICK_SPACING 25, initialTick 122,050, MIN_LAUNCH_TICK -160,100), pinned to the re-mined LiquidityLauncher; FeeSplitter forwarding 40% of native fees to the Arc UERC20BeneficiaryVault, 60% native + 100% token to the Arc CompoundingClaimRecipient',
  },
  {
    chainId: SupportedChainId.ARC,
    strategy: INSTANT_LAUNCH_STRATEGY_FEES_OFF_ARC,
    feeSplitter: INSTANT_LAUNCH_FEE_SPLITTER_FEES_OFF_ARC,
    creatorFeesEnabled: false,
    creatorFeeNativeBps: 0,
    creatorFeeTokenBps: 0,
    tickSpacing: 25,
    initialTick: 122050,
    minLaunchTick: -160100,
    description:
      'Instant Launch without creator fees (Arc/5042, current): native-USDC pool shape (TICK_SPACING 25, initialTick 122,050, MIN_LAUNCH_TICK -160,100), pinned to the re-mined LiquidityLauncher; zero beneficiary vault; FeeSplitter forwarding 100% of both fee sides to the Arc CompoundingClaimRecipient',
  },
]

/** The per-chain Instant Launch singleton contracts, keyed by numeric chain id. */
export const INSTANT_LAUNCH_CONTRACTS: Partial<Record<number, InstantLaunchChainContracts>> = {
  [SupportedChainId.ROBINHOOD]: {
    liquidityLauncher: LIQUIDITY_LAUNCHER_REDEPLOYED,
    beneficiaryVault: UERC20_BENEFICIARY_VAULT_ROBINHOOD,
    compoundingClaimRecipient: COMPOUNDING_CLAIM_RECIPIENT_ROBINHOOD,
  },
  [SupportedChainId.ARC]: {
    liquidityLauncher: LIQUIDITY_LAUNCHER_REDEPLOYED,
    beneficiaryVault: UERC20_BENEFICIARY_VAULT_ARC,
    compoundingClaimRecipient: COMPOUNDING_CLAIM_RECIPIENT_ARC,
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

// ---------------------------------------------------------------------------
// Creator-fees / autocompound position recipients (auction / crowd launches)
// ---------------------------------------------------------------------------

/**
 * The current creator-fees position recipient per chain: the fees-enabled FeeSplitter from
 * {@link INSTANT_LAUNCH_DEPLOYMENTS} (the `creatorFeesEnabled: true` entry; last one wins where the
 * append-only registry carries several). Derived from the registry, so a splitter redeploy only
 * requires appending a registry entry. Prefer {@link getCreatorFeesPositionRecipient}.
 */
export const CREATOR_FEES_POSITION_RECIPIENTS: Partial<Record<number, Address>> = Object.fromEntries(
  INSTANT_LAUNCH_DEPLOYMENTS.filter((deployment) => deployment.creatorFeesEnabled).map((deployment) => [
    deployment.chainId,
    deployment.feeSplitter,
  ])
)

/**
 * The position recipient that opts an auction / crowd launch into creator fees on `chainId` — set it
 * as the launch's `MigratorParameters.positionRecipient` (in place of a per-launch lock-recipient
 * contract). It is the **fees-enabled** FeeSplitter of the chain's current creator-fees deployment
 * ({@link getInstantLaunchStrategy} with `creatorFeesEnabled: true` — the same splitter Instant
 * Launch mints its positions to).
 *
 * What sending the migrated LP position there means:
 *  - the splitter forwards the creator's share of each collected **native (ETH)** fee amount
 *    ({@link InstantLaunchDeployment.creatorFeeNativeBps} — 40% on the current deploy) to the
 *    chain's BeneficiaryVault, where the token's creator — the `createToken` caller, proven by the
 *    token's graffiti — claims it post-migration;
 *  - the remainder (60% native + 100% of the token side) auto-compounds into the position via the
 *    chain's compounding claim recipient;
 *  - custody is **permanent**: the splitter has no code path that transfers positions out, so the
 *    liquidity is locked forever by construction (no timelock involved).
 *
 * Only the `creatorFeesEnabled: true` splitter qualifies — the fees-off splitter never routes
 * anything to the vault, so it is not a creator-fees recipient (see
 * {@link isCreatorFeesPositionRecipient}); its own accessor is
 * {@link getAutocompoundPositionRecipient}. Returns `undefined` where the chain has no creator-fees
 * deployment.
 */
export function getCreatorFeesPositionRecipient(chainId: number): Address | undefined {
  return getInstantLaunchStrategy(chainId, { creatorFeesEnabled: true })?.feeSplitter
}

/**
 * Whether `recipient` is a creator-fees position recipient on `chainId`: the fees-enabled
 * FeeSplitter of any registry deployment for the chain — current or historical, since the registry
 * is append-only and indexed launches permanently reference the splitter they migrated to.
 * Case-insensitive. This is the classifier-side counterpart of
 * {@link getCreatorFeesPositionRecipient}: a launch whose `MigratorParameters.positionRecipient`
 * matches is parked at the splitter forever (structurally permanent custody) with creator fees
 * routed to the BeneficiaryVault.
 *
 * DECISION: the fees-off splitter does NOT qualify, even though its custody is equally permanent.
 * `creatorFees` semantics promise a creator claim path through the vault; the fees-off splitter
 * forwards 100% of fees to the compounding recipient and registers no beneficiary. As of 2026-08-03
 * auction / crowd launches with creator fees off route to it too (see
 * {@link isAutocompoundPositionRecipient}), so the exclusion here exists purely so such a launch is
 * not misclassified as carrying creator fees.
 */
export function isCreatorFeesPositionRecipient(chainId: number, recipient: string): boolean {
  const normalized = recipient.toLowerCase()
  return INSTANT_LAUNCH_DEPLOYMENTS.some(
    (deployment) =>
      deployment.chainId === chainId &&
      deployment.creatorFeesEnabled &&
      deployment.feeSplitter.toLowerCase() === normalized
  )
}

/**
 * The current autocompound position recipient per chain: the fees-off FeeSplitter from
 * {@link INSTANT_LAUNCH_DEPLOYMENTS} (the `creatorFeesEnabled: false` entry; last one wins where the
 * append-only registry carries several). Derived from the registry, so a splitter redeploy only
 * requires appending a registry entry. Prefer {@link getAutocompoundPositionRecipient}.
 */
export const AUTOCOMPOUND_POSITION_RECIPIENTS: Partial<Record<number, Address>> = Object.fromEntries(
  INSTANT_LAUNCH_DEPLOYMENTS.filter((deployment) => !deployment.creatorFeesEnabled).map((deployment) => [
    deployment.chainId,
    deployment.feeSplitter,
  ])
)

/**
 * The position recipient for an auction / crowd launch with creator fees OFF on `chainId` — set it
 * as the launch's `MigratorParameters.positionRecipient` (in place of a per-launch lock-recipient
 * contract). It is the **fees-off** FeeSplitter of the chain's current fees-off deployment
 * ({@link getInstantLaunchStrategy} with `creatorFeesEnabled: false` — the same splitter fees-off
 * Instant Launch mints its positions to; as of 2026-08-03 crowd launches with fees off route here
 * too).
 *
 * What sending the migrated LP position there means:
 *  - no beneficiary is registered and nothing routes to the vault: the splitter forwards 100% of
 *    both fee sides to the chain's compounding claim recipient, auto-compounding them into the
 *    position;
 *  - custody is **permanent**: the splitter has no code path that transfers positions out, so the
 *    liquidity is locked forever by construction (no timelock involved).
 *
 * The creator-fees counterpart is {@link getCreatorFeesPositionRecipient}. Returns `undefined`
 * where the chain has no fees-off deployment.
 */
export function getAutocompoundPositionRecipient(chainId: number): Address | undefined {
  return getInstantLaunchStrategy(chainId, { creatorFeesEnabled: false })?.feeSplitter
}

/**
 * Whether `recipient` is an autocompound position recipient on `chainId`: the fees-off FeeSplitter
 * of any registry deployment for the chain — current or historical, since the registry is
 * append-only and indexed launches permanently reference the splitter they migrated to.
 * Case-insensitive. This is the classifier-side counterpart of
 * {@link getAutocompoundPositionRecipient}: a launch whose `MigratorParameters.positionRecipient`
 * matches is parked at the splitter forever (structurally permanent custody) with 100% of fees
 * auto-compounding — no creator fees (see the DECISION on {@link isCreatorFeesPositionRecipient},
 * which deliberately rejects these splitters).
 */
export function isAutocompoundPositionRecipient(chainId: number, recipient: string): boolean {
  const normalized = recipient.toLowerCase()
  return INSTANT_LAUNCH_DEPLOYMENTS.some(
    (deployment) =>
      deployment.chainId === chainId &&
      !deployment.creatorFeesEnabled &&
      deployment.feeSplitter.toLowerCase() === normalized
  )
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
