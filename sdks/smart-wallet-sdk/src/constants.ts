import { ChainId } from '@uniswap/sdk-core'

// https://eips.ethereum.org/EIPS/eip-7702
export const DELEGATION_MAGIC_PREFIX = '0xef0100'

/**
 * The target address for self-calls is address(0)
 */
export const SELF_CALL_TARGET = '0x0000000000000000000000000000000000000000'

/**
 * Call types for smart wallet calls
 * Follows ERC-7579
 */
export enum ModeType {
  BATCHED_CALL = '0x0100000000000000000000000000000000000000000000000000000000000000',
  BATCHED_CALL_CAN_REVERT = '0x0101000000000000000000000000000000000000000000000000000000000000',
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
  BNB = ChainId.BNB,
  ARBITRUM_ONE = ChainId.ARBITRUM_ONE
}

/**
 * Supported smart wallet versions
 * @dev keyed by github release tag
 */
export enum SmartWalletVersion {
  LATEST = 'latest',
  v1_0_0 = 'v1.0.0',
  v1_0_0_staging = 'v1.0.0-staging',
}

// All smart wallet versions for a given chain id are optional except for the latest version
type SmartWalletVersionMap = Partial<{ [_version in SmartWalletVersion]: `0x${string}` }> & {
  [SmartWalletVersion.LATEST]: `0x${string}`
}

/**
 * Smart wallet versions for supported chains
 */
export const SMART_WALLET_VERSIONS: { [_chainId in SupportedChainIds]: SmartWalletVersionMap } = {
  [SupportedChainIds.MAINNET]: {
    [SmartWalletVersion.LATEST]: '0x000000009B1D0aF20D8C6d0A44e162d11F9b8f00',
    [SmartWalletVersion.v1_0_0]: '0x000000009B1D0aF20D8C6d0A44e162d11F9b8f00',
    [SmartWalletVersion.v1_0_0_staging]: '0x3cbad1e3b9049ecdb9588fb48dd61d80faf41bd5',
  },
  [SupportedChainIds.UNICHAIN]: {
    [SmartWalletVersion.LATEST]: '0x000000009B1D0aF20D8C6d0A44e162d11F9b8f00',
    [SmartWalletVersion.v1_0_0]: '0x000000009B1D0aF20D8C6d0A44e162d11F9b8f00',
    [SmartWalletVersion.v1_0_0_staging]: '0x3cbad1e3b9049ecdb9588fb48dd61d80faf41bd5',
  },
  [SupportedChainIds.BASE]: {
    [SmartWalletVersion.LATEST]: '0x000000009B1D0aF20D8C6d0A44e162d11F9b8f00',
    [SmartWalletVersion.v1_0_0]: '0x000000009B1D0aF20D8C6d0A44e162d11F9b8f00',
    [SmartWalletVersion.v1_0_0_staging]: '0x3cbad1e3b9049ecdb9588fb48dd61d80faf41bd5',
  },
  [SupportedChainIds.OPTIMISM]: {
    [SmartWalletVersion.LATEST]: '0x000000009B1D0aF20D8C6d0A44e162d11F9b8f00',
    [SmartWalletVersion.v1_0_0]: '0x000000009B1D0aF20D8C6d0A44e162d11F9b8f00',
    [SmartWalletVersion.v1_0_0_staging]: '0x3cbad1e3b9049ecdb9588fb48dd61d80faf41bd5',
  },
  [SupportedChainIds.BNB]: {
    [SmartWalletVersion.LATEST]: '0x000000009B1D0aF20D8C6d0A44e162d11F9b8f00',
    [SmartWalletVersion.v1_0_0]: '0x000000009B1D0aF20D8C6d0A44e162d11F9b8f00',
    [SmartWalletVersion.v1_0_0_staging]: '0x3cbad1e3b9049ecdb9588fb48dd61d80faf41bd5',
  },
  [SupportedChainIds.ARBITRUM_ONE]: {
    [SmartWalletVersion.LATEST]: '0x000000009B1D0aF20D8C6d0A44e162d11F9b8f00',
    [SmartWalletVersion.v1_0_0]: '0x000000009B1D0aF20D8C6d0A44e162d11F9b8f00',
  },
  [SupportedChainIds.UNICHAIN_SEPOLIA]: {
    [SmartWalletVersion.LATEST]: '0x000000009B1D0aF20D8C6d0A44e162d11F9b8f00',
    [SmartWalletVersion.v1_0_0]: '0x000000009B1D0aF20D8C6d0A44e162d11F9b8f00',
    [SmartWalletVersion.v1_0_0_staging]: '0x3cbad1e3b9049ecdb9588fb48dd61d80faf41bd5',
  },
  [SupportedChainIds.SEPOLIA]: {
    [SmartWalletVersion.LATEST]: '0x000000009B1D0aF20D8C6d0A44e162d11F9b8f00',
    [SmartWalletVersion.v1_0_0]: '0x000000009B1D0aF20D8C6d0A44e162d11F9b8f00',
    [SmartWalletVersion.v1_0_0_staging]: '0x3cbad1e3b9049ecdb9588fb48dd61d80faf41bd5',
  },
}

/**
 * Mapping of chainId to Smart Wallet contract addresses
 * @dev Used to get the latest version of the smart wallet
 *      See README for detailed deployment addresses along with the commit hash
 * @deprecated Use getSmartWalletAddress() instead of indexing this map directly.
 */
export const SMART_WALLET_ADDRESSES = (() => {
  const entries = Object.entries(SMART_WALLET_VERSIONS).map(([chainId, versions]) => [
    chainId,
    versions[SmartWalletVersion.LATEST],
  ])
  const map = Object.fromEntries(entries) as Record<string | number, `0x${string}`>
  // Explicitly remove prototype to prevent access via __proto__/constructor, etc.
  Object.setPrototypeOf(map, null)
  return map
})()

/**
 * Get all historical smart wallet versions for a given chain id
 */
export const getAllSmartWalletVersions = (chainId: SupportedChainIds) => {
  return Object.values(SMART_WALLET_VERSIONS[chainId])
}

/**
 * Get the latest Smart Wallet address for a given chain id.
 * Normalizes string ids to numbers and guards against prototype pollution.
 */
export function getSmartWalletAddress(chainIdLike: number | string | ChainId): `0x${string}` {
  const normalized = typeof chainIdLike === 'string' ? Number(chainIdLike) : chainIdLike
  const isValid = typeof normalized === 'number' && Number.isFinite(normalized) && Number.isInteger(normalized)
  if (!isValid || !Object.prototype.hasOwnProperty.call(SMART_WALLET_ADDRESSES, normalized)) {
    throw new Error(`Smart wallet not found for chainId: ${chainIdLike}`)
  }
  return (SMART_WALLET_ADDRESSES as Record<number, `0x${string}`>)[normalized]
}
