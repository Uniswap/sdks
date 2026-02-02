/**
 * Fluent builders for creating Compact, BatchCompact, and MultichainCompact messages
 */

import invariant from 'tiny-invariant'
import { Address, hashTypedData, Hex } from 'viem'

import { CompactDomain } from '../config/domain'
import { Compact, BatchCompact, MultichainCompact, Lock, MultichainElement } from '../types/eip712'

import { MandateType } from './mandate'

/**
 * EIP-712 message type for compacts with optional mandate
 */
type CompactMessage<TMandate extends object | undefined> = TMandate extends object
  ? Compact & { mandate: TMandate }
  : Compact

/**
 * EIP-712 message type for batch compacts with optional mandate
 */
type BatchCompactMessage<TMandate extends object | undefined> = TMandate extends object
  ? BatchCompact & { mandate: TMandate }
  : BatchCompact

/**
 * EIP-712 message type for multichain elements with mandate
 */
type MultichainElementMessage = MultichainElement & { mandate: any }

/**
 * EIP-712 message type for multichain compacts
 */
type MultichainCompactMessage = Omit<MultichainCompact, 'elements'> & {
  elements: MultichainElementMessage[]
}

/**
 * Result of building a compact
 * Contains all data needed to sign and submit a compact
 */
export interface BuiltCompact<TMandate extends object | undefined = undefined> {
  /** The compact struct ready to be submitted on-chain */
  struct: Compact
  /** Optional witness data (mandate) attached to this compact */
  mandate?: TMandate
  /** Type definition for the mandate (if present) */
  mandateType?: MandateType<TMandate extends object ? TMandate : any>
  /** EIP-712 hash of the compact for signature verification */
  hash: Hex
  /** Complete EIP-712 typed data structure for signing */
  typedData: {
    domain: CompactDomain
    types: Record<string, Array<{ name: string; type: string }>>
    primaryType: 'Compact'
    message: any
  }
}

/**
 * Result of building a batch compact
 * Contains all data needed to sign and submit a batch compact covering multiple locks
 */
export interface BuiltBatchCompact<TMandate extends object | undefined = undefined> {
  /** The batch compact struct ready to be submitted on-chain */
  struct: BatchCompact
  /** Optional witness data (mandate) attached to this batch compact */
  mandate?: TMandate
  /** Type definition for the mandate (if present) */
  mandateType?: MandateType<TMandate extends object ? TMandate : any>
  /** EIP-712 hash of the batch compact for signature verification */
  hash: Hex
  /** Complete EIP-712 typed data structure for signing */
  typedData: {
    domain: CompactDomain
    types: Record<string, Array<{ name: string; type: string }>>
    primaryType: 'BatchCompact'
    message: any
  }
}

/**
 * Result of building a multichain compact
 * Contains all data needed to sign and submit a multichain compact across multiple chains
 */
export interface BuiltMultichainCompact {
  /** The multichain compact struct ready to be submitted on-chain */
  struct: MultichainCompact
  /**
   * Per-element build outputs including the mandate and mandate type.
   * This is useful for canonical registration hashing helpers which require witness hashes.
   */
  elements: Array<{
    element: MultichainElement
    mandate?: any
    mandateType?: MandateType<any>
  }>
  /** EIP-712 hash of the multichain compact for signature verification */
  hash: Hex
  /** Complete EIP-712 typed data structure for signing */
  typedData: {
    domain: CompactDomain
    types: Record<string, Array<{ name: string; type: string }>>
    primaryType: 'MultichainCompact'
    message: any
  }
}

