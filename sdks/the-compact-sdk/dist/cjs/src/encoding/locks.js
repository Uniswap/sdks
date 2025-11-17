"use strict";
/**
 * Lock tag and lock ID encoding/decoding utilities
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.encodeLockTag = encodeLockTag;
exports.decodeLockTag = decodeLockTag;
exports.encodeLockId = encodeLockId;
exports.decodeLockId = decodeLockId;
const tslib_1 = require("tslib");
const runtime_1 = require("../types/runtime");
const tiny_invariant_1 = tslib_1.__importDefault(require("tiny-invariant"));
/**
 * Encode a lock tag from its component parts
 * Lock tag is 12 bytes (96 bits) with the following layout:
 * - Bit 95 (leftmost): scope (1 bit)
 * - Bits 92-94: resetPeriod (3 bits)
 * - Bits 0-91: allocatorId (92 bits)
 *
 * This matches the contract implementation in IdLib.sol:
 * lockTag := or(or(shl(255, scope), shl(252, resetPeriod)), shl(160, allocatorId))
 *
 * Note: The contract uses uint256 positions (255, 252, 160) but when cast to bytes12,
 * this becomes (95, 92, 0) respectively.
 *
 * @param parts - The lock tag components
 * @returns The encoded lock tag as bytes12
 */
function encodeLockTag(parts) {
    const { allocatorId, scope, resetPeriod } = parts;
    // Validate allocatorId fits in 92 bits (4 bits for compact flag + 88 bits from address)
    (0, tiny_invariant_1.default)(allocatorId >= 0n && allocatorId < 2n ** 92n, 'allocatorId must fit in 92 bits');
    // Validate scope and resetPeriod
    (0, tiny_invariant_1.default)(scope === runtime_1.Scope.ChainSpecific || scope === runtime_1.Scope.Multichain, 'Invalid scope');
    (0, tiny_invariant_1.default)(resetPeriod >= 0 && resetPeriod <= 7, 'Invalid reset period');
    // Pack according to contract layout:
    // - scope at bit 95 (shl 95)
    // - resetPeriod at bits 92-94 (shl 92)
    // - allocatorId at bits 0-91
    const scopeBits = BigInt(scope) << 95n;
    const resetPeriodBits = BigInt(resetPeriod) << 92n;
    const packed = scopeBits | resetPeriodBits | allocatorId;
    // Convert to hex and pad to 12 bytes (24 hex chars)
    const hex = packed.toString(16).padStart(24, '0');
    return `0x${hex}`;
}
/**
 * Decode a lock tag into its component parts
 * @param lockTag - The lock tag to decode (bytes12)
 * @returns The decoded lock tag parts
 */
function decodeLockTag(lockTag) {
    // Remove 0x prefix and validate length
    const hex = lockTag.slice(2);
    (0, tiny_invariant_1.default)(hex.length === 24, 'lockTag must be 12 bytes (24 hex chars)');
    const packed = BigInt(lockTag);
    // Extract components according to contract layout:
    // - Bit 95: scope
    // - Bits 92-94: resetPeriod
    // - Bits 0-91: allocatorId
    const allocatorId = packed & ((1n << 92n) - 1n);
    const resetPeriod = Number((packed >> 92n) & 0x7n); // 3 bits = 0x7
    const scope = Number((packed >> 95n) & 0x1n); // 1 bit = 0x1
    return {
        allocatorId,
        scope,
        resetPeriod,
    };
}
/**
 * Encode a lock ID from a lock tag and token address
 * Lock ID is the ERC6909 token ID: lockTag (12 bytes) || token (20 bytes) = 32 bytes
 *
 * @param lockTag - The lock tag (bytes12)
 * @param token - The token address (address)
 * @returns The lock ID as uint256
 */
function encodeLockId(lockTag, token) {
    // Validate inputs
    const lockTagHex = lockTag.slice(2);
    (0, tiny_invariant_1.default)(lockTagHex.length === 24, 'lockTag must be 12 bytes');
    const tokenHex = token.slice(2).toLowerCase();
    (0, tiny_invariant_1.default)(tokenHex.length === 40, 'token must be 20 bytes (address)');
    // Concatenate: lockTag (12 bytes) in upper bits, token (20 bytes) in lower bits
    const lockTagBits = BigInt(lockTag) << 160n;
    const tokenBits = BigInt(token);
    return lockTagBits | tokenBits;
}
/**
 * Decode a lock ID into its lock tag and token address
 * @param id - The lock ID (uint256)
 * @returns The lock tag and token address
 */
function decodeLockId(id) {
    // Extract token (lower 160 bits / 20 bytes)
    const token = id & ((1n << 160n) - 1n);
    const tokenHex = token.toString(16).padStart(40, '0');
    // Extract lockTag (upper 96 bits / 12 bytes)
    const lockTag = id >> 160n;
    const lockTagHex = lockTag.toString(16).padStart(24, '0');
    return {
        lockTag: `0x${lockTagHex}`,
        token: `0x${tokenHex}`,
    };
}
//# sourceMappingURL=locks.js.map