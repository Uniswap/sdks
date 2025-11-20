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
      const registers: SingularWorkloadMeasurementRegisters = {
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
      const registers: SingularWorkloadMeasurementRegisters = {
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

  describe('expandToSingularRegisters', () => {
    const baseRegisters = {
      tdAttributes: '0x0000001000000000' as `0x${string}`,
      xFAM: '0xe702060000000000' as `0x${string}`,
      mrConfigId: '0x000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000' as `0x${string}`,
      rtMr1: '0xa7157e7c5f932e9babac9209d4527ec9ed837b8e335a931517677fa746db51ee56062e3324e266e3f39ec26a516f4f71' as `0x${string}`,
      rtMr2: '0xe63560e50830e22fbc9b06cdce8afe784bf111e4251256cf104050f1347cd4ad9f30da408475066575145da0b098a124' as `0x${string}`,
      rtMr3: '0x000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000' as `0x${string}`,
    };

    it('should return single register when both mrTd and rtMr0 are single values', () => {
      const registers: WorkloadMeasurementRegisters = {
        ...baseRegisters,
        mrTd: '0x47a1cc074b914df8596bad0ed13d50d561ad1effc7f7cc530ab86da7ea49ffc03e57e7da829f8cba9c629c3970505323',
        rtMr0: '0x00e1dad5455e5fa87974edb69e13296dd1ba9fa86356d70b68be15dd5d36767643904de1893c1b4d47fc8d3a90675391',
      };

      const result = expandToSingularRegisters(registers);

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        ...baseRegisters,
        mrTd: registers.mrTd,
        rtMr0: registers.rtMr0,
      });
    });

    it('should expand mrTd array with single rtMr0', () => {
      const registers: WorkloadMeasurementRegisters = {
        ...baseRegisters,
        mrTd: [
          '0x47a1cc074b914df8596bad0ed13d50d561ad1effc7f7cc530ab86da7ea49ffc03e57e7da829f8cba9c629c3970505323',
          '0x202c7d38558f7cfa086feca5a23d62fa071cceb0bd55dbd06eeb4cebbd3c204c209f5551914d41ce433fb7fd67cc7136',
        ],
        rtMr0: '0x00e1dad5455e5fa87974edb69e13296dd1ba9fa86356d70b68be15dd5d36767643904de1893c1b4d47fc8d3a90675391',
      };

      const result = expandToSingularRegisters(registers);

      expect(result).toHaveLength(2);
      expect(result[0].mrTd).toBe(registers.mrTd[0]);
      expect(result[0].rtMr0).toBe(registers.rtMr0);
      expect(result[1].mrTd).toBe(registers.mrTd[1]);
      expect(result[1].rtMr0).toBe(registers.rtMr0);
    });

    it('should expand rtMr0 array with single mrTd', () => {
      const registers: WorkloadMeasurementRegisters = {
        ...baseRegisters,
        mrTd: '0x47a1cc074b914df8596bad0ed13d50d561ad1effc7f7cc530ab86da7ea49ffc03e57e7da829f8cba9c629c3970505323',
        rtMr0: [
          '0x00e1dad5455e5fa87974edb69e13296dd1ba9fa86356d70b68be15dd5d36767643904de1893c1b4d47fc8d3a90675391',
          '0x6da49936a0649f6970be5df8bf7ba0d2efb66a96216c11cc65ac348432a07cfaab037b173e22c54d3f10d59327e7fbc9',
        ],
      };

      const result = expandToSingularRegisters(registers);

      expect(result).toHaveLength(2);
      expect(result[0].mrTd).toBe(registers.mrTd);
      expect(result[0].rtMr0).toBe(registers.rtMr0[0]);
      expect(result[1].mrTd).toBe(registers.mrTd);
      expect(result[1].rtMr0).toBe(registers.rtMr0[1]);
    });

    it('should generate cartesian product when both mrTd and rtMr0 are arrays', () => {
      const registers: WorkloadMeasurementRegisters = {
        ...baseRegisters,
        mrTd: [
          '0x47a1cc074b914df8596bad0ed13d50d561ad1effc7f7cc530ab86da7ea49ffc03e57e7da829f8cba9c629c3970505323',
          '0x202c7d38558f7cfa086feca5a23d62fa071cceb0bd55dbd06eeb4cebbd3c204c209f5551914d41ce433fb7fd67cc7136',
        ],
        rtMr0: [
          '0x00e1dad5455e5fa87974edb69e13296dd1ba9fa86356d70b68be15dd5d36767643904de1893c1b4d47fc8d3a90675391',
          '0x6da49936a0649f6970be5df8bf7ba0d2efb66a96216c11cc65ac348432a07cfaab037b173e22c54d3f10d59327e7fbc9',
        ],
      };

      const result = expandToSingularRegisters(registers);

      // Should generate 2 x 2 = 4 combinations
      expect(result).toHaveLength(4);

      // Verify all combinations exist (mrTd[0], rtMr0[0])
      expect(result[0].mrTd).toBe(registers.mrTd[0]);
      expect(result[0].rtMr0).toBe(registers.rtMr0[0]);

      // (mrTd[0], rtMr0[1])
      expect(result[1].mrTd).toBe(registers.mrTd[0]);
      expect(result[1].rtMr0).toBe(registers.rtMr0[1]);

      // (mrTd[1], rtMr0[0])
      expect(result[2].mrTd).toBe(registers.mrTd[1]);
      expect(result[2].rtMr0).toBe(registers.rtMr0[0]);

      // (mrTd[1], rtMr0[1])
      expect(result[3].mrTd).toBe(registers.mrTd[1]);
      expect(result[3].rtMr0).toBe(registers.rtMr0[1]);

      // Verify all combinations have correct base fields
      result.forEach(singular => {
        expect(singular.tdAttributes).toBe(baseRegisters.tdAttributes);
        expect(singular.xFAM).toBe(baseRegisters.xFAM);
        expect(singular.rtMr1).toBe(baseRegisters.rtMr1);
      });
    });

    it('should handle large cartesian products (3x3)', () => {
      const registers: WorkloadMeasurementRegisters = {
        ...baseRegisters,
        mrTd: [
          '0x47a1cc074b914df8596bad0ed13d50d561ad1effc7f7cc530ab86da7ea49ffc03e57e7da829f8cba9c629c3970505323',
          '0x202c7d38558f7cfa086feca5a23d62fa071cceb0bd55dbd06eeb4cebbd3c204c209f5551914d41ce433fb7fd67cc7136',
          '0x3c372ef16cb892bffd91163b8b92322abee6be34473b845bc63075072c2c0d5ba805f314afaddade64437f50018cfbd5',
        ],
        rtMr0: [
          '0x00e1dad5455e5fa87974edb69e13296dd1ba9fa86356d70b68be15dd5d36767643904de1893c1b4d47fc8d3a90675391',
          '0x6da49936a0649f6970be5df8bf7ba0d2efb66a96216c11cc65ac348432a07cfaab037b173e22c54d3f10d59327e7fbc9',
          '0xf5cea78565e130d0e2e93429f20d269fa60aaa6bee68dd27afec0f85e3ccb885f4681ba9885b06a2ae8d202f356785a9',
        ],
      };

      const result = expandToSingularRegisters(registers);

      // Should generate 3 x 3 = 9 combinations
      expect(result).toHaveLength(9);

      // Verify all are unique combinations
      const combinations = result.map(r => `${r.mrTd}_${r.rtMr0}`);
      const uniqueCombinations = new Set(combinations);
      expect(uniqueCombinations.size).toBe(9);
    });

    it('should throw ValidationError for empty mrTd array', () => {
      const registers: WorkloadMeasurementRegisters = {
        ...baseRegisters,
        mrTd: [],
        rtMr0: '0x00e1dad5455e5fa87974edb69e13296dd1ba9fa86356d70b68be15dd5d36767643904de1893c1b4d47fc8d3a90675391',
      };

      expect(() => expandToSingularRegisters(registers)).toThrow('mrTd array cannot be empty');
    });

    it('should throw ValidationError for empty rtMr0 array', () => {
      const registers: WorkloadMeasurementRegisters = {
        ...baseRegisters,
        mrTd: '0x47a1cc074b914df8596bad0ed13d50d561ad1effc7f7cc530ab86da7ea49ffc03e57e7da829f8cba9c629c3970505323',
        rtMr0: [],
      };

      expect(() => expandToSingularRegisters(registers)).toThrow('rtMr0 array cannot be empty');
    });

    it('should validate all array elements have correct length', () => {
      const registers: WorkloadMeasurementRegisters = {
        ...baseRegisters,
        mrTd: [
          '0x47a1cc074b914df8596bad0ed13d50d561ad1effc7f7cc530ab86da7ea49ffc03e57e7da829f8cba9c629c3970505323',
          '0xinvalid', // Invalid length
        ],
        rtMr0: '0x00e1dad5455e5fa87974edb69e13296dd1ba9fa86356d70b68be15dd5d36767643904de1893c1b4d47fc8d3a90675391',
      };

      expect(() => expandToSingularRegisters(registers)).toThrow(/Invalid mrTd\[1\]/);
    });

    it('should validate all array elements are hex strings', () => {
      const registers: WorkloadMeasurementRegisters = {
        ...baseRegisters,
        mrTd: [
          '0x47a1cc074b914df8596bad0ed13d50d561ad1effc7f7cc530ab86da7ea49ffc03e57e7da829f8cba9c629c3970505323',
          'invalid' as `0x${string}`,
        ],
        rtMr0: '0x00e1dad5455e5fa87974edb69e13296dd1ba9fa86356d70b68be15dd5d36767643904de1893c1b4d47fc8d3a90675391',
      };

      expect(() => expandToSingularRegisters(registers)).toThrow(/Invalid mrTd\[1\]/);

      const invalidRegisters: WorkloadMeasurementRegisters = {
        ...baseRegisters,
        rtMr0: [
          '0x00e1dad5455e5fa87974edb69e13296dd1ba9fa86356d70b68be15dd5d36767643904de1893c1b4d47fc8d3a90675391',
          'invalid' as `0x${string}`,
        ],
        mrTd: [
          '0x47a1cc074b914df8596bad0ed13d50d561ad1effc7f7cc530ab86da7ea49ffc03e57e7da829f8cba9c629c3970505323',
        ],
      };
      expect(() => expandToSingularRegisters(invalidRegisters)).toThrow(/Invalid rtMr0\[1\]/);
    });
  });

  describe('computeAllWorkloadIds', () => {
    const baseRegisters = {
      tdAttributes: '0x0000001000000000' as `0x${string}`,
      xFAM: '0xe702060000000000' as `0x${string}`,
      mrConfigId: '0x000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000' as `0x${string}`,
      rtMr1: '0xa7157e7c5f932e9babac9209d4527ec9ed837b8e335a931517677fa746db51ee56062e3324e266e3f39ec26a516f4f71' as `0x${string}`,
      rtMr2: '0xe63560e50830e22fbc9b06cdce8afe784bf111e4251256cf104050f1347cd4ad9f30da408475066575145da0b098a124' as `0x${string}`,
      rtMr3: '0x000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000' as `0x${string}`,
    };

    it('should return single ID for singular registers', () => {
      const registers: WorkloadMeasurementRegisters = {
        ...baseRegisters,
        mrTd: '0x47a1cc074b914df8596bad0ed13d50d561ad1effc7f7cc530ab86da7ea49ffc03e57e7da829f8cba9c629c3970505323',
        rtMr0: '0x00e1dad5455e5fa87974edb69e13296dd1ba9fa86356d70b68be15dd5d36767643904de1893c1b4d47fc8d3a90675391',
      };

      const result = computeAllWorkloadIds(registers);

      expect(result).toHaveLength(1);
      expect(result[0]).toMatch(/^0x[0-9a-f]{64}$/);
    });

    it('should return multiple IDs for array registers', () => {
      const registers: WorkloadMeasurementRegisters = {
        ...baseRegisters,
        mrTd: [
          '0x47a1cc074b914df8596bad0ed13d50d561ad1effc7f7cc530ab86da7ea49ffc03e57e7da829f8cba9c629c3970505323',
          '0x202c7d38558f7cfa086feca5a23d62fa071cceb0bd55dbd06eeb4cebbd3c204c209f5551914d41ce433fb7fd67cc7136',
        ],
        rtMr0: '0x00e1dad5455e5fa87974edb69e13296dd1ba9fa86356d70b68be15dd5d36767643904de1893c1b4d47fc8d3a90675391',
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
        mrTd: [
          '0x47a1cc074b914df8596bad0ed13d50d561ad1effc7f7cc530ab86da7ea49ffc03e57e7da829f8cba9c629c3970505323',
          '0x202c7d38558f7cfa086feca5a23d62fa071cceb0bd55dbd06eeb4cebbd3c204c209f5551914d41ce433fb7fd67cc7136',
        ],
        rtMr0: [
          '0x00e1dad5455e5fa87974edb69e13296dd1ba9fa86356d70b68be15dd5d36767643904de1893c1b4d47fc8d3a90675391',
          '0x6da49936a0649f6970be5df8bf7ba0d2efb66a96216c11cc65ac348432a07cfaab037b173e22c54d3f10d59327e7fbc9',
        ],
      };

      const result = computeAllWorkloadIds(registers);

      // 2 mrTd × 2 rtMr0 = 4 IDs
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
        mrTd: [
          '0x47a1cc074b914df8596bad0ed13d50d561ad1effc7f7cc530ab86da7ea49ffc03e57e7da829f8cba9c629c3970505323',
          '0x202c7d38558f7cfa086feca5a23d62fa071cceb0bd55dbd06eeb4cebbd3c204c209f5551914d41ce433fb7fd67cc7136',
        ],
        rtMr0: '0x00e1dad5455e5fa87974edb69e13296dd1ba9fa86356d70b68be15dd5d36767643904de1893c1b4d47fc8d3a90675391',
      };

      const result1 = computeAllWorkloadIds(registers);
      const result2 = computeAllWorkloadIds(registers);

      expect(result1).toEqual(result2);
    });
  });

  describe('matchesAnyWorkloadId', () => {
    const baseRegisters = {
      tdAttributes: '0x0000001000000000' as `0x${string}`,
      xFAM: '0xe702060000000000' as `0x${string}`,
      mrConfigId: '0x000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000' as `0x${string}`,
      rtMr1: '0xa7157e7c5f932e9babac9209d4527ec9ed837b8e335a931517677fa746db51ee56062e3324e266e3f39ec26a516f4f71' as `0x${string}`,
      rtMr2: '0xe63560e50830e22fbc9b06cdce8afe784bf111e4251256cf104050f1347cd4ad9f30da408475066575145da0b098a124' as `0x${string}`,
      rtMr3: '0x000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000' as `0x${string}`,
    };

    it('should return true when single register matches', () => {
      const registers: WorkloadMeasurementRegisters = {
        ...baseRegisters,
        mrTd: '0x47a1cc074b914df8596bad0ed13d50d561ad1effc7f7cc530ab86da7ea49ffc03e57e7da829f8cba9c629c3970505323' as `0x${string}`,
        rtMr0: '0x00e1dad5455e5fa87974edb69e13296dd1ba9fa86356d70b68be15dd5d36767643904de1893c1b4d47fc8d3a90675391' as `0x${string}`,
      };

      const singularRegisters: SingularWorkloadMeasurementRegisters = {
        ...baseRegisters,
        mrTd: '0x47a1cc074b914df8596bad0ed13d50d561ad1effc7f7cc530ab86da7ea49ffc03e57e7da829f8cba9c629c3970505323' as `0x${string}`,
        rtMr0: '0x00e1dad5455e5fa87974edb69e13296dd1ba9fa86356d70b68be15dd5d36767643904de1893c1b4d47fc8d3a90675391' as `0x${string}`,
      };
      const workloadId = computeWorkloadId(singularRegisters);
      const result = matchesAnyWorkloadId(registers, workloadId);

      expect(result).toBe(true);
    });

    it('should return false when single register does not match', () => {
      const registers: WorkloadMeasurementRegisters = {
        ...baseRegisters,
        mrTd: '0x47a1cc074b914df8596bad0ed13d50d561ad1effc7f7cc530ab86da7ea49ffc03e57e7da829f8cba9c629c3970505323',
        rtMr0: '0x00e1dad5455e5fa87974edb69e13296dd1ba9fa86356d70b68be15dd5d36767643904de1893c1b4d47fc8d3a90675391',
      };

      const result = matchesAnyWorkloadId(registers, '0x0000000000000000000000000000000000000000000000000000000000000000');

      expect(result).toBe(false);
    });

    it('should return true when any array register matches', () => {
      const registers: WorkloadMeasurementRegisters = {
        ...baseRegisters,
        mrTd: [
          '0x47a1cc074b914df8596bad0ed13d50d561ad1effc7f7cc530ab86da7ea49ffc03e57e7da829f8cba9c629c3970505323',
          '0x202c7d38558f7cfa086feca5a23d62fa071cceb0bd55dbd06eeb4cebbd3c204c209f5551914d41ce433fb7fd67cc7136',
        ],
        rtMr0: '0x00e1dad5455e5fa87974edb69e13296dd1ba9fa86356d70b68be15dd5d36767643904de1893c1b4d47fc8d3a90675391',
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
        mrTd: [
          '0x47a1cc074b914df8596bad0ed13d50d561ad1effc7f7cc530ab86da7ea49ffc03e57e7da829f8cba9c629c3970505323',
          '0x202c7d38558f7cfa086feca5a23d62fa071cceb0bd55dbd06eeb4cebbd3c204c209f5551914d41ce433fb7fd67cc7136',
        ],
        rtMr0: '0x00e1dad5455e5fa87974edb69e13296dd1ba9fa86356d70b68be15dd5d36767643904de1893c1b4d47fc8d3a90675391',
      };

      const result = matchesAnyWorkloadId(registers, '0x0000000000000000000000000000000000000000000000000000000000000000');

      expect(result).toBe(false);
    });

    it('should handle cartesian product matching', () => {
      const registers: WorkloadMeasurementRegisters = {
        ...baseRegisters,
        mrTd: [
          '0x47a1cc074b914df8596bad0ed13d50d561ad1effc7f7cc530ab86da7ea49ffc03e57e7da829f8cba9c629c3970505323',
          '0x202c7d38558f7cfa086feca5a23d62fa071cceb0bd55dbd06eeb4cebbd3c204c209f5551914d41ce433fb7fd67cc7136',
        ],
        rtMr0: [
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
      tdAttributes: '0x0000001000000000' as `0x${string}`,
      xFAM: '0xe702060000000000' as `0x${string}`,
      mrConfigId: '0x000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000' as `0x${string}`,
      rtMr1: '0xa7157e7c5f932e9babac9209d4527ec9ed837b8e335a931517677fa746db51ee56062e3324e266e3f39ec26a516f4f71' as `0x${string}`,
      rtMr2: '0xe63560e50830e22fbc9b06cdce8afe784bf111e4251256cf104050f1347cd4ad9f30da408475066575145da0b098a124' as `0x${string}`,
      rtMr3: '0x000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000' as `0x${string}`,
    };

    it('should reject computeWorkloadId with array mrTd', () => {
      const registers = {
        ...baseRegisters,
        mrTd: [
          '0x47a1cc074b914df8596bad0ed13d50d561ad1effc7f7cc530ab86da7ea49ffc03e57e7da829f8cba9c629c3970505323',
        ],
        rtMr0: '0x00e1dad5455e5fa87974edb69e13296dd1ba9fa86356d70b68be15dd5d36767643904de1893c1b4d47fc8d3a90675391',
      } as any; // Cast to bypass TypeScript check for runtime validation test

      expect(() => computeWorkloadId(registers)).toThrow('mrTd must be a single value, not an array');
    });

    it('should reject computeWorkloadId with array rtMr0', () => {
      const registers = {
        ...baseRegisters,
        mrTd: '0x47a1cc074b914df8596bad0ed13d50d561ad1effc7f7cc530ab86da7ea49ffc03e57e7da829f8cba9c629c3970505323',
        rtMr0: [
          '0x00e1dad5455e5fa87974edb69e13296dd1ba9fa86356d70b68be15dd5d36767643904de1893c1b4d47fc8d3a90675391',
        ],
      } as any; // Cast to bypass TypeScript check for runtime validation test

      expect(() => computeWorkloadId(registers)).toThrow('rtMr0 must be a single value, not an array');
    });

    it('should validate mixed case hex in arrays', () => {
      const registers: WorkloadMeasurementRegisters = {
        ...baseRegisters,
        mrTd: [
          '0x47A1CC074B914DF8596BAD0ED13D50D561AD1EFFC7F7CC530AB86DA7EA49FFC03E57E7DA829F8CBA9C629C3970505323' as `0x${string}`,
          '0x202c7d38558f7cfa086feca5a23d62fa071cceb0bd55dbd06eeb4cebbd3c204c209f5551914d41ce433fb7fd67cc7136' as `0x${string}`,
        ],
        rtMr0: '0x00e1dad5455e5fa87974edb69e13296dd1ba9fa86356d70b68be15dd5d36767643904de1893c1b4d47fc8d3a90675391' as `0x${string}`,
      };

      // Should not throw - mixed case is valid hex
      expect(() => expandToSingularRegisters(registers)).not.toThrow();
    });
  });
});
