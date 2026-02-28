/**
 * Fluent builders for creating Exarch mandates, fill parameters, and adjustments
 *
 * Exarch is a bonded auction protocol running on the origin chain.
 * Key features:
 * - Legate: Trusted entity for cross-chain proof verification
 * - Bonding: Bidders post native token bonds with earnest amounts
 * - Hold periods: Exclusive windows for bidders to execute fills
 * - Adjustments: Signed by adjuster with nonce for replay protection
 */

import invariant from 'tiny-invariant'
import { Address, Hex, TypedDataDefinition, keccak256, encodePacked, encodeAbiParameters } from 'viem'

import { createExarchDomain, ExarchDomain } from '../config/exarch'
import { EXARCH_ADJUSTMENT_TYPEHASH } from '../encoding/exarch'
import { createPriceCurve, PriceCurveElement, SCALING_FACTOR } from '../lib/priceCurve'
import {
  ExarchFillComponent,
  ExarchFillParameters,
  ExarchMandate,
  ExarchAdjustment,
  ExarchRecipientCallback,
  FillInstruction,
} from '../types/exarch'
import { BatchCompact } from '../types/eip712'
import { randomHex32 } from '../utils/random'

/**
 * EIP-712 Adjustment type for signing
 * Matches ExarchTypeHashes.sol ADJUSTMENT_TYPESTRING
 */
const ADJUSTMENT_TYPES = {
  Adjustment: [
    { name: 'adjuster', type: 'address' },
    { name: 'fillIndex', type: 'uint256' },
    { name: 'targetBlock', type: 'uint256' },
    { name: 'supplementalPriceCurve', type: 'uint256[]' },
    { name: 'validityConditions', type: 'bytes32' },
    { name: 'nonce', type: 'uint256' },
    { name: 'claimHash', type: 'bytes32' },
  ],
} as const

/**
 * Builder for ExarchFillComponent
 * Provides a fluent interface for constructing fill component specifications
 */
export class ExarchFillComponentBuilder {
  private _fillToken?: Address
  private _minimumFillAmount?: bigint
  private _recipient?: Address
  private _applyScaling = false

  /**
   * Set the fill token address (address(0) for native)
   * @param token - ERC20 token address or address(0) for native token
   * @returns This builder for chaining
   */
  fillToken(token: Address): this {
    this._fillToken = token
    return this
  }

  /**
   * Set the minimum fill amount
   * @param amount - Minimum amount of tokens to be provided (in token's smallest unit)
   * @returns This builder for chaining
   */
  minimumFillAmount(amount: bigint): this {
    this._minimumFillAmount = amount
    return this
  }

  /**
   * Set the recipient address
   * @param recipient - Address that will receive the fill tokens
   * @returns This builder for chaining
   */
  recipient(recipient: Address): this {
    this._recipient = recipient
    return this
  }

  /**
   * Enable price curve scaling for this component
   * @param apply - Whether to apply scaling (default: true)
   * @returns This builder for chaining
   */
  applyScaling(apply = true): this {
    this._applyScaling = apply
    return this
  }

  /**
   * Build the final ExarchFillComponent
   * @returns Constructed ExarchFillComponent
   * @throws Error if required fields are missing
   */
  build(): ExarchFillComponent {
    invariant(this._fillToken, 'fillToken is required')
    invariant(this._minimumFillAmount !== undefined, 'minimumFillAmount is required')
    invariant(this._recipient, 'recipient is required')

    return {
      fillToken: this._fillToken,
      minimumFillAmount: this._minimumFillAmount,
      recipient: this._recipient,
      applyScaling: this._applyScaling,
    }
  }
}

/**
 * Builder for ExarchFillParameters
 * Provides a fluent interface for constructing fill parameters with bonding and price curves
 */
export class ExarchFillParametersBuilder {
  private _chainId?: bigint
  private _exarch?: Address
  private _expires?: bigint
  private _components: ExarchFillComponent[] = []
  private _bondAmount = 0n
  private _earnestAmount = 0n
  private _holdPeriod = 0n
  private _baselinePriorityFee = 0n
  private _scalingFactor: bigint = SCALING_FACTOR.NEUTRAL
  private _priceCurve: bigint[] = []
  private _recipientCallback: ExarchRecipientCallback[] = []
  private _salt: Hex = randomHex32()

