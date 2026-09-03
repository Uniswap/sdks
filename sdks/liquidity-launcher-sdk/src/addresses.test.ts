import { describe, expect, it } from 'bun:test'
import { getAddress } from 'viem'

import {
  AUCTION_FACTORY_DEPLOYMENTS,
  AUTOCOMPOUND_POSITION_RECIPIENTS,
  CREATOR_FEES_POSITION_RECIPIENTS,
  getAutocompoundPositionRecipient,
  getCreatorFeesPositionRecipient,
  getInstantLaunchContracts,
  getInstantLaunchDeployment,
  getInstantLaunchDeployments,
  getInstantLaunchStrategy,
  getLauncherAddresses,
  getTickDataLensForFactory,
  INSTANT_LAUNCH_CONTRACTS,
  INSTANT_LAUNCH_DEPLOYMENT_BY_STRATEGY,
  INSTANT_LAUNCH_DEPLOYMENTS,
  LAUNCHER_ADDRESSES,
  isAutocompoundPositionRecipient,
  isCreatorFeesPositionRecipient,
  selectTokenFactory,
  TICK_DATA_LENS_BY_FACTORY,
  TICK_DATA_LENS_V1,
  TICK_DATA_LENS_V2,
} from './addresses'
import { SupportedChainId } from './chains'

describe('getLauncherAddresses', () => {
  it('returns the Unichain LBPStrategy singleton', () => {
    const addresses = getLauncherAddresses(SupportedChainId.UNICHAIN)
    expect(addresses?.lbpStrategy).toBe(getAddress('0x298eA05D0356B2Ae5cCAa3169E471783ee9EA000'))
  })

  it('keeps the live shared LiquidityLauncher CREATE2 address on every chain except Robinhood and Arc', () => {
    const sharedLauncher = getAddress('0x00004c4ccc709Ef590F7C81102C0689F0263D4e9')
    for (const chainId of Object.values(SupportedChainId).filter((v): v is number => typeof v === 'number')) {
      if (chainId === SupportedChainId.ROBINHOOD || chainId === SupportedChainId.ARC) continue
      expect(getLauncherAddresses(chainId)?.liquidityLauncher).toBe(sharedLauncher)
    }
  })

  it('scopes the redeployed launcher to Robinhood (4663) and Arc (5042) in both registries', () => {
    const redeployLauncher = getAddress('0x0000FffFBE8efE702c8703aE3477FF5dE3d319C0')
    for (const chainId of [SupportedChainId.ROBINHOOD, SupportedChainId.ARC]) {
      expect(getLauncherAddresses(chainId)?.liquidityLauncher).toBe(redeployLauncher)
      expect(getInstantLaunchContracts(chainId)?.liquidityLauncher).toBe(redeployLauncher)
    }
  })

  it('returns undefined for an unsupported chain', () => {
    expect(getLauncherAddresses(999999)).toBeUndefined()
  })

  it('carries the UniversalRouterStrategy only where it is deployed (4663 and 5042 so far)', () => {
    expect(getLauncherAddresses(SupportedChainId.ROBINHOOD)?.universalRouterStrategy).toBe(
      getAddress('0x1242c9439d589cAE85E121B1f79f2aF51e91DCEE')
    )
    expect(getLauncherAddresses(SupportedChainId.ARC)?.universalRouterStrategy).toBe(
      getAddress('0x0A122717bc36E3C7A7958128a5C789E0b070b3Ae')
    )
    expect(getLauncherAddresses(SupportedChainId.MAINNET)?.universalRouterStrategy).toBeUndefined()
  })

  it('scopes the 2026-08-05 full-redeploy TokenSplitter to Robinhood; other chains keep the shared one', () => {
    expect(getLauncherAddresses(SupportedChainId.ROBINHOOD)?.tokenSplitter).toBe(
      getAddress('0x4F5E3FBb9745358A92Da5674305FAb8D2B8a73cE')
    )
    const sharedTokenSplitter = getAddress('0x8B7DCeb5639DB986FCf86606C74e6300C40FE3cd')
    for (const chainId of Object.values(SupportedChainId).filter((v): v is number => typeof v === 'number')) {
      if (chainId === SupportedChainId.ROBINHOOD) continue
      expect(getLauncherAddresses(chainId)?.tokenSplitter).toBe(sharedTokenSplitter)
    }
  })

  it('returns the per-chain LBPStrategy singletons for the 2026-07 launch chains', () => {
    expect(getLauncherAddresses(SupportedChainId.AVALANCHE)?.lbpStrategy).toBe(
      getAddress('0x57BD0A9Cd933c89Ba55e086D53031367b6406000')
    )
    expect(getLauncherAddresses(SupportedChainId.XLAYER)?.lbpStrategy).toBe(
      getAddress('0x58DF162fF41e5cB42B8515f75F90C1841938A000')
    )
    expect(getLauncherAddresses(SupportedChainId.ROBINHOOD)?.lbpStrategy).toBe(
      getAddress('0x05d552391067389EE44fec3924157ed33F976000')
    )
  })
})

