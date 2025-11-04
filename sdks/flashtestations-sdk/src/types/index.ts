export type WorkloadMetadata = {
  /** workload ID of the TEE workload*/
  workloadId: string;
  /** Commit hash of the TEE workload source code */
  commitHash: string;
  /** Address of the block builder, optional */
  builderAddress: string;
  /** Version of the flashtestation protocol, optional */
  version: number;
  /** Source locators (e.g., GitHub URLs) for the workload source code, optional for backwards compatibility */
  sourceLocators: string[];
}

/**
 * Result of flashtestation verification
 */
export type VerificationResult = | {
  /** Block was built by the expected TEE workload */
  isBuiltByExpectedTee: true;
  blockExplorerLink: string | null;
  workloadMetadata: WorkloadMetadata;
}
| {
  /** Block was NOT built by the expected TEE workload */
  isBuiltByExpectedTee: false;
  blockExplorerLink: string | null;
  workloadMetadata: WorkloadMetadata | null;
};

/**
 * TEE workload measurement registers used for workload ID computation
 */
export interface WorkloadMeasureRegisters {
  /** TD attributes (8 bytes hex) */
  tdAttributes: `0x${string}`;
  /** xFAM (8 bytes hex) */
  xFAM: `0x${string}`;
  /** MRTD - Measurement of the TD (48 bytes hex) */
  mrTd: `0x${string}`;
  /** MR Config ID - VMM configuration (48 bytes hex) */
  mrConfigId: `0x${string}`;
  /** Runtime Measurement Register 0 (48 bytes hex) */
  rtMr0: `0x${string}`;
  /** Runtime Measurement Register 1 (48 bytes hex) */
  rtMr1: `0x${string}`;
  /** Runtime Measurement Register 2 (48 bytes hex) */
  rtMr2: `0x${string}`;
  /** Runtime Measurement Register 3 (48 bytes hex) */
  rtMr3: `0x${string}`;
}

/**
 * Parsed flashtestation event from BlockBuilderProofVerified
 */
export interface FlashtestationEvent {
  /** Address of the block builder */
  caller: string;
  /** Hash indentifier for the workload (bytes32 hex) */
  workloadId: string;
  /** Version of the flashtestation protocol */
  version: number;
  /** Hash of the block content (i.e. all of the block's transactions, except the flashtestation transaction itself) (bytes32 hex) */
  blockContentHash: `0x${string}`;
  /** git commit ID of the code used to reproducibly build the workload (string) */
  commitHash: string;
  /** Source locators (e.g., GitHub URLs) for the workload source code */
  sourceLocators: string[];
}

/**
 * Chain configuration for multi-chain support
 */
export interface ChainConfig {
  /** Chain ID */
  chainId: number;
  /** Human readable chain name */
  name: string;
  /** BlockBuilderPolicy contract address */
  contractAddress: string;
  /** Default RPC URL for this chain */
  defaultRpcUrl: string;
  /** Block explorer base URL */
  blockExplorerUrl: string;
}

/**
 * Minimal configuration options for the JSON-RPC client to interact with the blockchain
 */
export interface ClientConfig {
  /** Chain ID to network */
  chainId: number;
  /** Optional custom RPC URL (overrides default) */
  rpcUrl?: string;
}

/**
 * Block parameter for identifying blocks
 */
export type BlockParameter =
  | 'earliest'
  | 'latest'
  | 'safe'
  | 'finalized'
  | 'pending'
  | string // hex block number or block hash
  | number // decimal block number
  | bigint; // bigint block number

/**
 * Custom error classes for specific error scenarios
 */
export class NetworkError extends Error {
  constructor(message: string, public cause?: Error) {
    super(message);
    this.name = 'NetworkError';
    // Maintains proper prototype chain for instanceof checks
    Object.setPrototypeOf(this, NetworkError.prototype);
  }
}

export class BlockNotFoundError extends Error {
  constructor(public blockParameter: BlockParameter) {
    super(`Block not found: ${blockParameter}`);
    this.name = 'BlockNotFoundError';
    // Maintains proper prototype chain for instanceof checks
    Object.setPrototypeOf(this, BlockNotFoundError.prototype);
  }
}

export class ValidationError extends Error {
  constructor(message: string, public field?: string) {
    super(message);
    this.name = 'ValidationError';
    // Maintains proper prototype chain for instanceof checks
    Object.setPrototypeOf(this, ValidationError.prototype);
  }
}

export class ChainNotSupportedError extends Error {
  constructor(public chainId: number, public supportedChains: number[]) {
    super(
      `Chain ${chainId} not supported. Supported chains: ${supportedChains.join(
        ', '
      )}`
    );
    this.name = 'ChainNotSupportedError';
    // Maintains proper prototype chain for instanceof checks
    Object.setPrototypeOf(this, ChainNotSupportedError.prototype);
  }
}
