/**
 * Fluent builders for creating Claim payloads
 */

import type { Address, Hex } from 'viem'
import { Claim, BatchClaim, Component } from '../types/claims'
import { Compact, BatchCompact } from '../types/eip712'
import { CompactDomain } from '../config/domain'
import { MandateType } from './mandate'
import { ClaimantInput, buildComponent } from '../encoding/claimants'
import { decodeLockId, encodeLockId } from '../encoding/locks'
import invariant from 'tiny-invariant'
import { hashTypedData } from 'viem'

/**
 * Result of building a Claim with the claim builder
 * Contains the claim struct, its EIP-712 hash, and typed data for verification
 */
export interface BuiltClaim {
  /** The claim struct ready to be submitted on-chain */
  struct: Claim
  /** EIP-712 hash of the claim for verification */
  hash?: `0x${string}`
  /** EIP-712 typed data structure for signature verification */
  typedData?: {
    domain: CompactDomain
    types: Record<string, Array<{ name: string; type: string }>>
    primaryType: 'Claim'
    message: any
  }
}

/**
 * Fluent builder for creating single Claim messages
 *
 * A Claim is submitted by an arbiter to process a compact and distribute locked tokens
 * to one or more recipients. Claims specify how the locked amount should be allocated
 * among claimants through transfers, conversions, or withdrawals.
 *
 * @example
 * ```typescript
 * import { CompactClient } from '@uniswap/the-compact-sdk'
 *
 * const client = new CompactClient({ chainId: 1, address: '0x...' })
 *
 * // Build a claim from a signed compact
 * const claim = client.arbiter.claim()
 *   .fromCompact({
 *     compact: signedCompact.struct,
 *     signature: sponsorSignature,
 *   })
 *   .addTransfer({
 *     recipient: '0xRecipient1...',
 *     amount: 600000n
 *   })
 *   .addTransfer({
 *     recipient: '0xRecipient2...',
 *     amount: 400000n
 *   })
 *   .build()
 *
 * // Submit the claim
 * const hash = await client.arbiter.submitClaim(claim)
 *
 * // Or build manually
 * const claim2 = client.arbiter.claim()
 *   .sponsor('0xSponsor...')
 *   .nonce(1n)
 *   .expires(BigInt(Date.now() / 1000 + 3600))
 *   .id(12345n)
 *   .allocatedAmount(1000000n)
 *   .lockTag('0x000000000000000000000001')
 *   .addTransfer({ recipient: '0x...', amount: 500000n })
 *   .addWithdraw({ recipient: '0x...', amount: 500000n })
 *   .build()
 * ```
 */
export class SingleClaimBuilder {
  private domain: CompactDomain
  private _allocatorData: `0x${string}` = '0x'
  private _sponsorSignature: `0x${string}` = '0x'
  private _sponsor?: `0x${string}`
  private _nonce?: bigint
  private _expires?: bigint
  private _witness: `0x${string}` = '0x0000000000000000000000000000000000000000000000000000000000000000'
  private _witnessTypestring: string = ''
  private _id?: bigint
  private _allocatedAmount?: bigint
  private _claimants: Component[] = []
  private _lockTag?: `0x${string}`

  constructor(domain: CompactDomain) {
    this.domain = domain
  }

  /**
   * Pre-fill claim data from a compact and sponsor signature
   * Automatically extracts sponsor, nonce, expires, and lockTag from the compact
   * @param params - Object containing compact struct, signature, and optional id/token
   * @param params.compact - The compact struct to extract data from
   * @param params.signature - The sponsor's signature on the compact
   * @param params.id - Optional lock ID (computed from lockTag and token if not provided)
   * @param params.token - Optional token address for lock ID computation (uses compact.token if not provided)
   * @returns This builder for chaining
   */
  fromCompact(params: { compact: Compact; signature: `0x${string}`; id?: bigint; token?: `0x${string}` }): this {
    this._sponsor = params.compact.sponsor
    this._nonce = params.compact.nonce
    this._expires = params.compact.expires
    this._sponsorSignature = params.signature
    this._lockTag = params.compact.lockTag

    // Compute ID if not provided
    if (params.id !== undefined) {
      this._id = params.id
    } else if (params.token) {
      this._id = encodeLockId(params.compact.lockTag, params.token)
    } else {
      this._id = encodeLockId(params.compact.lockTag, params.compact.token)
    }

    return this
  }

  /**
   * Set the sponsor address who authorized this claim
   * @param sponsor - The sponsor's Ethereum address
   * @returns This builder for chaining
   */
  sponsor(sponsor: `0x${string}`): this {
    this._sponsor = sponsor
    return this
  }

  /**
   * Set the nonce for replay protection
   * Must match the nonce from the corresponding compact
   * @param nonce - Unique nonce value
   * @returns This builder for chaining
   */
  nonce(nonce: bigint): this {
    this._nonce = nonce
    return this
  }

  /**
   * Set the expiration timestamp
   * Must match the expiration from the corresponding compact
   * @param expires - Unix timestamp when this claim expires
   * @returns This builder for chaining
   */
  expires(expires: bigint): this {
    this._expires = expires
    return this
  }

  /**
   * Set allocator-specific data
   * This is typically the allocator's signature authorizing the claim
   * @param data - Allocator data (usually a signature)
   * @returns This builder for chaining
   */
  allocatorData(data: `0x${string}`): this {
    this._allocatorData = data
    return this
  }

  /**
   * Set the total amount allocated from the resource lock for this claim
   * This is the sum of all claimant amounts
   * @param amount - Total allocated amount in wei
   * @returns This builder for chaining
   */
  allocatedAmount(amount: bigint): this {
    this._allocatedAmount = amount
    return this
  }

  /**
   * Set the resource lock ID being claimed
   * This identifies which specific lock the claim is processing
   * @param id - The lock ID (ERC6909 token ID)
   * @returns This builder for chaining
   */
  id(id: bigint): this {
    this._id = id
    return this
  }

