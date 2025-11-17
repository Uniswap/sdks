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
 *
 * Specifies the chain, contract address, and viem clients needed to interact
 * with The Compact protocol.
 *
 * @property chainId - The chain ID to interact with (e.g., 1 for Ethereum mainnet)
 * @property address - Optional contract address (defaults to deployment for the chain if available)
 * @property publicClient - Viem PublicClient for read-only operations
 * @property walletClient - Optional Viem WalletClient for write operations (required for deposits, claims, etc.)
 *
 * @example
 * ```typescript
 * import { createPublicClient, createWalletClient, http } from 'viem'
 * import { mainnet } from 'viem/chains'
 *
 * const publicClient = createPublicClient({
 *   chain: mainnet,
 *   transport: http()
 * })
 *
 * const walletClient = createWalletClient({
 *   chain: mainnet,
 *   transport: http()
 * })
 *
 * const config: CompactClientConfig = {
 *   chainId: 1,
 *   publicClient,
 *   walletClient,
 *   // address is optional - will use default deployment
 * }
 * ```
 */
export interface CompactClientConfig {
  /**
   * The chain ID to interact with
   * @example 1 for Ethereum mainnet, 10 for Optimism, 8453 for Base
   */
  chainId: number

  /**
   * Optional contract address to use instead of the default deployment
   * @example '0x00000000000000171ede64904551eeDF3C6C9788'
   */
  address?: `0x${string}`

  /**
   * Viem PublicClient for read-only operations
   * @see https://viem.sh/docs/clients/public.html
   */
  publicClient: PublicClient

  /**
   * Optional Viem WalletClient for write operations
   * Required for: deposits, compacts, claims, forced withdrawals, registration
   * Not required for: view operations only
   * @see https://viem.sh/docs/clients/wallet.html
   */
  walletClient?: WalletClient
}

/**
 * Main Compact client interface
 *
 * Provides access to all functionality of The Compact protocol through
 * specialized sub-clients for different roles:
 * - sponsor: Deposit funds and create compacts
 * - arbiter: Submit claims to process compacts
 * - view: Query protocol state (read-only)
 *
 * @property sponsor - Client for sponsor operations (deposits, compacts, forced withdrawals)
 * @property arbiter - Client for arbiter operations (claim submissions)
 * @property view - Client for view operations (read-only queries)
 * @property config - The configuration used to create this client
 *
 * @example
 * ```typescript
 * const client = createCompactClient({
 *   chainId: 1,
 *   publicClient,
 *   walletClient
 * })
 *
 * // Deposit tokens
 * await client.sponsor.depositNative({
 *   lockTag: '0x000000000000000000000001',
 *   recipient: address,
 *   value: parseEther('1.0')
 * })
 *
 * // Query balances
 * const balance = await client.view.balanceOf({
 *   account: address,
 *   id: lockId
 * })
 *
 * // Submit claims
 * const claim = client.arbiter.singleClaimBuilder()
 *   .sponsor(sponsorAddress)
 *   // ... configure claim
 *   .build()
 *
 * await client.arbiter.claim(claim.struct)
 * ```
 *
 * @see SponsorClient for deposit and compact creation operations
 * @see ArbiterClient for claim submission operations
 * @see ViewClient for read-only query operations
 */
export interface CompactClient {
  /**
   * Client for sponsor operations
   *
   * Sponsors deposit tokens to create resource locks and create compacts
   * (intents to transfer those locked resources).
   */
  sponsor: SponsorClient

  /**
   * Client for arbiter operations
   *
   * Arbiters submit claims to process compacts and distribute locked funds
   * to claimants according to allocator rules.
   */
  arbiter: ArbiterClient

  /**
   * Client for view operations
   *
   * Read-only queries for protocol state including lock details, balances,
   * registration status, and forced withdrawal state.
   */
  view: ViewClient

  /**
   * The configuration used to create this client
   */
  config: CompactClientConfig
}

/**
 * Create a Compact client for interacting with The Compact protocol
 *
 * This is the main entry point for interacting with The Compact. It creates
 * a client instance with access to all protocol functionality through specialized
 * sub-clients (sponsor, arbiter, view).
 *
 * The contract address can be explicitly provided or will default to the known
 * deployment for the specified chain if available.
 *
 * @param config - Client configuration including chain ID and viem clients
 * @param config.chainId - The chain ID to interact with (e.g., 1 for Ethereum mainnet)
 * @param config.publicClient - Viem PublicClient for read-only operations
 * @param config.walletClient - Optional Viem WalletClient for write operations
 * @param config.address - Optional contract address (uses default deployment if omitted)
 * @returns A CompactClient instance with sponsor, arbiter, and view sub-clients
 *
 * @throws {Error} If no default deployment exists for the chain and no address is provided
 *
 * @example
 * ```typescript
 * import { createCompactClient } from '@uniswap/the-compact-sdk'
 * import { createPublicClient, createWalletClient, http } from 'viem'
 * import { mainnet } from 'viem/chains'
 * import { privateKeyToAccount } from 'viem/accounts'
 *
 * // Create viem clients
 * const publicClient = createPublicClient({
 *   chain: mainnet,
 *   transport: http()
 * })
 *
 * const account = privateKeyToAccount('0x...')
 * const walletClient = createWalletClient({
 *   account,
 *   chain: mainnet,
 *   transport: http()
 * })
 *
 * // Create Compact client (uses default deployment address)
 * const client = createCompactClient({
 *   chainId: 1,
 *   publicClient,
 *   walletClient
 * })
 *
 * // Access sub-clients
 * await client.sponsor.depositNative({ ... })
 * await client.arbiter.claim({ ... })
 * await client.view.balanceOf({ ... })
 * ```
 *
 * @example
 * ```typescript
 * // Create client with custom contract address
 * const client = createCompactClient({
 *   chainId: 1,
 *   address: '0x1234567890123456789012345678901234567890',
 *   publicClient,
 *   walletClient
 * })
 * ```
 *
 * @example
 * ```typescript
 * // Create read-only client (no wallet)
 * const client = createCompactClient({
 *   chainId: 1,
 *   publicClient
 *   // walletClient omitted - can only use view operations
 * })
 *
 * // View operations work
 * const balance = await client.view.balanceOf({ ... })
 *
 * // Write operations will throw
 * await client.sponsor.depositNative({ ... }) // throws: walletClient is required
 * ```
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