describe('getTickDataLensForFactory', () => {
  it('maps the v1 TWA factory to the v1 lens', () => {
    expect(getTickDataLensForFactory('0xcccccccae7503cac057829bf2811de42e16e0bd5')).toBe(TICK_DATA_LENS_V1)
  })

  it('maps every historical CCA factory deploy to the v2 lens', () => {
    // Early test deploy, v2.0.0 deploy, and the 2026-07-09 blocknumberish-aware redeploy.
    expect(getTickDataLensForFactory('0x088ca22b591f2f4bf0ad2780d2a44fa692e948d0')).toBe(TICK_DATA_LENS_V2)
    expect(getTickDataLensForFactory('0x00cCa200BF124dBfA848937c553864f4B4CE0632')).toBe(TICK_DATA_LENS_V2)
    expect(getTickDataLensForFactory('0x000000001F26a0044BaA66024e7b6599c61963F8')).toBe(TICK_DATA_LENS_V2)
  })

  it('is case-insensitive', () => {
    expect(getTickDataLensForFactory('0x00CCA200BF124DBFA848937C553864F4B4CE0632')).toBe(TICK_DATA_LENS_V2)
  })

  it('returns undefined for an unknown factory', () => {
    expect(getTickDataLensForFactory('0x0000000000000000000000000000000000000001')).toBeUndefined()
  })

  it('covers every current per-chain ccaFactory in the deployment registry', () => {
    for (const chainId of Object.values(SupportedChainId).filter((v): v is number => typeof v === 'number')) {
      const addresses = getLauncherAddresses(chainId)!
      expect(getTickDataLensForFactory(addresses.ccaFactory)).toBe(TICK_DATA_LENS_V2)
    }
  })

  it('derives the lowercased lookup map from the deployment registry', () => {
    expect(TICK_DATA_LENS_BY_FACTORY.size).toBe(AUCTION_FACTORY_DEPLOYMENTS.length)
    for (const deployment of AUCTION_FACTORY_DEPLOYMENTS) {
      expect(TICK_DATA_LENS_BY_FACTORY.get(deployment.factory.toLowerCase())).toBe(deployment.tickDataLens)
    }
  })
})

