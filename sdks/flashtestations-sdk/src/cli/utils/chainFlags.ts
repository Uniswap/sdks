/**
 * Shared chain flag parsing utilities for CLI commands
 */

import { Command } from 'commander';

import {
  isChainSupported,
  getChainBySlug,
  getRpcUrl,
  getSupportedChainSlugs,
  getDefaultChainSlug,
  getChainConfig,
} from '../../config/chains';
import { ValidationError } from '../../types';

/**
 * Default chain ID (Unichain Mainnet)
 */
export const DEFAULT_CHAIN_ID = 130;

/**
 * Chain flag options parsed from CLI
 */
export interface ChainOptions {
  chain?: string;
  chainId?: number;
  rpcUrl?: string;
}

/**
 * Resolved chain configuration
 */
export interface ResolvedChainConfig {
  chainId: number;
  rpcUrl?: string;
}

/**
 * Add common chain flags to a command
 */
export function addChainFlags(command: Command): Command {
  const availableChains = getSupportedChainSlugs().join(', ');
  return command
    .option(
      '--chain <name>',
      `Chain to use (${availableChains}) [default: ${getDefaultChainSlug()}]`
    )
    .option('-c, --chain-id <id>', 'Chain ID (advanced: use numeric chain ID directly)', parseInt)
    .option('-r, --rpc-url <url>', 'Custom RPC URL');
}

/**
 * Resolve chain ID from options
 * Priority: --chain-id > --chain > default (unichain-mainnet)
 */
export function resolveChainConfig(options: ChainOptions): ResolvedChainConfig {
  let chainId: number;

  if (options.chainId !== undefined) {
    // --chain-id takes highest priority (for advanced users)
    chainId = options.chainId;
  } else if (options.chain) {
    // --chain <slug> is the standard way to specify chain
    const config = getChainBySlug(options.chain);
    if (!config) {
      const availableChains = getSupportedChainSlugs().join(', ');
      throw new ValidationError(
        `Unknown chain "${options.chain}". Available chains: ${availableChains}`
      );
    }
    chainId = config.chainId;
  } else {
    // Default to Unichain Mainnet
    chainId = DEFAULT_CHAIN_ID;
  }

  // Validate chain ID is supported (unless custom RPC is provided)
  if (!options.rpcUrl) {
    const availableChains = getSupportedChainSlugs().join(', ');

    if (getRpcUrl(chainId) === '') {
      throw new ValidationError(
        `Chain ${chainId} requires a custom RPC URL. ` +
        `Use --rpc-url to specify a custom RPC URL for this chain.`
      );
    } else if (!isChainSupported(chainId)) {
      throw new ValidationError(
        `Chain ${chainId} is not supported. Available chains: ${availableChains}. ` +
        `Use --rpc-url to specify a custom RPC URL for unsupported chains.`
      );
    }
  }

  return {
    chainId,
    rpcUrl: options.rpcUrl,
  };
}

/**
 * Get human-readable chain name for display
 */
export function getChainDisplayName(chainId: number): string {
  if (isChainSupported(chainId)) {
    return getChainConfig(chainId).name;
  }
  return `Chain ${chainId}`;
}
