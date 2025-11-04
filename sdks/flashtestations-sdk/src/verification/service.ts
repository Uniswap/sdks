import { getBlockExplorerUrl } from '../config/chains';
import { computeWorkloadId } from '../crypto/workload';
import { RpcClient } from '../rpc/client';
import {
  BlockParameter,
  VerificationResult,
  WorkloadMeasureRegisters,
  ClientConfig,
  FlashtestationEvent,
} from '../types';

/**
 * Fetch the event data of the flashtestation transaction from a specific block
 *
 * This function retrieves the flashtestation event (if any) from the specified block.
 * Unlike verifyFlashtestationInBlock, this does not perform any workload verification - it
 * simply returns the raw flashtestation event data.
 *
 * @param blockParameter - Block identifier (tag, number, or hash), defaults to 'latest'
 * @param config - Configuration for chain and RPC connection
 * @returns FlashtestationEvent if the block contains a flashtestation transaction, null otherwise
 * @throws NetworkError if RPC connection fails
 * @throws BlockNotFoundError if block doesn't exist
 *
 * @example
 * // Get flashtestation event from the latest block
 * const flashtestationEvent = await getFlashtestationEvent('latest', { chainId: 1301 });
 * if (flashtestationEvent) {
 *   console.log('Workload ID:', flashtestationEvent.workloadId);
 *   console.log('Commit Hash:', flashtestationEvent.commitHash);
 * }
 *
 * @example
 * // Get flashtestation event data from a specific block number
 * const flashtestationEvent = await getFlashtestationEvent(12345, { chainId: 1301 });
 */
export async function getFlashtestationEvent(
  blockParameter: BlockParameter = 'latest',
  config: ClientConfig
): Promise<FlashtestationEvent | null> {
  // Create RPC client
  const client = new RpcClient({
    chainId: config.chainId,
    rpcUrl: config.rpcUrl,
  });

  // Get the flashtestation transaction's event data from the block
  return await client.getFlashtestationEvent(blockParameter);
}

/**
 * Verify if a block was built by a TEE running a specific workload
 *
 * This is the main entry point for flashtestation verification. It checks if
 * the specified block contains a flashtestation transaction whose event data matches the
 * provided workload ID or measurement registers.
 *
 * @param workloadIdOrRegisters - Either a workload ID string or measurement registers to compute the ID
 * @param blockParameter - Block identifier (tag, number, or hash)
 * @param config - Configuration for chain and RPC connection
 * @returns Verification result indicating if block was built by the specified TEE workload
 * @throws NetworkError if RPC connection fails
 * @throws BlockNotFoundError if block doesn't exist
 * @throws ValidationError if measurement registers are invalid
 *
 * @example
 * // Verify using a workload ID
 * const result = await verifyFlashtestationInBlock(
 *   '0x1234...',
 *   'latest',
 *   { chainId: 1301 }
 * );
 *
 * @example
 * // Verify using measurement registers
 * const registers = {
 *   tdAttributes: '0x0000000000000000',
 *   xFAM: '0x0000000000000003',
 *   mrTd: '0x1234...',
 *   mrConfigId: '0x0000...',
 *   rtMr0: '0xabcd...',
 *   rtMr1: '0xef01...',
 *   rtMr2: '0x2345...',
 *   rtMr3: '0x6789...',
 * };
 * const result = await verifyFlashtestationInBlock(
 *   registers,
 *   12345,
 *   { chainId: 1301 }
 * );
 */
export async function verifyFlashtestationInBlock(
  workloadIdOrRegisters: string | WorkloadMeasureRegisters,
  blockParameter: BlockParameter,
  config: ClientConfig
): Promise<VerificationResult> {
  // Determine if we need to compute workload ID from registers
  let workloadId: string;

  if (typeof workloadIdOrRegisters === 'string') {
    // Direct workload ID provided
    workloadId = workloadIdOrRegisters;
  } else {
    // Compute workload ID from measurement registers
    workloadId = computeWorkloadId(workloadIdOrRegisters);
  }

  // Normalize workload ID (ensure it has 0x prefix and is lowercase)
  if (!workloadId.startsWith('0x')) {
    workloadId = '0x' + workloadId;
  }
  workloadId = workloadId.toLowerCase();

  // Create RPC client
  const client = new RpcClient({
    chainId: config.chainId,
    rpcUrl: config.rpcUrl,
  });

  // Get the flashtestation event data from the block
  const flashtestationEvent = await client.getFlashtestationEvent(blockParameter);

  // If no flashtestation event data found, block was not TEE-built
  if (!flashtestationEvent) {
    return {
      isBuiltByExpectedTee: false,
      blockExplorerLink: null,
      workloadMetadata: null,
    };
  }

  // Get block explorer URL for this chain
  const blockExplorerBaseUrl = getBlockExplorerUrl(config.chainId);

  // Get the block to construct the explorer link
  const block = await client.getBlock(blockParameter);

  // Construct block explorer link if available
  let blockExplorerLink: string | null = null;
  if (blockExplorerBaseUrl) {
    // Use block number for the explorer link
    blockExplorerLink = `${blockExplorerBaseUrl}/block/${block.number}`;
  }

  // Normalize event workload ID for comparison
  const eventWorkloadId = flashtestationEvent.workloadId.toLowerCase();

  // Compare workload IDs (byte-wise comparison)
  const workloadMatches = workloadId === eventWorkloadId;

  if (!workloadMatches) {
    // Block was built by a TEE, but not the one we're looking for
    return {
      isBuiltByExpectedTee: false,
      blockExplorerLink: blockExplorerLink,
      workloadMetadata: {
        workloadId: flashtestationEvent.workloadId,
        commitHash: flashtestationEvent.commitHash,
        builderAddress: flashtestationEvent.caller,
        version: flashtestationEvent.version,
        sourceLocators: flashtestationEvent.sourceLocators,
      }
    };
  }

  // Block was built by the specified TEE workload
  return {
    isBuiltByExpectedTee: true,
    blockExplorerLink: blockExplorerLink,
    workloadMetadata: {
      workloadId: flashtestationEvent.workloadId,
      commitHash: flashtestationEvent.commitHash,
      builderAddress: flashtestationEvent.caller,
      version: flashtestationEvent.version,
      sourceLocators: flashtestationEvent.sourceLocators,
    }
  };
}
