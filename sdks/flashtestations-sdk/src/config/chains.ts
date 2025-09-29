import { ChainConfig, ChainNotSupportedError } from '../types/index';

/**
 * Chain configuration for supported chains
 */
export const CHAIN_CONFIGS: Record<number, ChainConfig> = {
  // Unichain Mainnet
  130: {
    chainId: 130,
    name: 'Unichain Mainnet',
    contractAddress: '0x0000000000000000000000000000000000000000', // TODO: Replace with actual contract address
    defaultRpcUrl: 'https://rpc.unichain.org',
    blockExplorerUrl: 'https://explorer.unichain.org',
  },

  // Unichain Sepolia (Testnet)
  1301: {
    chainId: 1301,
    name: 'Unichain Sepolia',
    contractAddress: '0x0000000000000000000000000000000000000000', // TODO: Replace with actual contract address
    defaultRpcUrl: 'https://sepolia.unichain.org',
    blockExplorerUrl: 'https://sepolia.explorer.unichain.org',
  },
};

/**
 * Get the contract address for a given chain ID
 * @param chainId - The chain ID
 * @returns The BlockBuilderPolicy contract address
 * @throws ChainNotSupportedError if chain is not supported
 */
export function getContractAddress(chainId: number): string {
  const config = CHAIN_CONFIGS[chainId];
  if (!config) {
    throw new ChainNotSupportedError(chainId, getSupportedChains());
  }
  return config.contractAddress;
}

/**
 * Get the default RPC URL for a given chain ID
 * @param chainId - The chain ID
 * @returns The default RPC URL for the chain
 * @throws ChainNotSupportedError if chain is not supported
 */
export function getDefaultRpcUrl(chainId: number): string {
  const config = CHAIN_CONFIGS[chainId];
  if (!config) {
    throw new ChainNotSupportedError(chainId, getSupportedChains());
  }
  return config.defaultRpcUrl;
}

/**
 * Get the block explorer URL for a given chain ID
 * @param chainId - The chain ID
 * @returns The block explorer base URL for the chain
 * @throws ChainNotSupportedError if chain is not supported
 */
export function getBlockExplorerUrl(chainId: number): string {
  const config = CHAIN_CONFIGS[chainId];
  if (!config) {
    throw new ChainNotSupportedError(chainId, getSupportedChains());
  }
  return config.blockExplorerUrl;
}

/**
 * Get the chain configuration for a given chain ID
 * @param chainId - The chain ID
 * @returns The complete chain configuration
 * @throws ChainNotSupportedError if chain is not supported
 */
export function getChainConfig(chainId: number): ChainConfig {
  const config = CHAIN_CONFIGS[chainId];
  if (!config) {
    throw new ChainNotSupportedError(chainId, getSupportedChains());
  }
  return config;
}

/**
 * Get list of all supported chain IDs
 * @returns Array of supported chain IDs
 */
export function getSupportedChains(): number[] {
  return Object.keys(CHAIN_CONFIGS).map(Number);
}

/**
 * Check if a chain ID is supported
 * @param chainId - The chain ID to check
 * @returns True if the chain is supported, false otherwise
 */
export function isChainSupported(chainId: number): boolean {
  return chainId in CHAIN_CONFIGS;
}
