/**
 * Exarch client for bonded source-chain auction operations
 *
 * ExarchClient provides methods for all Exarch protocol operations:
 * - Bidding: placeBid, registerAndPlaceBid, registerViaPermit2AndPlaceBid
 * - Settlement: settleBid, rescindBid, cancel
 * - Filling: fill, fillAndDispatch, dispatch, claimAndFill, claimAndFillViaPermit2
 * - View: getAuctionState, canPlaceBid, getBidState, isExecuted, isNonceConsumed
 */

import invariant from 'tiny-invariant'
import { Account, Address, Hex, PublicClient, WalletClient } from 'viem'

import { exarchAbi } from '../abi/exarch'
import { createExarchDomain } from '../config/exarch'
import {
  deriveExarchClaimHash,
  deriveExarchMandateHash,
  deriveExarchFillHash,
  deriveExecutionHash,
  unpackBidState,
} from '../encoding/exarch'
import { extractCompactError } from '../errors/decode'
import {
  ExarchFillParameters,
  ExarchAdjustment,
  ExarchBatchClaim,
  ExarchDispatchParameters,
  FillInstruction,
  Permit2Arguments,
  AuctionState,
  UnpackedBidState,
} from '../types/exarch'
import { BatchCompact } from '../types/eip712'

/**
 * Configuration for ExarchClient
 */
export interface ExarchClientConfig {
  /** The chain ID where the Exarch contract is deployed */
  chainId: number
  /** Address of the Exarch contract */
  exarchAddress: Address
  /** Viem PublicClient for read operations */
  publicClient: PublicClient
  /** Viem WalletClient for write operations (optional for view-only clients) */
  walletClient?: WalletClient
}

/**
 * Result from placeBid operations
 */
export interface PlaceBidResult {
  /** Transaction hash */
  txHash: Hex
  /** Computed claim hash */
  claimHash: Hex
  /** Computed mandate hash */
  mandateHash: Hex
}

/**
 * Result from fill operations
 */
export interface FillResult {
  /** Transaction hash */
  txHash: Hex
  /** Computed execution hash */
  executionHash: Hex
}

/**
 * Result from fillAndDispatch operation
 */
export interface FillAndDispatchResult {
  /** Transaction hash */
  txHash: Hex
  /** Computed claim hash */
  claimHash: Hex
  /** Computed execution hash */
  executionHash: Hex
}

/**
 * Result from claimAndFill operations
 */
export interface ClaimAndFillResult {
  /** Transaction hash */
  txHash: Hex
  /** Computed claim hash */
  claimHash: Hex
  /** Actual fill amounts for each component */
  fillAmounts: readonly bigint[]
  /** Actual claim amounts for each commitment */
  claimAmounts: readonly bigint[]
}

/**
 * Parameters for placeBid
 */
export interface PlaceBidParams {
  /** The compact containing commitments */
  compact: BatchCompact
  /** Legate address for cross-chain proof verification */
  legate: Address
  /** Fill parameters for this specific fill */
  fillParams: ExarchFillParameters
  /** All fill hashes in the mandate */
  fillHashes: Hex[]
  /** Adjustment signed by adjuster */
  adjustment: ExarchAdjustment
  /** Claimant identifier (lockTag + address encoded) */
  claimant: Hex
}

/**
 * Parameters for registerAndPlaceBid
 */
export interface RegisterAndPlaceBidParams extends PlaceBidParams {
  /** Sponsor's signature on the compact */
  sponsorSignature: Hex
}

/**
 * Parameters for registerViaPermit2AndPlaceBid
 */
export interface RegisterViaPermit2AndPlaceBidParams extends PlaceBidParams {
  /** Permit2 arguments for deposit and registration */
  permit2Args: Permit2Arguments
}

/**
 * Parameters for settleBid
 */
export interface SettleBidParams {
  /** Batch claim with compact and signatures */
  claim: ExarchBatchClaim
  /** Adjuster address */
  adjuster: Address
  /** Legate address */
  legate: Address
  /** Fill parameters for this fill */
  fillParams: ExarchFillParameters
  /** All fill hashes in the mandate */
  fillHashes: Hex[]
  /** Execution hash proving the fill was completed */
  executionHash: Hex
}

