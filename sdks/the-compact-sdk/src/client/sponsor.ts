/**
 * Sponsor client for deposit and registration operations
 */

import invariant from 'tiny-invariant'
import { Account, Address, decodeEventLog, Hex } from 'viem'

import { theCompactAbi } from '../abi/theCompact'
import { CompactBuilder } from '../builders/compact'
import { createDomain } from '../config/domain'
import { extractCompactError } from '../errors/decode'

import { CompactClientConfig } from './coreClient'

/**
 * Client for sponsor operations (deposits, registrations, compact creation)
 *
 * The sponsor client handles operations performed by resource sponsors:
 * - Depositing tokens to create resource locks
 * - Registering claim hashes for nonce management
 * - Managing forced withdrawals
 * - Creating compacts (intents to transfer locked resources)
 *
 * @example
 * ```typescript
 * // Deposit ETH and create a resource lock
 * const result = await client.sponsor.depositNative({
 *   lockTag: lockTag,
 *   recipient: sponsorAddress,
 *   value: parseEther('1.0')
 * })
 * console.log('Lock ID:', result.id)
 *
 * // Create a compact to allow arbiter to claim the lock
 * const compact = client.sponsor.compact()
 *   .arbiter(arbiterAddress)
 *   .sponsor(sponsorAddress)
 *   .nonce(1n)
 *   .expires(BigInt(Date.now() + 3600000))
 *   .lockTag(lockTag)
 *   .token(tokenAddress)
 *   .amount(amount)
 *   .build()
 * ```
 *
 * @see ArbiterClient for submitting claims against compacts
 * @see ViewClient for querying lock status
 */
export class SponsorClient {
  constructor(private config: CompactClientConfig) {}

  /**
   * Deposit native tokens (ETH) and create a resource lock
   *
   * Deposits the specified amount of native tokens and creates a new resource lock
   * identified by the lock tag. The deposited tokens are minted as ERC6909 tokens
   * to the recipient address.
   *
   * @param params - Deposit parameters
   * @param params.lockTag - The lock tag identifying the resource type and allocator
   * @param params.recipient - Address to receive the minted lock tokens
   * @param params.value - Amount of native tokens to deposit (in wei)
   * @returns Object containing transaction hash and the created lock ID
   *
   * @throws {Error} If walletClient is not configured
   * @throws {Error} If contract address is not set
   * @throws {CompactError} If the deposit fails
   *
   * @example
   * ```typescript
   * import { parseEther } from 'viem'
   *
   * const result = await client.sponsor.depositNative({
   *   lockTag: '0x000000000000000000000001',
   *   recipient: '0x...',
   *   value: parseEther('1.0')
   * })
   *
   * console.log('Transaction:', result.txHash)
   * console.log('Lock ID:', result.id)
   * ```
   */
  async depositNative(params: {
    lockTag: Hex
    recipient: Address
    value: bigint
  }): Promise<{ txHash: Hex; id: bigint }> {
    invariant(this.config.walletClient, 'walletClient is required for deposits')
    invariant(this.config.address, 'contract address is required')

    try {
      const hash = await this.config.walletClient.writeContract({
        address: this.config.address,
        abi: theCompactAbi,
        functionName: 'depositNative',
        args: [params.lockTag, params.recipient],
        value: params.value,
        chain: null,
        account: this.config.walletClient.account as Account,
      })

      // Wait for transaction and extract id from Transfer event
      const receipt = await this.config.publicClient.waitForTransactionReceipt({ hash })

      // Find the Transfer event where tokens were minted (from address(0) to recipient)
      let id = 0n
      for (const log of receipt.logs) {
        try {
          const decoded = decodeEventLog({
            abi: theCompactAbi,
            data: log.data,
            topics: log.topics,
          })

          if (decoded.eventName === 'Transfer' && decoded.args.from === '0x0000000000000000000000000000000000000000') {
            // Type guard ensures decoded.args has Transfer event shape
            id = decoded.args.id
            break
          }
        } catch (e) {
          // Not a Transfer event or couldn't decode, skip
          continue
        }
      }

      return { txHash: hash, id }
    } catch (error) {
      const compactError = extractCompactError(error, theCompactAbi)
      if (compactError) {
        throw compactError
      }
      throw error
    }
  }

