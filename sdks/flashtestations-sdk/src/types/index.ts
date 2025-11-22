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
 * 
 * Example:
 * const registers: WorkloadMeasurementRegisters = {
    tdAttributes: '0x0000000000000000' as `0x${string}`,
    xFAM: '0xe700060000000000' as `0x${string}`,
    mrTd: ["202c7d38558f7cfa086feca5a23d62fa071cceb0bd55dbd06eeb4cebbd3c204c209f5551914d41ce433fb7fd67cc7136",
      "3c372ef16cb892bffd91163b8b92322abee6be34473b845bc63075072c2c0d5ba805f314afaddade64437f50018cfbd5"],
    mrConfigId: '0x000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000' as `0x${string}`,
    rtMr0: ["6da49936a0649f6970be5df8bf7ba0d2efb66a96216c11cc65ac348432a07cfaab037b173e22c54d3f10d59327e7fbc9",
      "f5cea78565e130d0e2e93429f20d269fa60aaa6bee68dd27afec0f85e3ccb885f4681ba9885b06a2ae8d202f356785a9"],
    rtMr1: 'c6ab9b2d76aefcfc56d41774ecf42670cbd77505b5c3f2bf77b3ff02fe5e486d476fa1332632412482d969449ed1ddb8' as `0x${string}`,
    rtMr2: '4dfecccb8027b27f4521fa8ec751362d4f2ab351aad6f0977eea49844470f3cdfcfb7e9f73159b27224111280caabbfb' as `0x${string}`,
    rtMr3: '0x000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000' as `0x${string}`,
  }
 */
export interface WorkloadMeasurementRegisters {
  /** TD attributes (8 bytes hex) */
  tdAttributes: `0x${string}`;
  /** xFAM (8 bytes hex) */
  xFAM: `0x${string}`;
  /** MRTD - Measurement of the TD (48 bytes hex)
   * It can also be an array of 48 byte hex strings. We do this as a workaround for the
   * following problem: the mrTd value on GCP's TEE's is not 100% reproducible from the
   * VM image alone. There are some opaque components of the VM image build process that are
   * firmware-version-dependent. To account for this, we allow multiple mrTd values as input,
   * and when verifying measurement registers against a given workload ID, we check if any of the
   * provided mrTd values result in a matching workload ID
   */
  mrTd: `0x${string}` | `0x${string}`[];
  /** MR Config ID - VMM configuration (48 bytes hex) */
  mrConfigId: `0x${string}`;
  /** Runtime Measurement Register 0 (48 bytes hex)
   * It can also be an array of 48 byte hex strings. We do this as a workaround for the
   * following problem: the rtMr0 value on GCP's TEE's is not 100% reproducible from the
   * VM image alone. There are some opaque components of the VM image build process that are
   * firmware-version-dependent. To account for this, we allow multiple rtMr0 values as input,
   * and when verifying measurement registers against a given workload ID, we check if any of the
   * provided rtMr0 values result in a matching workload ID
   */
  rtMr0: `0x${string}` | `0x${string}`[];
  /** Runtime Measurement Register 1 (48 bytes hex) */
  rtMr1: `0x${string}`;
  /** Runtime Measurement Register 2 (48 bytes hex) */
  rtMr2: `0x${string}`;
  /** Runtime Measurement Register 3 (48 bytes hex) */
  rtMr3: `0x${string}`;
}

/**
 * TEE workload measurement registers with single values only (no arrays).
 * This type is used for workload ID computation where only one concrete set
 * of register values can be processed at a time.
 *
 * Use this type when you need to compute a single workload ID.
 * Use `WorkloadMeasurementRegisters` when accepting input that may contain
 * multiple possible values for mrTd and rtMr0.
 */
export interface SingularWorkloadMeasurementRegisters {
  /** TD attributes (8 bytes hex) */
  tdAttributes: `0x${string}`;
  /** xFAM (8 bytes hex) */
  xFAM: `0x${string}`;
  /** MRTD - Measurement of the TD (48 bytes hex) - single value only */
  mrTd: `0x${string}`;
  /** MR Config ID - VMM configuration (48 bytes hex) */
  mrConfigId: `0x${string}`;
  /** Runtime Measurement Register 0 (48 bytes hex) - single value only */
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
