import { describe, expect, it } from 'bun:test'
import { getAddress } from 'viem'

import {
  AUCTION_FACTORY_DEPLOYMENTS,
  CREATOR_FEES_POSITION_RECIPIENTS,
  getCreatorFeesPositionRecipient,
  getInstantLaunchContracts,
  getInstantLaunchDeployment,
  getInstantLaunchDeployments,
  getInstantLaunchStrategy,
  getLauncherAddresses,
  getLbpStrategyDeployment,
  getLbpStrategyDeployments,
  getTickDataLensForFactory,
  INSTANT_LAUNCH_DEPLOYMENT_BY_STRATEGY,
  INSTANT_LAUNCH_DEPLOYMENTS,
  LBP_STRATEGY_DEPLOYMENT_BY_STRATEGY,
  LBP_STRATEGY_DEPLOYMENTS,
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

  it('uses the same LiquidityLauncher CREATE2 address on every chain', () => {
    const mainnet = getLauncherAddresses(SupportedChainId.MAINNET)
    const unichain = getLauncherAddresses(SupportedChainId.UNICHAIN)
    expect(mainnet?.liquidityLauncher).toBe(unichain!.liquidityLauncher)
  })

  it('returns undefined for an unsupported chain', () => {
    expect(getLauncherAddresses(999999)).toBeUndefined()
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

// The three canonical Robinhood strategy generations from the liquidity-launcher dev README, in
// registry (append) order. All share the per-variant FeeSplitters and open at initialTick 198,060.
const ROBINHOOD_STRATEGY_GENERATIONS = [
  // c3f9506 (2026-07-29)
  { on: '0x60D73b21cDf2EA846ab3d58699BBbb8F29d72491', off: '0xFCe92C70f1fc017b72f6DD7a00D9E38725C7fBd1' },
  // 8e40a35 (2026-07-30, initial-tick cap)
  { on: '0xcE57498D3474DCC244dFb6710fFbE6D4441cD2b2', off: '0x583a7903152b95831e82ffF534448Dee081754ec' },
  // 3e05da8 (2026-07-30, current)
  { on: '0x9F67B864B565966dfCc2E0C6bA2483b2D5fF4b00', off: '0x16b63f1c8415FD68591c31FB3c6796a333DD640C' },
] as const

describe('LBPStrategy deployment registry', () => {
  it('carries the three historical Robinhood LBPStrategy generations', () => {
    const deployments = getLbpStrategyDeployments(SupportedChainId.ROBINHOOD)
    expect(deployments).toHaveLength(3)
    
    expect(deployments[0]!.strategy).toBe(getAddress('0x095e38a2135aeBcfFa98A5B6911591937f912000'))
    expect(deployments[1]!.strategy).toBe(getAddress('0x843747f4c08E3393E55508F577296bA48E8Ca000'))
    expect(deployments[2]!.strategy).toBe(getAddress('0x05d552391067389EE44fec3924157ed33F976000'))
  })

  it('keeps every historical generation resolvable (append-only)', () => {
    const mainnet = getLbpStrategyDeployments(SupportedChainId.MAINNET)
    expect(mainnet).toHaveLength(2)
    expect(mainnet[0]!.strategy).toBe(getAddress('0xb98766A35cdc28415be0767D4EA41e39fBA3e000')) // v3.0.0
    expect(mainnet[1]!.strategy).toBe(getAddress('0x49380c4EfaB1b491006aF7FabAB8B3459F0E6000')) // v3.1.0
  })

  it('getLbpStrategyDeployment reverse-resolves case-insensitively and derives from the registry', () => {
    expect(LBP_STRATEGY_DEPLOYMENT_BY_STRATEGY.size).toBe(LBP_STRATEGY_DEPLOYMENTS.length)
    for (const deployment of LBP_STRATEGY_DEPLOYMENTS) {
      expect(getLbpStrategyDeployment(deployment.strategy.toUpperCase().replace('0X', '0x'))).toBe(deployment)
    }
    expect(getLbpStrategyDeployment('0x0000000000000000000000000000000000000001')).toBeUndefined()
  })
})

describe('Instant Launch deployment registry', () => {
  it('carries all three canonical Robinhood strategy generations from the liquidity-launcher dev README', () => {
    const deployments = getInstantLaunchDeployments(SupportedChainId.ROBINHOOD)
    expect(deployments).toHaveLength(6)
    ROBINHOOD_STRATEGY_GENERATIONS.forEach((generation, index) => {
      const on = deployments[index * 2]
      const off = deployments[index * 2 + 1]
      expect(on!.strategy).toBe(getAddress(generation.on))
      expect(on!.feeSplitter).toBe(getAddress('0x7198C32a497c09497e04C86cf8F77A244A9E4b8F'))
      expect(on!.creatorFeesEnabled).toBe(true)
      expect(on!.creatorFeeNativeBps).toBe(4000)
      expect(on!.creatorFeeTokenBps).toBe(0)
      expect(off!.strategy).toBe(getAddress(generation.off))
      expect(off!.feeSplitter).toBe(getAddress('0xDF50f4ea2207F9D2A753a3DaE729B36FDEF13b23'))
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

  it('getInstantLaunchStrategy selects the current (3e05da8) deployment per variant', () => {
    expect(getInstantLaunchStrategy(SupportedChainId.ROBINHOOD, { creatorFeesEnabled: true })?.strategy).toBe(
      getAddress('0x9F67B864B565966dfCc2E0C6bA2483b2D5fF4b00')
    )
    expect(getInstantLaunchStrategy(SupportedChainId.ROBINHOOD, { creatorFeesEnabled: false })?.strategy).toBe(
      getAddress('0x16b63f1c8415FD68591c31FB3c6796a333DD640C')
    )
  })

  it('keeps every historical generation resolvable while selecting only the newest (append-only)', () => {
    for (const generation of ROBINHOOD_STRATEGY_GENERATIONS) {
      const on = getInstantLaunchDeployment(generation.on)
      const off = getInstantLaunchDeployment(generation.off)
      expect(on?.chainId).toBe(SupportedChainId.ROBINHOOD)
      expect(on?.creatorFeesEnabled).toBe(true)
      expect(on?.feeSplitter).toBe(getAddress('0x7198C32a497c09497e04C86cf8F77A244A9E4b8F'))
      expect(off?.chainId).toBe(SupportedChainId.ROBINHOOD)
      expect(off?.creatorFeesEnabled).toBe(false)
      expect(off?.feeSplitter).toBe(getAddress('0xDF50f4ea2207F9D2A753a3DaE729B36FDEF13b23'))
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
    expect(contracts?.beneficiaryVault).toBe(getAddress('0x587D2fDDDF14F6f84022b51e8c3a473eB88C4544'))
    expect(contracts?.compoundingClaimRecipient).toBe(getAddress('0x666DA63451A502A323677C2Ef5F763181358be9b'))
    expect(contracts?.liquidityLauncher).toBe(getLauncherAddresses(SupportedChainId.ROBINHOOD)!.liquidityLauncher)
  })
})

describe('creator-fees position recipient', () => {
  // Independent literal (not read back from the registry) so a registry edit cannot silently move
  // the recipient: the current fees-enabled Robinhood FeeSplitter.
  const FEES_ON_SPLITTER = getAddress('0x7198C32a497c09497e04C86cf8F77A244A9E4b8F')
  const FEES_OFF_SPLITTER = getAddress('0xDF50f4ea2207F9D2A753a3DaE729B36FDEF13b23')

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

  it('rejects an unknown recipient and a wrong chain', () => {
    expect(isCreatorFeesPositionRecipient(SupportedChainId.ROBINHOOD, '0x0000000000000000000000000000000000000001')).toBe(false)
    expect(isCreatorFeesPositionRecipient(SupportedChainId.MAINNET, FEES_ON_SPLITTER)).toBe(false)
  })
})
