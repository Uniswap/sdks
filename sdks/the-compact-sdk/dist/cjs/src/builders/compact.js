"use strict";
/**
 * Fluent builders for creating Compact, BatchCompact, and MultichainCompact messages
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.CompactBuilder = exports.MultichainCompactBuilder = exports.MultichainElementBuilder = exports.BatchCompactBuilder = exports.SingleCompactBuilder = void 0;
const tslib_1 = require("tslib");
const tiny_invariant_1 = tslib_1.__importDefault(require("tiny-invariant"));
const viem_1 = require("viem");
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
class SingleCompactBuilder {
    constructor(domain) {
        this.domain = domain;
    }
    arbiter(arbiter) {
        this._arbiter = arbiter;
        return this;
    }
    sponsor(sponsor) {
        this._sponsor = sponsor;
        return this;
    }
    nonce(nonce) {
        this._nonce = nonce;
        return this;
    }
    expires(timestamp) {
        this._expires = timestamp;
        return this;
    }
    /**
     * Set expiration timestamp (alias for expires())
     * @param timestamp - Unix timestamp in seconds
     */
    expiresAt(timestamp) {
        return this.expires(timestamp);
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
    expiresIn(duration) {
        const seconds = typeof duration === 'string' ? parseDuration(duration) : BigInt(duration);
        const now = BigInt(Math.floor(Date.now() / 1000));
        return this.expires(now + seconds);
    }
    lockTag(lockTag) {
        this._lockTag = lockTag;
        return this;
    }
    token(token) {
        this._token = token;
        return this;
    }
    amount(amount) {
        this._amount = amount;
        return this;
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
    witness(mandateType, mandate) {
        const builder = this;
        builder._mandateType = mandateType;
        builder._mandate = mandate;
        return builder;
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
    build() {
        // Validate required fields
        (0, tiny_invariant_1.default)(this._arbiter, 'arbiter is required');
        (0, tiny_invariant_1.default)(this._sponsor, 'sponsor is required');
        (0, tiny_invariant_1.default)(this._nonce !== undefined, 'nonce is required');
        (0, tiny_invariant_1.default)(this._expires !== undefined, 'expires is required');
        (0, tiny_invariant_1.default)(this._lockTag, 'lockTag is required');
        (0, tiny_invariant_1.default)(this._token, 'token is required');
        (0, tiny_invariant_1.default)(this._amount !== undefined, 'amount is required');
        const struct = {
            arbiter: this._arbiter,
            sponsor: this._sponsor,
            nonce: this._nonce,
            expires: this._expires,
            lockTag: this._lockTag,
            token: this._token,
            amount: this._amount,
        };
        // Build EIP-712 types
        const types = {
            Compact: [
                { name: 'arbiter', type: 'address' },
                { name: 'sponsor', type: 'address' },
                { name: 'nonce', type: 'uint256' },
                { name: 'expires', type: 'uint256' },
                { name: 'lockTag', type: 'bytes12' },
                { name: 'token', type: 'address' },
                { name: 'amount', type: 'uint256' },
            ],
        };
        let message = { ...struct };
        // Add mandate if present
        if (this._mandateType && this._mandate) {
            types.Compact.push({ name: 'mandate', type: 'Mandate' });
            types.Mandate = this._mandateType.fields.map((f) => ({ name: f.name, type: f.type }));
            // Add nested types
            if (this._mandateType.nestedTypes) {
                for (const [typeName, fields] of Object.entries(this._mandateType.nestedTypes)) {
                    types[typeName] = fields.map((f) => ({ name: f.name, type: f.type }));
                }
            }
            ;
            message.mandate = this._mandate;
        }
        const typedData = {
            domain: this.domain,
            types,
            primaryType: 'Compact',
            message: message,
        };
        const hash = (0, viem_1.hashTypedData)(typedData);
        return {
            struct,
            mandate: this._mandate,
            mandateType: this._mandateType,
            hash,
            typedData,
        };
    }
}
exports.SingleCompactBuilder = SingleCompactBuilder;
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
class BatchCompactBuilder {
    constructor(domain) {
        this._commitments = [];
        this.domain = domain;
    }
    arbiter(arbiter) {
        this._arbiter = arbiter;
        return this;
    }
    sponsor(sponsor) {
        this._sponsor = sponsor;
        return this;
    }
    nonce(nonce) {
        this._nonce = nonce;
        return this;
    }
    expires(timestamp) {
        this._expires = timestamp;
        return this;
    }
    expiresAt(timestamp) {
        return this.expires(timestamp);
    }
    expiresIn(duration) {
        const seconds = typeof duration === 'string' ? parseDuration(duration) : BigInt(duration);
        const now = BigInt(Math.floor(Date.now() / 1000));
        return this.expires(now + seconds);
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
    addLock(lock) {
        this._commitments.push(lock);
        return this;
    }
    /**
     * Alias for addLock()
     * @param lock - Lock containing lockTag, token address, and amount
     */
    addCommitment(lock) {
        return this.addLock(lock);
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
    witness(mandateType, mandate) {
        const builder = this;
        builder._mandateType = mandateType;
        builder._mandate = mandate;
        return builder;
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
    build() {
        // Validate required fields
        (0, tiny_invariant_1.default)(this._arbiter, 'arbiter is required');
        (0, tiny_invariant_1.default)(this._sponsor, 'sponsor is required');
        (0, tiny_invariant_1.default)(this._nonce !== undefined, 'nonce is required');
        (0, tiny_invariant_1.default)(this._expires !== undefined, 'expires is required');
        (0, tiny_invariant_1.default)(this._commitments.length > 0, 'at least one commitment is required');
        const struct = {
            arbiter: this._arbiter,
            sponsor: this._sponsor,
            nonce: this._nonce,
            expires: this._expires,
            commitments: this._commitments,
        };
        // Build EIP-712 types
        const types = {
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
        };
        let message = { ...struct };
        // Add mandate if present
        if (this._mandateType && this._mandate) {
            types.BatchCompact.push({ name: 'mandate', type: 'Mandate' });
            types.Mandate = this._mandateType.fields.map((f) => ({ name: f.name, type: f.type }));
            if (this._mandateType.nestedTypes) {
                for (const [typeName, fields] of Object.entries(this._mandateType.nestedTypes)) {
                    types[typeName] = fields.map((f) => ({ name: f.name, type: f.type }));
                }
            }
            ;
            message.mandate = this._mandate;
        }
        const typedData = {
            domain: this.domain,
            types,
            primaryType: 'BatchCompact',
            message: message,
        };
        const hash = (0, viem_1.hashTypedData)(typedData);
        return {
            struct,
            mandate: this._mandate,
            mandateType: this._mandateType,
            hash,
            typedData,
        };
    }
}
exports.BatchCompactBuilder = BatchCompactBuilder;
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
class MultichainElementBuilder {
    constructor(parent) {
        this._commitments = [];
        this.parent = parent;
    }
    arbiter(arbiter) {
        this._arbiter = arbiter;
        return this;
    }
    chainId(chainId) {
        this._chainId = chainId;
        return this;
    }
    addCommitment(lock) {
        this._commitments.push(lock);
        return this;
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
    witness(mandateType, mandate) {
        this._mandateType = mandateType;
        this._mandate = mandate;
        return this;
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
    done() {
        // Validate element is complete before returning to parent
        (0, tiny_invariant_1.default)(this._arbiter, 'arbiter is required');
        (0, tiny_invariant_1.default)(this._chainId !== undefined, 'chainId is required');
        (0, tiny_invariant_1.default)(this._commitments.length > 0, 'at least one commitment is required');
        (0, tiny_invariant_1.default)(this._mandateType && this._mandate, 'witness is required for multichain elements');
        return this.parent;
    }
    build() {
        (0, tiny_invariant_1.default)(this._arbiter, 'arbiter is required');
        (0, tiny_invariant_1.default)(this._chainId !== undefined, 'chainId is required');
        (0, tiny_invariant_1.default)(this._commitments.length > 0, 'at least one commitment is required');
        (0, tiny_invariant_1.default)(this._mandateType && this._mandate, 'witness is required for multichain elements');
        return {
            element: {
                arbiter: this._arbiter,
                chainId: this._chainId,
                commitments: this._commitments,
            },
            mandateType: this._mandateType,
            mandate: this._mandate,
        };
    }
}
exports.MultichainElementBuilder = MultichainElementBuilder;
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
class MultichainCompactBuilder {
    constructor(domain) {
        this.elementBuilders = [];
        this.domain = domain;
    }
    sponsor(sponsor) {
        this._sponsor = sponsor;
        return this;
    }
    nonce(nonce) {
        this._nonce = nonce;
        return this;
    }
    expires(timestamp) {
        this._expires = timestamp;
        return this;
    }
    expiresAt(timestamp) {
        return this.expires(timestamp);
    }
    expiresIn(duration) {
        const seconds = typeof duration === 'string' ? parseDuration(duration) : BigInt(duration);
        const now = BigInt(Math.floor(Date.now() / 1000));
        return this.expires(now + seconds);
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
    addElement() {
        const builder = new MultichainElementBuilder(this);
        this.elementBuilders.push(builder);
        return builder;
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
    build() {
        (0, tiny_invariant_1.default)(this._sponsor, 'sponsor is required');
        (0, tiny_invariant_1.default)(this._nonce !== undefined, 'nonce is required');
        (0, tiny_invariant_1.default)(this._expires !== undefined, 'expires is required');
        (0, tiny_invariant_1.default)(this.elementBuilders.length > 0, 'at least one element is required');
        // Build all elements
        const builtElements = this.elementBuilders.map((b) => b.build());
        const elements = builtElements.map((b) => b.element);
        const struct = {
            sponsor: this._sponsor,
            nonce: this._nonce,
            expires: this._expires,
            elements,
        };
        // Build EIP-712 types
        const types = {
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
        };
        // Add mandate types from first element (assuming all use same mandate type)
        const firstMandate = builtElements[0];
        if (firstMandate.mandateType) {
            types.Mandate = firstMandate.mandateType.fields.map((f) => ({ name: f.name, type: f.type }));
            if (firstMandate.mandateType.nestedTypes) {
                for (const [typeName, fields] of Object.entries(firstMandate.mandateType.nestedTypes)) {
                    types[typeName] = fields.map((f) => ({ name: f.name, type: f.type }));
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
        };
        const typedData = {
            domain: this.domain,
            types,
            primaryType: 'MultichainCompact',
            message: message,
        };
        const hash = (0, viem_1.hashTypedData)(typedData);
        return {
            struct,
            hash,
            typedData,
        };
    }
}
exports.MultichainCompactBuilder = MultichainCompactBuilder;
/**
 * Main CompactBuilder class with static factory methods
 */
class CompactBuilder {
    static single(domain) {
        return new SingleCompactBuilder(domain);
    }
    static batch(domain) {
        return new BatchCompactBuilder(domain);
    }
    static multichain(domain) {
        return new MultichainCompactBuilder(domain);
    }
}
exports.CompactBuilder = CompactBuilder;
/**
 * Parse a duration string into seconds
 * Supports: "15s", "5m", "2h", "1d"
 */
function parseDuration(duration) {
    const match = duration.match(/^(\d+)([smhd])$/);
    (0, tiny_invariant_1.default)(match, `Invalid duration format: ${duration}`);
    const value = BigInt(match[1]);
    const unit = match[2];
    switch (unit) {
        case 's':
            return value;
        case 'm':
            return value * 60n;
        case 'h':
            return value * 3600n;
        case 'd':
            return value * 86400n;
        default:
            throw new Error(`Unknown duration unit: ${unit}`);
    }
}
//# sourceMappingURL=compact.js.map