  /**
   * Set the lock tag for building claimants
   * Must be set before adding any claimants (transfers, converts, withdrawals)
   * @param lockTag - 12-byte lock tag identifying allocator, scope, and reset period
   * @returns This builder for chaining
   */
  lockTag(lockTag: `0x${string}`): this {
    this._lockTag = lockTag
    return this
  }

  /**
   * Set the sponsor's signature on the compact
   * Use empty string ('') for registered claims where hash was pre-registered on-chain
   * @param signature - Sponsor's EIP-712 signature or empty string for registered claims
   * @returns This builder for chaining
   */
  sponsorSignature(signature: `0x${string}` | ''): this {
    this._sponsorSignature = signature as `0x${string}`
    return this
  }

  /**
   * Set witness mandate data for compact verification
   * The witness provides additional authorization context for the claim
   * @param mandateType - The mandate type definition with hash and typestring
   * @param mandate - The mandate data object
   * @returns This builder for chaining
   */
  witness<T extends object>(mandateType: MandateType<T>, mandate: T): this {
    this._witness = mandateType.hash(mandate)
    this._witnessTypestring = mandateType.witnessTypestring
    return this
  }

  /**
   * Add a transfer claimant that receives ERC6909 tokens with the same lock tag
   * Tokens remain within The Compact as ERC6909s
   * @param params - Transfer parameters
   * @param params.recipient - Address to receive the transferred tokens
   * @param params.amount - Amount to transfer in wei
   * @returns This builder for chaining
   * @throws {Error} If lockTag is not set before calling this method
   */
  addTransfer(params: { recipient: `0x${string}`; amount: bigint }): this {
    invariant(this._lockTag, 'lockTag must be set before adding claimants')
    const component = buildComponent(this._lockTag, {
      kind: 'transfer',
      recipient: params.recipient,
      amount: params.amount,
    })
    this._claimants.push(component)
    return this
  }

  /**
   * Add a convert claimant that converts tokens to a different lock tag
   * Tokens remain as ERC6909 but with different reset period or scope
   * @param params - Convert parameters
   * @param params.recipient - Address to receive the converted tokens
   * @param params.amount - Amount to convert in wei
   * @param params.targetLockTag - The lock tag to convert to (different reset period or scope)
   * @returns This builder for chaining
   * @throws {Error} If lockTag is not set before calling this method
   */
  addConvert(params: { recipient: `0x${string}`; amount: bigint; targetLockTag: `0x${string}` }): this {
    invariant(this._lockTag, 'lockTag must be set before adding claimants')
    const component = buildComponent(this._lockTag, {
      kind: 'convert',
      recipient: params.recipient,
      amount: params.amount,
      targetLockTag: params.targetLockTag,
    })
    this._claimants.push(component)
    return this
  }

  /**
   * Add a withdrawal claimant that extracts underlying tokens from The Compact
   * Converts ERC6909 tokens back to native tokens and sends to recipient
   * @param params - Withdrawal parameters
   * @param params.recipient - Address to receive the underlying tokens
   * @param params.amount - Amount to withdraw in wei
   * @returns This builder for chaining
   * @throws {Error} If lockTag is not set before calling this method
   */
  addWithdraw(params: { recipient: `0x${string}`; amount: bigint }): this {
    invariant(this._lockTag, 'lockTag must be set before adding claimants')
    const component = buildComponent(this._lockTag, {
      kind: 'withdraw',
      recipient: params.recipient,
      amount: params.amount,
    })
    this._claimants.push(component)
    return this
  }

  /**
   * Add a claimant using the generic ClaimantInput interface
   * Provides flexibility to use any claimant type (transfer, convert, withdraw)
   * @param claimant - Claimant specification with kind, recipient, amount, and optional targetLockTag
   * @returns This builder for chaining
   * @throws {Error} If lockTag is not set before calling this method
   */
  addClaimant(claimant: ClaimantInput): this {
    invariant(this._lockTag, 'lockTag must be set before adding claimants')
    const component = buildComponent(this._lockTag, claimant)
    this._claimants.push(component)
    return this
  }

  /**
   * Add a pre-built Component directly to the claimants list
   * Use this for advanced scenarios where you need full control over component structure
   * @param component - Pre-built Component with claimant value and amount
   * @returns This builder for chaining
   */
  addComponent(component: Component): this {
    this._claimants.push(component)
    return this
  }

  build(): BuiltClaim {
    // Validate required fields
    invariant(this._sponsor, 'sponsor is required')
    invariant(this._nonce !== undefined, 'nonce is required')
    invariant(this._expires !== undefined, 'expires is required')
    invariant(this._id !== undefined, 'id is required')
    invariant(this._allocatedAmount !== undefined, 'allocatedAmount is required')
    invariant(this._claimants.length > 0, 'at least one claimant is required')

    const struct: Claim = {
      allocatorData: this._allocatorData,
      sponsorSignature: this._sponsorSignature,
      sponsor: this._sponsor,
      nonce: this._nonce,
      expires: this._expires,
      witness: this._witness,
      witnessTypestring: this._witnessTypestring,
      id: this._id,
      allocatedAmount: this._allocatedAmount,
      claimants: this._claimants,
    }

    // Build EIP-712 types
    const types: Record<string, Array<{ name: string; type: string }>> = {
      Claim: [
        { name: 'allocatorData', type: 'bytes' },
        { name: 'sponsor', type: 'address' },
        { name: 'nonce', type: 'uint256' },
        { name: 'expires', type: 'uint256' },
        { name: 'witness', type: 'bytes32' },
        { name: 'id', type: 'uint256' },
        { name: 'allocatedAmount', type: 'uint256' },
        { name: 'claimants', type: 'Component[]' },
      ],
      Component: [
        { name: 'claimant', type: 'uint256' },
        { name: 'amount', type: 'uint256' },
      ],
    }

    const message = {
      allocatorData: struct.allocatorData,
      sponsor: struct.sponsor,
      nonce: struct.nonce,
      expires: struct.expires,
      witness: struct.witness,
      id: struct.id,
      allocatedAmount: struct.allocatedAmount,
      claimants: struct.claimants,
    }

    const typedData = {
      domain: this.domain,
      types,
      primaryType: 'Claim' as const,
      message: message as unknown as Record<string, unknown>,
    }

    const hash = hashTypedData(typedData)

    return {
      struct,
      hash,
      typedData,
    }
  }
}

