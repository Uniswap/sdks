/**
 * Fluent builders for creating Compact, BatchCompact, and MultichainCompact messages
 */
import { Address, Hex } from 'viem';
import { CompactDomain } from '../config/domain';
import { Compact, BatchCompact, MultichainCompact, Lock, MultichainElement } from '../types/eip712';
import { MandateType } from './mandate';
/**
 * Result of building a compact
 * Contains all data needed to sign and submit a compact
 */
export interface BuiltCompact<TMandate extends object | undefined = undefined> {
    /** The compact struct ready to be submitted on-chain */
    struct: Compact;
    /** Optional witness data (mandate) attached to this compact */
    mandate?: TMandate;
    /** Type definition for the mandate (if present) */
    mandateType?: MandateType<TMandate extends object ? TMandate : any>;
    /** EIP-712 hash of the compact for signature verification */
    hash: Hex;
    /** Complete EIP-712 typed data structure for signing */
    typedData: {
        domain: CompactDomain;
        types: Record<string, Array<{
            name: string;
            type: string;
        }>>;
        primaryType: 'Compact';
        message: any;
    };
}
/**
 * Result of building a batch compact
 * Contains all data needed to sign and submit a batch compact covering multiple locks
 */
export interface BuiltBatchCompact<TMandate extends object | undefined = undefined> {
    /** The batch compact struct ready to be submitted on-chain */
    struct: BatchCompact;
    /** Optional witness data (mandate) attached to this batch compact */
    mandate?: TMandate;
    /** Type definition for the mandate (if present) */
    mandateType?: MandateType<TMandate extends object ? TMandate : any>;
    /** EIP-712 hash of the batch compact for signature verification */
    hash: Hex;
    /** Complete EIP-712 typed data structure for signing */
    typedData: {
        domain: CompactDomain;
        types: Record<string, Array<{
            name: string;
            type: string;
        }>>;
        primaryType: 'BatchCompact';
        message: any;
    };
}
/**
 * Result of building a multichain compact
 * Contains all data needed to sign and submit a multichain compact across multiple chains
 */
