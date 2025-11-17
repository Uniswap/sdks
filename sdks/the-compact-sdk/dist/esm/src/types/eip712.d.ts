/**
 * EIP-712 type definitions for Compacts
 * These mirror the Solidity structs exactly
 */
/**
 * A commitment to lock a specific amount of a token
 */
export interface Lock {
    lockTag: `0x${string}`;
    token: `0x${string}`;
    amount: bigint;
}
/**
 * A single compact - commits to locking tokens for a specific arbiter
 */
export interface Compact {
    arbiter: `0x${string}`;
    sponsor: `0x${string}`;
    nonce: bigint;
    expires: bigint;
    lockTag: `0x${string}`;
    token: `0x${string}`;
    amount: bigint;
}
/**
 * A batch compact - commits to multiple locks for a specific arbiter
 */
export interface BatchCompact {
    arbiter: `0x${string}`;
    sponsor: `0x${string}`;
    nonce: bigint;
    expires: bigint;
    commitments: Lock[];
}
/**
 * An element in a multichain compact
 * Each element represents commitments on a specific chain with a specific arbiter
 */
export interface MultichainElement {
    arbiter: `0x${string}`;
    chainId: bigint;
    commitments: Lock[];
}
/**
 * A multichain compact - commits to locks across multiple chains
 */
export interface MultichainCompact {
    sponsor: `0x${string}`;
    nonce: bigint;
    expires: bigint;
    elements: MultichainElement[];
}
/**
 * Type guard to check if a value is a Compact
 */
export declare function isCompact(value: any): value is Compact;
/**
 * Type guard to check if a value is a BatchCompact
 */
export declare function isBatchCompact(value: any): value is BatchCompact;
/**
 * Type guard to check if a value is a MultichainCompact
 */
export declare function isMultichainCompact(value: any): value is MultichainCompact;