/**
 * Fluent builder for creating batch Claim messages
 *
 * A BatchClaim allows processing multiple resource locks from a single compact
 * in one transaction. This is useful when a BatchCompact locked multiple tokens
 * and you want to claim them all efficiently.
 *
 * @example
 * ```typescript
 * import { CompactClient } from '@uniswap/the-compact-sdk'
 *
 * const client = new CompactClient({ chainId: 1, address: '0x...' })
 *
 * // Build a batch claim from a signed batch compact
 * const batchClaim = client.arbiter.batchClaim()
 *   .fromBatchCompact({
 *     compact: signedBatchCompact.struct,
 *     signature: sponsorSignature,
 *     idsAndAmounts: [
 *       { lockTag: '0x...01', token: '0xUSDC...', amount: 1000000n },
 *       { lockTag: '0x...02', token: '0xWETH...', amount: 5000000000000000000n }
 *     ]
 *   })
 *   .addClaimant('0x...01', {
 *     kind: 'transfer',
 *     recipient: '0xRecipient1...',
 *     amount: 1000000n
 *   })
 *   .addClaimant('0x...02', {
 *     kind: 'transfer',
 *     recipient: '0xRecipient2...',
 *     amount: 5000000000000000000n
 *   })
 *   .build()
 * ```
 */

/**
 * Abstract base class for all batch claim builders
 * Contains common fields and methods shared across BatchClaim, BatchMultichainClaim, and ExogenousBatchMultichainClaim
 */
abstract class BaseBatchClaimBuilder implements IBatchClaimBuilder {
  protected domain: CompactDomain
  protected _allocatorData: Hex = '0x'
  protected _sponsorSignature: Hex = '0x'
  protected _sponsor?: Address
  protected _nonce?: bigint
  protected _expires?: bigint
  protected _witness: Hex = '0x0000000000000000000000000000000000000000000000000000000000000000'
  protected _witnessTypestring: string = ''
  protected claimComponentBuilders: BatchClaimComponentBuilder[] = []

  constructor(domain: CompactDomain) {
    this.domain = domain
  }

  /**
   * Set the sponsor address
   */
  sponsor(sponsor: Address): this {
    this._sponsor = sponsor
    return this
  }

  /**
   * Set the nonce
   */
  nonce(nonce: bigint): this {
    this._nonce = nonce
    return this
  }

  /**
   * Set the expiration timestamp
   */
  expires(expires: bigint): this {
    this._expires = expires
    return this
  }

  /**
   * Set allocator data
   */
  allocatorData(data: Hex): this {
    this._allocatorData = data
    return this
  }

  /**
   * Set sponsor signature
   */
  sponsorSignature(signature: Hex): this {
    this._sponsorSignature = signature
    return this
  }

  /**
   * Set witness mandate
   */
  witness<T extends object>(mandateType: MandateType<T>, mandate: T): this {
    this._witness = mandateType.hash(mandate)
    this._witnessTypestring = mandateType.witnessTypestring
    return this
  }

  /**
   * Add a new claim component to the batch
   */
  addClaim(): BatchClaimComponentBuilder {
    const builder = new BatchClaimComponentBuilder(this)
    this.claimComponentBuilders.push(builder)
    return builder
  }

  /**
   * Add an additional chain hash (only available on multichain builders)
   * Default implementation throws error, overridden by BatchMultichainClaimBuilder
   */
  addAdditionalChainHash(_hash: Hex): this {
    throw new Error('addAdditionalChainHash is only available on multichain claim builders')
  }

  /**
   * Build method must be implemented by subclasses
   */
  abstract build(): any
}

export class BatchClaimBuilder extends BaseBatchClaimBuilder {
  /**
   * Pre-fill claim data from a batch compact
   * Creates claim components with empty portions (claimants must be added separately)
   */
  fromBatchCompact(params: {
    compact: BatchCompact
    signature: Hex
    idsAndAmounts: Array<{ lockTag: Hex; token: Address; amount: bigint }>
  }): this {
    this._sponsor = params.compact.sponsor
    this._nonce = params.compact.nonce
    this._expires = params.compact.expires
    this._sponsorSignature = params.signature

    // Create a claim component for each id/amount pair
    params.idsAndAmounts.forEach(({ lockTag, token, amount }) => {
      const id = encodeLockId(lockTag, token)
      const builder = new BatchClaimComponentBuilder(this)
      builder.id(id).allocatedAmount(amount)
      this.claimComponentBuilders.push(builder)
    })

    return this
  }

