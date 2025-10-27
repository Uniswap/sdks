/**
 * Result of flashtestation verification
 */
export interface VerificationResult {
  /** Whether the block was built by a TEE running the specified workload */
  isBuiltByExpectedTee: boolean;
  /** Commit hash of the TEE workload source code, null if not TEE-built */
  commitHash: string | null;
  /** Block explorer link for the block, null if not TEE-built */
  blockExplorerLink: string | null;
  /** Address of the block builder, optional */
  builderAddress?: string;
}

/**
 * TEE workload measurement registers used for workload ID computation
 */
export interface WorkloadMeasureRegisters {
  /** TD attributes (8 bytes hex) */
  tdAttributes: string;
  /** xFAM (8 bytes hex) */
  xFAM: string;
  /** MRTD - Measurement of the TD (48 bytes hex) */
  mrTd: string;
  /** MR Config ID - VMM configuration (48 bytes hex) */
  mrConfigId: string;
  /** Runtime Measurement Register 0 (48 bytes hex) */
  rtMr0: string;
  /** Runtime Measurement Register 1 (48 bytes hex) */
  rtMr1: string;
  /** Runtime Measurement Register 2 (48 bytes hex) */
  rtMr2: string;
  /** Runtime Measurement Register 3 (48 bytes hex) */
  rtMr3: string;
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
