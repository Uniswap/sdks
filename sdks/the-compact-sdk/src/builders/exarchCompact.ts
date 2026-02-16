/**
 * Exarch-specific compact builder for simplified construction of compacts with Exarch mandates
 *
 * This builder combines BatchCompact construction with Exarch mandate integration,
 * automatically handling:
 * - Witness typestring generation for Exarch mandates
 * - Mandate hash computation
 * - EIP-712 typed data structure with nested types
 *
 * @example
 * ```typescript
 * const result = ExarchCompactBuilder.create(domain)
 *   .sponsor(sponsorAddress)
 *   .arbiter(exarchAddress)
 *   .nonce(1n)
 *   .expiresIn('1h')
 *   .addLock({ lockTag, token, amount })
 *   .mandate((m) => m
 *     .adjuster(adjusterAddress)
 *     .legate(legateAddress)
 *     .fill((f) => f.chainId(1n).exarch(exarchAddr)...))
 *   .build()
 *
 * // Sign with sponsor wallet
 * const signature = await walletClient.signTypedData(result.typedData)
 * ```
 */

import invariant from 'tiny-invariant'
import { Address, hashTypedData, Hex } from 'viem'

import { CompactDomain } from '../config/domain'
import {
  deriveExarchFillHash,
  deriveExarchMandateHash,
  deriveExarchClaimHash,
  EXARCH_WITNESS_TYPESTRING,
} from '../encoding/exarch'
import { ExarchFillParameters, ExarchMandate } from '../types/exarch'
import { BatchCompact, Lock } from '../types/eip712'

import { ExarchMandateBuilder, ExarchFillParametersBuilder } from './exarch'

/**
 * Result of building an Exarch compact
 */
export interface BuiltExarchCompact {
  /** The batch compact struct ready for on-chain submission */
  struct: BatchCompact
  /** The Exarch mandate data */
  mandate: ExarchMandate
  /** Hash of the mandate (used as witness data) */
  mandateHash: Hex
  /** Hash of the compact (claim hash) */
  claimHash: Hex
  /** Fill hashes for each fill in the mandate */
  fillHashes: Hex[]
  /** EIP-712 typed data for sponsor signature */
  typedData: {
    domain: CompactDomain
    types: Record<string, Array<{ name: string; type: string }>>
    primaryType: 'BatchCompact'
    message: BatchCompactWithMandate
  }
  /** EIP-712 hash for verification */
  hash: Hex
}

/**
 * BatchCompact message type with mandate for EIP-712 signing
 */
interface BatchCompactWithMandate extends BatchCompact {
  mandate: ExarchMandateMessage
}

/**
 * Exarch mandate message type for EIP-712
 */
interface ExarchMandateMessage {
  adjuster: Address
  legate: Address
  fills: ExarchFillMessage[]
}

/**
 * Exarch fill message type for EIP-712
 */
interface ExarchFillMessage {
  chainId: bigint
  exarch: Address
  expires: bigint
  components: Array<{
    fillToken: Address
    minimumFillAmount: bigint
    recipient: Address
    applyScaling: boolean
  }>
  bondAmount: bigint
  earnestAmount: bigint
  holdPeriod: bigint
  baselinePriorityFee: bigint
  scalingFactor: bigint
  priceCurve: bigint[]
  recipientCallback: Array<{
    chainId: bigint
    compact: BatchCompact
    mandateHash: Hex
    context: Hex
  }>
  salt: Hex
}