  build(): { struct: BatchClaim; hash: `0x${string}`; typedData: any } {
    // Validate required fields
    invariant(this._sponsor, 'sponsor is required')
    invariant(this._nonce !== undefined, 'nonce is required')
    invariant(this._expires !== undefined, 'expires is required')
    invariant(this.claimComponentBuilders.length > 0, 'at least one claim component is required')

    const claims = this.claimComponentBuilders.map((b) => b.build())

    const struct: BatchClaim = {
      allocatorData: this._allocatorData,
      sponsorSignature: this._sponsorSignature,
      sponsor: this._sponsor,
      nonce: this._nonce,
      expires: this._expires,
      witness: this._witness,
      witnessTypestring: this._witnessTypestring,
      claims,
    }

    // Build EIP-712 types
    const types: Record<string, Array<{ name: string; type: string }>> = {
      BatchClaim: [
        { name: 'allocatorData', type: 'bytes' },
        { name: 'sponsor', type: 'address' },
        { name: 'nonce', type: 'uint256' },
        { name: 'expires', type: 'uint256' },
        { name: 'witness', type: 'bytes32' },
        { name: 'claims', type: 'BatchClaimComponent[]' },
      ],
      BatchClaimComponent: [
        { name: 'id', type: 'uint256' },
        { name: 'allocatedAmount', type: 'uint256' },
        { name: 'portions', type: 'Component[]' },
      ],
      Component: [
        { name: 'claimant', type: 'uint256' },
        { name: 'amount', type: 'uint256' },
      ],
    }

    const message = {
      allocatorData: struct.allocatorData,
      sponsor: struct.sponsor,
      nonce: struct.nonce,
      expires: struct.expires,
      witness: struct.witness,
      claims: struct.claims,
    }

    const typedData = {
      domain: this.domain,
      types,
      primaryType: 'BatchClaim' as const,
      message: message as unknown as Record<string, unknown>,
    }

    const hash = hashTypedData(typedData)

    return { struct, hash, typedData }
  }
}

/**
 * Parent builder interface for BatchClaimComponentBuilder
 * This allows the component builder to work with any batch claim builder type
 * without exposing private implementation details
 */
/**
 * Interface for batch claim parent builders
 * Declares all methods available on batch claim builders for type safety
 * Some methods (like addAdditionalChainHash) are only available on multichain builders
 */
interface IBatchClaimBuilder {
  sponsor(sponsor: Address): this
  nonce(nonce: bigint): this
  expires(expires: bigint): this
  allocatorData(data: Hex): this
  sponsorSignature(signature: Hex): this
  witness<T extends object>(mandateType: MandateType<T>, mandate: T): this
  addClaim(): BatchClaimComponentBuilder
  addAdditionalChainHash(hash: Hex): this
  build(): any
}

/**
 * Fluent builder for individual components within a batch multichain claim
 *
 * Each component represents a single resource ID with its allocated amount and
 * the portions (claimants) that will receive the funds. This builder is accessed
 * through BatchMultichainClaimBuilder.addClaim() and uses done() to return to
 * the parent builder.
 *
 * @example
 * ```typescript
 * // Used as part of BatchMultichainClaimBuilder
 * const batchMultichainClaim = client.arbiter.batchMultichainClaim()
 *   .sponsor('0xSponsor...')
 *   .nonce(1n)
 *   .expires(expires)
 *   .addClaim()
 *     .id(12345n)
 *     .allocatedAmount(1000000n)
 *     .addPortion('0x...01', {
 *       kind: 'transfer',
 *       recipient: '0xRecipient...',
 *       amount: 1000000n
 *     })
 *     .done()
 *   .build()
 * ```
 */
export class BatchClaimComponentBuilder {
  private _id?: bigint
  private _allocatedAmount?: bigint
  private _portions: Component[] = []
  private parent: IBatchClaimBuilder

  constructor(parent: IBatchClaimBuilder) {
    this.parent = parent
  }

  /**
   * Set the resource ID for this component
   * @param id - Resource ID
   * @returns This builder for chaining
   */
  id(id: bigint): this {
    this._id = id
    return this
  }

  /**
   * Set the allocated amount for this component
   * @param amount - Allocated amount
   * @returns This builder for chaining
   */
  allocatedAmount(amount: bigint): this {
    this._allocatedAmount = amount
    return this
  }

  /**
   * Add a portion (claimant component)
   * @param lockTag - Lock tag for the claimant
   * @param claimant - Claimant input specification
   * @returns This builder for chaining
   */
  addPortion(lockTag: `0x${string}`, claimant: ClaimantInput): this {
    const component = buildComponent(lockTag, claimant)
    this._portions.push(component)
    return this
  }

  /**
   * Add a raw component as a portion
   * @param component - Pre-built Component
   * @returns This builder for chaining
   */
  addComponent(component: Component): this {
    this._portions.push(component)
    return this
  }

  /**
   * Finish building this component and return to the parent builder
   * @returns The parent builder (BatchClaimBuilder, BatchMultichainClaimBuilder, or ExogenousBatchMultichainClaimBuilder)
   */
  done(): IBatchClaimBuilder {
    invariant(this._id !== undefined, 'id is required')
    invariant(this._allocatedAmount !== undefined, 'allocatedAmount is required')
    invariant(this._portions.length > 0, 'at least one portion is required')
    return this.parent
  }

  /**
   * Build the component (called internally by parent builder)
   * @returns The built BatchClaimComponent
   */
  build(): import('../types/claims').BatchClaimComponent {
    invariant(this._id !== undefined, 'id is required')
    invariant(this._allocatedAmount !== undefined, 'allocatedAmount is required')
    invariant(this._portions.length > 0, 'at least one portion is required')

    return {
      id: this._id,
      allocatedAmount: this._allocatedAmount,
      portions: this._portions,
    }
  }
}

/**
 * Fluent builder for creating multichain Claim messages
 *
 * A MultichainClaim allows claiming a single resource that's locked across multiple
 * chains. This is useful for cross-chain operations where a sponsor has locked tokens
 * on multiple chains and the arbiter needs to coordinate the claim across all chains.
 *
 * The additionalChains field contains hashes of claim elements on other chains,
 * creating a linked claim that can be validated across chains.
 *
 * @example
 * ```typescript
 * import { CompactClient } from '@uniswap/the-compact-sdk'
 *
 * const client = new CompactClient({ chainId: 1, address: '0x...' })
 *
 * // Build a multichain claim for Ethereum
 * const multichainClaim = client.arbiter.multichainClaim()
 *   .sponsor('0xSponsor...')
 *   .nonce(1n)
 *   .expires(BigInt(Date.now() / 1000 + 3600))
 *   .id(12345n)
 *   .allocatedAmount(1000000n)
 *   .lockTag('0x000000000000000000000001')
 *   .addTransfer({
 *     recipient: '0xRecipient...',
 *     amount: 1000000n
 *   })
 *   .addAdditionalChainHash('0x...') // Hash of the claim on Optimism
 *   .build()
 * ```
 */