describe('selectTokenFactory', () => {
  it('prefers the uERC20 factory when both are present (mainnet)', () => {
    const addresses = getLauncherAddresses(SupportedChainId.MAINNET)!
    expect(selectTokenFactory(addresses)).toEqual({ factory: addresses.uerc20Factory!, kind: 'uerc20' })
  })

  it('falls back to the super-uERC20 factory (Unichain)', () => {
    const addresses = getLauncherAddresses(SupportedChainId.UNICHAIN)!
    expect(selectTokenFactory(addresses)).toEqual({ factory: addresses.usuperc20Factory!, kind: 'usuperc20' })
  })

  it('selects the uERC20 factory on the 2026-07 launch chains', () => {
    const addresses = getLauncherAddresses(SupportedChainId.AVALANCHE)!
    expect(selectTokenFactory(addresses)).toEqual({ factory: addresses.uerc20Factory!, kind: 'uerc20' })
  })

  it('returns undefined when a chain deploys neither factory', () => {
    const { uerc20Factory: _u, usuperc20Factory: _s, ...withoutFactories } =
      getLauncherAddresses(SupportedChainId.ROBINHOOD)!
    expect(selectTokenFactory(withoutFactories)).toBeUndefined()
  })
})

// The fees-on FeeSplitter changed in v3.1.1 (it forwards to the v3.1.1 beneficiary vault); the
// 2026-08-05 full redeploy replaces both splitters — the first generation where the fees-off
// splitter moves.
const FEES_ON_SPLITTER_C3F9506 = '0x7198C32a497c09497e04C86cf8F77A244A9E4b8F'
const FEES_ON_SPLITTER_V311 = '0x6CC1b74Fc1BE1ff373Fa07f3381856f38103e653'
const FEES_ON_SPLITTER_20260805 = '0xeFF166AAf189323c58dc27eD1206EB2C37FaACDf'
const FEES_OFF_SPLITTER_C3F9506 = '0xDF50f4ea2207F9D2A753a3DaE729B36FDEF13b23'
const FEES_OFF_SPLITTER_20260805 = '0x222D6d4f1ce59b0d48D5505114eC8Addc90A4359'

// The five canonical Robinhood strategy generations from the liquidity-launcher dev README, in
// registry (append) order. Pool shape is per-generation: every generation up to and including
// v3.1.1 is (spacing 60, initialTick 198,060, minLaunchTick -208,980); the 2026-08-05 full-redeploy
// pair was recompiled to (25, 198,050, -160,100) — all values read back on-chain from the deployed
// strategies' getters (2026-08-05).
const LEGACY_POOL_SHAPE = { tickSpacing: 60, initialTick: 198060, minLaunchTick: -208980 } as const
const REDEPLOY_POOL_SHAPE = { tickSpacing: 25, initialTick: 198050, minLaunchTick: -160100 } as const
const ROBINHOOD_STRATEGY_GENERATIONS = [
  // c3f9506 (2026-07-29)
  {
    on: '0x60D73b21cDf2EA846ab3d58699BBbb8F29d72491',
    off: '0xFCe92C70f1fc017b72f6DD7a00D9E38725C7fBd1',
    onSplitter: FEES_ON_SPLITTER_C3F9506,
    offSplitter: FEES_OFF_SPLITTER_C3F9506,
    poolShape: LEGACY_POOL_SHAPE,
  },
  // 8e40a35 (2026-07-30, initial-tick cap)
  {
    on: '0xcE57498D3474DCC244dFb6710fFbE6D4441cD2b2',
    off: '0x583a7903152b95831e82ffF534448Dee081754ec',
    onSplitter: FEES_ON_SPLITTER_C3F9506,
    offSplitter: FEES_OFF_SPLITTER_C3F9506,
    poolShape: LEGACY_POOL_SHAPE,
  },
  // 3e05da8 (2026-07-30)
  {
    on: '0x9F67B864B565966dfCc2E0C6bA2483b2D5fF4b00',
    off: '0x16b63f1c8415FD68591c31FB3c6796a333DD640C',
    onSplitter: FEES_ON_SPLITTER_C3F9506,
    offSplitter: FEES_OFF_SPLITTER_C3F9506,
    poolShape: LEGACY_POOL_SHAPE,
  },
  // v3.1.1 launcher redeploy (2026-08-05) — new strategy pair AND a new fees-on splitter
  {
    on: '0x3f556B542105D5EFBBefe7C766a4919C76B960Fb',
    off: '0x36bdB859518C89F764337cd5C24762d2Aa650f3C',
    onSplitter: FEES_ON_SPLITTER_V311,
    offSplitter: FEES_OFF_SPLITTER_C3F9506,
    poolShape: LEGACY_POOL_SHAPE,
  },
  // 2026-08-05 full 4663 stack redeploy (current) — new strategies, new splitters on both sides,
  // and a recompiled pool shape (TICK_SPACING 25, initialTick 198,050, MIN_LAUNCH_TICK -160,100)
  {
    on: '0x23f8209572b4a1C2AD88A42749E830791Fb027f1',
    off: '0xAD44D55E7f8337C3cE113fBb591486E85be104b2',
    onSplitter: FEES_ON_SPLITTER_20260805,
    offSplitter: FEES_OFF_SPLITTER_20260805,
    poolShape: REDEPLOY_POOL_SHAPE,
  },
] as const

