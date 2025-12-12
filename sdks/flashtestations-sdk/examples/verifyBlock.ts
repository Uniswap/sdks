import { verifyFlashtestationInBlock } from '../src/index';

/**
 * Example: Verify if a block was built by a specific TEE workload
 *
 * This example demonstrates how to:
 * 1. Read a workload ID from environment variables
 * 2. Verify if the latest block on Unichain Mainnet was built by that workload
 * 3. Display verification results
 *
 * Usage:
 *   WORKLOAD_ID=0x1234... npx tsx examples/verifyBlock.ts
 */
async function main() {
  try {
    // Get workload ID from environment variable
    const workloadId = process.env.WORKLOAD_ID;

    if (!workloadId) {
      console.error('Error: WORKLOAD_ID environment variable is required');
      console.error('\nUsage:');
      console.error('  WORKLOAD_ID=0x1234... npx tsx examples/verifyBlock.ts');
      process.exit(1);
    }

    console.log('Verifying latest block on Unichain Mainnet...\n');
    console.log(`Workload ID: ${workloadId}\n`);

    const chainId = parseInt(process.env.CHAIN_ID || '130'); // default to Unichain Mainnet

    // Verify if the latest block was built by the specified TEE workload
    const result = await verifyFlashtestationInBlock(
      workloadId,
      'latest', // Use 'latest' to check the most recent block
      {
        chainId: chainId,
        // Optional: provide custom RPC URL
        // rpcUrl: 'https://mainnet.unichain.org',
      }
    );

    // Display verification results
    console.log('Verification Results:');
    console.log('====================');

    if (result.isBuiltByExpectedTee) {
      console.log('\n✓ Block was built by the specified TEE workload!\n');
      console.log(`Workload ID: ${result.workloadMetadata.workloadId}`);
      console.log(`Commit Hash: ${result.workloadMetadata.commitHash}`);
      console.log(`Builder Address: ${result.workloadMetadata.builderAddress}`);
      console.log(`Version: ${result.workloadMetadata.version}`);
      console.log(`Source Locators: ${result.workloadMetadata.sourceLocators && result.workloadMetadata.sourceLocators.length > 0 ? result.workloadMetadata.sourceLocators.join(', ') : 'None'}`)
      if (result.blockExplorerLink) {
        console.log(`Block Explorer: ${result.blockExplorerLink}`);
      }
    } else {
      console.log('\n✗ Block was NOT built by the specified TEE workload\n');

      if (result.workloadMetadata) {
        console.log('Block was built by a different TEE workload:');
        console.log(`Workload ID: ${result.workloadMetadata.workloadId}`);
        console.log(`Commit Hash: ${result.workloadMetadata.commitHash}`);
        console.log(`Builder Address: ${result.workloadMetadata.builderAddress}`);
        console.log(`Version: ${result.workloadMetadata.version}`);
        console.log(`Source Locators: ${result.workloadMetadata.sourceLocators.length > 0 ? result.workloadMetadata.sourceLocators.join(', ') : 'None'}`)
      } else {
        console.log('The block does not contain a flashtestation transaction')
      }
    }

    // You can also verify specific blocks:
    // - By block number: await verifyFlashtestationInBlock(workloadId, 12345, { chainId: 130 })
    // - By bigint number: await verifyFlashtestationInBlock(workloadId, BigInt(12345), { chainId: 130 })
    // - By block hash: await verifyFlashtestationInBlock(workloadId, '0x...', { chainId: 130 })
    // - By hex number: await verifyFlashtestationInBlock(workloadId, '0x3039', { chainId: 130 })
    // - Other tags: 'earliest', 'finalized', 'safe', 'pending'

  } catch (error) {
    console.error('Error verifying block:', error);
    process.exit(1);
  }
}

// Run the example
main();