  /**
   * Set the chain ID for this fill
   * @param chainId - Chain ID where the fill should be executed
   * @returns This builder for chaining
   */
  chainId(chainId: bigint): this {
    this._chainId = chainId
    return this
  }

  /**
   * Set the Exarch contract address
   * @param address - Address of the Exarch contract on the target chain
   * @returns This builder for chaining
   */
  exarch(address: Address): this {
    this._exarch = address
    return this
  }

  /**
   * Set the expiration timestamp
   * @param expires - Unix timestamp after which the fill expires
   * @returns This builder for chaining
   */
  expires(expires: bigint): this {
    this._expires = expires
    return this
  }

  /**
   * Add a fill component
   * @param component - Pre-constructed ExarchFillComponent to add
   * @returns This builder for chaining
   */
  addComponent(component: ExarchFillComponent): this {
    this._components.push(component)
    return this
  }

  /**
   * Add a fill component using a builder function
   * @param builderFn - Function that receives an ExarchFillComponentBuilder and returns it configured
   * @returns This builder for chaining
   */
  component(builderFn: (builder: ExarchFillComponentBuilder) => ExarchFillComponentBuilder): this {
    const builder = new ExarchFillComponentBuilder()
    const result = builderFn(builder)
    this._components.push(result.build())
    return this
  }

  /**
   * Set the required bond amount in native tokens
   * @param amount - Bond amount in wei
   * @returns This builder for chaining
   */
  bondAmount(amount: bigint): this {
    this._bondAmount = amount
    return this
  }

  /**
   * Set the earnest amount (non-rescindable portion of bond)
   * @param amount - Earnest amount in wei (must be <= bondAmount)
   * @returns This builder for chaining
   */
  earnestAmount(amount: bigint): this {
    this._earnestAmount = amount
    return this
  }

  /**
   * Set the hold period (exclusive window for active bidder)
   * @param blocks - Number of blocks for the hold period
   * @returns This builder for chaining
   */
  holdPeriod(blocks: bigint): this {
    this._holdPeriod = blocks
    return this
  }

  /**
   * Set the baseline priority fee threshold
   * @param fee - Priority fee threshold in wei (scaling kicks in when block.basefee exceeds this)
   * @returns This builder for chaining
   */
  baselinePriorityFee(fee: bigint): this {
    this._baselinePriorityFee = fee
    return this
  }

  /**
   * Set the fee scaling factor
   * @param factor - Scaling factor (1e18 = neutral/100%, >1e18 = exact-in, <1e18 = exact-out)
   * @returns This builder for chaining
   */
  scalingFactor(factor: bigint): this {
    this._scalingFactor = factor
    return this
  }

  /**
   * Set the price curve from an array of elements
   * @param elements - Array of PriceCurveElements defining the auction behavior
   * @returns This builder for chaining
   */
  priceCurve(elements: PriceCurveElement[]): this {
    this._priceCurve = createPriceCurve(elements)
    return this
  }

  /**
   * Set the price curve from packed elements
   * @param curve - Array of pre-packed uint256 price curve elements
   * @returns This builder for chaining
   */
  priceCurveRaw(curve: bigint[]): this {
    this._priceCurve = curve
    return this
  }

  /**
   * Add a recipient callback for bridge operations
   * @param callback - ExarchRecipientCallback defining cross-chain compact registration
   * @returns This builder for chaining
   */
  addRecipientCallback(callback: ExarchRecipientCallback): this {
    this._recipientCallback.push(callback)
    return this
  }

  /**
   * Set the salt for this fill
   * @param salt - 32-byte salt for making fills unique
   * @returns This builder for chaining
   */
  salt(salt: Hex): this {
    this._salt = salt
    return this
  }

  /**
   * Generate a random salt for this fill
   * @returns This builder for chaining
   */
  randomSalt(): this {
    this._salt = randomHex32()
    return this
  }