export class MultichainClaimBuilder {
  private domain: CompactDomain
  private _allocatorData: `0x${string}` = '0x'
  private _sponsorSignature: `0x${string}` = '0x'
  private _sponsor?: `0x${string}`
  private _nonce?: bigint
  private _expires?: bigint
  private _witness: `0x${string}` = '0x0000000000000000000000000000000000000000000000000000000000000000'
  private _witnessTypestring: string = ''
  private _id?: bigint
  private _allocatedAmount?: bigint
  private _claimants: Component[] = []
  private _lockTag?: `0x${string}`
  private _additionalChains: `0x${string}`[] = []

  constructor(domain: CompactDomain) {
    this.domain = domain
  }

  /**
   * Set the sponsor address
   * @param sponsor - Sponsor address
   * @returns This builder for chaining
   */
  sponsor(sponsor: `0x${string}`): this {
    this._sponsor = sponsor
    return this
  }

  /**
   * Set the nonce
   * @param nonce - Nonce value
   * @returns This builder for chaining
   */
  nonce(nonce: bigint): this {
    this._nonce = nonce
    return this
  }

  /**
   * Set the expiration timestamp
   * @param expires - Expiration timestamp
   * @returns This builder for chaining
   */
  expires(expires: bigint): this {
    this._expires = expires
    return this
  }

  /**
   * Set allocator data
   * @param data - Allocator-specific data
   * @returns This builder for chaining
   */
  allocatorData(data: `0x${string}`): this {
    this._allocatorData = data
    return this
  }

  /**
   * Set the resource ID
   * @param id - Resource ID
   * @returns This builder for chaining
   */
  id(id: bigint): this {
    this._id = id
    return this
  }

  /**
   * Set the lock tag (used for building claimants)
   * @param lockTag - Lock tag
   * @returns This builder for chaining
   */
  lockTag(lockTag: `0x${string}`): this {
    this._lockTag = lockTag
    return this
  }

  /**
   * Set the allocated amount
   * @param amount - Allocated amount
   * @returns This builder for chaining
   */
  allocatedAmount(amount: bigint): this {
    this._allocatedAmount = amount
    return this
  }

  /**
   * Set sponsor signature
   * @param signature - Sponsor signature
   * @returns This builder for chaining
   */
  sponsorSignature(signature: `0x${string}`): this {
    this._sponsorSignature = signature
    return this
  }

  /**
   * Set witness mandate
   * @param mandateType - Mandate type definition
   * @param mandate - Mandate data
   * @returns This builder for chaining
   */
  witness<T extends object>(mandateType: MandateType<T>, mandate: T): this {
    this._witness = mandateType.hash(mandate)
    this._witnessTypestring = mandateType.witnessTypestring
    return this
  }

  /**
   * Add a transfer claimant (same lock tag)
   */
  addTransfer(params: { recipient: `0x${string}`; amount: bigint }): this {
    invariant(this._lockTag, 'lockTag must be set before adding claimants')
    const component = buildComponent(this._lockTag, {
      kind: 'transfer',
      recipient: params.recipient,
      amount: params.amount,
    })
    this._claimants.push(component)
    return this
  }

  /**
   * Add a convert claimant (different lock tag)
   */
  addConvert(params: { recipient: `0x${string}`; amount: bigint; targetLockTag: `0x${string}` }): this {
    invariant(this._lockTag, 'lockTag must be set before adding claimants')
    const component = buildComponent(this._lockTag, {
      kind: 'convert',
      recipient: params.recipient,
      amount: params.amount,
      targetLockTag: params.targetLockTag,
    })
    this._claimants.push(component)
    return this
  }

  /**
   * Add a withdraw claimant (withdraw underlying)
   */
  addWithdraw(params: { recipient: `0x${string}`; amount: bigint }): this {
    invariant(this._lockTag, 'lockTag must be set before adding claimants')
    const component = buildComponent(this._lockTag, {
      kind: 'withdraw',
      recipient: params.recipient,
      amount: params.amount,
    })
    this._claimants.push(component)
    return this
  }

  /**
   * Add a claimant using the generic ClaimantInput interface
   */
  addClaimant(claimant: ClaimantInput): this {
    invariant(this._lockTag, 'lockTag must be set before adding claimants')
    const component = buildComponent(this._lockTag, claimant)
    this._claimants.push(component)
    return this
  }

  /**
   * Add a raw component
   */
  addComponent(component: Component): this {
    this._claimants.push(component)
    return this
  }

  /**
   * Add a hash reference to another chain's element
   * @param hash - Hash of the element on another chain
   * @returns This builder for chaining
   */
  addAdditionalChainHash(hash: `0x${string}`): this {
    this._additionalChains.push(hash)
    return this
  }

