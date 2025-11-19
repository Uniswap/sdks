"use strict";
/**
 * EIP-712 type definitions for Compacts
 * These mirror the Solidity structs exactly
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.isCompact = isCompact;
exports.isBatchCompact = isBatchCompact;
exports.isMultichainCompact = isMultichainCompact;
/**
 * Type guard to check if a value is a Compact
 */
function isCompact(value) {
    return (value &&
        typeof value.arbiter === 'string' &&
        typeof value.sponsor === 'string' &&
        typeof value.nonce === 'bigint' &&
        typeof value.expires === 'bigint' &&
        typeof value.lockTag === 'string' &&
        typeof value.token === 'string' &&
        typeof value.amount === 'bigint');
}
/**
 * Type guard to check if a value is a BatchCompact
 */
function isBatchCompact(value) {
    return (value &&
        typeof value.arbiter === 'string' &&
        typeof value.sponsor === 'string' &&
        typeof value.nonce === 'bigint' &&
        typeof value.expires === 'bigint' &&
        Array.isArray(value.commitments));
}
/**
 * Type guard to check if a value is a MultichainCompact
 */
function isMultichainCompact(value) {
    return (value &&
        typeof value.sponsor === 'string' &&
        typeof value.nonce === 'bigint' &&
        typeof value.expires === 'bigint' &&
        Array.isArray(value.elements));
}
//# sourceMappingURL=eip712.js.map