describe('Instant Launch deployment registry', () => {
  it('carries all five canonical Robinhood strategy generations from the liquidity-launcher dev README', () => {
    const deployments = getInstantLaunchDeployments(SupportedChainId.ROBINHOOD)
    expect(deployments).toHaveLength(10)
    ROBINHOOD_STRATEGY_GENERATIONS.forEach((generation, index) => {
      const on = deployments[index * 2]
      const off = deployments[index * 2 + 1]
      expect(on!.strategy).toBe(getAddress(generation.on))
      expect(on!.feeSplitter).toBe(getAddress(generation.onSplitter))
      expect(on!.creatorFeesEnabled).toBe(true)
      expect(on!.creatorFeeNativeBps).toBe(4000)
      expect(on!.creatorFeeTokenBps).toBe(0)
      expect(off!.strategy).toBe(getAddress(generation.off))
      expect(off!.feeSplitter).toBe(getAddress(generation.offSplitter))
      expect(off!.creatorFeesEnabled).toBe(false)
      expect(off!.creatorFeeNativeBps).toBe(0)
      expect(off!.creatorFeeTokenBps).toBe(0)
      // Pool shape is per-generation (the 2026-08-05 redeploy recompiled all three values).
      for (const variant of [on!, off!]) {
        expect(variant.tickSpacing).toBe(generation.poolShape.tickSpacing)
        expect(variant.initialTick).toBe(generation.poolShape.initialTick)
        expect(variant.minLaunchTick).toBe(generation.poolShape.minLaunchTick)
      }
    })
  })

  it('is empty for chains without an Instant Launch deployment', () => {
    expect(getInstantLaunchDeployments(SupportedChainId.MAINNET)).toHaveLength(0)
    expect(getInstantLaunchStrategy(SupportedChainId.MAINNET, { creatorFeesEnabled: true })).toBeUndefined()
    expect(getInstantLaunchContracts(SupportedChainId.MAINNET)).toBeUndefined()
  })

  it('getInstantLaunchStrategy selects the current (2026-08-05 full-redeploy) deployment per variant', () => {
    expect(getInstantLaunchStrategy(SupportedChainId.ROBINHOOD, { creatorFeesEnabled: true })?.strategy).toBe(
      getAddress('0x23f8209572b4a1C2AD88A42749E830791Fb027f1')
    )
    expect(getInstantLaunchStrategy(SupportedChainId.ROBINHOOD, { creatorFeesEnabled: false })?.strategy).toBe(
      getAddress('0xAD44D55E7f8337C3cE113fBb591486E85be104b2')
    )
  })

  it('keeps every historical generation resolvable while selecting only the newest (append-only)', () => {
    for (const generation of ROBINHOOD_STRATEGY_GENERATIONS) {
      const on = getInstantLaunchDeployment(generation.on)
      const off = getInstantLaunchDeployment(generation.off)
      expect(on?.chainId).toBe(SupportedChainId.ROBINHOOD)
      expect(on?.creatorFeesEnabled).toBe(true)
      expect(on?.feeSplitter).toBe(getAddress(generation.onSplitter))
      expect(off?.chainId).toBe(SupportedChainId.ROBINHOOD)
      expect(off?.creatorFeesEnabled).toBe(false)
      expect(off?.feeSplitter).toBe(getAddress(generation.offSplitter))
    }
    // The historical generations classify but are never selected for new launches.
    const current = ROBINHOOD_STRATEGY_GENERATIONS[ROBINHOOD_STRATEGY_GENERATIONS.length - 1]!
    expect(getInstantLaunchStrategy(SupportedChainId.ROBINHOOD, { creatorFeesEnabled: true })).toBe(
      getInstantLaunchDeployment(current.on)!
    )
    expect(getInstantLaunchStrategy(SupportedChainId.ROBINHOOD, { creatorFeesEnabled: false })).toBe(
      getInstantLaunchDeployment(current.off)!
    )
  })

  it('getInstantLaunchDeployment reverse-resolves case-insensitively and derives from the registry', () => {
    expect(INSTANT_LAUNCH_DEPLOYMENT_BY_STRATEGY.size).toBe(INSTANT_LAUNCH_DEPLOYMENTS.length)
    for (const deployment of INSTANT_LAUNCH_DEPLOYMENTS) {
      expect(getInstantLaunchDeployment(deployment.strategy.toUpperCase().replace('0X', '0x'))).toBe(deployment)
    }
    expect(getInstantLaunchDeployment('0x0000000000000000000000000000000000000001')).toBeUndefined()
  })

  it('carries the Robinhood singletons (vault, compounding recipient, launcher)', () => {
    const contracts = getInstantLaunchContracts(SupportedChainId.ROBINHOOD)
    expect(contracts?.beneficiaryVault).toBe(getAddress('0xd35E9CA72F64C7F93BE30fad67524323396B36D7'))
    expect(contracts?.compoundingClaimRecipient).toBe(getAddress('0xf9526Dd3361fe0ba6b7a99533ed471D3E808E99a'))
    expect(contracts?.liquidityLauncher).toBe(getLauncherAddresses(SupportedChainId.ROBINHOOD)!.liquidityLauncher)
  })

  it('agrees with LAUNCHER_ADDRESSES on liquidityLauncher for every chain both registries cover', () => {
    // The InstantLaunchChainContracts docstring asserts "same registry value as
    // {@link LauncherAddresses.liquidityLauncher}" — with a chain-scoped launcher constant this
    // invariant now has a way to be violated, so pin it here for every co-covered chain.
    const coveredChains = Object.keys(INSTANT_LAUNCH_CONTRACTS).map(Number)
    expect(coveredChains.length).toBeGreaterThan(0)
    for (const chainId of coveredChains) {
      const launcherEntry = LAUNCHER_ADDRESSES[chainId]
      expect(launcherEntry).toBeDefined()
      expect(INSTANT_LAUNCH_CONTRACTS[chainId]!.liquidityLauncher).toBe(launcherEntry!.liquidityLauncher)
    }
  })
})