  /**
   * Deposit ERC20 tokens and create a resource lock
   *
   * Deposits the specified amount of ERC20 tokens and creates a new resource lock
   * identified by the lock tag. The deposited tokens are minted as ERC6909 tokens
   * to the recipient address.
   *
   * **Note**: You must approve the Compact contract to spend your tokens before calling this method.
   *
   * @param params - Deposit parameters
   * @param params.token - Address of the ERC20 token to deposit
   * @param params.lockTag - The lock tag identifying the resource type and allocator
   * @param params.amount - Amount of tokens to deposit
   * @param params.recipient - Address to receive the minted lock tokens
   * @returns Object containing transaction hash and the created lock ID
   *
   * @throws {Error} If walletClient is not configured
   * @throws {Error} If contract address is not set
   * @throws {CompactError} If the deposit fails (e.g., insufficient allowance)
   *
   * @example
   * ```typescript
   * // First approve the Compact contract
   * await tokenContract.write.approve([compactAddress, amount])
   *
   * // Then deposit
   * const result = await client.sponsor.depositERC20({
   *   token: usdcAddress,
   *   lockTag: '0x000000000000000000000001',
   *   amount: 1000000n, // 1 USDC (6 decimals)
   *   recipient: sponsorAddress
   * })
   *
   * console.log('Lock ID:', result.id)
   * ```
   */
  async depositERC20(params: {
    token: Address
    lockTag: Hex
    amount: bigint
    recipient: Address
  }): Promise<{ txHash: Hex; id: bigint }> {
    invariant(this.config.walletClient, 'walletClient is required for deposits')
    invariant(this.config.address, 'contract address is required')

    try {
      const hash = await this.config.walletClient.writeContract({
        address: this.config.address,
        abi: theCompactAbi,
        functionName: 'depositERC20',
        args: [params.token, params.lockTag, params.amount, params.recipient],
        chain: null,
        account: this.config.walletClient.account as Account,
      })

      // Wait for transaction and extract id from Transfer event
      const receipt = await this.config.publicClient.waitForTransactionReceipt({ hash })

      // Find the Transfer event where tokens were minted (from address(0) to recipient)
      let id = 0n
      for (const log of receipt.logs) {
        try {
          const decoded = decodeEventLog({
            abi: theCompactAbi,
            data: log.data,
            topics: log.topics,
          })

          if (decoded.eventName === 'Transfer' && decoded.args.from === '0x0000000000000000000000000000000000000000') {
            // Type guard ensures decoded.args has Transfer event shape
            id = decoded.args.id
            break
          }
        } catch (e) {
          // Not a Transfer event or couldn't decode, skip
          continue
        }
      }

      return { txHash: hash, id }
    } catch (error) {
      const compactError = extractCompactError(error, theCompactAbi)
      if (compactError) {
        throw compactError
      }
      throw error
    }
  }

  /**
   * Register a claim hash with a specific nonce
   *
   * Registers a claim hash so it can be used with the sponsor's nonce for claim submission.
   * This allows sponsors to pre-approve specific claims before they are submitted by arbiters.
   *
   * @param params - Registration parameters
   * @param params.claimHash - Hash of the claim to register
   * @param params.typehash - EIP-712 typehash of the claim structure
   * @returns Transaction hash
   *
   * @throws {Error} If walletClient is not configured
   * @throws {Error} If contract address is not set
   * @throws {CompactError} If registration fails
   *
   * @example
   * ```typescript
   * const claim = client.arbiter.singleClaimBuilder()
   *   .sponsor(sponsorAddress)
   *   // ... build claim
   *   .build()
   *
   * const txHash = await client.sponsor.register({
   *   claimHash: claim.hash,
   *   typehash: getClaimTypehash()
   * })
   *
   * console.log('Registered claim:', txHash)
   * ```
   */
  async register(params: { claimHash: Hex; typehash: Hex }): Promise<Hex> {
    invariant(this.config.walletClient, 'walletClient is required for registration')
    invariant(this.config.address, 'contract address is required')

    try {
      const hash = await this.config.walletClient.writeContract({
        address: this.config.address,
        abi: theCompactAbi,
        functionName: 'register',
        args: [params.claimHash, params.typehash],
        chain: null,
        account: this.config.walletClient.account as Account,
      })

      return hash
    } catch (error) {
      const compactError = extractCompactError(error, theCompactAbi)
      if (compactError) {
        throw compactError
      }
      throw error
    }
  }

