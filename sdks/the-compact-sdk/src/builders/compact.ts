/**
 * Fluent builders for creating Compact, BatchCompact, and MultichainCompact messages
 */

import { Compact, BatchCompact, MultichainCompact, Lock, MultichainElement } from '../types/eip712'
import { CompactDomain } from '../config/domain'
import { MandateType } from './mandate'
import invariant from 'tiny-invariant'
import { hashTypedData } from 'viem'

/**
 * Result of building a compact
 */
export interface BuiltCompact<TMandate extends object | undefined = undefined> {
  struct: Compact
  mandate?: TMandate
  mandateType?: MandateType<TMandate extends object ? TMandate : any>
  hash: `0x${string}`
  typedData: {
    domain: CompactDomain
    types: Record<string, Array<{ name: string; type: string }>>
    primaryType: 'Compact'
    message: any
  }
}

/**
 * Result of building a batch compact
 */
export interface BuiltBatchCompact<TMandate extends object | undefined = undefined> {
  struct: BatchCompact
  mandate?: TMandate
  mandateType?: MandateType<TMandate extends object ? TMandate : any>
  hash: `0x${string}`
  typedData: {
    domain: CompactDomain
    types: Record<string, Array<{ name: string; type: string }>>
    primaryType: 'BatchCompact'
    message: any
  }
}

/**
 * Result of building a multichain compact
 */
export interface BuiltMultichainCompact<TMandate extends object | undefined = undefined> {
  struct: MultichainCompact
  hash: `0x${string}`
  typedData: {
    domain: CompactDomain
    types: Record<string, Array<{ name: string; type: string }>>
    primaryType: 'MultichainCompact'
    message: any
  }
}

/**
 * Builder for single Compact messages
 */
export class SingleCompactBuilder<TMandate extends object | undefined = undefined> {
  private domain: CompactDomain
  private _arbiter?: `0x${string}`
  private _sponsor?: `0x${string}`
  private _nonce?: bigint
  private _expires?: bigint
  private _lockTag?: `0x${string}`
  private _token?: `0x${string}`
  private _amount?: bigint
  private _mandate?: TMandate
  private _mandateType?: MandateType<TMandate extends object ? TMandate : any>

  constructor(domain: CompactDomain) {
    this.domain = domain
  }

  arbiter(arbiter: `0x${string}`): this {
    this._arbiter = arbiter
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

  expires(timestamp: bigint): this {
    this._expires = timestamp
    return this
  }

  expiresAt(timestamp: bigint): this {
    return this.expires(timestamp)
  }

  expiresIn(duration: string | number): this {
    const seconds = typeof duration === 'string' ? parseDuration(duration) : BigInt(duration)
    const now = BigInt(Math.floor(Date.now() / 1000))
    return this.expires(now + seconds)
  }

  lockTag(lockTag: `0x${string}`): this {
    this._lockTag = lockTag
    return this
  }

  token(token: `0x${string}`): this {
    this._token = token
    return this
  }

  amount(amount: bigint): this {
    this._amount = amount
    return this
  }

  witness<T extends object>(mandateType: MandateType<T>, mandate: T): SingleCompactBuilder<T> {
    const builder = this as any as SingleCompactBuilder<T>
    builder._mandateType = mandateType
    builder._mandate = mandate
    return builder
  }

  build(): BuiltCompact<TMandate> {
    // Validate required fields
    invariant(this._arbiter, 'arbiter is required')
    invariant(this._sponsor, 'sponsor is required')
    invariant(this._nonce !== undefined, 'nonce is required')
    invariant(this._expires !== undefined, 'expires is required')
    invariant(this._lockTag, 'lockTag is required')
    invariant(this._token, 'token is required')
    invariant(this._amount !== undefined, 'amount is required')

    const struct: Compact = {
      arbiter: this._arbiter,
      sponsor: this._sponsor,
      nonce: this._nonce,
      expires: this._expires,
      lockTag: this._lockTag,
      token: this._token,
      amount: this._amount,
    }

    // Build EIP-712 types
    const types: Record<string, Array<{ name: string; type: string }>> = {
      Compact: [
        { name: 'arbiter', type: 'address' },
        { name: 'sponsor', type: 'address' },
        { name: 'nonce', type: 'uint256' },
        { name: 'expires', type: 'uint256' },
        { name: 'lockTag', type: 'bytes12' },
        { name: 'token', type: 'address' },
        { name: 'amount', type: 'uint256' },
      ],
    }

    let message: any = { ...struct }

    // Add mandate if present
    if (this._mandateType && this._mandate) {
      types.Compact.push({ name: 'mandate', type: 'Mandate' })
      types.Mandate = this._mandateType.fields.map((f) => ({ name: f.name, type: f.type }))

      // Add nested types
      if (this._mandateType.nestedTypes) {
        for (const [typeName, fields] of Object.entries(this._mandateType.nestedTypes)) {
          types[typeName] = fields.map((f) => ({ name: f.name, type: f.type }))
        }
      }

      message.mandate = this._mandate
    }

    const typedData = {
      domain: this.domain,
      types,
      primaryType: 'Compact' as const,
      message,
    }

    const hash = (hashTypedData as any)(typedData as any)

    return {
      struct,
      mandate: this._mandate,
      mandateType: this._mandateType,
      hash,
      typedData,
    }
  }
}

/**
 * Builder for BatchCompact messages
 */
export class BatchCompactBuilder<TMandate extends object | undefined = undefined> {
  private domain: CompactDomain
  private _arbiter?: `0x${string}`
  private _sponsor?: `0x${string}`
  private _nonce?: bigint
  private _expires?: bigint
  private _commitments: Lock[] = []
  private _mandate?: TMandate
  private _mandateType?: MandateType<TMandate extends object ? TMandate : any>