describe('Arc (5042) deployment', () => {
  // Independent literals (not read back from the registry) so a registry edit cannot silently move them.
  const ARC_FEES_ON_STRATEGY = getAddress('0xfe7Be4EbBE6CcDfA57EE8c36fe9a767B033eB056')
  const ARC_FEES_OFF_STRATEGY = getAddress('0xff301aCB22816D210d75D71F31Ac13C771093EF3')
  const ARC_FEES_ON_SPLITTER = getAddress('0xC2F1D91599d7CB04E6BB156AB3D10972cC2da607')
  const ARC_FEES_OFF_SPLITTER = getAddress('0xCDDC6103dD64dd05Cf634166326a21Be06B3165A')

  it('carries the Arc launcher stack', () => {
    const addresses = getLauncherAddresses(SupportedChainId.ARC)!
    expect(addresses.lbpStrategy).toBe(getAddress('0xe9f36bcc222a6d2e459529D787f8c060d543A000'))
    // Arc keeps the shared TokenSplitter, unlike Robinhood's full-redeploy one.
    expect(addresses.tokenSplitter).toBe(getAddress('0x8B7DCeb5639DB986FCf86606C74e6300C40FE3cd'))
    expect(addresses.positionManager).toBe(getAddress('0x6049c9a0e26405C0985f9E3685C87d0aE917f82B'))
  })

  it('uses a per-chain uERC20 factory', () => {
    const addresses = getLauncherAddresses(SupportedChainId.ARC)!
    const arcFactory = getAddress('0xFf99D8f6C994607576eB652EDCf12E04a7EbfBf6')
    expect(addresses.uerc20Factory).toBe(arcFactory)
    expect(addresses.uerc20Factory).not.toBe(getLauncherAddresses(SupportedChainId.ROBINHOOD)!.uerc20Factory!)
    expect(addresses.usuperc20Factory).toBeUndefined()
    expect(selectTokenFactory(addresses)).toEqual({ factory: arcFactory, kind: 'uerc20' })
  })

  it('registers one Instant Launch generation', () => {
    const deployments = getInstantLaunchDeployments(SupportedChainId.ARC)
    expect(deployments).toHaveLength(2)
    const [on, off] = deployments
    expect(on!.strategy).toBe(ARC_FEES_ON_STRATEGY)
    expect(on!.feeSplitter).toBe(ARC_FEES_ON_SPLITTER)
    expect(on!.creatorFeesEnabled).toBe(true)
    expect(on!.creatorFeeNativeBps).toBe(4000)
    expect(off!.strategy).toBe(ARC_FEES_OFF_STRATEGY)
    expect(off!.feeSplitter).toBe(ARC_FEES_OFF_SPLITTER)
    expect(off!.creatorFeesEnabled).toBe(false)
    for (const variant of [on!, off!]) {
      expect(variant.tickSpacing).toBe(25)
      expect(variant.initialTick).toBe(122050)
      expect(variant.initialTick % variant.tickSpacing).toBe(0)
      expect(variant.minLaunchTick).toBe(-160100)
    }
    expect(getInstantLaunchStrategy(SupportedChainId.ARC, { creatorFeesEnabled: true })?.strategy).toBe(
      ARC_FEES_ON_STRATEGY
    )
    expect(getInstantLaunchStrategy(SupportedChainId.ARC, { creatorFeesEnabled: false })?.strategy).toBe(
      ARC_FEES_OFF_STRATEGY
    )
  })

  it('carries the Arc singletons (vault, compounding recipient)', () => {
    const contracts = getInstantLaunchContracts(SupportedChainId.ARC)
    expect(contracts?.beneficiaryVault).toBe(getAddress('0x3892aB3Dcf62785Ee3077ea008486c3a6bCf51Af'))
    expect(contracts?.compoundingClaimRecipient).toBe(getAddress('0xBE5A26C5E7ABC4f049971e18214301931e23D1Db'))
  })

  it('resolves the Arc position recipients per variant', () => {
    expect(getCreatorFeesPositionRecipient(SupportedChainId.ARC)).toBe(ARC_FEES_ON_SPLITTER)
    expect(getAutocompoundPositionRecipient(SupportedChainId.ARC)).toBe(ARC_FEES_OFF_SPLITTER)
    expect(isCreatorFeesPositionRecipient(SupportedChainId.ARC, ARC_FEES_ON_SPLITTER)).toBe(true)
    expect(isCreatorFeesPositionRecipient(SupportedChainId.ARC, ARC_FEES_OFF_SPLITTER)).toBe(false)
    expect(isAutocompoundPositionRecipient(SupportedChainId.ARC, ARC_FEES_OFF_SPLITTER)).toBe(true)
    // Chain-scoped: the Robinhood splitters never classify on Arc.
    expect(isCreatorFeesPositionRecipient(SupportedChainId.ARC, FEES_ON_SPLITTER_20260805)).toBe(false)
  })
})