  /**
   * Build the final ExarchFillParameters
   * @returns Constructed ExarchFillParameters
   * @throws Error if required fields are missing or invalid
   */
  build(): ExarchFillParameters {
    invariant(this._chainId !== undefined, 'chainId is required')
    invariant(this._exarch, 'exarch is required')
    invariant(this._expires !== undefined, 'expires is required')
    invariant(this._components.length > 0, 'at least one component is required')
    invariant(this._earnestAmount <= this._bondAmount, 'earnestAmount must be <= bondAmount')

    return {
      chainId: this._chainId,
      exarch: this._exarch,
      expires: this._expires,
      components: this._components,
      bondAmount: this._bondAmount,
      earnestAmount: this._earnestAmount,
      holdPeriod: this._holdPeriod,
      baselinePriorityFee: this._baselinePriorityFee,
      scalingFactor: this._scalingFactor,
      priceCurve: this._priceCurve,
      recipientCallback: this._recipientCallback,
      salt: this._salt,
    }
  }
}

/**
 * Builder for ExarchMandate
 * Provides a fluent interface for constructing mandates with legate and multiple fills
 */
export class ExarchMandateBuilder {
  private _adjuster?: Address
  private _legate?: Address
  private _fills: ExarchFillParameters[] = []

  /**
   * Set the adjuster address
   * @param adjuster - Address of the adjuster who can modify fills
   * @returns This builder for chaining
   */
  adjuster(adjuster: Address): this {
    this._adjuster = adjuster
    return this
  }

  /**
   * Set the legate address
   * @param legate - Address authorized to verify cross-chain proofs and mark bids as filled
   * @returns This builder for chaining
   */
  legate(legate: Address): this {
    this._legate = legate
    return this
  }

  /**
   * Add a fill operation
   * @param fill - Pre-constructed ExarchFillParameters to add
   * @returns This builder for chaining
   */
  addFill(fill: ExarchFillParameters): this {
    this._fills.push(fill)
    return this
  }

  /**
   * Add a fill operation using a builder function
   * @param builderFn - Function that receives an ExarchFillParametersBuilder and returns it configured
   * @returns This builder for chaining
   */
  fill(builderFn: (builder: ExarchFillParametersBuilder) => ExarchFillParametersBuilder): this {
    const builder = new ExarchFillParametersBuilder()
    const result = builderFn(builder)
    this._fills.push(result.build())
    return this
  }

  /**
   * Build the final ExarchMandate
   * @returns Constructed ExarchMandate
   * @throws Error if required fields are missing
   */
  build(): ExarchMandate {
    invariant(this._adjuster, 'adjuster is required')
    invariant(this._legate, 'legate is required')
    invariant(this._fills.length > 0, 'at least one fill is required')

    return {
      adjuster: this._adjuster,
      legate: this._legate,
      fills: this._fills,
    }
  }
}

/**
 * Builder for ExarchAdjustment
 * Provides a fluent interface for constructing and signing adjustments
 *
 * IMPORTANT: Adjustments are signed using the Exarch domain, not The Compact domain.
 */
export class ExarchAdjustmentBuilder {
  private _domain: ExarchDomain
  private _adjuster?: Address
  private _fillIndex?: bigint
  private _targetBlock?: bigint
  private _supplementalPriceCurve: bigint[] = []
  private _validityConditions: Hex = '0x0000000000000000000000000000000000000000000000000000000000000000'
  private _nonce?: bigint

  /**
   * Create a new ExarchAdjustmentBuilder
   * @param domain - The Exarch EIP-712 domain for signing
   */
  constructor(domain: ExarchDomain) {
    this._domain = domain
  }

  /**
   * Set the adjuster address
   * @param adjuster - Address of the adjuster signing this adjustment
   * @returns This builder for chaining
   */
  adjuster(adjuster: Address): this {
    this._adjuster = adjuster
    return this
  }

  /**
   * Set the fill index
   * @param index - Index of the fill from the mandate's fills array
   * @returns This builder for chaining
   */
  fillIndex(index: bigint): this {
    this._fillIndex = index
    return this
  }

  /**
   * Set the target block (auction start block)
   * @param block - Block number where the auction begins
   * @returns This builder for chaining
   */
  targetBlock(block: bigint): this {
    this._targetBlock = block
    return this
  }