/**
 * Parameters for fill
 */
export interface FillParams {
  /** Array of fill instructions */
  fillInstructions: FillInstruction[]
  /** Claim hash this fill corresponds to */
  claimHash: Hex
}

/**
 * Parameters for fillAndDispatch
 */
export interface FillAndDispatchParams {
  /** Compact from the claim */
  compact: BatchCompact
  /** Mandate hash */
  mandateHash: Hex
  /** Fill instructions */
  fillInstructions: FillInstruction[]
  /** Dispatch parameters for cross-chain callback */
  dispatchParameters: ExarchDispatchParameters
}

/**
 * Parameters for dispatch
 */
export interface DispatchParams {
  /** Compact from the claim */
  compact: BatchCompact
  /** Mandate hash */
  mandateHash: Hex
  /** Dispatch parameters */
  dispatchParams: ExarchDispatchParameters
  /** Execution hash from prior fill */
  executionHash: Hex
}

/**
 * Parameters for claimAndFill
 */
export interface ClaimAndFillParams {
  /** Batch claim with compact and signatures */
  claim: ExarchBatchClaim
  /** Mandate hash */
  mandateHash: Hex
  /** Fill parameters */
  fillParams: ExarchFillParameters
  /** Adjustment signed by adjuster */
  adjustment: ExarchAdjustment
  /** Claimant identifier */
  claimant: Hex
}

/**
 * Parameters for claimAndFillViaPermit2
 */
export interface ClaimAndFillViaPermit2Params extends ClaimAndFillParams {
  /** Permit2 arguments */
  permit2Args: Permit2Arguments
}

/**
 * Client for interacting with the Exarch protocol
 *
 * Provides methods for all auction operations including bidding, filling, and querying state.
 *
 * @example
 * ```typescript
 * import { ExarchClient } from '@uniswap/the-compact-sdk'
 *
 * const client = new ExarchClient({
 *   chainId: 1,
 *   exarchAddress: '0x...',
 *   publicClient,
 *   walletClient
 * })
 *
 * // Place a bid
 * const result = await client.placeBid({
 *   compact, legate, fillParams, fillHashes, adjustment, claimant
 * }, { value: bondAmount })
 *
 * // Check auction state
 * const state = await client.getAuctionState(result.claimHash)
 * console.log('Is filled:', state.isFilled)
 * ```
 */
export class ExarchClient {
  private config: ExarchClientConfig

  constructor(config: ExarchClientConfig) {
    this.config = config
  }

  /**
   * Get the EIP-712 domain for this Exarch instance
   */
  getDomain() {
    return createExarchDomain({
      chainId: this.config.chainId,
      exarchAddress: this.config.exarchAddress,
    })
  }

  // ============ Bidding Operations ============

  /**
   * Place a bid on an auction
   *
   * Requires the compact to be already registered with The Compact.
   * The bidder must send the bond amount as msg.value.
   *
   * @param params - Bid parameters
   * @param options - Transaction options including value (bond amount)
   * @returns Transaction hash and computed hashes
   *
   * @throws {Error} If walletClient is not configured
   * @throws {ExarchError} If bid placement fails (InvalidBondAmount, BidWindowActive, etc.)
   */
  async placeBid(params: PlaceBidParams, options: { value: bigint }): Promise<PlaceBidResult> {
    invariant(this.config.walletClient, 'walletClient is required for placeBid')

    const { compact, legate, fillParams, fillHashes, adjustment, claimant } = params

    try {
      const txHash = await this.config.walletClient.writeContract({
        address: this.config.exarchAddress,
        abi: exarchAbi,
        functionName: 'placeBid',
        args: [compact, legate, fillParams, fillHashes, adjustment, claimant] as any,
        value: options.value,
        chain: null,
        account: this.config.walletClient.account as Account,
      })

      // Compute mandate and claim hashes
      const mandateHash = deriveExarchMandateHash(adjustment.adjuster, legate, fillHashes)
      const claimHash = deriveExarchClaimHash(compact, mandateHash)

      return { txHash, claimHash, mandateHash }
    } catch (error) {
      const compactError = extractCompactError(error, exarchAbi)
      if (compactError) throw compactError
      throw error
    }
  }

