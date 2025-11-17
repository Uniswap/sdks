/**
 * Arbiter client for claim submission operations
 */
import { CompactClientConfig } from './coreClient';
import { Claim, BatchClaim, MultichainClaim, BatchMultichainClaim, ExogenousMultichainClaim, ExogenousBatchMultichainClaim } from '../types/claims';
/**
 * Client for arbiter operations (claim submissions)
 *
 * The arbiter client handles submitting claims against compacts. Claims can be:
 * - Single claims: One resource from one compact
 * - Batch claims: Multiple resources from multiple compacts (same chain)
 * - Multichain claims: Single resource coordinated across chains
 * - Batch multichain claims: Multiple resources coordinated across chains
 *
 * @example
 * ```typescript
 * const claim = client.arbiter.singleClaimBuilder()
 *   .sponsor(sponsorAddress)
 *   .nonce(1n)
 *   .expires(BigInt(Date.now() + 3600000))
 *   .id(lockId)
 *   .allocatedAmount(1000000n)
 *   .lockTag(lockTag)
 *   .addTransfer({ recipient, amount })
 *   .build()
 *
 * const result = await client.arbiter.claim(claim.struct)
 * console.log('Claim submitted:', result.txHash)
 * ```
 *
 * @see SponsorClient for creating compacts
 * @see ViewClient for querying claim status
 */