  /**
   * Set the supplemental price curve from an array of elements
   * @param elements - Array of PriceCurveElements to overlay on base curve
   * @returns This builder for chaining
   */
  supplementalPriceCurve(elements: PriceCurveElement[]): this {
    this._supplementalPriceCurve = createPriceCurve(elements)
    return this
  }

  /**
   * Set the supplemental price curve from packed elements
   * @param curve - Array of pre-packed uint256 price curve elements
   * @returns This builder for chaining
   */
  supplementalPriceCurveRaw(curve: bigint[]): this {
    this._supplementalPriceCurve = curve
    return this
  }

  /**
   * Set an exclusive bidder for this adjustment
   * @param bidder - Address of the exclusive bidder (lower 160 bits of validityConditions)
   * @returns This builder for chaining
   */
  exclusiveBidder(bidder: Address): this {
    const upper96 = BigInt(this._validityConditions) >> 160n
    const newConditions = (upper96 << 160n) | BigInt(bidder)
    this._validityConditions = ('0x' + newConditions.toString(16).padStart(64, '0')) as Hex
    return this
  }

  /**
   * Set the block window for this adjustment
   * @param blocks - Number of blocks the adjustment is valid for (0 = no limit, 1 = exact block)
   * @returns This builder for chaining
   */
  blockWindow(blocks: number): this {
    const lower160 = BigInt(this._validityConditions) & ((1n << 160n) - 1n)
    const newConditions = (BigInt(blocks) << 160n) | lower160
    this._validityConditions = ('0x' + newConditions.toString(16).padStart(64, '0')) as Hex
    return this
  }

  /**
   * Set the raw validity conditions
   * @param conditions - 32-byte validity conditions
   * @returns This builder for chaining
   */
  validityConditionsRaw(conditions: Hex): this {
    this._validityConditions = conditions
    return this
  }

  /**
   * Set the nonce for replay protection
   * @param nonce - Unique nonce for this adjustment
   * @returns This builder for chaining
   */
  nonce(nonce: bigint): this {
    this._nonce = nonce
    return this
  }

  /**
   * Generate a random nonce based on current timestamp
   * @returns This builder for chaining
   */
  randomNonce(): this {
    this._nonce = BigInt(Date.now()) * 1000000n + BigInt(Math.floor(Math.random() * 1000000))
    return this
  }

  /**
   * Build the adjustment without signature
   * Returns typed data for signing
   *
   * @param claimHash - The claim hash this adjustment applies to
   * @returns Adjustment data, typed data definition for signing, and the message hash
   */
  build(claimHash: Hex): {
    adjustment: Omit<ExarchAdjustment, 'adjustmentAuthorization'>
    typedData: TypedDataDefinition
    hash: Hex
  } {
    invariant(this._adjuster, 'adjuster is required')
    invariant(this._fillIndex !== undefined, 'fillIndex is required')
    invariant(this._targetBlock !== undefined, 'targetBlock is required')
    invariant(this._nonce !== undefined, 'nonce is required')

    const adjustment: Omit<ExarchAdjustment, 'adjustmentAuthorization'> = {
      adjuster: this._adjuster,
      fillIndex: this._fillIndex,
      targetBlock: this._targetBlock,
      supplementalPriceCurve: this._supplementalPriceCurve,
      validityConditions: this._validityConditions,
      nonce: this._nonce,
    }

    const typedData: TypedDataDefinition = {
      domain: this._domain,
      types: ADJUSTMENT_TYPES,
      primaryType: 'Adjustment',
      message: {
        adjuster: this._adjuster,
        fillIndex: this._fillIndex,
        targetBlock: this._targetBlock,
        supplementalPriceCurve: this._supplementalPriceCurve,
        validityConditions: this._validityConditions,
        nonce: this._nonce,
        claimHash,
      },
    }

    // Compute the message hash for verification
    const hash = computeAdjustmentHash(adjustment, claimHash)

    return { adjustment, typedData, hash }
  }

  /**
   * Build the adjustment with signature
   *
   * @param claimHash - The claim hash this adjustment applies to
   * @param signature - The adjuster's signature
   * @returns Complete ExarchAdjustment with signature
   */
  buildWithSignature(claimHash: Hex, signature: Hex): ExarchAdjustment {
    const { adjustment } = this.build(claimHash)
    return {
      ...adjustment,
      adjustmentAuthorization: signature,
    }
  }
}

