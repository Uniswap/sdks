import { computeWorkloadId } from '../../src/crypto/workload';
import { WorkloadMeasureRegisters } from '../../src/types/index';

describe('Workload ID computation', () => {
  // Helper to create exactly 96 character hex strings
  const createHex96 = (prefix: `0x${string}`): `0x${string}` => {
    // Remove 0x prefix if present
    const cleanPrefix = prefix.startsWith('0x') ? prefix.slice(2) : prefix;
    const padding = '0'.repeat(96 - cleanPrefix.length);
    return `0x${cleanPrefix}${padding}`;
  };

  const validRegisters: WorkloadMeasureRegisters = {
    tdAttributes: '0x0000001000000000',
    xFAM: '0xe702060000000000',
    mrTd: '0x47a1cc074b914df8596bad0ed13d50d561ad1effc7f7cc530ab86da7ea49ffc03e57e7da829f8cba9c629c3970505323',
    mrConfigId: '0x000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000',
    rtMr0: '0x00e1dad5455e5fa87974edb69e13296dd1ba9fa86356d70b68be15dd5d36767643904de1893c1b4d47fc8d3a90675391',
    rtMr1: '0xa7157e7c5f932e9babac9209d4527ec9ed837b8e335a931517677fa746db51ee56062e3324e266e3f39ec26a516f4f71',
    rtMr2: '0xe63560e50830e22fbc9b06cdce8afe784bf111e4251256cf104050f1347cd4ad9f30da408475066575145da0b098a124',
    rtMr3: '0x000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000',
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

    it('should validate input registers', () => {
      const invalidRegisters = {
        ...validRegisters,
        tdAttributes: '0xinvalid' as `0x${string}`, // Invalid hex
      };

      expect(() => computeWorkloadId(invalidRegisters)).toThrow(
        'Invalid tdAttributes: expected 16 hex characters, got 7'
      );
    });

    it('should validate register lengths', () => {
      const invalidRegisters = {
        ...validRegisters,
        tdAttributes: '0x0' as `0x${string}`, // Invalid hex
      };

      expect(() => computeWorkloadId(invalidRegisters)).toThrow(
        'Invalid tdAttributes: expected 16 hex characters, got 1'
      );
    });
  });

  describe('integration tests', () => {
    it('should handle complete workload ID computation flow', () => {
      // this example workloadId is the same as the one from an actual TDX report in the solidity test code
      // here: https://github.com/flashbots/flashtestations/blob/7cc7f68492fe672a823dd2dead649793aac1f216/test/BlockBuilderPolicy.t.sol#L302
      const expectedWorkloadId =
        '0xf724e7d117f5655cf33beefdfc7d31e930278fcb65cf6d1de632595e97ca82b2';
      // Create registers with some custom values
      const registers: WorkloadMeasureRegisters = {
        tdAttributes: '0x0000001000000000',
        xFAM: '0xe702060000000000',
        mrTd: '0x47a1cc074b914df8596bad0ed13d50d561ad1effc7f7cc530ab86da7ea49ffc03e57e7da829f8cba9c629c3970505323',
        mrConfigId:
          '0x000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000',
        rtMr0:
          '0x00e1dad5455e5fa87974edb69e13296dd1ba9fa86356d70b68be15dd5d36767643904de1893c1b4d47fc8d3a90675391',
        rtMr1:
          '0xa7157e7c5f932e9babac9209d4527ec9ed837b8e335a931517677fa746db51ee56062e3324e266e3f39ec26a516f4f71',
        rtMr2:
          '0xe63560e50830e22fbc9b06cdce8afe784bf111e4251256cf104050f1347cd4ad9f30da408475066575145da0b098a124',
        rtMr3:
          '0x000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000',
      };

      const workloadId = computeWorkloadId(registers);

      expect(workloadId).toMatch(expectedWorkloadId);

      // Verify reproducibility
      const workloadId2 = computeWorkloadId(registers);
      expect(workloadId).toBe(workloadId2);
    });

    it('should handle workload ID computation with a different set of registers', () => {
      const expectedWorkloadId =
        '0xc85f03aebad8acae79c876cbad92cd1da26c0555a383146132b3dbf5709e8662';
      // Create registers with some custom values
      const registers: WorkloadMeasureRegisters = {
        tdAttributes: '0x0000001000000000',
        xFAM: '0xe702060000000000',
        mrTd: '0x47a1cc074b914df8596bad0ed13d50d561ad1effc7f7cc530ab86da7ea49ffc03e57e7da829f8cba9c629c3970505323',
        mrConfigId:
          '0x000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000',
        rtMr0:
          '0x00e1dad5455e5fa87974edb69e13296dd1ba9fa86356d70b68be15dd5d36767643904de1893c1b4d47fc8d3a90675391',
        rtMr1:
          '0xa7157e7c5f932e9babac9209d4527ec9ed837b8e335a931517677fa746db51ee56062f3324e266e3f39ec26a516f4f71',
        rtMr2:
          '0xe63561e50830e22fbc9b06cdce8afe784bf112e4251256cf104050f1347cd4ad9f30da408475066575145da0b098a124',
        rtMr3:
          '0x000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000',
      };

      const workloadId = computeWorkloadId(registers);

      expect(workloadId).toMatch(expectedWorkloadId);

      // Verify reproducibility
      const workloadId2 = computeWorkloadId(registers);
      expect(workloadId).toBe(workloadId2);
    });
  });
});