export declare class ArbiterClient {
    private config;
    constructor(config: CompactClientConfig);
    /**
     * Submit a single claim against a compact
     *
     * Claims are used by arbiters to process compacts and distribute locked funds
     * to claimants. The claim must be valid according to the compact's allocator rules.
     *
     * @param claim - The claim struct containing all claim parameters
     * @returns Object containing transaction hash and computed claim hash
     *
     * @throws {Error} If walletClient is not configured
     * @throws {Error} If contract address is not set
     * @throws {CompactError} If the claim is invalid or processing fails
     *
     * @example
     * ```typescript
     * const claim = client.arbiter.singleClaimBuilder()
     *   .sponsor('0x...')
     *   .nonce(1n)
     *   .id(lockId)
     *   .allocatedAmount(1000000n)
     *   .lockTag(lockTag)
     *   .addTransfer({ recipient: '0x...', amount: 1000000n })
     *   .build()
     *
     * const result = await client.arbiter.claim(claim.struct)
     * console.log('Claim hash:', result.claimHash)
     * ```
     */
    claim(claim: Claim): Promise<{
        txHash: `0x${string}`;
        claimHash: `0x${string}`;
    }>;
    /**
     * Submit a batch claim against multiple compacts
     *
     * Batch claims allow processing multiple resources from different compacts
     * in a single transaction, all on the same chain.
     *
     * @param claim - The batch claim struct
     * @returns Object containing transaction hash and computed claim hash
     *
     * @throws {Error} If walletClient is not configured
     * @throws {Error} If contract address is not set
     * @throws {CompactError} If the claim is invalid or processing fails
     *
     * @example
     * ```typescript
     * const claim = client.arbiter.batchClaimBuilder()
     *   .sponsor('0x...')
     *   .nonce(1n)
     *   .addIdAndAmount(lockId1, 1000000n)
     *   .addIdAndAmount(lockId2, 2000000n)
     *   .addClaimant(lockTag1, { kind: 'transfer', recipient: '0x...', amount: 1000000n })
     *   .addClaimant(lockTag2, { kind: 'transfer', recipient: '0x...', amount: 2000000n })
     *   .build()
     *
     * const result = await client.arbiter.batchClaim(claim.struct)
     * ```
     */
    batchClaim(claim: BatchClaim): Promise<{
        txHash: `0x${string}`;
        claimHash: `0x${string}`;
    }>;
    /**
     * Submit a multichain claim
     *
     * Multichain claims coordinate a single resource claim across multiple chains
     * using hash references to link the claims together.
     *
     * @param claim - The multichain claim struct
     * @returns Object containing transaction hash and computed claim hash
     *
     * @throws {Error} If walletClient is not configured
     * @throws {Error} If contract address is not set
     * @throws {CompactError} If the claim is invalid or processing fails
     *
     * @example
     * ```typescript
     * const claim = client.arbiter.multichainClaimBuilder()
     *   .sponsor('0x...')
     *   .nonce(1n)
     *   .id(lockId)
     *   .allocatedAmount(1000000n)
     *   .lockTag(lockTag)
     *   .addTransfer({ recipient: '0x...', amount: 1000000n })
     *   .addAdditionalChainHash(otherChainHash)
     *   .build()
     *
     * const result = await client.arbiter.multichainClaim(claim.struct)
     * ```
     */
    multichainClaim(claim: MultichainClaim): Promise<{
        txHash: `0x${string}`;
        claimHash: `0x${string}`;
    }>;
    /**
     * Submit a batch multichain claim
     *
     * Batch multichain claims coordinate multiple resource claims across multiple chains
     * using hash references to link the claims together.
     *
     * @param claim - The batch multichain claim struct
     * @returns Object containing transaction hash and computed claim hash
     *
     * @throws {Error} If walletClient is not configured
     * @throws {Error} If contract address is not set
     * @throws {CompactError} If the claim is invalid or processing fails
     *
     * @example
     * ```typescript
     * const claim = client.arbiter.batchMultichainClaimBuilder()
     *   .sponsor('0x...')
     *   .nonce(1n)
     *   .addClaim()
     *     .id(lockId1)
     *     .allocatedAmount(1000000n)
     *     .addPortion(lockTag1, { kind: 'transfer', recipient: '0x...', amount: 1000000n })
     *     .done()
     *   .addAdditionalChainHash(otherChainHash)
     *   .build()
     *
     * const result = await client.arbiter.batchMultichainClaim(claim.struct)
     * ```
     */
    batchMultichainClaim(claim: BatchMultichainClaim): Promise<{
        txHash: `0x${string}`;
        claimHash: `0x${string}`;
    }>;
    /**
     * Get a single claim builder for this chain
     *
     * @returns A SingleClaimBuilder instance configured with this chain's domain
     *
     * @example
     * ```typescript
     * const builder = client.arbiter.singleClaimBuilder()
     * const claim = builder
     *   .sponsor('0x...')
     *   .nonce(1n)
     *   // ... configure claim
     *   .build()
     * ```
     */
    singleClaimBuilder(): import("../builders/claim").SingleClaimBuilder;
    /**
     * Get a batch claim builder for this chain
     *
     * @returns A BatchClaimBuilder instance configured with this chain's domain
     *
     * @example
     * ```typescript
     * const builder = client.arbiter.batchClaimBuilder()
     * const claim = builder
     *   .sponsor('0x...')
     *   .nonce(1n)
     *   .addIdAndAmount(id1, amount1)
     *   .addIdAndAmount(id2, amount2)
     *   // ... configure claim
     *   .build()
     * ```
     */
    batchClaimBuilder(): import("../builders/claim").BatchClaimBuilder;
    /**
     * Get a multichain claim builder for coordinating claims across chains
     *
     * @returns A MultichainClaimBuilder instance configured with this chain's domain
     *
     * @example
     * ```typescript
     * const builder = client.arbiter.multichainClaimBuilder()
     * const claim = builder
     *   .sponsor('0x...')
     *   .nonce(1n)
     *   .id(lockId)
     *   .allocatedAmount(1000000n)
     *   .lockTag(lockTag)
     *   .addTransfer({ recipient: '0x...', amount: 1000000n })
     *   .addAdditionalChainHash(otherChainHash)
     *   .build()
     * ```
     */
    multichainClaimBuilder(): import("../builders/claim").MultichainClaimBuilder;
    /**
     * Get a batch multichain claim builder for coordinating batch claims across chains
     *
     * @returns A BatchMultichainClaimBuilder instance configured with this chain's domain
     *
     * @example
     * ```typescript
     * const builder = client.arbiter.batchMultichainClaimBuilder()
     * const claim = builder
     *   .sponsor('0x...')
     *   .nonce(1n)
     *   .addClaim()
     *     .id(lockId1)
     *     .allocatedAmount(1000000n)
     *     .addPortion(lockTag1, { kind: 'transfer', recipient: '0x...', amount: 1000000n })
     *     .done()
     *   .addAdditionalChainHash(otherChainHash)
     *   .build()
     * ```
     */
    batchMultichainClaimBuilder(): import("../builders/claim").BatchMultichainClaimBuilder;
    /**
     * Submit an exogenous multichain claim
     *
     * Exogenous multichain claims are similar to multichain claims but include explicit
     * chain identification through chainIndex and notarizedChainId fields.
     *
     * @param claim - The exogenous multichain claim struct
     * @returns Object containing transaction hash and computed claim hash
     *
     * @throws {Error} If walletClient is not configured
     * @throws {Error} If contract address is not set
     * @throws {CompactError} If the claim is invalid or processing fails
     */
    exogenousMultichainClaim(claim: ExogenousMultichainClaim): Promise<{
        txHash: `0x${string}`;
        claimHash: `0x${string}`;
    }>;
    /**
     * Submit an exogenous batch multichain claim
     *
     * Exogenous batch multichain claims are similar to batch multichain claims but include
     * explicit chain identification through chainIndex and notarizedChainId fields.
     *
     * @param claim - The exogenous batch multichain claim struct
     * @returns Object containing transaction hash and computed claim hash
     *
     * @throws {Error} If walletClient is not configured
     * @throws {Error} If contract address is not set
     * @throws {CompactError} If the claim is invalid or processing fails
     */
    exogenousBatchMultichainClaim(claim: ExogenousBatchMultichainClaim): Promise<{
        txHash: `0x${string}`;
        claimHash: `0x${string}`;
    }>;
    /**
     * Get an exogenous multichain claim builder
     *
     * @returns An ExogenousMultichainClaimBuilder instance configured with this chain's domain
     *
     * @example
     * ```typescript
     * const builder = client.arbiter.exogenousMultichainClaimBuilder()
     * const claim = builder
     *   .sponsor('0x...')
     *   .nonce(1n)
     *   .chainIndex(0n)
     *   .notarizedChainId(1n)
     *   .id(lockId)
     *   .allocatedAmount(1000000n)
     *   .lockTag(lockTag)
     *   .addTransfer({ recipient: '0x...', amount: 1000000n })
     *   .build()
     * ```
     */
    exogenousMultichainClaimBuilder(): import("../builders/claim").ExogenousMultichainClaimBuilder;
    /**
     * Get an exogenous batch multichain claim builder
     *
     * @returns An ExogenousBatchMultichainClaimBuilder instance configured with this chain's domain
     *
     * @example
     * ```typescript
     * const builder = client.arbiter.exogenousBatchMultichainClaimBuilder()
     * const claim = builder
     *   .sponsor('0x...')
     *   .nonce(1n)
     *   .chainIndex(0n)
     *   .notarizedChainId(1n)
     *   .addClaim()
     *     .id(lockId1)
     *     .allocatedAmount(1000000n)
     *     .addPortion(lockTag1, { kind: 'transfer', recipient: '0x...', amount: 1000000n })
     *     .done()
     *   .build()
     * ```
     */
    exogenousBatchMultichainClaimBuilder(): import("../builders/claim").ExogenousBatchMultichainClaimBuilder;
}
