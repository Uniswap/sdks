import { ChainId } from '@uniswap/sdk-core'

// https://eips.ethereum.org/EIPS/eip-7702
export const DELEGATION_MAGIC_PREFIX = '0xef0100';

/**
 * The target address for self-calls is address(0)
 */
export const SELF_CALL_TARGET = "0x0000000000000000000000000000000000000000"

/**
 * Call types for smart wallet calls
 * Follows ERC-7579
 */
export enum ModeType {
  BATCHED_CALL = '0x0100000000000000000000000000000000000000000000000000000000000000',
  BATCHED_CALL_CAN_REVERT = '0x0101000000000000000000000000000000000000000000000000000000000000'
}

/**
 * Supported chain ids
 */
export enum SupportedChainIds {
  UNICHAIN_SEPOLIA = ChainId.UNICHAIN_SEPOLIA,
  SEPOLIA = ChainId.SEPOLIA,
}

/**
 * Supported smart wallet versions
 * @dev keyed by github release tag
 */
export enum SmartWalletVersion {
  LATEST = 'latest',
  v0_2_1_audit_2 = 'v0.2.1-audit.2',
}

/**
 * Smart wallet versions for supported chains
 */
export const SMART_WALLET_VERSIONS: { [chainId in SupportedChainIds]: { [version in SmartWalletVersion]: `0x${string}` } } = {
  [SupportedChainIds.UNICHAIN_SEPOLIA]: {
    [SmartWalletVersion.LATEST]: '0x0c338ca25585035142A9a0a1EEebA267256f281f',
    [SmartWalletVersion.v0_2_1_audit_2]: '0x964914430aAe3e6805675EcF648cEfaED9e546a7',
  },
  [SupportedChainIds.SEPOLIA]: {
    [SmartWalletVersion.LATEST]: '0x964914430aAe3e6805675EcF648cEfaED9e546a7',
    [SmartWalletVersion.v0_2_1_audit_2]: '0x964914430aAe3e6805675EcF648cEfaED9e546a7',
  }
}

/**
 * Mapping of chainId to Smart Wallet contract addresses
 * @dev Used to get the latest version of the smart wallet
 *      See README for detailed deployment addresses along with the commit hash
 */
export const SMART_WALLET_ADDRESSES = Object.fromEntries(
  Object.entries(SMART_WALLET_VERSIONS).map(([chainId, versions]) => [
    chainId,
    versions[SmartWalletVersion.LATEST]
  ])
)

/**
 * Get all historical smart wallet versions for a given chain id
 */
export const getAllSmartWalletVersions = (chainId: SupportedChainIds) => {
  return Object.values(SMART_WALLET_VERSIONS[chainId])
}
