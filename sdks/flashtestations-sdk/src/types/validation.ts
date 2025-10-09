import type { WorkloadMeasureRegisters } from './index';
import { ValidationError } from './index';

/**
 * Validates if a string is a valid hex string with optional 0x prefix
 */
export function isValidHex(value: string, expectedLength?: number): boolean {
  const cleanHex = value.startsWith('0x') ? value.slice(2) : value;
  const hexRegex = /^[0-9a-fA-F]+$/;

  if (!hexRegex.test(cleanHex)) {
    return false;
  }

  if (expectedLength && cleanHex.length !== expectedLength) {
    return false;
  }

  return true;
}

/**
 * Validates hex string and throws ValidationError if invalid
 */
export function validateHex(
  value: string,
  expectedLength: number,
  fieldName: string
): void {
  if (!isValidHex(value, expectedLength)) {
    const cleanHex = value.startsWith('0x') ? value.slice(2) : value;
    throw new ValidationError(
      `Invalid ${fieldName}: expected ${expectedLength} hex characters, got ${cleanHex.length}`,
      fieldName
    );
  }
}

/**
 * Validates WorkloadMeasureRegisters structure and field formats
 */
export function validateWorkloadMeasureRegisters(
  registers: WorkloadMeasureRegisters
): void {
  // Validate tdAttributes (8 bytes = 16 hex chars)
  validateHex(registers.tdAttributes, 16, 'tdAttributes');

  // Validate xFAM (8 bytes = 16 hex chars)
  validateHex(registers.xFAM, 16, 'xFAM');

  // Validate mrTd (48 bytes = 96 hex chars)
  validateHex(registers.mrTd, 96, 'mrTd');

  // Validate mrConfigId (48 bytes = 96 hex chars)
  validateHex(registers.mrConfigId, 96, 'mrConfigId');

  // Validate runtime measurement registers (48 bytes = 96 hex chars each)
  validateHex(registers.rtMr0, 96, 'rtMr0');
  validateHex(registers.rtMr1, 96, 'rtMr1');
  validateHex(registers.rtMr2, 96, 'rtMr2');
  validateHex(registers.rtMr3, 96, 'rtMr3');
}

/**
 * Normalizes hex string by removing 0x prefix and converting to lowercase
 */
export function normalizeHex(value: string): string {
  const cleanHex = value.startsWith('0x') ? value.slice(2) : value;
  return cleanHex.toLowerCase();
}

/**
 * Validates workload ID format (32 bytes = 64 hex chars)
 */
export function validateWorkloadId(workloadId: string): void {
  validateHex(workloadId, 64, 'workloadId');
}