/**
 * Fluent builder for creating single Compact messages
 *
 * A Compact is a signed intent to lock tokens that can be later claimed by arbiters.
 * Use this builder to construct valid Compact structs with type-safe validation.
 *
 * @example
 * ```typescript
 * import { CompactClient } from '@uniswap/the-compact-sdk'
 *
 * const client = new CompactClient({ chainId: 1, address: '0x...' })
 *
 * // Build a simple compact
 * const compact = client.sponsor.compact()
 *   .arbiter('0xArbiterAddress...')
 *   .sponsor('0xSponsorAddress...')
 *   .nonce(1n)
 *   .expiresIn('1 hour')
 *   .lockTag('0x000000000000000000000001')
 *   .token('0xTokenAddress...')
 *   .amount(1000000n)
 *   .build()
 *
 * console.log('Compact hash:', compact.hash)
 * console.log('Struct:', compact.struct)
 *
 * // With a witness (mandate)
 * import { simpleMandate } from '@uniswap/the-compact-sdk'
 *
 * const mandateType = simpleMandate<{ maxAmount: bigint }>([
 *   { name: 'maxAmount', type: 'uint256' }
 * ])
 *
 * const compactWithWitness = client.sponsor.compact()
 *   .arbiter('0xArbiter...')
 *   .sponsor('0xSponsor...')
 *   .nonce(1n)
 *   .expiresIn('1 day')
 *   .lockTag('0x000000000000000000000001')
 *   .token('0xUSDC...')
 *   .amount(1000000n)
 *   .witness(mandateType, { maxAmount: 2000000n })
 *   .build()
 * ```
 *
 * @template TMandate - Optional witness data type for mandate constraints
 */
export class SingleCompactBuilder<TMandate extends object | undefined = undefined> {
  private domain: CompactDomain
  private _arbiter?: Address
  private _sponsor?: Address
  private _nonce?: bigint
  private _expires?: bigint
  private _lockTag?: Hex
  private _token?: Address
  private _amount?: bigint
  private _mandate?: TMandate
  private _mandateType?: MandateType<TMandate extends object ? TMandate : any>

  constructor(domain: CompactDomain) {
    this.domain = domain
  }

  /**
   * Set the arbiter address who will process the claim
   * @param arbiter - Address authorized to process claims for this compact
   * @returns This builder for chaining
   */
  arbiter(arbiter: Address): this {
    this._arbiter = arbiter
    return this
  }

  /**
   * Set the sponsor address who is locking the tokens
   * @param sponsor - Address that owns and is locking the tokens
   * @returns This builder for chaining
   */
  sponsor(sponsor: Address): this {
    this._sponsor = sponsor
    return this
  }

  /**
   * Set the nonce for replay protection
   * @param nonce - Unique nonce value (typically incremental)
   * @returns This builder for chaining
   */
  nonce(nonce: bigint): this {
    this._nonce = nonce
    return this
  }

  /**
   * Set the expiration timestamp
   * @param timestamp - Unix timestamp in seconds when the compact expires
   * @returns This builder for chaining
   */
  expires(timestamp: bigint): this {
    this._expires = timestamp
    return this
  }

  /**
   * Set expiration timestamp (alias for expires())
   * @param timestamp - Unix timestamp in seconds
   */
  expiresAt(timestamp: bigint): this {
    return this.expires(timestamp)
  }

  /**
   * Set expiration relative to now
   * @param duration - Duration string (e.g., '1 hour', '30 minutes') or seconds as bigint/number
   * @example
   * ```typescript
   * builder.expiresIn('1 hour')  // Expires 1 hour from now
   * builder.expiresIn(3600)      // Expires in 3600 seconds
   * ```
   */
  expiresIn(duration: string | number): this {
    const seconds = typeof duration === 'string' ? parseDuration(duration) : BigInt(duration)
    const now = BigInt(Math.floor(Date.now() / 1000))
    return this.expires(now + seconds)
  }

  /**
   * Set the lock tag for the resource lock
   * @param lockTag - 12-byte lock tag identifying the lock configuration
   * @returns This builder for chaining
   */
  lockTag(lockTag: Hex): this {
    this._lockTag = lockTag
    return this
  }

  /**
   * Set the token address being locked
   * @param token - Address of the ERC20 token to lock
   * @returns This builder for chaining
   */
  token(token: Address): this {
    this._token = token
    return this
  }

  /**
   * Set the amount of tokens to lock
   * @param amount - Amount in wei to lock
   * @returns This builder for chaining
   */
  amount(amount: bigint): this {
    this._amount = amount
    return this
  }

