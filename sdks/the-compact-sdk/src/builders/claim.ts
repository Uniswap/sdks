/**
 * Fluent builders for creating Claim payloads
 */

import { Claim, BatchClaim, Component } from '../types/claims'
import { Compact, BatchCompact } from '../types/eip712'
import { CompactDomain } from '../config/domain'
import { MandateType } from './mandate'
import { ClaimantInput, buildComponent } from '../encoding/claimants'
import { encodeLockId } from '../encoding/locks'
import invariant from 'tiny-invariant'
import { hashTypedData } from 'viem'

/**
 * Result of building a claim
 */
export interface BuiltClaim {
  struct: Claim
  hash?: `0x${string}`
  typedData?: {
    domain: CompactDomain
    types: Record<string, Array<{ name: string; type: string }>>
    primaryType: 'Claim'
    message: any
  }
}

/**
 * Builder for single Claim messages
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
   * Pre-fill claim data from a compact
   */
  fromCompact(params: {
    compact: Compact
    signature: `0x${string}`
    id?: bigint
    token?: `0x${string}`
  }): this {
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

  allocator(allocator: `0x${string}`): this {
    // Allocator address could be encoded in allocatorData
    // For now, this is a no-op placeholder
    return this
  }

  allocatorData(data: `0x${string}`): this {
    this._allocatorData = data
    return this
  }

  allocatedAmount(amount: bigint): this {
    this._allocatedAmount = amount
    return this
  }

  id(id: bigint): this {
    this._id = id
    return this
  }

  lockTag(lockTag: `0x${string}`): this {
    this._lockTag = lockTag
    return this
  }

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
      message,
    }

    const hash = (hashTypedData as any)(typedData as any)

    return {
      struct,
      hash,
      typedData,
    }
  }
}

/**
 * Builder for batch claims (multiple IDs from a single compact)
 */
export class BatchClaimBuilder {
  private domain: CompactDomain
  private _allocatorData: `0x${string}` = '0x'
  private _sponsorSignature: `0x${string}` = '0x'
  private _sponsor?: `0x${string}`
  private _nonce?: bigint
  private _expires?: bigint
  private _witness: `0x${string}` = '0x0000000000000000000000000000000000000000000000000000000000000000'
  private _witnessTypestring: string = ''
  private _idsAndAmounts: Array<{ id: bigint; amount: bigint }> = []
  private _claimants: Component[] = []

  constructor(domain: CompactDomain) {
    this.domain = domain
  }

  /**
   * Pre-fill claim data from a batch compact
   */
  fromBatchCompact(params: {
    compact: BatchCompact
    signature: `0x${string}`
    idsAndAmounts: Array<{ lockTag: `0x${string}`; token: `0x${string}`; amount: bigint }>
  }): this {
    this._sponsor = params.compact.sponsor
    this._nonce = params.compact.nonce
    this._expires = params.compact.expires
    this._sponsorSignature = params.signature

    // Compute IDs from lockTags and tokens
    this._idsAndAmounts = params.idsAndAmounts.map(({ lockTag, token, amount }) => ({
      id: encodeLockId(lockTag, token),
      amount,
    }))

    return this
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

  addIdAndAmount(id: bigint, amount: bigint): this {
    this._idsAndAmounts.push({ id, amount })
    return this
  }

  witness<T extends object>(mandateType: MandateType<T>, mandate: T): this {
    this._witness = mandateType.hash(mandate)
    this._witnessTypestring = mandateType.witnessTypestring
    return this
  }

  /**
   * Add a claimant component directly
   */
  addComponent(component: Component): this {
    this._claimants.push(component)
    return this
  }

  /**
   * Add a claimant using the generic ClaimantInput interface
   * Note: For batch claims, you need to specify which lockTag the claimant is for
   */
  addClaimant(lockTag: `0x${string}`, claimant: ClaimantInput): this {
    const component = buildComponent(lockTag, claimant)
    this._claimants.push(component)
    return this
  }

  build(): { struct: BatchClaim; hash: `0x${string}`; typedData: any } {
    // Validate required fields
    invariant(this._sponsor, 'sponsor is required')
    invariant(this._nonce !== undefined, 'nonce is required')
    invariant(this._expires !== undefined, 'expires is required')
    invariant(this._idsAndAmounts.length > 0, 'at least one id and amount is required')
    invariant(this._claimants.length > 0, 'at least one claimant is required')

    const struct: BatchClaim = {
      allocatorData: this._allocatorData,
      sponsorSignature: this._sponsorSignature,
      sponsor: this._sponsor,
      nonce: this._nonce,
      expires: this._expires,
      witness: this._witness,
      witnessTypestring: this._witnessTypestring,
      idsAndAmounts: this._idsAndAmounts,
      claimants: this._claimants,
    }

    // Build EIP-712 types
    const types: Record<string, Array<{ name: string; type: string }>> = {
      BatchClaim: [
        { name: 'allocatorData', type: 'bytes' },
        { name: 'sponsor', type: 'address' },
        { name: 'nonce', type: 'uint256' },
        { name: 'expires', type: 'uint256' },
        { name: 'witness', type: 'bytes32' },
        { name: 'idsAndAmounts', type: 'IdAndAmount[]' },
        { name: 'claimants', type: 'Component[]' },
      ],
      IdAndAmount: [
        { name: 'id', type: 'uint256' },
        { name: 'amount', type: 'uint256' },
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
      idsAndAmounts: struct.idsAndAmounts,
      claimants: struct.claimants,
    }

    const typedData = {
      domain: this.domain,
      types,
      primaryType: 'BatchClaim' as const,
      message,
    }

    const hash = (hashTypedData as any)(typedData as any)

    return { struct, hash, typedData }
  }
}

/**
 * Builder for batch claim component portions
 */
export class BatchClaimComponentBuilder {
  private _id?: bigint
  private _allocatedAmount?: bigint
  private _portions: Component[] = []
  private parent: BatchMultichainClaimBuilder

  constructor(parent: BatchMultichainClaimBuilder) {
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
   * @returns The parent BatchMultichainClaimBuilder
   */
  done(): BatchMultichainClaimBuilder {
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
 * Builder for multichain claims (single resource, multiple chains)
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
      message,
    }

    const hash = (hashTypedData as any)(typedData as any)

    return { struct, hash, typedData }
  }
}

/**
 * Builder for batch multichain claims (multiple resources, multiple chains)
 */
export class BatchMultichainClaimBuilder {
  private domain: CompactDomain
  private _allocatorData: `0x${string}` = '0x'
  private _sponsorSignature: `0x${string}` = '0x'
  private _sponsor?: `0x${string}`
  private _nonce?: bigint
  private _expires?: bigint
  private _witness: `0x${string}` = '0x0000000000000000000000000000000000000000000000000000000000000000'
  private _witnessTypestring: string = ''
  private claimComponentBuilders: BatchClaimComponentBuilder[] = []
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
   * Add a new claim component to the batch
   * @returns A new BatchClaimComponentBuilder
   */
  addClaim(): BatchClaimComponentBuilder {
    const builder = new BatchClaimComponentBuilder(this)
    this.claimComponentBuilders.push(builder)
    return builder
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
      message,
    }

    const hash = (hashTypedData as any)(typedData as any)

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
}

