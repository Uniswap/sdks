import { getAllSmartWalletVersions, SMART_WALLET_ADDRESSES, SupportedChainIds, SMART_WALLET_VERSIONS, SmartWalletVersion } from "./constants"

describe('constants', () => {
  it('SMART_WALLET_ADDRESSES should be latest versions', () => {
    let chainId = SupportedChainIds.MAINNET
    expect(SMART_WALLET_ADDRESSES[chainId]).toEqual(SMART_WALLET_VERSIONS[chainId][SmartWalletVersion.LATEST])

    chainId = SupportedChainIds.UNICHAIN
    expect(SMART_WALLET_ADDRESSES[chainId]).toEqual(SMART_WALLET_VERSIONS[chainId][SmartWalletVersion.LATEST])

    chainId = SupportedChainIds.UNICHAIN_SEPOLIA
    expect(SMART_WALLET_ADDRESSES[chainId]).toEqual(SMART_WALLET_VERSIONS[chainId][SmartWalletVersion.LATEST])

    chainId = SupportedChainIds.SEPOLIA
    expect(SMART_WALLET_ADDRESSES[chainId]).toEqual(SMART_WALLET_VERSIONS[chainId][SmartWalletVersion.LATEST])
  })

  it('getAllSmartWalletVersions should return all versions for a given chain id', () => {
    let chainId = SupportedChainIds.MAINNET
    expect(getAllSmartWalletVersions(chainId)).toEqual(Object.values(SMART_WALLET_VERSIONS[chainId]))

    chainId = SupportedChainIds.UNICHAIN
    expect(getAllSmartWalletVersions(chainId)).toEqual(Object.values(SMART_WALLET_VERSIONS[chainId]))

    chainId = SupportedChainIds.UNICHAIN_SEPOLIA
    expect(getAllSmartWalletVersions(chainId)).toEqual(Object.values(SMART_WALLET_VERSIONS[chainId]))

    chainId = SupportedChainIds.SEPOLIA
    expect(getAllSmartWalletVersions(chainId)).toEqual(Object.values(SMART_WALLET_VERSIONS[chainId]))
  })
})
