import { keccak256 } from 'viem/utils';

import type { WorkloadMeasureRegisters } from '../types/index';
import {
  validateWorkloadMeasureRegisters,
} from '../types/validation';



/**
 * Hardcoded TDX measurement register values that aren't tied to OS image hash
 */
export const TDX_CONSTANTS = {
  /** Expected xFAM value (8 bytes) */
  /** Copied from https://github.com/flashbots/flashtestations/blob/7cc7f68492fe672a823dd2dead649793aac1f216/src/BlockBuilderPolicy.sol#L231 */
  expectedXfamBits: xorBytes(hexToBytes('0x0000000000000001'), hexToBytes('0x0000000000000002')),
  /** TD attributes mask to ignore certain bits (8 bytes) */
  /** Copied from https://github.com/flashbots/flashtestations/blob/7cc7f68492fe672a823dd2dead649793aac1f216/src/BlockBuilderPolicy.sol#L234 */
  ignoredTdAttributesBitmask: orBytes(orBytes(hexToBytes('0x0000000010000000'), hexToBytes('0x0000000040000000')), hexToBytes('0x0000000080000000')),
};

/**
 * Converts a hex string to a Uint8Array
 * This is a helper function to convert a hex string to a Uint8Array
 * @example:
 * - '0x123456789abcde' -> Uint8Array([0x12, 0x34, 0x56, 0x78, 0x9a, 0xbc, 0xde])
 * @param hex - The hex string to convert
 * @returns The Uint8Array
 * @throws If the hex string is invalid
 * 
 */
function hexToBytes(hex: `0x${string}`): Uint8Array {
  if (hex.length % 2 !== 0) throw new Error("Invalid hex string");
  const unprefixedHex = hex.slice(2);
  return Uint8Array.from(unprefixedHex.match(/.{1,2}/g)!.map(byte => parseInt(byte, 16)));
}

/**
 * Performs bitwise XOR operation on two Uint8Arrays
 * This is a helper function to perform a bitwise XOR operation on two Uint8Arrays
 * @example:
 * - Uint8Array([0x12, 0x34, 0x56, 0x78, 0x9a, 0xbc, 0xde]) XOR Uint8Array([0x12, 0x34, 0x56, 0x78, 0x9a, 0xbc, 0xde]) -> Uint8Array([0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00])
 * @param a - The first Uint8Array
 * @param b - The second Uint8Array
 * @returns The result of the XOR operation
 * @throws If the lengths of the Uint8Arrays are mismatched
 */
function xorBytes(a: Uint8Array, b: Uint8Array): Uint8Array {
  if (a.length !== b.length) throw new Error("Mismatched lengths");
  return Uint8Array.from(a.map((x, i) => x ^ b[i]));
}

/**
 * Performs bitwise OR operation on two Uint8Arrays
 * This is a helper function to perform a bitwise OR operation on two Uint8Arrays
 * @example:
 * - Uint8Array([0x12, 0x34, 0x56, 0x78, 0x9a, 0xbc, 0xde]) OR Uint8Array([0x12, 0x34, 0x56, 0x78, 0x9a, 0xbc, 0x00]) -> Uint8Array([0x12, 0x34, 0x56, 0x78, 0x9a, 0xbc, 0xde])
 * @param a - The first Uint8Array
 * @param b - The second Uint8Array
 * @returns The result of the OR operation
 * @throws If the lengths of the Uint8Arrays are mismatched
 */
function orBytes(a: Uint8Array, b: Uint8Array): Uint8Array {
  if (a.length !== b.length) throw new Error("Mismatched lengths");
  return Uint8Array.from(a.map((x, i) => x | b[i]));
}

/**
 * Performs bitwise AND operation on two Uint8Arrays
 * This is a helper function to perform a bitwise AND operation on two Uint8Arrays
 * @example:
 * - Uint8Array([0x12, 0x34, 0x56, 0x78, 0x9a, 0xbc, 0xde]) AND Uint8Array([0x12, 0x34, 0x56, 0x78, 0x9a, 0xbc, 0x00]) -> Uint8Array([0x12, 0x34, 0x56, 0x78, 0x9a, 0xbc, 0x00])
 * @param a - The first Uint8Array
 * @param b - The second Uint8Array
 * @returns The result of the AND operation
 * @throws If the lengths of the Uint8Arrays are mismatched
 */
function andBytes(a: Uint8Array, b: Uint8Array): Uint8Array {
  if (a.length !== b.length) throw new Error("Mismatched lengths");
  return Uint8Array.from(a.map((x, i) => x & b[i]));
}

/**
 * Performs bitwise NOT operation on a Uint8Array
 * This is a helper function to perform a bitwise NOT operation on a Uint8Array
 * @example:
 * - Uint8Array([0x12, 0x34, 0x56, 0x78, 0x9a, 0xbc, 0xde]) -> Uint8Array([0xed, 0xcb, 0xa9, 0x87, 0x75, 0x43, 0x21])
 * @param bytes - The Uint8Array to perform the NOT operation on
 * @returns The result of the NOT operation
 */
function notBytes(bytes: Uint8Array): Uint8Array {
  return Uint8Array.from(bytes.map(x => ~x));
}

/**
 * Concatenates multiple Uint8Arrays
 * @example:
 * - concatBytes(Uint8Array([0x12, 0x34]), Uint8Array([0x56, 0x78]), Uint8Array([0x9a, 0xbc])) -> Uint8Array([0x12, 0x34, 0x56, 0x78, 0x9a, 0xbc])
 * @param arrays - The Uint8Arrays to concatenate
 * @returns The result of the concatenation
 */
function concatBytes(...arrays: Uint8Array[]): Uint8Array {
  const totalLength = arrays.reduce((sum, arr) => sum + arr.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const arr of arrays) {
    result.set(arr, offset);
    offset += arr.length;
  }
  return result;
}

/**
 * Computes workload ID from TEE measurement registers
 * Formula: keccak256(mrTd + rtMr0 + rtMr1 + rtMr2 + rtMr3 + mrConfigId + (xFAM ^ expectedXfamBits) + (tdAttributes & ~ignoredTdAttributesBitmask))
 * This is copied from the Solidity implementation of the workload ID computation at:
 * https://github.com/flashbots/flashtestations/blob/7cc7f68492fe672a823dd2dead649793aac1f216/src/BlockBuilderPolicy.sol#L236
 */
export function computeWorkloadId(registers: WorkloadMeasureRegisters): string {
  // Validate input registers
  validateWorkloadMeasureRegisters(registers);

  // Convert hex strings to Uint8Arrays for bitwise operations
  const mrTd = hexToBytes(registers.mrTd);
  const rtMr0 = hexToBytes(registers.rtMr0);
  const rtMr1 = hexToBytes(registers.rtMr1);
  const rtMr2 = hexToBytes(registers.rtMr2);
  const rtMr3 = hexToBytes(registers.rtMr3);
  const mrConfigId = hexToBytes(registers.mrConfigId);
  const xFAM = hexToBytes(registers.xFAM);
  const tdAttributes = hexToBytes(registers.tdAttributes);

  // Apply bitwise operations with hardcoded values
  const xfamPreprocessed = xorBytes(xFAM, TDX_CONSTANTS.expectedXfamBits);
  const tdAttributesPreprocessed = andBytes(
    tdAttributes,
    notBytes(TDX_CONSTANTS.ignoredTdAttributesBitmask)
  );

  // Concatenate all components and hash
  return keccak256(
    concatBytes(mrTd, rtMr0, rtMr1, rtMr2, rtMr3, mrConfigId, xfamPreprocessed, tdAttributesPreprocessed)
  );
}
