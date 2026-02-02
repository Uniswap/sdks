/**
 * Fluent builders for creating Tribunal mandates, fill parameters, and adjustments
 */

import invariant from 'tiny-invariant'
import { Address, Hex, keccak256, encodePacked, encodeAbiParameters, TypedDataDefinition } from 'viem'

import { TribunalDomain } from '../config/tribunal'
import { TRIBUNAL_ADJUSTMENT_TYPEHASH } from '../encoding/tribunal'
import { createPriceCurve, PriceCurveElement } from '../lib/priceCurve'
import { FillComponent, FillParameters, Mandate, RecipientCallback, Adjustment } from '../types/tribunal'
import { randomHex32 } from '../utils/random'

/**
 * Builder for FillComponent
 * Provides a fluent interface for constructing fill component specifications
 */
export class FillComponentBuilder {
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
   * Enable priority fee scaling for this component
   * @param apply - Whether to apply priority fee scaling (default: true)
   * @returns This builder for chaining
   */
  applyScaling(apply = true): this {
    this._applyScaling = apply
    return this
  }

  /**
   * Build the final FillComponent
   * @returns Constructed FillComponent
   * @throws Error if required fields are missing
   */
  build(): FillComponent {
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
 * Builder for FillParameters
 * Provides a fluent interface for constructing fill parameters with price curves and callbacks
 */
export class FillParametersBuilder {
  private _chainId?: bigint
  private _tribunal?: Address
  private _expires?: bigint
  private _components: FillComponent[] = []
  private _baselinePriorityFee = 0n
  private _scalingFactor = 1000000000000000000n // 1e18 (neutral)
  private _priceCurve: bigint[] = []
  private _recipientCallback: RecipientCallback[] = []
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
   * Set the Tribunal contract address
   * @param tribunal - Address of the Tribunal contract on the target chain
   * @returns This builder for chaining
   */
  tribunal(tribunal: Address): this {
    this._tribunal = tribunal
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
   * @param component - Pre-constructed FillComponent to add
   * @returns This builder for chaining
   */
  addComponent(component: FillComponent): this {
    this._components.push(component)
    return this
  }

  /**
   * Add a fill component using a builder function
   * @param builderFn - Function that receives a FillComponentBuilder and returns it configured
   * @returns This builder for chaining
   */
  component(builderFn: (builder: FillComponentBuilder) => FillComponentBuilder): this {
    const builder = new FillComponentBuilder()
    const result = builderFn(builder)
    this._components.push(result.build())
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
   * @param callback - RecipientCallback defining cross-chain compact registration
   * @returns This builder for chaining
   */
  addRecipientCallback(callback: RecipientCallback): this {
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
   * Build the final FillParameters
   * @returns Constructed FillParameters
   * @throws Error if required fields are missing
   */
  build(): FillParameters {
    invariant(this._chainId !== undefined, 'chainId is required')
    invariant(this._tribunal, 'tribunal is required')
    invariant(this._expires !== undefined, 'expires is required')
    invariant(this._components.length > 0, 'at least one component is required')

    return {
      chainId: this._chainId,
      tribunal: this._tribunal,
      expires: this._expires,
      components: this._components,
      baselinePriorityFee: this._baselinePriorityFee,
      scalingFactor: this._scalingFactor,
      priceCurve: this._priceCurve,
      recipientCallback: this._recipientCallback,
      salt: this._salt,
    }
  }
}

/**
 * Builder for Mandate
 * Provides a fluent interface for constructing mandates with multiple fills
 */
export class MandateBuilder {
  private _adjuster?: Address
  private _fills: FillParameters[] = []

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
   * Add a fill operation
   * @param fill - Pre-constructed FillParameters to add
   * @returns This builder for chaining
   */
  addFill(fill: FillParameters): this {
    this._fills.push(fill)
    return this
  }

  /**
   * Add a fill operation using a builder function
   * @param builderFn - Function that receives a FillParametersBuilder and returns it configured
   * @returns This builder for chaining
   */
  fill(builderFn: (builder: FillParametersBuilder) => FillParametersBuilder): this {
    const builder = new FillParametersBuilder()
    const result = builderFn(builder)
    this._fills.push(result.build())
    return this
  }

  /**
   * Build the final Mandate
   * @returns Constructed Mandate
   * @throws Error if required fields are missing
   */
  build(): Mandate {
    invariant(this._adjuster, 'adjuster is required')
    invariant(this._fills.length > 0, 'at least one fill is required')

    return {
      adjuster: this._adjuster,
      fills: this._fills,
    }
  }
}

/**
 * Main TribunalBuilder class with static factory methods
 * Provides convenient entry points for building Tribunal structures
 *
 * @example
 * ```typescript
 * const mandate = TribunalBuilder.mandate()
 *   .adjuster(adjusterAddress)
 *   .fill((f) => f.chainId(1n).tribunal(tribunalAddr).expires(expiry)...)
 *   .build()
 * ```
 */
export class TribunalBuilder {
  /**
   * Create a new MandateBuilder
   * @returns A new MandateBuilder instance
   */
  static mandate(): MandateBuilder {
    return new MandateBuilder()
  }

  /**
   * Create a new FillParametersBuilder
   * @returns A new FillParametersBuilder instance
   */
  static fill(): FillParametersBuilder {
    return new FillParametersBuilder()
  }

  /**
   * Create a new FillComponentBuilder
   * @returns A new FillComponentBuilder instance
   */
  static component(): FillComponentBuilder {
    return new FillComponentBuilder()
  }
}

/**
 * Convenience functions for common patterns
 */

/**
 * Create a simple same-chain fill with a single component
 * @param params - Fill parameters
 * @param params.chainId - Chain ID where fill occurs
 * @param params.tribunal - Tribunal contract address
 * @param params.expires - Expiration timestamp
 * @param params.fillToken - Token address to be provided
 * @param params.minimumFillAmount - Minimum amount required
 * @param params.recipient - Recipient address
 * @param params.priceCurve - Optional price curve elements
 * @param params.scalingFactor - Optional scaling factor (default: 1e18)
 * @returns Constructed FillParameters for a same-chain fill
 */
export function createSameChainFill(params: {
  chainId: bigint
  tribunal: Address
  expires: bigint
  fillToken: Address
  minimumFillAmount: bigint
  recipient: Address
  priceCurve?: PriceCurveElement[]
  scalingFactor?: bigint
}): FillParameters {
  return TribunalBuilder.fill()
    .chainId(params.chainId)
    .tribunal(params.tribunal)
    .expires(params.expires)
    .component((c) =>
      c.fillToken(params.fillToken).minimumFillAmount(params.minimumFillAmount).recipient(params.recipient)
    )
    .priceCurve(params.priceCurve || [])
    .scalingFactor(params.scalingFactor || 1000000000000000000n)
    .build()
}

/**
 * Create a cross-chain fill with bridge callback
 * Enables fillers to receive tokens on source chain plus a compact to register on target chain
 *
 * @param params - Cross-chain fill parameters
 * @param params.sourceChainId - Source chain ID where fill is executed
 * @param params.targetChainId - Target chain ID for the callback
 * @param params.sourceTribunal - Tribunal contract address on source chain
 * @param params.expires - Expiration timestamp
 * @param params.fillToken - Token address to be provided on source chain
 * @param params.minimumFillAmount - Minimum amount required
 * @param params.bridgeRecipient - Recipient address (typically the bridge contract)
 * @param params.targetCompact - BatchCompact to be registered on target chain
 * @param params.targetMandateHash - Hash of the mandate for the target chain compact
 * @param params.priceCurve - Optional price curve elements
 * @returns Constructed FillParameters with recipient callback for cross-chain operation
 */
export function createCrossChainFill(params: {
  sourceChainId: bigint
  targetChainId: bigint
  sourceTribunal: Address
  expires: bigint
  fillToken: Address
  minimumFillAmount: bigint
  bridgeRecipient: Address
  targetCompact: import('../types/eip712').BatchCompact
  targetMandateHash: Hex
  priceCurve?: PriceCurveElement[]
}): FillParameters {
  const recipientCallback: RecipientCallback = {
    chainId: params.targetChainId,
    compact: params.targetCompact,
    mandateHash: params.targetMandateHash,
    context: '0x',
  }

  return TribunalBuilder.fill()
    .chainId(params.sourceChainId)
    .tribunal(params.sourceTribunal)
    .expires(params.expires)
    .component((c) =>
      c.fillToken(params.fillToken).minimumFillAmount(params.minimumFillAmount).recipient(params.bridgeRecipient)
    )
    .priceCurve(params.priceCurve || [])
    .addRecipientCallback(recipientCallback)
    .build()
}

// ============ EIP-712 Types for Adjustment ============

/**
 * EIP-712 type definition for Tribunal Adjustment
 *
 * IMPORTANT: Unlike Exarch, Tribunal's adjustment does NOT include:
 * - adjuster address (recovered from signature instead)
 * - nonce (replay protection is via claim hash uniqueness)
 */
const TRIBUNAL_ADJUSTMENT_TYPES = {
  Adjustment: [
    { name: 'claimHash', type: 'bytes32' },
    { name: 'fillIndex', type: 'uint256' },
    { name: 'targetBlock', type: 'uint256' },
    { name: 'supplementalPriceCurve', type: 'uint256[]' },
    { name: 'validityConditions', type: 'bytes32' },
  ],
} as const

/**
 * Builder for Tribunal Adjustment
 * Provides a fluent interface for constructing and signing adjustments
 *
 * IMPORTANT: Unlike Exarch, Tribunal adjustments:
 * - Do NOT include adjuster address in the signed message (recovered from signature)
 * - Do NOT have a nonce field (replay protection is via claim hash uniqueness)
 *
 * Adjustments are signed using the Tribunal domain, not The Compact domain.
 *
 * @example
 * ```typescript
 * const domain = createTribunalDomain({ chainId: 1, tribunalAddress: '0x...' })
 * const builder = new TribunalAdjustmentBuilder(domain)
 *   .adjuster(adjusterAddress)
 *   .fillIndex(0n)
 *   .targetBlock(currentBlock)
 *   .supplementalPriceCurve([])
 *
 * const { typedData, hash } = builder.build(claimHash)
 * const signature = await walletClient.signTypedData(typedData)
 * const adjustment = builder.buildWithSignature(claimHash, signature)
 * ```
 */
export class TribunalAdjustmentBuilder {
  private _domain: TribunalDomain
  private _adjuster?: Address
  private _fillIndex?: bigint
  private _targetBlock?: bigint
  private _supplementalPriceCurve: bigint[] = []
  private _validityConditions: Hex = '0x0000000000000000000000000000000000000000000000000000000000000000'

  /**
   * Create a new TribunalAdjustmentBuilder
   * @param domain - The Tribunal EIP-712 domain for signing
   */
  constructor(domain: TribunalDomain) {
    this._domain = domain
  }

  /**
   * Set the adjuster address
   *
   * NOTE: This address is NOT included in the signed message (unlike Exarch).
   * It is stored in the Adjustment struct but the address is recovered from the signature.
   *
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
   * Set an exclusive filler for this adjustment
   * @param filler - Address of the exclusive filler (lower 160 bits of validityConditions)
   * @returns This builder for chaining
   */
  exclusiveFiller(filler: Address): this {
    const upper96 = BigInt(this._validityConditions) >> 160n
    const newConditions = (upper96 << 160n) | BigInt(filler)
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
   * Build the adjustment without signature
   * Returns typed data for signing
   *
   * @param claimHash - The claim hash this adjustment applies to
   * @returns Adjustment data, typed data definition for signing, and the message hash
   */
  build(claimHash: Hex): {
    adjustment: Omit<Adjustment, 'adjustmentAuthorization'>
    typedData: TypedDataDefinition
    hash: Hex
  } {
    invariant(this._adjuster, 'adjuster is required')
    invariant(this._fillIndex !== undefined, 'fillIndex is required')
    invariant(this._targetBlock !== undefined, 'targetBlock is required')

    const adjustment: Omit<Adjustment, 'adjustmentAuthorization'> = {
      adjuster: this._adjuster,
      fillIndex: this._fillIndex,
      targetBlock: this._targetBlock,
      supplementalPriceCurve: this._supplementalPriceCurve,
      validityConditions: this._validityConditions,
    }

    // NOTE: Tribunal's typed data does NOT include adjuster (unlike Exarch)
    const typedData: TypedDataDefinition = {
      domain: this._domain,
      types: TRIBUNAL_ADJUSTMENT_TYPES,
      primaryType: 'Adjustment',
      message: {
        claimHash,
        fillIndex: this._fillIndex,
        targetBlock: this._targetBlock,
        supplementalPriceCurve: this._supplementalPriceCurve,
        validityConditions: this._validityConditions,
      },
    }

    // Compute the message hash for verification
    const hash = computeTribunalAdjustmentHash(adjustment, claimHash)

    return { adjustment, typedData, hash }
  }

  /**
   * Build the adjustment with signature
   *
   * @param claimHash - The claim hash this adjustment applies to
   * @param signature - The adjuster's signature
   * @returns Complete Adjustment with signature
   */
  buildWithSignature(claimHash: Hex, signature: Hex): Adjustment {
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
 * NOTE: Unlike Exarch, this does NOT include adjuster address or nonce
 */
function computeTribunalAdjustmentHash(adjustment: Omit<Adjustment, 'adjustmentAuthorization'>, claimHash: Hex): Hex {
  // Encode the supplemental price curve array
  const curveHash = keccak256(
    encodePacked(
      adjustment.supplementalPriceCurve.map(() => 'uint256'),
      adjustment.supplementalPriceCurve
    )
  )

  // Encode the adjustment struct
  return keccak256(
    encodeAbiParameters(
      [
        { name: 'typehash', type: 'bytes32' },
        { name: 'claimHash', type: 'bytes32' },
        { name: 'fillIndex', type: 'uint256' },
        { name: 'targetBlock', type: 'uint256' },
        { name: 'curveHash', type: 'bytes32' },
        { name: 'validityConditions', type: 'bytes32' },
      ],
      [
        TRIBUNAL_ADJUSTMENT_TYPEHASH,
        claimHash,
        adjustment.fillIndex,
        adjustment.targetBlock,
        curveHash,
        adjustment.validityConditions,
      ]
    )
  )
}