  /**
   * Build the final multichain claim
   * @returns The built multichain claim struct
   */
  build(): { struct: import('../types/claims').MultichainClaim; hash: `0x${string}`; typedData: any } {
    invariant(this._sponsor, 'sponsor is required')
    invariant(this._nonce !== undefined, 'nonce is required')
    invariant(this._expires !== undefined, 'expires is required')
    invariant(this._id !== undefined, 'id is required')
    invariant(this._allocatedAmount !== undefined, 'allocatedAmount is required')
    invariant(this._claimants.length > 0, 'at least one claimant is required')

    const struct: import('../types/claims').MultichainClaim = {
      allocatorData: this._allocatorData,
      sponsorSignature: this._sponsorSignature,
      sponsor: this._sponsor,
      nonce: this._nonce,
      expires: this._expires,
      witness: this._witness,
      witnessTypestring: this._witnessTypestring,
      id: this._id,
      allocatedAmount: this._allocatedAmount,
      claimants: this._claimants,
      additionalChains: this._additionalChains,
    }

    // Build EIP-712 types
    const types: Record<string, Array<{ name: string; type: string }>> = {
      MultichainClaim: [
        { name: 'allocatorData', type: 'bytes' },
        { name: 'sponsor', type: 'address' },
        { name: 'nonce', type: 'uint256' },
        { name: 'expires', type: 'uint256' },
        { name: 'witness', type: 'bytes32' },
        { name: 'id', type: 'uint256' },
        { name: 'allocatedAmount', type: 'uint256' },
        { name: 'claimants', type: 'Component[]' },
        { name: 'additionalChains', type: 'bytes32[]' },
      ],
      Component: [
        { name: 'claimant', type: 'uint256' },
        { name: 'amount', type: 'uint256' },
      ],
    }

    const message = {
      allocatorData: struct.allocatorData,
      sponsor: struct.sponsor,
      nonce: struct.nonce,
      expires: struct.expires,
      witness: struct.witness,
      id: struct.id,
      allocatedAmount: struct.allocatedAmount,
      claimants: struct.claimants,
      additionalChains: struct.additionalChains,
    }

    const typedData = {
      domain: this.domain,
      types,
      primaryType: 'MultichainClaim' as const,
      message: message as unknown as Record<string, unknown>,
    }

    const hash = hashTypedData(typedData)

    return { struct, hash, typedData }
  }
}

/**
 * Fluent builder for creating batch multichain Claim messages
 *
 * A BatchMultichainClaim allows claiming multiple resources across multiple chains
 * in a single coordinated transaction. This is the most complex claim type, useful
 * when dealing with cross-chain operations involving multiple token locks.
 *
 * Each claim component represents a different resource ID with its own allocated
 * amount and portions (claimants). The additionalChains field links this claim
 * to corresponding claims on other chains.
 *
 * @example
 * ```typescript
 * import { CompactClient } from '@uniswap/the-compact-sdk'
 *
 * const client = new CompactClient({ chainId: 1, address: '0x...' })
 *
 * // Build a batch multichain claim
 * const batchMultichainClaim = client.arbiter.batchMultichainClaim()
 *   .sponsor('0xSponsor...')
 *   .nonce(1n)
 *   .expires(BigInt(Date.now() / 1000 + 3600))
 *   .addClaim()
 *     .id(12345n)
 *     .allocatedAmount(1000000n)
 *     .addPortion('0x...01', {
 *       kind: 'transfer',
 *       recipient: '0xRecipient1...',
 *       amount: 1000000n
 *     })
 *     .done()
 *   .addClaim()
 *     .id(67890n)
 *     .allocatedAmount(5000000000000000000n)
 *     .addPortion('0x...02', {
 *       kind: 'withdraw',
 *       recipient: '0xRecipient2...',
 *       amount: 5000000000000000000n
 *     })
 *     .done()
 *   .addAdditionalChainHash('0x...') // Hash of claim on another chain
 *   .build()
 * ```
 */
export class BatchMultichainClaimBuilder extends BaseBatchClaimBuilder {
  protected _additionalChains: Hex[] = []

  /**
   * Add a hash reference to another chain's element
   * @param hash - Hash of the element on another chain
   * @returns This builder for chaining
   */
  addAdditionalChainHash(hash: Hex): this {
    this._additionalChains.push(hash)
    return this
  }

  /**
   * Build the final batch multichain claim
   * @returns The built batch multichain claim struct
   */
  build(): { struct: import('../types/claims').BatchMultichainClaim; hash: `0x${string}`; typedData: any } {
    invariant(this._sponsor, 'sponsor is required')
    invariant(this._nonce !== undefined, 'nonce is required')
    invariant(this._expires !== undefined, 'expires is required')
    invariant(this.claimComponentBuilders.length > 0, 'at least one claim component is required')

    const claims = this.claimComponentBuilders.map((b) => b.build())

    const struct: import('../types/claims').BatchMultichainClaim = {
      allocatorData: this._allocatorData,
      sponsorSignature: this._sponsorSignature,
      sponsor: this._sponsor,
      nonce: this._nonce,
      expires: this._expires,
      witness: this._witness,
      witnessTypestring: this._witnessTypestring,
      claims,
      additionalChains: this._additionalChains,
    }

    // Build EIP-712 types
    const types: Record<string, Array<{ name: string; type: string }>> = {
      BatchMultichainClaim: [
        { name: 'allocatorData', type: 'bytes' },
        { name: 'sponsor', type: 'address' },
        { name: 'nonce', type: 'uint256' },
        { name: 'expires', type: 'uint256' },
        { name: 'witness', type: 'bytes32' },
        { name: 'claims', type: 'BatchClaimComponent[]' },
        { name: 'additionalChains', type: 'bytes32[]' },
      ],
      BatchClaimComponent: [
        { name: 'id', type: 'uint256' },
        { name: 'allocatedAmount', type: 'uint256' },
        { name: 'portions', type: 'Component[]' },
      ],
      Component: [
        { name: 'claimant', type: 'uint256' },
        { name: 'amount', type: 'uint256' },
      ],
    }

    const message = {
      allocatorData: struct.allocatorData,
      sponsor: struct.sponsor,
      nonce: struct.nonce,
      expires: struct.expires,
      witness: struct.witness,
      claims: struct.claims,
      additionalChains: struct.additionalChains,
    }

    const typedData = {
      domain: this.domain,
      types,
      primaryType: 'BatchMultichainClaim' as const,
      message: message as unknown as Record<string, unknown>,
    }

    const hash = hashTypedData(typedData)

    return { struct, hash, typedData }
  }
}

/**
 * Builder for exogenous multichain claims
 * Similar to MultichainClaimBuilder but includes explicit chain identification
 */
