import { BigNumber, ethers, Wallet } from "ethers";

import { HybridOrderClass, OrderResolutionError } from "./HybridOrder";
import { hashHybridCosignerData, hashHybridOrder } from "./hashing";
import { HybridOrder, HybridOrderJSON } from "./types";

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const RESOLVER = "0x0000000000000000000000000000000000000210";
const REACTOR = "0x0000000000000000000000000000000000000456";
const SWAPPER = "0x0000000000000000000000000000000000000789";
const PRE_HOOK = "0x0000000000000000000000000000000000000999";
const POST_HOOK = "0x0000000000000000000000000000000000000a10";
const OUTPUT_RECIPIENT = "0x0000000000000000000000000000000000000bbb";
const INPUT_TOKEN = "0x0000000000000000000000000000000000000c10";
const OUTPUT_TOKEN = "0x0000000000000000000000000000000000000d10";
const WAD = ethers.constants.WeiPerEther;
const COSIGNER = new Wallet(
  "0x59c6995e998f97a5a0044976f7d75e7b7d6f4b6b55bdbb1c0cfd43a3d6ab1e31"
);

const HYBRID_ORDER_ABI = [
  "tuple(" +
    [
      "tuple(address,address,uint256,uint256,address,bytes,address,bytes,address)",
      "address",
      "tuple(address,uint256)",
      "tuple(address,uint256,address)[]",
      "uint256",
      "uint256",
      "uint256",
      "uint256[]",
      "tuple(uint256,uint256[])",
      "bytes",
    ].join(",") +
    ")",
];

