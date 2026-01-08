# Flashtestations SDK

A Typescript SDK for interacting (programmatically as well as via CLI) with the [Flashtestations protocol](https://github.com/flashbots/flashtestations)

## Overview

Flashtestations are cryptographic proofs that blockchain blocks were built by Trusted Execution Environments (TEEs) running a specific version of [Flashbot's op-rbuilder](https://github.com/flashbots/op-rbuilder/tree/main), which is the TEE-based builder used to build blocks on Unichain. This SDK allows you to verify whether blocks on Unichain networks were built by the expected versions of op-rbuilder running in a TEE. Unlike on other blockchains where you have no guarantee and thus must trust the block builder to build blocks [fairly](https://www.paradigm.xyz/2024/06/priority-is-all-you-need), with flashtestations you can cryptographically verify that a Unichain block has been built with a particular version of op-rbuilder.

The TEE devices that run Unichain's builder software provide hardware-enforced isolation and attestation, enabling transparent and verifiable block building. Each TEE workload (i.e. a specific version of op-rbuilder running in a TEE) is uniquely identified by measurement registers that cryptographically commit to the exact software running inside the TEE. When op-rbuilder builds a block on Unichain, it emits a "flashtestation" transaction as the last transaction in the block that proves which workload built that block.

This SDK simplifies the verification process by providing a single function to check if a block contains a valid flashtestation matching your expected workload ID. For more background on flashtestations and TEE-based block building, see the [flashtestations spec](https://github.com/flashbots/rollup-boost/blob/main/specs/flashtestations.md) and the [flashtestations smart contracts](https://github.com/flashbots/flashtestations).

## Getting Started

### Quick Start (No Installation Needed)

```bash
# print the latest flashtestation event data on Unichain Mainnet
npx @uniswap/flashtestations-sdk get-event
```

### Installation

```bash
npm install @uniswap/flashtestations-sdk
# or
yarn add @uniswap/flashtestations-sdk
```

### Quick Start (Importing the SDK)

```typescript
import { verifyFlashtestationInBlock } from '@uniswap/flashtestations-sdk';

async function main() {
  // Verify if the latest block on Unichain Mainnet was built by a specific TEE workload
  const result = await verifyFlashtestationInBlock(
    '0x05dcaf224f061f956e4c2df39220a3c17faba5552cf7228a0d571511c251fbfc', // An example workload ID
    'latest', // Block to verify (can be 'latest', 'pending', 'safe', 'finalized', number, or hash)
    { chainId: 130 } // Unichain Mainnet
  );

  if (result.isBuiltByExpectedTee) {
    console.log('✓ Block was built by the expected TEE workload!');
    console.log(`Workload ID: ${result.workloadMetadata.workloadId}`);
    console.log(`Commit Hash: ${result.workloadMetadata.commitHash}`);
    console.log(`Builder Address: ${result.workloadMetadata.builderAddress}`);
    console.log(`Version: ${result.workloadMetadata.version}`);
  } else {
    console.log('\n✗ Block was NOT built by the specified TEE workload\n');

    if (result.workloadMetadata) {
      console.log('Block was built by a different TEE workload:');
      console.log(`Workload ID: ${result.workloadMetadata.workloadId}`);
      console.log(`Commit Hash: ${result.workloadMetadata.commitHash}`);
      console.log(`Builder Address: ${result.workloadMetadata.builderAddress}`);
      console.log(`Version: ${result.workloadMetadata.version}`);
      console.log(
        `Source Locators: ${
          result.workloadMetadata.sourceLocators.length > 0
            ? result.workloadMetadata.sourceLocators.join(', ')
            : 'None'
        }`
      );
    } else {
      console.log('The block does not contain a flashtestation transaction');
    }
  }
}

// run the quick start
main();
```

## Supported Chains

| Chain                 | Chain ID  | Status     | RPC Configuration |
| ----------------      | --------- | ---------- | ----------------- |
| Unichain Mainnet      | 130       | Production | Auto-configured   |
| Unichain Sepolia      | 1301      | Testnet    | Auto-configured   |
| Unichain Alphanet     | 22444422  | Testnet    | Manually-provided |
| Unichain Experimental | 420120005 | Testnet    | Manually-provided |

## How Do I Acquire a Particular op-rbuilder's Workload ID?

The Flashtestations protocol exists to let you cryptographically verify that a particular version of op-rbuilder is in fact building the latest block's on Unichain. To cryptographically identify these op-rbuilder versions across all of the various components (the TEE, the smart contracts, and SDK) we use a 32-byte workload ID, which is a [hash of the measurement registers of the TEE attestation](https://github.com/flashbots/flashtestations/blob/38594f37b5f6d1b1f5f6ad4203a4770c10f72a22/src/BlockBuilderPolicy.sol#L208). But this workload ID tells us nothing about what op-rbuilder source code the builder operators used to build the final Linux OS image that runs on the TEE. We need a trustless (i.e. locally verifiable) method for calculating the workload ID, given a version of op-rbuilder.

That process is what the [flashbots-images](https://github.com/flashbots/flashbots-images) repo is for. Using this repo and a simple bash command, we build a Linux OS image containing a specific version of op-rbuilder (identified by its git commit hash), and then generate TDX attestation measurement registers from that image. We can then use those measurements to calculate the workload ID. This completes the full chain of trustless verification; given a particular commit hash of flashbots-images (which has hardcoded into it a particular version of op-rbuilder), we can locally build and measure the Linux OS image, pass those measurements to the flashtestations-sdk which computes the workload ID and uses the SDK's `verifyFlashtestationInBlock` function to verify "is Unichain building blocks with the latest version of op-rbuilder?".

Please see the [flashbots-images](https://github.com/flashbots/flashbots-images) repo instructions on how to locally build and measure a Linux OS image running op-rbuilder.

## API Reference

### verifyFlashtestationInBlock

Verify if a block was built by a TEE running a specific workload.

```typescript
async function verifyFlashtestationInBlock(
  workloadIdOrRegisters: string | WorkloadMeasurementRegisters,
  blockParameter: BlockParameter,
  config: ClientConfig
): Promise<VerificationResult>;
```

**Parameters:**

| Parameter             | Type                                 | Description                                                                 |
| --------------------- | ------------------------------------ | --------------------------------------------------------------------------- |
| workloadIdOrRegisters | `string \| WorkloadMeasurementRegisters` | Workload ID (32-byte hex string) or measurement registers to compute the ID |
| blockParameter        | `BlockParameter`                     | Block identifier: tag ('latest', 'earliest', etc.), number, or hash         |
| config                | `ClientConfig`                       | Configuration object with `chainId` and optional `rpcUrl`                   |

**Returns:** `Promise<VerificationResult>`

| Field                | Type             | Description                                                         |
| -------------------- | ---------------- | ------------------------------------------------------------------- |
| isBuiltByExpectedTee | `boolean`        | Whether the block was built by the expected TEE workload            |
| workloadId           | `string \| null` | Workload ID that built the block (null if not TEE-built)            |
| commitHash           | `string \| null` | Git commit hash of the workload source code (null if not TEE-built) |
| blockExplorerLink    | `string \| null` | Block explorer URL (null if not available)                          |
| builderAddress       | `string`         | Address of the block builder (optional)                             |
| version              | `number`         | Flashtestation protocol version                                     |
| sourceLocators       | `string[]`       | Source code locations (e.g., GitHub URLs)                           |

**Throws:**

- `NetworkError` - RPC connection failed or network request error
- `BlockNotFoundError` - Block does not exist
- `ValidationError` - Invalid measurement registers
- `ChainNotSupportedError` - Chain ID not supported

**See [Error Handling](#error-handling) for examples of handling these errors.**

### Utility Functions

#### computeWorkloadId

Compute a workload ID from TEE measurement registers. Useful for debugging or pre-computing IDs.

```typescript
function computeWorkloadId(registers: WorkloadMeasurementRegisters): string;
```

Returns the workload ID as a hex string.

#### getSupportedChains

Get list of all supported chain IDs.

```typescript
function getSupportedChains(): number[];
```

Returns an array of supported chain IDs: `[130, 1301]`

#### isChainSupported

Check if a chain ID is supported.

```typescript
function isChainSupported(chainId: number): boolean;
```

Returns `true` if the chain is supported, `false` otherwise.

#### getChainConfig

Get the full configuration for a chain.

```typescript
function getChainConfig(chainId: number): ChainConfig;
```

Returns a `ChainConfig` object with chain details (name, contract address, RPC URL, block explorer URL).

**Throws:** `ChainNotSupportedError` if the chain is not supported.

## Error Handling

The SDK provides custom error classes for specific failure scenarios.

### NetworkError

Thrown when RPC connection fails or network requests error out.

```typescript
import { verifyFlashtestationInBlock, NetworkError } from '@uniswap/flashtestations-sdk';

try {
  const result = await verifyFlashtestationInBlock('0xabcd...', 'latest', {
    chainId: 1301,
    rpcUrl: 'https://invalid-rpc.example.com',
  });
} catch (error) {
  if (error instanceof NetworkError) {
    console.error('Network error:', error.message);
    console.error('Cause:', error.cause);
    // Retry with exponential backoff or fallback RPC
  }
}
```

### BlockNotFoundError

Thrown when the specified block does not exist on the chain.

```typescript
import { BlockNotFoundError } from '@uniswap/flashtestations-sdk';

try {
  const result = await verifyFlashtestationInBlock('0xabcd...', 999999999, {
    chainId: 1301,
  });
} catch (error) {
  if (error instanceof BlockNotFoundError) {
    console.error('Block not found:', error.blockParameter);
    // Try a different block or handle gracefully
  }
}
```

### ValidationError

Thrown when measurement registers are invalid (wrong format or length).

```typescript
import { ValidationError } from '@uniswap/flashtestations-sdk';

try {
  const invalidRegisters = {
    tdattributes: '0x00', // Too short!
    xfam: '0x0000000000000003',
    // ... other fields
  };
  const result = await verifyFlashtestationInBlock(invalidRegisters, 'latest', {
    chainId: 1301,
  });
} catch (error) {
  if (error instanceof ValidationError) {
    console.error('Validation error:', error.message);
    console.error('Field:', error.field);
    // Fix the invalid field
  }
}
```

### ChainNotSupportedError

Thrown when trying to use an unsupported chain ID.

```typescript
import { ChainNotSupportedError } from '@uniswap/flashtestations-sdk';

try {
  const result = await verifyFlashtestationInBlock('0xabcd...', 'latest', {
    chainId: 999, // Not supported
  });
} catch (error) {
  if (error instanceof ChainNotSupportedError) {
    console.error('Chain not supported:', error.chainId);
    console.error('Supported chains:', error.supportedChains);
    // Use one of the supported chains
  }
}
```

### Error Handling Best Practices

- **Retry on NetworkError**: Implement exponential backoff for transient network failures
- **Validate inputs early**: Check chain support with `isChainSupported()` before calling verification
- **Handle missing blocks gracefully**: `BlockNotFoundError` may indicate the block hasn't been mined yet
- **Log error context**: All custom errors include additional context properties for debugging
- **Use fallback RPC endpoints**: Provide alternative `rpcUrl` options for better reliability

## CLI Examples

The SDK includes a CLI for quick verification from the terminal. Run commands using `npx`:

```bash
npx . <command> [options]
```

### List Supported Chains

```bash
# View all supported chains and their configuration
npx . chains

# Output as JSON
npx . chains --json
```

### Verify a Block

Verify if a block was built by an expected TEE workload:

```bash
# Verify latest block on Unichain Mainnet (default) with a workload ID
npx . verify --workload-id 0x306ab4fe782dde50a97584b6d4cad9375f7b5d02199c4c78821ad6622670c6b7

# Verify using measurement registers from a JSON file
npx . verify --measurements ./example-measurements.json --block latest

# Use a custom RPC URL
npx . verify -w 0x05dcaf224f061f956e4c2df39220a3c17faba5552cf7228a0d571511c251fbfc --rpc-url https://my-rpc.example.com --chain-id 130

# Output as JSON (useful for scripting)
npx . verify -w 0x05dcaf224f061f956e4c2df39220a3c17faba5552cf7228a0d571511c251fbfc --json
```

**Exit codes:**
- `0` - Block was built by the expected TEE workload
- `1` - Error occurred (network error, invalid input, etc.)
- `2` - Block was NOT built by the expected TEE workload

### Get Flashtestation Event

Retrieve flashtestation transaction data from a block without verification:

```bash
# Get event from the latest block on Unichain Sepolia
npx . get-event

# Output as JSON
npx . get-event --block latest --json
```

### Compute Workload ID

Compute a workload ID from TEE measurement registers:

```bash
# Compute workload ID from a measurements JSON file
npx . compute-workload-id --measurements ./example-measurements.json

# Output as JSON
npx . compute-workload-id -m ./measurements.json --json
```

The measurements JSON file should contain the TDX measurement registers:

```json
{
  "tdattributes": "0x0000000000000000",
  "xfam": "0x0000000000000003",
  "mrtd": "0x1234567890abcdef...",
  "mrconfigid": "0x0000000000000000...",
  "rtmr0": "0xabcdef1234567890...",
  "rtmr1": "0xef0123456789abcd...",
  "rtmr2": "0x234567890abcdef1...",
  "rtmr3": "0x67890abcdef12345..."
}
```

### Common Options

| Option | Description |
| ------ | ----------- |
| `-c, --chain-id <id>` | Specify chain ID directly |
| `--chain unichain-mainnet` | Use Unichain Mainnet (chain ID 130) [default] |
| `--chain unichain-sepolia` | Use Unichain Sepolia (chain ID 1301) |
| `-r, --rpc-url <url>` | Use a custom RPC URL |
| `--json` | Output results as JSON |
| `-V, --version` | Show CLI version |
| `-h, --help` | Show help for a command |

## Programmatic Examples

See the [examples/](./examples) directory for complete runnable examples:

- `verifyBlock.ts` - Verify blocks with workload ID
- `getFlashtestationEvent.ts` - Retrieve flashtestation transaction data
- `computeWorkloadIdWithMeasurements.ts` - Compute a 32-byte workload ID given a TDX measurement registers in JSON format

**Running examples:**

```bash
# Set your workload ID
export WORKLOAD_ID=0x1234567890abcdef...

# Run the verification example
npx tsx examples/verifyBlock.ts
```

## Development

### Building the SDK

```bash
yarn build
```

This compiles the TypeScript source to CommonJS, ESM, and TypeScript declaration files in the `dist/` directory.

### Running Tests

```bash
yarn test
```

### Linting

```bash
yarn lint
```
