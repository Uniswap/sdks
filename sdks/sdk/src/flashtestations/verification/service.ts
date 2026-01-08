import { getBlockExplorerUrl } from '../config/chains';
import { computeAllWorkloadIds } from '../crypto/workload';
import { RpcClient } from '../rpc/client';
import {
  BlockParameter,
  VerificationResult,
  WorkloadMeasurementRegisters,
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
 *   tdattributes: '0x0000000000000000',
 *   xfam: '0x0000000000000003',
 *   mrtd: '0x1234...',
 *   mrconfigid: '0x0000...',
 *   rtmr0: '0xabcd...',
 *   rtmr1: '0xef01...',
 *   rtmr2: '0x2345...',
 *   rtmr3: '0x6789...',
 * };
 * const result = await verifyFlashtestationInBlock(
 *   registers,
 *   12345,
 *   { chainId: 1301 }
 * );
 */
export async function verifyFlashtestationInBlock(
  workloadIdOrRegisters: string | WorkloadMeasurementRegisters,
  blockParameter: BlockParameter,
  config: ClientConfig
): Promise<VerificationResult> {
  // Determine if we need to compute workload ID(s) from registers
  let workloadIds: string[];

  if (typeof workloadIdOrRegisters === 'string') {
    // Direct workload ID provided
    workloadIds = [workloadIdOrRegisters];
  } else {
    // Compute all possible workload IDs from measurement registers
    // (handles arrays in mrtd and rtmr0 fields)
    workloadIds = computeAllWorkloadIds(workloadIdOrRegisters);
  }

  // Normalize workload IDs (ensure they have 0x prefix and are lowercase)
  workloadIds = workloadIds.map(id => {
    if (!id.startsWith('0x')) {
      id = '0x' + id;
    }
    return id.toLowerCase();
  });

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

  // Compare workload IDs - check if any of the possible IDs match
  const workloadMatches = workloadIds.includes(eventWorkloadId);

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
