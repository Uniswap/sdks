import { getAllSmartWalletVersions, SMART_WALLET_ADDRESSES, SupportedChainIds, SMART_WALLET_VERSIONS, SmartWalletVersion } from "./constants"

describe('constants', () => {
  it('SMART_WALLET_ADDRESSES should be latest versions', () => {
    // Since we only have one chain ID right now, test it directly
    const chainId = SupportedChainIds.SEPOLIA
    expect(SMART_WALLET_ADDRESSES[chainId]).toEqual(SMART_WALLET_VERSIONS[chainId][SmartWalletVersion.LATEST])
  })

  it('getAllSmartWalletVersions should return all versions for a given chain id', () => {
    const chainId = SupportedChainIds.SEPOLIA
    expect(getAllSmartWalletVersions(chainId)).toEqual(Object.values(SMART_WALLET_VERSIONS[chainId]))
  })
})
