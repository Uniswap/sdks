/**
 * Sponsor client for deposit and registration operations
 */

import invariant from 'tiny-invariant'
import { Account, Address, decodeEventLog, Hex, zeroAddress } from 'viem'

import { theCompactAbi } from '../abi/theCompact'
import { CompactBuilder } from '../builders/compact'
import { createDomain } from '../config/domain'
import { encodeLockId } from '../encoding/locks'
import {
  batchCompactTypehash,
  commitmentsHashFromLocks,
  compactTypehash,
  multichainCompactTypehash,
  multichainElementHash,
  multichainElementTypehash,
  multichainElementsHash,
  registrationBatchClaimHash,
  registrationCompactClaimHash,
  registrationMultichainClaimHash,
} from '../encoding/registration'
import { extractCompactError } from '../errors/decode'
import { CompactCategory } from '../types/runtime'

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

  private async waitAndExtractEvent<TEventName extends string>(hash: Hex, eventName: TEventName): Promise<any | null> {
    const receipt = await this.config.publicClient.waitForTransactionReceipt({ hash })
    for (const log of receipt.logs) {
      try {
        const decoded = decodeEventLog({
          abi: theCompactAbi,
          data: log.data,
          topics: log.topics,
        })
        if (decoded.eventName === eventName) return decoded
      } catch {
        continue
      }
    }
    return null
  }

  private async assertObservedTransfer(params: { txHash: Hex; recipient: Address; expectedId: bigint }): Promise<void> {
    const decoded = await this.waitAndExtractEvent(params.txHash, 'Transfer')
    invariant(decoded, 'Transfer event not found in receipt')
    invariant(decoded.args.to === params.recipient, 'Unexpected Transfer recipient in receipt')
    invariant(decoded.args.id === params.expectedId, 'Unexpected lock id in Transfer event (computed != observed)')
  }

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
      const id = encodeLockId(params.lockTag, zeroAddress)
      const hash = await this.config.walletClient.writeContract({
        address: this.config.address,
        abi: theCompactAbi,
        functionName: 'depositNative',
        args: [params.lockTag, params.recipient],
        value: params.value,
        chain: null,
        account: this.config.walletClient.account as Account,
      })

      // Validate receipt logs match the computed lock id (observed effect)
      await this.assertObservedTransfer({ txHash: hash, recipient: params.recipient, expectedId: id })

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
      const id = encodeLockId(params.lockTag, params.token)
      const hash = await this.config.walletClient.writeContract({
        address: this.config.address,
        abi: theCompactAbi,
        functionName: 'depositERC20',
        args: [params.token, params.lockTag, params.amount, params.recipient],
        chain: null,
        account: this.config.walletClient.account as Account,
      })

      // Validate receipt logs match the computed lock id (observed effect)
      await this.assertObservedTransfer({ txHash: hash, recipient: params.recipient, expectedId: id })

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
   * Deposit native tokens and register a claim hash in the same transaction.
   * Returns the deterministic lock ID and (when present) the CompactRegistered event data.
   */
  async depositNativeAndRegister(params: {
    lockTag: Hex
    claimHash: Hex
    typehash: Hex
    value: bigint
  }): Promise<{ txHash: Hex; id: bigint; registered?: { sponsor: Address; claimHash: Hex; typehash: Hex } }> {
    invariant(this.config.walletClient, 'walletClient is required for deposits')
    invariant(this.config.address, 'contract address is required')

    const id = encodeLockId(params.lockTag, zeroAddress)
    try {
      const hash = await this.config.walletClient.writeContract({
        address: this.config.address,
        abi: theCompactAbi,
        functionName: 'depositNativeAndRegister',
        args: [params.lockTag, params.claimHash, params.typehash],
        value: params.value,
        chain: null,
        account: this.config.walletClient.account as Account,
      })

      const decoded = await this.waitAndExtractEvent(hash, 'CompactRegistered')
      const registered = decoded
        ? {
            sponsor: decoded.args.sponsor as Address,
            claimHash: decoded.args.claimHash as Hex,
            typehash: decoded.args.typehash as Hex,
          }
        : undefined

      return { txHash: hash, id, registered }
    } catch (error) {
      const compactError = extractCompactError(error, theCompactAbi)
      if (compactError) throw compactError
      throw error
    }
  }

  /**
   * Deposit ERC20 and register a claim hash in the same transaction.
   * Returns the deterministic lock ID and (when present) the CompactRegistered event data.
   */
  async depositERC20AndRegister(params: {
    token: Address
    lockTag: Hex
    amount: bigint
    claimHash: Hex
    typehash: Hex
  }): Promise<{ txHash: Hex; id: bigint; registered?: { sponsor: Address; claimHash: Hex; typehash: Hex } }> {
    invariant(this.config.walletClient, 'walletClient is required for deposits')
    invariant(this.config.address, 'contract address is required')

    const id = encodeLockId(params.lockTag, params.token)
    try {
      const hash = await this.config.walletClient.writeContract({
        address: this.config.address,
        abi: theCompactAbi,
        functionName: 'depositERC20AndRegister',
        args: [params.token, params.lockTag, params.amount, params.claimHash, params.typehash],
        chain: null,
        account: this.config.walletClient.account as Account,
      })

      const decoded = await this.waitAndExtractEvent(hash, 'CompactRegistered')
      const registered = decoded
        ? {
            sponsor: decoded.args.sponsor as Address,
            claimHash: decoded.args.claimHash as Hex,
            typehash: decoded.args.typehash as Hex,
          }
        : undefined

      return { txHash: hash, id, registered }
    } catch (error) {
      const compactError = extractCompactError(error, theCompactAbi)
      if (compactError) throw compactError
      throw error
    }
  }

  /**
   * Schedule a future emissary assignment for a lockTag.
   * Returns the `assignableAt` timestamp from the EmissaryAssignmentScheduled event.
   */
  async scheduleEmissaryAssignment(lockTag: Hex): Promise<{ txHash: Hex; assignableAt: bigint }> {
    invariant(this.config.walletClient, 'walletClient is required')
    invariant(this.config.address, 'contract address is required')

    try {
      const hash = await this.config.walletClient.writeContract({
        address: this.config.address,
        abi: theCompactAbi,
        functionName: 'scheduleEmissaryAssignment',
        args: [lockTag],
        chain: null,
        account: this.config.walletClient.account as Account,
      })

      const decoded = await this.waitAndExtractEvent(hash, 'EmissaryAssignmentScheduled')
      invariant(decoded, 'EmissaryAssignmentScheduled event not found in receipt')

      return { txHash: hash, assignableAt: decoded.args.assignableAt as bigint }
    } catch (error) {
      const compactError = extractCompactError(error, theCompactAbi)
      if (compactError) throw compactError
      throw error
    }
  }

  /**
   * Assign an emissary for a lockTag after scheduling.
   */
  async assignEmissary(lockTag: Hex, emissary: Address): Promise<Hex> {
    invariant(this.config.walletClient, 'walletClient is required')
    invariant(this.config.address, 'contract address is required')

    try {
      const hash = await this.config.walletClient.writeContract({
        address: this.config.address,
        abi: theCompactAbi,
        functionName: 'assignEmissary',
        args: [lockTag, emissary],
        chain: null,
        account: this.config.walletClient.account as Account,
      })

      await this.config.publicClient.waitForTransactionReceipt({ hash })
      return hash
    } catch (error) {
      const compactError = extractCompactError(error, theCompactAbi)
      if (compactError) throw compactError
      throw error
    }
  }

  /**
   * Set an operator for ERC-6909 style approvals.
   */
  async setOperator(operator: Address, approved: boolean): Promise<Hex> {
    invariant(this.config.walletClient, 'walletClient is required')
    invariant(this.config.address, 'contract address is required')

    try {
      const hash = await this.config.walletClient.writeContract({
        address: this.config.address,
        abi: theCompactAbi,
        functionName: 'setOperator',
        args: [operator, approved],
        chain: null,
        account: this.config.walletClient.account as Account,
      })

      await this.config.publicClient.waitForTransactionReceipt({ hash })
      return hash
    } catch (error) {
      const compactError = extractCompactError(error, theCompactAbi)
      if (compactError) throw compactError
      throw error
    }
  }

  /**
   * Approve a spender for a specific ERC-6909 lock ID.
   */
  async approve(spender: Address, id: bigint, amount: bigint): Promise<Hex> {
    invariant(this.config.walletClient, 'walletClient is required')
    invariant(this.config.address, 'contract address is required')

    try {
      const hash = await this.config.walletClient.writeContract({
        address: this.config.address,
        abi: theCompactAbi,
        functionName: 'approve',
        args: [spender, id, amount],
        chain: null,
        account: this.config.walletClient.account as Account,
      })

      await this.config.publicClient.waitForTransactionReceipt({ hash })
      return hash
    } catch (error) {
      const compactError = extractCompactError(error, theCompactAbi)
      if (compactError) throw compactError
      throw error
    }
  }

  /**
   * Batch deposit ERC-6909 ids and amounts (payable for native deposits).
   * `idsAndAmounts` is a list of [id, amount] pairs.
   */
  async batchDeposit(params: {
    recipient: Address
    idsAndAmounts: readonly [bigint, bigint][]
    value?: bigint
  }): Promise<{ txHash: Hex }> {
    invariant(this.config.walletClient, 'walletClient is required')
    invariant(this.config.address, 'contract address is required')

    try {
      const hash = await this.config.walletClient.writeContract({
        address: this.config.address,
        abi: theCompactAbi,
        functionName: 'batchDeposit',
        args: [params.idsAndAmounts as any, params.recipient],
        value: params.value,
        chain: null,
        account: this.config.walletClient.account as Account,
      })

      await this.config.publicClient.waitForTransactionReceipt({ hash })
      return { txHash: hash }
    } catch (error) {
      const compactError = extractCompactError(error, theCompactAbi)
      if (compactError) throw compactError
      throw error
    }
  }

  /**
   * Register multiple claim hashes in one transaction.
   * `claimHashesAndTypehashes` is a list of [claimHash, typehash] pairs.
   */
  async registerMultiple(params: { claimHashesAndTypehashes: readonly [Hex, Hex][] }): Promise<Hex> {
    invariant(this.config.walletClient, 'walletClient is required')
    invariant(this.config.address, 'contract address is required')

    try {
      const hash = await this.config.walletClient.writeContract({
        address: this.config.address,
        abi: theCompactAbi,
        functionName: 'registerMultiple',
        args: [params.claimHashesAndTypehashes as any],
        chain: null,
        account: this.config.walletClient.account as Account,
      })

      await this.config.publicClient.waitForTransactionReceipt({ hash })
      return hash
    } catch (error) {
      const compactError = extractCompactError(error, theCompactAbi)
      if (compactError) throw compactError
      throw error
    }
  }

  /**
   * Deposit and register multiple hashes in one tx (payable for native deposits).
   */
  async batchDepositAndRegisterMultiple(params: {
    idsAndAmounts: readonly [bigint, bigint][]
    claimHashesAndTypehashes: readonly [Hex, Hex][]
    value?: bigint
  }): Promise<Hex> {
    invariant(this.config.walletClient, 'walletClient is required')
    invariant(this.config.address, 'contract address is required')

    try {
      const hash = await this.config.walletClient.writeContract({
        address: this.config.address,
        abi: theCompactAbi,
        functionName: 'batchDepositAndRegisterMultiple',
        args: [params.idsAndAmounts as any, params.claimHashesAndTypehashes as any],
        value: params.value,
        chain: null,
        account: this.config.walletClient.account as Account,
      })

      await this.config.publicClient.waitForTransactionReceipt({ hash })
      return hash
    } catch (error) {
      const compactError = extractCompactError(error, theCompactAbi)
      if (compactError) throw compactError
      throw error
    }
  }

  /**
   * Deposit native and register-for (returns id + claimHash).
   */
  async depositNativeAndRegisterFor(params: {
    recipient: Address
    lockTag: Hex
    arbiter: Address
    nonce: bigint
    expires: bigint
    typehash: Hex
    witness: Hex
    value: bigint
  }): Promise<{ txHash: Hex; id: bigint; claimHash: Hex }> {
    invariant(this.config.walletClient, 'walletClient is required for deposits')
    invariant(this.config.address, 'contract address is required')

    const id = encodeLockId(params.lockTag, zeroAddress)
    try {
      const hash = await this.config.walletClient.writeContract({
        address: this.config.address,
        abi: theCompactAbi,
        functionName: 'depositNativeAndRegisterFor',
        args: [
          params.recipient,
          params.lockTag,
          params.arbiter,
          params.nonce,
          params.expires,
          params.typehash,
          params.witness,
        ],
        value: params.value,
        chain: null,
        account: this.config.walletClient.account as Account,
      })

      const receipt = await this.config.publicClient.waitForTransactionReceipt({ hash })
      // Claim hash is returned by the function, but viem's writeContract returns only tx hash; derive from event if present.
      const decoded = receipt.logs
        .map((log) => {
          try {
            return decodeEventLog({ abi: theCompactAbi, data: log.data, topics: log.topics })
          } catch {
            return null
          }
        })
        .find((d) => d?.eventName === 'Claim')

      return { txHash: hash, id, claimHash: (decoded?.args.claimHash as Hex) || (('0x' + '0'.repeat(64)) as Hex) }
    } catch (error) {
      const compactError = extractCompactError(error, theCompactAbi)
      if (compactError) throw compactError
      throw error
    }
  }

  /**
   * Deposit ERC20 and register-for (returns id + claimHash + registeredAmount).
   */
  async depositERC20AndRegisterFor(params: {
    recipient: Address
    token: Address
    lockTag: Hex
    amount: bigint
    arbiter: Address
    nonce: bigint
    expires: bigint
    typehash: Hex
    witness: Hex
  }): Promise<{ txHash: Hex; id: bigint; claimHash: Hex }> {
    invariant(this.config.walletClient, 'walletClient is required for deposits')
    invariant(this.config.address, 'contract address is required')

    const id = encodeLockId(params.lockTag, params.token)
    try {
      const hash = await this.config.walletClient.writeContract({
        address: this.config.address,
        abi: theCompactAbi,
        functionName: 'depositERC20AndRegisterFor',
        args: [
          params.recipient,
          params.token,
          params.lockTag,
          params.amount,
          params.arbiter,
          params.nonce,
          params.expires,
          params.typehash,
          params.witness,
        ],
        chain: null,
        account: this.config.walletClient.account as Account,
      })

      const receipt = await this.config.publicClient.waitForTransactionReceipt({ hash })
      const decoded = receipt.logs
        .map((log) => {
          try {
            return decodeEventLog({ abi: theCompactAbi, data: log.data, topics: log.topics })
          } catch {
            return null
          }
        })
        .find((d) => d?.eventName === 'Claim')

      return { txHash: hash, id, claimHash: (decoded?.args.claimHash as Hex) || (('0x' + '0'.repeat(64)) as Hex) }
    } catch (error) {
      const compactError = extractCompactError(error, theCompactAbi)
      if (compactError) throw compactError
      throw error
    }
  }

  /**
   * Batch deposit and register-for (payable for native deposits).
   * Returns tx hash; claimHash is emitted in Claim event.
   */
  async batchDepositAndRegisterFor(params: {
    recipient: Address
    idsAndAmounts: readonly [bigint, bigint][]
    arbiter: Address
    nonce: bigint
    expires: bigint
    typehash: Hex
    witness: Hex
    value?: bigint
  }): Promise<{ txHash: Hex; claimHash?: Hex }> {
    invariant(this.config.walletClient, 'walletClient is required')
    invariant(this.config.address, 'contract address is required')

    try {
      const hash = await this.config.walletClient.writeContract({
        address: this.config.address,
        abi: theCompactAbi,
        functionName: 'batchDepositAndRegisterFor',
        args: [
          params.recipient,
          params.idsAndAmounts as any,
          params.arbiter,
          params.nonce,
          params.expires,
          params.typehash,
          params.witness,
        ],
        value: params.value,
        chain: null,
        account: this.config.walletClient.account as Account,
      })

      const receipt = await this.config.publicClient.waitForTransactionReceipt({ hash })
      const decoded = receipt.logs
        .map((log) => {
          try {
            return decodeEventLog({ abi: theCompactAbi, data: log.data, topics: log.topics })
          } catch {
            return null
          }
        })
        .find((d) => d?.eventName === 'Claim')

      return { txHash: hash, claimHash: decoded?.args.claimHash as Hex | undefined }
    } catch (error) {
      const compactError = extractCompactError(error, theCompactAbi)
      if (compactError) throw compactError
      throw error
    }
  }

  /**
   * Permit2 structs used by The Compact.
   */
  // eslint-disable-next-line @typescript-eslint/consistent-type-definitions
  async depositERC20ViaPermit2(params: {
    permit: {
      permitted: { token: Address; amount: bigint }
      nonce: bigint
      deadline: bigint
    }
    depositor: Address
    lockTag: Hex
    recipient: Address
    signature: Hex
  }): Promise<{ txHash: Hex }> {
    invariant(this.config.walletClient, 'walletClient is required for deposits')
    invariant(this.config.address, 'contract address is required')

    try {
      const hash = await this.config.walletClient.writeContract({
        address: this.config.address,
        abi: theCompactAbi,
        functionName: 'depositERC20ViaPermit2',
        args: [params.permit, params.depositor, params.lockTag, params.recipient, params.signature] as any,
        chain: null,
        account: this.config.walletClient.account as Account,
      })

      await this.config.publicClient.waitForTransactionReceipt({ hash })
      return { txHash: hash }
    } catch (error) {
      const compactError = extractCompactError(error, theCompactAbi)
      if (compactError) throw compactError
      throw error
    }
  }

  async depositERC20AndRegisterViaPermit2(params: {
    permit: {
      permitted: { token: Address; amount: bigint }
      nonce: bigint
      deadline: bigint
    }
    depositor: Address
    lockTag: Hex
    claimHash: Hex
    category: CompactCategory
    witness: string
    signature: Hex
  }): Promise<{ txHash: Hex }> {
    invariant(this.config.walletClient, 'walletClient is required for deposits')
    invariant(this.config.address, 'contract address is required')

    try {
      const hash = await this.config.walletClient.writeContract({
        address: this.config.address,
        abi: theCompactAbi,
        functionName: 'depositERC20AndRegisterViaPermit2',
        args: [
          params.permit,
          params.depositor,
          params.lockTag,
          params.claimHash,
          params.category,
          params.witness,
          params.signature,
        ] as any,
        chain: null,
        account: this.config.walletClient.account as Account,
      })

      await this.config.publicClient.waitForTransactionReceipt({ hash })
      return { txHash: hash }
    } catch (error) {
      const compactError = extractCompactError(error, theCompactAbi)
      if (compactError) throw compactError
      throw error
    }
  }

  async batchDepositViaPermit2(params: {
    depositor: Address
    permitted: readonly { token: Address; amount: bigint }[]
    depositDetails: { nonce: bigint; deadline: bigint; lockTag: Hex }
    recipient: Address
    signature: Hex
  }): Promise<{ txHash: Hex }> {
    invariant(this.config.walletClient, 'walletClient is required for deposits')
    invariant(this.config.address, 'contract address is required')

    try {
      const hash = await this.config.walletClient.writeContract({
        address: this.config.address,
        abi: theCompactAbi,
        functionName: 'batchDepositViaPermit2',
        args: [params.depositor, params.permitted, params.depositDetails, params.recipient, params.signature] as any,
        chain: null,
        account: this.config.walletClient.account as Account,
      })

      await this.config.publicClient.waitForTransactionReceipt({ hash })
      return { txHash: hash }
    } catch (error) {
      const compactError = extractCompactError(error, theCompactAbi)
      if (compactError) throw compactError
      throw error
    }
  }

  async batchDepositAndRegisterViaPermit2(params: {
    depositor: Address
    permitted: readonly { token: Address; amount: bigint }[]
    depositDetails: { nonce: bigint; deadline: bigint; lockTag: Hex }
    claimHash: Hex
    category: CompactCategory
    witness: string
    signature: Hex
  }): Promise<{ txHash: Hex }> {
    invariant(this.config.walletClient, 'walletClient is required for deposits')
    invariant(this.config.address, 'contract address is required')

    try {
      const hash = await this.config.walletClient.writeContract({
        address: this.config.address,
        abi: theCompactAbi,
        functionName: 'batchDepositAndRegisterViaPermit2',
        args: [
          params.depositor,
          params.permitted,
          params.depositDetails,
          params.claimHash,
          params.category,
          params.witness,
          params.signature,
        ] as any,
        chain: null,
        account: this.config.walletClient.account as Account,
      })

      await this.config.publicClient.waitForTransactionReceipt({ hash })
      return { txHash: hash }
    } catch (error) {
      const compactError = extractCompactError(error, theCompactAbi)
      if (compactError) throw compactError
      throw error
    }
  }

  /**
   * Transfer ERC-6909 tokens.
   */
  async transfer(params: { to: Address; id: bigint; amount: bigint; value?: bigint }): Promise<Hex> {
    invariant(this.config.walletClient, 'walletClient is required')
    invariant(this.config.address, 'contract address is required')

    try {
      const hash = await this.config.walletClient.writeContract({
        address: this.config.address,
        abi: theCompactAbi,
        functionName: 'transfer',
        args: [params.to, params.id, params.amount],
        value: params.value,
        chain: null,
        account: this.config.walletClient.account as Account,
      })
      await this.config.publicClient.waitForTransactionReceipt({ hash })
      return hash
    } catch (error) {
      const compactError = extractCompactError(error, theCompactAbi)
      if (compactError) throw compactError
      throw error
    }
  }

  /**
   * Transfer ERC-6909 tokens from another owner (requires approval).
   */
  async transferFrom(params: { from: Address; to: Address; id: bigint; amount: bigint; value?: bigint }): Promise<Hex> {
    invariant(this.config.walletClient, 'walletClient is required')
    invariant(this.config.address, 'contract address is required')

    try {
      const hash = await this.config.walletClient.writeContract({
        address: this.config.address,
        abi: theCompactAbi,
        functionName: 'transferFrom',
        args: [params.from, params.to, params.id, params.amount],
        value: params.value,
        chain: null,
        account: this.config.walletClient.account as Account,
      })
      await this.config.publicClient.waitForTransactionReceipt({ hash })
      return hash
    } catch (error) {
      const compactError = extractCompactError(error, theCompactAbi)
      if (compactError) throw compactError
      throw error
    }
  }

  /**
   * Register a single-compact style authorization on behalf of a sponsor.
   *
   * NOTE: This is a low-level wrapper around the contract function. If you want an ergonomic
   * API, we should add a canonical "compute registration hash + typehash" helper next.
   */
  async registerFor(params: {
    typehash: Hex
    arbiter: Address
    sponsor: Address
    nonce: bigint
    expires: bigint
    lockTag: Hex
    token: Address
    amount: bigint
    witness: Hex
    sponsorSignature: Hex
  }): Promise<{ txHash: Hex }> {
    invariant(this.config.walletClient, 'walletClient is required for registration')
    invariant(this.config.address, 'contract address is required')

    try {
      const hash = await this.config.walletClient.writeContract({
        address: this.config.address,
        abi: theCompactAbi,
        functionName: 'registerFor',
        args: [
          params.typehash,
          params.arbiter,
          params.sponsor,
          params.nonce,
          params.expires,
          params.lockTag,
          params.token,
          params.amount,
          params.witness,
          params.sponsorSignature,
        ] as any,
        chain: null,
        account: this.config.walletClient.account as Account,
      })
      await this.config.publicClient.waitForTransactionReceipt({ hash })
      return { txHash: hash }
    } catch (error) {
      const compactError = extractCompactError(error, theCompactAbi)
      if (compactError) throw compactError
      throw error
    }
  }

  /**
   * Register a batch-compact style authorization on behalf of a sponsor.
   * `commitmentsHash` and `witness` are bytes32 values used by the contract.
   */
  async registerBatchFor(params: {
    typehash: Hex
    arbiter: Address
    sponsor: Address
    nonce: bigint
    expires: bigint
    commitmentsHash: Hex
    witness: Hex
    sponsorSignature: Hex
  }): Promise<{ txHash: Hex }> {
    invariant(this.config.walletClient, 'walletClient is required for registration')
    invariant(this.config.address, 'contract address is required')

    try {
      const hash = await this.config.walletClient.writeContract({
        address: this.config.address,
        abi: theCompactAbi,
        functionName: 'registerBatchFor',
        args: [
          params.typehash,
          params.arbiter,
          params.sponsor,
          params.nonce,
          params.expires,
          params.commitmentsHash,
          params.witness,
          params.sponsorSignature,
        ] as any,
        chain: null,
        account: this.config.walletClient.account as Account,
      })
      await this.config.publicClient.waitForTransactionReceipt({ hash })
      return { txHash: hash }
    } catch (error) {
      const compactError = extractCompactError(error, theCompactAbi)
      if (compactError) throw compactError
      throw error
    }
  }

  /**
   * Register a multichain-compact style authorization on behalf of a sponsor.
   */
  async registerMultichainFor(params: {
    typehash: Hex
    sponsor: Address
    nonce: bigint
    expires: bigint
    witness: Hex
    notarizedChainId: bigint
    sponsorSignature: Hex
  }): Promise<{ txHash: Hex }> {
    invariant(this.config.walletClient, 'walletClient is required for registration')
    invariant(this.config.address, 'contract address is required')

    try {
      const hash = await this.config.walletClient.writeContract({
        address: this.config.address,
        abi: theCompactAbi,
        functionName: 'registerMultichainFor',
        args: [
          params.typehash,
          params.sponsor,
          params.nonce,
          params.expires,
          params.witness,
          params.notarizedChainId,
          params.sponsorSignature,
        ] as any,
        chain: null,
        account: this.config.walletClient.account as Account,
      })
      await this.config.publicClient.waitForTransactionReceipt({ hash })
      return { txHash: hash }
    } catch (error) {
      const compactError = extractCompactError(error, theCompactAbi)
      if (compactError) throw compactError
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
   * Compute the canonical registration inputs (claimHash + typehash) for a built Compact.
   * This matches The Compact's `register` preimage hashing (NOT the EIP-712 digest).
   */
  registrationForCompact(built: {
    struct: {
      arbiter: Address
      sponsor: Address
      nonce: bigint
      expires: bigint
      lockTag: Hex
      token: Address
      amount: bigint
    }
    mandateType?: any
    mandate?: any
  }): {
    claimHash: Hex
    typehash: Hex
  } {
    const typehash = compactTypehash(built.mandateType)
    const witness = built.mandateType && built.mandate ? built.mandateType.hash(built.mandate) : undefined
    const claimHash = registrationCompactClaimHash({
      typehash,
      arbiter: built.struct.arbiter,
      sponsor: built.struct.sponsor,
      nonce: built.struct.nonce,
      expires: built.struct.expires,
      lockTag: built.struct.lockTag,
      token: built.struct.token,
      amount: built.struct.amount,
      witness,
    })
    return { claimHash, typehash }
  }

  /**
   * Convenience: register a built Compact (from `singleCompactBuilder().build()`).
   */
  async registerCompact(built: {
    struct: {
      arbiter: Address
      sponsor: Address
      nonce: bigint
      expires: bigint
      lockTag: Hex
      token: Address
      amount: bigint
    }
    mandateType?: any
    mandate?: any
  }): Promise<Hex> {
    const { claimHash, typehash } = this.registrationForCompact(built)
    return await this.register({ claimHash, typehash })
  }

  /**
   * Compute canonical registration inputs for a built BatchCompact.
   */
  registrationForBatchCompact(built: {
    struct: {
      arbiter: Address
      sponsor: Address
      nonce: bigint
      expires: bigint
      commitments: readonly { lockTag: Hex; token: Address; amount: bigint }[]
    }
    mandateType?: any
    mandate?: any
  }): { claimHash: Hex; typehash: Hex } {
    const typehash = batchCompactTypehash(built.mandateType)
    const witness = built.mandateType && built.mandate ? built.mandateType.hash(built.mandate) : undefined
    const idsAndAmountsHash = commitmentsHashFromLocks(built.struct.commitments)
    const claimHash = registrationBatchClaimHash({
      typehash,
      arbiter: built.struct.arbiter,
      sponsor: built.struct.sponsor,
      nonce: built.struct.nonce,
      expires: built.struct.expires,
      idsAndAmountsHash,
      witness,
    })
    return { claimHash, typehash }
  }

  async registerBatchCompact(built: {
    struct: {
      arbiter: Address
      sponsor: Address
      nonce: bigint
      expires: bigint
      commitments: readonly { lockTag: Hex; token: Address; amount: bigint }[]
    }
    mandateType?: any
    mandate?: any
  }): Promise<Hex> {
    const { claimHash, typehash } = this.registrationForBatchCompact(built)
    return await this.register({ claimHash, typehash })
  }

  /**
   * Compute canonical registration inputs for a built MultichainCompact.
   *
   * NOTE: This uses the element hashing from The Compact test helpers:
   * `elementHash = keccak256(abi.encode(elementTypehash, arbiter, chainId, commitmentsHash, witness?))`,
   * `elementsHash = keccak256(abi.encodePacked(elementHashes))`,
   * `claimHash = keccak256(abi.encode(multichainTypehash, sponsor, nonce, expires, elementsHash))`.
   */
  registrationForMultichainCompact(built: {
    struct: { sponsor: Address; nonce: bigint; expires: bigint }
    elements: readonly {
      element: {
        arbiter: Address
        chainId: bigint
        commitments: readonly { lockTag: Hex; token: Address; amount: bigint }[]
      }
      mandateType?: any
      mandate?: any
    }[]
  }): { claimHash: Hex; typehash: Hex } {
    // assume all elements share the same mandate typestring (enforced by builder semantics)
    const firstMandateType = built.elements[0]?.mandateType
    const typehash = multichainCompactTypehash(firstMandateType)
    const elementTypehash = multichainElementTypehash(firstMandateType)

    const elementHashes = built.elements.map((el) => {
      const commitmentsHash = commitmentsHashFromLocks(el.element.commitments)
      const witness = el.mandateType && el.mandate ? el.mandateType.hash(el.mandate) : undefined
      return multichainElementHash({
        typehash: elementTypehash,
        arbiter: el.element.arbiter,
        chainId: el.element.chainId,
        commitmentsHash,
        witness,
      })
    })

    const elementsHash = multichainElementsHash(elementHashes)
    const claimHash = registrationMultichainClaimHash({
      typehash,
      sponsor: built.struct.sponsor,
      nonce: built.struct.nonce,
      expires: built.struct.expires,
      elementsHash,
    })
    return { claimHash, typehash }
  }

  async registerMultichainCompact(built: {
    struct: { sponsor: Address; nonce: bigint; expires: bigint }
    elements: readonly {
      element: {
        arbiter: Address
        chainId: bigint
        commitments: readonly { lockTag: Hex; token: Address; amount: bigint }[]
      }
      mandateType?: any
      mandate?: any
    }[]
  }): Promise<Hex> {
    const { claimHash, typehash } = this.registrationForMultichainCompact(built)
    return await this.register({ claimHash, typehash })
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