/**
 * Parse a duration string into seconds
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

/**
 * Builder for creating BatchCompacts with Exarch mandates
 *
 * This builder provides a fluent interface for constructing compacts that use
 * Exarch as the arbiter, automatically handling the complex EIP-712 type
 * structures required for Exarch mandates.
 *
 * @example
 * ```typescript
 * const result = ExarchCompactBuilder.create(domain)
 *   .sponsor('0xSponsor...')
 *   .arbiter('0xExarch...')
 *   .nonce(1n)
 *   .expiresIn('1h')
 *   .addLock({
 *     lockTag: '0x000000000000000000000001',
 *     token: '0xUSDC...',
 *     amount: 1000000n
 *   })
 *   .mandate((m) => m
 *     .adjuster('0xAdjuster...')
 *     .legate('0xLegate...')
 *     .fill((f) => f
 *       .chainId(1n)
 *       .exarch('0xExarch...')
 *       .expires(BigInt(Date.now() / 1000) + 3600n)
 *       .component((c) => c
 *         .fillToken('0xToken...')
 *         .minimumFillAmount(500000n)
 *         .recipient('0xRecipient...')
 *         .applyScaling(true))
 *       .bondAmount(100000000000000000n)
 *       .earnestAmount(10000000000000000n)
 *       .holdPeriod(100n)))
 *   .build()
 * ```
 */
export class ExarchCompactBuilder {
  private domain: CompactDomain
  private _arbiter?: Address
  private _sponsor?: Address
  private _nonce?: bigint
  private _expires?: bigint
  private _commitments: Lock[] = []
  private _mandate?: ExarchMandate

  private constructor(domain: CompactDomain) {
    this.domain = domain
  }

  /**
   * Create a new ExarchCompactBuilder
   * @param domain - The Compact EIP-712 domain configuration
   * @returns A new ExarchCompactBuilder instance
   */
  static create(domain: CompactDomain): ExarchCompactBuilder {
    return new ExarchCompactBuilder(domain)
  }

  /**
   * Set the arbiter address (should be the Exarch contract)
   * @param arbiter - The Exarch contract address
   * @returns This builder for chaining
   */
  arbiter(arbiter: Address): this {
    this._arbiter = arbiter
    return this
  }

  /**
   * Set the sponsor address
   * @param sponsor - Address of the token owner creating this compact
   * @returns This builder for chaining
   */
  sponsor(sponsor: Address): this {
    this._sponsor = sponsor
    return this
  }

  /**
   * Set the nonce for replay protection
   * @param nonce - Unique nonce value
   * @returns This builder for chaining
   */
  nonce(nonce: bigint): this {
    this._nonce = nonce
    return this
  }

  /**
   * Set the expiration timestamp
   * @param timestamp - Unix timestamp when the compact expires
   * @returns This builder for chaining
   */
  expires(timestamp: bigint): this {
    this._expires = timestamp
    return this
  }

  /**
   * Set expiration timestamp (alias)
   * @param timestamp - Unix timestamp in seconds
   * @returns This builder for chaining
   */
  expiresAt(timestamp: bigint): this {
    return this.expires(timestamp)
  }

  /**
   * Set expiration relative to now
   * @param duration - Duration string (e.g., '1h', '30m', '1d') or seconds as number
   * @returns This builder for chaining
   */
  expiresIn(duration: string | number): this {
    const seconds = typeof duration === 'string' ? parseDuration(duration) : BigInt(duration)
    const now = BigInt(Math.floor(Date.now() / 1000))
    return this.expires(now + seconds)
  }

  /**
   * Add a token lock commitment
   * @param lock - Lock containing lockTag, token, and amount
   * @returns This builder for chaining
   */
  addLock(lock: Lock): this {
    this._commitments.push(lock)
    return this
  }

  /**
   * Add a token lock commitment (alias)
   * @param lock - Lock containing lockTag, token, and amount
   * @returns This builder for chaining
   */
  addCommitment(lock: Lock): this {
    return this.addLock(lock)
  }

  /**
   * Set the Exarch mandate using a builder function
   *
   * The mandate defines the auction parameters, including the adjuster,
   * legate, and fill operations.
   *
   * @param builderFn - Function that configures an ExarchMandateBuilder
   * @returns This builder for chaining
   *
   * @example
   * ```typescript
   * builder.mandate((m) => m
   *   .adjuster('0xAdjuster...')
   *   .legate('0xLegate...')
   *   .fill((f) => f
   *     .chainId(1n)
   *     .exarch('0xExarch...')
   *     .expires(expiry)
   *     .component((c) => c
   *       .fillToken('0xToken...')
   *       .minimumFillAmount(1000000n)
   *       .recipient('0xRecipient...'))))
   * ```
   */
  mandate(builderFn: (builder: ExarchMandateBuilder) => ExarchMandateBuilder): this {
    const builder = new ExarchMandateBuilder()
    const configured = builderFn(builder)
    this._mandate = configured.build()
    return this
  }