  /**
   * Register a compact and place a bid in one transaction
   *
   * Use when the compact hasn't been registered with The Compact yet.
   * Requires sponsor's signature on the compact.
   *
   * @param params - Bid parameters including sponsor signature
   * @param options - Transaction options including value (bond amount)
   * @returns Transaction hash and computed hashes
   */
  async registerAndPlaceBid(params: RegisterAndPlaceBidParams, options: { value: bigint }): Promise<PlaceBidResult> {
    invariant(this.config.walletClient, 'walletClient is required for registerAndPlaceBid')

    const { compact, legate, fillParams, fillHashes, adjustment, claimant, sponsorSignature } = params

    try {
      const txHash = await this.config.walletClient.writeContract({
        address: this.config.exarchAddress,
        abi: exarchAbi,
        functionName: 'registerAndPlaceBid',
        args: [compact, legate, fillParams, fillHashes, adjustment, claimant, sponsorSignature] as any,
        value: options.value,
        chain: null,
        account: this.config.walletClient.account as Account,
      })

      const mandateHash = deriveExarchMandateHash(adjustment.adjuster, legate, fillHashes)
      const claimHash = deriveExarchClaimHash(compact, mandateHash)

      return { txHash, claimHash, mandateHash }
    } catch (error) {
      const compactError = extractCompactError(error, exarchAbi)
      if (compactError) throw compactError
      throw error
    }
  }

  /**
   * Register via Permit2 and place a bid in one transaction
   *
   * Most gas-efficient path when sponsor hasn't deposited yet.
   * Uses Permit2 for atomic deposit + registration + bid placement.
   *
   * @param params - Bid parameters including Permit2 args
   * @param options - Transaction options including value (bond amount)
   * @returns Transaction hash and computed hashes
   */
  async registerViaPermit2AndPlaceBid(
    params: RegisterViaPermit2AndPlaceBidParams,
    options: { value: bigint }
  ): Promise<PlaceBidResult> {
    invariant(this.config.walletClient, 'walletClient is required for registerViaPermit2AndPlaceBid')

    const { compact, legate, fillParams, fillHashes, adjustment, claimant, permit2Args } = params

    try {
      const txHash = await this.config.walletClient.writeContract({
        address: this.config.exarchAddress,
        abi: exarchAbi,
        functionName: 'registerViaPermit2AndPlaceBid',
        args: [compact, legate, fillParams, fillHashes, adjustment, claimant, permit2Args] as any,
        value: options.value,
        chain: null,
        account: this.config.walletClient.account as Account,
      })

      const mandateHash = deriveExarchMandateHash(adjustment.adjuster, legate, fillHashes)
      const claimHash = deriveExarchClaimHash(compact, mandateHash)

      return { txHash, claimHash, mandateHash }
    } catch (error) {
      const compactError = extractCompactError(error, exarchAbi)
      if (compactError) throw compactError
      throw error
    }
  }

  /**
   * Settle a filled bid
   *
   * Called by the legate after verifying the fill was executed on the target chain.
   * Releases the bidder's bond and distributes sponsor's tokens.
   *
   * @param params - Settlement parameters
   * @returns Transaction hash
   */
  async settleBid(params: SettleBidParams): Promise<{ txHash: Hex }> {
    invariant(this.config.walletClient, 'walletClient is required for settleBid')

    const { claim, adjuster, legate, fillParams, fillHashes, executionHash } = params

    try {
      const txHash = await this.config.walletClient.writeContract({
        address: this.config.exarchAddress,
        abi: exarchAbi,
        functionName: 'settleBid',
        args: [claim, adjuster, legate, fillParams, fillHashes, executionHash] as any,
        chain: null,
        account: this.config.walletClient.account as Account,
      })

      return { txHash }
    } catch (error) {
      const compactError = extractCompactError(error, exarchAbi)
      if (compactError) throw compactError
      throw error
    }
  }

