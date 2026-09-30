/**
 * Cross-check the SDK's DCA hashing against digests derived independently from
 * DCALib.sol. The SDK must reproduce the contract's values exactly, so the expected
 * digests here are computed from the contract source, not from the SDK.
 *
 * Run: bun test src/order/v4/hashing.contract-parity.test.ts
 */
import { ethers } from "ethers";

import { hashDCAIntent, hashPrivateIntent } from "./hashing";
import { DCAIntent, FeedInfo, PrivateIntent } from "./types";

const { BigNumber, utils } = ethers;
const K = (b: Uint8Array | string) => utils.keccak256(b);
const T = (s: string) => K(utils.toUtf8Bytes(s));

// ---- Contract side, transcribed from DCALib.sol ----
const FEED_TEMPLATE_TYPE =
  "FeedTemplate(string name,string expression,string[] parameters,string[] secrets,uint256 retryCount)";
const FEED_INFO_TYPE =
  "FeedInfo(FeedTemplate feedTemplate,address feedAddress,string feedType)" +
  FEED_TEMPLATE_TYPE;
const PRIVATE_INTENT_TYPE =
  "PrivateIntent(uint256 totalAmount,uint256 exactFrequency,uint256 numChunks,bytes32 salt,FeedInfo[] oracleFeeds)" +
  FEED_INFO_TYPE;
const OUTPUT_ALLOCATION_TYPE = "OutputAllocation(address recipient,uint16 basisPoints)";
const DCA_INTENT_TYPE =
  "DCAIntent(address swapper,uint256 nonce,uint256 chainId,address hookAddress,bool isExactIn,address inputToken,address outputToken,address cosigner,uint256 minPeriod,uint256 maxPeriod,uint256 minChunkSize,uint256 maxChunkSize,uint256 minPrice,uint256 deadline,OutputAllocation[] outputAllocations,PrivateIntent privateIntent)" +
  FEED_INFO_TYPE +
  OUTPUT_ALLOCATION_TYPE +
  PRIVATE_INTENT_TYPE;

const cFeedTemplateTypeHash = T(FEED_TEMPLATE_TYPE);
const cFeedInfoTypeHash = T(FEED_INFO_TYPE);
const cOutputAllocTypeHash = T(OUTPUT_ALLOCATION_TYPE);

// DCALib._hashStringArray
const contractHashStringArray = (arr: string[]) =>
  K(utils.concat(arr.map((s) => T(s))));

const contractHashFeedTemplate = (t: {
  name: string;
  expression: string;
  parameters: string[];
  secrets: string[];
  retryCount: number;
}) =>
  K(
    utils.defaultAbiCoder.encode(
      ["bytes32", "bytes32", "bytes32", "bytes32", "bytes32", "uint256"],
      [
        cFeedTemplateTypeHash,
        T(t.name),
        T(t.expression),
        contractHashStringArray(t.parameters),
        contractHashStringArray(t.secrets),
        t.retryCount,
      ]
    )
  );

const contractHashFeedInfo = (f: FeedInfo) =>
  K(
    utils.defaultAbiCoder.encode(
      ["bytes32", "bytes32", "address", "bytes32"],
      [
        cFeedInfoTypeHash,
        contractHashFeedTemplate(f.feedTemplate),
        f.feedAddress,
        T(f.feedType),
      ]
    )
  );

// DCALib._hashFeedInfoArray / _hashOutputAllocations use keccak256(abi.encodePacked(...))
const contractHashFeedInfoArray = (feeds: FeedInfo[]) =>
  K(utils.concat(feeds.map(contractHashFeedInfo)));

const contractHashOutputAllocations = (
  allocs: { recipient: string; basisPoints: number }[]
) =>
  K(
    utils.concat(
      allocs.map((a) =>
        K(
          utils.defaultAbiCoder.encode(
            ["bytes32", "address", "uint16"],
            [cOutputAllocTypeHash, a.recipient, a.basisPoints]
          )
        )
      )
    )
  );

const contractHashPrivateIntent = (p: PrivateIntent) =>
  K(
    utils.defaultAbiCoder.encode(
      ["bytes32", "uint256", "uint256", "uint256", "bytes32", "bytes32"],
      [
        T(PRIVATE_INTENT_TYPE),
        p.totalAmount,
        p.exactFrequency,
        p.numChunks,
        p.salt,
        contractHashFeedInfoArray(p.oracleFeeds),
      ]
    )
  );

