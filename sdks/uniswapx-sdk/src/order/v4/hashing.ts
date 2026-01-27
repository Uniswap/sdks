import { BigNumber, ethers } from "ethers";

import {
  CosignedHybridOrderInfo,
  DCAIntent,
  DCAOrderCosignerData,
  FeedInfo,
  HybridCosignerData,
  HybridInput,
  HybridOutput,
  OrderInfoV4,
  OutputAllocation,
  PrivateIntent,
} from "./types";

/**
 * EIP-712 type string for OrderInfoV4
 */
export const ORDER_INFO_V4_TYPE_STRING =
  "OrderInfo(" +
  "address reactor," +
  "address swapper," +
  "uint256 nonce," +
  "uint256 deadline," +
  "address preExecutionHook," +
  "bytes preExecutionHookData," +
  "address postExecutionHook," +
  "bytes postExecutionHookData," +
  "address auctionResolver)";

/**
 * EIP-712 type hash for OrderInfoV4
 */
export const ORDER_INFO_V4_TYPE_HASH = ethers.utils.keccak256(
  ethers.utils.toUtf8Bytes(ORDER_INFO_V4_TYPE_STRING)
);

/**
 * EIP-712 type string for HybridInput
 */
const HYBRID_INPUT_TYPE_STRING = "HybridInput(address token,uint256 maxAmount)";

/**
 * EIP-712 type hash for HybridInput
 */
const HYBRID_INPUT_TYPE_HASH = ethers.utils.keccak256(
  ethers.utils.toUtf8Bytes(HYBRID_INPUT_TYPE_STRING)
);

/**
 * EIP-712 type string for HybridOutput
 */
const HYBRID_OUTPUT_TYPE_STRING =
  "HybridOutput(address token,uint256 minAmount,address recipient)";

/**
 * EIP-712 type hash for HybridOutput
 */
const HYBRID_OUTPUT_TYPE_HASH = ethers.utils.keccak256(
  ethers.utils.toUtf8Bytes(HYBRID_OUTPUT_TYPE_STRING)
);

/**
 * EIP-712 type string for HybridOrder (matches HybridOrderLib)
 */
const HYBRID_ORDER_TYPE_STRING = [
  "HybridOrder(",
  "OrderInfo info,",
  "address cosigner,",
  "HybridInput input,",
  "HybridOutput[] outputs,",
  "uint256 auctionStartBlock,",
  "uint256 baselinePriorityFee,",
  "uint256 scalingFactor,",
  "uint256[] priceCurve)",
].join("");

/**
 * EIP-712 type hash for HybridOrder
 */
const HYBRID_ORDER_TYPE_HASH = ethers.utils.keccak256(
  ethers.utils.toUtf8Bytes(
    HYBRID_ORDER_TYPE_STRING +
      HYBRID_INPUT_TYPE_STRING +
      HYBRID_OUTPUT_TYPE_STRING +
      ORDER_INFO_V4_TYPE_STRING
  )
);

/**
 * EIP-712 witness types for HybridOrder (for Permit2 signature)
 * NOTE: Types must be in alphabetical order for EIP-712 spec compliance
 */
export const HYBRID_ORDER_TYPES = {
  HybridInput: [
    { name: "token", type: "address" },
    { name: "maxAmount", type: "uint256" },
  ],
  HybridOrder: [
    { name: "info", type: "OrderInfo" },
    { name: "cosigner", type: "address" },
    { name: "input", type: "HybridInput" },
    { name: "outputs", type: "HybridOutput[]" },
    { name: "auctionStartBlock", type: "uint256" },
    { name: "baselinePriorityFee", type: "uint256" },
    { name: "scalingFactor", type: "uint256" },
    { name: "priceCurve", type: "uint256[]" },
  ],
  HybridOutput: [
    { name: "token", type: "address" },
    { name: "minAmount", type: "uint256" },
    { name: "recipient", type: "address" },
  ],
  OrderInfo: [
    { name: "reactor", type: "address" },
    { name: "swapper", type: "address" },
    { name: "nonce", type: "uint256" },
    { name: "deadline", type: "uint256" },
    { name: "preExecutionHook", type: "address" },
    { name: "preExecutionHookData", type: "bytes" },
    { name: "postExecutionHook", type: "address" },
    { name: "postExecutionHookData", type: "bytes" },
    { name: "auctionResolver", type: "address" },
  ],
};

/**
 * Hash OrderInfoV4 structure
 * @param info The OrderInfoV4 to hash
 * @returns The keccak256 hash
 */
