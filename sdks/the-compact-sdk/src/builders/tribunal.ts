/**
 * Fluent builders for creating Tribunal mandates and fill parameters
 */

import { FillComponent, FillParameters, Mandate, RecipientCallback } from '../types/tribunal'
import { createPriceCurve, PriceCurveElement } from '../lib/priceCurve'
import invariant from 'tiny-invariant'

/**
 * Builder for FillComponent
 */
export class FillComponentBuilder {
  private _fillToken?: `0x${string}`
  private _minimumFillAmount?: bigint
  private _recipient?: `0x${string}`
  private _applyScaling = false

  /**
   * Set the fill token address (address(0) for native)
   */
  fillToken(token: `0x${string}`): this {
    this._fillToken = token
    return this
  }

  /**
   * Set the minimum fill amount
   */
  minimumFillAmount(amount: bigint): this {
    this._minimumFillAmount = amount
    return this
  }

  /**
   * Set the recipient address
   */
  recipient(recipient: `0x${string}`): this {
    this._recipient = recipient
    return this
  }

  /**
   * Enable priority fee scaling for this component
   */
  applyScaling(apply = true): this {
    this._applyScaling = apply
    return this
  }

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
 */
export class FillParametersBuilder {
  private _chainId?: bigint
  private _tribunal?: `0x${string}`
  private _expires?: bigint
  private _components: FillComponent[] = []
  private _baselinePriorityFee = 0n
  private _scalingFactor = 1000000000000000000n // 1e18 (neutral)
  private _priceCurve: bigint[] = []
  private _recipientCallback: RecipientCallback[] = []
  private _salt: `0x${string}` = '0x0000000000000000000000000000000000000000000000000000000000000000'

  /**
   * Set the chain ID for this fill
   */
  chainId(chainId: bigint): this {
    this._chainId = chainId
    return this
  }

  /**
   * Set the Tribunal contract address
   */
  tribunal(tribunal: `0x${string}`): this {
    this._tribunal = tribunal
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
   * Add a fill component
   */
  addComponent(component: FillComponent): this {
    this._components.push(component)
    return this
  }

  /**
   * Add a fill component using a builder
   */
  component(builderFn: (builder: FillComponentBuilder) => FillComponentBuilder): this {
    const builder = new FillComponentBuilder()
    const result = builderFn(builder)
    this._components.push(result.build())
    return this
  }

  /**
   * Set the baseline priority fee threshold
   */
  baselinePriorityFee(fee: bigint): this {
    this._baselinePriorityFee = fee
    return this
  }

  /**
   * Set the fee scaling factor (1e18 = baseline)
   */
  scalingFactor(factor: bigint): this {
    this._scalingFactor = factor
    return this
  }

  /**
   * Set the price curve from an array of elements
   */
  priceCurve(elements: PriceCurveElement[]): this {
    this._priceCurve = createPriceCurve(elements)
    return this
  }

  /**
   * Set the price curve from packed elements
   */
  priceCurveRaw(curve: bigint[]): this {
    this._priceCurve = curve
    return this
  }

  /**
   * Add a recipient callback for bridge operations
   */
  addRecipientCallback(callback: RecipientCallback): this {
    this._recipientCallback.push(callback)
    return this
  }

  /**
   * Set the salt for uniqueness
   */
  salt(salt: `0x${string}`): this {
    this._salt = salt
    return this
  }

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
 */
export class MandateBuilder {
  private _adjuster?: `0x${string}`
  private _fills: FillParameters[] = []

  /**
   * Set the adjuster address
   */
  adjuster(adjuster: `0x${string}`): this {
    this._adjuster = adjuster
    return this
  }

  /**
   * Add a fill operation
   */
  addFill(fill: FillParameters): this {
    this._fills.push(fill)
    return this
  }

  /**
   * Add a fill operation using a builder
   */
  fill(builderFn: (builder: FillParametersBuilder) => FillParametersBuilder): this {
    const builder = new FillParametersBuilder()
    const result = builderFn(builder)
    this._fills.push(result.build())
    return this
  }

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
 */
export class TribunalBuilder {
  static mandate(): MandateBuilder {
    return new MandateBuilder()
  }

  static fill(): FillParametersBuilder {
    return new FillParametersBuilder()
  }

  static component(): FillComponentBuilder {
    return new FillComponentBuilder()
  }
}

/**
 * Convenience functions for common patterns
 */

/**
 * Create a simple same-chain fill
 */
export function createSameChainFill(params: {
  chainId: bigint
  tribunal: `0x${string}`
  expires: bigint
  fillToken: `0x${string}`
  minimumFillAmount: bigint
  recipient: `0x${string}`
  priceCurve?: PriceCurveElement[]
  scalingFactor?: bigint
}): FillParameters {
  return TribunalBuilder.fill()
    .chainId(params.chainId)
    .tribunal(params.tribunal)
    .expires(params.expires)
    .component((c) => c.fillToken(params.fillToken).minimumFillAmount(params.minimumFillAmount).recipient(params.recipient))
    .priceCurve(params.priceCurve || [])
    .scalingFactor(params.scalingFactor || 1000000000000000000n)
    .build()
}

/**
 * Create a cross-chain fill with bridge callback
 */
export function createCrossChainFill(params: {
  sourceChainId: bigint
  targetChainId: bigint
  sourceTribunal: `0x${string}`
  expires: bigint
  fillToken: `0x${string}`
  minimumFillAmount: bigint
  bridgeRecipient: `0x${string}`
  targetCompact: import('../types/eip712').BatchCompact
  targetMandateHash: `0x${string}`
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
