/**
 * Claimant encoding/decoding utilities
 * Handles packing and unpacking of claimant values in Component structs
 */
import { Component } from '../types/claims';
/**
 * Type of claimant operation
 */
export type ClaimantKind = 'transfer' | 'convert' | 'withdraw';
/**
 * Base interface for claimant inputs
 */
export interface ClaimantInputBase {
    amount: bigint;
}
/**
 * Transfer claimant - transfers to recipient with same lock tag
 */
export interface TransferClaimant extends ClaimantInputBase {
    kind: 'transfer';
    recipient: `0x${string}`;
}
/**
 * Convert claimant - converts to recipient with different lock tag
 */
export interface ConvertClaimant extends ClaimantInputBase {
    kind: 'convert';
    recipient: `0x${string}`;
    targetLockTag: `0x${string}`;
}
/**
 * Withdraw claimant - withdraws underlying tokens to recipient
 */
export interface WithdrawClaimant extends ClaimantInputBase {
    kind: 'withdraw';
    recipient: `0x${string}`;
}
/**
 * Union type for all claimant inputs
 */
export type ClaimantInput = TransferClaimant | ConvertClaimant | WithdrawClaimant;
/**
 * Build a Component from a lock tag and claimant input
 *
 * Claimant packing rules:
 * - Transfer: claimant = (lockTag << 160) | recipient (same lockTag as claim)
 * - Convert: claimant = (targetLockTag << 160) | recipient (different lockTag)
 * - Withdraw: claimant = (0 << 160) | recipient (lockTag = 0)
 *
 * @param lockTagOfClaim - The lock tag of the claim being built
 * @param claimant - The claimant input
 * @returns The Component struct
 */
export declare function buildComponent(lockTagOfClaim: `0x${string}`, claimant: ClaimantInput): Component;
/**
 * Decode a Component into its constituent parts
 * @param component - The Component to decode
 * @param lockTagOfClaim - The lock tag of the claim (for comparison)
 * @returns The decoded claimant information
 */
export declare function decodeComponent(component: Component, lockTagOfClaim?: `0x${string}`): {
    kind: ClaimantKind;
    recipient: `0x${string}`;
    lockTag?: `0x${string}`;
    amount: bigint;
};
/**
 * Helper to create a transfer claimant
 * Transfers ERC6909 tokens to recipient with the same lock tag
 * @param recipient - Address to receive the transferred tokens
 * @param amount - Amount to transfer in wei
 * @returns TransferClaimant object for use with buildComponent
 */
export declare function transfer(recipient: `0x${string}`, amount: bigint): TransferClaimant;
/**
 * Helper to create a convert claimant
 * Converts ERC6909 tokens to a different lock tag and transfers to recipient
 * @param recipient - Address to receive the converted tokens
 * @param amount - Amount to convert in wei
 * @param targetLockTag - The target lock tag (12 bytes) for the converted tokens
 * @returns ConvertClaimant object for use with buildComponent
 */
export declare function convert(recipient: `0x${string}`, amount: bigint, targetLockTag: `0x${string}`): ConvertClaimant;
/**
 * Helper to create a withdraw claimant
 * Extracts underlying tokens from The Compact and sends to recipient
 * @param recipient - Address to receive the underlying tokens
 * @param amount - Amount to withdraw in wei
 * @returns WithdrawClaimant object for use with buildComponent
 */
export declare function withdraw(recipient: `0x${string}`, amount: bigint): WithdrawClaimant;
