import { describe, expect, it } from 'bun:test'
import { getAddress } from 'viem'

import { getLauncherAddresses, selectTokenFactory } from './addresses'
import { SupportedChainId } from './chains'

describe('getLauncherAddresses', () => {
  it('returns the Unichain LBPStrategy singleton', () => {
    const addresses = getLauncherAddresses(SupportedChainId.UNICHAIN)
    expect(addresses?.lbpStrategy).toBe(getAddress('0x824a3ecde463dd45cc156b64cefa132596c9a000'))
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
      getAddress('0xcacd77134b072b4ad5621f585b0b422c6da4e000')
    )
    expect(getLauncherAddresses(SupportedChainId.XLAYER)?.lbpStrategy).toBe(
      getAddress('0x95bcb80e3804a085d23778f2956c305d6488e000')
    )
    expect(getLauncherAddresses(SupportedChainId.ROBINHOOD)?.lbpStrategy).toBe(
      getAddress('0x095e38a2135aebcffa98a5b6911591937f912000')
    )
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
