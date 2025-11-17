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
 * Forced withdrawal status for a lock
 */
export interface ForcedWithdrawalStatus {
  enabled: boolean
  withdrawableAt: bigint
}

/**
 * Client for view operations (read-only queries)
 *
 * The view client provides read-only access to The Compact protocol state.
 * All methods are gas-free queries that don't modify blockchain state.
 *
 * Key capabilities:
 * - Query lock details and balances
 * - Check claim registration status
 * - Query forced withdrawal status
 * - Check allocator nonce consumption
 * - Retrieve domain separator for EIP-712 signing
 *
 * @example
 * ```typescript
 * // Query lock details
 * const details = await client.view.getLockDetails(lockId)
 * console.log('Token:', details.token)
 * console.log('Allocator:', details.allocator)
 *
 * // Check balance
 * const balance = await client.view.balanceOf({
 *   account: userAddress,
 *   id: lockId
 * })
 * console.log('Balance:', balance)
 *
 * // Check if claim is registered
 * const isRegistered = await client.view.isRegistered({
 *   sponsor: sponsorAddress,
 *   claimHash: hash,
 *   typehash: typeHash
 * })
 * ```
 *
 * @see SponsorClient for deposit and compact creation operations
 * @see ArbiterClient for claim submission operations
 */
export class ViewClient {
  constructor(private config: CompactClientConfig) {}

  /**
   * Get lock details for a given lock ID
   *
   * Retrieves comprehensive information about a resource lock, including the underlying
   * token, allocator address, reset period, scope, and lock tag.
   *
   * @param id - The lock ID to query
   * @returns Lock details including token, allocator, reset period, scope, and lock tag
   *
   * @throws {Error} If contract address is not set
   * @throws {Error} If the lock ID doesn't exist
   *
   * @example
   * ```typescript
   * const details = await client.view.getLockDetails(lockId)
   *
   * console.log('Underlying token:', details.token)
   * console.log('Allocator:', details.allocator)
   * console.log('Reset period:', details.resetPeriod) // 0 = None, 1 = TenMinutes, etc.
   * console.log('Scope:', details.scope) // 0 = Multichain, 1 = ChainSpecific
   * console.log('Lock tag:', details.lockTag)
   * ```
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
   * Check if a claim is registered for a sponsor
   *
   * Verifies whether a specific claim hash has been registered by a sponsor,
   * allowing it to be used with the sponsor's nonce for claim submission.
   *
   * @param params - Registration query parameters
   * @param params.sponsor - The sponsor address that registered the claim
   * @param params.claimHash - Hash of the claim to check
   * @param params.typehash - EIP-712 typehash of the claim structure
   * @returns True if the claim is registered, false otherwise
   *
   * @throws {Error} If contract address is not set
   *
   * @example
   * ```typescript
   * const claim = client.arbiter.singleClaimBuilder()
   *   .sponsor(sponsorAddress)
   *   // ... build claim
   *   .build()
   *
   * const isRegistered = await client.view.isRegistered({
   *   sponsor: sponsorAddress,
   *   claimHash: claim.hash,
   *   typehash: getClaimTypehash()
   * })
   *
   * if (isRegistered) {
   *   console.log('Claim is pre-registered, can use sponsor nonce')
   * }
   * ```
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
   *
   * Returns the ERC6909 token balance (locked resource amount) for a given
   * account and lock ID.
   *
   * @param params - Balance query parameters
   * @param params.account - The account address to check
   * @param params.id - The lock ID to query
   * @returns The account's balance for the specified lock
   *
   * @throws {Error} If contract address is not set
   *
   * @example
   * ```typescript
   * const balance = await client.view.balanceOf({
   *   account: sponsorAddress,
   *   id: lockId
   * })
   *
   * console.log('Locked amount:', balance)
   * ```
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
   * Get balances for multiple accounts and lock IDs in a single call
   *
   * Batch version of balanceOf that returns balances for multiple account/id pairs.
   * More efficient than making multiple individual balanceOf calls.
   *
   * @param params - Batch balance query parameters
   * @param params.accounts - Array of account addresses to check
   * @param params.ids - Array of lock IDs to query (must match accounts length)
   * @returns Array of balances corresponding to each account/id pair
   *
   * @throws {Error} If contract address is not set
   * @throws {Error} If accounts and ids arrays have different lengths
   *
   * @example
   * ```typescript
   * const balances = await client.view.balanceOfBatch({
   *   accounts: [user1, user2, user3],
   *   ids: [lockId1, lockId2, lockId3]
   * })
   *
   * balances.forEach((balance, i) => {
   *   console.log(`Account ${i} balance: ${balance}`)
   * })
   * ```
   */
  async balanceOfBatch(params: {
    accounts: `0x${string}`[]
    ids: bigint[]
  }): Promise<bigint[]> {
    invariant(this.config.address, 'contract address is required')
    invariant(params.accounts.length === params.ids.length, 'accounts and ids must have the same length')

    const result = await (this.config.publicClient as any).readContract({
      address: this.config.address,
      abi: theCompactAbi,
      functionName: 'balanceOfBatch',
      args: [params.accounts, params.ids],
    })

    return result as bigint[]
  }

