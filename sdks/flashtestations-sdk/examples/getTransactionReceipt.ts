import { createRpcClient } from '../src/rpc/client';

/**
 * Example: Fetch a transaction receipt from Unichain Sepolia
 *
 * This example demonstrates how to:
 * 1. Create an RPC client for Unichain Sepolia (chain ID 1301)
 * 2. Fetch a transaction receipt by transaction hash
 * 3. Display transaction receipt information
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

    // fetch an arbitrary transaction hash from the latest block
    const txHash = await client.getBlock('latest').then(block => block.transactions[0]) as `0x${string}`;

    // Fetch the transaction receipt
    const receipt = await client.getTransactionReceipt(txHash as `0x${string}`);

    // Display transaction receipt information
    console.log('Transaction Receipt:');
    console.log('====================');
    console.log(`Transaction Hash: ${receipt.transactionHash}`);
    console.log(`Block Number: ${receipt.blockNumber}`);
    console.log(`Block Hash: ${receipt.blockHash}`);
    console.log(`From: ${receipt.from}`);
    console.log(`To: ${receipt.to ?? 'Contract Creation'}`);
    console.log(`Contract Address: ${receipt.contractAddress ?? 'N/A'}`);
    console.log(`Status: ${receipt.status === 'success' ? '✓ Success' : '✗ Failed'}`);
    console.log(`Gas Used: ${receipt.gasUsed}`);
    console.log(`Effective Gas Price: ${receipt.effectiveGasPrice}`);
    console.log(`Cumulative Gas Used: ${receipt.cumulativeGasUsed}`);
    console.log(`Transaction Index: ${receipt.transactionIndex}`);
    console.log(`Logs: ${receipt.logs.length} log(s)`);

    // Display logs if present
    if (receipt.logs.length > 0) {
      console.log('\nLog Details:');
      receipt.logs.forEach((log, index) => {
        console.log(`\n  Log ${index}:`);
        console.log(`    Address: ${log.address}`);
        console.log(`    Topics: ${log.topics.length}`);
        console.log(`    Data: ${log.data.slice(0, 66)}${log.data.length > 66 ? '...' : ''}`);
      });
    }

    // Display bloom filter info
    console.log(`\nLogs Bloom: ${receipt.logsBloom.slice(0, 66)}...`);

  } catch (error) {
    console.error('Error fetching transaction receipt:', error);
    process.exit(1);
  }
}

// Run the example
main();