/**
 * Compute the adjustment hash for signing verification
 * Matches Solidity _toAdjustmentHash
 *
 * EIP-712 struct hash = keccak256(typeHash ‖ encodeData(s))
 * Order matches ADJUSTMENT_TYPESTRING:
 * Adjustment(address adjuster,bytes32 claimHash,uint256 fillIndex,uint256 targetBlock,uint256[] supplementalPriceCurve,bytes32 validityConditions,uint256 nonce)
 */
function computeAdjustmentHash(adjustment: Omit<ExarchAdjustment, 'adjustmentAuthorization'>, claimHash: Hex): Hex {
  // Hash the supplemental price curve array
  const curveHash = keccak256(
    encodePacked(
      adjustment.supplementalPriceCurve.map(() => 'uint256'),
      adjustment.supplementalPriceCurve
    )
  )

  // EIP-712 struct hash includes typehash
  return keccak256(
    encodeAbiParameters(
      [
        { name: 'typehash', type: 'bytes32' },
        { name: 'adjuster', type: 'address' },
        { name: 'claimHash', type: 'bytes32' },
        { name: 'fillIndex', type: 'uint256' },
        { name: 'targetBlock', type: 'uint256' },
        { name: 'curveHash', type: 'bytes32' },
        { name: 'validityConditions', type: 'bytes32' },
        { name: 'nonce', type: 'uint256' },
      ],
      [
        EXARCH_ADJUSTMENT_TYPEHASH,
        adjustment.adjuster,
        claimHash,
        adjustment.fillIndex,
        adjustment.targetBlock,
        curveHash,
        adjustment.validityConditions,
        adjustment.nonce,
      ]
    )
  )
}

/**
 * Builder for FillInstruction
 * Used for actual fill execution on target chain
 */
export class FillInstructionBuilder {
  private _fillToken?: Address
  private _fillAmount?: bigint
  private _recipient?: Address

  /**
   * Set the fill token address
   * @param token - ERC20 token address or address(0) for native
   * @returns This builder for chaining
   */
  fillToken(token: Address): this {
    this._fillToken = token
    return this
  }

  /**
   * Set the fill amount
   * @param amount - Amount of tokens to provide
   * @returns This builder for chaining
   */
  fillAmount(amount: bigint): this {
    this._fillAmount = amount
    return this
  }

  /**
   * Set the recipient address
   * @param recipient - Address that will receive the tokens
   * @returns This builder for chaining
   */
  recipient(recipient: Address): this {
    this._recipient = recipient
    return this
  }

  /**
   * Build the final FillInstruction
   * @returns Constructed FillInstruction
   * @throws Error if required fields are missing
   */
  build(): FillInstruction {
    invariant(this._fillToken, 'fillToken is required')
    invariant(this._fillAmount !== undefined, 'fillAmount is required')
    invariant(this._recipient, 'recipient is required')

    return {
      fillToken: this._fillToken,
      fillAmount: this._fillAmount,
      recipient: this._recipient,
    }
  }
}

/**
 * Main ExarchBuilder class with static factory methods
 * Provides convenient entry points for building Exarch structures
 *
 * @example
 * ```typescript
 * const mandate = ExarchBuilder.mandate()
 *   .adjuster(adjusterAddress)
 *   .legate(legateAddress)
 *   .fill((f) => f.chainId(1n).exarch(exarchAddr).expires(expiry)...)
 *   .build()
 * ```
 */
export class ExarchBuilder {
  /**
   * Create a new ExarchMandateBuilder
   * @returns A new ExarchMandateBuilder instance
   */
  static mandate(): ExarchMandateBuilder {
    return new ExarchMandateBuilder()
  }

  /**
   * Create a new ExarchFillParametersBuilder
   * @returns A new ExarchFillParametersBuilder instance
   */
  static fill(): ExarchFillParametersBuilder {
    return new ExarchFillParametersBuilder()
  }

  /**
   * Create a new ExarchFillComponentBuilder
   * @returns A new ExarchFillComponentBuilder instance
   */
  static component(): ExarchFillComponentBuilder {
    return new ExarchFillComponentBuilder()
  }

