import { getFlashtestationEvent } from '../src/index';

/**
 * Example: Check if a block contains a flashtestation transaction
 * 
 * Usage:
 *   npx tsx examples/getFlashtestationEvent.ts
 *
 * This example demonstrates how to:
 * 1. Use the getFlashtestationEvent function to fetch flashtestation data from a block
 * 2. Retrieve the full flashtestation event data if present
 * 3. Handle the case where the block does not contain a flashtestation transaction
 */
async function main() {
  try {
    const chainId = parseInt(process.env.CHAIN_ID || '130'); // default to Unichain Mainnet

    // Fetch flashtestation transaction from the latest block on the specified chain
    const event = await getFlashtestationEvent('latest', {
      chainId: chainId,
      // Optional: provide custom RPC URL
      // rpcUrl: 'https://mainnet.unichain.org',
    });

    if (event) {
      // This is a flashtestation transaction
      console.log('\n✓ This is a flashtestation transaction!\n');
      console.log('Transaction Details:');
      console.log('====================');
      console.log(`Caller: ${event.caller}`);
      console.log(`Workload ID: ${event.workloadId}`);
      console.log(`Version: ${event.version}`);
      console.log(`Block Content Hash: ${event.blockContentHash}`);
      console.log(`Commit Hash: ${event.commitHash}`);
      console.log(`Source Locators: ${event.sourceLocators.length > 0 ? event.sourceLocators.join(', ') : 'None'}`);
    } else {
      // This is not a flashtestation transaction
      console.log('\n✗ This is not a flashtestation transaction');
      console.log('\nThe transaction did not emit the BlockBuilderProofVerified event');
    }

  } catch (error) {
    console.error('Error checking flashtestation transaction:', error);
    process.exit(1);
  }
}

// Run the example
main();
