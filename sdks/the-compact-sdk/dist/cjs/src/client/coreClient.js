"use strict";
/**
 * Core client for interacting with The Compact
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.createCompactClient = createCompactClient;
const chains_1 = require("../config/chains");
const arbiter_1 = require("./arbiter");
const sponsor_1 = require("./sponsor");
const view_1 = require("./view");
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
function createCompactClient(config) {
    // Use default address if not provided
    const address = config.address || (0, chains_1.getDefaultAddress)(config.chainId);
    if (!address) {
        throw new Error(`No default deployment found for chain ${config.chainId}. Please provide an address.`);
    }
    const fullConfig = {
        ...config,
        address,
    };
    return {
        sponsor: new sponsor_1.SponsorClient(fullConfig),
        arbiter: new arbiter_1.ArbiterClient(fullConfig),
        view: new view_1.ViewClient(fullConfig),
        config: fullConfig,
    };
}
//# sourceMappingURL=coreClient.js.map