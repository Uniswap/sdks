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
    defaultRpcUrl: process.env.RPC_URL || 'https://mainnet.unichain.org',
    blockExplorerUrl: 'https://uniscan.xyz',
  },

  // Unichain Sepolia (Testnet)
  1301: {
    chainId: 1301,
    name: 'Unichain Sepolia',
    contractAddress: '0x3b03b3caabd49ca12de9eba46a6a2950700b1db4',
    defaultRpcUrl: process.env.RPC_URL || 'https://sepolia.unichain.org',
    blockExplorerUrl: 'https://sepolia.uniscan.xyz',
  },
  // Unichain Alphanet (Testnet)
  22444422: {
    chainId: 22444422,
    name: 'Unichain Alphanet',
    contractAddress: '0x8d0e3f57052f33CEF1e6BE98B65aad1794dc95a5',
    defaultRpcUrl: process.env.RPC_URL || '', // note, we don't include the RPC URL for alphanet because Unichain doesn't want to expose it to the public
    blockExplorerUrl: '',
  },
  // Unichain Experimental (Testnet)
  420120005: {
    chainId: 420120005,
    name: 'Unichain Experimental',
    contractAddress: '0x2E41cb0D68D8dB7ebd16cef81D7eD82e7E1fbA40',
    defaultRpcUrl: process.env.RPC_URL || '', // note, we don't include the RPC URL for experimental because Unichain doesn't want to expose it to the public
    blockExplorerUrl: '',
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
 * Get the RPC URL for a given chain ID
 * @param chainId - The chain ID
 * @returns The RPC URL for the chain
 * @throws ChainNotSupportedError if chain is not supported
 */
export function getRpcUrl(chainId: number): string {
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