export class ExogenousMultichainClaimBuilder {
  private domain: CompactDomain
  private _allocatorData: `0x${string}` = '0x'
  private _sponsorSignature: `0x${string}` = '0x'
  private _sponsor?: `0x${string}`
  private _nonce?: bigint
  private _expires?: bigint
  private _witness: `0x${string}` = '0x0000000000000000000000000000000000000000000000000000000000000000'
  private _witnessTypestring: string = ''
  private _id?: bigint
  private _allocatedAmount?: bigint
  private _claimants: Component[] = []
  private _lockTag?: `0x${string}`
  private _additionalChains: `0x${string}`[] = []
  private _chainIndex?: bigint
  private _notarizedChainId?: bigint

  constructor(domain: CompactDomain) {
    this.domain = domain
  }

  sponsor(sponsor: `0x${string}`): this {
    this._sponsor = sponsor
    return this
  }

  nonce(nonce: bigint): this {
    this._nonce = nonce
    return this
  }

  expires(expires: bigint): this {
    this._expires = expires
    return this
  }

  allocatorData(data: `0x${string}`): this {
    this._allocatorData = data
    return this
  }

  id(id: bigint): this {
    this._id = id
    this._lockTag = decodeLockId(id).lockTag
    return this
  }

  lockTag(lockTag: `0x${string}`): this {
    this._lockTag = lockTag
    return this
  }

  allocatedAmount(amount: bigint): this {
    this._allocatedAmount = amount
    return this
  }

  sponsorSignature(signature: `0x${string}`): this {
    this._sponsorSignature = signature
    return this
  }

  witness<T extends object>(mandateType: MandateType<T>, mandate: T): this {
    this._witness = mandateType.hash(mandate)
    this._witnessTypestring = mandateType.witnessTypestring
    return this
  }

  /**
   * Set the chain index for this exogenous claim
   * @param chainIndex - Index of this chain in the multichain set
   * @returns This builder for chaining
   */
  chainIndex(chainIndex: bigint): this {
    this._chainIndex = chainIndex
    return this
  }

  /**
   * Set the notarized chain ID for this exogenous claim
   * @param notarizedChainId - Explicit chain ID for notarization
   * @returns This builder for chaining
   */
  notarizedChainId(notarizedChainId: bigint): this {
    this._notarizedChainId = notarizedChainId
    return this
  }

  addTransfer(params: { recipient: `0x${string}`; amount: bigint }): this {
    invariant(this._lockTag, 'lockTag must be set before adding claimants')
    const component = buildComponent(this._lockTag, {
      kind: 'transfer',
      recipient: params.recipient,
      amount: params.amount,
    })
    this._claimants.push(component)
    return this
  }

  addConvert(params: { recipient: `0x${string}`; amount: bigint; targetLockTag: `0x${string}` }): this {
    invariant(this._lockTag, 'lockTag must be set before adding claimants')
    const component = buildComponent(this._lockTag, {
      kind: 'convert',
      recipient: params.recipient,
      amount: params.amount,
      targetLockTag: params.targetLockTag,
    })
    this._claimants.push(component)
    return this
  }

  addWithdraw(params: { recipient: `0x${string}`; amount: bigint }): this {
    invariant(this._lockTag, 'lockTag must be set before adding claimants')
    const component = buildComponent(this._lockTag, {
      kind: 'withdraw',
      recipient: params.recipient,
      amount: params.amount,
    })
    this._claimants.push(component)
    return this
  }

  addClaimant(claimant: ClaimantInput): this {
    invariant(this._lockTag, 'lockTag must be set before adding claimants')
    const component = buildComponent(this._lockTag, claimant)
    this._claimants.push(component)
    return this
  }

  addComponent(component: Component): this {
    this._claimants.push(component)
    return this
  }

  addAdditionalChainHash(hash: `0x${string}`): this {
    this._additionalChains.push(hash)
    return this
  }

  build(): { struct: import('../types/claims').ExogenousMultichainClaim; hash: `0x${string}`; typedData: any } {
    invariant(this._sponsor, 'sponsor is required')
    invariant(this._nonce !== undefined, 'nonce is required')
    invariant(this._expires !== undefined, 'expires is required')
    invariant(this._id !== undefined, 'id is required')
    invariant(this._allocatedAmount !== undefined, 'allocatedAmount is required')
    invariant(this._claimants.length > 0, 'at least one claimant is required')
    invariant(this._chainIndex !== undefined, 'chainIndex is required')
    invariant(this._notarizedChainId !== undefined, 'notarizedChainId is required')

    const struct: import('../types/claims').ExogenousMultichainClaim = {
      allocatorData: this._allocatorData,
      sponsorSignature: this._sponsorSignature,
      sponsor: this._sponsor,
      nonce: this._nonce,
      expires: this._expires,
      witness: this._witness,
      witnessTypestring: this._witnessTypestring,
      id: this._id,
      allocatedAmount: this._allocatedAmount,
      claimants: this._claimants,
      additionalChains: this._additionalChains,
      chainIndex: this._chainIndex,
      notarizedChainId: this._notarizedChainId,
    }

    const types: Record<string, Array<{ name: string; type: string }>> = {
      ExogenousMultichainClaim: [
        { name: 'allocatorData', type: 'bytes' },
        { name: 'sponsor', type: 'address' },
        { name: 'nonce', type: 'uint256' },
        { name: 'expires', type: 'uint256' },
        { name: 'witness', type: 'bytes32' },
        { name: 'id', type: 'uint256' },
        { name: 'allocatedAmount', type: 'uint256' },
        { name: 'claimants', type: 'Component[]' },
        { name: 'additionalChains', type: 'bytes32[]' },
        { name: 'chainIndex', type: 'uint256' },
        { name: 'notarizedChainId', type: 'uint256' },
      ],
      Component: [
        { name: 'claimant', type: 'uint256' },
        { name: 'amount', type: 'uint256' },
      ],
    }

    const message = {
      allocatorData: struct.allocatorData,
      sponsor: struct.sponsor,
      nonce: struct.nonce,
      expires: struct.expires,
      witness: struct.witness,
      id: struct.id,
      allocatedAmount: struct.allocatedAmount,
      claimants: struct.claimants,
      additionalChains: struct.additionalChains,
      chainIndex: struct.chainIndex,
      notarizedChainId: struct.notarizedChainId,
    }

    const typedData = {
      domain: this.domain,
      types,
      primaryType: 'ExogenousMultichainClaim' as const,
      message: message as unknown as Record<string, unknown>,
    }

    const hash = hashTypedData(typedData)

    return { struct, hash, typedData }
  }
}

