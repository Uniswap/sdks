/**
 * Sponsor client for deposit and registration operations
 */

import { CompactClientConfig } from './coreClient'
import { theCompactAbi } from '../abi/theCompact'
import { CompactBuilder } from '../builders/compact'
import { createDomain } from '../config/domain'
import { decodeEventLog } from 'viem'
import invariant from 'tiny-invariant'

/**
 * Client for sponsor operations (deposits, registrations, etc.)
 */
export class SponsorClient {
  constructor(private config: CompactClientConfig) {}

  /**
   * Deposit native tokens (ETH) and create a resource lock
   */
  async depositNative(params: {
    lockTag: `0x${string}`
    recipient: `0x${string}`
    value: bigint
  }): Promise<{ txHash: `0x${string}`; id: bigint }> {
    invariant(this.config.walletClient, 'walletClient is required for deposits')
    invariant(this.config.address, 'contract address is required')

    const hash = await (this.config.walletClient as any).writeContract({
      address: this.config.address,
      abi: theCompactAbi,
      functionName: 'depositNative',
      args: [params.lockTag, params.recipient],
      value: params.value,
      chain: null,
      account: null,
    })

    // Wait for transaction and extract id from Transfer event
    const receipt = await (this.config.publicClient as any).waitForTransactionReceipt({ hash })

    // Find the Transfer event where tokens were minted (from address(0) to recipient)
    let id = 0n
    for (const log of receipt.logs) {
      try {
        const decoded = (decodeEventLog as any)({
          abi: theCompactAbi,
          data: log.data,
          topics: log.topics,
        })

        if (decoded.eventName === 'Transfer' && decoded.args.from === '0x0000000000000000000000000000000000000000') {
          id = decoded.args.id as bigint
          break
        }
      } catch (e) {
        // Not a Transfer event or couldn't decode, skip
        continue
      }
    }

    return { txHash: hash, id }
  }

  /**
   * Deposit ERC20 tokens and create a resource lock
   */
  async depositERC20(params: {
    token: `0x${string}`
    lockTag: `0x${string}`
    amount: bigint
    recipient: `0x${string}`
  }): Promise<{ txHash: `0x${string}`; id: bigint }> {
    invariant(this.config.walletClient, 'walletClient is required for deposits')
    invariant(this.config.address, 'contract address is required')

    const hash = await (this.config.walletClient as any).writeContract({
      address: this.config.address,
      abi: theCompactAbi,
      functionName: 'depositERC20',
      args: [params.token, params.lockTag, params.amount, params.recipient],
      chain: null,
      account: null,
    })

    // Wait for transaction and extract id from Transfer event
    const receipt = await (this.config.publicClient as any).waitForTransactionReceipt({ hash })

    // Find the Transfer event where tokens were minted (from address(0) to recipient)
    let id = 0n
    for (const log of receipt.logs) {
      try {
        const decoded = (decodeEventLog as any)({
          abi: theCompactAbi,
          data: log.data,
          topics: log.topics,
        })

        if (decoded.eventName === 'Transfer' && decoded.args.from === '0x0000000000000000000000000000000000000000') {
          id = decoded.args.id as bigint
          break
        }
      } catch (e) {
        // Not a Transfer event or couldn't decode, skip
        continue
      }
    }

    return { txHash: hash, id }
  }

  /**
   * Register a claim hash
   */
  async register(params: { claimHash: `0x${string}`; typehash: `0x${string}` }): Promise<`0x${string}`> {
    invariant(this.config.walletClient, 'walletClient is required for registration')
    invariant(this.config.address, 'contract address is required')

    const hash = await (this.config.walletClient as any).writeContract({
      address: this.config.address,
      abi: theCompactAbi,
      functionName: 'register',
      args: [params.claimHash, params.typehash],
      chain: null,
      account: null,
    })

    return hash
  }

  /**
   * Enable forced withdrawal for a lock
   */
  async enableForcedWithdrawal(id: bigint): Promise<{ txHash: `0x${string}`; withdrawableAt: bigint }> {
    invariant(this.config.walletClient, 'walletClient is required')
    invariant(this.config.address, 'contract address is required')

    const hash = await (this.config.walletClient as any).writeContract({
      address: this.config.address,
      abi: theCompactAbi,
      functionName: 'enableForcedWithdrawal',
      args: [id],
      chain: null,
      account: null,
    })

    // Calculate withdrawable time (would need to get from contract state)
    const withdrawableAt = 0n // Placeholder

    return { txHash: hash, withdrawableAt }
  }

  /**
   * Get a compact builder for this chain
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
   * Get a multichain compact builder
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