  constructor(domain: CompactDomain) {
    this.domain = domain
  }

  arbiter(arbiter: `0x${string}`): this {
    this._arbiter = arbiter
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

  expires(timestamp: bigint): this {
    this._expires = timestamp
    return this
  }

  expiresAt(timestamp: bigint): this {
    return this.expires(timestamp)
  }

  expiresIn(duration: string | number): this {
    const seconds = typeof duration === 'string' ? parseDuration(duration) : BigInt(duration)
    const now = BigInt(Math.floor(Date.now() / 1000))
    return this.expires(now + seconds)
  }

  addLock(lock: Lock): this {
    this._commitments.push(lock)
    return this
  }

  addCommitment(lock: Lock): this {
    return this.addLock(lock)
  }

  witness<T extends object>(mandateType: MandateType<T>, mandate: T): BatchCompactBuilder<T> {
    const builder = this as any as BatchCompactBuilder<T>
    builder._mandateType = mandateType
    builder._mandate = mandate
    return builder
  }

  build(): BuiltBatchCompact<TMandate> {
    // Validate required fields
    invariant(this._arbiter, 'arbiter is required')
    invariant(this._sponsor, 'sponsor is required')
    invariant(this._nonce !== undefined, 'nonce is required')
    invariant(this._expires !== undefined, 'expires is required')
    invariant(this._commitments.length > 0, 'at least one commitment is required')

    const struct: BatchCompact = {
      arbiter: this._arbiter,
      sponsor: this._sponsor,
      nonce: this._nonce,
      expires: this._expires,
      commitments: this._commitments,
    }

    // Build EIP-712 types
    const types: Record<string, Array<{ name: string; type: string }>> = {
      BatchCompact: [
        { name: 'arbiter', type: 'address' },
        { name: 'sponsor', type: 'address' },
        { name: 'nonce', type: 'uint256' },
        { name: 'expires', type: 'uint256' },
        { name: 'commitments', type: 'Lock[]' },
      ],
      Lock: [
        { name: 'lockTag', type: 'bytes12' },
        { name: 'token', type: 'address' },
        { name: 'amount', type: 'uint256' },
      ],
    }

    let message: any = { ...struct }

    // Add mandate if present
    if (this._mandateType && this._mandate) {
      types.BatchCompact.push({ name: 'mandate', type: 'Mandate' })
      types.Mandate = this._mandateType.fields.map((f) => ({ name: f.name, type: f.type }))

      if (this._mandateType.nestedTypes) {
        for (const [typeName, fields] of Object.entries(this._mandateType.nestedTypes)) {
          types[typeName] = fields.map((f) => ({ name: f.name, type: f.type }))
        }
      }

      message.mandate = this._mandate
    }

    const typedData = {
      domain: this.domain,
      types,
      primaryType: 'BatchCompact' as const,
      message,
    }

    const hash = (hashTypedData as any)(typedData as any)

    return {
      struct,
      mandate: this._mandate,
      mandateType: this._mandateType,
      hash,
      typedData,
    }
  }
}

/**
 * Builder for multichain element
 */
export class MultichainElementBuilder {
  private _arbiter?: `0x${string}`
  private _chainId?: bigint
  private _commitments: Lock[] = []
  private _mandate?: any
  private _mandateType?: MandateType<any>
  private parent: MultichainCompactBuilder

  constructor(parent: MultichainCompactBuilder) {
    this.parent = parent
  }

  arbiter(arbiter: `0x${string}`): this {
    this._arbiter = arbiter
    return this
  }

  chainId(chainId: bigint): this {
    this._chainId = chainId
    return this
  }

  addCommitment(lock: Lock): this {
    this._commitments.push(lock)
    return this
  }

  witness<T extends object>(mandateType: MandateType<T>, mandate: T): this {
    this._mandateType = mandateType
    this._mandate = mandate
    return this
  }

