interface BatchedCall {
    calls: Call[];
    revertOnFailure: boolean;
}
/**
 * ERC 5792 style Call interface
 */
interface Call {
    /** The address of the contract to call */
    to: `0x${string}`;
    /** The encoded calldata for the call */
    data: `0x${string}`;
    /** The amount of ETH to send with the call */
    value: bigint;
    /** The chain ID for the call (for client-side use) */
    chainId?: number | string;
}
/**
 * Parameters for method execution
 */
interface MethodParameters {
    /** Encoded calldata to be sent to the user's delegated account */
    calldata: `0x${string}`;
    /** The amount of ETH to send with the transaction */
    value: bigint;
}
/**
 * Options for the execute method
 */
interface ExecuteOptions {
    revertOnFailure?: boolean;
}

declare enum ChainId {
    MAINNET = 1,
    GOERLI = 5,
    SEPOLIA = 11155111,
    OPTIMISM = 10,
    OPTIMISM_GOERLI = 420,
    OPTIMISM_SEPOLIA = 11155420,
    ARBITRUM_ONE = 42161,
    ARBITRUM_GOERLI = 421613,
    ARBITRUM_SEPOLIA = 421614,
    POLYGON = 137,
    POLYGON_MUMBAI = 80001,
    CELO = 42220,
    CELO_ALFAJORES = 44787,
    GNOSIS = 100,
    MOONBEAM = 1284,
    BNB = 56,
    AVALANCHE = 43114,
    BASE_GOERLI = 84531,
    BASE_SEPOLIA = 84532,
    BASE = 8453,
    ZORA = 7777777,
    ZORA_SEPOLIA = 999999999,
    ROOTSTOCK = 30,
    BLAST = 81457,
    ZKSYNC = 324,
    WORLDCHAIN = 480,
    UNICHAIN_SEPOLIA = 1301,
    UNICHAIN = 130,
    MONAD_TESTNET = 10143,
    SONEIUM = 1868,
    MONAD = 143,
    XLAYER = 196
}

declare const DELEGATION_MAGIC_PREFIX = "0xef0100";
/**
 * The target address for self-calls is address(0)
 */
declare const SELF_CALL_TARGET = "0x0000000000000000000000000000000000000000";
/**
 * Call types for smart wallet calls
 * Follows ERC-7579
 */
declare enum ModeType {
    BATCHED_CALL = "0x0100000000000000000000000000000000000000000000000000000000000000",
    BATCHED_CALL_CAN_REVERT = "0x0101000000000000000000000000000000000000000000000000000000000000"
}
/**
 * Supported chain ids
 */
declare enum SupportedChainIds {
    MAINNET = 1,
    UNICHAIN = 130,
    UNICHAIN_SEPOLIA = 1301,
    SEPOLIA = 11155111,
    BASE = 8453,
    OPTIMISM = 10,
    BNB = 56,
    ARBITRUM_ONE = 42161,
    XLAYER = 196
}
/**
 * Supported smart wallet versions
 * @dev keyed by github release tag
 */
declare enum SmartWalletVersion {
    LATEST = "latest",
    v1_0_0 = "v1.0.0",
    v1_0_0_staging = "v1.0.0-staging"
}
type SmartWalletVersionMap = Partial<{
    [_version in SmartWalletVersion]: `0x${string}`;
}> & {
    [SmartWalletVersion.LATEST]: `0x${string}`;
};
/**
 * Smart wallet versions for supported chains
 */
declare const SMART_WALLET_VERSIONS: {
    [_chainId in SupportedChainIds]: SmartWalletVersionMap;
};
/**
 * Mapping of chainId to Smart Wallet contract addresses
 * @dev Used to get the latest version of the smart wallet
 *      See README for detailed deployment addresses along with the commit hash
 * @deprecated Use getSmartWalletAddress() instead of indexing this map directly.
 */
declare const SMART_WALLET_ADDRESSES: Record<string | number, `0x${string}`>;
/**
 * Get all historical smart wallet versions for a given chain id
 */
declare const getAllSmartWalletVersions: (chainId: SupportedChainIds) => `0x${string}`[];
/**
 * Get the latest Smart Wallet address for a given chain id.
 * Normalizes string ids to numbers and guards against prototype pollution.
 */
declare function getSmartWalletAddress(chainIdLike: number | string | ChainId): `0x${string}`;

declare const CALL_ABI_PARAMS: readonly [{
    readonly type: "tuple[]";
    readonly components: readonly [{
        readonly type: "address";
        readonly name: "to";
    }, {
        readonly type: "uint256";
        readonly name: "value";
    }, {
        readonly type: "bytes";
        readonly name: "data";
    }];
}];
/**
 * CallPlanner is used to encode a series Calls
 */
declare class CallPlanner {
    calls: Call[];
    /**
     * Create a new CallPlanner
     * @param calls optionally initialize with a list of calls
     */
    constructor(calls?: Call[]);
    /**
     * Get the total value of the calls
     */
    get value(): bigint;
    /**
     * abi encode the Calls[]
     */
    encode(): `0x${string}`;
    /**
     * Add a command to execute a call
     * @param to The target address of the call
     * @param value The ETH value to send with the call
     * @param data The calldata for the call
     */
    add(to: `0x${string}`, value: bigint, data: `0x${string}`): CallPlanner;
}

/**
 * Main SDK class for interacting with Uniswap smart wallet contracts
 */
declare class SmartWallet {
    /**
     * Creates method parameters for executing a simple batch of calls through a smart wallet
     * @param calls Array of calls to encode
     * @param options Basic options for the execution
     * @returns Method parameters with calldata and value
     */
    static encodeBatchedCall(calls: Call[], options?: ExecuteOptions): MethodParameters;
    /**
     * ERC7821 compatible entrypoint for executing batched calls through the contract
     * @deprecated use encodeBatchedCall instead unless you need to use the ERC7821 entrypoint
     */
    static encodeERC7821BatchedCall(calls: Call[], options?: ExecuteOptions): MethodParameters;
    /**
     * Creates a call to execute a method through a smart wallet
     * @dev can be refactored to return a Transaction object as well
     * @param methodParameters The method parameters to execute
     * @param chainId The chain ID for the smart wallet
     * @returns The call to execute
     */
    static createExecute(methodParameters: MethodParameters, chainId: ChainId): Call;
    /**
     * Get the mode type from the options
     */
    static getModeFromOptions(options: ExecuteOptions): ModeType;
    /** Internal methods */
    protected static _encodeERC7821Execute(mode: ModeType, data: `0x${string}`): `0x${string}`;
}

declare const VERSION = "0.1.0";

export { type BatchedCall, CALL_ABI_PARAMS, type Call, CallPlanner, DELEGATION_MAGIC_PREFIX, type ExecuteOptions, type MethodParameters, ModeType, SELF_CALL_TARGET, SMART_WALLET_ADDRESSES, SMART_WALLET_VERSIONS, SmartWallet, SmartWalletVersion, SupportedChainIds, VERSION, getAllSmartWalletVersions, getSmartWalletAddress };
