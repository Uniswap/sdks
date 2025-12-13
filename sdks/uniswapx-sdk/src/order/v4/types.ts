import { BigNumber } from "ethers";

/**
 * V4 OrderInfo structure with hooks support
 * Mirrors mandatory-hook reactor contract
 */
export type OrderInfoV4 = {
  reactor: string;
  swapper: string;
  nonce: BigNumber;
  deadline: number;
  preExecutionHook: string;
  preExecutionHookData: string;
  postExecutionHook: string;
  postExecutionHookData: string;
  auctionResolver: string;
};

/**
 * Signed order container for V4
 * Encoded as: abi.encode(resolver, abi.encode(resolverSpecificOrder))
 */
export type SignedOrder = {
  order: string;
  sig: string;
};

/**
 * Input token specification
 */
export type InputToken = {
  token: string;
  amount: BigNumber;
  maxAmount: BigNumber;
};

/**
 * Output token specification
 * address(0) for native ETH
 */
export type OutputToken = {
  token: string;
  amount: BigNumber;
  recipient: string;
};

/**
 * Resolved order after resolver processes it
 */
export type ResolvedOrder = {
  info: OrderInfoV4;
  input: InputToken;
  outputs: OutputToken[];
  sig: string;
  hash: string;
  auctionResolver: string;
  witnessTypeString: string; // Resolver-provided Permit2 witness type
};

/**
 * Hybrid auction input token definition
 * maxAmount is fixed for exact-in orders
 */
export type HybridInput = {
  token: string;
  maxAmount: BigNumber;
};

/**
 * Hybrid auction output token definition
 * minAmount is scaled up for exact-in orders
 */
export type HybridOutput = {
  token: string;
  minAmount: BigNumber;
  recipient: string;
};

/**
 * Hybrid cosigner data (optional)
 */
export type HybridCosignerData = {
  auctionTargetBlock: BigNumber;
  supplementalPriceCurve: BigNumber[];
};

/**
 * JSON serialization format for HybridCosignerData
 */
export type HybridCosignerDataJSON = {
  auctionTargetBlock: string;
  supplementalPriceCurve: string[];
};

/**
 * Unsigned hybrid order info (base fields without cosigner data or signature)
 * Extends OrderInfoV4 to maintain SDK pattern compatibility
 */
export type UnsignedHybridOrderInfo = OrderInfoV4 & {
  cosigner: string;
  input: HybridInput;
  outputs: HybridOutput[];
  auctionStartBlock: BigNumber;
  baselinePriorityFeeWei: BigNumber;
  scalingFactor: BigNumber;
  priceCurve: BigNumber[];
};

/**
 * Cosigned hybrid order info (includes cosigner data and signature)
 */
export type CosignedHybridOrderInfo = UnsignedHybridOrderInfo & {
  cosignerData: HybridCosignerData;
  cosignature: string;
};

/**
 * JSON serialization format for OrderInfoV4
 */
export type OrderInfoV4JSON = Omit<OrderInfoV4, "nonce"> & { nonce: string };

/**
 * JSON serialization format for HybridInput
 */
export type HybridInputJSON = {
  token: string;
  maxAmount: string;
};

/**
 * JSON serialization format for HybridOutput
 */
export type HybridOutputJSON = {
  token: string;
  minAmount: string;
  recipient: string;
};

/**
 * JSON serialization format for UnsignedHybridOrderInfo
 */
export type UnsignedHybridOrderInfoJSON = Omit<
  UnsignedHybridOrderInfo,
  "nonce" | "input" | "outputs" | "auctionStartBlock" | "baselinePriorityFeeWei" | "scalingFactor" | "priceCurve"
> & {
  nonce: string;
  input: HybridInputJSON;
  outputs: HybridOutputJSON[];
  auctionStartBlock: string;
  baselinePriorityFeeWei: string;
  scalingFactor: string;
  priceCurve: string[];
};

/**
 * JSON serialization format for CosignedHybridOrderInfo
 */