  /**
   * Attach a witness (mandate) to this compact
   *
   * Mandates are additional constraints on how the compact can be claimed,
   * defined as typed EIP-712 witness data.
   *
   * @template T - The mandate data type
   * @param mandateType - The mandate type definition created with simpleMandate()
   * @param mandate - The actual mandate data matching the type
   * @returns A new builder instance typed with the mandate
   *
   * @example
   * ```typescript
   * import { simpleMandate } from '@uniswap/the-compact-sdk'
   *
   * const mandateType = simpleMandate<{ maxAmount: bigint }>([
   *   { name: 'maxAmount', type: 'uint256' }
   * ])
   *
   * const compact = builder
   *   .arbiter('0x...')
   *   .sponsor('0x...')
   *   .witness(mandateType, { maxAmount: 1000000n })
   *   .build()
   * ```
   */
  witness<T extends object>(mandateType: MandateType<T>, mandate: T): SingleCompactBuilder<T> {
    const builder = this as any as SingleCompactBuilder<T>
    builder._mandateType = mandateType
    builder._mandate = mandate
    return builder
  }

  /**
   * Build the final Compact struct with EIP-712 hash
   *
   * Validates that all required fields are set and constructs the complete
   * Compact struct along with its EIP-712 typed data and hash.
   *
   * @returns Object containing the struct, hash, typed data, and optional mandate
   * @throws {Error} If any required field is missing
   *
   * @example
   * ```typescript
   * const result = builder.build()
   * console.log('Hash:', result.hash)
   * console.log('Struct:', result.struct)
   * console.log('TypedData:', result.typedData)
   * ```
   */
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

    const message: CompactMessage<TMandate> = { ...struct } as CompactMessage<TMandate>

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

      ;(message as Compact & { mandate: TMandate }).mandate = this._mandate
    }

    const typedData = {
      domain: this.domain,
      types,
      primaryType: 'Compact' as const,
      message: message as unknown as Record<string, unknown>,
    }

    const hash = hashTypedData(typedData)

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
 * Fluent builder for creating batch Compact messages
 *
 * A BatchCompact allows locking multiple tokens with different lock tags in a single
 * signed message, saving gas and simplifying coordination when dealing with multiple
 * token locks for the same sponsor.
 *
 * @example
 * ```typescript
 * import { CompactClient } from '@uniswap/the-compact-sdk'
 *
 * const client = new CompactClient({ chainId: 1, address: '0x...' })
 *
 * // Build a batch compact with multiple token locks
 * const batchCompact = client.sponsor.batchCompact()
 *   .arbiter('0xArbiterAddress...')
 *   .sponsor('0xSponsorAddress...')
 *   .nonce(1n)
 *   .expiresIn('1 hour')
 *   .addLock({
 *     lockTag: '0x000000000000000000000001',
 *     token: '0xUSDC...',
 *     amount: 1000000n
 *   })
 *   .addLock({
 *     lockTag: '0x000000000000000000000002',
 *     token: '0xWETH...',
 *     amount: 5000000000000000000n
 *   })
 *   .build()
 *
 * console.log('Batch compact hash:', batchCompact.hash)
 * console.log('Struct:', batchCompact.struct)
 * ```
 *
 * @template TMandate - Optional witness data type for mandate constraints
 */
export class BatchCompactBuilder<TMandate extends object | undefined = undefined> {
  private domain: CompactDomain
  private _arbiter?: Address
  private _sponsor?: Address
  private _nonce?: bigint
  private _expires?: bigint
  private _commitments: Lock[] = []
  private _mandate?: TMandate
  private _mandateType?: MandateType<TMandate extends object ? TMandate : any>

  constructor(domain: CompactDomain) {
    this.domain = domain
  }

  /**
   * Set the arbiter address who will process the claims
   * @param arbiter - Address authorized to process claims for this batch compact
   * @returns This builder for chaining
   */
  arbiter(arbiter: Address): this {
    this._arbiter = arbiter
    return this
  }

  /**
   * Set the sponsor address who is locking the tokens
   * @param sponsor - Address that owns and is locking the tokens
   * @returns This builder for chaining
   */
  sponsor(sponsor: Address): this {
    this._sponsor = sponsor
    return this
  }

  /**
   * Set the nonce for replay protection
   * @param nonce - Unique nonce value (typically incremental)
   * @returns This builder for chaining
   */
  nonce(nonce: bigint): this {
    this._nonce = nonce
    return this
  }

