import { describe, expect, it } from 'bun:test'
import { getAddress } from 'viem'

import {
  AUCTION_FACTORY_DEPLOYMENTS,
  getInstantLaunchContracts,
  getInstantLaunchDeployment,
  getInstantLaunchDeployments,
  getInstantLaunchStrategy,
  getLauncherAddresses,
  getTickDataLensForFactory,
  INSTANT_LAUNCH_DEPLOYMENT_BY_STRATEGY,
  INSTANT_LAUNCH_DEPLOYMENTS,
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

describe('Instant Launch deployment registry', () => {
  it('carries both canonical Robinhood variants from the liquidity-launcher dev README', () => {
    const deployments = getInstantLaunchDeployments(SupportedChainId.ROBINHOOD)
    expect(deployments).toHaveLength(2)
    const [on, off] = deployments
    expect(on!.strategy).toBe(getAddress('0x5B37F9a24e9CAb142Ca758A69a28Bf57B4c714D9'))
    expect(on!.feeSplitter).toBe(getAddress('0xf139e6835B1494c9AC57133B1Dc052B097328199'))
    expect(on!.creatorFeesEnabled).toBe(true)
    expect(on!.creatorFeeNativeBps).toBe(4000)
    expect(on!.creatorFeeTokenBps).toBe(0)
    expect(off!.strategy).toBe(getAddress('0x42cdE2f72B2292BE3973c59811b8901627930b2d'))
    expect(off!.feeSplitter).toBe(getAddress('0xF165D5B169106e13bFB568C52af5d11977365630'))
    expect(off!.creatorFeesEnabled).toBe(false)
    expect(off!.creatorFeeNativeBps).toBe(0)
    expect(off!.creatorFeeTokenBps).toBe(0)
    // Both current instances open at the same immutable initial tick.
    expect(on!.initialTick).toBe(198060)
    expect(off!.initialTick).toBe(198060)
  })

  it('is empty for chains without an Instant Launch deployment', () => {
    expect(getInstantLaunchDeployments(SupportedChainId.MAINNET)).toHaveLength(0)
    expect(getInstantLaunchStrategy(SupportedChainId.MAINNET, { creatorFeesEnabled: true })).toBeUndefined()
    expect(getInstantLaunchContracts(SupportedChainId.MAINNET)).toBeUndefined()
  })

  it('getInstantLaunchStrategy selects the current deployment per variant', () => {
    expect(getInstantLaunchStrategy(SupportedChainId.ROBINHOOD, { creatorFeesEnabled: true })?.strategy).toBe(
      getAddress('0x5B37F9a24e9CAb142Ca758A69a28Bf57B4c714D9')
    )
    expect(getInstantLaunchStrategy(SupportedChainId.ROBINHOOD, { creatorFeesEnabled: false })?.strategy).toBe(
      getAddress('0x42cdE2f72B2292BE3973c59811b8901627930b2d')
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
    expect(contracts?.beneficiaryVault).toBe(getAddress('0xF3b8653B53d75ec9925d88b051CcFDabbd4894f5'))
    expect(contracts?.compoundingClaimRecipient).toBe(getAddress('0x3fC7BA967295C10AFD2Ad4f098Dce3a71e6b8c73'))
    expect(contracts?.liquidityLauncher).toBe(getLauncherAddresses(SupportedChainId.ROBINHOOD)!.liquidityLauncher)
  })
})
