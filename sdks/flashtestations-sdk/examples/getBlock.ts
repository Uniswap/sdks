import { createRpcClient } from '../src/rpc/client';

/**
 * Example: Fetch the most recent block from Unichain Sepolia
 *
 * This example demonstrates how to:
 * 1. Create an RPC client for Unichain Sepolia (chain ID 1301)
 * 2. Fetch the latest block using the 'latest' block tag
 * 3. Display block information
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

    console.log('Fetching latest block from Unichain Sepolia...\n');

    // Fetch the latest block
    const block = await client.getBlock('latest');

    // Display block information
    console.log('Block Information:');
    console.log('==================');
    console.log(`Block Number: ${block.number}`);
    console.log(`Block Hash: ${block.hash}`);
    console.log(`Parent Hash: ${block.parentHash}`);
    console.log(`Timestamp: ${block.timestamp} (${new Date(Number(block.timestamp) * 1000).toISOString()})`);
    console.log(`Gas Used: ${block.gasUsed}`);
    console.log(`Gas Limit: ${block.gasLimit}`);
    console.log(`Base Fee Per Gas: ${block.baseFeePerGas ?? 'N/A'}`);
    console.log(`Transactions: ${block.transactions.length}`);
    console.log(`Miner/Validator: ${block.miner}`);

    // You can also fetch specific blocks:
    // - By block number: await client.getBlock(12345)
    // - By bigint number: await client.getBlock(BigInt(12345))
    // - By block hash: await client.getBlock('0x...')
    // - By hex number: await client.getBlock('0x3039')
    // - Other tags: 'earliest', 'finalized', 'safe', 'pending'

  } catch (error) {
    console.error('Error fetching block:', error);
    process.exit(1);
  }
}

// Run the example
main();
