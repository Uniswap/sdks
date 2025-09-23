/**
 * Result of flashtestation verification
 */
export interface VerificationResult {
  /** Whether the block was built by a TEE running the specified workload */
  is_built_by_TEE: boolean;
  /** Commit hash of the TEE workload source code, null if not TEE-built */
  commit_hash: string | null;
  /** Block explorer link for the block, null if not TEE-built */
  block_explorer_link: string | null;
  /** Address of the block builder, optional */
  builder_address?: string;
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
  /** Address that called the verification function */
  caller: string;
  /** Workload ID (bytes32 hex) */
  workloadId: string;
  /** Version of the proof (uint8) */
  version: number;
  /** Block content hash (bytes32 hex) */
  blockContentHash: string;
  /** Commit hash of the workload source code */
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
  | string   // hex block number
  | number;  // decimal block number

/**
 * Custom error classes for specific error scenarios
 */
export class NetworkError extends Error {
  constructor(message: string, public cause?: Error) {
    super(message);
    this.name = 'NetworkError';
  }
}

export class BlockNotFoundError extends Error {
  constructor(public blockParameter: BlockParameter) {
    super(`Block not found: ${blockParameter}`);
    this.name = 'BlockNotFoundError';
  }
}

export class ValidationError extends Error {
  constructor(message: string, public field?: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

export class ChainNotSupportedError extends Error {
  constructor(public chainId: number, public supportedChains: number[]) {
    super(`Chain ${chainId} not supported. Supported chains: ${supportedChains.join(', ')}`);
    this.name = 'ChainNotSupportedError';
  }
}