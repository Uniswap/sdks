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
  MAINNET = ChainId.MAINNET,
  UNICHAIN = ChainId.UNICHAIN,
  UNICHAIN_SEPOLIA = ChainId.UNICHAIN_SEPOLIA,
  SEPOLIA = ChainId.SEPOLIA,
  BASE = ChainId.BASE,
  OPTIMISM = ChainId.OPTIMISM,
  ARBITRUM_ONE = ChainId.ARBITRUM_ONE,
  BNB = ChainId.BNB,
  WORLDCHAIN = ChainId.WORLDCHAIN,
  ZORA = ChainId.ZORA,
}

/**
 * Supported smart wallet versions
 * @dev keyed by github release tag
 */
export enum SmartWalletVersion {
  LATEST = 'latest',
  v1_0_0_staging = 'v1.0.0-staging',
  v0_3_0_audit_2 = 'v0.3.0-audit.2'
}

/**
 * Smart wallet versions for supported chains
 */
export const SMART_WALLET_VERSIONS: { [chainId in SupportedChainIds]: Partial<{ [version in SmartWalletVersion]: `0x${string}` }> } = {
  [SupportedChainIds.MAINNET]: {
    [SmartWalletVersion.LATEST]: '0x3cbad1e3b9049ecdb9588fb48dd61d80faf41bd5',
    [SmartWalletVersion.v1_0_0_staging]: '0x3cbad1e3b9049ecdb9588fb48dd61d80faf41bd5',
    [SmartWalletVersion.v0_3_0_audit_2]: '0x458f5a9f47A01beA5d7A32662660559D9eD3312c',
  },
  [SupportedChainIds.UNICHAIN]: {
    [SmartWalletVersion.LATEST]: '0x3cbad1e3b9049ecdb9588fb48dd61d80faf41bd5',
    [SmartWalletVersion.v1_0_0_staging]: '0x3cbad1e3b9049ecdb9588fb48dd61d80faf41bd5',
    [SmartWalletVersion.v0_3_0_audit_2]: '0x458f5a9f47A01beA5d7A32662660559D9eD3312c',
  },
  [SupportedChainIds.BASE]: {
    [SmartWalletVersion.LATEST]: '0x3cbad1e3b9049ecdb9588fb48dd61d80faf41bd5',
    [SmartWalletVersion.v1_0_0_staging]: '0x3cbad1e3b9049ecdb9588fb48dd61d80faf41bd5',
    [SmartWalletVersion.v0_3_0_audit_2]: '0x458f5a9f47A01beA5d7A32662660559D9eD3312c',
  },
  [SupportedChainIds.OPTIMISM]: {
    [SmartWalletVersion.LATEST]: '0x3cbad1e3b9049ecdb9588fb48dd61d80faf41bd5',
    [SmartWalletVersion.v1_0_0_staging]: '0x3cbad1e3b9049ecdb9588fb48dd61d80faf41bd5',
  },
  [SupportedChainIds.BNB]: {
    [SmartWalletVersion.LATEST]: '0x3cbad1e3b9049ecdb9588fb48dd61d80faf41bd5',
    [SmartWalletVersion.v1_0_0_staging]: '0x3cbad1e3b9049ecdb9588fb48dd61d80faf41bd5',
    [SmartWalletVersion.v0_3_0_audit_2]: '0x458f5a9f47A01beA5d7A32662660559D9eD3312c',
  },
  [SupportedChainIds.ARBITRUM_ONE]: {
    [SmartWalletVersion.LATEST]: '0x458f5a9f47A01beA5d7A32662660559D9eD3312c',
    [SmartWalletVersion.v0_3_0_audit_2]: '0x458f5a9f47A01beA5d7A32662660559D9eD3312c',
  },
  [SupportedChainIds.WORLDCHAIN]: {
    [SmartWalletVersion.LATEST]: '0x458f5a9f47A01beA5d7A32662660559D9eD3312c',
    [SmartWalletVersion.v0_3_0_audit_2]: '0x458f5a9f47A01beA5d7A32662660559D9eD3312c',
  },
  [SupportedChainIds.ZORA]: {
    [SmartWalletVersion.LATEST]: '0x458f5a9f47A01beA5d7A32662660559D9eD3312c',
    [SmartWalletVersion.v0_3_0_audit_2]: '0x458f5a9f47A01beA5d7A32662660559D9eD3312c',
  },
  [SupportedChainIds.UNICHAIN_SEPOLIA]: {
    [SmartWalletVersion.LATEST]: '0x3cbad1e3b9049ecdb9588fb48dd61d80faf41bd5',
    [SmartWalletVersion.v1_0_0_staging]: '0x3cbad1e3b9049ecdb9588fb48dd61d80faf41bd5',
    [SmartWalletVersion.v0_3_0_audit_2]: '0x458f5a9f47A01beA5d7A32662660559D9eD3312c',
  },
  [SupportedChainIds.SEPOLIA]: {
    [SmartWalletVersion.LATEST]: '0x3cbad1e3b9049ecdb9588fb48dd61d80faf41bd5',
    [SmartWalletVersion.v1_0_0_staging]: '0x3cbad1e3b9049ecdb9588fb48dd61d80faf41bd5',
    [SmartWalletVersion.v0_3_0_audit_2]: '0x458f5a9f47A01beA5d7A32662660559D9eD3312c',
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