  /**
   * Rescind an active bid
   *
   * Allows bidder to exit before fill with partial refund.
   * Refund decreases linearly from submission to expiry.
   *
   * @param claimHash - The claim hash of the auction to rescind from
   * @returns Transaction hash
   */
  async rescindBid(claimHash: Hex): Promise<{ txHash: Hex }> {
    invariant(this.config.walletClient, 'walletClient is required for rescindBid')

    try {
      const txHash = await this.config.walletClient.writeContract({
        address: this.config.exarchAddress,
        abi: exarchAbi,
        functionName: 'rescindBid',
        args: [claimHash],
        chain: null,
        account: this.config.walletClient.account as Account,
      })

      return { txHash }
    } catch (error) {
      const compactError = extractCompactError(error, exarchAbi)
      if (compactError) throw compactError
      throw error
    }
  }

  /**
   * Cancel an auction as the sponsor
   *
   * Only the sponsor can cancel. Forfeits any accumulated bonds to sponsor.
   *
   * @param compact - The compact to cancel
   * @param mandateHash - The mandate hash
   * @returns Transaction hash
   */
  async cancel(compact: BatchCompact, mandateHash: Hex): Promise<{ txHash: Hex }> {
    invariant(this.config.walletClient, 'walletClient is required for cancel')

    try {
      const txHash = await this.config.walletClient.writeContract({
        address: this.config.exarchAddress,
        abi: exarchAbi,
        functionName: 'cancel',
        args: [compact, mandateHash] as any,
        chain: null,
        account: this.config.walletClient.account as Account,
      })

      return { txHash }
    } catch (error) {
      const compactError = extractCompactError(error, exarchAbi)
      if (compactError) throw compactError
      throw error
    }
  }

  // ============ Fill Operations ============

  /**
   * Execute a fill on the target chain
   *
   * Called by the filler to provide tokens to recipients.
   * The executionHash is used by legate to verify the fill occurred.
   *
   * @param params - Fill parameters
   * @param options - Transaction options (value for native token fills)
   * @returns Transaction hash and execution hash
   */
  async fill(params: FillParams, options?: { value?: bigint }): Promise<FillResult> {
    invariant(this.config.walletClient, 'walletClient is required for fill')

    const { fillInstructions, claimHash } = params

    try {
      const txHash = await this.config.walletClient.writeContract({
        address: this.config.exarchAddress,
        abi: exarchAbi,
        functionName: 'fill',
        args: [fillInstructions, claimHash] as any,
        value: options?.value ?? 0n,
        chain: null,
        account: this.config.walletClient.account as Account,
      })

      // Compute execution hash
      const executionHash = deriveExecutionHash(fillInstructions, claimHash)

      return { txHash, executionHash }
    } catch (error) {
      const compactError = extractCompactError(error, exarchAbi)
      if (compactError) throw compactError
      throw error
    }
  }

  /**
   * Fill and dispatch a cross-chain callback in one transaction
   *
   * Combines fill execution with dispatching the result to another chain.
   *
   * @param params - Fill and dispatch parameters
   * @param options - Transaction options
   * @returns Transaction hash, claim hash, and execution hash
   */
  async fillAndDispatch(params: FillAndDispatchParams, options?: { value?: bigint }): Promise<FillAndDispatchResult> {
    invariant(this.config.walletClient, 'walletClient is required for fillAndDispatch')

    const { compact, mandateHash, fillInstructions, dispatchParameters } = params

    try {
      const txHash = await this.config.walletClient.writeContract({
        address: this.config.exarchAddress,
        abi: exarchAbi,
        functionName: 'fillAndDispatch',
        args: [compact, mandateHash, fillInstructions, dispatchParameters] as any,
        value: options?.value ?? 0n,
        chain: null,
        account: this.config.walletClient.account as Account,
      })

      // Compute hashes
      const claimHash = deriveExarchClaimHash(compact, mandateHash)
      const executionHash = deriveExecutionHash(fillInstructions, claimHash)

      return { txHash, claimHash, executionHash }
    } catch (error) {
      const compactError = extractCompactError(error, exarchAbi)
      if (compactError) throw compactError
      throw error
    }
  }