  /**
   * Set the expiration timestamp
   * @param timestamp - Unix timestamp in seconds when the batch compact expires
   * @returns This builder for chaining
   */
  expires(timestamp: bigint): this {
    this._expires = timestamp
    return this
  }

  /**
   * Set expiration timestamp (alias for expires())
   * @param timestamp - Unix timestamp in seconds
   * @returns This builder for chaining
   */
  expiresAt(timestamp: bigint): this {
    return this.expires(timestamp)
  }

  /**
   * Set expiration relative to now
   * @param duration - Duration string (e.g., '1 hour', '30 minutes') or seconds as number
   * @returns This builder for chaining
   */
  expiresIn(duration: string | number): this {
    const seconds = typeof duration === 'string' ? parseDuration(duration) : BigInt(duration)
    const now = BigInt(Math.floor(Date.now() / 1000))
    return this.expires(now + seconds)
  }

  /**
   * Add a token lock to the batch
   * @param lock - Lock containing lockTag, token address, and amount
   * @example
   * ```typescript
   * builder.addLock({
   *   lockTag: '0x000000000000000000000001',
   *   token: '0xUSDC...',
   *   amount: 1000000n
   * })
   * ```
   */
  addLock(lock: Lock): this {
    this._commitments.push(lock)
    return this
  }

  /**
   * Alias for addLock()
   * @param lock - Lock containing lockTag, token address, and amount
   */
  addCommitment(lock: Lock): this {
    return this.addLock(lock)
  }

  /**
   * Attach a witness (mandate) to this batch compact
   *
   * Mandates are additional constraints on how the compact can be claimed,
   * defined as typed EIP-712 witness data.
   *
   * @template T - The mandate data type
   * @param mandateType - The mandate type definition created with simpleMandate()
   * @param mandate - The actual mandate data matching the type
   * @returns A new builder instance typed with the mandate
   */
  witness<T extends object>(mandateType: MandateType<T>, mandate: T): BatchCompactBuilder<T> {
    const builder = this as any as BatchCompactBuilder<T>
    builder._mandateType = mandateType
    builder._mandate = mandate
    return builder
  }

  /**
   * Build the final BatchCompact struct with EIP-712 hash
   *
   * Validates that all required fields are set and constructs the complete
   * BatchCompact struct along with its EIP-712 typed data and hash.
   *
   * @returns Object containing the struct, hash, typed data, and optional mandate
   * @throws {Error} If any required field is missing or no locks have been added
   */
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

    const message: BatchCompactMessage<TMandate> = { ...struct } as BatchCompactMessage<TMandate>

    // Add mandate if present
    if (this._mandateType && this._mandate) {
      types.BatchCompact.push({ name: 'mandate', type: 'Mandate' })
      types.Mandate = this._mandateType.fields.map((f) => ({ name: f.name, type: f.type }))

      if (this._mandateType.nestedTypes) {
        for (const [typeName, fields] of Object.entries(this._mandateType.nestedTypes)) {
          types[typeName] = fields.map((f) => ({ name: f.name, type: f.type }))
        }
      }

      ;(message as BatchCompact & { mandate: TMandate }).mandate = this._mandate
    }

    const typedData = {
      domain: this.domain,
      types,
      primaryType: 'BatchCompact' as const,
      message: message as unknown as Record<string, unknown>,
    }

    const hash = hashTypedData(typedData)

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
 * Fluent builder for creating individual multichain compact elements
 *
 * Each element represents a set of token locks on a specific chain with its own
 * arbiter and mandate. This builder is accessed through MultichainCompactBuilder.addElement()
 * and uses the done() method to return to the parent builder for chaining.
 *
 * @example
 * ```typescript
 * // Used as part of MultichainCompactBuilder
 * const multichain = client.sponsor.multichainCompact()
 *   .sponsor('0xSponsor...')
 *   .nonce(1n)
 *   .expiresIn('1 hour')
 *   .addElement()
 *     .arbiter('0xArbiter1...')
 *     .chainId(1n)
 *     .addCommitment({ lockTag: '0x...', token: '0xUSDC...', amount: 1000000n })
 *     .witness(mandateType, mandateData)
 *     .done()
 *   .build()
 * ```
 */
export class MultichainElementBuilder {
  private _arbiter?: Address
  private _chainId?: bigint
  private _commitments: Lock[] = []
  private _mandate?: any
  private _mandateType?: MandateType<any>
  private parent: MultichainCompactBuilder

