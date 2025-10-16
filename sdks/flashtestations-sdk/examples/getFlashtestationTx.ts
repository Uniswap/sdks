import { createRpcClient } from '../src/rpc/client';

/**
 * Example: Check if a transaction is a flashtestation transaction
 *
 * This example demonstrates how to:
 * 1. Create an RPC client for Unichain Sepolia (chain ID 1301)
 * 2. Check if a transaction emitted the BlockBuilderProofVerified event
 * 3. Retrieve the full transaction data if it's a flashtestation transaction
 * 4. Handle the case where the transaction is not a flashtestation
 */
async function main() {
  try {
    // Create RPC client for Unichain Sepolia (chain ID 1301)
    const client = createRpcClient({
      chainId: 1301, // Unichain Sepolia testnet
      // Optional: provide custom RPC URL
      // rpcUrl: 'https://sepolia.unichain.org',
      // Optional: configure retry behavior
      // maxRetries: 3,
      // initialRetryDelay: 1000,
    });

    // Example transaction hash to check
    // Replace this with an actual flashtestation transaction hash to test
    const txHash = '0x0000000000000000000000000000000000000000000000000000000000000000' as `0x${string}`;

    console.log(`Checking if transaction is a flashtestation: ${txHash}`);
    console.log('='.repeat(80));

    // Check if this transaction is a flashtestation
    const tx = await client.getFlashtestationTx(txHash);

    if (tx) {
      // This is a flashtestation transaction
      console.log('\n✓ This is a flashtestation transaction!\n');
      console.log('Transaction Details:');
      console.log('====================');
      console.log(`Hash: ${tx.hash}`);
      console.log(`Block Number: ${tx.blockNumber}`);
      console.log(`Block Hash: ${tx.blockHash}`);
      console.log(`From: ${tx.from}`);
      console.log(`To: ${tx.to ?? 'Contract Creation'}`);
      console.log(`Value: ${tx.value} wei`);
      console.log(`Gas: ${tx.gas}`);
      console.log(`Gas Price: ${tx.gasPrice ?? 'N/A'}`);
      console.log(`Nonce: ${tx.nonce}`);
      console.log(`Transaction Index: ${tx.transactionIndex}`);

      // Display input data (truncated)
      const inputPreview = tx.input.slice(0, 66) + (tx.input.length > 66 ? '...' : '');
      console.log(`Input Data: ${inputPreview}`);
      console.log(`Input Length: ${tx.input.length} bytes`);

      console.log('\nThis transaction emitted the BlockBuilderProofVerified event.');
      console.log('Event signature: BlockBuilderProofVerified(address,bytes32,uint8,bytes32,string)');
    } else {
      // This is not a flashtestation transaction
      console.log('\n✗ This is not a flashtestation transaction.');
      console.log('\nThe transaction either:');
      console.log('  1. Does not exist');
      console.log('  2. Did not emit the BlockBuilderProofVerified event');
    }

  } catch (error) {
    console.error('Error checking flashtestation transaction:', error);
    process.exit(1);
  }
}

// Run the example
main();
