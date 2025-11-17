/**
 * Error types for The Compact
 */
/**
 * Known error kinds from The Compact contract
 */
export type CompactErrorKind = 'InvalidToken' | 'InvalidLockTag' | 'Expired' | 'InvalidSignature' | 'AllocatedAmountExceeded' | 'InvalidScope' | 'InvalidAllocation' | 'InvalidBatchAllocation' | 'InvalidRegistration' | 'InvalidClaim' | 'InvalidBatchClaim' | 'InvalidMultichainClaim' | 'InvalidBatchMultichainClaim' | 'ForcedWithdrawalFailed' | 'InsufficientBalance' | 'Unauthorized' | 'AllocatorNotRegistered' | 'InvalidAllocator' | 'InvalidResetPeriod' | 'InvalidWithdrawal' | 'InvalidDeposit' | 'InvalidTransfer' | 'InvalidApproval' | 'UnknownError';
/**
 * Compact error with decoded information
 */
export interface CompactError extends Error {
    kind: CompactErrorKind;
    data?: any;
    selector?: string;
    rawData?: `0x${string}`;
}
/**
 * Create a CompactError
 */
export declare function createCompactError(kind: CompactErrorKind, message?: string, data?: any, rawData?: `0x${string}`): CompactError;
/**
 * Check if an error is a CompactError
 */
export declare function isCompactError(error: any): error is CompactError;
