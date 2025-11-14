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

/**
 * Result of building a claim
 */
export interface BuiltClaim {
  struct: Claim
  hash?: `0x${string}`
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

    return {
      struct,
      // hash could be computed here if needed
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

  build(): { struct: BatchClaim } {
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

    return { struct }
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

  // Future: multichain(), batchMultichain()
}