describe('creator-fees position recipient', () => {
  // Independent literal (not read back from the registry) so a registry edit cannot silently move
  // the recipient: the current fees-enabled Robinhood FeeSplitter.
  const FEES_ON_SPLITTER = getAddress('0xeFF166AAf189323c58dc27eD1206EB2C37FaACDf')
  const FEES_OFF_SPLITTER = getAddress('0x222D6d4f1ce59b0d48D5505114eC8Addc90A4359')

  it('resolves to the fees-enabled Robinhood FeeSplitter (registry-literal pin)', () => {
    expect(getCreatorFeesPositionRecipient(SupportedChainId.ROBINHOOD)).toBe(FEES_ON_SPLITTER)
    expect(CREATOR_FEES_POSITION_RECIPIENTS[SupportedChainId.ROBINHOOD]).toBe(FEES_ON_SPLITTER)
  })

  it('never resolves to the fees-off splitter', () => {
    expect(getCreatorFeesPositionRecipient(SupportedChainId.ROBINHOOD)).not.toBe(FEES_OFF_SPLITTER)
  })

  it('returns undefined where the chain has no creator-fees deployment', () => {
    expect(getCreatorFeesPositionRecipient(SupportedChainId.MAINNET)).toBeUndefined()
    expect(CREATOR_FEES_POSITION_RECIPIENTS[SupportedChainId.MAINNET]).toBeUndefined()
  })

  it('agrees with the current fees-enabled registry entry', () => {
    const deployment = getInstantLaunchStrategy(SupportedChainId.ROBINHOOD, { creatorFeesEnabled: true })
    expect(getCreatorFeesPositionRecipient(SupportedChainId.ROBINHOOD)).toBe(deployment!.feeSplitter)
  })

  it('isCreatorFeesPositionRecipient recognizes the fees-enabled splitter, case-insensitively', () => {
    expect(isCreatorFeesPositionRecipient(SupportedChainId.ROBINHOOD, FEES_ON_SPLITTER)).toBe(true)
    expect(isCreatorFeesPositionRecipient(SupportedChainId.ROBINHOOD, FEES_ON_SPLITTER.toLowerCase())).toBe(true)
    expect(isCreatorFeesPositionRecipient(SupportedChainId.ROBINHOOD, FEES_ON_SPLITTER.toUpperCase().replace('0X', '0x'))).toBe(true)
  })

  it('rejects the fees-off splitter — permanent custody but no creator claim path', () => {
    expect(isCreatorFeesPositionRecipient(SupportedChainId.ROBINHOOD, FEES_OFF_SPLITTER)).toBe(false)
  })

  it('still classifies the superseded c3f9506 and v3.1.1 fees-on splitters (append-only classifier)', () => {
    // Each redeploy moves the current recipient — but launches that migrated their LP position to
    // an earlier splitter did so permanently, and must keep classifying as creator-fees launches.
    // Selection moves; classification does not.
    for (const superseded of [FEES_ON_SPLITTER_C3F9506, FEES_ON_SPLITTER_V311]) {
      expect(isCreatorFeesPositionRecipient(SupportedChainId.ROBINHOOD, superseded)).toBe(true)
      expect(getCreatorFeesPositionRecipient(SupportedChainId.ROBINHOOD)).not.toBe(getAddress(superseded))
    }
  })

  it('rejects an unknown recipient and a wrong chain', () => {
    expect(
      isCreatorFeesPositionRecipient(SupportedChainId.ROBINHOOD, '0x0000000000000000000000000000000000000001')
    ).toBe(false)
    expect(isCreatorFeesPositionRecipient(SupportedChainId.MAINNET, FEES_ON_SPLITTER)).toBe(false)
  })
})