// ---- Fixtures: identical to DCALibTest.t.sol's _sampleIntent/_feedIds ----
const FEEDS: FeedInfo[] = [
  {
    feedTemplate: {
      name: "feed-0",
      expression: "$average(data.prices)",
      parameters: [],
      secrets: [],
      retryCount: 3,
    },
    feedAddress: "0x1111111111111111111111111111111111111111",
    feedType: "price",
  },
  {
    feedTemplate: {
      name: "feed-1",
      expression: "$average(data.prices)",
      parameters: [],
      secrets: [],
      retryCount: 5,
    },
    feedAddress: "0x2222222222222222222222222222222222222222",
    feedType: "price",
  },
];

const PRIVATE_INTENT: PrivateIntent = {
  totalAmount: BigNumber.from(1000),
  exactFrequency: BigNumber.from(3600),
  numChunks: BigNumber.from(10),
  salt: K(utils.toUtf8Bytes("test-salt")),
  oracleFeeds: FEEDS,
};

const INTENT: DCAIntent = {
  swapper: "0x000000000000000000000000000000000000dEaD",
  nonce: BigNumber.from(42),
  chainId: BigNumber.from(1),
  hookAddress: "0x4444444444444444444444444444444444444444",
  isExactIn: true,
  inputToken: "0x0000000000000000000000000000000000001111",
  outputToken: "0x0000000000000000000000000000000000002222",
  cosigner: "0x0000000000000000000000000000000000003333",
  minPeriod: BigNumber.from(300),
  maxPeriod: BigNumber.from(7200),
  minChunkSize: BigNumber.from(1),
  maxChunkSize: BigNumber.from(200),
  minPrice: BigNumber.from(0),
  deadline: BigNumber.from(9999),
  outputAllocations: [
    { recipient: "0x00000000000000000000000000000000000aaaaa", basisPoints: 9975 },
    { recipient: "0x00000000000000000000000000000000000fffff", basisPoints: 25 },
  ],
  privateIntent: PRIVATE_INTENT,
};

describe("DCA hashing parity with DCALib.sol", () => {
  test("private intent hash matches the contract encoding", () => {
    expect(hashPrivateIntent(PRIVATE_INTENT)).toBe(
      contractHashPrivateIntent(PRIVATE_INTENT)
    );
  });

  test("full intent hash matches hashWithInnerHash with a zeroed private intent", () => {
    // DCALib.hashWithInnerHash: outer fields with privateIntent zeroed, plus the
    // separately supplied privateIntentHash in the final slot.
    const privateHash = contractHashPrivateIntent(PRIVATE_INTENT);
    const expected = K(
      utils.defaultAbiCoder.encode(
        [
          "bytes32", "address", "uint256", "uint256", "address", "bool",
          "address", "address", "address", "uint256", "uint256", "uint256",
          "uint256", "uint256", "uint256", "bytes32", "bytes32",
        ],
        [
          T(DCA_INTENT_TYPE),
          INTENT.swapper, INTENT.nonce, INTENT.chainId, INTENT.hookAddress,
          INTENT.isExactIn, INTENT.inputToken, INTENT.outputToken, INTENT.cosigner,
          INTENT.minPeriod, INTENT.maxPeriod, INTENT.minChunkSize,
          INTENT.maxChunkSize, INTENT.minPrice, INTENT.deadline,
          contractHashOutputAllocations(INTENT.outputAllocations),
          privateHash,
        ]
      )
    );
    expect(hashDCAIntent(INTENT, privateHash)).toBe(expected);
  });

  test("differs from the previous feed-id encoding for the same intent", () => {
    // Guards against a silent regression: the retired encoding derived the feed
    // array from a bytes32 feedId and an inline string. If this ever matched, the
    // two encodings would be equivalent and the distinction would be untestable.
    const retiredFeedInfo = K(
      utils.defaultAbiCoder.encode(
        ["bytes32", "bytes32", "address", "string"],
        [
          K(utils.toUtf8Bytes("FeedInfo(bytes32 feedId,address feed_address,string feedType)")),
          ethers.constants.HashZero,
          FEEDS[0].feedAddress,
          FEEDS[0].feedType,
        ]
      )
    );
    const retiredArray = K(
      utils.defaultAbiCoder.encode(["bytes32[]"], [[retiredFeedInfo]])
    );
    const retiredPrivate = K(
      utils.defaultAbiCoder.encode(
        ["bytes32", "uint256", "uint256", "uint256", "bytes32", "bytes32"],
        [
          T(
            "PrivateIntent(uint256 totalAmount,uint256 exactFrequency,uint256 numChunks,bytes32 salt,FeedInfo[] oracleFeeds)FeedInfo(bytes32 feedId,address feed_address,string feedType)"
          ),
          PRIVATE_INTENT.totalAmount,
          PRIVATE_INTENT.exactFrequency,
          PRIVATE_INTENT.numChunks,
          PRIVATE_INTENT.salt,
          retiredArray,
        ]
      )
    );
    expect(hashPrivateIntent(PRIVATE_INTENT)).not.toBe(retiredPrivate);
  });
});
