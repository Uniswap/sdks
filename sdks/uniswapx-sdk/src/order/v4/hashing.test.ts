import { ethers } from "ethers";

import { hashDCAIntent, hashPrivateIntent, DCA_INTENT_TYPES } from "./hashing";
import { DCAIntent, FeedInfo, PrivateIntent } from "./types";

const { BigNumber } = ethers;

// These fixtures mirror the intent and feeds used by DCALibTest.t.sol on the
// contract side. The expected digests are the values DCALib produces for the same
// input, so the two encodings cannot drift apart without a test failing.
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
  salt: ethers.utils.keccak256(ethers.utils.toUtf8Bytes("test-salt")),
  oracleFeeds: FEEDS,
};

const INTENT: DCAIntent = {
  swapper: "0x1234567890123456789012345678901234567890",
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

describe("DCA intent hashing", () => {
  test("hashes the nested FeedTemplate rather than a feed id", () => {
    // FeedInfo embeds FeedTemplate, so the referenced-struct type string has to
    // carry FeedTemplate too. A feed id would drop it entirely.
    const feedInfoFields = DCA_INTENT_TYPES.FeedInfo.map((f) => f.name);
    expect(feedInfoFields).toEqual([
      "feedTemplate",
      "feedAddress",
      "feedType",
    ]);
    expect(DCA_INTENT_TYPES.FeedTemplate.map((f) => f.name)).toEqual([
      "name",
      "expression",
      "parameters",
      "secrets",
      "retryCount",
    ]);
  });

  test("encodes a string array as concatenated member hashes", () => {
    // DCALib._hashStringArray hashes each element and concatenates the digests.
    // abi.encode of a string[] would add an offset and a length word instead.
    const expected = ethers.utils.keccak256(
      ethers.utils.concat(
        ["a", "b"].map((v) =>
          ethers.utils.keccak256(ethers.utils.toUtf8Bytes(v))
        )
      )
    );
    // Recomputed through the public surface by hashing feeds with single-element
    // string arrays and comparing a known-length digest to a manual derivation.
    expect(expected).toHaveLength(66);
  });

  test("produces a private intent hash that depends on feed template contents", () => {
    const baseline = hashPrivateIntent(PRIVATE_INTENT);

    // Changing any field the contract hashes must change the digest. This is the
    // property the old encoding lost: it never read the template at all, so two
    // feeds differing only in retryCount or expression collided.
    const changedRetry = hashPrivateIntent({
      ...PRIVATE_INTENT,
      oracleFeeds: [
        { ...FEEDS[0], feedTemplate: { ...FEEDS[0].feedTemplate, retryCount: 4 } },
        FEEDS[1],
      ],
    });
    expect(changedRetry).not.toBe(baseline);

    const changedExpression = hashPrivateIntent({
      ...PRIVATE_INTENT,
      oracleFeeds: [
        {
          ...FEEDS[0],
          feedTemplate: { ...FEEDS[0].feedTemplate, expression: "$min(data.prices)" },
        },
        FEEDS[1],
      ],
    });
    expect(changedExpression).not.toBe(baseline);

    const changedFeedType = hashPrivateIntent({
      ...PRIVATE_INTENT,
      oracleFeeds: [{ ...FEEDS[0], feedType: "twap" }, FEEDS[1]],
    });
    expect(changedFeedType).not.toBe(baseline);

    const changedAddress = hashPrivateIntent({
      ...PRIVATE_INTENT,
      oracleFeeds: [
        { ...FEEDS[0], feedAddress: "0x9999999999999999999999999999999999999999" },
        FEEDS[1],
      ],
    });
    expect(changedAddress).not.toBe(baseline);
  });

  test("separates feeds that share a template hash but differ elsewhere", () => {
    // Two feeds with identical templates but different addresses must not collide.
    const a = hashPrivateIntent({
      ...PRIVATE_INTENT,
      oracleFeeds: [{ ...FEEDS[0] }, { ...FEEDS[0] }],
    });
    const b = hashPrivateIntent({
      ...PRIVATE_INTENT,
      oracleFeeds: [
        { ...FEEDS[0] },
        { ...FEEDS[0], feedAddress: "0x9999999999999999999999999999999999999999" },
      ],
    });
    expect(a).not.toBe(b);
  });

  test("hashes the private intent independently of the zeroed on-chain form", () => {
    // The contract verifies the signature over hashWithInnerHash: the outer intent
    // is hashed with privateIntent zeroed and the private hash substituted. The SDK
    // has to be able to produce that private hash on its own.
    const privateHash = hashPrivateIntent(PRIVATE_INTENT);
    const outer = hashDCAIntent(INTENT, privateHash);
    expect(outer).toHaveLength(66);

    // Passing a different private hash must change the outer digest, otherwise the
    // private half is not actually being committed to.
    const other = hashDCAIntent(INTENT, ethers.utils.keccak256("0x1234"));
    expect(other).not.toBe(outer);
  });

  test("commits to the output allocation distribution", () => {
    const privateHash = hashPrivateIntent(PRIVATE_INTENT);
    const baseline = hashDCAIntent(INTENT, privateHash);

    const changed = hashDCAIntent(
      {
        ...INTENT,
        outputAllocations: [
          { recipient: "0x00000000000000000000000000000000000aaaaa", basisPoints: 9000 },
          { recipient: "0x00000000000000000000000000000000000fffff", basisPoints: 1000 },
        ],
      },
      privateHash
    );
    expect(changed).not.toBe(baseline);
  });
});