describe('autocompound position recipient', () => {
  // Independent literal (not read back from the registry) so a registry edit cannot silently move
  // the recipient: the current fees-off Robinhood FeeSplitter.
  const FEES_ON_SPLITTER = getAddress('0xeFF166AAf189323c58dc27eD1206EB2C37FaACDf')
  const FEES_OFF_SPLITTER = getAddress('0x222D6d4f1ce59b0d48D5505114eC8Addc90A4359')

  it('resolves to the fees-off Robinhood FeeSplitter (registry-literal pin)', () => {
    expect(getAutocompoundPositionRecipient(SupportedChainId.ROBINHOOD)).toBe(FEES_OFF_SPLITTER)
    expect(AUTOCOMPOUND_POSITION_RECIPIENTS[SupportedChainId.ROBINHOOD]).toBe(FEES_OFF_SPLITTER)
  })

  it('never resolves to the fees-enabled splitter', () => {
    expect(getAutocompoundPositionRecipient(SupportedChainId.ROBINHOOD)).not.toBe(FEES_ON_SPLITTER)
  })

  it('returns undefined where the chain has no fees-off deployment', () => {
    expect(getAutocompoundPositionRecipient(SupportedChainId.MAINNET)).toBeUndefined()
    expect(AUTOCOMPOUND_POSITION_RECIPIENTS[SupportedChainId.MAINNET]).toBeUndefined()
  })

  it('agrees with the current fees-off registry entry', () => {
    const deployment = getInstantLaunchStrategy(SupportedChainId.ROBINHOOD, { creatorFeesEnabled: false })
    expect(getAutocompoundPositionRecipient(SupportedChainId.ROBINHOOD)).toBe(deployment!.feeSplitter)
  })

  it('isAutocompoundPositionRecipient recognizes the fees-off splitter, case-insensitively', () => {
    expect(isAutocompoundPositionRecipient(SupportedChainId.ROBINHOOD, FEES_OFF_SPLITTER)).toBe(true)
    expect(isAutocompoundPositionRecipient(SupportedChainId.ROBINHOOD, FEES_OFF_SPLITTER.toLowerCase())).toBe(true)
    expect(
      isAutocompoundPositionRecipient(SupportedChainId.ROBINHOOD, FEES_OFF_SPLITTER.toUpperCase().replace('0X', '0x'))
    ).toBe(true)
  })

  it('rejects the fees-enabled splitter — that one is the creator-fees recipient', () => {
    expect(isAutocompoundPositionRecipient(SupportedChainId.ROBINHOOD, FEES_ON_SPLITTER)).toBe(false)
  })

  it('still classifies the superseded c3f9506 fees-off splitter (append-only classifier)', () => {
    // The 2026-08-05 full redeploy is the first generation that moves the fees-off splitter —
    // launches parked at the c3f9506 one stay there permanently and must keep classifying.
    expect(isAutocompoundPositionRecipient(SupportedChainId.ROBINHOOD, FEES_OFF_SPLITTER_C3F9506)).toBe(true)
    expect(getAutocompoundPositionRecipient(SupportedChainId.ROBINHOOD)).not.toBe(getAddress(FEES_OFF_SPLITTER_C3F9506))
  })

  it('stays disjoint from the creator-fees classifier on both splitters', () => {
    expect(isCreatorFeesPositionRecipient(SupportedChainId.ROBINHOOD, FEES_OFF_SPLITTER)).toBe(false)
    expect(isAutocompoundPositionRecipient(SupportedChainId.ROBINHOOD, FEES_ON_SPLITTER)).toBe(false)
  })

  it('rejects an unknown recipient and a wrong chain', () => {
    expect(
      isAutocompoundPositionRecipient(SupportedChainId.ROBINHOOD, '0x0000000000000000000000000000000000000001')
    ).toBe(false)
    expect(isAutocompoundPositionRecipient(SupportedChainId.MAINNET, FEES_OFF_SPLITTER)).toBe(false)
  })
})