  /**
   * Check if a specific nonce has been consumed by an allocator
   *
   * Allocators use nonces to prevent replay attacks on claims. This method checks
   * whether a specific nonce has already been consumed.
   *
   * @param params - Nonce query parameters
   * @param params.allocator - The allocator address to check
   * @param params.nonce - The nonce value to check
   * @returns True if the nonce has been consumed, false otherwise
   *
   * @throws {Error} If contract address is not set
   *
   * @example
   * ```typescript
   * const consumed = await client.view.hasConsumedAllocatorNonce({
   *   allocator: allocatorAddress,
   *   nonce: 42n
   * })
   *
   * if (consumed) {
   *   console.log('Nonce already used, cannot reuse')
   * } else {
   *   console.log('Nonce available for use')
   * }
   * ```
   */
  async hasConsumedAllocatorNonce(params: {
    allocator: `0x${string}`
    nonce: bigint
  }): Promise<boolean> {
    invariant(this.config.address, 'contract address is required')

    const result = await (this.config.publicClient as any).readContract({
      address: this.config.address,
      abi: theCompactAbi,
      functionName: 'hasConsumedAllocatorNonce',
      args: [params.allocator, params.nonce],
    })

    return result as boolean
  }

  /**
   * Get the current registered nonce for a sponsor/claimHash/typehash combination
   *
   * Returns the nonce value that was registered for a specific claim. This is used
   * to track which nonce a sponsor pre-approved for a particular claim.
   *
   * @param params - Registered nonce query parameters
   * @param params.sponsor - The sponsor address
   * @param params.claimHash - Hash of the registered claim
   * @param params.typehash - EIP-712 typehash of the claim structure
   * @returns The registered nonce value, or 0 if not registered
   *
   * @throws {Error} If contract address is not set
   *
   * @example
   * ```typescript
   * const nonce = await client.view.getRegisteredNonce({
   *   sponsor: sponsorAddress,
   *   claimHash: claim.hash,
   *   typehash: getClaimTypehash()
   * })
   *
   * if (nonce > 0n) {
   *   console.log('Registered with nonce:', nonce)
   * } else {
   *   console.log('Not registered')
   * }
   * ```
   */
  async getRegisteredNonce(params: {
    sponsor: `0x${string}`
    claimHash: `0x${string}`
    typehash: `0x${string}`
  }): Promise<bigint> {
    invariant(this.config.address, 'contract address is required')

    const result = await (this.config.publicClient as any).readContract({
      address: this.config.address,
      abi: theCompactAbi,
      functionName: 'getRegisteredNonce',
      args: [params.sponsor, params.claimHash, params.typehash],
    })

    return result as bigint
  }

  /**
   * Get forced withdrawal status for a resource lock
   *
   * Returns whether forced withdrawal is enabled for a lock and when it becomes
   * withdrawable. Forced withdrawals are safety mechanisms allowing lock holders
   * to reclaim funds if allocators become unresponsive.
   *
   * @param id - The lock ID to query
   * @returns Object containing enabled status and withdrawableAt timestamp
   *
   * @throws {Error} If contract address is not set
   *
   * @example
   * ```typescript
   * const status = await client.view.getForcedWithdrawalStatus(lockId)
   *
   * if (status.enabled) {
   *   const now = BigInt(Math.floor(Date.now() / 1000))
   *   if (now >= status.withdrawableAt) {
   *     console.log('Can withdraw now!')
   *   } else {
   *     const remainingSeconds = status.withdrawableAt - now
   *     console.log(`Can withdraw in ${remainingSeconds} seconds`)
   *   }
   * } else {
   *   console.log('Forced withdrawal not enabled')
   * }
   * ```
   */
  async getForcedWithdrawalStatus(id: bigint): Promise<ForcedWithdrawalStatus> {
    invariant(this.config.address, 'contract address is required')

    const result = await (this.config.publicClient as any).readContract({
      address: this.config.address,
      abi: theCompactAbi,
      functionName: 'getForcedWithdrawalStatus',
      args: [id],
    })

    // Assuming the contract returns [enabled, withdrawableAt]
    const [enabled, withdrawableAt] = result as unknown as [boolean, bigint]

    return {
      enabled,
      withdrawableAt,
    }
  }

  /**
   * Get the EIP-712 domain separator from the contract
   *
   * Returns the domain separator used for EIP-712 structured data signing.
   * This value is used to bind signatures to this specific contract and chain.
   *
   * @returns The 32-byte domain separator hash
   *
   * @throws {Error} If contract address is not set
   *
   * @example
   * ```typescript
   * const domainSeparator = await client.view.getDomainSeparator()
   * console.log('Domain separator:', domainSeparator)
   *
   * // Can be used to verify signatures match this contract
   * ```
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
