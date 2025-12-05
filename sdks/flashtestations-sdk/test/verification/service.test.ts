import * as chainsModule from '../../src/config/chains';
import * as workloadModule from '../../src/crypto/workload';
import * as rpcClientModule from '../../src/rpc/client';
import {
  BlockNotFoundError,
  NetworkError,
  WorkloadMeasurementRegisters,
} from '../../src/types';
import { verifyFlashtestationInBlock } from '../../src/verification/service';

describe('verifyFlashtestationInBlock', () => {
  let mockgetFlashtestationEvent: jest.Mock;
  let mockGetBlock: jest.Mock;
  let mockRpcClientConstructor: jest.SpyInstance;
  let mockComputeAllWorkloadIds: jest.SpyInstance;
  let mockGetBlockExplorerUrl: jest.SpyInstance;

  beforeEach(() => {
    // Setup mocks
    mockgetFlashtestationEvent = jest.fn();
    mockGetBlock = jest.fn();

    // Mock RpcClient constructor
    mockRpcClientConstructor = jest
      .spyOn(rpcClientModule, 'RpcClient')
      .mockImplementation(
        () =>
        ({
          getFlashtestationEvent: mockgetFlashtestationEvent,
          getBlock: mockGetBlock,
        } as any)
      );

    // Mock crypto functions
    mockComputeAllWorkloadIds = jest.spyOn(workloadModule, 'computeAllWorkloadIds');

    // Mock chain config functions
    mockGetBlockExplorerUrl = jest
      .spyOn(chainsModule, 'getBlockExplorerUrl')
      .mockReturnValue('https://sepolia.uniscan.xyz');
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('with workload ID string', () => {
    const workloadId = '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890';
    const config = { chainId: 1301, rpcUrl: 'https://test-rpc.example.com' };

    it('should return isBuiltByExpectedTee: true when workload ID matches', async () => {
      const mockEvent = {
        caller: '0xbuilder123',
        workloadId: workloadId,
        version: 1,
        blockContentHash: '0xblockhash' as `0x${string}`,
        commitHash: 'abc123def456',
        sourceLocators: ['https://github.com/flashbots/flashbots-images/commit/b7c707667393cc4c0173786ee32ec3a79009b04f'],
      };

      const mockBlock = {
        number: BigInt(12345),
        hash: '0xblockhash',
      };

      mockgetFlashtestationEvent.mockResolvedValue(mockEvent);
      mockGetBlock.mockResolvedValue(mockBlock);

      const result = await verifyFlashtestationInBlock(
        workloadId,
        'latest',
        config
      );

      expect(result).toEqual({
        isBuiltByExpectedTee: true,
        blockExplorerLink: 'https://sepolia.uniscan.xyz/block/12345',
        workloadMetadata: {
          workloadId: workloadId,
          commitHash: 'abc123def456',
          builderAddress: '0xbuilder123',
          version: 1,
          sourceLocators: ['https://github.com/flashbots/flashbots-images/commit/b7c707667393cc4c0173786ee32ec3a79009b04f'],
        },
      });

      expect(mockgetFlashtestationEvent).toHaveBeenCalledWith('latest');
      expect(mockGetBlock).toHaveBeenCalledWith('latest');
    });

    it('should normalize workload ID with 0x prefix', async () => {
      const workloadIdWithoutPrefix = 'abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890';
      const mockEvent = {
        caller: '0xbuilder123',
        workloadId: '0x' + workloadIdWithoutPrefix,
        version: 1,
        blockContentHash: '0xblockhash' as `0x${string}`,
        commitHash: 'abc123def456',
        sourceLocators: ['https://github.com/flashbots/flashbots-images/commit/b7c707667393cc4c0173786ee32ec3a79009b04f'],
      };

      const mockBlock = {
        number: BigInt(12345),
        hash: '0xblockhash',
      };

      mockgetFlashtestationEvent.mockResolvedValue(mockEvent);
      mockGetBlock.mockResolvedValue(mockBlock);

      const result = await verifyFlashtestationInBlock(
        workloadIdWithoutPrefix,
        'latest',
        config
      );

      expect(result.isBuiltByExpectedTee).toBe(true);
    });

    it('should handle case-insensitive workload ID comparison', async () => {
      const workloadIdUpperCase = '0xABCDEF1234567890ABCDEF1234567890ABCDEF1234567890ABCDEF1234567890';
      const mockEvent = {
        caller: '0xbuilder123',
        workloadId: workloadIdUpperCase.toLowerCase(),
        version: 1,
        blockContentHash: '0xblockhash' as `0x${string}`,
        commitHash: 'abc123def456',
        sourceLocators: ['https://github.com/flashbots/flashbots-images/commit/b7c707667393cc4c0173786ee32ec3a79009b04f'],
      };

      const mockBlock = {
        number: BigInt(12345),
        hash: '0xblockhash',
      };

      mockgetFlashtestationEvent.mockResolvedValue(mockEvent);
      mockGetBlock.mockResolvedValue(mockBlock);

      const result = await verifyFlashtestationInBlock(
        workloadIdUpperCase,
        'latest',
        config
      );

      expect(result.isBuiltByExpectedTee).toBe(true);
    });

    it('should return isBuiltByExpectedTee: false when no flashtestation transaction found', async () => {
      mockgetFlashtestationEvent.mockResolvedValue(null);

      const result = await verifyFlashtestationInBlock(
        workloadId,
        'latest',
        config
      );

      expect(result).toEqual({
        isBuiltByExpectedTee: false,
        blockExplorerLink: null,
        workloadMetadata: null,
      });

      expect(mockgetFlashtestationEvent).toHaveBeenCalledWith('latest');
      expect(mockGetBlock).not.toHaveBeenCalled();
    });

    it('should return isBuiltByExpectedTee: false when workload ID does not match', async () => {
      const differentWorkloadId = '0x1111111111111111111111111111111111111111111111111111111111111111';
      const mockEvent = {
        caller: '0xbuilder123',
        workloadId: differentWorkloadId,
        version: 1,
        blockContentHash: '0xblockhash' as `0x${string}`,
        commitHash: 'abc123def456',
        sourceLocators: ['https://github.com/flashbots/flashbots-images/commit/b7c707667393cc4c0173786ee32ec3a79009b04f'],

      };

      const mockBlock = {
        number: BigInt(12345),
        hash: '0xblockhash',
      };

      mockgetFlashtestationEvent.mockResolvedValue(mockEvent);
      mockGetBlock.mockResolvedValue(mockBlock);

      const result = await verifyFlashtestationInBlock(
        workloadId,
        'latest',
        config
      );

      expect(result).toEqual({
        isBuiltByExpectedTee: false,
        blockExplorerLink: 'https://sepolia.uniscan.xyz/block/12345',
        workloadMetadata: {
          workloadId: differentWorkloadId,
          commitHash: 'abc123def456',
          builderAddress: '0xbuilder123',
          version: 1,
          sourceLocators: ['https://github.com/flashbots/flashbots-images/commit/b7c707667393cc4c0173786ee32ec3a79009b04f'],
        },
      });

      expect(mockgetFlashtestationEvent).toHaveBeenCalledWith('latest');
      expect(mockGetBlock).toHaveBeenCalledWith('latest');
    });

    it('should handle null block explorer URL', async () => {
      mockGetBlockExplorerUrl.mockReturnValue('');

      const mockEvent = {
        caller: '0xbuilder123',
        workloadId: workloadId,
        version: 1,
        blockContentHash: '0xblockhash' as `0x${string}`,
        commitHash: 'abc123def456',
      };

      const mockBlock = {
        number: BigInt(12345),
        hash: '0xblockhash',
      };

      mockgetFlashtestationEvent.mockResolvedValue(mockEvent);
      mockGetBlock.mockResolvedValue(mockBlock);

      const result = await verifyFlashtestationInBlock(
        workloadId,
        'latest',
        config
      );

      expect(result.blockExplorerLink).toBeNull();
    });

    it('should work with different block parameters', async () => {
      const mockEvent = {
        caller: '0xbuilder123',
        workloadId: workloadId,
        version: 1,
        blockContentHash: '0xblockhash' as `0x${string}`,
        commitHash: 'abc123def456',
      };

      const mockBlock = {
        number: BigInt(54321),
        hash: '0xblockhash',
      };

      mockgetFlashtestationEvent.mockResolvedValue(mockEvent);
      mockGetBlock.mockResolvedValue(mockBlock);

      // Test with block number
      await verifyFlashtestationInBlock(workloadId, 54321, config);
      expect(mockgetFlashtestationEvent).toHaveBeenCalledWith(54321);

      // Test with finalized tag
      await verifyFlashtestationInBlock(workloadId, 'finalized', config);
      expect(mockgetFlashtestationEvent).toHaveBeenCalledWith('finalized');

      // Test with hex block number
      await verifyFlashtestationInBlock(workloadId, '0xd431', config);
      expect(mockgetFlashtestationEvent).toHaveBeenCalledWith('0xd431');
    });

    it('should propagate BlockNotFoundError', async () => {
      mockgetFlashtestationEvent.mockRejectedValue(
        new BlockNotFoundError('latest')
      );

      await expect(
        verifyFlashtestationInBlock(workloadId, 'latest', config)
      ).rejects.toThrow(BlockNotFoundError);
    });

    it('should propagate NetworkError', async () => {
      mockgetFlashtestationEvent.mockRejectedValue(
        new NetworkError('Connection failed')
      );

      await expect(
        verifyFlashtestationInBlock(workloadId, 'latest', config)
      ).rejects.toThrow(NetworkError);
    });
  });

  describe('with WorkloadMeasurementRegisters', () => {
    const registers: WorkloadMeasurementRegisters = {
      tdattributes: '0x0000001000000000',
      xfam: '0xe702060000000000',
      mrtd: '0x47a1cc074b914df8596bad0ed13d50d561ad1effc7f7cc530ab86da7ea49ffc03e57e7da829f8cba9c629c3970505323',
      mrconfigid: '0x000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000',
      rtmr0: '0x00e1dad5455e5fa87974edb69e13296dd1ba9fa86356d70b68be15dd5d36767643904de1893c1b4d47fc8d3a90675391',
      rtmr1: '0xa7157e7c5f932e9babac9209d4527ec9ed837b8e335a931517677fa746db51ee56062e3324e266e3f39ec26a516f4f71',
      rtmr2: '0xe63560e50830e22fbc9b06cdce8afe784bf111e4251256cf104050f1347cd4ad9f30da408475066575145da0b098a124',
      rtmr3: '0x000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000',
    };

    const computedWorkloadId = '0xf724e7d117f5655cf33beefdfc7d31e930278fcb65cf6d1de632595e97ca82b2';

    const config = { chainId: 1301 };

    it('should compute workload ID from registers and verify', async () => {
      const mockEvent = {
        caller: '0xbuilder456',
        workloadId: computedWorkloadId,
        version: 1,
        blockContentHash: '0xblockhash' as `0x${string}`,
        commitHash: 'register-commit',
        sourceLocators: ['https://github.com/flashbots/flashbots-images/commit/b7c707667393cc4c0173786ee32ec3a79009b04f'],
      };

      const mockBlock = {
        number: BigInt(99999),
        hash: '0xblockhash',
      };

      mockComputeAllWorkloadIds.mockReturnValue([computedWorkloadId]);
      mockgetFlashtestationEvent.mockResolvedValue(mockEvent);
      mockGetBlock.mockResolvedValue(mockBlock);

      const result = await verifyFlashtestationInBlock(
        registers,
        'latest',
        config
      );

      expect(mockComputeAllWorkloadIds).toHaveBeenCalledWith(registers);
      expect(result).toEqual({
        isBuiltByExpectedTee: true,
        blockExplorerLink: 'https://sepolia.uniscan.xyz/block/99999',
        workloadMetadata: {
          workloadId: computedWorkloadId,
          commitHash: 'register-commit',
          builderAddress: '0xbuilder456',
          version: 1,
          sourceLocators: ['https://github.com/flashbots/flashbots-images/commit/b7c707667393cc4c0173786ee32ec3a79009b04f'],
        },
      });
    });

    it('should compute workload ID from registers and verify when registers have a different case', async () => {
      const uppercaseRegisters: WorkloadMeasurementRegisters = {
        tdattributes: `0x${registers.tdattributes.substring(2).toUpperCase()}`,
        xfam: `0x${registers.xfam.substring(2).toUpperCase()}`,
        mrtd: `0x${registers.mrtd.substring(2).toUpperCase()}`,
        mrconfigid: `0x${registers.mrconfigid.substring(2).toUpperCase()}`,
        rtmr0: `0x${registers.rtmr0.substring(2).toUpperCase()}`,
        rtmr1: `0x${registers.rtmr1.substring(2).toUpperCase()}`,
        rtmr2: `0x${registers.rtmr2.substring(2).toUpperCase()}`,
        rtmr3: `0x${registers.rtmr3.substring(2).toUpperCase()}`,
      };

      const mockEvent = {
        caller: '0xbuilder456',
        workloadId: computedWorkloadId, // same workload ID as the one from the original registers
        version: 1,
        blockContentHash: '0xblockhash' as `0x${string}`,
        commitHash: 'register-commit',
        sourceLocators: ['https://github.com/flashbots/flashbots-images/commit/b7c707667393cc4c0173786ee32ec3a79009b04f'],
      };

      const mockBlock = {
        number: BigInt(99999),
        hash: '0xblockhash',
      };

      mockComputeAllWorkloadIds.mockReturnValue([computedWorkloadId]);
      mockgetFlashtestationEvent.mockResolvedValue(mockEvent);
      mockGetBlock.mockResolvedValue(mockBlock);

      const result = await verifyFlashtestationInBlock(
        uppercaseRegisters,
        'latest',
        config
      );

      expect(mockComputeAllWorkloadIds).toHaveBeenCalledWith(uppercaseRegisters);
      expect(result).toEqual({
        isBuiltByExpectedTee: true,
        blockExplorerLink: 'https://sepolia.uniscan.xyz/block/99999',
        workloadMetadata: {
          workloadId: computedWorkloadId,
          commitHash: 'register-commit',
          builderAddress: '0xbuilder456',
          version: 1,
          sourceLocators: ['https://github.com/flashbots/flashbots-images/commit/b7c707667393cc4c0173786ee32ec3a79009b04f'],
        },
      });
    });

    it('should return isBuiltByExpectedTee: false when computed workload ID does not match', async () => {
      const differentWorkloadId = '0x9999999999999999999999999999999999999999999999999999999999999999';
      const mockEvent = {
        caller: '0xbuilder456',
        workloadId: differentWorkloadId,
        version: 1,
        blockContentHash: '0xblockhash' as `0x${string}`,
        commitHash: 'register-commit',
        sourceLocators: ['https://github.com/flashbots/flashbots-images/commit/b7c707667393cc4c0173786ee32ec3a79009b04f'],
      };

      const mockBlock = {
        number: BigInt(99999),
        hash: '0xblockhash',
      };

      mockComputeAllWorkloadIds.mockReturnValue([computedWorkloadId]);
      mockgetFlashtestationEvent.mockResolvedValue(mockEvent);
      mockGetBlock.mockResolvedValue(mockBlock);

      const result = await verifyFlashtestationInBlock(
        registers,
        'latest',
        config
      );

      expect(mockComputeAllWorkloadIds).toHaveBeenCalledWith(registers);
      expect(result).toEqual({
        isBuiltByExpectedTee: false,
        blockExplorerLink: 'https://sepolia.uniscan.xyz/block/99999',
        workloadMetadata: {
          workloadId: differentWorkloadId,
          commitHash: 'register-commit',
          builderAddress: '0xbuilder456',
          version: 1,
          sourceLocators: ['https://github.com/flashbots/flashbots-images/commit/b7c707667393cc4c0173786ee32ec3a79009b04f'],
        },
      });
    });

    it('should propagate validation errors from computeAllWorkloadIds', async () => {
      const alteredRegisters: WorkloadMeasurementRegisters = {
        ...registers,
        tdattributes: '0x000000100000000', // invalid hex, because there's an odd number of characters
      };

      await expect(
        verifyFlashtestationInBlock(alteredRegisters, 'latest', config)
      ).rejects.toThrow('Invalid tdattributes: expected 16 hex characters, got 15');
    });
  });

  describe('RpcClient configuration', () => {
    it('should pass chainId to RpcClient', async () => {
      mockgetFlashtestationEvent.mockResolvedValue(null);

      await verifyFlashtestationInBlock(
        '0xabc',
        'latest',
        { chainId: 1301 }
      );

      expect(mockRpcClientConstructor).toHaveBeenCalledWith({
        chainId: 1301,
        rpcUrl: undefined,
      });
    });

    it('should pass custom rpcUrl to RpcClient', async () => {
      mockgetFlashtestationEvent.mockResolvedValue(null);

      await verifyFlashtestationInBlock(
        '0xabc',
        'latest',
        { chainId: 1301, rpcUrl: 'https://custom.rpc' }
      );

      expect(mockRpcClientConstructor).toHaveBeenCalledWith({
        chainId: 1301,
        rpcUrl: 'https://custom.rpc',
      });
    });
  });

  describe('with WorkloadMeasurementRegisters with multiple values', () => {
    const config = { chainId: 1301 };

    it('should match when any combination of array registers matches event workloadId', async () => {
      const eventWorkloadId = '0xf724e7d117f5655cf33beefdfc7d31e930278fcb65cf6d1de632595e97ca82b2';

      const registers: WorkloadMeasurementRegisters = {
        tdattributes: '0x0000001000000000',
        xfam: '0xe702060000000000',
        mrtd: [
          '0x47a1cc074b914df8596bad0ed13d50d561ad1effc7f7cc530ab86da7ea49ffc03e57e7da829f8cba9c629c3970505323', // This one matches
          '0x202c7d38558f7cfa086feca5a23d62fa071cceb0bd55dbd06eeb4cebbd3c204c209f5551914d41ce433fb7fd67cc7136', // This one doesn't
        ],
        mrconfigid: '0x000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000',
        rtmr0: '0x00e1dad5455e5fa87974edb69e13296dd1ba9fa86356d70b68be15dd5d36767643904de1893c1b4d47fc8d3a90675391',
        rtmr1: '0xa7157e7c5f932e9babac9209d4527ec9ed837b8e335a931517677fa746db51ee56062e3324e266e3f39ec26a516f4f71',
        rtmr2: '0xe63560e50830e22fbc9b06cdce8afe784bf111e4251256cf104050f1347cd4ad9f30da408475066575145da0b098a124',
        rtmr3: '0x000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000',
      };

      const mockEvent = {
        caller: '0xbuilder789',
        workloadId: eventWorkloadId,
        version: 1,
        blockContentHash: '0xblockhash' as `0x${string}`,
        commitHash: 'array-test-commit',
        sourceLocators: ['https://github.com/flashbots/flashbots-images/commit/b7c707667393cc4c0173786ee32ec3a79009b04f'],
      };

      const mockBlock = {
        number: BigInt(88888),
        hash: '0xblockhash',
      };

      // Mock computeAllWorkloadIds to return multiple IDs, one matching the event
      mockComputeAllWorkloadIds.mockReturnValue([
        eventWorkloadId, // First combination matches
        '0x9999999999999999999999999999999999999999999999999999999999999999', // Second doesn't
      ]);
      mockgetFlashtestationEvent.mockResolvedValue(mockEvent);
      mockGetBlock.mockResolvedValue(mockBlock);

      const result = await verifyFlashtestationInBlock(
        registers,
        'latest',
        config
      );

      expect(mockComputeAllWorkloadIds).toHaveBeenCalledWith(registers);
      expect(result).toEqual({
        isBuiltByExpectedTee: true,
        blockExplorerLink: 'https://sepolia.uniscan.xyz/block/88888',
        workloadMetadata: {
          workloadId: eventWorkloadId,
          commitHash: 'array-test-commit',
          builderAddress: '0xbuilder789',
          version: 1,
          sourceLocators: ['https://github.com/flashbots/flashbots-images/commit/b7c707667393cc4c0173786ee32ec3a79009b04f'],
        },
      });
    });

    it('should not match when no combination of array registers matches event workloadId', async () => {
      const eventWorkloadId = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';

      const registers: WorkloadMeasurementRegisters = {
        tdattributes: '0x0000001000000000',
        xfam: '0xe702060000000000',
        mrtd: [
          '0x47a1cc074b914df8596bad0ed13d50d561ad1effc7f7cc530ab86da7ea49ffc03e57e7da829f8cba9c629c3970505323',
          '0x202c7d38558f7cfa086feca5a23d62fa071cceb0bd55dbd06eeb4cebbd3c204c209f5551914d41ce433fb7fd67cc7136',
        ],
        mrconfigid: '0x000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000',
        rtmr0: '0x00e1dad5455e5fa87974edb69e13296dd1ba9fa86356d70b68be15dd5d36767643904de1893c1b4d47fc8d3a90675391',
        rtmr1: '0xa7157e7c5f932e9babac9209d4527ec9ed837b8e335a931517677fa746db51ee56062e3324e266e3f39ec26a516f4f71',
        rtmr2: '0xe63560e50830e22fbc9b06cdce8afe784bf111e4251256cf104050f1347cd4ad9f30da408475066575145da0b098a124',
        rtmr3: '0x000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000',
      };

      const mockEvent = {
        caller: '0xbuilder789',
        workloadId: eventWorkloadId,
        version: 1,
        blockContentHash: '0xblockhash' as `0x${string}`,
        commitHash: 'array-test-commit',
        sourceLocators: ['https://github.com/flashbots/flashbots-images/commit/b7c707667393cc4c0173786ee32ec3a79009b04f'],
      };

      const mockBlock = {
        number: BigInt(88888),
        hash: '0xblockhash',
      };

      // Mock computeAllWorkloadIds to return IDs that don't match the event
      mockComputeAllWorkloadIds.mockReturnValue([
        '0x1111111111111111111111111111111111111111111111111111111111111111',
        '0x2222222222222222222222222222222222222222222222222222222222222222',
      ]);
      mockgetFlashtestationEvent.mockResolvedValue(mockEvent);
      mockGetBlock.mockResolvedValue(mockBlock);

      const result = await verifyFlashtestationInBlock(
        registers,
        'latest',
        config
      );

      expect(mockComputeAllWorkloadIds).toHaveBeenCalledWith(registers);
      expect(result).toEqual({
        isBuiltByExpectedTee: false,
        blockExplorerLink: 'https://sepolia.uniscan.xyz/block/88888',
        workloadMetadata: {
          workloadId: eventWorkloadId,
          commitHash: 'array-test-commit',
          builderAddress: '0xbuilder789',
          version: 1,
          sourceLocators: ['https://github.com/flashbots/flashbots-images/commit/b7c707667393cc4c0173786ee32ec3a79009b04f'],
        },
      });
    });

    it('should handle cartesian product of both mrtd and rtmr0 arrays', async () => {
      const eventWorkloadId = '0xc85f03aebad8acae79c876cbad92cd1da26c0555a383146132b3dbf5709e8662';

      const registers: WorkloadMeasurementRegisters = {
        tdattributes: '0x0000001000000000',
        xfam: '0xe702060000000000',
        mrtd: [
          '0x47a1cc074b914df8596bad0ed13d50d561ad1effc7f7cc530ab86da7ea49ffc03e57e7da829f8cba9c629c3970505323',
          '0x202c7d38558f7cfa086feca5a23d62fa071cceb0bd55dbd06eeb4cebbd3c204c209f5551914d41ce433fb7fd67cc7136',
        ],
        mrconfigid: '0x000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000',
        rtmr0: [
          '0x00e1dad5455e5fa87974edb69e13296dd1ba9fa86356d70b68be15dd5d36767643904de1893c1b4d47fc8d3a90675391',
          '0x6da49936a0649f6970be5df8bf7ba0d2efb66a96216c11cc65ac348432a07cfaab037b173e22c54d3f10d59327e7fbc9',
        ],
        rtmr1: '0xa7157e7c5f932e9babac9209d4527ec9ed837b8e335a931517677fa746db51ee56062e3324e266e3f39ec26a516f4f71',
        rtmr2: '0xe63560e50830e22fbc9b06cdce8afe784bf111e4251256cf104050f1347cd4ad9f30da408475066575145da0b098a124',
        rtmr3: '0x000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000',
      };

      const mockEvent = {
        caller: '0xbuilder999',
        workloadId: eventWorkloadId,
        version: 1,
        blockContentHash: '0xblockhash' as `0x${string}`,
        commitHash: 'cartesian-commit',
        sourceLocators: ['https://github.com/flashbots/flashbots-images/commit/b7c707667393cc4c0173786ee32ec3a79009b04f'],
      };

      const mockBlock = {
        number: BigInt(77777),
        hash: '0xblockhash',
      };

      // Mock computeAllWorkloadIds to return 4 IDs (2x2 cartesian product), last one matches
      mockComputeAllWorkloadIds.mockReturnValue([
        '0x1111111111111111111111111111111111111111111111111111111111111111',
        '0x2222222222222222222222222222222222222222222222222222222222222222',
        '0x3333333333333333333333333333333333333333333333333333333333333333',
        eventWorkloadId, // Last combination matches
      ]);
      mockgetFlashtestationEvent.mockResolvedValue(mockEvent);
      mockGetBlock.mockResolvedValue(mockBlock);

      const result = await verifyFlashtestationInBlock(
        registers,
        'latest',
        config
      );

      expect(mockComputeAllWorkloadIds).toHaveBeenCalledWith(registers);
      expect(result).toEqual({
        isBuiltByExpectedTee: true,
        blockExplorerLink: 'https://sepolia.uniscan.xyz/block/77777',
        workloadMetadata: {
          workloadId: eventWorkloadId,
          commitHash: 'cartesian-commit',
          builderAddress: '0xbuilder999',
          version: 1,
          sourceLocators: ['https://github.com/flashbots/flashbots-images/commit/b7c707667393cc4c0173786ee32ec3a79009b04f'],
        },
      });
    });
  });
});
