/**
 * Fluent builders for creating Tribunal mandates and fill parameters
 */
import { FillComponent, FillParameters, Mandate, RecipientCallback } from '../types/tribunal';
import { PriceCurveElement } from '../lib/priceCurve';
/**
 * Builder for FillComponent
 * Provides a fluent interface for constructing fill component specifications
 */
export declare class FillComponentBuilder {
    private _fillToken?;
    private _minimumFillAmount?;
    private _recipient?;
    private _applyScaling;
    /**
     * Set the fill token address (address(0) for native)
     * @param token - ERC20 token address or address(0) for native token
     * @returns This builder for chaining
     */
    fillToken(token: `0x${string}`): this;
    /**
     * Set the minimum fill amount
     * @param amount - Minimum amount of tokens to be provided (in token's smallest unit)
     * @returns This builder for chaining
     */
    minimumFillAmount(amount: bigint): this;
    /**
     * Set the recipient address
     * @param recipient - Address that will receive the fill tokens
     * @returns This builder for chaining
     */
    recipient(recipient: `0x${string}`): this;
    /**
     * Enable priority fee scaling for this component
     * @param apply - Whether to apply priority fee scaling (default: true)
     * @returns This builder for chaining
     */
    applyScaling(apply?: boolean): this;
    /**
     * Build the final FillComponent
     * @returns Constructed FillComponent
     * @throws Error if required fields are missing
     */
    build(): FillComponent;
}
/**
 * Builder for FillParameters
 * Provides a fluent interface for constructing fill parameters with price curves and callbacks
 */
export declare class FillParametersBuilder {
    private _chainId?;
    private _tribunal?;
    private _expires?;
    private _components;
    private _baselinePriorityFee;
    private _scalingFactor;
    private _priceCurve;
    private _recipientCallback;
    private _salt;
    /**
     * Set the chain ID for this fill
     * @param chainId - Chain ID where the fill should be executed
     * @returns This builder for chaining
     */
    chainId(chainId: bigint): this;
    /**
     * Set the Tribunal contract address
     * @param tribunal - Address of the Tribunal contract on the target chain
     * @returns This builder for chaining
     */
    tribunal(tribunal: `0x${string}`): this;
    /**
     * Set the expiration timestamp
     * @param expires - Unix timestamp after which the fill expires
     * @returns This builder for chaining
     */
    expires(expires: bigint): this;
    /**
     * Add a fill component
     * @param component - Pre-constructed FillComponent to add
     * @returns This builder for chaining
     */
    addComponent(component: FillComponent): this;
    /**
     * Add a fill component using a builder function
     * @param builderFn - Function that receives a FillComponentBuilder and returns it configured
     * @returns This builder for chaining
     */
    component(builderFn: (builder: FillComponentBuilder) => FillComponentBuilder): this;
    /**
     * Set the baseline priority fee threshold
     * @param fee - Priority fee threshold in wei (scaling kicks in when block.basefee exceeds this)
     * @returns This builder for chaining
     */
    baselinePriorityFee(fee: bigint): this;
    /**
     * Set the fee scaling factor
     * @param factor - Scaling factor (1e18 = neutral/100%, >1e18 = exact-in, <1e18 = exact-out)
     * @returns This builder for chaining
     */
    scalingFactor(factor: bigint): this;
    /**
     * Set the price curve from an array of elements
     * @param elements - Array of PriceCurveElements defining the auction behavior
     * @returns This builder for chaining
     */
    priceCurve(elements: PriceCurveElement[]): this;
    /**
     * Set the price curve from packed elements
     * @param curve - Array of pre-packed uint256 price curve elements
     * @returns This builder for chaining
     */
    priceCurveRaw(curve: bigint[]): this;
    /**
     * Add a recipient callback for bridge operations
     * @param callback - RecipientCallback defining cross-chain compact registration
     * @returns This builder for chaining
     */
    addRecipientCallback(callback: RecipientCallback): this;
    /**
     * Set the salt for uniqueness
     * @param salt - 32-byte salt for making fills unique
     * @returns This builder for chaining
     */
    salt(salt: `0x${string}`): this;
    /**
     * Build the final FillParameters
     * @returns Constructed FillParameters
     * @throws Error if required fields are missing
     */
    build(): FillParameters;
}
/**
 * Builder for Mandate
 * Provides a fluent interface for constructing mandates with multiple fills
 */
export declare class MandateBuilder {
    private _adjuster?;
    private _fills;
    /**
     * Set the adjuster address
     * @param adjuster - Address of the adjuster who can modify fills
     * @returns This builder for chaining
     */
    adjuster(adjuster: `0x${string}`): this;
    /**
     * Add a fill operation
     * @param fill - Pre-constructed FillParameters to add
     * @returns This builder for chaining
     */
    addFill(fill: FillParameters): this;
    /**
     * Add a fill operation using a builder function
     * @param builderFn - Function that receives a FillParametersBuilder and returns it configured
     * @returns This builder for chaining
     */
    fill(builderFn: (builder: FillParametersBuilder) => FillParametersBuilder): this;
    /**
     * Build the final Mandate
     * @returns Constructed Mandate
     * @throws Error if required fields are missing
     */
    build(): Mandate;
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
export declare class TribunalBuilder {
    /**
     * Create a new MandateBuilder
     * @returns A new MandateBuilder instance
     */
    static mandate(): MandateBuilder;
    /**
     * Create a new FillParametersBuilder
     * @returns A new FillParametersBuilder instance
     */
    static fill(): FillParametersBuilder;
    /**
     * Create a new FillComponentBuilder
     * @returns A new FillComponentBuilder instance
     */
    static component(): FillComponentBuilder;
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
export declare function createSameChainFill(params: {
    chainId: bigint;
    tribunal: `0x${string}`;
    expires: bigint;
    fillToken: `0x${string}`;
    minimumFillAmount: bigint;
    recipient: `0x${string}`;
    priceCurve?: PriceCurveElement[];
    scalingFactor?: bigint;
}): FillParameters;
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
export declare function createCrossChainFill(params: {
    sourceChainId: bigint;
    targetChainId: bigint;
    sourceTribunal: `0x${string}`;
    expires: bigint;
    fillToken: `0x${string}`;
    minimumFillAmount: bigint;
    bridgeRecipient: `0x${string}`;
    targetCompact: import('../types/eip712').BatchCompact;
    targetMandateHash: `0x${string}`;
    priceCurve?: PriceCurveElement[];
}): FillParameters;
