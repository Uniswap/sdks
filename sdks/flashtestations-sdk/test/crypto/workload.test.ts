import { computeWorkloadId } from '../../src/crypto/workload';
import { WorkloadMeasureRegisters } from '../../src/types/index';
import { createWorkloadMeasureRegisters } from '../utils/util';

describe('Workload ID computation', () => {
  // Helper to create exactly 96 character hex strings
  const createHex96 = (prefix: string): string => {
    // Remove 0x prefix if present
    const cleanPrefix = prefix.startsWith('0x') ? prefix.slice(2) : prefix;
    const padding = '0'.repeat(96 - cleanPrefix.length);
    return cleanPrefix + padding;
  };

  const validRegisters: WorkloadMeasureRegisters = {
    tdAttributes: '0000000000000000',
    xFAM: '0000000000000003',
    mrTd: createHex96('123456789abcdef'),
    mrConfigId: createHex96('000000'),
    rtMr0: createHex96('abcdef0123456789'),
    rtMr1: createHex96('fedcba9876543210'),
    rtMr2: createHex96('111111'),
    rtMr3: createHex96('222222'),
  };

  describe('computeWorkloadId', () => {
    it('should compute workload ID with valid registers', () => {
      const result = computeWorkloadId(validRegisters);

      expect(result).toMatch(/^0x[0-9a-f]{64}$/);
      expect(result.length).toBe(66); // 0x + 64 hex chars
    });

    it('should produce consistent results for same input', () => {
      const result1 = computeWorkloadId(validRegisters);
      const result2 = computeWorkloadId(validRegisters);

      expect(result1).toBe(result2);
    });

    it('should produce different results for different inputs', () => {
      const modifiedRegisters = {
        ...validRegisters,
        mrTd: createHex96('0xdf0123456789abcdef'),
      };

      const result1 = computeWorkloadId(validRegisters);
      const result2 = computeWorkloadId(modifiedRegisters);

      expect(result1).not.toBe(result2);
    });

    it('should handle registers with 0x prefix', () => {
      const prefixedRegisters = {
        ...validRegisters,
        tdAttributes: '0x0000000000000000',
        xFAM: '0x0000000000000003',
      };

      const result1 = computeWorkloadId(validRegisters);
      const result2 = computeWorkloadId(prefixedRegisters);

      expect(result1).toBe(result2);
    });

    it('should apply hardcoded TDX values correctly', () => {
      // Test that xFAM XOR with expectedXfamBits (0000000000000003) works
      const registersWithDifferentXFAM = {
        ...validRegisters,
        xFAM: '0000000000000001', // Different from expected 0000000000000003
      };

      const result1 = computeWorkloadId(validRegisters);
      const result2 = computeWorkloadId(registersWithDifferentXFAM);

      // Results should be different because XOR operation changes the outcome
      expect(result1).not.toBe(result2);
    });

    it('should validate input registers', () => {
      const invalidRegisters = {
        ...validRegisters,
        tdAttributes: 'invalid', // Invalid hex
      };

      expect(() => computeWorkloadId(invalidRegisters)).toThrow(
        'Invalid tdAttributes'
      );
    });

    it('should validate register lengths', () => {
      const shortRegister = {
        ...validRegisters,
        mrTd: '123456', // Too short (should be 96 hex chars)
      };

      expect(() => computeWorkloadId(shortRegister)).toThrow('Invalid mrTd');
    });
  });

  describe('createWorkloadMeasureRegisters', () => {
    it('should create registers with default values', () => {
      const result = createWorkloadMeasureRegisters({});

      expect(result.tdAttributes).toBe('0000000000000000');
      expect(result.xFAM).toBe('0000000000000003');
      expect(result.mrConfigId).toBe(
        '000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000'
      );
    });

    it('should allow overriding specific registers', () => {
      const customMrTd =
        '999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999';
      const result = createWorkloadMeasureRegisters({
        mrTd: customMrTd,
      });

      expect(result.mrTd).toBe(customMrTd);
      expect(result.xFAM).toBe('0000000000000003'); // Should keep default
    });

    it('should create valid registers that can be used for computation', () => {
      const registers = createWorkloadMeasureRegisters({
        mrTd: createHex96('deadbeef1'),
      });

      // Should not throw
      expect(() => computeWorkloadId(registers)).not.toThrow();

      const result = computeWorkloadId(registers);
      expect(result).toMatch(/^0x[0-9a-f]{64}$/);
    });
  });

  describe('integration tests', () => {
    it('should handle complete workload ID computation flow', () => {
      // Create registers with some custom values
      const registers = createWorkloadMeasureRegisters({
        mrTd: createHex96('deadbeef1'),
        rtMr0: createHex96('deadbeef2'),
        rtMr1: createHex96('deadbeef3'),
      });

      const workloadId = computeWorkloadId(registers);

      expect(workloadId).toMatch(/^0x[0-9a-f]{64}$/);
      expect(workloadId.length).toBe(66);

      // Verify reproducibility
      const workloadId2 = computeWorkloadId(registers);
      expect(workloadId).toBe(workloadId2);
    });
  });
});