  /**
   * Set the Exarch mandate directly
   * @param mandate - Pre-constructed ExarchMandate
   * @returns This builder for chaining
   */
  withMandate(mandate: ExarchMandate): this {
    this._mandate = mandate
    return this
  }

  /**
   * Build the final ExarchCompact with all computed hashes and typed data
   *
   * @returns Complete build result including struct, mandate, hashes, and typed data
   * @throws Error if required fields are missing
   */
  build(): BuiltExarchCompact {
    // Validate required fields
    invariant(this._arbiter, 'arbiter is required')
    invariant(this._sponsor, 'sponsor is required')
    invariant(this._nonce !== undefined, 'nonce is required')
    invariant(this._expires !== undefined, 'expires is required')
    invariant(this._commitments.length > 0, 'at least one commitment is required')
    invariant(this._mandate, 'mandate is required')

    // Build the compact struct
    const struct: BatchCompact = {
      arbiter: this._arbiter,
      sponsor: this._sponsor,
      nonce: this._nonce,
      expires: this._expires,
      commitments: this._commitments,
    }

    // Compute fill hashes and mandate hash
    const fillHashes = this._mandate.fills.map(deriveExarchFillHash)
    const mandateHash = deriveExarchMandateHash(this._mandate.adjuster, this._mandate.legate, fillHashes)

    // Compute claim hash
    const claimHash = deriveExarchClaimHash(struct, mandateHash)

    // Build EIP-712 types with full Exarch mandate structure
    const types = buildExarchTypes()

    // Build message with mandate
    const message: BatchCompactWithMandate = {
      ...struct,
      mandate: {
        adjuster: this._mandate.adjuster,
        legate: this._mandate.legate,
        fills: this._mandate.fills.map((fill) => ({
          chainId: fill.chainId,
          exarch: fill.exarch,
          expires: fill.expires,
          components: fill.components,
          bondAmount: fill.bondAmount,
          earnestAmount: fill.earnestAmount,
          holdPeriod: fill.holdPeriod,
          baselinePriorityFee: fill.baselinePriorityFee,
          scalingFactor: fill.scalingFactor,
          priceCurve: fill.priceCurve,
          recipientCallback: fill.recipientCallback,
          salt: fill.salt,
        })),
      },
    }

    const typedData = {
      domain: this.domain,
      types,
      primaryType: 'BatchCompact' as const,
      message,
    }

    const hash = hashTypedData({
      ...typedData,
      message: message as unknown as Record<string, unknown>,
    })

    return {
      struct,
      mandate: this._mandate,
      mandateHash,
      claimHash,
      fillHashes,
      typedData,
      hash,
    }
  }
}

/**
 * Build the EIP-712 types for Exarch compacts
 *
 * This function generates the complete type structure needed for EIP-712
 * signatures of BatchCompacts with Exarch mandates.
 */