export function hashOrderInfoV4(info: OrderInfoV4): string {
  return ethers.utils.keccak256(
    ethers.utils.defaultAbiCoder.encode(
      [
        "bytes32",
        "address",
        "address",
        "uint256",
        "uint256",
        "address",
        "bytes32",
        "address",
        "bytes32",
        "address",
      ],
      [
        ORDER_INFO_V4_TYPE_HASH,
        info.reactor,
        info.swapper,
        info.nonce,
        info.deadline,
        info.preExecutionHook,
        ethers.utils.keccak256(info.preExecutionHookData),
        info.postExecutionHook,
        ethers.utils.keccak256(info.postExecutionHookData),
        info.auctionResolver,
      ]
    )
  );
}

/**
 * Hash HybridInput structure
 */
function hashHybridInput(input: HybridInput): string {
  return ethers.utils.keccak256(
    ethers.utils.defaultAbiCoder.encode(
      ["bytes32", "address", "uint256"],
      [HYBRID_INPUT_TYPE_HASH, input.token, input.maxAmount]
    )
  );
}

/**
 * Hash HybridOutput structure
 */
function hashHybridOutput(output: HybridOutput): string {
  return ethers.utils.keccak256(
    ethers.utils.defaultAbiCoder.encode(
      ["bytes32", "address", "uint256", "address"],
      [
        HYBRID_OUTPUT_TYPE_HASH,
        output.token,
        output.minAmount,
        output.recipient,
      ]
    )
  );
}

/**
 * Hash array of HybridOutputs
 * Uses encodePacked to match contract's gas-optimized hashing
 */
function hashHybridOutputs(outputs: HybridOutput[]): string {
  const hashes = outputs.map(hashHybridOutput);
  if (hashes.length === 0) {
    return ethers.utils.keccak256("0x");
  }
  const types = new Array(hashes.length).fill("bytes32");
  return ethers.utils.keccak256(ethers.utils.solidityPack(types, hashes));
}

/**
 * Hash a price curve array using encodePacked semantics
 */
function hashPriceCurve(curve: BigNumber[]): string {
  if (curve.length === 0) {
    return ethers.utils.keccak256("0x");
  }
  const types = new Array(curve.length).fill("uint256");
  const values = curve.map((value) => BigNumber.from(value));
  return ethers.utils.keccak256(ethers.utils.solidityPack(types, values));
}

export function hashHybridOrder(order: CosignedHybridOrderInfo): string {
  const infoHash = hashOrderInfoV4(order);
  const inputHash = hashHybridInput(order.input);
  const outputsHash = hashHybridOutputs(order.outputs);
  const priceCurveHash = hashPriceCurve(order.priceCurve);

  return ethers.utils.keccak256(
    ethers.utils.defaultAbiCoder.encode(
      [
        "bytes32",
        "bytes32",
        "address",
        "bytes32",
        "bytes32",
        "uint256",
        "uint256",
        "uint256",
        "bytes32",
      ],
      [
        HYBRID_ORDER_TYPE_HASH,
        infoHash,
        order.cosigner,
        inputHash,
        outputsHash,
        order.auctionStartBlock,
        order.baselinePriorityFee,
        order.scalingFactor,
        priceCurveHash,
      ]
    )
  );
}

/**
 * Compute cosigner digest (orderHash || chainId || cosignerData encoding)
 */
export function hashHybridCosignerData(
  orderHash: string,
  cosignerData: HybridCosignerData,
  chainId: number
): string {
  const encodedCosignerData = ethers.utils.defaultAbiCoder.encode(
    [
      "tuple(uint256 auctionTargetBlock,uint256[] supplementalPriceCurve,address exclusiveFiller,uint256 exclusivityOverrideBps,uint256 exclusivityEndBlock)",
    ],
    [
      [
        cosignerData.auctionTargetBlock,
        cosignerData.supplementalPriceCurve.map((value) =>
          BigNumber.from(value)
        ),
        cosignerData.exclusiveFiller,
        BigNumber.from(cosignerData.exclusivityOverrideBps),
        BigNumber.from(cosignerData.exclusivityEndBlock ?? 0),
      ],
    ]
  );

  return ethers.utils.keccak256(
    ethers.utils.solidityPack(
      ["bytes32", "uint256", "bytes"],
      [orderHash, chainId, encodedCosignerData]
    )
  );
}

/**
 * EIP-712 type string for FeedInfo
 */
const FEED_INFO_TYPE =
  "FeedInfo(bytes32 feedId,address feed_address,string feedType)";

