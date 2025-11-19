/**
 * Error decoding utilities
 * Decode revert data from The Compact contract into rich error types
 */
import { CompactError } from './types';
/**
 * Decode compact error from revert data
 * @param revertData - The revert data from a failed transaction
 * @param abi - Optional ABI to use for decoding
 * @returns A CompactError or null if not recognized
 */
export declare function decodeCompactError(revertData: `0x${string}`, abi?: readonly any[]): CompactError | null;
/**
 * Try to extract a CompactError from a viem error
 * @param error - The error from a viem call
 * @param abi - Optional ABI to use for decoding
 * @returns A CompactError or null
 */
export declare function extractCompactError(error: any, abi?: readonly any[]): CompactError | null;
