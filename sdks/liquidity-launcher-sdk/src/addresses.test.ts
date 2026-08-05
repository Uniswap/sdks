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

  it('keeps the live shared LiquidityLauncher CREATE2 address on every chain except Robinhood', () => {
    const sharedLauncher = getAddress('0x00004c4ccc709Ef590F7C81102C0689F0263D4e9')
    for (const chainId of Object.values(SupportedChainId).filter((v): v is number => typeof v === 'number')) {
      if (chainId === SupportedChainId.ROBINHOOD) continue
      expect(getLauncherAddresses(chainId)?.liquidityLauncher).toBe(sharedLauncher)
    }
  })

  it('scopes the 2026-08-05 full-redeploy launcher to Robinhood (4663) in both registries', () => {
    const redeployLauncher = getAddress('0x0000FffFBE8efE702c8703aE3477FF5dE3d319C0')
    expect(getLauncherAddresses(SupportedChainId.ROBINHOOD)?.liquidityLauncher).toBe(redeployLauncher)
    expect(getInstantLaunchContracts(SupportedChainId.ROBINHOOD)?.liquidityLauncher).toBe(redeployLauncher)
  })

  it('returns undefined for an unsupported chain', () => {
    expect(getLauncherAddresses(999999)).toBeUndefined()
  })

  it('carries the UniversalRouterStrategy only where it is deployed (4663 so far)', () => {
    expect(getLauncherAddresses(SupportedChainId.ROBINHOOD)?.universalRouterStrategy).toBe(
      getAddress('0x1242c9439d589cAE85E121B1f79f2aF51e91DCEE')
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
// registry (append) order. Every generation opens at initialTick 198,060.
const ROBINHOOD_STRATEGY_GENERATIONS = [
  // c3f9506 (2026-07-29)
  {
    on: '0x60D73b21cDf2EA846ab3d58699BBbb8F29d72491',
    off: '0xFCe92C70f1fc017b72f6DD7a00D9E38725C7fBd1',
    onSplitter: FEES_ON_SPLITTER_C3F9506,
    offSplitter: FEES_OFF_SPLITTER_C3F9506,
  },
  // 8e40a35 (2026-07-30, initial-tick cap)
  {
    on: '0xcE57498D3474DCC244dFb6710fFbE6D4441cD2b2',
    off: '0x583a7903152b95831e82ffF534448Dee081754ec',
    onSplitter: FEES_ON_SPLITTER_C3F9506,
    offSplitter: FEES_OFF_SPLITTER_C3F9506,
  },
  // 3e05da8 (2026-07-30)
  {
    on: '0x9F67B864B565966dfCc2E0C6bA2483b2D5fF4b00',
    off: '0x16b63f1c8415FD68591c31FB3c6796a333DD640C',
    onSplitter: FEES_ON_SPLITTER_C3F9506,
    offSplitter: FEES_OFF_SPLITTER_C3F9506,
  },
  // v3.1.1 launcher redeploy (2026-08-05) — new strategy pair AND a new fees-on splitter
  {
    on: '0x3f556B542105D5EFBBefe7C766a4919C76B960Fb',
    off: '0x36bdB859518C89F764337cd5C24762d2Aa650f3C',
    onSplitter: FEES_ON_SPLITTER_V311,
    offSplitter: FEES_OFF_SPLITTER_C3F9506,
  },
  // 2026-08-05 full 4663 stack redeploy (current) — new strategies and new splitters on both sides
  {
    on: '0x23f8209572b4a1C2AD88A42749E830791Fb027f1',
    off: '0xAD44D55E7f8337C3cE113fBb591486E85be104b2',
    onSplitter: FEES_ON_SPLITTER_20260805,
    offSplitter: FEES_OFF_SPLITTER_20260805,
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
      // Every generation opens at the same immutable initial tick.
      expect(on!.initialTick).toBe(198060)
      expect(off!.initialTick).toBe(198060)
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
    expect(isCreatorFeesPositionRecipient(SupportedChainId.ROBINHOOD, '0x0000000000000000000000000000000000000001')).toBe(false)
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
    expect(isAutocompoundPositionRecipient(SupportedChainId.ROBINHOOD, FEES_OFF_SPLITTER.toUpperCase().replace('0X', '0x'))).toBe(true)
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
    expect(isAutocompoundPositionRecipient(SupportedChainId.ROBINHOOD, '0x0000000000000000000000000000000000000001')).toBe(false)
    expect(isAutocompoundPositionRecipient(SupportedChainId.MAINNET, FEES_OFF_SPLITTER)).toBe(false)
  })
})