  /**
   * Dispatch a cross-chain callback for a prior fill
   *
   * Use when fill was executed separately and callback needs to be sent.
   *
   * @param params - Dispatch parameters
   * @param options - Transaction options
   * @returns Transaction hash and claim hash
   */
  async dispatch(params: DispatchParams, options?: { value?: bigint }): Promise<{ txHash: Hex; claimHash: Hex }> {
    invariant(this.config.walletClient, 'walletClient is required for dispatch')

    const { compact, mandateHash, dispatchParams, executionHash } = params

    try {
      const txHash = await this.config.walletClient.writeContract({
        address: this.config.exarchAddress,
        abi: exarchAbi,
        functionName: 'dispatch',
        args: [compact, mandateHash, dispatchParams, executionHash] as any,
        value: options?.value ?? 0n,
        chain: null,
        account: this.config.walletClient.account as Account,
      })

      const claimHash = deriveExarchClaimHash(compact, mandateHash)

      return { txHash, claimHash }
    } catch (error) {
      const compactError = extractCompactError(error, exarchAbi)
      if (compactError) throw compactError
      throw error
    }
  }

  /**
   * Atomic claim and fill for same-chain operations
   *
   * Processes the compact claim and fill in a single transaction.
   * Used when input and output are on the same chain.
   *
   * @param params - Claim and fill parameters
   * @param options - Transaction options
   * @returns Claim hash and derived amounts
   */
  async claimAndFill(params: ClaimAndFillParams, options?: { value?: bigint }): Promise<ClaimAndFillResult> {
    invariant(this.config.walletClient, 'walletClient is required for claimAndFill')

    const { claim, mandateHash, fillParams, adjustment, claimant } = params

    try {
      // Simulate to get return values
      const { result } = await this.config.publicClient.simulateContract({
        address: this.config.exarchAddress,
        abi: exarchAbi,
        functionName: 'claimAndFill',
        args: [claim, mandateHash, fillParams, adjustment, claimant] as any,
        value: options?.value ?? 0n,
        account: this.config.walletClient.account as Account,
      })

      const txHash = await this.config.walletClient.writeContract({
        address: this.config.exarchAddress,
        abi: exarchAbi,
        functionName: 'claimAndFill',
        args: [claim, mandateHash, fillParams, adjustment, claimant] as any,
        value: options?.value ?? 0n,
        chain: null,
        account: this.config.walletClient.account as Account,
      })

      return {
        txHash,
        claimHash: result[0],
        fillAmounts: result[1],
        claimAmounts: result[2],
      }
    } catch (error) {
      const compactError = extractCompactError(error, exarchAbi)
      if (compactError) throw compactError
      throw error
    }
  }

  /**
   * Atomic claim and fill via Permit2
   *
   * Same-chain atomic operation with Permit2 for token approval.
   *
   * @param params - Parameters including Permit2 args
   * @param options - Transaction options
   * @returns Claim hash and derived amounts
   */
  async claimAndFillViaPermit2(
    params: ClaimAndFillViaPermit2Params,
    options?: { value?: bigint }
  ): Promise<ClaimAndFillResult> {
    invariant(this.config.walletClient, 'walletClient is required for claimAndFillViaPermit2')

    const { claim, mandateHash, fillParams, adjustment, claimant, permit2Args } = params

    try {
      // Simulate to get return values
      const { result } = await this.config.publicClient.simulateContract({
        address: this.config.exarchAddress,
        abi: exarchAbi,
        functionName: 'claimAndFillViaPermit2',
        args: [claim, mandateHash, fillParams, adjustment, claimant, permit2Args] as any,
        value: options?.value ?? 0n,
        account: this.config.walletClient.account as Account,
      })

      const txHash = await this.config.walletClient.writeContract({
        address: this.config.exarchAddress,
        abi: exarchAbi,
        functionName: 'claimAndFillViaPermit2',
        args: [claim, mandateHash, fillParams, adjustment, claimant, permit2Args] as any,
        value: options?.value ?? 0n,
        chain: null,
        account: this.config.walletClient.account as Account,
      })

      return {
        txHash,
        claimHash: result[0],
        fillAmounts: result[1],
        claimAmounts: result[2],
      }
    } catch (error) {
      const compactError = extractCompactError(error, exarchAbi)
      if (compactError) throw compactError
      throw error
    }
  }

  // ============ View Operations ============

