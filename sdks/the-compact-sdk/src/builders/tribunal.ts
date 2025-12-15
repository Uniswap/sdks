/**
 * Fluent builders for creating Tribunal mandates and fill parameters
 */

import invariant from 'tiny-invariant'

import { createPriceCurve, PriceCurveElement } from '../lib/priceCurve'
import { FillComponent, FillParameters, Mandate, RecipientCallback } from '../types/tribunal'
import { Address, Hex, toHex } from 'viem'
import { randomBytes } from 'crypto'

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
  private _salt: Hex = toHex(randomBytes(32))

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
    this._salt = toHex(randomBytes(32))
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