  constructor(parent: MultichainCompactBuilder) {
    this.parent = parent
  }

  /**
   * Set the arbiter address for this chain
   * @param arbiter - Address authorized to process claims on this chain
   * @returns This builder for chaining
   */
  arbiter(arbiter: Address): this {
    this._arbiter = arbiter
    return this
  }

  /**
   * Set the chain ID for this element
   * @param chainId - EVM chain ID (e.g., 1 for Ethereum, 10 for Optimism)
   * @returns This builder for chaining
   */
  chainId(chainId: bigint): this {
    this._chainId = chainId
    return this
  }

  /**
   * Add a token lock commitment to this chain element
   * @param lock - Lock containing lockTag, token address, and amount
   * @returns This builder for chaining
   */
  addCommitment(lock: Lock): this {
    this._commitments.push(lock)
    return this
  }

  /**
   * Attach a witness (mandate) to this element
   *
   * Mandates are required for multichain elements and define constraints
   * on how this element can be claimed.
   *
   * @template T - The mandate data type
   * @param mandateType - The mandate type definition created with simpleMandate()
   * @param mandate - The actual mandate data matching the type
   */
  witness<T extends object>(mandateType: MandateType<T>, mandate: T): this {
    this._mandateType = mandateType
    this._mandate = mandate
    return this
  }

  /**
   * Finish building this element and return to the parent multichain compact builder
   *
   * This method validates that the element is complete and allows for fluent chaining
   * when building multiple elements.
   *
   * @returns The parent MultichainCompactBuilder for further chaining
   * @throws {Error} If any required field is missing
   *
   * @example
   * ```typescript
   * builder
   *   .addElement()
   *     .arbiter('0x...')
   *     .chainId(1n)
   *     .addCommitment(...)
   *     .witness(...)
   *     .done()  // Returns to parent builder
   *   .addElement()  // Add another element
   *     ...
   *     .done()
   *   .build()  // Build the complete multichain compact
   * ```
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
 * Fluent builder for creating multichain Compact messages
 *
 * A MultichainCompact allows coordinating token locks across multiple chains in a single
 * signed message. Each chain has its own arbiter, lock commitments, and mandate constraints.
 * This is useful for cross-chain operations where a sponsor wants to lock tokens on multiple
 * chains simultaneously with a single signature.
 *
 * @example
 * ```typescript
 * import { CompactClient, simpleMandate } from '@uniswap/the-compact-sdk'
 *
 * const client = new CompactClient({ chainId: 1, address: '0x...' })
 *
 * const mandateType = simpleMandate<{ maxAmount: bigint }>([
 *   { name: 'maxAmount', type: 'uint256' }
 * ])
 *
 * // Build a multichain compact across Ethereum and Optimism
 * const multichainCompact = client.sponsor.multichainCompact()
 *   .sponsor('0xSponsorAddress...')
 *   .nonce(1n)
 *   .expiresIn('1 hour')
 *   .addElement()
 *     .arbiter('0xEthereumArbiter...')
 *     .chainId(1n)  // Ethereum mainnet
 *     .addCommitment({
 *       lockTag: '0x000000000000000000000001',
 *       token: '0xUSDC...',
 *       amount: 1000000n
 *     })
 *     .witness(mandateType, { maxAmount: 2000000n })
 *     .done()
 *   .addElement()
 *     .arbiter('0xOptimismArbiter...')
 *     .chainId(10n)  // Optimism
 *     .addCommitment({
 *       lockTag: '0x000000000000000000000001',
 *       token: '0xUSDC...',
 *       amount: 500000n
 *     })
 *     .witness(mandateType, { maxAmount: 1000000n })
 *     .done()
 *   .build()
 *
 * console.log('Multichain compact hash:', multichainCompact.hash)
 * console.log('Struct:', multichainCompact.struct)
 * ```
 */
export class MultichainCompactBuilder {
  private domain: CompactDomain
  private _sponsor?: Address
  private _nonce?: bigint
  private _expires?: bigint
  private elementBuilders: MultichainElementBuilder[] = []