  /**
   * Get the current auction state for a claim hash
   *
   * @param claimHash - The claim hash to query
   * @returns Current auction state
   */
  async getAuctionState(claimHash: Hex): Promise<AuctionState> {
    const result = await this.config.publicClient.readContract({
      address: this.config.exarchAddress,
      abi: exarchAbi,
      functionName: 'getAuctionState',
      args: [claimHash],
    })

    return {
      bidder: result[0],
      bond: result[1],
      expiry: result[2],
      claimant: result[3],
      isFilled: result[4],
      cancelled: result[5],
    }
  }

  /**
   * Check if a new bid can be placed
   *
   * Returns true if the auction is not filled, not cancelled, and either
   * has no active bid or the bid window has expired.
   *
   * @param claimHash - The claim hash to check
   * @returns True if a bid can be placed
   */
  async canPlaceBid(claimHash: Hex): Promise<boolean> {
    return this.config.publicClient.readContract({
      address: this.config.exarchAddress,
      abi: exarchAbi,
      functionName: 'canPlaceBid',
      args: [claimHash],
    })
  }

  /**
   * Get the full bid state for a claim hash
   *
   * Returns unpacked state with all fields accessible.
   *
   * @param claimHash - The claim hash to query
   * @returns Unpacked bid state
   */
  async getBidState(claimHash: Hex): Promise<UnpackedBidState> {
    const result = await this.config.publicClient.readContract({
      address: this.config.exarchAddress,
      abi: exarchAbi,
      functionName: 'getBidState',
      args: [claimHash],
    })

    return unpackBidState({
      claimant: result.claimant,
      scalingFactor: result.scalingFactor,
      packedData: result.packedData,
    })
  }

  /**
   * Check if an execution hash has been filled
   *
   * @param executionHash - The execution hash to check
   * @returns True if executed
   */
  async isExecuted(executionHash: Hex): Promise<boolean> {
    return this.config.publicClient.readContract({
      address: this.config.exarchAddress,
      abi: exarchAbi,
      functionName: 'executed',
      args: [executionHash],
    })
  }

  /**
   * Check if an adjuster nonce has been consumed
   *
   * @param adjuster - The adjuster address
   * @param nonce - The nonce to check
   * @returns True if consumed
   */
  async isNonceConsumed(adjuster: Address, nonce: bigint): Promise<boolean> {
    return this.config.publicClient.readContract({
      address: this.config.exarchAddress,
      abi: exarchAbi,
      functionName: 'isNonceConsumed',
      args: [adjuster, nonce],
    })
  }

  // ============ Helper Methods ============

  /**
   * Compute the mandate hash for given parameters
   *
   * @param adjuster - Adjuster address
   * @param legate - Legate address
   * @param fills - Array of fill parameters
   * @returns The mandate hash
   */
  computeMandateHash(adjuster: Address, legate: Address, fills: ExarchFillParameters[]): Hex {
    const fillHashes = fills.map(deriveExarchFillHash)
    return deriveExarchMandateHash(adjuster, legate, fillHashes)
  }

  /**
   * Compute the claim hash for a compact and mandate
   *
   * @param compact - The batch compact
   * @param mandateHash - The mandate hash
   * @returns The claim hash
   */
  computeClaimHash(compact: BatchCompact, mandateHash: Hex): Hex {
    return deriveExarchClaimHash(compact, mandateHash)
  }

  /**
   * Compute the execution hash for fill instructions
   *
   * @param fillInstructions - Fill instructions
   * @param claimHash - The claim hash
   * @returns The execution hash
   */
  computeExecutionHash(fillInstructions: FillInstruction[], claimHash: Hex): Hex {
    return deriveExecutionHash(fillInstructions, claimHash)
  }
}

/**
 * Create an ExarchClient instance
 *
 * @param config - Client configuration
 * @returns ExarchClient instance
 *
 * @example
 * ```typescript
 * const client = createExarchClient({
 *   chainId: 1,
 *   exarchAddress: '0x...',
 *   publicClient,
 *   walletClient
 * })
 * ```
 */
export function createExarchClient(config: ExarchClientConfig): ExarchClient {
  return new ExarchClient(config)
}
