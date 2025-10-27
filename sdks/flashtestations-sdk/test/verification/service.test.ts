import * as chainsModule from '../../src/config/chains';
import * as workloadModule from '../../src/crypto/workload';
import * as rpcClientModule from '../../src/rpc/client';
import {
  BlockNotFoundError,
  NetworkError,
  WorkloadMeasureRegisters,
} from '../../src/types';
import { verifyFlashtestationInBlock } from '../../src/verification/service';

describe('verifyFlashtestationInBlock', () => {
  let mockGetFlashtestationTx: jest.Mock;
  let mockGetBlock: jest.Mock;
  let mockRpcClientConstructor: jest.SpyInstance;
  let mockComputeWorkloadId: jest.SpyInstance;
  let mockGetBlockExplorerUrl: jest.SpyInstance;

  beforeEach(() => {
    // Setup mocks
    mockGetFlashtestationTx = jest.fn();
    mockGetBlock = jest.fn();

    // Mock RpcClient constructor
    mockRpcClientConstructor = jest
      .spyOn(rpcClientModule, 'RpcClient')
      .mockImplementation(
        () =>
          ({
            getFlashtestationTx: mockGetFlashtestationTx,
            getBlock: mockGetBlock,
          } as any)
      );

    // Mock crypto functions
    mockComputeWorkloadId = jest.spyOn(workloadModule, 'computeWorkloadId');

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
      };

      const mockBlock = {
        number: BigInt(12345),
        hash: '0xblockhash',
      };

      mockGetFlashtestationTx.mockResolvedValue(mockEvent);
      mockGetBlock.mockResolvedValue(mockBlock);

      const result = await verifyFlashtestationInBlock(
        workloadId,
        'latest',
        config
      );

      expect(result).toEqual({
        isBuiltByExpectedTee: true,
        commitHash: 'abc123def456',
        blockExplorerLink: 'https://sepolia.uniscan.xyz/block/12345',
        builderAddress: '0xbuilder123',
        version: 1,
        workloadId: workloadId,
      });

      expect(mockGetFlashtestationTx).toHaveBeenCalledWith('latest');
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
      };

      const mockBlock = {
        number: BigInt(12345),
        hash: '0xblockhash',
      };

      mockGetFlashtestationTx.mockResolvedValue(mockEvent);
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
      };

      const mockBlock = {
        number: BigInt(12345),
        hash: '0xblockhash',
      };

      mockGetFlashtestationTx.mockResolvedValue(mockEvent);
      mockGetBlock.mockResolvedValue(mockBlock);

      const result = await verifyFlashtestationInBlock(
        workloadIdUpperCase,
        'latest',
        config
      );

      expect(result.isBuiltByExpectedTee).toBe(true);
    });

    it('should return isBuiltByExpectedTee: false when no flashtestation transaction found', async () => {
      mockGetFlashtestationTx.mockResolvedValue(null);

      const result = await verifyFlashtestationInBlock(
        workloadId,
        'latest',
        config
      );

      expect(result).toEqual({
        isBuiltByExpectedTee: false,
        commitHash: null,
        blockExplorerLink: null,
        version: 0,
        workloadId: null,
      });

      expect(mockGetFlashtestationTx).toHaveBeenCalledWith('latest');
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
      };

      mockGetFlashtestationTx.mockResolvedValue(mockEvent);

      const result = await verifyFlashtestationInBlock(
        workloadId,
        'latest',
        config
      );

      expect(result).toEqual({
        isBuiltByExpectedTee: false,
        commitHash: null,
        blockExplorerLink: null,
        version: 0,
        workloadId: null,
      });

      expect(mockGetFlashtestationTx).toHaveBeenCalledWith('latest');
      expect(mockGetBlock).not.toHaveBeenCalled();
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

      mockGetFlashtestationTx.mockResolvedValue(mockEvent);
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

      mockGetFlashtestationTx.mockResolvedValue(mockEvent);
      mockGetBlock.mockResolvedValue(mockBlock);

      // Test with block number
      await verifyFlashtestationInBlock(workloadId, 54321, config);
      expect(mockGetFlashtestationTx).toHaveBeenCalledWith(54321);

      // Test with finalized tag
      await verifyFlashtestationInBlock(workloadId, 'finalized', config);
      expect(mockGetFlashtestationTx).toHaveBeenCalledWith('finalized');

      // Test with hex block number
      await verifyFlashtestationInBlock(workloadId, '0xd431', config);
      expect(mockGetFlashtestationTx).toHaveBeenCalledWith('0xd431');
    });

    it('should propagate BlockNotFoundError', async () => {
      mockGetFlashtestationTx.mockRejectedValue(
        new BlockNotFoundError('latest')
      );

      await expect(
        verifyFlashtestationInBlock(workloadId, 'latest', config)
      ).rejects.toThrow(BlockNotFoundError);
    });

    it('should propagate NetworkError', async () => {
      mockGetFlashtestationTx.mockRejectedValue(
        new NetworkError('Connection failed')
      );

      await expect(
        verifyFlashtestationInBlock(workloadId, 'latest', config)
      ).rejects.toThrow(NetworkError);
    });
  });

  describe('with WorkloadMeasureRegisters', () => {
    const registers: WorkloadMeasureRegisters = {
      tdAttributes: '0x0000001000000000',
      xFAM: '0xe702060000000000',
      mrTd: '0x47a1cc074b914df8596bad0ed13d50d561ad1effc7f7cc530ab86da7ea49ffc03e57e7da829f8cba9c629c3970505323',
      mrConfigId: '0x000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000',
      rtMr0: '0x00e1dad5455e5fa87974edb69e13296dd1ba9fa86356d70b68be15dd5d36767643904de1893c1b4d47fc8d3a90675391',
      rtMr1: '0xa7157e7c5f932e9babac9209d4527ec9ed837b8e335a931517677fa746db51ee56062e3324e266e3f39ec26a516f4f71',
      rtMr2: '0xe63560e50830e22fbc9b06cdce8afe784bf111e4251256cf104050f1347cd4ad9f30da408475066575145da0b098a124',
      rtMr3: '0x000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000',
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
      };

      const mockBlock = {
        number: BigInt(99999),
        hash: '0xblockhash',
      };

      mockGetFlashtestationTx.mockResolvedValue(mockEvent);
      mockGetBlock.mockResolvedValue(mockBlock);

      const result = await verifyFlashtestationInBlock(
        registers,
        'latest',
        config
      );

      expect(mockComputeWorkloadId).toHaveBeenCalledWith(registers);
      expect(result).toEqual({
        isBuiltByExpectedTee: true,
        commitHash: 'register-commit',
        blockExplorerLink: 'https://sepolia.uniscan.xyz/block/99999',
        builderAddress: '0xbuilder456',
        version: 1,
        workloadId: computedWorkloadId,
      });
    });

    it('should compute workload ID from registers and verify when registers have a different case', async () => {
      const uppercaseRegisters: WorkloadMeasureRegisters = {
        tdAttributes: `0x${registers.tdAttributes.substring(2).toUpperCase()}`,
        xFAM: `0x${registers.xFAM.substring(2).toUpperCase()}`,
        mrTd: `0x${registers.mrTd.substring(2).toUpperCase()}`,
        mrConfigId: `0x${registers.mrConfigId.substring(2).toUpperCase()}`,
        rtMr0: `0x${registers.rtMr0.substring(2).toUpperCase()}`,
        rtMr1: `0x${registers.rtMr1.substring(2).toUpperCase()}`,
        rtMr2: `0x${registers.rtMr2.substring(2).toUpperCase()}`,
        rtMr3: `0x${registers.rtMr3.substring(2).toUpperCase()}`,
      };

      const mockEvent = {
        caller: '0xbuilder456',
        workloadId: computedWorkloadId, // same workload ID as the one from the original registers
        version: 1,
        blockContentHash: '0xblockhash' as `0x${string}`,
        commitHash: 'register-commit',
      };

      const mockBlock = {
        number: BigInt(99999),
        hash: '0xblockhash',
      };

      mockGetFlashtestationTx.mockResolvedValue(mockEvent);
      mockGetBlock.mockResolvedValue(mockBlock);

      const result = await verifyFlashtestationInBlock(
        uppercaseRegisters,
        'latest',
        config
      );

      expect(mockComputeWorkloadId).toHaveBeenCalledWith(uppercaseRegisters);
      expect(result).toEqual({
        isBuiltByExpectedTee: true,
        commitHash: 'register-commit',
        blockExplorerLink: 'https://sepolia.uniscan.xyz/block/99999',
        builderAddress: '0xbuilder456',
        version: 1,
        workloadId: computedWorkloadId,
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
      };

      mockGetFlashtestationTx.mockResolvedValue(mockEvent);

      const result = await verifyFlashtestationInBlock(
        registers,
        'latest',
        config
      );

      expect(mockComputeWorkloadId).toHaveBeenCalledWith(registers);
      expect(result).toEqual({
        isBuiltByExpectedTee: false,
        commitHash: null,
        blockExplorerLink: null,
        version: 0,
        workloadId: null,
      });
    });

    it('should propagate validation errors from computeWorkloadId', async () => {
      const alteredRegisters: WorkloadMeasureRegisters = {
        ...registers,
        tdAttributes: '0x000000100000000', // invalid hex, because there's an odd number of characters
      };

      await expect(
        verifyFlashtestationInBlock(alteredRegisters, 'latest', config)
      ).rejects.toThrow('Invalid tdAttributes: expected 16 hex characters, got 15');
    });
  });

  describe('RpcClient configuration', () => {
    it('should pass chainId to RpcClient', async () => {
      mockGetFlashtestationTx.mockResolvedValue(null);

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
      mockGetFlashtestationTx.mockResolvedValue(null);

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
});
