/**
 * Arbiter client for claim submission operations
 */

import { CompactClientConfig } from './coreClient'
import { theCompactAbi } from '../abi/theCompact'
import { Claim, BatchClaim, MultichainClaim, BatchMultichainClaim } from '../types/claims'
import { ClaimBuilder } from '../builders/claim'
import { createDomain } from '../config/domain'
import { extractCompactError } from '../errors/decode'
import { claimHash, batchClaimHash } from '../encoding/hashes'
import invariant from 'tiny-invariant'

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
export class ArbiterClient {
  constructor(private config: CompactClientConfig) {}

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
  async claim(claim: Claim): Promise<{ txHash: `0x${string}`; claimHash: `0x${string}` }> {
    invariant(this.config.walletClient, 'walletClient is required for claims')
    invariant(this.config.address, 'contract address is required')

    try {
      const hash = await this.config.walletClient.writeContract({
        address: this.config.address,
        abi: theCompactAbi,
        functionName: 'claim',
        args: [claim] as any,
        chain: null,
        account: null,
      })

      // Compute claim hash
      const computedClaimHash = claimHash(claim)

      return { txHash: hash, claimHash: computedClaimHash }
    } catch (error) {
      // Try to extract and throw a more informative error
      const compactError = extractCompactError(error, theCompactAbi)
      if (compactError) {
        throw compactError
      }
      throw error
    }
  }

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
  async batchClaim(claim: BatchClaim): Promise<{ txHash: `0x${string}`; claimHash: `0x${string}` }> {
    invariant(this.config.walletClient, 'walletClient is required for claims')
    invariant(this.config.address, 'contract address is required')

    try {
      const hash = await this.config.walletClient.writeContract({
        address: this.config.address,
        abi: theCompactAbi,
        functionName: 'batchClaim',
        args: [claim] as any,
        chain: null,
        account: null,
      })

      // Compute batch claim hash
      const computedClaimHash = batchClaimHash(claim)

      return { txHash: hash, claimHash: computedClaimHash }
    } catch (error) {
      const compactError = extractCompactError(error, theCompactAbi)
      if (compactError) {
        throw compactError
      }
      throw error
    }
  }

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
  async multichainClaim(claim: MultichainClaim): Promise<{ txHash: `0x${string}`; claimHash: `0x${string}` }> {
    invariant(this.config.walletClient, 'walletClient is required for claims')
    invariant(this.config.address, 'contract address is required')

    try {
      const hash = await this.config.walletClient.writeContract({
        address: this.config.address,
        abi: theCompactAbi,
        functionName: 'multichainClaim',
        args: [claim] as any,
        chain: null,
        account: null,
      })

      // For multichain claims, use the base claim hash
      // (additionalChains are used for coordination but not hashed the same way)
      const computedClaimHash = claimHash({
        allocatorData: claim.allocatorData,
        sponsorSignature: claim.sponsorSignature,
        sponsor: claim.sponsor,
        nonce: claim.nonce,
        expires: claim.expires,
        witness: claim.witness,
        witnessTypestring: claim.witnessTypestring,
        id: claim.id,
        allocatedAmount: claim.allocatedAmount,
        claimants: claim.claimants,
      })

      return { txHash: hash, claimHash: computedClaimHash }
    } catch (error) {
      const compactError = extractCompactError(error, theCompactAbi)
      if (compactError) {
        throw compactError
      }
      throw error
    }
  }

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
  async batchMultichainClaim(claim: BatchMultichainClaim): Promise<{ txHash: `0x${string}`; claimHash: `0x${string}` }> {
    invariant(this.config.walletClient, 'walletClient is required for claims')
    invariant(this.config.address, 'contract address is required')

    try {
      const hash = await this.config.walletClient.writeContract({
        address: this.config.address,
        abi: theCompactAbi,
        functionName: 'batchMultichainClaim',
        args: [claim] as any,
        chain: null,
        account: null,
      })

      // For batch multichain claims, convert to batch claim format for hashing
      const idsAndAmounts = claim.claims.map((c) => ({
        id: c.id,
        amount: c.allocatedAmount,
      }))
      const claimants = claim.claims.flatMap((c) => c.portions)

      const computedClaimHash = batchClaimHash({
        allocatorData: claim.allocatorData,
        sponsorSignature: claim.sponsorSignature,
        sponsor: claim.sponsor,
        nonce: claim.nonce,
        expires: claim.expires,
        witness: claim.witness,
        witnessTypestring: claim.witnessTypestring,
        idsAndAmounts,
        claimants,
      })

      return { txHash: hash, claimHash: computedClaimHash }
    } catch (error) {
      const compactError = extractCompactError(error, theCompactAbi)
      if (compactError) {
        throw compactError
      }
      throw error
    }
  }

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
  singleClaimBuilder() {
    invariant(this.config.address, 'contract address is required')
    const domain = createDomain({
      chainId: this.config.chainId,
      contractAddress: this.config.address,
    })
    return ClaimBuilder.single(domain)
  }

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
  batchClaimBuilder() {
    invariant(this.config.address, 'contract address is required')
    const domain = createDomain({
      chainId: this.config.chainId,
      contractAddress: this.config.address,
    })
    return ClaimBuilder.batch(domain)
  }

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
  multichainClaimBuilder() {
    invariant(this.config.address, 'contract address is required')
    const domain = createDomain({
      chainId: this.config.chainId,
      contractAddress: this.config.address,
    })
    return ClaimBuilder.multichain(domain)
  }

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
  batchMultichainClaimBuilder() {
    invariant(this.config.address, 'contract address is required')
    const domain = createDomain({
      chainId: this.config.chainId,
      contractAddress: this.config.address,
    })
    return ClaimBuilder.batchMultichain(domain)
  }
}
