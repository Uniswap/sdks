import { BigNumber, ethers, Wallet } from "ethers";

import { DCA_INTENT_TYPES, hashDCAIntent, hashPrivateIntent } from "./hashing";
import { DCAIntent, FeedInfo } from "./types";

const addr = (h: string): string =>
  ethers.utils.getAddress(ethers.utils.hexZeroPad(h, 20));
const HOOK = addr("0x1111");
const SWAPPER = new Wallet("0x" + "12".repeat(32));
const bn = BigNumber.from;

const DCALIB_SOL = [
  "DCAIntent(address swapper,uint256 nonce,uint256 chainId,address hookAddress,bool isExactIn,address inputToken,address outputToken,address cosigner,uint256 minPeriod,uint256 maxPeriod,uint256 minChunkSize,uint256 maxChunkSize,uint256 minPrice,uint256 deadline,OutputAllocation[] outputAllocations,PrivateIntent privateIntent)",
  "FeedInfo(FeedTemplate feedTemplate,address feedAddress,string feedType)",
  "FeedTemplate(string name,string expression,string[] parameters,string[] secrets,uint256 retryCount)",
  "OutputAllocation(address recipient,uint16 basisPoints)",
  "PrivateIntent(uint256 totalAmount,uint256 exactFrequency,uint256 numChunks,bytes32 salt,FeedInfo[] oracleFeeds)",
];

const DCALIB_TYPES = Object.fromEntries(
  DCALIB_SOL.map((s) => {
    const i = s.indexOf("(");
    return [
      s.slice(0, i),
      s
        .slice(i + 1, -1)
        .split(",")
        .map((p) => ({ name: p.split(" ")[1], type: p.split(" ")[0] })),
    ];
  })
);

const mkFeed = (
  name: string,
  expression: string,
  parameters: string[],
  secrets: string[],
  retry: number,
  feedAddress: string,
  feedType: string
): FeedInfo => ({
  feedTemplate: {
    name,
    expression,
    parameters,
    secrets,
    retryCount: bn(retry),
  },
  feedAddress,
  feedType,
});

const mkIntent = (overrides: Partial<DCAIntent> = {}): DCAIntent => ({
  swapper: SWAPPER.address,
  nonce: bn(1),
  chainId: 1,
  hookAddress: HOOK,
  isExactIn: true,
  inputToken: addr("0x2222"),
  outputToken: addr("0x3333"),
  cosigner: addr("0x4444"),
  minPeriod: bn(3600),
  maxPeriod: bn(7200),
  minChunkSize: bn(100),
  maxChunkSize: bn(1000),
  minPrice: bn(1),
  deadline: bn(1800000000),
  outputAllocations: [{ recipient: addr("0x9999"), basisPoints: 10000 }],
  privateIntent: {
    totalAmount: bn(10000),
    exactFrequency: bn(3600),
    numChunks: bn(10),
    salt: ethers.utils.hexZeroPad("0x42", 32),
    oracleFeeds: [mkFeed("f0", "$v", [], [], 3, addr("0xfeed"), "asdf")],
  },
  ...overrides,
});

const solHash = (intent: DCAIntent): string =>
  ethers.utils._TypedDataEncoder.hashStruct("DCAIntent", DCALIB_TYPES, intent);

describe("DCAIntent EIP-712 hashing (DCALib.sol parity)", () => {
  it("exports DCA_INTENT_TYPES matching DCALib.sol EIP-712 type strings", () => {
    expect(
      ethers.utils._TypedDataEncoder
        .from(DCA_INTENT_TYPES)
        .encodeType("DCAIntent")
    ).toEqual(DCALIB_SOL.join(""));
  });

  it("hashes simple PrivateIntent and DCAIntent identically to DCALib.sol", () => {
    const intent = mkIntent();
    const { PrivateIntent: pi, FeedInfo: fi, FeedTemplate: ft } = DCALIB_TYPES;
    const pHash = hashPrivateIntent(intent.privateIntent);
    expect(pHash).toEqual(
      ethers.utils._TypedDataEncoder.hashStruct(
        "PrivateIntent",
        { PrivateIntent: pi, FeedInfo: fi, FeedTemplate: ft },
        intent.privateIntent
      )
    );
    expect(hashDCAIntent(intent, pHash)).toEqual(solHash(intent));
  });

  it("hashes multi-feed, non-empty parameters/secrets, and multi-allocation intents", () => {
    const intent = mkIntent({
      isExactIn: false,
      nonce: bn(42),
      outputAllocations: [
        { recipient: addr("0xaaaa"), basisPoints: 6000 },
        { recipient: addr("0xbbbb"), basisPoints: 4000 },
      ],
      privateIntent: {
        totalAmount: bn(5000),
        exactFrequency: bn(1800),
        numChunks: bn(5),
        salt: ethers.utils.id("salt"),
        oracleFeeds: [
          mkFeed("f1", "$a", ["ETH/USD", "w=60"], ["K1"], 3, addr("0xf1"), "c"),
          mkFeed("f2", "$m", ["ETH/USDC"], [], 5, addr("0xf2"), "pyth"),
        ],
      },
    });
    expect(
      hashDCAIntent(intent, hashPrivateIntent(intent.privateIntent))
    ).toEqual(solHash(intent));
  });

  it("handles empty oracleFeeds and empty outputAllocations with encodePacked semantics", () => {
    const intent = mkIntent({
      outputAllocations: [],
      privateIntent: {
        totalAmount: bn(10),
        exactFrequency: bn(600),
        numChunks: bn(2),
        salt: ethers.constants.HashZero,
        oracleFeeds: [],
      },
    });
    expect(
      hashDCAIntent(intent, hashPrivateIntent(intent.privateIntent))
    ).toEqual(solHash(intent));
  });

  it("verifies EIP-712 wallet signature against DCALib digest", async () => {
    const intent = mkIntent();
    const domain = {
      name: "DCAHook",
      version: "1",
      chainId: 1,
      verifyingContract: HOOK,
    };
    const sig = await SWAPPER._signTypedData(domain, DCA_INTENT_TYPES, intent);
    const sep = ethers.utils._TypedDataEncoder.hashDomain(domain);
    const sHash = hashDCAIntent(
      intent,
      hashPrivateIntent(intent.privateIntent)
    );
    const digest = ethers.utils.keccak256(
      ethers.utils.solidityPack(
        ["string", "bytes32", "bytes32"],
        ["\x19\x01", sep, sHash]
      )
    );
    expect(ethers.utils.recoverAddress(digest, sig)).toEqual(SWAPPER.address);
  });
});
