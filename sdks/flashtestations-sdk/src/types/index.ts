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
 * All hex values can be provided with or without the '0x' prefix.
 *
 * Example:
 * const registers: WorkloadMeasurementRegisters = {
    tdattributes: '0x0000000000000000',
    xfam: '0xe700060000000000',
    mrtd: ["202c7d38558f7cfa086feca5a23d62fa071cceb0bd55dbd06eeb4cebbd3c204c209f5551914d41ce433fb7fd67cc7136",
      "3c372ef16cb892bffd91163b8b92322abee6be34473b845bc63075072c2c0d5ba805f314afaddade64437f50018cfbd5"],
    mrconfigid: '0x000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000',
    rtmr0: ["6da49936a0649f6970be5df8bf7ba0d2efb66a96216c11cc65ac348432a07cfaab037b173e22c54d3f10d59327e7fbc9",
      "f5cea78565e130d0e2e93429f20d269fa60aaa6bee68dd27afec0f85e3ccb885f4681ba9885b06a2ae8d202f356785a9"],
    rtmr1: 'c6ab9b2d76aefcfc56d41774ecf42670cbd77505b5c3f2bf77b3ff02fe5e486d476fa1332632412482d969449ed1ddb8',
    rtmr2: '4dfecccb8027b27f4521fa8ec751362d4f2ab351aad6f0977eea49844470f3cdfcfb7e9f73159b27224111280caabbfb',
    rtmr3: '0x000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000',
  }
 */
export interface WorkloadMeasurementRegisters {
  /** TD attributes (8 bytes hex) */
  tdattributes: string;
  /** xfam (8 bytes hex) */
  xfam: string;
  /** MRTD - Measurement of the TD (48 bytes hex)
   * It can also be an array of 48 byte hex strings. We do this as a workaround for the
   * following problem: the mrtd value on GCP's TEE's is not 100% reproducible from the
   * VM image alone. There are some opaque components of the VM image build process that are
   * firmware-version-dependent. To account for this, we allow multiple mrtd values as input,
   * and when verifying measurement registers against a given workload ID, we check if any of the
   * provided mrtd values result in a matching workload ID
   */
  mrtd: string | string[];
  /** MR Config ID - VMM configuration (48 bytes hex) */
  mrconfigid: string;
  /** Runtime Measurement Register 0 (48 bytes hex)
   * It can also be an array of 48 byte hex strings. We do this as a workaround for the
   * following problem: the rtmr0 value on GCP's TEE's is not 100% reproducible from the
   * VM image alone. There are some opaque components of the VM image build process that are
   * firmware-version-dependent. To account for this, we allow multiple rtmr0 values as input,
   * and when verifying measurement registers against a given workload ID, we check if any of the
   * provided rtmr0 values result in a matching workload ID
   */
  rtmr0: string | string[];
  /** Runtime Measurement Register 1 (48 bytes hex) */
  rtmr1: string;
  /** Runtime Measurement Register 2 (48 bytes hex) */
  rtmr2: string;
  /** Runtime Measurement Register 3 (48 bytes hex) */
  rtmr3: string;
}

/**
 * TEE workload measurement registers with single values only (no arrays).
 * This type is used for workload ID computation where only one concrete set
 * of register values can be processed at a time.
 *
 * Use this type when you need to compute a single workload ID.
 * Use `WorkloadMeasurementRegisters` when accepting input that may contain
 * multiple possible values for mrtd and rtmr0.
 */
export interface SingularWorkloadMeasurementRegisters {
  /** TD attributes (8 bytes hex) */
  tdattributes: string;
  /** xfam (8 bytes hex) */
  xfam: string;
  /** MRTD - Measurement of the TD (48 bytes hex) - single value only */
  mrtd: string;
  /** MR Config ID - VMM configuration (48 bytes hex) */
  mrconfigid: string;
  /** Runtime Measurement Register 0 (48 bytes hex) - single value only */
  rtmr0: string;
  /** Runtime Measurement Register 1 (48 bytes hex) */
  rtmr1: string;
  /** Runtime Measurement Register 2 (48 bytes hex) */
  rtmr2: string;
  /** Runtime Measurement Register 3 (48 bytes hex) */
  rtmr3: string;
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
  blockContentHash: string;
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
