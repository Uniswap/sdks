/**
 * Core client for interacting with The Compact
 */

import { PublicClient, WalletClient } from 'viem'
import { getDefaultAddress } from '../config/chains'
import { SponsorClient } from './sponsor'
import { ArbiterClient } from './arbiter'
import { ViewClient } from './view'

/**
 * Configuration for creating a Compact client
 */
export interface CompactClientConfig {
  chainId: number
  address?: `0x${string}`
  publicClient: PublicClient
  walletClient?: WalletClient
}

/**
 * Main Compact client interface
 */
export interface CompactClient {
  sponsor: SponsorClient
  arbiter: ArbiterClient
  view: ViewClient
  config: CompactClientConfig
}

/**
 * Create a Compact client for interacting with The Compact contract
 * @param config - Client configuration
 * @returns A CompactClient instance
 */
export function createCompactClient(config: CompactClientConfig): CompactClient {
  // Use default address if not provided
  const address = config.address || getDefaultAddress(config.chainId)

  if (!address) {
    throw new Error(`No default deployment found for chain ${config.chainId}. Please provide an address.`)
  }

  const fullConfig: CompactClientConfig = {
    ...config,
    address,
  }

  return {
    sponsor: new SponsorClient(fullConfig),
    arbiter: new ArbiterClient(fullConfig),
    view: new ViewClient(fullConfig),
    config: fullConfig,
  }
}

