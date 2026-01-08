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
 * Supports arrays for mrtd and rtmr0 fields
 */
export function validateWorkloadMeasurementRegisters(
  registers: WorkloadMeasurementRegisters
): void {
  // Validate tdattributes (8 bytes = 16 hex chars)
  validateHex(registers.tdattributes, 16, 'tdattributes');

  // Validate xfam (8 bytes = 16 hex chars)
  validateHex(registers.xfam, 16, 'xfam');

  // Validate mrtd (48 bytes = 96 hex chars) - can be single value or array
  if (Array.isArray(registers.mrtd)) {
    if (registers.mrtd.length === 0) {
      throw new ValidationError('mrtd array cannot be empty', 'mrtd');
    }
    registers.mrtd.forEach((value, index) => {
      validateHex(value, 96, `mrtd[${index}]`);
    });
  } else {
    validateHex(registers.mrtd, 96, 'mrtd');
  }

  // Validate mrconfigid (48 bytes = 96 hex chars)
  validateHex(registers.mrconfigid, 96, 'mrconfigid');

  // Validate rtmr0 (48 bytes = 96 hex chars) - can be single value or array
  if (Array.isArray(registers.rtmr0)) {
    if (registers.rtmr0.length === 0) {
      throw new ValidationError('rtmr0 array cannot be empty', 'rtmr0');
    }
    registers.rtmr0.forEach((value, index) => {
      validateHex(value, 96, `rtmr0[${index}]`);
    });
  } else {
    validateHex(registers.rtmr0, 96, 'rtmr0');
  }

  // Validate runtime measurement registers (48 bytes = 96 hex chars each)
  validateHex(registers.rtmr1, 96, 'rtmr1');
  validateHex(registers.rtmr2, 96, 'rtmr2');
  validateHex(registers.rtmr3, 96, 'rtmr3');
}

/**
 * Validates that all fields in SingularWorkloadMeasurementRegisters are single values
 * This is stricter than validateWorkloadMeasurementRegisters - no arrays allowed
 *
 * @throws {ValidationError} If mrtd or rtmr0 are arrays, or if any field is invalid
 */
export function validateSingularWorkloadMeasurementRegisters(
  registers: SingularWorkloadMeasurementRegisters
): void {
  // Runtime check that mrtd and rtmr0 are NOT arrays (type guard)
  if (Array.isArray(registers.mrtd)) {
    throw new ValidationError('mrtd must be a single value, not an array', 'mrtd');
  }
  if (Array.isArray(registers.rtmr0)) {
    throw new ValidationError('rtmr0 must be a single value, not an array', 'rtmr0');
  }

  // Then validate all fields using the standard validator
  // This works because SingularWorkloadMeasurementRegisters is structurally compatible
  // with WorkloadMeasurementRegisters when mrtd and rtmr0 are single values
  validateWorkloadMeasurementRegisters(registers as WorkloadMeasurementRegisters);
}

/**
 * Normalizes hex string by removing 0x prefix and converting to lowercase
 */
export function normalizeHex(value: string): string {
  const cleanHex = value.startsWith('0x') ? value.slice(2) : value;
  return cleanHex.toLowerCase();
}