/**
 * Builder for exogenous batch multichain claims
 * Similar to BatchMultichainClaimBuilder but includes explicit chain identification
 */
export class ExogenousBatchMultichainClaimBuilder extends BatchMultichainClaimBuilder {
  private _chainIndex?: bigint
  private _notarizedChainId?: bigint

  /**
   * Set the chain index for this exogenous claim
   * @param chainIndex - Index of this chain in the multichain set
   * @returns This builder for chaining
   */
  chainIndex(chainIndex: bigint): this {
    this._chainIndex = chainIndex
    return this
  }

  /**
   * Set the notarized chain ID for this exogenous claim
   * @param notarizedChainId - Explicit chain ID for notarization
   * @returns This builder for chaining
   */
  notarizedChainId(notarizedChainId: bigint): this {
    this._notarizedChainId = notarizedChainId
    return this
  }

  build(): { struct: import('../types/claims').ExogenousBatchMultichainClaim; hash: `0x${string}`; typedData: any } {
    invariant(this._sponsor, 'sponsor is required')
    invariant(this._nonce !== undefined, 'nonce is required')
    invariant(this._expires !== undefined, 'expires is required')
    invariant(this.claimComponentBuilders.length > 0, 'at least one claim component is required')
    invariant(this._chainIndex !== undefined, 'chainIndex is required')
    invariant(this._notarizedChainId !== undefined, 'notarizedChainId is required')

    const claims = this.claimComponentBuilders.map((b) => b.build())

    const struct: import('../types/claims').ExogenousBatchMultichainClaim = {
      allocatorData: this._allocatorData,
      sponsorSignature: this._sponsorSignature,
      sponsor: this._sponsor,
      nonce: this._nonce,
      expires: this._expires,
      witness: this._witness,
      witnessTypestring: this._witnessTypestring,
      claims,
      additionalChains: this._additionalChains,
      chainIndex: this._chainIndex,
      notarizedChainId: this._notarizedChainId,
    }

    const types: Record<string, Array<{ name: string; type: string }>> = {
      ExogenousBatchMultichainClaim: [
        { name: 'allocatorData', type: 'bytes' },
        { name: 'sponsor', type: 'address' },
        { name: 'nonce', type: 'uint256' },
        { name: 'expires', type: 'uint256' },
        { name: 'witness', type: 'bytes32' },
        { name: 'claims', type: 'BatchClaimComponent[]' },
        { name: 'additionalChains', type: 'bytes32[]' },
        { name: 'chainIndex', type: 'uint256' },
        { name: 'notarizedChainId', type: 'uint256' },
      ],
      BatchClaimComponent: [
        { name: 'id', type: 'uint256' },
        { name: 'allocatedAmount', type: 'uint256' },
        { name: 'portions', type: 'Component[]' },
      ],
      Component: [
        { name: 'claimant', type: 'uint256' },
        { name: 'amount', type: 'uint256' },
      ],
    }

    const message = {
      allocatorData: struct.allocatorData,
      sponsor: struct.sponsor,
      nonce: struct.nonce,
      expires: struct.expires,
      witness: struct.witness,
      claims: struct.claims,
      additionalChains: struct.additionalChains,
      chainIndex: struct.chainIndex,
      notarizedChainId: struct.notarizedChainId,
    }

    const typedData = {
      domain: this.domain,
      types,
      primaryType: 'ExogenousBatchMultichainClaim' as const,
      message: message as unknown as Record<string, unknown>,
    }

    const hash = hashTypedData(typedData)

    return { struct, hash, typedData }
  }
}

/**
 * Main ClaimBuilder class with static factory methods
 */
export class ClaimBuilder {
  static single(domain: CompactDomain): SingleClaimBuilder {
    return new SingleClaimBuilder(domain)
  }

  static batch(domain: CompactDomain): BatchClaimBuilder {
    return new BatchClaimBuilder(domain)
  }

  /**
   * Create a multichain claim builder for single resource claims across multiple chains
   * @param domain - EIP-712 domain
   * @returns A new MultichainClaimBuilder
   */
  static multichain(domain: CompactDomain): MultichainClaimBuilder {
    return new MultichainClaimBuilder(domain)
  }

  /**
   * Create a batch multichain claim builder for multiple resources across multiple chains
   * @param domain - EIP-712 domain
   * @returns A new BatchMultichainClaimBuilder
   */
  static batchMultichain(domain: CompactDomain): BatchMultichainClaimBuilder {
    return new BatchMultichainClaimBuilder(domain)
  }

  /**
   * Create an exogenous multichain claim builder for single resource claims across multiple chains with explicit chain identification
   * @param domain - EIP-712 domain
   * @returns A new ExogenousMultichainClaimBuilder
   */
  static exogenousMultichain(domain: CompactDomain): ExogenousMultichainClaimBuilder {
    return new ExogenousMultichainClaimBuilder(domain)
  }

  /**
   * Create an exogenous batch multichain claim builder for multiple resources across multiple chains with explicit chain identification
   * @param domain - EIP-712 domain
   * @returns A new ExogenousBatchMultichainClaimBuilder
   */
  static exogenousBatchMultichain(domain: CompactDomain): ExogenousBatchMultichainClaimBuilder {
    return new ExogenousBatchMultichainClaimBuilder(domain)
  }
}