  /**
   * Enable forced withdrawal for a resource lock
   *
   * Enables forced withdrawal mode for a lock, starting a time-delay period after which
   * the lock holder can forcibly withdraw the underlying tokens. This is a safety mechanism
   * if the allocator becomes unresponsive.
   *
   * @param id - The lock ID to enable forced withdrawal for
   * @returns Object containing transaction hash and the timestamp when withdrawal becomes available
   *
   * @throws {Error} If walletClient is not configured
   * @throws {Error} If contract address is not set
   * @throws {CompactError} If enabling forced withdrawal fails
   *
   * @example
   * ```typescript
   * const result = await client.sponsor.enableForcedWithdrawal(lockId)
   *
   * console.log('Forced withdrawal enabled')
   * console.log('Withdrawable at:', new Date(Number(result.withdrawableAt) * 1000))
   *
   * // Wait for the delay period, then call forcedWithdrawal()
   * ```
   */
  async enableForcedWithdrawal(id: bigint): Promise<{ txHash: Hex; withdrawableAt: bigint }> {
    invariant(this.config.walletClient, 'walletClient is required')
    invariant(this.config.address, 'contract address is required')

    try {
      const hash = await this.config.walletClient.writeContract({
        address: this.config.address,
        abi: theCompactAbi,
        functionName: 'enableForcedWithdrawal',
        args: [id],
        chain: null,
        account: this.config.walletClient.account as Account,
      })

      // Wait for transaction to get the actual withdrawable time
      const receipt = await this.config.publicClient.waitForTransactionReceipt({ hash })

      // Extract withdrawableAt from ForcedWithdrawalStatusUpdated event
      let withdrawableAt = 0n
      for (const log of receipt.logs) {
        try {
          const decoded = decodeEventLog({
            abi: theCompactAbi,
            data: log.data,
            topics: log.topics,
          })

          if (decoded.eventName === 'ForcedWithdrawalStatusUpdated' && decoded.args.activating === true) {
            // Type guard ensures decoded.args has ForcedWithdrawalStatusUpdated event shape
            withdrawableAt = decoded.args.withdrawableAt
            break
          }
        } catch (e) {
          continue
        }
      }

      return { txHash: hash, withdrawableAt }
    } catch (error) {
      const compactError = extractCompactError(error, theCompactAbi)
      if (compactError) {
        throw compactError
      }
      throw error
    }
  }

  /**
   * Disable a previously enabled forced withdrawal
   *
   * Cancels a forced withdrawal that was previously enabled for a lock, resetting
   * it back to normal operation.
   *
   * @param id - The lock ID to disable forced withdrawal for
   * @returns Transaction hash
   *
   * @throws {Error} If walletClient is not configured
   * @throws {Error} If contract address is not set
   * @throws {CompactError} If disabling forced withdrawal fails
   *
   * @example
   * ```typescript
   * // Cancel a forced withdrawal if allocator becomes responsive again
   * const txHash = await client.sponsor.disableForcedWithdrawal(lockId)
   * console.log('Forced withdrawal disabled:', txHash)
   * ```
   */
  async disableForcedWithdrawal(id: bigint): Promise<Hex> {
    invariant(this.config.walletClient, 'walletClient is required')
    invariant(this.config.address, 'contract address is required')

    try {
      const hash = await this.config.walletClient.writeContract({
        address: this.config.address,
        abi: theCompactAbi,
        functionName: 'disableForcedWithdrawal',
        args: [id],
        chain: null,
        account: this.config.walletClient.account as Account,
      })

      return hash
    } catch (error) {
      const compactError = extractCompactError(error, theCompactAbi)
      if (compactError) {
        throw compactError
      }
      throw error
    }
  }

