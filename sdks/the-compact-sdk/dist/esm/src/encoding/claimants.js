/**
 * Claimant encoding/decoding utilities
 * Handles packing and unpacking of claimant values in Component structs
 */
import invariant from 'tiny-invariant';
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
export function buildComponent(lockTagOfClaim, claimant) {
    // Validate recipient address
    const recipientHex = claimant.recipient.slice(2).toLowerCase();
    invariant(recipientHex.length === 40, 'recipient must be a valid address');
    // Validate amount
    invariant(claimant.amount > 0n, 'amount must be positive');
    const recipientBits = BigInt(claimant.recipient);
    let claimantValue;
    switch (claimant.kind) {
        case 'transfer': {
            // Same lock tag as the claim
            const lockTagHex = lockTagOfClaim.slice(2);
            invariant(lockTagHex.length === 24, 'lockTag must be 12 bytes');
            const lockTagBits = BigInt(lockTagOfClaim) << 160n;
            claimantValue = lockTagBits | recipientBits;
            break;
        }
        case 'convert': {
            // Different lock tag
            const targetLockTagHex = claimant.targetLockTag.slice(2);
            invariant(targetLockTagHex.length === 24, 'targetLockTag must be 12 bytes');
            const targetLockTagBits = BigInt(claimant.targetLockTag) << 160n;
            claimantValue = targetLockTagBits | recipientBits;
            break;
        }
        case 'withdraw': {
            // Lock tag is zero for withdrawal
            claimantValue = recipientBits;
            break;
        }
        default:
            throw new Error(`Unknown claimant kind: ${claimant.kind}`);
    }
    return {
        claimant: claimantValue,
        amount: claimant.amount,
    };
}
/**
 * Decode a Component into its constituent parts
 * @param component - The Component to decode
 * @param lockTagOfClaim - The lock tag of the claim (for comparison)
 * @returns The decoded claimant information
 */
export function decodeComponent(component, lockTagOfClaim) {
    // Extract recipient (lower 160 bits)
    const recipient = component.claimant & ((1n << 160n) - 1n);
    const recipientHex = recipient.toString(16).padStart(40, '0');
    // Extract lock tag (upper 96 bits)
    const lockTag = component.claimant >> 160n;
    const lockTagHex = lockTag.toString(16).padStart(24, '0');
    // Determine kind
    let kind;
    let lockTagValue;
    if (lockTag === 0n) {
        // Withdraw
        kind = 'withdraw';
    }
    else if (lockTagOfClaim && lockTag === BigInt(lockTagOfClaim)) {
        // Transfer (same lock tag)
        kind = 'transfer';
        lockTagValue = `0x${lockTagHex}`;
    }
    else {
        // Convert (different lock tag)
        kind = 'convert';
        lockTagValue = `0x${lockTagHex}`;
    }
    return {
        kind,
        recipient: `0x${recipientHex}`,
        lockTag: lockTagValue,
        amount: component.amount,
    };
}
/**
 * Helper to create a transfer claimant
 */
export function transfer(recipient, amount) {
    return {
        kind: 'transfer',
        recipient,
        amount,
    };
}
/**
 * Helper to create a convert claimant
 */
export function convert(recipient, amount, targetLockTag) {
    return {
        kind: 'convert',
        recipient,
        amount,
        targetLockTag,
    };
}
/**
 * Helper to create a withdraw claimant
 */
export function withdraw(recipient, amount) {
    return {
        kind: 'withdraw',
        recipient,
        amount,
    };
}
//# sourceMappingURL=claimants.js.map