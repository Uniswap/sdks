import {
  createPublicClient,
  http,
  type Block,
  type TransactionReceipt,
  type BlockTag,
  type Chain,
  PublicClient,
  parseEventLogs,
} from 'viem'

import { getRpcUrl, getChainConfig, getContractAddress } from '../config/chains'
import { BlockParameter, NetworkError, BlockNotFoundError, FlashtestationEvent } from '../types'

import { flashtestationAbi } from './abi'

/**
 * Configuration options for the RPC client
 */
export interface RpcClientConfig {
  /** Chain ID to connect to */
  chainId: number
  /** Optional custom RPC URL (overrides default) */
  rpcUrl?: string
  /** Number of retry attempts for failed requests (default: 3) */
  maxRetries?: number
  /** Initial retry delay in milliseconds (default: 1000) */
  initialRetryDelay?: number
}

type WorkloadMetadata = {
  commitHash: string
  sourceLocators: string[]
}

/**
 * Cache of RPC clients keyed by chain ID and RPC URL
 */
const clientCache = new Map<string, PublicClient>()

/**
 * Get a cached client key
 */
function getClientKey(chainId: number, rpcUrl: string): string {
  return `${chainId}:${rpcUrl}`
}

/**
 * Create a viem Chain object from chain ID
 */
function createChainFromId(chainId: number): Chain {
  const config = getChainConfig(chainId)
  return {
    id: chainId,
    name: config.name,
    nativeCurrency: {
      name: 'Ether',
      symbol: 'ETH',
      decimals: 18,
    },
    rpcUrls: {
      default: {
        http: [config.defaultRpcUrl],
      },
    },
    blockExplorers: {
      default: {
        name: 'Explorer',
        url: config.blockExplorerUrl,
      },
    },
  } as const satisfies Chain
}

/**
 * Convert BlockParameter to viem getBlock argument
 * Distinguishes between block hashes (66 char hex) and block numbers
 */
function toViemBlockParameter(
  blockParam: BlockParameter
): { blockTag: BlockTag } | { blockNumber: bigint } | { blockHash: `0x${string}` } {
  // Handle block tags
  if (
    blockParam === 'earliest' ||
    blockParam === 'latest' ||
    blockParam === 'safe' ||
    blockParam === 'finalized' ||
    blockParam === 'pending'
  ) {
    return { blockTag: blockParam as BlockTag }
  }

  // Handle bigint
  if (typeof blockParam === 'bigint') {
    return { blockNumber: blockParam }
  }

  // Handle hex string
  if (typeof blockParam === 'string') {
    if (blockParam.startsWith('0x')) {
      // Block hashes are 32 bytes = 66 characters (including 0x)
      if (blockParam.length === 66) {
        return { blockHash: blockParam as `0x${string}` }
      }
      // Otherwise it's a hex block number
      return { blockNumber: BigInt(blockParam) }
    }
    // Convert decimal string to bigint
    return { blockNumber: BigInt(blockParam) }
  }

  // Handle number
  return { blockNumber: BigInt(blockParam) }
}

/**
 * Retry a function with exponential backoff
 */
async function retry<T>(fn: () => Promise<T>, maxRetries: number, initialDelay: number): Promise<T> {
  let lastError: Error | undefined
  let delay = initialDelay

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn()
    } catch (error) {
      lastError = error as Error

      // Don't retry BlockNotFoundError - it's a permanent error
      if (lastError instanceof BlockNotFoundError) {
        throw lastError
      }

      // Don't retry on the last attempt
      if (attempt === maxRetries) {
        break
      }

      // Wait before retrying with exponential backoff
      await new Promise((resolve) => setTimeout(resolve, delay))
      delay *= 2
    }
  }

  throw new NetworkError(`Failed after ${maxRetries + 1} attempts: ${lastError?.message}`, lastError)
}

/**
 * RPC Client for blockchain interactions with retry logic and connection reuse
 */
export class RpcClient {
  private client: PublicClient
  private config: Required<RpcClientConfig>

  /**
   * Create a new RPC client
   * @param config - Configuration for the RPC client
   */
  constructor(config: RpcClientConfig) {
    this.config = {
      chainId: config.chainId,
      rpcUrl: config.rpcUrl || getRpcUrl(config.chainId),
      maxRetries: config.maxRetries ?? 3,
      initialRetryDelay: config.initialRetryDelay ?? 1000,
    }

    // this will only execute for alphanet and experimental because we don't include the RPC URL in the ChainConfig
    if (!this.config.rpcUrl) {
      throw new Error('rpcUrl argument is required in RpcClient constructor, but was not provided')
    }

    // Check for cached client
    const cacheKey = getClientKey(this.config.chainId, this.config.rpcUrl)
    const cachedClient = clientCache.get(cacheKey)

    if (cachedClient) {
      this.client = cachedClient
    } else {
      // Create new client with chain configuration
      const chain = createChainFromId(this.config.chainId)
      this.client = createPublicClient({
        chain,
        transport: http(this.config.rpcUrl, {
          timeout: 30_000, // 30 second timeout
        }),
      })

      // Cache the client for reuse
      clientCache.set(cacheKey, this.client)
    }
  }

