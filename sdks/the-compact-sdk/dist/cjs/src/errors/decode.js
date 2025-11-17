"use strict";
/**
 * Error decoding utilities
 * Decode revert data from The Compact contract into rich error types
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.decodeCompactError = decodeCompactError;
exports.extractCompactError = extractCompactError;
const viem_1 = require("viem");
const types_1 = require("./types");
const theCompact_1 = require("../abi/theCompact");
/**
 * Generate error selector from error signature
 */
function getErrorSelector(errorDef) {
    const name = errorDef.name;
    const inputs = errorDef.inputs || [];
    const types = inputs.map((input) => input.type).join(',');
    const signature = `${name}(${types})`;
    const hash = (0, viem_1.keccak256)((0, viem_1.toHex)(signature));
    return hash.slice(0, 10); // First 4 bytes
}
/**
 * Error name to CompactErrorKind mapping
 * Maps contract error names to our SDK error types
 */
const ERROR_NAME_TO_KIND = {
    AllocatedAmountExceeded: 'AllocatedAmountExceeded',
    BalanceOverflow: 'InsufficientBalance',
    ChainIndexOutOfRange: 'InvalidScope',
    EmissaryAssignmentUnavailable: 'Unauthorized',
    Expired: 'Expired',
    ForcedWithdrawalAlreadyDisabled: 'InvalidWithdrawal',
    ForcedWithdrawalFailed: 'ForcedWithdrawalFailed',
    InconsistentAllocators: 'InvalidAllocation',
    InsufficientBalance: 'InsufficientBalance',
    InsufficientPermission: 'Unauthorized',
    InvalidAllocation: 'InvalidAllocation',
    InvalidBatchAllocation: 'InvalidBatchAllocation',
    InvalidBatchDepositStructure: 'InvalidDeposit',
    InvalidDepositBalanceChange: 'InvalidDeposit',
    InvalidDepositTokenOrdering: 'InvalidDeposit',
    InvalidEmissaryAssignment: 'InvalidAllocation',
    InvalidLockTag: 'InvalidLockTag',
    InvalidRegistrationProof: 'InvalidRegistration',
    InvalidScope: 'InvalidScope',
    InvalidSignature: 'InvalidSignature',
    InvalidToken: 'InvalidToken',
    NoIdsAndAmountsProvided: 'InvalidClaim',
    Permit2CallFailed: 'InvalidDeposit',
    PrematureWithdrawal: 'InvalidWithdrawal',
    ReentrantCall: 'Unauthorized',
    TStoreAlreadyActivated: 'UnknownError',
    TStoreNotSupported: 'UnknownError',
    TloadTestContractDeploymentFailed: 'UnknownError',
    UnallocatedTransfer: 'InvalidTransfer',
};
/**
 * Error selectors (first 4 bytes of keccak256 of error signature)
 * Generated from the contract ABI
 */
const ERROR_SELECTORS = {};
// Populate error selectors from ABI
for (const item of theCompact_1.theCompactAbi) {
    if (item.type === 'error' && 'name' in item) {
        const selector = getErrorSelector(item);
        const kind = ERROR_NAME_TO_KIND[item.name] || 'UnknownError';
        ERROR_SELECTORS[selector] = kind;
    }
}
/**
 * Decode compact error from revert data
 * @param revertData - The revert data from a failed transaction
 * @param abi - Optional ABI to use for decoding
 * @returns A CompactError or null if not recognized
 */
function decodeCompactError(revertData, abi) {
    if (!revertData || revertData === '0x') {
        return null;
    }
    // Extract selector (first 4 bytes)
    const selector = revertData.slice(0, 10);
    // Look up error kind
    const kind = ERROR_SELECTORS[selector];
    if (!kind) {
        // Unknown error
        return (0, types_1.createCompactError)('UnknownError', `Unknown error selector: ${selector}`, undefined, revertData);
    }
    // Try to decode error data if ABI is provided
    let decodedData;
    if (abi) {
        try {
            decodedData = viem_1.decodeErrorResult({
                abi,
                data: revertData,
            });
        }
        catch (e) {
            // Failed to decode, continue with raw data
        }
    }
    return (0, types_1.createCompactError)(kind, `Compact error: ${kind}`, decodedData, revertData);
}
/**
 * Try to extract a CompactError from a viem error
 * @param error - The error from a viem call
 * @param abi - Optional ABI to use for decoding
 * @returns A CompactError or null
 */
function extractCompactError(error, abi) {
    // Check if error has revert data
    if (error?.data?.data) {
        return decodeCompactError(error.data.data, abi);
    }
    if (error?.data) {
        return decodeCompactError(error.data, abi);
    }
    return null;
}
//# sourceMappingURL=decode.js.map