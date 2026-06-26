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
})
