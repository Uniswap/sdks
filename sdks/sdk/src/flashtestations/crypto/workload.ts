import { keccak256 } from 'viem/utils'

import type { WorkloadMeasurementRegisters, SingularWorkloadMeasurementRegisters } from '../types/index'
import { validateWorkloadMeasurementRegisters, validateSingularWorkloadMeasurementRegisters } from '../types/validation'

/**
 * Converts a hex string to a Uint8Array
 * This is a helper function to convert a hex string to a Uint8Array
 * Accepts both 0x-prefixed and non-prefixed hex strings
 * @example:
 * - '0x123456789abcde' -> Uint8Array([0x12, 0x34, 0x56, 0x78, 0x9a, 0xbc, 0xde])
 * - '123456789abcde' -> Uint8Array([0x12, 0x34, 0x56, 0x78, 0x9a, 0xbc, 0xde])
 * @param hex - The hex string to convert (with or without 0x prefix)
 * @returns The Uint8Array
 * @throws If the hex string is invalid
 *
 */
function hexToBytes(hex: string): Uint8Array {
  const unprefixedHex = hex.startsWith('0x') ? hex.slice(2) : hex
  if (unprefixedHex.length % 2 !== 0) throw new Error('Invalid hex string')
  return Uint8Array.from(unprefixedHex.match(/.{1,2}/g)!.map((byte) => parseInt(byte, 16)))
}

/**
 * Concatenates multiple Uint8Arrays
 * @example:
 * - concatBytes(Uint8Array([0x12, 0x34]), Uint8Array([0x56, 0x78]), Uint8Array([0x9a, 0xbc])) -> Uint8Array([0x12, 0x34, 0x56, 0x78, 0x9a, 0xbc])
 * @param arrays - The Uint8Arrays to concatenate
 * @returns The result of the concatenation
 */
function concatBytes(...arrays: Uint8Array[]): Uint8Array {
  const totalLength = arrays.reduce((sum, arr) => sum + arr.length, 0)
  const result = new Uint8Array(totalLength)
  let offset = 0
  for (const arr of arrays) {
    result.set(arr, offset)
    offset += arr.length
  }
  return result
}

/**
 * Computes workload ID from TEE measurement registers
 * Formula: keccak256(mrTd + rtMr0 + rtMr1 + rtMr2 + rtMr3 + mrConfigId + (xFAM ^ expectedXfamBits) + (tdAttributes & ~ignoredTdAttributesBitmask))
 * This is copied from the Solidity implementation of the workload ID computation at:
 * https://github.com/flashbots/flashtestations/blob/38594f37b5f6d1b1f5f6ad4203a4770c10f72a22/src/BlockBuilderPolicy.sol#L208
 *
 * @param registers - Singular workload measurement registers
 * @returns The computed workload ID as a hex string
 *
 * @remarks
 * This function only accepts singular registers. If you have registers with multiple
 * possible values (arrays), use `computeAllWorkloadIds()` or `expandToSingularRegisters()` first.
 */
export function computeWorkloadId(registers: SingularWorkloadMeasurementRegisters): string {
  // Validate input registers (ensures no arrays)
  validateSingularWorkloadMeasurementRegisters(registers)

  // Convert hex strings to Uint8Arrays for bitwise operations
  const mrTd = hexToBytes(registers.mrtd)
  const rtMr0 = hexToBytes(registers.rtmr0)
  const rtMr1 = hexToBytes(registers.rtmr1)
  const rtMr2 = hexToBytes(registers.rtmr2)
  const rtMr3 = hexToBytes(registers.rtmr3)
  const mrConfigId = hexToBytes(registers.mrconfigid)
  const xFAM = hexToBytes(registers.xfam)
  const tdAttributes = hexToBytes(registers.tdattributes)

  // Concatenate all components and hash
  return keccak256(concatBytes(mrTd, rtMr0, rtMr1, rtMr2, rtMr3, mrConfigId, xFAM, tdAttributes))
}

/**
 * Expands WorkloadMeasurementRegisters with array fields into all possible
 * singular register combinations (cartesian product of mrTd and rtMr0 values)
 *
 * @param registers - Flexible registers that may contain arrays
 * @returns Array of all possible singular register combinations
 *
 * @example
 * ```typescript
 * const input = {
 *   // ... other fields
 *   mrtd: ['0xaaa...', '0xbbb...'],
 *   rtmr0: ['0xccc...', '0xddd...']
 * };
 * // Returns 4 combinations: (aaa,ccc), (aaa,ddd), (bbb,ccc), (bbb,ddd)
 * const singularRegisters = expandToSingularRegisters(input);
 * ```
 */
export function expandToSingularRegisters(
  registers: WorkloadMeasurementRegisters
): SingularWorkloadMeasurementRegisters[] {
  // Validate input first
  validateWorkloadMeasurementRegisters(registers)

  // Normalize mrtd and rtmr0 to arrays
  const mrTdValues = Array.isArray(registers.mrtd) ? registers.mrtd : [registers.mrtd]
  const rtMr0Values = Array.isArray(registers.rtmr0) ? registers.rtmr0 : [registers.rtmr0]

  // Generate cartesian product
  const result: SingularWorkloadMeasurementRegisters[] = []
  for (const mrtd of mrTdValues) {
    for (const rtmr0 of rtMr0Values) {
      result.push({
        tdattributes: registers.tdattributes,
        xfam: registers.xfam,
        mrtd: mrtd,
        mrconfigid: registers.mrconfigid,
        rtmr0: rtmr0,
        rtmr1: registers.rtmr1,
        rtmr2: registers.rtmr2,
        rtmr3: registers.rtmr3,
      })
    }
  }

  return result
}

/**
 * Computes all possible workload IDs for the given registers.
 * If registers contain arrays, computes the ID for each combination.
 *
 * @param registers - Flexible registers that may contain arrays
 * @returns Array of all possible workload IDs
 *
 * @example
 * ```typescript
 * const registers = {
 *   // ... other fields
 *   mrtd: ['0xaaa...', '0xbbb...'],
 *   rtmr0: ['0xccc...', '0xddd...']
 * };
 * // Returns 4 workload IDs, one for each combination
 * const ids = computeAllWorkloadIds(registers);
 * ```
 */
export function computeAllWorkloadIds(registers: WorkloadMeasurementRegisters): string[] {
  const singularRegisters = expandToSingularRegisters(registers)
  return singularRegisters.map((singular) => computeWorkloadId(singular))
}

/**
 * Checks if any of the possible workload IDs from the given registers
 * match the expected workload ID.
 *
 * @param registers - Flexible registers that may contain arrays
 * @param expectedWorkloadId - The workload ID to match against
 * @returns true if any combination matches the expected ID
 *
 * @example
 * ```typescript
 * const registers = {
 *   // ... other fields
 *   mrtd: ['0xaaa...', '0xbbb...'],
 *   rtmr0: ['0xccc...', '0xddd...']
 * };
 * // Returns true if any of the 4 possible IDs matches
 * const matches = matchesAnyWorkloadId(registers, expectedId);
 * ```
 */
export function matchesAnyWorkloadId(registers: WorkloadMeasurementRegisters, expectedWorkloadId: string): boolean {
  const allIds = computeAllWorkloadIds(registers)
  return allIds.includes(expectedWorkloadId)
}
