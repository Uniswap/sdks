import { verifyFlashtestationInBlock } from '../../src/verification/service';
import * as rpcClientModule from '../../src/rpc/client';
import * as workloadModule from '../../src/crypto/workload';
import * as chainsModule from '../../src/config/chains';
import {
  BlockNotFoundError,
  NetworkError,
  WorkloadMeasureRegisters,
} from '../../src/types';

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
      tdAttributes: '0x0000000000000000',
      xFAM: '0x0000000000000003',
      mrTd: '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef12',
      mrConfigId: '0x000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000',
      rtMr0: '0x1111111111111111111111111111111111111111111111111111111111111111111111111111111111111111',
      rtMr1: '0x2222222222222222222222222222222222222222222222222222222222222222222222222222222222222222',
      rtMr2: '0x3333333333333333333333333333333333333333333333333333333333333333333333333333333333333333',
      rtMr3: '0x4444444444444444444444444444444444444444444444444444444444444444444444444444444444444444',
    };

    const computedWorkloadId = '0xdeadbeef1234567890deadbeef1234567890deadbeef1234567890deadbeef12';
    const config = { chainId: 1301 };

    beforeEach(() => {
      mockComputeWorkloadId.mockReturnValue(computedWorkloadId);
    });

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
      });
    });

    it('should propagate validation errors from computeWorkloadId', async () => {
      mockComputeWorkloadId.mockImplementation(() => {
        throw new Error('Invalid measurement registers');
      });

      await expect(
        verifyFlashtestationInBlock(registers, 'latest', config)
      ).rejects.toThrow('Invalid measurement registers');
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
