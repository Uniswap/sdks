import { WorkloadMeasureRegisters } from "../../src/types";
import { TDX_CONSTANTS } from "../../src/crypto/workload";

/**
 * Utility function to create WorkloadMeasureRegisters with default TDX values
 * This is helpful for testing or when some registers use standard values
 */
export function createWorkloadMeasureRegisters(overrides: Partial<WorkloadMeasureRegisters>): WorkloadMeasureRegisters {
    return {
      tdAttributes: TDX_CONSTANTS.ignoredTdAttributesBitmask,
      xFAM: TDX_CONSTANTS.expectedXfamBits,
      mrConfigId: TDX_CONSTANTS.expectedMrConfigId,
      mrTd: '000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000',
      rtMr0: '000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000',
      rtMr1: '000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000',
      rtMr2: '000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000',
      rtMr3: '000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000',
      ...overrides
    };
  }
