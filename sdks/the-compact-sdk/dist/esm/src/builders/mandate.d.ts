/**
 * Mandate type definitions and witness hashing utilities
 * Handles the complex EIP-712 witness mechanism for Compacts
 */
/**
 * EIP-712 field definition
 */
export interface Eip712Field {
    name: string;
    type: string;
}
/**
 * Mandate type definition
 * Encapsulates witness hashing and typestring generation
 */
export interface MandateType<TValue extends object = any> {
    readonly name: 'Mandate';
    readonly fields: readonly Eip712Field[];
    readonly nestedTypes?: Record<string, readonly Eip712Field[]>;
    readonly witnessTypestring: string;
    /**
     * Get the full EIP-712 typestring including the Mandate(...) wrapper
     * This is the complete typestring used for computing typehashes
     */
    typestring(): string;
    /**
     * Get the EIP-712 typehash (keccak256 of the typestring)
     */
    typehash(): `0x${string}`;
    /**
     * Encode a mandate value to ABI-encoded bytes
     */
    encode(value: TValue): `0x${string}`;
    /**
     * Hash a mandate value to bytes32
     */
    hash(value: TValue): `0x${string}`;
}
/**
 * Configuration for defining a mandate type
 */
export interface MandateTypeConfig {
    fields: readonly Eip712Field[];
    nestedTypes?: Record<string, readonly Eip712Field[]>;
}
/**
 * Define a mandate type with proper witness typestring generation
 *
 * The witness typestring is a special format used by The Compact:
 * - It contains the arguments inside the Mandate struct
 * - Plus any nested struct definitions
 * - WITHOUT the final closing parenthesis
 * - Nested struct names must start with "Mandate" for proper EIP-712 ordering
 *
 * @param config - The mandate type configuration
 * @returns A MandateType instance
 */
export declare function defineMandateType<TValue extends object>(config: MandateTypeConfig): MandateType<TValue>;
/**
 * Helper to create a simple mandate with no nested types
 * @param fields - The mandate fields
 * @returns A MandateType instance
 */
export declare function simpleMandate<TValue extends object>(fields: Eip712Field[]): MandateType<TValue>;
/**
 * Common mandate field types for convenience
 */
export declare const MandateFields: {
    /**
     * Create a bytes32 field
     */
    bytes32(name: string): Eip712Field;
    /**
     * Create a uint256 field
     */
    uint256(name: string): Eip712Field;
    /**
     * Create an address field
     */
    address(name: string): Eip712Field;
    /**
     * Create a bool field
     */
    bool(name: string): Eip712Field;
    /**
     * Create a bytes field
     */
    bytes(name: string): Eip712Field;
    /**
     * Create a string field
     */
    string(name: string): Eip712Field;
};
/**
 * Tribunal allocator mandate type definition
 *
 * This is the official mandate structure used by the Tribunal allocator for
 * managing cross-chain fills with dynamic pricing curves and callbacks.
 *
 * @see https://github.com/Uniswap/tribunal
 *
 * @example
 * ```typescript
 * import { TribunalMandate } from '@uniswap/the-compact-sdk'
 *
 * const mandate = {
 *   adjuster: '0xAdjusterAddress...',
 *   fills: [{
 *     chainId: 1n,
 *     tribunal: '0xTribunalAddress...',
 *     expires: BigInt(Math.floor(Date.now() / 1000) + 3600),
 *     components: [{
 *       fillToken: '0xUSDC...',
 *       minimumFillAmount: 1000000n,
 *       recipient: '0xRecipient...',
 *       applyScaling: true
 *     }],
 *     baselinePriorityFee: 1000000n,
 *     scalingFactor: 1000000000000000000n, // 1e18 = 100%
 *     priceCurve: [1500000000000000000n, 1000000000000000000n], // 150% -> 100%
 *     recipientCallback: [],
 *     salt: '0x0000000000000000000000000000000000000000000000000000000000000001'
 *   }]
 * }
 * ```
 */
export declare const TribunalMandate: MandateType<{
    adjuster: `0x${string}`;
    fills: Array<{
        chainId: bigint;
        tribunal: `0x${string}`;
        expires: bigint;
        components: Array<{
            fillToken: `0x${string}`;
            minimumFillAmount: bigint;
            recipient: `0x${string}`;
            applyScaling: boolean;
        }>;
        baselinePriorityFee: bigint;
        scalingFactor: bigint;
        priceCurve: bigint[];
        recipientCallback: Array<{
            chainId: bigint;
            compact: {
                arbiter: `0x${string}`;
                sponsor: `0x${string}`;
                nonce: bigint;
                expires: bigint;
                commitments: Array<{
                    lockTag: `0x${string}`;
                    token: `0x${string}`;
                    amount: bigint;
                }>;
                mandate: any;
            };
            context: `0x${string}`;
        }>;
        salt: `0x${string}`;
    }>;
}>;