function buildExarchTypes(): Record<string, Array<{ name: string; type: string }>> {
  return {
    BatchCompact: [
      { name: 'arbiter', type: 'address' },
      { name: 'sponsor', type: 'address' },
      { name: 'nonce', type: 'uint256' },
      { name: 'expires', type: 'uint256' },
      { name: 'commitments', type: 'Lock[]' },
      { name: 'mandate', type: 'Mandate' },
    ],
    Lock: [
      { name: 'lockTag', type: 'bytes12' },
      { name: 'token', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    Mandate: [
      { name: 'adjuster', type: 'address' },
      { name: 'legate', type: 'address' },
      { name: 'fills', type: 'Mandate_Fill[]' },
    ],
    Mandate_Fill: [
      { name: 'chainId', type: 'uint256' },
      { name: 'exarch', type: 'address' },
      { name: 'expires', type: 'uint256' },
      { name: 'components', type: 'Mandate_FillComponent[]' },
      { name: 'bondAmount', type: 'uint256' },
      { name: 'earnestAmount', type: 'uint256' },
      { name: 'holdPeriod', type: 'uint256' },
      { name: 'baselinePriorityFee', type: 'uint256' },
      { name: 'scalingFactor', type: 'uint256' },
      { name: 'priceCurve', type: 'uint256[]' },
      { name: 'recipientCallback', type: 'Mandate_RecipientCallback[]' },
      { name: 'salt', type: 'bytes32' },
    ],
    Mandate_FillComponent: [
      { name: 'fillToken', type: 'address' },
      { name: 'minimumFillAmount', type: 'uint256' },
      { name: 'recipient', type: 'address' },
      { name: 'applyScaling', type: 'bool' },
    ],
    Mandate_RecipientCallback: [
      { name: 'chainId', type: 'uint256' },
      { name: 'compact', type: 'Mandate_BatchCompact' },
      { name: 'mandateHash', type: 'bytes32' },
      { name: 'context', type: 'bytes' },
    ],
    Mandate_BatchCompact: [
      { name: 'arbiter', type: 'address' },
      { name: 'sponsor', type: 'address' },
      { name: 'nonce', type: 'uint256' },
      { name: 'expires', type: 'uint256' },
      { name: 'commitments', type: 'Mandate_Lock[]' },
      { name: 'mandate', type: 'Mandate' },
    ],
    Mandate_Lock: [
      { name: 'lockTag', type: 'bytes12' },
      { name: 'token', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
  }
}

/**
 * Get the witness typestring for Exarch mandates
 *
 * This is the typestring that should be provided when registering a compact
 * with an Exarch mandate via The Compact.
 *
 * @returns The Exarch witness typestring
 */
export function getExarchWitnessTypestring(): string {
  return EXARCH_WITNESS_TYPESTRING
}

/**
 * Create fill parameters using a fluent builder interface
 *
 * Convenience function for creating ExarchFillParameters when you need
 * to construct fills outside of the compact builder.
 *
 * @param builderFn - Function that configures an ExarchFillParametersBuilder
 * @returns The built ExarchFillParameters
 *
 * @example
 * ```typescript
 * const fill = createFillParams((f) => f
 *   .chainId(1n)
 *   .exarch('0xExarch...')
 *   .expires(expiry)
 *   .component((c) => c
 *     .fillToken('0xToken...')
 *     .minimumFillAmount(1000000n)
 *     .recipient('0xRecipient...')))
 * ```
 */
export function createFillParams(
  builderFn: (builder: ExarchFillParametersBuilder) => ExarchFillParametersBuilder
): ExarchFillParameters {
  const builder = new ExarchFillParametersBuilder()
  return builderFn(builder).build()
}

/**
 * Create a mandate using a fluent builder interface
 *
 * Convenience function for creating ExarchMandate when you need to
 * construct mandates outside of the compact builder.
 *
 * @param builderFn - Function that configures an ExarchMandateBuilder
 * @returns The built ExarchMandate
 *
 * @example
 * ```typescript
 * const mandate = createMandate((m) => m
 *   .adjuster('0xAdjuster...')
 *   .legate('0xLegate...')
 *   .fill((f) => f
 *     .chainId(1n)
 *     .exarch('0xExarch...')
 *     .expires(expiry)
 *     .component((c) => c
 *       .fillToken('0xToken...')
 *       .minimumFillAmount(1000000n)
 *       .recipient('0xRecipient...'))))
 * ```
 */
export function createMandate(builderFn: (builder: ExarchMandateBuilder) => ExarchMandateBuilder): ExarchMandate {
  const builder = new ExarchMandateBuilder()
  return builderFn(builder).build()
}
