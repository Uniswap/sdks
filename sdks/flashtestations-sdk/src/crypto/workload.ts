import type { WorkloadMeasureRegisters } from '../types/index';
import {
  validateWorkloadMeasureRegisters,
  normalizeHex,
} from '../types/validation';

import { keccak256Concat } from './hash';

/**
 * Hardcoded TDX measurement register values that aren't tied to OS image hash
 */
export const TDX_CONSTANTS = {
  /** Expected xFAM value (8 bytes) */
  expectedXfamBits: '0000000000000003',
  /** TD attributes mask to ignore certain bits (8 bytes) */
  ignoredTdAttributesBitmask: '0000000000000000',
  /** Expected mrConfigId for TDX (48 bytes) */
  expectedMrConfigId:
    '000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000',
};

/**
 * Performs bitwise XOR operation on hex strings
 */
function hexXor(hex1: string, hex2: string): string {
  const clean1 = normalizeHex(hex1);
  const clean2 = normalizeHex(hex2);

  if (clean1.length !== clean2.length) {
    throw new Error(
      `Cannot XOR hex strings of different lengths: ${clean1.length} vs ${clean2.length}`
    );
  }

  let result = '';
  for (let i = 0; i < clean1.length; i += 2) {
    const byte1 = parseInt(clean1.substr(i, 2), 16);
    const byte2 = parseInt(clean2.substr(i, 2), 16);
    const xorByte = byte1 ^ byte2;
    result += xorByte.toString(16).padStart(2, '0');
  }

  return result;
}

/**
 * Performs bitwise AND operation on hex strings with NOT mask
 */
function hexAndNot(hex: string, mask: string): string {
  const cleanHex = normalizeHex(hex);
  const cleanMask = normalizeHex(mask);

  if (cleanHex.length !== cleanMask.length) {
    throw new Error(
      `Cannot AND hex strings of different lengths: ${cleanHex.length} vs ${cleanMask.length}`
    );
  }

  let result = '';
  for (let i = 0; i < cleanHex.length; i += 2) {
    const byte = parseInt(cleanHex.substr(i, 2), 16);
    const maskByte = parseInt(cleanMask.substr(i, 2), 16);
    const andByte = byte & ~maskByte;
    result += andByte.toString(16).padStart(2, '0');
  }

  return result;
}

/**
 * Computes workload ID from TEE measurement registers
 * Formula: keccak256(mrTd + rtMr0 + rtMr1 + rtMr2 + rtMr3 + mrConfigId + (xFAM ^ expectedXfamBits) + (tdAttributes & ~ignoredTdAttributesBitmask))
 * This is copied from the Solidity implementation of the workload ID computation at:
 * https://github.com/flashbots/flashtestations/blob/97600245bc59a8b362b9363a44cef2e4a0fa0cfd/src/BlockBuilderPolicy.sol#L224
 */
export function computeWorkloadId(registers: WorkloadMeasureRegisters): string {
  // Validate input registers
  validateWorkloadMeasureRegisters(registers);

  // Normalize all hex values (remove 0x prefix, lowercase)
  const mrTd = normalizeHex(registers.mrTd);
  const rtMr0 = normalizeHex(registers.rtMr0);
  const rtMr1 = normalizeHex(registers.rtMr1);
  const rtMr2 = normalizeHex(registers.rtMr2);
  const rtMr3 = normalizeHex(registers.rtMr3);
  const mrConfigId = normalizeHex(registers.mrConfigId);

  // Apply bitwise operations with hardcoded values
  const xfamXor = hexXor(registers.xFAM, TDX_CONSTANTS.expectedXfamBits);
  const tdAttributesAnd = hexAndNot(
    registers.tdAttributes,
    TDX_CONSTANTS.ignoredTdAttributesBitmask
  );

  // Concatenate all components and hash
  return keccak256Concat(
    mrTd,
    rtMr0,
    rtMr1,
    rtMr2,
    rtMr3,
    mrConfigId,
    xfamXor,
    tdAttributesAnd
  );
}
