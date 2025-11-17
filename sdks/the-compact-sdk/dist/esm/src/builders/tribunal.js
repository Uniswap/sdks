/**
 * Fluent builders for creating Tribunal mandates and fill parameters
 */
import { createPriceCurve } from '../lib/priceCurve';
import invariant from 'tiny-invariant';
/**
 * Builder for FillComponent
 * Provides a fluent interface for constructing fill component specifications
 */
export class FillComponentBuilder {
    constructor() {
        this._applyScaling = false;
    }
    /**
     * Set the fill token address (address(0) for native)
     * @param token - ERC20 token address or address(0) for native token
     * @returns This builder for chaining
     */
    fillToken(token) {
        this._fillToken = token;
        return this;
    }
    /**
     * Set the minimum fill amount
     * @param amount - Minimum amount of tokens to be provided (in token's smallest unit)
     * @returns This builder for chaining
     */
    minimumFillAmount(amount) {
        this._minimumFillAmount = amount;
        return this;
    }
    /**
     * Set the recipient address
     * @param recipient - Address that will receive the fill tokens
     * @returns This builder for chaining
     */
    recipient(recipient) {
        this._recipient = recipient;
        return this;
    }
    /**
     * Enable priority fee scaling for this component
     * @param apply - Whether to apply priority fee scaling (default: true)
     * @returns This builder for chaining
     */
    applyScaling(apply = true) {
        this._applyScaling = apply;
        return this;
    }
    /**
     * Build the final FillComponent
     * @returns Constructed FillComponent
     * @throws Error if required fields are missing
     */
    build() {
        invariant(this._fillToken, 'fillToken is required');
        invariant(this._minimumFillAmount !== undefined, 'minimumFillAmount is required');
        invariant(this._recipient, 'recipient is required');
        return {
            fillToken: this._fillToken,
            minimumFillAmount: this._minimumFillAmount,
            recipient: this._recipient,
            applyScaling: this._applyScaling,
        };
    }
}
/**
 * Builder for FillParameters
 * Provides a fluent interface for constructing fill parameters with price curves and callbacks
 */
export class FillParametersBuilder {
    constructor() {
        this._components = [];
        this._baselinePriorityFee = 0n;
        this._scalingFactor = 1000000000000000000n; // 1e18 (neutral)
        this._priceCurve = [];
        this._recipientCallback = [];
        this._salt = '0x0000000000000000000000000000000000000000000000000000000000000000';
    }
    /**
     * Set the chain ID for this fill
     * @param chainId - Chain ID where the fill should be executed
     * @returns This builder for chaining
     */
    chainId(chainId) {
        this._chainId = chainId;
        return this;
    }
    /**
     * Set the Tribunal contract address
     * @param tribunal - Address of the Tribunal contract on the target chain
     * @returns This builder for chaining
     */
    tribunal(tribunal) {
        this._tribunal = tribunal;
        return this;
    }
    /**
     * Set the expiration timestamp
     * @param expires - Unix timestamp after which the fill expires
     * @returns This builder for chaining
     */
    expires(expires) {
        this._expires = expires;
        return this;
    }
    /**
     * Add a fill component
     * @param component - Pre-constructed FillComponent to add
     * @returns This builder for chaining
     */
    addComponent(component) {
        this._components.push(component);
        return this;
    }
    /**
     * Add a fill component using a builder function
     * @param builderFn - Function that receives a FillComponentBuilder and returns it configured
     * @returns This builder for chaining
     */
    component(builderFn) {
        const builder = new FillComponentBuilder();
        const result = builderFn(builder);
        this._components.push(result.build());
        return this;
    }
    /**
     * Set the baseline priority fee threshold
     * @param fee - Priority fee threshold in wei (scaling kicks in when block.basefee exceeds this)
     * @returns This builder for chaining
     */
    baselinePriorityFee(fee) {
        this._baselinePriorityFee = fee;
        return this;
    }
    /**
     * Set the fee scaling factor
     * @param factor - Scaling factor (1e18 = neutral/100%, >1e18 = exact-in, <1e18 = exact-out)
     * @returns This builder for chaining
     */
    scalingFactor(factor) {
        this._scalingFactor = factor;
        return this;
    }
    /**
     * Set the price curve from an array of elements
     * @param elements - Array of PriceCurveElements defining the auction behavior
     * @returns This builder for chaining
     */
    priceCurve(elements) {
        this._priceCurve = createPriceCurve(elements);
        return this;
    }
    /**
     * Set the price curve from packed elements
     * @param curve - Array of pre-packed uint256 price curve elements
     * @returns This builder for chaining
     */
    priceCurveRaw(curve) {
        this._priceCurve = curve;
        return this;
    }
    /**
     * Add a recipient callback for bridge operations
     * @param callback - RecipientCallback defining cross-chain compact registration
     * @returns This builder for chaining
     */
    addRecipientCallback(callback) {
        this._recipientCallback.push(callback);
        return this;
    }
    /**
     * Set the salt for uniqueness
     * @param salt - 32-byte salt for making fills unique
     * @returns This builder for chaining
     */
    salt(salt) {
        this._salt = salt;
        return this;
    }
    /**
     * Build the final FillParameters
     * @returns Constructed FillParameters
     * @throws Error if required fields are missing
     */
    build() {
        invariant(this._chainId !== undefined, 'chainId is required');
        invariant(this._tribunal, 'tribunal is required');
        invariant(this._expires !== undefined, 'expires is required');
        invariant(this._components.length > 0, 'at least one component is required');
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
        };
    }
}
/**
 * Builder for Mandate
 * Provides a fluent interface for constructing mandates with multiple fills
 */