  constructor(domain: CompactDomain) {
    this.domain = domain
  }

  /**
   * Set the sponsor address who is locking tokens across chains
   * @param sponsor - Address that owns and is locking the tokens on all chains
   * @returns This builder for chaining
   */
  sponsor(sponsor: Address): this {
    this._sponsor = sponsor
    return this
  }

  /**
   * Set the nonce for replay protection
   * @param nonce - Unique nonce value (typically incremental)
   * @returns This builder for chaining
   */
  nonce(nonce: bigint): this {
    this._nonce = nonce
    return this
  }

  /**
   * Set the expiration timestamp
   * @param timestamp - Unix timestamp in seconds when the multichain compact expires
   * @returns This builder for chaining
   */
  expires(timestamp: bigint): this {
    this._expires = timestamp
    return this
  }

  /**
   * Set expiration timestamp (alias for expires())
   * @param timestamp - Unix timestamp in seconds
   * @returns This builder for chaining
   */
  expiresAt(timestamp: bigint): this {
    return this.expires(timestamp)
  }

  /**
   * Set expiration relative to now
   * @param duration - Duration string (e.g., '1 hour', '30 minutes') or seconds as number
   * @returns This builder for chaining
   */
  expiresIn(duration: string | number): this {
    const seconds = typeof duration === 'string' ? parseDuration(duration) : BigInt(duration)
    const now = BigInt(Math.floor(Date.now() / 1000))
    return this.expires(now + seconds)
  }

  /**
   * Add a new chain element to the multichain compact
   *
   * Returns a MultichainElementBuilder for configuring this chain's arbiter,
   * lock commitments, and mandate. Call done() on the element builder to
   * return to this builder for chaining.
   *
   * @returns A new element builder for configuring this chain
   *
   * @example
   * ```typescript
   * builder
   *   .addElement()
   *     .arbiter('0x...')
   *     .chainId(1n)
   *     .addCommitment(...)
   *     .witness(...)
   *     .done()
   * ```
   */
  addElement(): MultichainElementBuilder {
    const builder = new MultichainElementBuilder(this)
    this.elementBuilders.push(builder)
    return builder
  }

  /**
   * Build the final MultichainCompact struct with EIP-712 hash
   *
   * Validates that all required fields are set and constructs the complete
   * MultichainCompact struct along with its EIP-712 typed data and hash.
   *
   * @returns Object containing the struct, hash, and typed data
   * @throws {Error} If any required field is missing or no elements have been added
   */
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
    const message: MultichainCompactMessage = {
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
      message: message as unknown as Record<string, unknown>,
    }

    const hash = hashTypedData(typedData)

    return {
      struct,
      elements: builtElements,
      hash,
      typedData,
    }
  }
}

/**
 * Main CompactBuilder class with static factory methods
 *
 * Provides convenience methods for creating compact builders with proper domain configuration.
 */
export class CompactBuilder {
  /**
   * Create a single compact builder
   * @param domain - EIP-712 domain configuration
   * @returns A new SingleCompactBuilder instance
   */
  static single(domain: CompactDomain): SingleCompactBuilder {
    return new SingleCompactBuilder(domain)
  }

  /**
   * Create a batch compact builder
   * @param domain - EIP-712 domain configuration
   * @returns A new BatchCompactBuilder instance
   */
  static batch(domain: CompactDomain): BatchCompactBuilder {
    return new BatchCompactBuilder(domain)
  }

  /**
   * Create a multichain compact builder
   * @param domain - EIP-712 domain configuration
   * @returns A new MultichainCompactBuilder instance
   */
  static multichain(domain: CompactDomain): MultichainCompactBuilder {
    return new MultichainCompactBuilder(domain)
  }
}

/**
 * Parse a duration string into seconds
 * Supports: "15s", "5m", "2h", "1d"
 * @param duration - Duration string in format: number + unit (s/m/h/d)
 * @returns Duration in seconds as bigint
 * @throws {Error} If duration format is invalid or unit is unknown
 * @example
 * ```typescript
 * parseDuration('30s')  // 30n
 * parseDuration('5m')   // 300n
 * parseDuration('2h')   // 7200n
 * parseDuration('1d')   // 86400n
 * ```
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