export interface BuiltMultichainCompact {
    /** The multichain compact struct ready to be submitted on-chain */
    struct: MultichainCompact;
    /** EIP-712 hash of the multichain compact for signature verification */
    hash: Hex;
    /** Complete EIP-712 typed data structure for signing */
    typedData: {
        domain: CompactDomain;
        types: Record<string, Array<{
            name: string;
            type: string;
        }>>;
        primaryType: 'MultichainCompact';
        message: any;
    };
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
export declare class SingleCompactBuilder<TMandate extends object | undefined = undefined> {
    private domain;
    private _arbiter?;
    private _sponsor?;
    private _nonce?;
    private _expires?;
    private _lockTag?;
    private _token?;
    private _amount?;
    private _mandate?;
    private _mandateType?;
    constructor(domain: CompactDomain);
    /**
     * Set the arbiter address who will process the claim
     * @param arbiter - Address authorized to process claims for this compact
     * @returns This builder for chaining
     */
    arbiter(arbiter: Address): this;
    /**
     * Set the sponsor address who is locking the tokens
     * @param sponsor - Address that owns and is locking the tokens
     * @returns This builder for chaining
     */
    sponsor(sponsor: Address): this;
    /**
     * Set the nonce for replay protection
     * @param nonce - Unique nonce value (typically incremental)
     * @returns This builder for chaining
     */
    nonce(nonce: bigint): this;
    /**
     * Set the expiration timestamp
     * @param timestamp - Unix timestamp in seconds when the compact expires
     * @returns This builder for chaining
     */
    expires(timestamp: bigint): this;
    /**
     * Set expiration timestamp (alias for expires())
     * @param timestamp - Unix timestamp in seconds
     */
    expiresAt(timestamp: bigint): this;
    /**
     * Set expiration relative to now
     * @param duration - Duration string (e.g., '1 hour', '30 minutes') or seconds as bigint/number
     * @example
     * ```typescript
     * builder.expiresIn('1 hour')  // Expires 1 hour from now
     * builder.expiresIn(3600)      // Expires in 3600 seconds
     * ```
     */
    expiresIn(duration: string | number): this;
    /**
     * Set the lock tag for the resource lock
     * @param lockTag - 12-byte lock tag identifying the lock configuration
     * @returns This builder for chaining
     */
    lockTag(lockTag: Hex): this;
    /**
     * Set the token address being locked
     * @param token - Address of the ERC20 token to lock
     * @returns This builder for chaining
     */
    token(token: Address): this;
    /**
     * Set the amount of tokens to lock
     * @param amount - Amount in wei to lock
     * @returns This builder for chaining
     */
    amount(amount: bigint): this;
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
    witness<T extends object>(mandateType: MandateType<T>, mandate: T): SingleCompactBuilder<T>;
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
    build(): BuiltCompact<TMandate>;
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
export declare class BatchCompactBuilder<TMandate extends object | undefined = undefined> {
    private domain;
    private _arbiter?;
    private _sponsor?;
    private _nonce?;
    private _expires?;
    private _commitments;
    private _mandate?;
    private _mandateType?;
    constructor(domain: CompactDomain);
    /**
     * Set the arbiter address who will process the claims
     * @param arbiter - Address authorized to process claims for this batch compact
     * @returns This builder for chaining
     */
    arbiter(arbiter: Address): this;
    /**
     * Set the sponsor address who is locking the tokens
     * @param sponsor - Address that owns and is locking the tokens
     * @returns This builder for chaining
     */
    sponsor(sponsor: Address): this;
    /**
     * Set the nonce for replay protection
     * @param nonce - Unique nonce value (typically incremental)
     * @returns This builder for chaining
     */
    nonce(nonce: bigint): this;
    /**
     * Set the expiration timestamp
     * @param timestamp - Unix timestamp in seconds when the batch compact expires
     * @returns This builder for chaining
     */
    expires(timestamp: bigint): this;
    /**
     * Set expiration timestamp (alias for expires())
     * @param timestamp - Unix timestamp in seconds
     * @returns This builder for chaining
     */
    expiresAt(timestamp: bigint): this;
    /**
     * Set expiration relative to now
     * @param duration - Duration string (e.g., '1 hour', '30 minutes') or seconds as number
     * @returns This builder for chaining
     */
    expiresIn(duration: string | number): this;
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
    addLock(lock: Lock): this;
    /**
     * Alias for addLock()
     * @param lock - Lock containing lockTag, token address, and amount
     */
    addCommitment(lock: Lock): this;
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
    witness<T extends object>(mandateType: MandateType<T>, mandate: T): BatchCompactBuilder<T>;
    /**
     * Build the final BatchCompact struct with EIP-712 hash
     *
     * Validates that all required fields are set and constructs the complete
     * BatchCompact struct along with its EIP-712 typed data and hash.
     *
     * @returns Object containing the struct, hash, typed data, and optional mandate
     * @throws {Error} If any required field is missing or no locks have been added
     */
    build(): BuiltBatchCompact<TMandate>;
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
export declare class MultichainElementBuilder {
    private _arbiter?;
    private _chainId?;
    private _commitments;
    private _mandate?;
    private _mandateType?;
    private parent;
    constructor(parent: MultichainCompactBuilder);
    /**
     * Set the arbiter address for this chain
     * @param arbiter - Address authorized to process claims on this chain
     * @returns This builder for chaining
     */
    arbiter(arbiter: Address): this;
    /**
     * Set the chain ID for this element
     * @param chainId - EVM chain ID (e.g., 1 for Ethereum, 10 for Optimism)
     * @returns This builder for chaining
     */
    chainId(chainId: bigint): this;
    /**
     * Add a token lock commitment to this chain element
     * @param lock - Lock containing lockTag, token address, and amount
     * @returns This builder for chaining
     */
    addCommitment(lock: Lock): this;
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
    witness<T extends object>(mandateType: MandateType<T>, mandate: T): this;
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
    done(): MultichainCompactBuilder;
    build(): {
        element: MultichainElement;
        mandateType?: MandateType<any>;
        mandate?: any;
    };
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
export declare class MultichainCompactBuilder {
    private domain;
    private _sponsor?;
    private _nonce?;
    private _expires?;
    private elementBuilders;
    constructor(domain: CompactDomain);
    /**
     * Set the sponsor address who is locking tokens across chains
     * @param sponsor - Address that owns and is locking the tokens on all chains
     * @returns This builder for chaining
     */
    sponsor(sponsor: Address): this;
    /**
     * Set the nonce for replay protection
     * @param nonce - Unique nonce value (typically incremental)
     * @returns This builder for chaining
     */
    nonce(nonce: bigint): this;
    /**
     * Set the expiration timestamp
     * @param timestamp - Unix timestamp in seconds when the multichain compact expires
     * @returns This builder for chaining
     */
    expires(timestamp: bigint): this;
    /**
     * Set expiration timestamp (alias for expires())
     * @param timestamp - Unix timestamp in seconds
     * @returns This builder for chaining
     */
    expiresAt(timestamp: bigint): this;
    /**
     * Set expiration relative to now
     * @param duration - Duration string (e.g., '1 hour', '30 minutes') or seconds as number
     * @returns This builder for chaining
     */
    expiresIn(duration: string | number): this;
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
    addElement(): MultichainElementBuilder;
    /**
     * Build the final MultichainCompact struct with EIP-712 hash
     *
     * Validates that all required fields are set and constructs the complete
     * MultichainCompact struct along with its EIP-712 typed data and hash.
     *
     * @returns Object containing the struct, hash, and typed data
     * @throws {Error} If any required field is missing or no elements have been added
     */
    build(): BuiltMultichainCompact;
}
/**
 * Main CompactBuilder class with static factory methods
 *
 * Provides convenience methods for creating compact builders with proper domain configuration.
 */
export declare class CompactBuilder {
    /**
     * Create a single compact builder
     * @param domain - EIP-712 domain configuration
     * @returns A new SingleCompactBuilder instance
     */
    static single(domain: CompactDomain): SingleCompactBuilder;
    /**
     * Create a batch compact builder
     * @param domain - EIP-712 domain configuration
     * @returns A new BatchCompactBuilder instance
     */
    static batch(domain: CompactDomain): BatchCompactBuilder;
    /**
     * Create a multichain compact builder
     * @param domain - EIP-712 domain configuration
     * @returns A new MultichainCompactBuilder instance
     */
    static multichain(domain: CompactDomain): MultichainCompactBuilder;
}
