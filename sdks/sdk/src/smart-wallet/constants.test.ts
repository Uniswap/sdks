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
})