  /**
   * Create a new ExarchAdjustmentBuilder
   * @param domain - The Exarch EIP-712 domain for signing adjustments
   * @returns A new ExarchAdjustmentBuilder instance
   */
  static adjustment(domain: ExarchDomain): ExarchAdjustmentBuilder {
    return new ExarchAdjustmentBuilder(domain)
  }

  /**
   * Create a new ExarchAdjustmentBuilder with domain created from parameters
   * @param params - Chain ID and Exarch contract address
   * @returns A new ExarchAdjustmentBuilder instance
   */
  static adjustmentForChain(params: { chainId: number; exarchAddress: Address }): ExarchAdjustmentBuilder {
    const domain = createExarchDomain(params)
    return new ExarchAdjustmentBuilder(domain)
  }

  /**
   * Create a new FillInstructionBuilder
   * @returns A new FillInstructionBuilder instance
   */
  static fillInstruction(): FillInstructionBuilder {
    return new FillInstructionBuilder()
  }
}

/**
 * Convenience functions for common patterns
 */

/**
 * Create a simple same-chain fill with a single component
 * For same-chain fills, bonding parameters are optional (claimAndFill is atomic)
 *
 * @param params - Fill parameters
 * @returns Constructed ExarchFillParameters for a same-chain fill
 */
export function createExarchSameChainFill(params: {
  chainId: bigint
  exarch: Address
  expires: bigint
  fillToken: Address
  minimumFillAmount: bigint
  recipient: Address
  bondAmount?: bigint
  earnestAmount?: bigint
  holdPeriod?: bigint
  priceCurve?: PriceCurveElement[]
  scalingFactor?: bigint
}): ExarchFillParameters {
  const builder = ExarchBuilder.fill()
    .chainId(params.chainId)
    .exarch(params.exarch)
    .expires(params.expires)
    .component((c) =>
      c.fillToken(params.fillToken).minimumFillAmount(params.minimumFillAmount).recipient(params.recipient)
    )

  if (params.bondAmount !== undefined) {
    builder.bondAmount(params.bondAmount)
  }
  if (params.earnestAmount !== undefined) {
    builder.earnestAmount(params.earnestAmount)
  }
  if (params.holdPeriod !== undefined) {
    builder.holdPeriod(params.holdPeriod)
  }
  if (params.priceCurve) {
    builder.priceCurve(params.priceCurve)
  }
  if (params.scalingFactor !== undefined) {
    builder.scalingFactor(params.scalingFactor)
  }

  return builder.build()
}

/**
 * Create a cross-chain fill with bridge callback
 * For cross-chain fills, bonding parameters are required
 *
 * @param params - Cross-chain fill parameters
 * @returns Constructed ExarchFillParameters with recipient callback for cross-chain operation
 */
export function createExarchCrossChainFill(params: {
  sourceChainId: bigint
  targetChainId: bigint
  sourceExarch: Address
  expires: bigint
  fillToken: Address
  minimumFillAmount: bigint
  bridgeRecipient: Address
  bondAmount: bigint
  earnestAmount: bigint
  holdPeriod: bigint
  targetCompact: BatchCompact
  targetMandateHash: Hex
  priceCurve?: PriceCurveElement[]
  context?: Hex
}): ExarchFillParameters {
  const recipientCallback: ExarchRecipientCallback = {
    chainId: params.targetChainId,
    compact: params.targetCompact,
    mandateHash: params.targetMandateHash,
    context: params.context || '0x',
  }

  return ExarchBuilder.fill()
    .chainId(params.sourceChainId)
    .exarch(params.sourceExarch)
    .expires(params.expires)
    .component((c) =>
      c.fillToken(params.fillToken).minimumFillAmount(params.minimumFillAmount).recipient(params.bridgeRecipient)
    )
    .bondAmount(params.bondAmount)
    .earnestAmount(params.earnestAmount)
    .holdPeriod(params.holdPeriod)
    .priceCurve(params.priceCurve || [])
    .addRecipientCallback(recipientCallback)
    .build()
}

// Re-export types for convenience
export type { ExarchDomain } from '../config/exarch'