  /**
   * Finish building this element and return to the parent multichain compact builder
   * This allows for fluent chaining: builder.addElement()...done().addElement()...done().build()
   */
  done(): MultichainCompactBuilder {
    // Validate element is complete before returning to parent
    invariant(this._arbiter, 'arbiter is required')
    invariant(this._chainId !== undefined, 'chainId is required')
    invariant(this._commitments.length > 0, 'at least one commitment is required')
    invariant(this._mandateType && this._mandate, 'witness is required for multichain elements')

    return this.parent
  }

  build(): { element: MultichainElement; mandateType?: MandateType<any>; mandate?: any } {
    invariant(this._arbiter, 'arbiter is required')
    invariant(this._chainId !== undefined, 'chainId is required')
    invariant(this._commitments.length > 0, 'at least one commitment is required')
    invariant(this._mandateType && this._mandate, 'witness is required for multichain elements')

    return {
      element: {
        arbiter: this._arbiter,
        chainId: this._chainId,
        commitments: this._commitments,
      },
      mandateType: this._mandateType,
      mandate: this._mandate,
    }
  }
}

/**
 * Builder for MultichainCompact messages
 */
export class MultichainCompactBuilder {
  private domain: CompactDomain
  private _sponsor?: `0x${string}`
  private _nonce?: bigint
  private _expires?: bigint
  private elementBuilders: MultichainElementBuilder[] = []

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

  expires(timestamp: bigint): this {
    this._expires = timestamp
    return this
  }

  expiresAt(timestamp: bigint): this {
    return this.expires(timestamp)
  }

  expiresIn(duration: string | number): this {
    const seconds = typeof duration === 'string' ? parseDuration(duration) : BigInt(duration)
    const now = BigInt(Math.floor(Date.now() / 1000))
    return this.expires(now + seconds)
  }

  addElement(): MultichainElementBuilder {
    const builder = new MultichainElementBuilder(this)
    this.elementBuilders.push(builder)
    return builder
  }

  build(): BuiltMultichainCompact {
    invariant(this._sponsor, 'sponsor is required')
    invariant(this._nonce !== undefined, 'nonce is required')
    invariant(this._expires !== undefined, 'expires is required')
    invariant(this.elementBuilders.length > 0, 'at least one element is required')

    // Build all elements
    const builtElements = this.elementBuilders.map((b) => b.build())
    const elements = builtElements.map((b) => b.element)

    const struct: MultichainCompact = {
      sponsor: this._sponsor,
      nonce: this._nonce,
      expires: this._expires,
      elements,
    }

    // Build EIP-712 types
    const types: Record<string, Array<{ name: string; type: string }>> = {
      MultichainCompact: [
        { name: 'sponsor', type: 'address' },
        { name: 'nonce', type: 'uint256' },
        { name: 'expires', type: 'uint256' },
        { name: 'elements', type: 'Element[]' },
      ],
      Element: [
        { name: 'arbiter', type: 'address' },
        { name: 'chainId', type: 'uint256' },
        { name: 'commitments', type: 'Lock[]' },
        { name: 'mandate', type: 'Mandate' },
      ],
      Lock: [
        { name: 'lockTag', type: 'bytes12' },
        { name: 'token', type: 'address' },
        { name: 'amount', type: 'uint256' },
      ],
    }

    // Add mandate types from first element (assuming all use same mandate type)
    const firstMandate = builtElements[0]
    if (firstMandate.mandateType) {
      types.Mandate = firstMandate.mandateType.fields.map((f) => ({ name: f.name, type: f.type }))

      if (firstMandate.mandateType.nestedTypes) {
        for (const [typeName, fields] of Object.entries(firstMandate.mandateType.nestedTypes)) {
          types[typeName] = fields.map((f) => ({ name: f.name, type: f.type }))
        }
      }
    }

    // Build message with mandates
    const message = {
      sponsor: struct.sponsor,
      nonce: struct.nonce,
      expires: struct.expires,
      elements: elements.map((el, i) => ({
        ...el,
        mandate: builtElements[i].mandate,
      })),
    }

    const typedData = {
      domain: this.domain,
      types,
      primaryType: 'MultichainCompact' as const,
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
 * Main CompactBuilder class with static factory methods
 */
export class CompactBuilder {
  static single(domain: CompactDomain): SingleCompactBuilder {
    return new SingleCompactBuilder(domain)
  }

  static batch(domain: CompactDomain): BatchCompactBuilder {
    return new BatchCompactBuilder(domain)
  }

  static multichain(domain: CompactDomain): MultichainCompactBuilder {
    return new MultichainCompactBuilder(domain)
  }
}

/**
 * Parse a duration string into seconds
 * Supports: "15s", "5m", "2h", "1d"
 */
function parseDuration(duration: string): bigint {
  const match = duration.match(/^(\d+)([smhd])$/)
  invariant(match, `Invalid duration format: ${duration}`)

  const value = BigInt(match[1])
  const unit = match[2]

  switch (unit) {
    case 's':
      return value
    case 'm':
      return value * 60n
    case 'h':
      return value * 3600n
    case 'd':
      return value * 86400n
    default:
      throw new Error(`Unknown duration unit: ${unit}`)
  }
}

