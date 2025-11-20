import type { WorkloadMeasurementRegisters, SingularWorkloadMeasurementRegisters } from './index';
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
function validateHex(
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
 * Validates WorkloadMeasurementRegisters structure and field formats
 * Supports arrays for mrTd and rtMr0 fields
 */
export function validateWorkloadMeasurementRegisters(
  registers: WorkloadMeasurementRegisters
): void {
  // Validate tdAttributes (8 bytes = 16 hex chars)
  validateHex(registers.tdAttributes, 16, 'tdAttributes');

  // Validate xFAM (8 bytes = 16 hex chars)
  validateHex(registers.xFAM, 16, 'xFAM');

  // Validate mrTd (48 bytes = 96 hex chars) - can be single value or array
  if (Array.isArray(registers.mrTd)) {
    if (registers.mrTd.length === 0) {
      throw new ValidationError('mrTd array cannot be empty', 'mrTd');
    }
    registers.mrTd.forEach((value, index) => {
      validateHex(value, 96, `mrTd[${index}]`);
    });
  } else {
    validateHex(registers.mrTd, 96, 'mrTd');
  }

  // Validate mrConfigId (48 bytes = 96 hex chars)
  validateHex(registers.mrConfigId, 96, 'mrConfigId');

  // Validate rtMr0 (48 bytes = 96 hex chars) - can be single value or array
  if (Array.isArray(registers.rtMr0)) {
    if (registers.rtMr0.length === 0) {
      throw new ValidationError('rtMr0 array cannot be empty', 'rtMr0');
    }
    registers.rtMr0.forEach((value, index) => {
      validateHex(value, 96, `rtMr0[${index}]`);
    });
  } else {
    validateHex(registers.rtMr0, 96, 'rtMr0');
  }

  // Validate runtime measurement registers (48 bytes = 96 hex chars each)
  validateHex(registers.rtMr1, 96, 'rtMr1');
  validateHex(registers.rtMr2, 96, 'rtMr2');
  validateHex(registers.rtMr3, 96, 'rtMr3');
}

/**
 * Validates that all fields in SingularWorkloadMeasurementRegisters are single values
 * This is stricter than validateWorkloadMeasurementRegisters - no arrays allowed
 *
 * @throws {ValidationError} If mrTd or rtMr0 are arrays, or if any field is invalid
 */
export function validateSingularWorkloadMeasurementRegisters(
  registers: SingularWorkloadMeasurementRegisters
): void {
  // Runtime check that mrTd and rtMr0 are NOT arrays (type guard)
  if (Array.isArray(registers.mrTd)) {
    throw new ValidationError('mrTd must be a single value, not an array', 'mrTd');
  }
  if (Array.isArray(registers.rtMr0)) {
    throw new ValidationError('rtMr0 must be a single value, not an array', 'rtMr0');
  }

  // Then validate all fields using the standard validator
  // This works because SingularWorkloadMeasurementRegisters is structurally compatible
  // with WorkloadMeasurementRegisters when mrTd and rtMr0 are single values
  validateWorkloadMeasurementRegisters(registers as WorkloadMeasurementRegisters);
}

/**
 * Normalizes hex string by removing 0x prefix and converting to lowercase
 */
export function normalizeHex(value: string): string {
  const cleanHex = value.startsWith('0x') ? value.slice(2) : value;
  return cleanHex.toLowerCase();
}

