import { verifyFlashtestationInBlock } from '../src/verification/service';

/**
 * Example: Verify if a block was built by a specific TEE workload
 *
 * This example demonstrates how to:
 * 1. Read a workload ID from environment variables
 * 2. Verify if the latest block on Unichain Sepolia was built by that workload
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

    console.log('Verifying latest block on Unichain Sepolia...\n');
    console.log(`Workload ID: ${workloadId}\n`);

    // Verify if the latest block was built by the specified TEE workload
    const result = await verifyFlashtestationInBlock(
      workloadId,
      'latest', // Use 'latest' to check the most recent block
      {
        chainId: 1301, // Unichain Sepolia testnet
        // Optional: provide custom RPC URL
        // rpcUrl: 'https://sepolia.unichain.org',
      }
    );

    // Display verification results
    console.log('Verification Results:');
    console.log('====================');

    if (result.isBuiltByExpectedTee) {
      console.log('\n✓ Block was built by the specified TEE workload!\n');
      console.log(`Workload ID: ${result.workloadId}`);
      console.log(`Commit Hash: ${result.commitHash}`);
      console.log(`Builder Address: ${result.builderAddress}`);
      console.log(`Version: ${result.version}`);
      console.log(`Source Locators: ${result.sourceLocators && result.sourceLocators.length > 0 ? result.sourceLocators.join(', ') : 'None'}`)
      if (result.blockExplorerLink) {
        console.log(`Block Explorer: ${result.blockExplorerLink}`);
      }
    } else {
      console.log('\n✗ Block was NOT built by the specified TEE workload.\n');
      console.log('The block either:');
      console.log('  1. Does not contain a flashtestation transaction');
      console.log('  2. Contains a flashtestation from a different workload');
    }

    // You can also verify specific blocks:
    // - By block number: await verifyFlashtestationInBlock(workloadId, 12345, { chainId: 1301 })
    // - By bigint number: await verifyFlashtestationInBlock(workloadId, BigInt(12345), { chainId: 1301 })
    // - By block hash: await verifyFlashtestationInBlock(workloadId, '0x...', { chainId: 1301 })
    // - By hex number: await verifyFlashtestationInBlock(workloadId, '0x3039', { chainId: 1301 })
    // - Other tags: 'earliest', 'finalized', 'safe', 'pending'

  } catch (error) {
    console.error('Error verifying block:', error);
    process.exit(1);
  }
}

// Run the example
main();
