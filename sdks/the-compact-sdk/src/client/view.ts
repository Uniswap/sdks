/**
 * View client for read-only operations
 */

import invariant from 'tiny-invariant'
import { Address, Hex } from 'viem'

import { theCompactAbi } from '../abi/theCompact'
import { Scope, ResetPeriod } from '../types/runtime'

import { CompactClientConfig } from './coreClient'

/**
 * Lock details returned from the contract
 */
export interface LockDetails {
  token: Address
  allocator: Address
  resetPeriod: ResetPeriod
  scope: Scope
  lockTag: Hex
}

/**
 * Emissary status enum values (matches contract `EmissaryStatus`)
 */
export enum EmissaryStatusEnum {
  Disabled = 0,
  Pending = 1,
  Enabled = 2,
}

export interface EmissaryStatus {
  status: EmissaryStatusEnum
  emissaryAssignmentAvailableAt: bigint
  currentEmissary: Address
}

/**
 * Forced withdrawal status enum values
 */
export enum ForcedWithdrawalStatusEnum {
  Disabled = 0,
  Pending = 1,
  Enabled = 2,
}

/**
 * Forced withdrawal status for a lock
 */
export interface ForcedWithdrawalStatus {
  status: ForcedWithdrawalStatusEnum
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

    const result = await this.config.publicClient.readContract({
      address: this.config.address,
      abi: theCompactAbi,
      functionName: 'getLockDetails',
      args: [id],
    })

    // Viem returns a tuple matching the contract's return values
    const [token, allocator, resetPeriod, scope, lockTag] = result

