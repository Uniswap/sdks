type WorkloadMetadata = {
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
};
/**
 * Result of flashtestation verification
 */
type VerificationResult = {
    /** Block was built by the expected TEE workload */
    isBuiltByExpectedTee: true;
    blockExplorerLink: string | null;
    workloadMetadata: WorkloadMetadata;
} | {
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
interface WorkloadMeasurementRegisters {
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
interface SingularWorkloadMeasurementRegisters {
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
interface FlashtestationEvent {
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
interface ChainConfig {
    /** Chain ID */
    chainId: number;
    /** Human readable chain name */
    name: string;
    /** CLI-friendly slug for --chain argument (e.g., 'unichain-mainnet') */
    slug: string;
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
interface ClientConfig {
    /** Chain ID to network */
    chainId: number;
    /** Optional custom RPC URL (overrides default) */
    rpcUrl?: string;
}
/**
 * Block parameter for identifying blocks
 */
type BlockParameter = 'earliest' | 'latest' | 'safe' | 'finalized' | 'pending' | string | number | bigint;
/**
 * Custom error classes for specific error scenarios
 */
declare class NetworkError extends Error {
    cause?: Error | undefined;
    constructor(message: string, cause?: Error | undefined);
}
declare class BlockNotFoundError extends Error {
    blockParameter: BlockParameter;
    constructor(blockParameter: BlockParameter);
}
declare class ValidationError extends Error {
    field?: string | undefined;
    constructor(message: string, field?: string | undefined);
}
declare class ChainNotSupportedError extends Error {
    chainId: number;
    supportedChains: number[];
    constructor(chainId: number, supportedChains: number[]);
}

/**
 * Fetch the event data of the flashtestation transaction from a specific block
 *
 * This function retrieves the flashtestation event (if any) from the specified block.
 * Unlike verifyFlashtestationInBlock, this does not perform any workload verification - it
 * simply returns the raw flashtestation event data.
 *
 * @param blockParameter - Block identifier (tag, number, or hash), defaults to 'latest'
 * @param config - Configuration for chain and RPC connection
 * @returns FlashtestationEvent if the block contains a flashtestation transaction, null otherwise
 * @throws NetworkError if RPC connection fails
 * @throws BlockNotFoundError if block doesn't exist
 *
 * @example
 * // Get flashtestation event from the latest block
 * const flashtestationEvent = await getFlashtestationEvent('latest', { chainId: 1301 });
 * if (flashtestationEvent) {
 *   console.log('Workload ID:', flashtestationEvent.workloadId);
 *   console.log('Commit Hash:', flashtestationEvent.commitHash);
 * }
 *
 * @example
 * // Get flashtestation event data from a specific block number
 * const flashtestationEvent = await getFlashtestationEvent(12345, { chainId: 1301 });
 */
declare function getFlashtestationEvent(blockParameter: BlockParameter | undefined, config: ClientConfig): Promise<FlashtestationEvent | null>;
/**
 * Verify if a block was built by a TEE running a specific workload
 *
 * This is the main entry point for flashtestation verification. It checks if
 * the specified block contains a flashtestation transaction whose event data matches the
 * provided workload ID or measurement registers.
 *
 * @param workloadIdOrRegisters - Either a workload ID string or measurement registers to compute the ID
 * @param blockParameter - Block identifier (tag, number, or hash)
 * @param config - Configuration for chain and RPC connection
 * @returns Verification result indicating if block was built by the specified TEE workload
 * @throws NetworkError if RPC connection fails
 * @throws BlockNotFoundError if block doesn't exist
 * @throws ValidationError if measurement registers are invalid
 *
 * @example
 * // Verify using a workload ID
 * const result = await verifyFlashtestationInBlock(
 *   '0x1234...',
 *   'latest',
 *   { chainId: 1301 }
 * );
 *
 * @example
 * // Verify using measurement registers
 * const registers = {
 *   tdattributes: '0x0000000000000000',
 *   xfam: '0x0000000000000003',
 *   mrtd: '0x1234...',
 *   mrconfigid: '0x0000...',
 *   rtmr0: '0xabcd...',
 *   rtmr1: '0xef01...',
 *   rtmr2: '0x2345...',
 *   rtmr3: '0x6789...',
 * };
 * const result = await verifyFlashtestationInBlock(
 *   registers,
 *   12345,
 *   { chainId: 1301 }
 * );
 */
declare function verifyFlashtestationInBlock(workloadIdOrRegisters: string | WorkloadMeasurementRegisters, blockParameter: BlockParameter, config: ClientConfig): Promise<VerificationResult>;

/**
 * Get the chain configuration for a given chain ID
 * @param chainId - The chain ID
 * @returns The complete chain configuration
 * @throws ChainNotSupportedError if chain is not supported
 */
declare function getChainConfig(chainId: number): ChainConfig;
/**
 * Get list of all supported chain IDs
 * @returns Array of supported chain IDs
 */
declare function getSupportedChains(): number[];
/**
 * Check if a chain ID is supported
 * @param chainId - The chain ID to check
 * @returns True if the chain is supported, false otherwise
 */
declare function isChainSupported(chainId: number): boolean;

/**
 * Computes workload ID from TEE measurement registers
 * Formula: keccak256(mrTd + rtMr0 + rtMr1 + rtMr2 + rtMr3 + mrConfigId + (xFAM ^ expectedXfamBits) + (tdAttributes & ~ignoredTdAttributesBitmask))
 * This is copied from the Solidity implementation of the workload ID computation at:
 * https://github.com/flashbots/flashtestations/blob/38594f37b5f6d1b1f5f6ad4203a4770c10f72a22/src/BlockBuilderPolicy.sol#L208
 *
 * @param registers - Singular workload measurement registers
 * @returns The computed workload ID as a hex string
 *
 * @remarks
 * This function only accepts singular registers. If you have registers with multiple
 * possible values (arrays), use `computeAllWorkloadIds()` or `expandToSingularRegisters()` first.
 */
declare function computeWorkloadId(registers: SingularWorkloadMeasurementRegisters): string;
/**
 * Expands WorkloadMeasurementRegisters with array fields into all possible
 * singular register combinations (cartesian product of mrTd and rtMr0 values)
 *
 * @param registers - Flexible registers that may contain arrays
 * @returns Array of all possible singular register combinations
 *
 * @example
 * ```typescript
 * const input = {
 *   // ... other fields
 *   mrtd: ['0xaaa...', '0xbbb...'],
 *   rtmr0: ['0xccc...', '0xddd...']
 * };
 * // Returns 4 combinations: (aaa,ccc), (aaa,ddd), (bbb,ccc), (bbb,ddd)
 * const singularRegisters = expandToSingularRegisters(input);
 * ```
 */
declare function expandToSingularRegisters(registers: WorkloadMeasurementRegisters): SingularWorkloadMeasurementRegisters[];

export { BlockNotFoundError, type BlockParameter, type ChainConfig, ChainNotSupportedError, type ClientConfig, type FlashtestationEvent, NetworkError, type SingularWorkloadMeasurementRegisters, ValidationError, type VerificationResult, type WorkloadMeasurementRegisters, computeWorkloadId, expandToSingularRegisters, getChainConfig, getFlashtestationEvent, getSupportedChains, isChainSupported, verifyFlashtestationInBlock };
