/**
 * CLI output utilities for human-readable and JSON formatting
 */

import {
  BlockNotFoundError,
  NetworkError,
  ValidationError,
  ChainNotSupportedError,
} from '../../types';

/**
 * Error codes for CLI error responses
 */
export type ErrorCode =
  | 'BLOCK_NOT_FOUND'
  | 'NETWORK_ERROR'
  | 'VALIDATION_ERROR'
  | 'CHAIN_NOT_SUPPORTED'
  | 'FILE_NOT_FOUND'
  | 'INVALID_JSON'
  | 'UNKNOWN_ERROR';

/**
 * Structured error response for JSON output
 */
export interface ErrorResponse {
  success: false;
  error: {
    code: ErrorCode;
    message: string;
    details?: string;
  };
}

/**
 * Print success message with checkmark
 */
export function printSuccess(message: string): void {
  console.log(`\n✓ ${message}`);
}

/**
 * Print failure message with X
 */
export function printFailure(message: string): void {
  console.log(`\n✗ ${message}`);
}

/**
 * Print info message
 */
export function printInfo(message: string): void {
  console.log(message);
}

/**
 * Print labeled value with proper indentation
 */
export function printLabeledValue(label: string, value: string, indent = 2): void {
  const padding = ' '.repeat(indent);
  // Pad label to align colons at 18 characters
  const paddedLabel = label.padEnd(16);
  console.log(`${padding}${paddedLabel}${value}`);
}

/**
 * Print a section header
 */
export function printSection(title: string): void {
  console.log(`\n${title}:`);
}

/**
 * Output data as JSON
 */
export function outputJson(data: unknown): void {
  console.log(JSON.stringify(data, null, 2));
}

/**
 * Format and output an error for human-readable display
 */
export function printError(message: string, details?: string): void {
  console.error(`\nError: ${message}`);
  if (details) {
    console.error(`\n${details}`);
  }
}

/**
 * Format and output an error as JSON
 */
export function outputErrorJson(code: ErrorCode, message: string, details?: string): void {
  const response: ErrorResponse = {
    success: false,
    error: {
      code,
      message,
      ...(details && { details }),
    },
  };
  console.log(JSON.stringify(response, null, 2));
}

/**
 * Map SDK error to CLI error code
 */
function getErrorCode(error: unknown): ErrorCode {
  if (error instanceof BlockNotFoundError) return 'BLOCK_NOT_FOUND';
  if (error instanceof NetworkError) return 'NETWORK_ERROR';
  if (error instanceof ValidationError) return 'VALIDATION_ERROR';
  if (error instanceof ChainNotSupportedError) return 'CHAIN_NOT_SUPPORTED';
  if (error instanceof Error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return 'FILE_NOT_FOUND';
    if (error.message.includes('JSON')) return 'INVALID_JSON';
  }
  return 'UNKNOWN_ERROR';
}

/**
 * Get user-friendly error message from SDK error
 */
function getErrorMessage(error: unknown): { message: string; details?: string } {
  if (error instanceof BlockNotFoundError) {
    return {
      message: 'Block not found',
      details: `The block '${error.blockParameter}' does not exist on the specified chain.`,
    };
  }
  if (error instanceof NetworkError) {
    return {
      message: 'Network error',
      details: error.message,
    };
  }
  if (error instanceof ValidationError) {
    return {
      message: 'Validation error',
      details: error.message,
    };
  }
  if (error instanceof ChainNotSupportedError) {
    return {
      message: 'Chain not supported',
      details: error.message,
    };
  }
  if (error instanceof Error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return {
        message: 'File not found',
        details: error.message,
      };
    }
    return {
      message: 'An unexpected error occurred',
      details: error.message,
    };
  }
  return { message: 'An unexpected error occurred' };
}

/**
 * Handle error and output appropriately based on format
 */
export function handleError(error: unknown, jsonOutput: boolean): void {
  const code = getErrorCode(error);
  const { message, details } = getErrorMessage(error);

  if (jsonOutput) {
    outputErrorJson(code, message, details);
  } else {
    printError(message, details);
  }
}