export class MandateBuilder {
    constructor() {
        this._fills = [];
    }
    /**
     * Set the adjuster address
     * @param adjuster - Address of the adjuster who can modify fills
     * @returns This builder for chaining
     */
    adjuster(adjuster) {
        this._adjuster = adjuster;
        return this;
    }
    /**
     * Add a fill operation
     * @param fill - Pre-constructed FillParameters to add
     * @returns This builder for chaining
     */
    addFill(fill) {
        this._fills.push(fill);
        return this;
    }
    /**
     * Add a fill operation using a builder function
     * @param builderFn - Function that receives a FillParametersBuilder and returns it configured
     * @returns This builder for chaining
     */
    fill(builderFn) {
        const builder = new FillParametersBuilder();
        const result = builderFn(builder);
        this._fills.push(result.build());
        return this;
    }
    /**
     * Build the final Mandate
     * @returns Constructed Mandate
     * @throws Error if required fields are missing
     */
    build() {
        invariant(this._adjuster, 'adjuster is required');
        invariant(this._fills.length > 0, 'at least one fill is required');
        return {
            adjuster: this._adjuster,
            fills: this._fills,
        };
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
    static mandate() {
        return new MandateBuilder();
    }
    /**
     * Create a new FillParametersBuilder
     * @returns A new FillParametersBuilder instance
     */
    static fill() {
        return new FillParametersBuilder();
    }
    /**
     * Create a new FillComponentBuilder
     * @returns A new FillComponentBuilder instance
     */
    static component() {
        return new FillComponentBuilder();
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
export function createSameChainFill(params) {
    return TribunalBuilder.fill()
        .chainId(params.chainId)
        .tribunal(params.tribunal)
        .expires(params.expires)
        .component((c) => c.fillToken(params.fillToken).minimumFillAmount(params.minimumFillAmount).recipient(params.recipient))
        .priceCurve(params.priceCurve || [])
        .scalingFactor(params.scalingFactor || 1000000000000000000n)
        .build();
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
export function createCrossChainFill(params) {
    const recipientCallback = {
        chainId: params.targetChainId,
        compact: params.targetCompact,
        mandateHash: params.targetMandateHash,
        context: '0x',
    };
    return TribunalBuilder.fill()
        .chainId(params.sourceChainId)
        .tribunal(params.sourceTribunal)
        .expires(params.expires)
        .component((c) => c.fillToken(params.fillToken).minimumFillAmount(params.minimumFillAmount).recipient(params.bridgeRecipient))
        .priceCurve(params.priceCurve || [])
        .addRecipientCallback(recipientCallback)
        .build();
}
//# sourceMappingURL=tribunal.js.map