/**
 * EIP-712 type hash for FeedInfo
 */
const FEED_INFO_TYPE_HASH = ethers.utils.keccak256(
  ethers.utils.toUtf8Bytes(FEED_INFO_TYPE)
);

/**
 * EIP-712 type string for PrivateIntent
 */
const PRIVATE_INTENT_TYPE =
  "PrivateIntent(uint256 totalAmount,uint256 exactFrequency," +
  "uint256 numChunks,bytes32 salt,FeedInfo[] oracleFeeds)" +
  FEED_INFO_TYPE;

/**
 * EIP-712 type hash for PrivateIntent
 */
const PRIVATE_INTENT_TYPE_HASH = ethers.utils.keccak256(
  ethers.utils.toUtf8Bytes(PRIVATE_INTENT_TYPE)
);

/**
 * Hash FeedInfo structure
 * @param feed The FeedInfo to hash
 * @returns The keccak256 hash
 */
function hashFeedInfo(feed: FeedInfo): string {
  return ethers.utils.keccak256(
    ethers.utils.defaultAbiCoder.encode(
      ["bytes32", "bytes32", "address", "string"],
      [FEED_INFO_TYPE_HASH, feed.feedId, feed.feed_address, feed.feedType]
    )
  );
}

/**
 * Hash an array of FeedInfo
 * @param feeds Array of FeedInfo
 * @returns The keccak256 hash of the array
 */
function hashFeedInfoArray(feeds: FeedInfo[]): string {
  const hashes = feeds.map(hashFeedInfo);
  return ethers.utils.keccak256(
    ethers.utils.defaultAbiCoder.encode(["bytes32[]"], [hashes])
  );
}

/**
 * Hash PrivateIntent structure
 * @param privateIntent The PrivateIntent to hash
 * @returns The keccak256 hash
 */
export function hashPrivateIntent(privateIntent: PrivateIntent): string {
  const oracleFeedsHash = hashFeedInfoArray(privateIntent.oracleFeeds);

  return ethers.utils.keccak256(
    ethers.utils.defaultAbiCoder.encode(
      ["bytes32", "uint256", "uint256", "uint256", "bytes32", "bytes32"],
      [
        PRIVATE_INTENT_TYPE_HASH,
        privateIntent.totalAmount,
        privateIntent.exactFrequency,
        privateIntent.numChunks,
        privateIntent.salt,
        oracleFeedsHash,
      ]
    )
  );
}

/**
 * EIP-712 type string for OutputAllocation
 */
const OUTPUT_ALLOCATION_TYPE =
  "OutputAllocation(address recipient,uint16 basisPoints)";

/**
 * EIP-712 type hash for OutputAllocation
 */
const OUTPUT_ALLOCATION_TYPE_HASH = ethers.utils.keccak256(
  ethers.utils.toUtf8Bytes(OUTPUT_ALLOCATION_TYPE)
);

/**
 * Hash OutputAllocation structure
 * @param allocation The OutputAllocation to hash
 * @returns The keccak256 hash
 */
function hashOutputAllocation(allocation: OutputAllocation): string {
  return ethers.utils.keccak256(
    ethers.utils.defaultAbiCoder.encode(
      ["bytes32", "address", "uint16"],
      [
        OUTPUT_ALLOCATION_TYPE_HASH,
        allocation.recipient,
        allocation.basisPoints,
      ]
    )
  );
}

/**
 * Hash an array of OutputAllocations
 * @param allocations Array of OutputAllocation
 * @returns The keccak256 hash of the array
 */
function hashOutputAllocations(allocations: OutputAllocation[]): string {
  const hashes = allocations.map(hashOutputAllocation);
  return ethers.utils.keccak256(
    ethers.utils.defaultAbiCoder.encode(["bytes32[]"], [hashes])
  );
}

/**
 * EIP-712 type string for DCAIntent
 */
const DCA_INTENT_TYPE =
  "DCAIntent(" +
  "address swapper," +
  "uint256 nonce," +
  "uint256 chainId," +
  "address hookAddress," +
  "bool isExactIn," +
  "address inputToken," +
  "address outputToken," +
  "address cosigner," +
  "uint256 minPeriod," +
  "uint256 maxPeriod," +
  "uint256 minChunkSize," +
  "uint256 maxChunkSize," +
  "uint256 minPrice," +
  "uint256 deadline," +
  "OutputAllocation[] outputAllocations," +
  "PrivateIntent privateIntent)" +
  OUTPUT_ALLOCATION_TYPE +
  PRIVATE_INTENT_TYPE;

