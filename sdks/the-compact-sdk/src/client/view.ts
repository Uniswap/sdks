/**
 * View client for read-only operations
 */

import { CompactClientConfig } from './coreClient'
import { theCompactAbi } from '../abi/theCompact'
import { Scope, ResetPeriod } from '../types/runtime'
import invariant from 'tiny-invariant'

/**
 * Lock details returned from the contract
 */
export interface LockDetails {
  token: `0x${string}`
  allocator: `0x${string}`
  resetPeriod: ResetPeriod
  scope: Scope
  lockTag: `0x${string}`
}

/**
 * Client for view operations (read-only queries)
 */
export class ViewClient {
  constructor(private config: CompactClientConfig) {}

  /**
   * Get lock details for a given lock ID
   */
  async getLockDetails(id: bigint): Promise<LockDetails> {
    invariant(this.config.address, 'contract address is required')

    const result = await (this.config.publicClient as any).readContract({
      address: this.config.address,
      abi: theCompactAbi,
      functionName: 'getLockDetails',
      args: [id],
    })

    // Parse result (assuming it returns [token, allocator, resetPeriod, scope])
    const [token, allocator, resetPeriod, scope] = result as unknown as [`0x${string}`, `0x${string}`, number, number]

    // Compute lockTag from id (upper 96 bits)
    const lockTag = (id >> 160n).toString(16).padStart(24, '0')

    return {
      token,
      allocator,
      resetPeriod: resetPeriod as ResetPeriod,
      scope: scope as Scope,
      lockTag: `0x${lockTag}` as `0x${string}`,
    }
  }

  /**
   * Check if a claim is registered
   */
  async isRegistered(params: {
    sponsor: `0x${string}`
    claimHash: `0x${string}`
    typehash: `0x${string}`
  }): Promise<boolean> {
    invariant(this.config.address, 'contract address is required')

    const result = await (this.config.publicClient as any).readContract({
      address: this.config.address,
      abi: theCompactAbi,
      functionName: 'isRegistered',
      args: [params.sponsor, params.claimHash, params.typehash],
    })

    return result as boolean
  }

  /**
   * Get the balance of an account for a specific lock ID
   */
  async balanceOf(params: { account: `0x${string}`; id: bigint }): Promise<bigint> {
    invariant(this.config.address, 'contract address is required')

    const result = await (this.config.publicClient as any).readContract({
      address: this.config.address,
      abi: theCompactAbi,
      functionName: 'balanceOf',
      args: [params.account, params.id],
    })

    return result as bigint
  }

  /**
   * Get the domain separator from the contract
   */
  async getDomainSeparator(): Promise<`0x${string}`> {
    invariant(this.config.address, 'contract address is required')

    const result = await (this.config.publicClient as any).readContract({
      address: this.config.address,
      abi: theCompactAbi,
      functionName: 'DOMAIN_SEPARATOR',
    })

    return result as `0x${string}`
  }
}