  /**
   * Execute a forced withdrawal after the delay period
   *
   * Withdraws the specified amount of underlying tokens from a lock after forced withdrawal
   * has been enabled and the delay period has elapsed.
   *
   * You must specify the amount to withdraw, which cannot exceed your balance for that lock.
   *
   * @param id - The lock ID to withdraw from
   * @param recipient - Address to receive the withdrawn tokens
   * @param amount - Amount to withdraw (must not exceed your balance for this lock)
   * @returns Transaction hash
   *
   * @throws {Error} If walletClient is not configured
   * @throws {Error} If contract address is not set
   * @throws {CompactError} If forced withdrawal fails (e.g., delay not elapsed, insufficient balance)
   *
   * @example
   * ```typescript
   * // First check your balance
   * const balance = await client.view.balanceOf({ account: myAddress, id: lockId })
   *
   * // Enable forced withdrawal
   * const enableResult = await client.sponsor.enableForcedWithdrawal(lockId)
   *
   * // Wait for the delay period
   * await waitUntil(enableResult.withdrawableAt)
   *
   * // Execute the withdrawal
   * const txHash = await client.sponsor.forcedWithdrawal(lockId, recipientAddress, balance)
   * console.log('Withdrawal transaction:', txHash)
   * ```
   */
  async forcedWithdrawal(id: bigint, recipient: Address, amount: bigint): Promise<Hex> {
    invariant(this.config.walletClient, 'walletClient is required')
    invariant(this.config.address, 'contract address is required')

    try {
      const hash = await this.config.walletClient.writeContract({
        address: this.config.address,
        abi: theCompactAbi,
        functionName: 'forcedWithdrawal',
        args: [id, recipient, amount],
        chain: null,
        account: this.config.walletClient.account as Account,
      })

      return hash
    } catch (error) {
      const compactError = extractCompactError(error, theCompactAbi)
      if (compactError) {
        throw compactError
      }
      throw error
    }
  }

  /**
   * Get a single compact builder for this chain
   *
   * Creates a builder for constructing a single-resource compact (an intent to transfer
   * a locked resource to claimants via an arbiter).
   *
   * @returns A SingleCompactBuilder instance configured with this chain's domain
   *
   * @example
   * ```typescript
   * const compact = client.sponsor.compact()
   *   .arbiter(arbiterAddress)
   *   .sponsor(sponsorAddress)
   *   .nonce(1n)
   *   .expires(BigInt(Date.now() + 3600000))
   *   .lockTag(lockTag)
   *   .token(tokenAddress)
   *   .amount(1000000n)
   *   .build()
   *
   * // Sign the compact
   * const signature = await walletClient.signTypedData(compact.typedData)
   * ```
   */
  compact() {
    invariant(this.config.address, 'contract address is required')
    const domain = createDomain({
      chainId: this.config.chainId,
      contractAddress: this.config.address,
    })
    return CompactBuilder.single(domain)
  }

  /**
   * Get a batch compact builder for this chain
   *
   * Creates a builder for constructing a batch compact (an intent to transfer
   * multiple locked resources to claimants via an arbiter).
   *
   * @returns A BatchCompactBuilder instance configured with this chain's domain
   *
   * @example
   * ```typescript
   * const compact = client.sponsor.batchCompact()
   *   .arbiter(arbiterAddress)
   *   .sponsor(sponsorAddress)
   *   .nonce(1n)
   *   .expires(BigInt(Date.now() + 3600000))
   *   .addLock({ lockTag: lockTag1, token: token1, amount: amount1 })
   *   .addLock({ lockTag: lockTag2, token: token2, amount: amount2 })
   *   .build()
   * ```
   */
  batchCompact() {
    invariant(this.config.address, 'contract address is required')
    const domain = createDomain({
      chainId: this.config.chainId,
      contractAddress: this.config.address,
    })
    return CompactBuilder.batch(domain)
  }

  /**
   * Get a multichain compact builder for coordinating compacts across chains
   *
   * Creates a builder for constructing a multichain compact (an intent to transfer
   * resources across multiple chains in a coordinated manner).
   *
   * @returns A MultichainCompactBuilder instance configured with this chain's domain
   *
   * @example
   * ```typescript
   * const compact = client.sponsor.multichainCompact()
   *   .sponsor(sponsorAddress)
   *   .chainId(1n) // Ethereum mainnet
   *   .arbiter(arbiterAddress)
   *   .nonce(1n)
   *   .expires(BigInt(Date.now() + 3600000))
   *   .addCommitment({ lockTag, token, amount })
   *   .build()
   * ```
   */
  multichainCompact() {
    invariant(this.config.address, 'contract address is required')
    const domain = createDomain({
      chainId: this.config.chainId,
      contractAddress: this.config.address,
    })
    return CompactBuilder.multichain(domain)
  }
}