describe("HybridOrderClass", () => {
  const chainId = 1;

  function packPriceCurveElement(
    duration: number,
    scalingFactor: BigNumber
  ): BigNumber {
    return BigNumber.from(duration).shl(240).or(scalingFactor);
  }

  function buildOrder(overrides: Partial<HybridOrder> = {}): HybridOrder {
    const basePriceCurve = [
      packPriceCurveElement(0, WAD),
      packPriceCurveElement(5, WAD.add(BigNumber.from("50000000000000000"))),
    ];

    const baseOrder: HybridOrder = {
      info: {
        reactor: REACTOR,
        swapper: SWAPPER,
        nonce: BigNumber.from(1),
        deadline: Math.floor(Date.now() / 1000 + 3600),
        preExecutionHook: PRE_HOOK,
        preExecutionHookData: "0x1234",
        postExecutionHook: POST_HOOK,
        postExecutionHookData: "0x",
        auctionResolver: RESOLVER,
      },
      cosigner: COSIGNER.address,
      input: {
        token: INPUT_TOKEN,
        maxAmount: BigNumber.from("1000000000000000000"),
      },
      outputs: [
        {
          token: OUTPUT_TOKEN,
          minAmount: BigNumber.from("3000000000000000000"),
          recipient: OUTPUT_RECIPIENT,
        },
      ],
      auctionStartBlock: BigNumber.from(100),
      baselinePriorityFeeWei: BigNumber.from("1000000000"),
      scalingFactor: WAD.add(1),
      priceCurve: basePriceCurve,
      cosignerData: {
        auctionTargetBlock: BigNumber.from(105),
        supplementalPriceCurve: [WAD.add(BigNumber.from("10000000000000000"))],
      },
      cosignature: "0x",
    };

    const merged: HybridOrder = {
      ...baseOrder,
      ...overrides,
      info: {
        ...baseOrder.info,
        ...(overrides.info ?? {}),
        nonce: BigNumber.from(overrides.info?.nonce ?? baseOrder.info.nonce),
      },
      input: {
        ...baseOrder.input,
        ...(overrides.input ?? {}),
        maxAmount: BigNumber.from(
          overrides.input?.maxAmount ?? baseOrder.input.maxAmount
        ),
      },
      outputs: (overrides.outputs ?? baseOrder.outputs).map((output) => ({
        ...output,
        minAmount: BigNumber.from(output.minAmount),
      })),
      auctionStartBlock: BigNumber.from(
        overrides.auctionStartBlock ?? baseOrder.auctionStartBlock
      ),
      baselinePriorityFeeWei: BigNumber.from(
        overrides.baselinePriorityFeeWei ?? baseOrder.baselinePriorityFeeWei
      ),
      scalingFactor: BigNumber.from(
        overrides.scalingFactor ?? baseOrder.scalingFactor
      ),
      priceCurve: (overrides.priceCurve ?? baseOrder.priceCurve).map((value) =>
        BigNumber.from(value)
      ),
      cosignerData: {
        auctionTargetBlock: BigNumber.from(
          overrides.cosignerData?.auctionTargetBlock ??
            baseOrder.cosignerData.auctionTargetBlock
        ),
        supplementalPriceCurve: (
          overrides.cosignerData?.supplementalPriceCurve ??
          baseOrder.cosignerData.supplementalPriceCurve
        ).map((value) => BigNumber.from(value)),
      },
      cosignature: overrides.cosignature ?? "0x",
    };

    merged.cosigner = overrides.cosigner ?? baseOrder.cosigner;

    if (
      merged.cosigner !== ZERO_ADDRESS &&
      (overrides.cosignature === undefined || overrides.cosignature === "0x")
    ) {
      merged.cosignature = signCosignerDigest(merged);
    }

    if (merged.cosigner === ZERO_ADDRESS) {
      merged.cosignature = "0x";
    }

    return merged;
  }

  function signCosignerDigest(order: HybridOrder): string {
    const digest = hashHybridCosignerData(
      hashHybridOrder({
        ...order,
        // the cosigner digest ignores cosignature so placeholder is fine
        cosignature: "0x",
      }),
      order.cosignerData,
      chainId
    );
    const signature = COSIGNER._signingKey().signDigest(digest);
    return ethers.utils.joinSignature(signature);
  }

  it("hashes HybridOrder via helper", () => {
    const order = buildOrder();
    const hybrid = new HybridOrderClass(order, chainId, RESOLVER);
    expect(hybrid.hash()).toEqual(hashHybridOrder(order));
  });

  it("serializes to resolver-prefixed bytes", () => {
    const order = buildOrder();
    const hybrid = new HybridOrderClass(order, chainId, RESOLVER);
    const serialized = hybrid.serialize();

    const abiCoder = new ethers.utils.AbiCoder();
    const [resolver, encoded] = abiCoder.decode(
      ["address", "bytes"],
      serialized
    );
    expect(resolver).toEqual(RESOLVER);

    const manualEncoding = abiCoder.encode(HYBRID_ORDER_ABI, [
      [
        [
          order.info.reactor,
          order.info.swapper,
          order.info.nonce,
          order.info.deadline,
          order.info.preExecutionHook,
          order.info.preExecutionHookData,
          order.info.postExecutionHook,
          order.info.postExecutionHookData,
          order.info.auctionResolver,
        ],
        order.cosigner,
        [order.input.token, order.input.maxAmount],
        order.outputs.map((output) => [
          output.token,
          output.minAmount,
          output.recipient,
        ]),
        order.auctionStartBlock,
        order.baselinePriorityFeeWei,
        order.scalingFactor,
        order.priceCurve,
        [
          order.cosignerData.auctionTargetBlock,
          order.cosignerData.supplementalPriceCurve,
        ],
        order.cosignature,
      ],
    ]);

    expect(encoded).toEqual(manualEncoding);
  });

  it("round-trips via JSON serialization", () => {
    const order = buildOrder();
    const hybrid = new HybridOrderClass(order, chainId, RESOLVER);
    const json = hybrid.toJSON();
    const revived = HybridOrderClass.fromJSON(
      json as HybridOrderJSON,
      chainId,
      RESOLVER
    );
    expect(revived.order).toEqual(order);
    expect(json.chainId).toEqual(chainId);
    expect(json.resolver).toEqual(RESOLVER);
  });

  it("computes cosigner digest and recovers signer", () => {
    const order = buildOrder();
    const hybrid = new HybridOrderClass(order, chainId, RESOLVER);
    const digest = hashHybridCosignerData(
      hashHybridOrder(order),
      order.cosignerData,
      chainId
    );
    expect(hybrid.cosignatureHash()).toEqual(digest);
    expect(ethers.utils.getAddress(hybrid.recoverCosigner())).toEqual(
      ethers.utils.getAddress(COSIGNER.address)
    );
  });

  it("falls back to auction start block for overrides when cosigner data unset", () => {
    const order = buildOrder({
      cosignerData: {
        auctionTargetBlock: BigNumber.from(0),
        supplementalPriceCurve: [],
      },
    });
    const hybrid = new HybridOrderClass(order, chainId, RESOLVER);
    expect(hybrid.blockOverrides).toEqual({
      number: ethers.utils.hexStripZeros(order.auctionStartBlock.toHexString()),
    });
  });

  it("prefers cosigner auction target block for overrides", () => {
    const order = buildOrder({
      cosignerData: {
        auctionTargetBlock: BigNumber.from(222),
        supplementalPriceCurve: [],
      },
    });
    const hybrid = new HybridOrderClass(order, chainId, RESOLVER);
    expect(hybrid.blockOverrides).toEqual({
      number: ethers.utils.hexStripZeros(
        order.cosignerData.auctionTargetBlock.toHexString()
      ),
    });
  });

  it("exposes Permit2 data pointing to TokenTransferHook", () => {
    const order = buildOrder();
    const hybrid = new HybridOrderClass(order, chainId, RESOLVER);
    const permit = hybrid.permitData();
    expect(permit.values.spender).toEqual(order.info.preExecutionHook);
    expect(permit.values.permitted.amount).toEqual(order.input.maxAmount);
  });

  it("resolves exact-in path when scalingFactor >= 1e18", () => {
    const order = buildOrder({
      priceCurve: [],
      cosignerData: {
        auctionTargetBlock: BigNumber.from(0),
        supplementalPriceCurve: [],
      },
      auctionStartBlock: BigNumber.from(0),
      scalingFactor: WAD.add(5),
    });
    const hybrid = new HybridOrderClass(order, chainId, RESOLVER);
    const result = hybrid.resolve({
      currentBlock: BigNumber.from(10),
      priorityFeeWei: order.baselinePriorityFeeWei.add(1),
    });

    const expectedMultiplier = WAD.add(5);
    const expectedOutput = mulWadUp(
      order.outputs[0].minAmount,
      expectedMultiplier
    );
    expect(result.input.amount).toEqual(order.input.maxAmount);
    expect(result.outputs[0].amount).toEqual(expectedOutput);
  });

  it("resolves exact-out path when scalingFactor < 1e18", () => {
    const order = buildOrder({
      priceCurve: [],
      cosignerData: {
        auctionTargetBlock: BigNumber.from(0),
        supplementalPriceCurve: [],
      },
      auctionStartBlock: BigNumber.from(0),
      scalingFactor: WAD.sub(5),
    });
    const hybrid = new HybridOrderClass(order, chainId, RESOLVER);
    const result = hybrid.resolve({
      currentBlock: BigNumber.from(10),
      priorityFeeWei: order.baselinePriorityFeeWei.add(1),
    });

    const expectedMultiplier = WAD.sub(5);
    const expectedInput = mulWad(order.input.maxAmount, expectedMultiplier);
    expect(result.input.amount).toEqual(expectedInput);
    expect(result.outputs[0].amount).toEqual(order.outputs[0].minAmount);
  });

  it("throws when current block precedes target block", () => {
    const order = buildOrder({
      cosignerData: {
        auctionTargetBlock: BigNumber.from(500),
        supplementalPriceCurve: [],
      },
    });
    const hybrid = new HybridOrderClass(order, chainId, RESOLVER);
    expect(() =>
      hybrid.resolve({
        currentBlock: BigNumber.from(400),
        priorityFeeWei: order.baselinePriorityFeeWei,
      })
    ).toThrow(OrderResolutionError);
  });
});

function mulWad(a: BigNumber, b: BigNumber): BigNumber {
  if (a.isZero() || b.isZero()) {
    return BigNumber.from(0);
  }
  return a.mul(b).div(WAD);
}

function mulWadUp(a: BigNumber, b: BigNumber): BigNumber {
  if (a.isZero() || b.isZero()) {
    return BigNumber.from(0);
  }
  return a.mul(b).add(WAD).sub(1).div(WAD);
}
