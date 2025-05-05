import { getAllSmartWalletVersions, SMART_WALLET_ADDRESSES, SupportedChainIds, SMART_WALLET_VERSIONS, SmartWalletVersion } from "./constants"

describe('constants', () => {
  it('SMART_WALLET_ADDRESSES should be latest versions', () => {
    let chainId = SupportedChainIds.UNICHAIN_SEPOLIA
    expect(SMART_WALLET_ADDRESSES[chainId]).toEqual(SMART_WALLET_VERSIONS[chainId][SmartWalletVersion.LATEST])

    chainId = SupportedChainIds.SEPOLIA
    expect(SMART_WALLET_ADDRESSES[chainId]).toEqual(SMART_WALLET_VERSIONS[chainId][SmartWalletVersion.LATEST])
  })

  it('getAllSmartWalletVersions should return all versions for a given chain id', () => {
    let chainId = SupportedChainIds.UNICHAIN_SEPOLIA
    expect(getAllSmartWalletVersions(chainId)).toEqual(Object.values(SMART_WALLET_VERSIONS[chainId]))

    chainId = SupportedChainIds.SEPOLIA
    expect(getAllSmartWalletVersions(chainId)).toEqual(Object.values(SMART_WALLET_VERSIONS[chainId]))
  })
})
