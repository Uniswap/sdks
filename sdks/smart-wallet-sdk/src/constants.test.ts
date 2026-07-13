import { getAllSmartWalletVersions, SMART_WALLET_ADDRESSES, SupportedChainIds, SMART_WALLET_VERSIONS, SmartWalletVersion } from "./constants"

describe('constants', () => {
  it('SMART_WALLET_ADDRESSES should be latest versions', () => {
    const chainIdValues = Object.values(SupportedChainIds)
        .filter(value => typeof value === 'number');

    for (const chainId of chainIdValues) {
      expect(SMART_WALLET_ADDRESSES[chainId as SupportedChainIds]).toEqual(SMART_WALLET_VERSIONS[chainId as SupportedChainIds][SmartWalletVersion.LATEST])
    }
  })

  it('getAllSmartWalletVersions should return all versions for a given chain id', () => {
    const chainIdValues = Object.values(SupportedChainIds)
        .filter(value => typeof value === 'number');

    for (const chainId of chainIdValues) {
      expect(getAllSmartWalletVersions(chainId as SupportedChainIds)).toEqual(Object.values(SMART_WALLET_VERSIONS[chainId as SupportedChainIds]))
    }
  })

  it('Monad should have v1.0.0 and v1.1.0 deployments with v1.1.0 as latest', () => {
    const versions = SMART_WALLET_VERSIONS[SupportedChainIds.MONAD]
    expect(Object.keys(versions).sort()).toEqual(
      [SmartWalletVersion.LATEST, SmartWalletVersion.v1_1_0, SmartWalletVersion.v1_0_0].sort()
    )
    expect(versions[SmartWalletVersion.LATEST]).toEqual(versions[SmartWalletVersion.v1_1_0])
    expect(SMART_WALLET_ADDRESSES[SupportedChainIds.MONAD]).toEqual('0x000000005c84F8Fd50b21CAC312528A64437030e')
  })
})
