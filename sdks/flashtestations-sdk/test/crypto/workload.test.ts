import {
  computeWorkloadId,
  expandToSingularRegisters,
  computeAllWorkloadIds,
  matchesAnyWorkloadId
} from '../../src/crypto/workload';
import {
  SingularWorkloadMeasurementRegisters,
  WorkloadMeasurementRegisters
} from '../../src/types/index';

describe('Workload ID computation', () => {
  // Helper to create exactly 96 character hex strings
  const createHex96 = (prefix: `0x${string}`): `0x${string}` => {
    // Remove 0x prefix if present
    const cleanPrefix = prefix.startsWith('0x') ? prefix.slice(2) : prefix;
    const padding = '0'.repeat(96 - cleanPrefix.length);
    return `0x${cleanPrefix}${padding}`;
  };

  const validRegisters: SingularWorkloadMeasurementRegisters = {
    tdattributes: '0x0000001000000000',
    xfam: '0xe702060000000000',
    mrtd: '0x47a1cc074b914df8596bad0ed13d50d561ad1effc7f7cc530ab86da7ea49ffc03e57e7da829f8cba9c629c3970505323',
    mrconfigid: '0x000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000',
    rtmr0: '0x00e1dad5455e5fa87974edb69e13296dd1ba9fa86356d70b68be15dd5d36767643904de1893c1b4d47fc8d3a90675391',
    rtmr1: '0xa7157e7c5f932e9babac9209d4527ec9ed837b8e335a931517677fa746db51ee56062e3324e266e3f39ec26a516f4f71',
    rtmr2: '0xe63560e50830e22fbc9b06cdce8afe784bf111e4251256cf104050f1347cd4ad9f30da408475066575145da0b098a124',
    rtmr3: '0x000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000',
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
        mrtd: createHex96('0xdf0123456789abcdef'),
      };

      const result1 = computeWorkloadId(validRegisters);
      const result2 = computeWorkloadId(modifiedRegisters);

      expect(result1).not.toBe(result2);
    });

    it('should validate input registers', () => {
      const invalidRegisters = {
        ...validRegisters,
        tdattributes: '0xinvalid', // Invalid hex
      };

      expect(() => computeWorkloadId(invalidRegisters)).toThrow(
        'Invalid tdattributes: expected 16 hex characters, got 7'
      );
    });

    it('should validate register lengths', () => {
      const invalidRegisters = {
        ...validRegisters,
        tdattributes: '0x0', // Invalid hex
      };

      expect(() => computeWorkloadId(invalidRegisters)).toThrow(
        'Invalid tdattributes: expected 16 hex characters, got 1'
      );
    });
  });

  describe('integration tests', () => {
    it('should handle complete workload ID computation flow', () => {
      // this example workloadId is the same as the one from an actual TDX report in the solidity test code
      // here: https://github.com/flashbots/flashtestations/blob/38594f37b5f6d1b1f5f6ad4203a4770c10f72a22/test/BlockBuilderPolicy.t.sol#L300
      const expectedWorkloadId =
        '0x952569f637f3f7e36cd8f5a7578ae4d03a1cb05ddaf33b35d3054464bb1c862e';
      // Create registers with non-0x prefix
      const registers: SingularWorkloadMeasurementRegisters = {
        tdattributes: '0000001000000000',
        xfam: 'e702060000000000',
        mrtd: '47a1cc074b914df8596bad0ed13d50d561ad1effc7f7cc530ab86da7ea49ffc03e57e7da829f8cba9c629c3970505323',
        mrconfigid:
          '000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000',
        rtmr0:
          '00e1dad5455e5fa87974edb69e13296dd1ba9fa86356d70b68be15dd5d36767643904de1893c1b4d47fc8d3a90675391',
        rtmr1:
          'a7157e7c5f932e9babac9209d4527ec9ed837b8e335a931517677fa746db51ee56062e3324e266e3f39ec26a516f4f71',
        rtmr2:
          'e63560e50830e22fbc9b06cdce8afe784bf111e4251256cf104050f1347cd4ad9f30da408475066575145da0b098a124',
        rtmr3:
          '000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000',
      };

      const workloadId = computeWorkloadId(registers);

      expect(workloadId).toMatch(expectedWorkloadId);

      // Verify reproducibility
      const workloadId2 = computeWorkloadId(registers);
      expect(workloadId).toBe(workloadId2);
    });

    it('should handle workload ID computation with a different set of registers', () => {
      const expectedWorkloadId =
        '0xc1978eb1e3db791ebcdf41be6577209cb1a555f9fff06b65abe4d3baf92811a3';
      // Create registers with some custom values
      const registers: SingularWorkloadMeasurementRegisters = {
        tdattributes: '0x0000001000000000',
        xfam: '0xe702060000000000',
        mrtd: '0x47a1cc074b914df8596bad0ed13d50d561ad1effc7f7cc530ab86da7ea49ffc03e57e7da829f8cba9c629c3970505323',
        mrconfigid:
          '0x000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000',
        rtmr0:
          '0x00e1dad5455e5fa87974edb69e13296dd1ba9fa86356d70b68be15dd5d36767643904de1893c1b4d47fc8d3a90675391',
        rtmr1:
          '0xa7157e7c5f932e9babac9209d4527ec9ed837b8e335a931517677fa746db51ee56062f3324e266e3f39ec26a516f4f71',
        rtmr2:
          '0xe63561e50830e22fbc9b06cdce8afe784bf112e4251256cf104050f1347cd4ad9f30da408475066575145da0b098a124',
        rtmr3:
          '0x000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000',
      };

      const workloadId = computeWorkloadId(registers);

      expect(workloadId).toMatch(expectedWorkloadId);

      // Verify reproducibility
      const workloadId2 = computeWorkloadId(registers);
      expect(workloadId).toBe(workloadId2);
    });
  });

  describe('expandToSingularRegisters', () => {
    const baseRegisters = {
      tdattributes: '0x0000001000000000',
      xfam: '0xe702060000000000',
      mrconfigid: '0x000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000',
      rtmr1: '0xa7157e7c5f932e9babac9209d4527ec9ed837b8e335a931517677fa746db51ee56062e3324e266e3f39ec26a516f4f71',
      rtmr2: '0xe63560e50830e22fbc9b06cdce8afe784bf111e4251256cf104050f1347cd4ad9f30da408475066575145da0b098a124',
      rtmr3: '0x000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000',
    };

    it('should return single register when both mrtd and rtmr0 are single values', () => {
      const registers: WorkloadMeasurementRegisters = {
        ...baseRegisters,
        mrtd: '0x47a1cc074b914df8596bad0ed13d50d561ad1effc7f7cc530ab86da7ea49ffc03e57e7da829f8cba9c629c3970505323',
        rtmr0: '0x00e1dad5455e5fa87974edb69e13296dd1ba9fa86356d70b68be15dd5d36767643904de1893c1b4d47fc8d3a90675391',
      };

      const result = expandToSingularRegisters(registers);

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        ...baseRegisters,
        mrtd: registers.mrtd,
        rtmr0: registers.rtmr0,
      });
    });

    it('should expand mrtd array with single rtmr0', () => {
      const registers: WorkloadMeasurementRegisters = {
        ...baseRegisters,
        mrtd: [
          '0x47a1cc074b914df8596bad0ed13d50d561ad1effc7f7cc530ab86da7ea49ffc03e57e7da829f8cba9c629c3970505323',
          '0x202c7d38558f7cfa086feca5a23d62fa071cceb0bd55dbd06eeb4cebbd3c204c209f5551914d41ce433fb7fd67cc7136',
        ],
        rtmr0: '0x00e1dad5455e5fa87974edb69e13296dd1ba9fa86356d70b68be15dd5d36767643904de1893c1b4d47fc8d3a90675391',
      };

      const result = expandToSingularRegisters(registers);

      expect(result).toHaveLength(2);
      expect(result[0].mrtd).toBe(registers.mrtd[0]);
      expect(result[0].rtmr0).toBe(registers.rtmr0);
      expect(result[1].mrtd).toBe(registers.mrtd[1]);
      expect(result[1].rtmr0).toBe(registers.rtmr0);
    });

    it('should expand rtmr0 array with single mrtd', () => {
      const registers: WorkloadMeasurementRegisters = {
        ...baseRegisters,
        mrtd: '0x47a1cc074b914df8596bad0ed13d50d561ad1effc7f7cc530ab86da7ea49ffc03e57e7da829f8cba9c629c3970505323',
        rtmr0: [
          '0x00e1dad5455e5fa87974edb69e13296dd1ba9fa86356d70b68be15dd5d36767643904de1893c1b4d47fc8d3a90675391',
          '0x6da49936a0649f6970be5df8bf7ba0d2efb66a96216c11cc65ac348432a07cfaab037b173e22c54d3f10d59327e7fbc9',
        ],
      };

      const result = expandToSingularRegisters(registers);

      expect(result).toHaveLength(2);
      expect(result[0].mrtd).toBe(registers.mrtd);
      expect(result[0].rtmr0).toBe(registers.rtmr0[0]);
      expect(result[1].mrtd).toBe(registers.mrtd);
      expect(result[1].rtmr0).toBe(registers.rtmr0[1]);
    });

    it('should generate cartesian product when both mrtd and rtmr0 are arrays', () => {
      const registers: WorkloadMeasurementRegisters = {
        ...baseRegisters,
        mrtd: [
          '0x47a1cc074b914df8596bad0ed13d50d561ad1effc7f7cc530ab86da7ea49ffc03e57e7da829f8cba9c629c3970505323',
          '0x202c7d38558f7cfa086feca5a23d62fa071cceb0bd55dbd06eeb4cebbd3c204c209f5551914d41ce433fb7fd67cc7136',
        ],
        rtmr0: [
          '0x00e1dad5455e5fa87974edb69e13296dd1ba9fa86356d70b68be15dd5d36767643904de1893c1b4d47fc8d3a90675391',
          '0x6da49936a0649f6970be5df8bf7ba0d2efb66a96216c11cc65ac348432a07cfaab037b173e22c54d3f10d59327e7fbc9',
        ],
      };

      const result = expandToSingularRegisters(registers);

      // Should generate 2 x 2 = 4 combinations
      expect(result).toHaveLength(4);

      // Verify all combinations exist (mrtd[0], rtmr0[0])
      expect(result[0].mrtd).toBe(registers.mrtd[0]);
      expect(result[0].rtmr0).toBe(registers.rtmr0[0]);

      // (mrtd[0], rtmr0[1])
      expect(result[1].mrtd).toBe(registers.mrtd[0]);
      expect(result[1].rtmr0).toBe(registers.rtmr0[1]);

      // (mrtd[1], rtmr0[0])
      expect(result[2].mrtd).toBe(registers.mrtd[1]);
      expect(result[2].rtmr0).toBe(registers.rtmr0[0]);

      // (mrtd[1], rtmr0[1])
      expect(result[3].mrtd).toBe(registers.mrtd[1]);
      expect(result[3].rtmr0).toBe(registers.rtmr0[1]);

      // Verify all combinations have correct base fields
      result.forEach(singular => {
        expect(singular.tdattributes).toBe(baseRegisters.tdattributes);
        expect(singular.xfam).toBe(baseRegisters.xfam);
        expect(singular.rtmr1).toBe(baseRegisters.rtmr1);
      });
    });

    it('should handle large cartesian products (3x3)', () => {
      const registers: WorkloadMeasurementRegisters = {
        ...baseRegisters,
        mrtd: [
          '0x47a1cc074b914df8596bad0ed13d50d561ad1effc7f7cc530ab86da7ea49ffc03e57e7da829f8cba9c629c3970505323',
          '0x202c7d38558f7cfa086feca5a23d62fa071cceb0bd55dbd06eeb4cebbd3c204c209f5551914d41ce433fb7fd67cc7136',
          '0x3c372ef16cb892bffd91163b8b92322abee6be34473b845bc63075072c2c0d5ba805f314afaddade64437f50018cfbd5',
        ],
        rtmr0: [
          '0x00e1dad5455e5fa87974edb69e13296dd1ba9fa86356d70b68be15dd5d36767643904de1893c1b4d47fc8d3a90675391',
          '0x6da49936a0649f6970be5df8bf7ba0d2efb66a96216c11cc65ac348432a07cfaab037b173e22c54d3f10d59327e7fbc9',
          '0xf5cea78565e130d0e2e93429f20d269fa60aaa6bee68dd27afec0f85e3ccb885f4681ba9885b06a2ae8d202f356785a9',
        ],
      };

      const result = expandToSingularRegisters(registers);

      // Should generate 3 x 3 = 9 combinations
      expect(result).toHaveLength(9);

      // Verify all are unique combinations
      const combinations = result.map(r => `${r.mrtd}_${r.rtmr0}`);
      const uniqueCombinations = new Set(combinations);
      expect(uniqueCombinations.size).toBe(9);
    });

    it('should throw ValidationError for empty mrtd array', () => {
      const registers: WorkloadMeasurementRegisters = {
        ...baseRegisters,
        mrtd: [],
        rtmr0: '0x00e1dad5455e5fa87974edb69e13296dd1ba9fa86356d70b68be15dd5d36767643904de1893c1b4d47fc8d3a90675391',
      };

      expect(() => expandToSingularRegisters(registers)).toThrow('mrtd array cannot be empty');
    });

    it('should throw ValidationError for empty rtmr0 array', () => {
      const registers: WorkloadMeasurementRegisters = {
        ...baseRegisters,
        mrtd: '0x47a1cc074b914df8596bad0ed13d50d561ad1effc7f7cc530ab86da7ea49ffc03e57e7da829f8cba9c629c3970505323',
        rtmr0: [],
      };

      expect(() => expandToSingularRegisters(registers)).toThrow('rtmr0 array cannot be empty');
    });

    it('should validate all array elements have correct length', () => {
      const registers: WorkloadMeasurementRegisters = {
        ...baseRegisters,
        mrtd: [
          '0x47a1cc074b914df8596bad0ed13d50d561ad1effc7f7cc530ab86da7ea49ffc03e57e7da829f8cba9c629c3970505323',
          '0xinvalid', // Invalid length
        ],
        rtmr0: '0x00e1dad5455e5fa87974edb69e13296dd1ba9fa86356d70b68be15dd5d36767643904de1893c1b4d47fc8d3a90675391',
      };

      expect(() => expandToSingularRegisters(registers)).toThrow(/Invalid mrtd\[1\]/);
    });

    it('should validate all array elements are hex strings', () => {
      const registers: WorkloadMeasurementRegisters = {
        ...baseRegisters,
        mrtd: [
          '0x47a1cc074b914df8596bad0ed13d50d561ad1effc7f7cc530ab86da7ea49ffc03e57e7da829f8cba9c629c3970505323',
          'invalid',
        ],
        rtmr0: '0x00e1dad5455e5fa87974edb69e13296dd1ba9fa86356d70b68be15dd5d36767643904de1893c1b4d47fc8d3a90675391',
      };

      expect(() => expandToSingularRegisters(registers)).toThrow(/Invalid mrtd\[1\]/);

      const invalidRegisters: WorkloadMeasurementRegisters = {
        ...baseRegisters,
        rtmr0: [
          '0x00e1dad5455e5fa87974edb69e13296dd1ba9fa86356d70b68be15dd5d36767643904de1893c1b4d47fc8d3a90675391',
          'invalid',
        ],
        mrtd: [
          '0x47a1cc074b914df8596bad0ed13d50d561ad1effc7f7cc530ab86da7ea49ffc03e57e7da829f8cba9c629c3970505323',
        ],
      };
      expect(() => expandToSingularRegisters(invalidRegisters)).toThrow(/Invalid rtmr0\[1\]/);
    });
  });

  describe('computeAllWorkloadIds', () => {
    const baseRegisters = {
      tdattributes: '0x0000001000000000',
      xfam: '0xe702060000000000',
      mrconfigid: '0x000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000',
      rtmr1: '0xa7157e7c5f932e9babac9209d4527ec9ed837b8e335a931517677fa746db51ee56062e3324e266e3f39ec26a516f4f71',
      rtmr2: '0xe63560e50830e22fbc9b06cdce8afe784bf111e4251256cf104050f1347cd4ad9f30da408475066575145da0b098a124',
      rtmr3: '0x000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000',
    };

    it('should return single ID for singular registers', () => {
      const registers: WorkloadMeasurementRegisters = {
        ...baseRegisters,
        mrtd: '0x47a1cc074b914df8596bad0ed13d50d561ad1effc7f7cc530ab86da7ea49ffc03e57e7da829f8cba9c629c3970505323',
        rtmr0: '0x00e1dad5455e5fa87974edb69e13296dd1ba9fa86356d70b68be15dd5d36767643904de1893c1b4d47fc8d3a90675391',
      };

      const result = computeAllWorkloadIds(registers);

      expect(result).toHaveLength(1);
      expect(result[0]).toMatch(/^0x[0-9a-f]{64}$/);
    });

    it('should return multiple IDs for array registers', () => {
      const registers: WorkloadMeasurementRegisters = {
        ...baseRegisters,
        mrtd: [
          '0x47a1cc074b914df8596bad0ed13d50d561ad1effc7f7cc530ab86da7ea49ffc03e57e7da829f8cba9c629c3970505323',
          '0x202c7d38558f7cfa086feca5a23d62fa071cceb0bd55dbd06eeb4cebbd3c204c209f5551914d41ce433fb7fd67cc7136',
        ],
        rtmr0: '0x00e1dad5455e5fa87974edb69e13296dd1ba9fa86356d70b68be15dd5d36767643904de1893c1b4d47fc8d3a90675391',
      };

      const result = computeAllWorkloadIds(registers);

      expect(result).toHaveLength(2);
      expect(result[0]).toMatch(/^0x[0-9a-f]{64}$/);
      expect(result[1]).toMatch(/^0x[0-9a-f]{64}$/);
      expect(result[0]).not.toBe(result[1]);
    });

    it('should generate all IDs for cartesian product', () => {
      const registers: WorkloadMeasurementRegisters = {
        ...baseRegisters,
        mrtd: [
          '0x47a1cc074b914df8596bad0ed13d50d561ad1effc7f7cc530ab86da7ea49ffc03e57e7da829f8cba9c629c3970505323',
          '0x202c7d38558f7cfa086feca5a23d62fa071cceb0bd55dbd06eeb4cebbd3c204c209f5551914d41ce433fb7fd67cc7136',
        ],
        rtmr0: [
          '0x00e1dad5455e5fa87974edb69e13296dd1ba9fa86356d70b68be15dd5d36767643904de1893c1b4d47fc8d3a90675391',
          '0x6da49936a0649f6970be5df8bf7ba0d2efb66a96216c11cc65ac348432a07cfaab037b173e22c54d3f10d59327e7fbc9',
        ],
      };

      const result = computeAllWorkloadIds(registers);

      // 2 mrtd × 2 rtmr0 = 4 IDs
      expect(result).toHaveLength(4);

      // All should be valid workload IDs
      result.forEach(id => {
        expect(id).toMatch(/^0x[0-9a-f]{64}$/);
      });

      // All should be unique
      const uniqueIds = new Set(result);
      expect(uniqueIds.size).toBe(4);
    });

    it('should compute deterministic IDs', () => {
      const registers: WorkloadMeasurementRegisters = {
        ...baseRegisters,
        mrtd: [
          '0x47a1cc074b914df8596bad0ed13d50d561ad1effc7f7cc530ab86da7ea49ffc03e57e7da829f8cba9c629c3970505323',
          '0x202c7d38558f7cfa086feca5a23d62fa071cceb0bd55dbd06eeb4cebbd3c204c209f5551914d41ce433fb7fd67cc7136',
        ],
        rtmr0: '0x00e1dad5455e5fa87974edb69e13296dd1ba9fa86356d70b68be15dd5d36767643904de1893c1b4d47fc8d3a90675391',
      };

      const result1 = computeAllWorkloadIds(registers);
      const result2 = computeAllWorkloadIds(registers);

      expect(result1).toEqual(result2);
    });
  });

  describe('matchesAnyWorkloadId', () => {
    const baseRegisters = {
      tdattributes: '0x0000001000000000',
      xfam: '0xe702060000000000',
      mrconfigid: '0x000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000',
      rtmr1: '0xa7157e7c5f932e9babac9209d4527ec9ed837b8e335a931517677fa746db51ee56062e3324e266e3f39ec26a516f4f71',
      rtmr2: '0xe63560e50830e22fbc9b06cdce8afe784bf111e4251256cf104050f1347cd4ad9f30da408475066575145da0b098a124',
      rtmr3: '0x000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000',
    };

    it('should return true when single register matches', () => {
      const registers: WorkloadMeasurementRegisters = {
        ...baseRegisters,
        mrtd: '0x47a1cc074b914df8596bad0ed13d50d561ad1effc7f7cc530ab86da7ea49ffc03e57e7da829f8cba9c629c3970505323',
        rtmr0: '0x00e1dad5455e5fa87974edb69e13296dd1ba9fa86356d70b68be15dd5d36767643904de1893c1b4d47fc8d3a90675391',
      };

      const singularRegisters: SingularWorkloadMeasurementRegisters = {
        ...baseRegisters,
        mrtd: '0x47a1cc074b914df8596bad0ed13d50d561ad1effc7f7cc530ab86da7ea49ffc03e57e7da829f8cba9c629c3970505323',
        rtmr0: '0x00e1dad5455e5fa87974edb69e13296dd1ba9fa86356d70b68be15dd5d36767643904de1893c1b4d47fc8d3a90675391',
      };
      const workloadId = computeWorkloadId(singularRegisters);
      const result = matchesAnyWorkloadId(registers, workloadId);

      expect(result).toBe(true);
    });

    it('should return false when single register does not match', () => {
      const registers: WorkloadMeasurementRegisters = {
        ...baseRegisters,
        mrtd: '0x47a1cc074b914df8596bad0ed13d50d561ad1effc7f7cc530ab86da7ea49ffc03e57e7da829f8cba9c629c3970505323',
        rtmr0: '0x00e1dad5455e5fa87974edb69e13296dd1ba9fa86356d70b68be15dd5d36767643904de1893c1b4d47fc8d3a90675391',
      };

      const result = matchesAnyWorkloadId(registers, '0x0000000000000000000000000000000000000000000000000000000000000000');

      expect(result).toBe(false);
    });

    it('should return true when any array register matches', () => {
      const registers: WorkloadMeasurementRegisters = {
        ...baseRegisters,
        mrtd: [
          '0x47a1cc074b914df8596bad0ed13d50d561ad1effc7f7cc530ab86da7ea49ffc03e57e7da829f8cba9c629c3970505323',
          '0x202c7d38558f7cfa086feca5a23d62fa071cceb0bd55dbd06eeb4cebbd3c204c209f5551914d41ce433fb7fd67cc7136',
        ],
        rtmr0: '0x00e1dad5455e5fa87974edb69e13296dd1ba9fa86356d70b68be15dd5d36767643904de1893c1b4d47fc8d3a90675391',
      };

      const allIds = computeAllWorkloadIds(registers);

      // Should match the first ID
      expect(matchesAnyWorkloadId(registers, allIds[0])).toBe(true);

      // Should match the second ID
      expect(matchesAnyWorkloadId(registers, allIds[1])).toBe(true);
    });

    it('should return false when no array register matches', () => {
      const registers: WorkloadMeasurementRegisters = {
        ...baseRegisters,
        mrtd: [
          '0x47a1cc074b914df8596bad0ed13d50d561ad1effc7f7cc530ab86da7ea49ffc03e57e7da829f8cba9c629c3970505323',
          '0x202c7d38558f7cfa086feca5a23d62fa071cceb0bd55dbd06eeb4cebbd3c204c209f5551914d41ce433fb7fd67cc7136',
        ],
        rtmr0: '0x00e1dad5455e5fa87974edb69e13296dd1ba9fa86356d70b68be15dd5d36767643904de1893c1b4d47fc8d3a90675391',
      };

      const result = matchesAnyWorkloadId(registers, '0x0000000000000000000000000000000000000000000000000000000000000000');

      expect(result).toBe(false);
    });

    it('should handle cartesian product matching', () => {
      const registers: WorkloadMeasurementRegisters = {
        ...baseRegisters,
        mrtd: [
          '0x47a1cc074b914df8596bad0ed13d50d561ad1effc7f7cc530ab86da7ea49ffc03e57e7da829f8cba9c629c3970505323',
          '0x202c7d38558f7cfa086feca5a23d62fa071cceb0bd55dbd06eeb4cebbd3c204c209f5551914d41ce433fb7fd67cc7136',
        ],
        rtmr0: [
          '0x00e1dad5455e5fa87974edb69e13296dd1ba9fa86356d70b68be15dd5d36767643904de1893c1b4d47fc8d3a90675391',
          '0x6da49936a0649f6970be5df8bf7ba0d2efb66a96216c11cc65ac348432a07cfaab037b173e22c54d3f10d59327e7fbc9',
        ],
      };

      const allIds = computeAllWorkloadIds(registers);

      // Should match all 4 combinations
      allIds.forEach(id => {
        expect(matchesAnyWorkloadId(registers, id)).toBe(true);
      });

      // Should not match a random ID
      expect(matchesAnyWorkloadId(registers, '0x0000000000000000000000000000000000000000000000000000000000000000')).toBe(false);
    });
  });

  describe('validation edge cases', () => {
    const baseRegisters = {
      tdattributes: '0x0000001000000000',
      xfam: '0xe702060000000000',
      mrconfigid: '0x000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000',
      rtmr1: '0xa7157e7c5f932e9babac9209d4527ec9ed837b8e335a931517677fa746db51ee56062e3324e266e3f39ec26a516f4f71',
      rtmr2: '0xe63560e50830e22fbc9b06cdce8afe784bf111e4251256cf104050f1347cd4ad9f30da408475066575145da0b098a124',
      rtmr3: '0x000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000',
    };

    it('should reject computeWorkloadId with array mrtd', () => {
      const registers = {
        ...baseRegisters,
        mrtd: [
          '0x47a1cc074b914df8596bad0ed13d50d561ad1effc7f7cc530ab86da7ea49ffc03e57e7da829f8cba9c629c3970505323',
        ],
        rtmr0: '0x00e1dad5455e5fa87974edb69e13296dd1ba9fa86356d70b68be15dd5d36767643904de1893c1b4d47fc8d3a90675391',
      } as any; // Cast to bypass TypeScript check for runtime validation test

      expect(() => computeWorkloadId(registers)).toThrow('mrtd must be a single value, not an array');
    });

    it('should reject computeWorkloadId with array rtmr0', () => {
      const registers = {
        ...baseRegisters,
        mrtd: '0x47a1cc074b914df8596bad0ed13d50d561ad1effc7f7cc530ab86da7ea49ffc03e57e7da829f8cba9c629c3970505323',
        rtmr0: [
          '0x00e1dad5455e5fa87974edb69e13296dd1ba9fa86356d70b68be15dd5d36767643904de1893c1b4d47fc8d3a90675391',
        ],
      } as any; // Cast to bypass TypeScript check for runtime validation test

      expect(() => computeWorkloadId(registers)).toThrow('rtmr0 must be a single value, not an array');
    });

    it('should validate mixed case hex in arrays', () => {
      const registers: WorkloadMeasurementRegisters = {
        ...baseRegisters,
        mrtd: [
          '0x47A1CC074B914DF8596BAD0ED13D50D561AD1EFFC7F7CC530AB86DA7EA49FFC03E57E7DA829F8CBA9C629C3970505323',
          '0x202c7d38558f7cfa086feca5a23d62fa071cceb0bd55dbd06eeb4cebbd3c204c209f5551914d41ce433fb7fd67cc7136',
        ],
        rtmr0: '0x00e1dad5455e5fa87974edb69e13296dd1ba9fa86356d70b68be15dd5d36767643904de1893c1b4d47fc8d3a90675391',
      };

      // Should not throw - mixed case is valid hex
      expect(() => expandToSingularRegisters(registers)).not.toThrow();
    });
  });
});
