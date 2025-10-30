import { RpcClient, createRpcClient } from '../../src/rpc/client';
import { BlockNotFoundError, NetworkError } from '../../src/types';
import {
  mockCreatePublicClient,
  mockParseEventLogs,
} from '../__mocks__/viem';

// Use doMock to avoid hoisting issues with ts-jest
// eslint-disable-next-line @typescript-eslint/no-var-requires
jest.doMock('viem', () => require('../__mocks__/viem'));

describe('RpcClient', () => {
  let mockClient: any;
  let mockGetBlock: jest.Mock;
  let mockGetTransactionReceipt: jest.Mock;

  beforeEach(() => {
    // Clear cache before each test
    RpcClient.clearCache();

    mockGetBlock = jest.fn();
    mockGetTransactionReceipt = jest.fn();

    mockClient = {
      getBlock: mockGetBlock,
      getTransactionReceipt: mockGetTransactionReceipt,
    };

    // Setup mocks
    mockCreatePublicClient.mockReturnValue(mockClient);
    mockParseEventLogs.mockReturnValue([]);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('should create a client with default configuration', () => {
      const client = new RpcClient({ chainId: 1301 });
      expect(client).toBeDefined();
    });

    it('should create a client with custom RPC URL', () => {
      const client = new RpcClient({
        chainId: 1301,
        rpcUrl: 'https://custom-rpc.example.com',
      });
      expect(client).toBeDefined();
    });

    it('should throw for unsupported chain', () => {
      expect(() => new RpcClient({ chainId: 999999 })).toThrow();
    });
  });

  describe('getBlock', () => {
    let client: RpcClient;

    beforeEach(() => {
      client = new RpcClient({ chainId: 1301, maxRetries: 0 });
    });

    it('should fetch block by tag "latest"', async () => {
      const mockBlock = { number: BigInt(100), hash: '0xabc' };
      mockGetBlock.mockResolvedValue(mockBlock);

      const block = await client.getBlock('latest');

      expect(mockGetBlock).toHaveBeenCalledWith({ blockTag: 'latest' });
      expect(block).toEqual(mockBlock);
    });

    it('should fetch block by tag "finalized"', async () => {
      const mockBlock = { number: BigInt(95), hash: '0xdef' };
      mockGetBlock.mockResolvedValue(mockBlock);

      const block = await client.getBlock('finalized');

      expect(mockGetBlock).toHaveBeenCalledWith({ blockTag: 'finalized' });
      expect(block).toEqual(mockBlock);
    });

    it('should fetch block by number', async () => {
      const mockBlock = { number: BigInt(12345), hash: '0x123' };
      mockGetBlock.mockResolvedValue(mockBlock);

      const block = await client.getBlock(12345);

      expect(mockGetBlock).toHaveBeenCalledWith({
        blockNumber: BigInt(12345),
      });
      expect(block).toEqual(mockBlock);
    });

    it('should fetch block by bigint', async () => {
      const mockBlock = { number: BigInt(12345), hash: '0x123' };
      mockGetBlock.mockResolvedValue(mockBlock);

      const block = await client.getBlock(BigInt(12345));

      expect(mockGetBlock).toHaveBeenCalledWith({
        blockNumber: BigInt(12345),
      });
      expect(block).toEqual(mockBlock);
    });

    it('should fetch block by hex number', async () => {
      const mockBlock = { number: BigInt(255), hash: '0x456' };
      mockGetBlock.mockResolvedValue(mockBlock);

      const block = await client.getBlock('0xff');

      expect(mockGetBlock).toHaveBeenCalledWith({ blockNumber: BigInt(255) });
      expect(block).toEqual(mockBlock);
    });

    it('should fetch block by block hash', async () => {
      const blockHash =
        '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';
      const mockBlock = { number: BigInt(100), hash: blockHash };
      mockGetBlock.mockResolvedValue(mockBlock);

      const block = await client.getBlock(blockHash);

      expect(mockGetBlock).toHaveBeenCalledWith({ blockHash });
      expect(block).toEqual(mockBlock);
    });

    it('should throw BlockNotFoundError when block does not exist', async () => {
      mockGetBlock.mockRejectedValue(new Error('Block not found'));

      await expect(client.getBlock(999999)).rejects.toThrow(
        BlockNotFoundError
      );
    });

    it('should throw BlockNotFoundError when block is null', async () => {
      mockGetBlock.mockResolvedValue(null);

      await expect(client.getBlock('latest')).rejects.toThrow(
        BlockNotFoundError
      );
    });
  });

  describe('getTransactionReceipt', () => {
    let client: RpcClient;

    beforeEach(() => {
      client = new RpcClient({ chainId: 1301, maxRetries: 0 });
    });

    it('should fetch transaction receipt', async () => {
      const txHash = '0xabc123';
      const mockReceipt = {
        transactionHash: txHash,
        blockNumber: BigInt(100),
        status: 'success',
      };
      mockGetTransactionReceipt.mockResolvedValue(mockReceipt);

      const receipt = await client.getTransactionReceipt(txHash);

      expect(mockGetTransactionReceipt).toHaveBeenCalledWith({ hash: txHash });
      expect(receipt).toEqual(mockReceipt);
    });

    it('should throw error when receipt is not found', async () => {
      mockGetTransactionReceipt.mockResolvedValue(null);

      await expect(
        client.getTransactionReceipt('0xinvalid')
      ).rejects.toThrow('Transaction receipt not found');
    });
  });

  describe('retry logic', () => {
    it('should retry failed requests with exponential backoff', async () => {
      const client = new RpcClient({
        chainId: 1301,
        maxRetries: 2,
        initialRetryDelay: 10,
      });

      mockGetBlock
        .mockRejectedValueOnce(new Error('Network error'))
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce({ number: 100, hash: '0xabc' });

      const block = await client.getBlock('latest');

      expect(mockGetBlock).toHaveBeenCalledTimes(3);
      expect(block).toEqual({ number: 100, hash: '0xabc' });
    });

    it('should throw NetworkError after max retries', async () => {
      const client = new RpcClient({
        chainId: 1301,
        maxRetries: 1,
        initialRetryDelay: 10,
      });

      mockGetBlock.mockRejectedValue(new Error('Network error'));

      await expect(client.getBlock('latest')).rejects.toThrow(NetworkError);
      expect(mockGetBlock).toHaveBeenCalledTimes(2); // initial + 1 retry
    });
  });

  describe('client caching', () => {
    it('should reuse clients for the same chain and RPC URL', () => {
      new RpcClient({ chainId: 1301 });
      new RpcClient({ chainId: 1301 });

      // Should only create one client
      expect(mockCreatePublicClient).toHaveBeenCalledTimes(1);
    });

    it('should create separate clients for different chains', () => {
      new RpcClient({ chainId: 1301 });
      new RpcClient({ chainId: 130 });

      expect(mockCreatePublicClient).toHaveBeenCalledTimes(2);
    });

    it('should create separate clients for different RPC URLs', () => {
      new RpcClient({
        chainId: 1301,
        rpcUrl: 'https://rpc1.example.com',
      });
      new RpcClient({
        chainId: 1301,
        rpcUrl: 'https://rpc2.example.com',
      });

      expect(mockCreatePublicClient).toHaveBeenCalledTimes(2);
    });
  });

  describe('createRpcClient', () => {
    it('should create a new RpcClient instance', () => {
      const client = createRpcClient({ chainId: 1301 });
      expect(client).toBeInstanceOf(RpcClient);
    });
  });

  describe('getClient', () => {
    it('should return the underlying viem client', () => {
      const client = new RpcClient({ chainId: 1301 });
      const viemClient = client.getClient();
      expect(viemClient).toBe(mockClient);
    });
  });

  describe('getFlashtestationTx', () => {
    let client: RpcClient;

    beforeEach(() => {
      client = new RpcClient({ chainId: 1301, maxRetries: 0 });
    });

    it('should return FlashtestationEvent when BlockBuilderProofVerified event exists', async () => {
      const txHash = '0xabc123def456' as `0x${string}`;
      const blockNumber = 100;
      const mockBlock = {
        number: BigInt(blockNumber),
        hash: '0xblockhash123',
        transactions: [txHash],
      };
      const mockReceipt = {
        transactionHash: txHash,
        blockNumber: BigInt(blockNumber),
        to: '0xcontract123',
        status: 'success',
        logs: [],
      };
      const mockLog = {
        args: {
          caller: '0xcaBBa9e7f4b3A885C5aa069f88469ac711Dd4aCC' as `0x${string}`,
          workloadId: '0x71d62ba17902d590dad932310a7ec12feffa25454d7009c2084aa6f4c488953f' as `0x${string}`,
          version: 1,
          blockContentHash: '0x846604baa7db2297b9c4058106cc5869bcdbb753760981dbcd6d345d3d5f3e0f' as `0x${string}`,
          commitHash: '490fb2be109f0c2626c347bb3e43e97826c8f844',
        },
      };

      mockGetBlock.mockResolvedValue(mockBlock);
      mockGetTransactionReceipt.mockResolvedValue(mockReceipt);
      mockParseEventLogs.mockReturnValue([mockLog]);

      const result = await client.getFlashtestationTx(blockNumber);

      expect(mockGetBlock).toHaveBeenCalledWith({ blockNumber: BigInt(blockNumber) });
      expect(mockGetTransactionReceipt).toHaveBeenCalledWith({ hash: txHash });
      expect(mockParseEventLogs).toHaveBeenCalledWith(
        expect.objectContaining({
          eventName: 'BlockBuilderProofVerified',
          logs: mockReceipt.logs,
        })
      );
      expect(result).toEqual({
        caller: '0xcaBBa9e7f4b3A885C5aa069f88469ac711Dd4aCC',
        workloadId: '0x71d62ba17902d590dad932310a7ec12feffa25454d7009c2084aa6f4c488953f',
        version: 1,
        blockContentHash: '0x846604baa7db2297b9c4058106cc5869bcdbb753760981dbcd6d345d3d5f3e0f',
        commitHash: '490fb2be109f0c2626c347bb3e43e97826c8f844',
      });
    });

    it('should return null when transaction receipt is not found', async () => {
      const txHash = '0xabc123def456' as `0x${string}`;
      const blockNumber = 100;
      const mockBlock = {
        number: BigInt(blockNumber),
        hash: '0xblockhash123',
        transactions: [txHash],
      };

      mockGetBlock.mockResolvedValue(mockBlock);
      mockGetTransactionReceipt.mockResolvedValue(null);

      const result = await client.getFlashtestationTx(blockNumber);

      expect(mockGetBlock).toHaveBeenCalledWith({ blockNumber: BigInt(blockNumber) });
      expect(mockGetTransactionReceipt).toHaveBeenCalledWith({ hash: txHash });
      expect(mockParseEventLogs).not.toHaveBeenCalled();
      expect(result).toBeNull();
    });

    it('should return null when BlockBuilderProofVerified event is not found', async () => {
      const txHash = '0xabc123def456' as `0x${string}`;
      const blockNumber = 100;
      const mockBlock = {
        number: BigInt(blockNumber),
        hash: '0xblockhash123',
        transactions: [txHash],
      };
      const mockReceipt = {
        transactionHash: txHash,
        blockNumber: BigInt(blockNumber),
        to: '0xcontract123',
        status: 'success',
        logs: [],
      };

      mockGetBlock.mockResolvedValue(mockBlock);
      mockGetTransactionReceipt.mockResolvedValue(mockReceipt);
      mockParseEventLogs.mockReturnValue([]);

      const result = await client.getFlashtestationTx(blockNumber);

      expect(mockGetBlock).toHaveBeenCalledWith({ blockNumber: BigInt(blockNumber) });
      expect(mockGetTransactionReceipt).toHaveBeenCalledWith({ hash: txHash });
      expect(mockParseEventLogs).toHaveBeenCalled();
      expect(result).toBeNull();
    });

    it('should return null when logs exist but not for the specified transaction', async () => {
      const txHash = '0xabc123def456' as `0x${string}`;
      const blockNumber = 100;
      const mockBlock = {
        number: BigInt(blockNumber),
        hash: '0xblockhash123',
        transactions: [txHash],
      };
      const mockReceipt = {
        transactionHash: txHash,
        blockNumber: BigInt(blockNumber),
        to: '0xcontract123',
        status: 'success',
        logs: [],
      };

      mockGetBlock.mockResolvedValue(mockBlock);
      mockGetTransactionReceipt.mockResolvedValue(mockReceipt);
      mockParseEventLogs.mockReturnValue([]);

      const result = await client.getFlashtestationTx(blockNumber);

      expect(mockGetBlock).toHaveBeenCalledWith({ blockNumber: BigInt(blockNumber) });
      expect(mockGetTransactionReceipt).toHaveBeenCalledWith({ hash: txHash });
      expect(mockParseEventLogs).toHaveBeenCalled();
      expect(result).toBeNull();
    });

    it('should handle receipt with no "to" address', async () => {
      const txHash = '0xabc123def456' as `0x${string}`;
      const blockNumber = 100;
      const mockBlock = {
        number: BigInt(blockNumber),
        hash: '0xblockhash123',
        transactions: [txHash],
      };
      const mockReceipt = {
        transactionHash: txHash,
        blockNumber: BigInt(blockNumber),
        to: null, // Contract creation transaction
        status: 'success',
        logs: [],
      };

      mockGetBlock.mockResolvedValue(mockBlock);
      mockGetTransactionReceipt.mockResolvedValue(mockReceipt);
      mockParseEventLogs.mockReturnValue([]);

      const result = await client.getFlashtestationTx(blockNumber);

      expect(mockGetBlock).toHaveBeenCalledWith({ blockNumber: BigInt(blockNumber) });
      expect(mockGetTransactionReceipt).toHaveBeenCalledWith({ hash: txHash });
      expect(mockParseEventLogs).toHaveBeenCalledWith(
        expect.objectContaining({
          eventName: 'BlockBuilderProofVerified',
          logs: mockReceipt.logs,
        })
      );
      expect(result).toBeNull();
    });
  });
});