  /**
   * Get a block by block parameter
   * @param blockParameter - Block identifier (tag, number, hash, or hex)
   * @returns Block data
   * @throws BlockNotFoundError if block doesn't exist
   * @throws NetworkError if RPC connection fails
   */
  async getBlock(blockParameter: BlockParameter): Promise<Block> {
    return retry(
      async () => {
        try {
          const viemBlockParam = toViemBlockParameter(blockParameter)
          const block = await this.client.getBlock(viemBlockParam)

          if (!block) {
            throw new BlockNotFoundError(blockParameter)
          }

          return block
        } catch (error) {
          // Don't retry BlockNotFoundError - re-throw immediately
          if (error instanceof BlockNotFoundError) {
            throw error
          }

          // Wrap viem errors in our custom error types
          const err = error as Error
          if (err.message?.includes('not found') || err.message?.includes('does not exist')) {
            throw new BlockNotFoundError(blockParameter)
          }
          throw error
        }
      },
      this.config.maxRetries,
      this.config.initialRetryDelay
    )
  }

  /**
   * Get a transaction receipt by transaction hash
   * @param txHash - Transaction hash
   * @returns Transaction receipt
   * @throws NetworkError if RPC connection fails
   */
  async getTransactionReceipt(txHash: string): Promise<TransactionReceipt> {
    return retry(
      async () => {
        const receipt = await this.client.getTransactionReceipt({
          hash: txHash as `0x${string}`,
        })

        if (!receipt) {
          throw new Error(`Transaction receipt not found: ${txHash}`)
        }

        return receipt
      },
      this.config.maxRetries,
      this.config.initialRetryDelay
    )
  }

  /**
   * Get source locators for a workload ID from the BlockBuilderPolicy contract
   * @param workloadId - The workload ID (bytes32 hex string)
   * @returns Array of source locator strings
   * @throws NetworkError if RPC connection fails
   */
  async getSourceLocators(workloadId: `0x${string}`): Promise<string[]> {
    return retry(
      async () => {
        const contractAddress = getContractAddress(this.config.chainId)

        const result = await this.client.readContract({
          address: contractAddress as `0x${string}`,
          abi: flashtestationAbi,
          functionName: 'getWorkloadMetadata',
          args: [workloadId],
        })

        // result is an object with commitHash and sourceLocators
        // We only need the sourceLocators array
        return (result as WorkloadMetadata).sourceLocators as string[]
      },
      this.config.maxRetries,
      this.config.initialRetryDelay
    )
  }

  /**
   * Get a flashtestation event by transaction hash
   * Checks if the transaction emitted a BlockBuilderProofVerified event
   * @param txHash - Transaction hash
   * @returns FlashtestationEvent data if it's a flashtestation tx, null otherwise
   * @throws NetworkError if RPC connection fails
   */
  async getFlashtestationEvent(blockParameter: BlockParameter = 'latest'): Promise<FlashtestationEvent | null> {
    return retry(
      async () => {
        // First, get the transaction hash from the block
        const block = await this.getBlock(blockParameter)
        if (!block.transactions || block.transactions.length === 0) {
          return null
        }
        const txHash = block.transactions[block.transactions.length - 1] as `0x${string}`

        // Then, get the transaction receipt to parse the logs for the BlockBuilderProofVerified event
        const receipt = await this.client.getTransactionReceipt({
          hash: txHash,
        })

        if (!receipt) {
          return null
        }

        // Parse the logs from the receipt to find BlockBuilderProofVerified events
        const parsedLogs = parseEventLogs({
          abi: flashtestationAbi,
          eventName: 'BlockBuilderProofVerified',
          logs: receipt.logs,
        })

        // If we found the BlockBuilderProofVerified event, parse and return it
        if (parsedLogs.length > 0) {
          if (parsedLogs.length !== 1) {
            throw new Error('Expected exactly one BlockBuilderProofVerified event')
          }
          const log = parsedLogs[0]
          const args = log.args as {
            caller: `0x${string}`
            workloadId: `0x${string}`
            version: number
            blockContentHash: `0x${string}`
            commitHash: string
          }

          // Fetch source locators from contract
          const sourceLocators = await this.getSourceLocators(args.workloadId)

          return {
            caller: args.caller,
            workloadId: args.workloadId,
            version: args.version,
            blockContentHash: args.blockContentHash,
            commitHash: args.commitHash,
            sourceLocators,
          }
        }

        return null
      },
      this.config.maxRetries,
      this.config.initialRetryDelay
    )
  }

  /**
   * Get the underlying viem PublicClient
   * @returns The viem PublicClient instance
   */
  getClient(): PublicClient {
    return this.client
  }

  /**
   * Clear the client cache (useful for testing)
   */
  static clearCache(): void {
    clientCache.clear()
  }
}

/**
 * Create an RPC client with the given configuration
 * @param config - Configuration for the RPC client
 * @returns A new RpcClient instance
 */
export function createRpcClient(config: RpcClientConfig): RpcClient {
  return new RpcClient(config)
}
