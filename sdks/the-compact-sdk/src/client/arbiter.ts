/**
 * Arbiter client for claim submission operations
 */

import { CompactClientConfig } from './coreClient'
import { theCompactAbi } from '../abi/theCompact'
import { Claim, BatchClaim } from '../types/claims'
import { ClaimBuilder } from '../builders/claim'
import { createDomain } from '../config/domain'
import { extractCompactError } from '../errors/decode'
import invariant from 'tiny-invariant'

/**
 * Client for arbiter operations (claim submissions)
 */
export class ArbiterClient {
  constructor(private config: CompactClientConfig) {}

  /**
   * Submit a claim
   */
  async claim(claim: Claim): Promise<{ txHash: `0x${string}`; claimHash: `0x${string}` }> {
    invariant(this.config.walletClient, 'walletClient is required for claims')
    invariant(this.config.address, 'contract address is required')

    try {
      const hash = await (this.config.walletClient as any).writeContract({
        address: this.config.address,
        abi: theCompactAbi,
        functionName: 'claim',
        args: [claim] as any,
        chain: null,
        account: null,
      })

      // Compute claim hash (simplified)
      const claimHash = '0x0000000000000000000000000000000000000000000000000000000000000000' as `0x${string}`

      return { txHash: hash, claimHash }
    } catch (error) {
      // Try to extract and throw a more informative error
      const compactError = extractCompactError(error, theCompactAbi as any)
      if (compactError) {
        throw compactError
      }
      throw error
    }
  }

  /**
   * Submit a batch claim
   */
  async batchClaim(claim: BatchClaim): Promise<{ txHash: `0x${string}`; claimHash: `0x${string}` }> {
    invariant(this.config.walletClient, 'walletClient is required for claims')
    invariant(this.config.address, 'contract address is required')

    try {
      const hash = await (this.config.walletClient as any).writeContract({
        address: this.config.address,
        abi: theCompactAbi,
        functionName: 'batchClaim',
        args: [claim] as any,
        chain: null,
        account: null,
      })

      const claimHash = '0x0000000000000000000000000000000000000000000000000000000000000000' as `0x${string}`

      return { txHash: hash, claimHash }
    } catch (error) {
      const compactError = extractCompactError(error, theCompactAbi as any)
      if (compactError) {
        throw compactError
      }
      throw error
    }
  }

  /**
   * Get a claim builder for this chain
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
   */
  batchClaimBuilder() {
    invariant(this.config.address, 'contract address is required')
    const domain = createDomain({
      chainId: this.config.chainId,
      contractAddress: this.config.address,
    })
    return ClaimBuilder.batch(domain)
  }
}