    return {
      token,
      allocator,
      resetPeriod,
      scope,
      lockTag,
    }
  }

  /**
   * Get the current emissary status for a sponsor + lockTag pair.
   */
  async getEmissaryStatus(sponsor: Address, lockTag: Hex): Promise<EmissaryStatus> {
    invariant(this.config.address, 'contract address is required')

    const result = await this.config.publicClient.readContract({
      address: this.config.address,
      abi: theCompactAbi,
      functionName: 'getEmissaryStatus',
      args: [sponsor, lockTag],
    })

    const [status, emissaryAssignmentAvailableAt, currentEmissary] = result

    return {
      status,
      emissaryAssignmentAvailableAt,
      currentEmissary,
    }
  }

  /**
   * Get the allowance (ERC-6909) for an owner/spender pair and lock id.
   */
  async allowance(params: { owner: Address; spender: Address; id: bigint }): Promise<bigint> {
    invariant(this.config.address, 'contract address is required')

    const result = await this.config.publicClient.readContract({
      address: this.config.address,
      abi: theCompactAbi,
      functionName: 'allowance',
      args: [params.owner, params.spender, params.id],
    })

    return result
  }

  /**
   * Check whether `operator` is an operator for `owner` (ERC-6909 operator approvals).
   */
  async isOperator(params: { owner: Address; operator: Address }): Promise<boolean> {
    invariant(this.config.address, 'contract address is required')

    const result = await this.config.publicClient.readContract({
      address: this.config.address,
      abi: theCompactAbi,
      functionName: 'isOperator',
      args: [params.owner, params.operator],
    })

    return result
  }

  /**
   * Read the required withdrawal fallback stipends from the contract.
   */
  async getRequiredWithdrawalFallbackStipends(): Promise<{ nativeTokenStipend: bigint; erc20TokenStipend: bigint }> {
    invariant(this.config.address, 'contract address is required')

    const result = await this.config.publicClient.readContract({
      address: this.config.address,
      abi: theCompactAbi,
      functionName: 'getRequiredWithdrawalFallbackStipends',
    })

    const [nativeTokenStipend, erc20TokenStipend] = result
    return { nativeTokenStipend, erc20TokenStipend }
  }

  /**
   * Get token metadata for a specific ERC-6909 id.
   */
  async name(id: bigint): Promise<string> {
    invariant(this.config.address, 'contract address is required')

    return await this.config.publicClient.readContract({
      address: this.config.address,
      abi: theCompactAbi,
      functionName: 'name',
      args: [id],
    })
  }

  async symbol(id: bigint): Promise<string> {
    invariant(this.config.address, 'contract address is required')

    return await this.config.publicClient.readContract({
      address: this.config.address,
      abi: theCompactAbi,
      functionName: 'symbol',
      args: [id],
    })
  }

  async decimals(id: bigint): Promise<number> {
    invariant(this.config.address, 'contract address is required')

    return await this.config.publicClient.readContract({
      address: this.config.address,
      abi: theCompactAbi,
      functionName: 'decimals',
      args: [id],
    })
  }

  async tokenURI(id: bigint): Promise<string> {
    invariant(this.config.address, 'contract address is required')

    return await this.config.publicClient.readContract({
      address: this.config.address,
      abi: theCompactAbi,
      functionName: 'tokenURI',
      args: [id],
    })
  }

  async supportsInterface(interfaceId: Hex): Promise<boolean> {
    invariant(this.config.address, 'contract address is required')

    return await this.config.publicClient.readContract({
      address: this.config.address,
      abi: theCompactAbi,
      functionName: 'supportsInterface',
      args: [interfaceId],
    })
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
  async isRegistered(params: { sponsor: Address; claimHash: Hex; typehash: Hex }): Promise<boolean> {
    invariant(this.config.address, 'contract address is required')

    const result = await this.config.publicClient.readContract({
      address: this.config.address,
      abi: theCompactAbi,
      functionName: 'isRegistered',
      args: [params.sponsor, params.claimHash, params.typehash],
    })

    return result
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
  async balanceOf(params: { account: Address; id: bigint }): Promise<bigint> {
    invariant(this.config.address, 'contract address is required')

    const result = await this.config.publicClient.readContract({
      address: this.config.address,
      abi: theCompactAbi,
      functionName: 'balanceOf',
      args: [params.account, params.id],
    })

    return result
  }

  /**
   * Check if a specific nonce has been consumed by an allocator
   *
   * Allocators use nonces to prevent replay attacks on claims. This method checks
   * whether a specific nonce has already been consumed.
   *
   * @param params - Nonce query parameters
   * @param params.nonce - The nonce value to check
   * @param params.allocator - The allocator address to check
   * @returns True if the nonce has been consumed, false otherwise
   *
   * @throws {Error} If contract address is not set
   *
   * @example
   * ```typescript
   * const consumed = await client.view.hasConsumedAllocatorNonce({
   *   nonce: 42n,
   *   allocator: allocatorAddress
   * })
   *
   * if (consumed) {
   *   console.log('Nonce already used, cannot reuse')
   * } else {
   *   console.log('Nonce available for use')
   * }
   * ```
   */
  async hasConsumedAllocatorNonce(params: { nonce: bigint; allocator: Address }): Promise<boolean> {
    invariant(this.config.address, 'contract address is required')

    const result = await this.config.publicClient.readContract({
      address: this.config.address,
      abi: theCompactAbi,
      functionName: 'hasConsumedAllocatorNonce',
      args: [params.nonce, params.allocator],
    })

    return result
  }

  /**
   * Get forced withdrawal status for a resource lock
   *
   * Returns the forced withdrawal status and when it becomes withdrawable.
   * Forced withdrawals are safety mechanisms allowing lock holders to reclaim
   * funds if allocators become unresponsive.
   *
   * @param account - The account address to check
   * @param id - The lock ID to query
   * @returns Object containing status enum (Disabled/Pending/Enabled) and withdrawableAt timestamp
   *
   * @throws {Error} If contract address is not set
   *
   * @example
   * ```typescript
   * const status = await client.view.getForcedWithdrawalStatus(accountAddress, lockId)
   *
   * if (status.status === ForcedWithdrawalStatusEnum.Enabled) {
   *   const now = BigInt(Math.floor(Date.now() / 1000))
   *   if (now >= status.withdrawableAt) {
   *     console.log('Can withdraw now!')
   *   } else {
   *     const remainingSeconds = status.withdrawableAt - now
   *     console.log(`Can withdraw in ${remainingSeconds} seconds`)
   *   }
   * } else if (status.status === ForcedWithdrawalStatusEnum.Pending) {
   *   console.log('Forced withdrawal pending')
   * } else {
   *   console.log('Forced withdrawal disabled')
   * }
   * ```
   */
  async getForcedWithdrawalStatus(account: Address, id: bigint): Promise<ForcedWithdrawalStatus> {
    invariant(this.config.address, 'contract address is required')

    const result = await this.config.publicClient.readContract({
      address: this.config.address,
      abi: theCompactAbi,
      functionName: 'getForcedWithdrawalStatus',
      args: [account, id],
    })

    // Viem returns a tuple matching the contract's return values [status enum, withdrawableAt]
    const [status, withdrawableAt] = result

    return {
      status,
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
  async getDomainSeparator(): Promise<Hex> {
    invariant(this.config.address, 'contract address is required')

    const result = await this.config.publicClient.readContract({
      address: this.config.address,
      abi: theCompactAbi,
      functionName: 'DOMAIN_SEPARATOR',
    })

    return result
  }

  /**
   * Read arbitrary storage slots using `extsload` (EIP-2330 style).
   */
  async extsload(slot: Hex): Promise<Hex> {
    invariant(this.config.address, 'contract address is required')

    return await this.config.publicClient.readContract({
      address: this.config.address,
      abi: theCompactAbi,
      functionName: 'extsload',
      args: [slot],
    })
  }

  async extsloadMany(slots: readonly Hex[]): Promise<Hex[]> {
    invariant(this.config.address, 'contract address is required')

    return (await this.config.publicClient.readContract({
      address: this.config.address,
      abi: theCompactAbi,
      functionName: 'extsload',
      args: [slots as any],
    })) as Hex[]
  }

  /**
   * Read a transient storage slot (EIP-1153).
   */
  async exttload(slot: Hex): Promise<Hex> {
    invariant(this.config.address, 'contract address is required')

    return await this.config.publicClient.readContract({
      address: this.config.address,
      abi: theCompactAbi,
      functionName: 'exttload',
      args: [slot],
    })
  }
}
