/**
 * Error decoding utilities
 * Decode revert data from The Compact contract into rich error types
 */

import { decodeErrorResult, keccak256, toHex } from 'viem'
import { CompactError, CompactErrorKind, createCompactError } from './types'
import { theCompactAbi } from '../abi/theCompact'

/**
 * Generate error selector from error signature
 */
function getErrorSelector(errorDef: any): string {
  const name = errorDef.name
  const inputs = errorDef.inputs || []
  const types = inputs.map((input: any) => input.type).join(',')
  const signature = `${name}(${types})`
  const hash = keccak256(toHex(signature))
  return hash.slice(0, 10) // First 4 bytes
}

/**
 * Error name to CompactErrorKind mapping
 * Maps contract error names to our SDK error types
 */
const ERROR_NAME_TO_KIND: Record<string, CompactErrorKind> = {
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
}

/**
 * Error selectors (first 4 bytes of keccak256 of error signature)
 * Generated from the contract ABI
 */
const ERROR_SELECTORS: Record<string, CompactErrorKind> = {}

// Populate error selectors from ABI
for (const item of theCompactAbi) {
  if (item.type === 'error' && 'name' in item) {
    const selector = getErrorSelector(item)
    const kind = ERROR_NAME_TO_KIND[item.name] || 'UnknownError'
    ERROR_SELECTORS[selector] = kind
  }
}

/**
 * Decode compact error from revert data
 * @param revertData - The revert data from a failed transaction
 * @param abi - Optional ABI to use for decoding
 * @returns A CompactError or null if not recognized
 */
export function decodeCompactError(revertData: `0x${string}`, abi?: readonly any[]): CompactError | null {
  if (!revertData || revertData === '0x') {
    return null
  }

  // Extract selector (first 4 bytes)
  const selector = revertData.slice(0, 10) as `0x${string}`

  // Look up error kind
  const kind = ERROR_SELECTORS[selector]

  if (!kind) {
    // Unknown error
    return createCompactError('UnknownError', `Unknown error selector: ${selector}`, undefined, revertData)
  }

  // Try to decode error data if ABI is provided
  let decodedData: any
  if (abi) {
    try {
      decodedData = (decodeErrorResult as any)({
        abi,
        data: revertData,
      })
    } catch (e) {
      // Failed to decode, continue with raw data
    }
  }

  return createCompactError(kind, `Compact error: ${kind}`, decodedData, revertData)
}

/**
 * Try to extract a CompactError from a viem error
 * @param error - The error from a viem call
 * @param abi - Optional ABI to use for decoding
 * @returns A CompactError or null
 */
export function extractCompactError(error: any, abi?: readonly any[]): CompactError | null {
  // Check if error has revert data
  if (error?.data?.data) {
    return decodeCompactError(error.data.data, abi)
  }

  if (error?.data) {
    return decodeCompactError(error.data, abi)
  }

  return null
}