/**
 * EIP-712 type hash for DCAIntent
 */
const DCA_INTENT_TYPE_HASH = ethers.utils.keccak256(
  ethers.utils.toUtf8Bytes(DCA_INTENT_TYPE)
);

/**
 * Hash DCAIntent structure
 * Note: Intent should have privateIntent zeroed out for signing, with separate privateIntentHash
 * @param intent The DCAIntent to hash (with zeroed privateIntent)
 * @param privateIntentHash The hash of the PrivateIntent
 * @returns The keccak256 hash
 */
export function hashDCAIntent(
  intent: DCAIntent,
  privateIntentHash: string
): string {
  const outputAllocationsHash = hashOutputAllocations(intent.outputAllocations);

  return ethers.utils.keccak256(
    ethers.utils.defaultAbiCoder.encode(
      [
        "bytes32",
        "address",
        "uint256",
        "uint256",
        "address",
        "bool",
        "address",
        "address",
        "address",
        "uint256",
        "uint256",
        "uint256",
        "uint256",
        "uint256",
        "uint256",
        "bytes32",
        "bytes32",
      ],
      [
        DCA_INTENT_TYPE_HASH,
        intent.swapper,
        intent.nonce,
        intent.chainId,
        intent.hookAddress,
        intent.isExactIn,
        intent.inputToken,
        intent.outputToken,
        intent.cosigner,
        intent.minPeriod,
        intent.maxPeriod,
        intent.minChunkSize,
        intent.maxChunkSize,
        intent.minPrice,
        intent.deadline,
        outputAllocationsHash,
        privateIntentHash,
      ]
    )
  );
}

/**
 * EIP-712 type string for DCAOrderCosignerData
 */
const DCA_COSIGNER_DATA_TYPE =
  "DCAOrderCosignerData(address swapper,uint96 nonce,uint160 execAmount,uint96 orderNonce,uint160 limitAmount)";

/**
 * EIP-712 type hash for DCAOrderCosignerData
 */
export const DCA_COSIGNER_DATA_TYPE_HASH = ethers.utils.keccak256(
  ethers.utils.toUtf8Bytes(DCA_COSIGNER_DATA_TYPE)
);

/**
 * Hash DCAOrderCosignerData structure
 * @param cosignerData The DCAOrderCosignerData to hash
 * @returns The keccak256 hash
 */
export function hashDCACosignerData(
  cosignerData: DCAOrderCosignerData
): string {
  return ethers.utils.keccak256(
    ethers.utils.defaultAbiCoder.encode(
      ["bytes32", "address", "uint96", "uint160", "uint96", "uint160"],
      [
        DCA_COSIGNER_DATA_TYPE_HASH,
        cosignerData.swapper,
        cosignerData.nonce,
        cosignerData.execAmount,
        cosignerData.orderNonce,
        cosignerData.limitAmount,
      ]
    )
  );
}

/**
 * EIP-712 type definitions for DCAIntent
 */
export const DCA_INTENT_TYPES = {
  DCAIntent: [
    { name: "swapper", type: "address" },
    { name: "nonce", type: "uint256" },
    { name: "chainId", type: "uint256" },
    { name: "hookAddress", type: "address" },
    { name: "isExactIn", type: "bool" },
    { name: "inputToken", type: "address" },
    { name: "outputToken", type: "address" },
    { name: "cosigner", type: "address" },
    { name: "minPeriod", type: "uint256" },
    { name: "maxPeriod", type: "uint256" },
    { name: "minChunkSize", type: "uint256" },
    { name: "maxChunkSize", type: "uint256" },
    { name: "minPrice", type: "uint256" },
    { name: "deadline", type: "uint256" },
    { name: "outputAllocations", type: "OutputAllocation[]" },
    { name: "privateIntent", type: "PrivateIntent" },
  ],
  OutputAllocation: [
    { name: "recipient", type: "address" },
    { name: "basisPoints", type: "uint16" },
  ],
  PrivateIntent: [
    { name: "totalAmount", type: "uint256" },
    { name: "exactFrequency", type: "uint256" },
    { name: "numChunks", type: "uint256" },
    { name: "salt", type: "bytes32" },
    { name: "oracleFeeds", type: "FeedInfo[]" },
  ],
  FeedInfo: [
    { name: "feedId", type: "bytes32" },
    { name: "feed_address", type: "address" },
    { name: "feedType", type: "string" },
  ],
};