export type CosignedHybridOrderInfoJSON = UnsignedHybridOrderInfoJSON & {
  cosignerData: HybridCosignerDataJSON;
  cosignature: string;
};


/**
 * DCA Intent structure
 * Signed once by swapper
 */
export type DCAIntent = {
  swapper: string;
  nonce: BigNumber;
  chainId: number;
  hookAddress: string; // DCAHook contract address
  isExactIn: boolean; // true: EXACT_IN, false: EXACT_OUT
  inputToken: string;
  outputToken: string;
  cosigner: string; // TEE address for authorization
  minPeriod: BigNumber; // Min seconds between executions
  maxPeriod: BigNumber; // Max seconds between executions
  minChunkSize: BigNumber; // Min amount per execution
  maxChunkSize: BigNumber; // Max amount per execution
  minPrice: BigNumber; // Min price (outputAmount/inputAmount * 1e18)
  deadline: BigNumber; // Intent expiration
  outputAllocations: OutputAllocation[]; // Distribution of outputs
  privateIntent: PrivateIntent; // Private data (hashed on-chain)
};

/**
 * Private parameters - Only hash revealed on-chain for privacy
 */
export type PrivateIntent = {
  totalAmount: BigNumber; // Total DCA amount (kept private)
  exactFrequency: BigNumber; // Target execution frequency (kept private)
  numChunks: BigNumber; // Total number of chunks (kept private)
  salt: string; // Random salt for uniqueness (bytes32)
  oracleFeeds: FeedInfo[]; // Oracle feed options for price validation
};

/**
 * Output distribution specification
 */
export type OutputAllocation = {
  recipient: string; // Recipient address
  basisPoints: number; // Allocation out of 10000 (100%)
};

/**
 * Oracle feed information
 */
export type FeedInfo = {
  feedId: string; // bytes32 feed identifier
  feed_address: string; // Feed contract address
  feedType: string; // Feed type string
};

/**
 * Cosigner authorization for single execution
 */
export type DCAOrderCosignerData = {
  swapper: string;
  nonce: BigNumber; // Intent nonce (uint96)
  execAmount: BigNumber; // Amount for this execution (input or output) (uint160)
  orderNonce: BigNumber; // Execution chunk index (uint96)
  limitAmount: BigNumber; // Limit (min output or max input) (uint160)
};

/**
 * On-chain execution state
 */
export type DCAExecutionState = {
  executedChunks: BigNumber; // Number of chunks executed (uint128)
  lastExecutionTime: BigNumber; // Last execution timestamp (uint120)
  cancelled: boolean; // Whether intent is cancelled
  totalInputExecuted: BigNumber; // Cumulative input amount
  totalOutput: BigNumber; // Cumulative output amount
};

/**
 * Optional Permit2 allowance data
 */
export type PermitData = {
  hasPermit: boolean;
  permitSingle: {
    details: {
      token: string;
      amount: BigNumber;
    };
    spender: string;
    sigDeadline: BigNumber;
    nonce: BigNumber;
  };
  signature: string;
};

/**
 * JSON serialization format for DCAIntent
 */
export type DCAIntentJSON = Omit<
  DCAIntent,
  | "nonce"
  | "minPeriod"
  | "maxPeriod"
  | "minChunkSize"
  | "maxChunkSize"
  | "minPrice"
  | "deadline"
  | "privateIntent"
> & {
  nonce: string;
  minPeriod: string;
  maxPeriod: string;
  minChunkSize: string;
  maxChunkSize: string;
  minPrice: string;
  deadline: string;
  privateIntent: {
    totalAmount: string;
    exactFrequency: string;
    numChunks: string;
    salt: string;
    oracleFeeds: FeedInfo[];
  };
};

/**
 * Resolution options for a HybridOrder when simulating fills
 */
export type HybridOrderResolutionOptions = {
  currentBlock: BigNumber;
  priorityFeeWei: BigNumber;
};

/**
 * Block overrides for quoting
 */
export type BlockOverridesV4 =
  | {
      number?: string;
    }
  | undefined;
