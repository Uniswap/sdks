import { expect } from "chai";
import { BigNumber, Signer, Wallet } from "ethers";
import hre, { ethers } from "hardhat";

import MockERC20Abi from "../../abis/MockERC20.json";
import OrderQuoterAbi from "../../abis/OrderQuoter.json";
import Permit2Abi from "../../abis/Permit2.json";
import V3DutchOrderReactorAbi from "../../abis/V3DutchOrderReactor.json";
import { V3DutchOrderBuilder } from "../../src/builder/V3DutchOrderBuilder";
import {
  MockERC20,
  OrderQuoter,
  Permit2,
  V3DutchOrderReactor,
} from "../../src/contracts";
import {
  CosignedV3DutchOrder,
  V3CosignerData,
} from "../../src/order/V3DutchOrder";
import { NonlinearDutchDecay } from "../../src/order/types";
import { BlockchainTime } from "./utils/time";

/*
Differential test: SDK `CosignedV3DutchOrder.resolve()` against the on-chain
`OrderQuoter`.

`OrderQuoter.quote()` runs the real `V3DutchOrderReactor` and returns the
resolved order through the callback revert, so it is an independent oracle
rather than a second copy of the SDK's assumptions. Hand-written expected
values cannot demonstrate SDK/reactor equivalence - that is the same condition
that let the original divergence exist - so every amount asserted here comes
from the reactor.

Two facts about the quoter's eth_call, both pinned by assertions in `before`
rather than assumed:
  - it executes with `block.number` equal to the latest block
  - `block.basefee` inside the call is measured, not guessed, so the gas
    adjustment can be compared without depending on node-specific behaviour
*/

const ONE_GWEI = BigNumber.from(10).pow(9);
const EMPTY_CURVE: NonlinearDutchDecay = {
  relativeBlocks: [],
  relativeAmounts: [],
};

describe("DutchV3Order SDK/reactor differential", () => {
  const AMOUNT = BigNumber.from(10).pow(18);
  const BASE = BigNumber.from(10).pow(12);
  const chainId = hre.network.config.chainId || 1;

  let admin: Signer;
  let filler: Signer;
  let fillerAddress: string;
  let permit2: Permit2;
  let reactor: V3DutchOrderReactor;
  let quoter: OrderQuoter;
  let tokenIn: MockERC20;
  let tokenOut: MockERC20;
  let swapper: Wallet;
  let cosigner: Wallet;
  let deadline: number;
  let nonce = 9000;

  // block.basefee as observed inside the quoter's eth_call
  let callBaseFee: BigNumber;

  before(async () => {
    [admin, , , filler] = await ethers.getSigners();
    fillerAddress = await filler.getAddress();

    const permit2Factory = await ethers.getContractFactory(
      Permit2Abi.abi,
      Permit2Abi.bytecode
    );
    permit2 = (await permit2Factory.deploy()) as Permit2;

    const reactorFactory = await ethers.getContractFactory(
      V3DutchOrderReactorAbi.abi,
      V3DutchOrderReactorAbi.bytecode
    );
    reactor = (await reactorFactory.deploy(
      permit2.address,
      ethers.constants.AddressZero
    )) as V3DutchOrderReactor;

    const quoterFactory = await ethers.getContractFactory(
      OrderQuoterAbi.abi,
      OrderQuoterAbi.bytecode
    );
    quoter = (await quoterFactory.deploy()) as OrderQuoter;

    swapper = ethers.Wallet.createRandom().connect(ethers.provider);
    cosigner = ethers.Wallet.createRandom().connect(ethers.provider);
    await admin.sendTransaction({ to: swapper.address, value: AMOUNT });

    const tokenFactory = await ethers.getContractFactory(
      MockERC20Abi.abi,
      MockERC20Abi.bytecode
    );
    tokenIn = (await tokenFactory.deploy("Token A", "A", 18)) as MockERC20;
    tokenOut = (await tokenFactory.deploy("Token B", "B", 18)) as MockERC20;

    await tokenIn.mint(swapper.address, AMOUNT);
    await tokenIn
      .connect(swapper)
      .approve(permit2.address, ethers.constants.MaxUint256);
    await tokenOut.mint(fillerAddress, AMOUNT);
    await tokenOut
      .connect(filler)
      .approve(reactor.address, ethers.constants.MaxUint256);

    deadline = await new BlockchainTime().secondsFromNow(100000);

    // cases place decayStartBlock up to 50 blocks in the past, so give the
    // chain enough height for that to stay non-negative
    await hre.network.provider.send("hardhat_mine", ["0x100"]);

    callBaseFee = await measureCallBaseFee();

    // pin the block semantics this suite relies on
    await assertQuoterUsesLatestBlock();
  });

  /**
   * Recovers `block.basefee` as seen inside the quoter's eth_call. An output
   * with `adjustmentPerGweiBaseFee` of exactly 1 gwei and `startingBaseFee` of
   * zero shifts the resolved output by the basefee in wei, so the reactor
   * reports the value rather than the test assuming it.
   */
  async function measureCallBaseFee(): Promise<BigNumber> {
    const { full, signature } = await buildAndSign({
      input: {
        startAmount: BASE,
        curve: EMPTY_CURVE,
        maxAmount: BASE,
        adjustmentPerGweiBaseFee: BigNumber.from(0),
      },
      outputs: [
        {
          startAmount: BASE,
          curve: EMPTY_CURVE,
          minAmount: BigNumber.from(0),
          adjustmentPerGweiBaseFee: ONE_GWEI,
        },
      ],
      startingBaseFee: BigNumber.from(0),
    });
    const resolved = await quoter.callStatic.quote(full.serialize(), signature);
    return BASE.sub(resolved.outputs[0].amount);
  }

  /**
   * Confirms the eth_call resolves at the latest block. A curve of 100 over 100
   * blocks moves one unit per block of delta, so the observed decay identifies
   * the block the reactor used.
   */
  async function assertQuoterUsesLatestBlock(): Promise<void> {
    const latest = await ethers.provider.getBlockNumber();
    const offset = 5;
    const { full, signature } = await buildAndSign({
      input: {
        startAmount: BASE,
        curve: EMPTY_CURVE,
        maxAmount: BASE,
        adjustmentPerGweiBaseFee: BigNumber.from(0),
      },
      outputs: [
        {
          startAmount: BASE,
          curve: { relativeBlocks: [100], relativeAmounts: [BigInt(100)] },
          minAmount: BASE.sub(100),
          adjustmentPerGweiBaseFee: BigNumber.from(0),
        },
      ],
      decayStartBlock: latest - offset,
    });
    const resolved = await quoter.callStatic.quote(full.serialize(), signature);
    const observedDecay = BASE.sub(resolved.outputs[0].amount).toNumber();
    expect(latest - offset + observedDecay).to.eq(
      await ethers.provider.getBlockNumber(),
      "quoter eth_call did not resolve at the latest block"
    );
  }

  interface InputSpec {
    startAmount: BigNumber;
    curve: NonlinearDutchDecay;
    maxAmount: BigNumber;
    adjustmentPerGweiBaseFee: BigNumber;
  }

  interface OutputSpec {
    startAmount: BigNumber;
    curve: NonlinearDutchDecay;
    minAmount: BigNumber;
    adjustmentPerGweiBaseFee: BigNumber;
  }

  interface OrderSpec {
    input: InputSpec;
    outputs: OutputSpec[];
    startingBaseFee?: BigNumber;
    decayStartBlock?: number;
    exclusiveFiller?: string;
    exclusivityOverrideBps?: BigNumber;
    inputOverride?: BigNumber;
    outputOverrides?: BigNumber[];
  }

  async function buildAndSign(
    spec: OrderSpec
  ): Promise<{ full: CosignedV3DutchOrder; signature: string }> {
    const builder = new V3DutchOrderBuilder(
      chainId,
      reactor.address,
      permit2.address
    )
      .cosigner(cosigner.address)
      .deadline(deadline)
      .swapper(swapper.address)
      .nonce(BigNumber.from(nonce++))
      .startingBaseFee(spec.startingBaseFee ?? BigNumber.from(0))
      .input({ token: tokenIn.address, ...spec.input });

    for (const output of spec.outputs) {
      builder.output({
        token: tokenOut.address,
        recipient: swapper.address,
        ...output,
      });
    }

    const partial = builder.buildPartial();
    const { domain, types, values } = partial.permitData();
    const signature = await swapper._signTypedData(domain, types, values);

    const cosignerData: V3CosignerData = {
      decayStartBlock:
        spec.decayStartBlock ?? (await ethers.provider.getBlockNumber()),
      exclusiveFiller: spec.exclusiveFiller ?? ethers.constants.AddressZero,
      exclusivityOverrideBps:
        spec.exclusivityOverrideBps ?? BigNumber.from(0),
      inputOverride: spec.inputOverride ?? BigNumber.from(0),
      outputOverrides:
        spec.outputOverrides ?? spec.outputs.map(() => BigNumber.from(0)),
    };

    const cosignature = ethers.utils.joinSignature(
      cosigner._signingKey().signDigest(partial.cosignatureHash(cosignerData))
    );

    const full = V3DutchOrderBuilder.fromOrder(partial)
      .cosignerData(cosignerData)
      .cosignature(cosignature)
      .build();

    return { full, signature };
  }

  /**
   * Asserts SDK resolution equals reactor resolution for this exact order.
   * The quoter runs as msg.sender at the reactor, so exclusivity rights are
   * evaluated against the quoter address on both sides.
   */
  async function expectSdkMatchesReactor(
    full: CosignedV3DutchOrder,
    signature: string
  ): Promise<void> {
    const currentBlock = await ethers.provider.getBlockNumber();
    const reactorResolved = await quoter.callStatic.quote(
      full.serialize(),
      signature
    );
    const sdkResolved = full.resolve({
      currentBlock,
      filler: quoter.address,
      blockBaseFee: callBaseFee,
    });

    expect(sdkResolved.input.amount.toString()).to.eq(
      reactorResolved.input.amount.toString(),
      "input amount diverged from the reactor"
    );
    expect(sdkResolved.outputs.length).to.eq(reactorResolved.outputs.length);
    sdkResolved.outputs.forEach((output, i) => {
      expect(output.amount.toString()).to.eq(
        reactorResolved.outputs[i].amount.toString(),
        `output ${i} amount diverged from the reactor`
      );
    });
  }

  /** Runs the same order shape at several positions along its curve. */
  async function expectMatchesAcrossBlocks(
    label: string,
    spec: (decayStartBlock: number) => OrderSpec,
    offsets: number[] = [-2, 0, 1, 2, 3, 5, 9, 50]
  ): Promise<void> {
    for (const offset of offsets) {
      const latest = await ethers.provider.getBlockNumber();
      const { full, signature } = await buildAndSign(spec(latest - offset));
      try {
        await expectSdkMatchesReactor(full, signature);
      } catch (e) {
        throw new Error(`${label} @ blockOffset ${offset}: ${e}`);
      }
    }
  }

  it("matches the reactor for an order with no decay", async () => {
    await expectMatchesAcrossBlocks("no decay", (decayStartBlock) => ({
      input: {
        startAmount: BASE,
        curve: EMPTY_CURVE,
        maxAmount: BASE,
        adjustmentPerGweiBaseFee: BigNumber.from(0),
      },
      outputs: [
        {
          startAmount: BASE,
          curve: EMPTY_CURVE,
          minAmount: BASE,
          adjustmentPerGweiBaseFee: BigNumber.from(0),
        },
      ],
      decayStartBlock,
    }));
  });

  it("matches the reactor for a decaying output curve", async () => {
    await expectMatchesAcrossBlocks("decaying output", (decayStartBlock) => ({
      input: {
        startAmount: BASE,
        curve: EMPTY_CURVE,
        maxAmount: BASE,
        adjustmentPerGweiBaseFee: BigNumber.from(0),
      },
      outputs: [
        {
          startAmount: BASE,
          curve: { relativeBlocks: [8], relativeAmounts: [BigInt(1000)] },
          minAmount: BASE.sub(1000),
          adjustmentPerGweiBaseFee: BigNumber.from(0),
        },
      ],
      decayStartBlock,
    }));
  });

  it("matches the reactor for an increasing output curve", async () => {
    await expectMatchesAcrossBlocks("increasing output", (decayStartBlock) => ({
      input: {
        startAmount: BASE,
        curve: EMPTY_CURVE,
        maxAmount: BASE,
        adjustmentPerGweiBaseFee: BigNumber.from(0),
      },
      outputs: [
        {
          startAmount: BASE,
          curve: { relativeBlocks: [8], relativeAmounts: [BigInt(-1000)] },
          minAmount: BigNumber.from(0),
          adjustmentPerGweiBaseFee: BigNumber.from(0),
        },
      ],
      decayStartBlock,
    }));
  });

  it("matches the reactor for a decaying input curve", async () => {
    await expectMatchesAcrossBlocks("decaying input", (decayStartBlock) => ({
      input: {
        startAmount: BASE,
        curve: { relativeBlocks: [8], relativeAmounts: [BigInt(1000)] },
        maxAmount: BASE,
        adjustmentPerGweiBaseFee: BigNumber.from(0),
      },
      outputs: [
        {
          startAmount: BASE,
          curve: EMPTY_CURVE,
          minAmount: BASE,
          adjustmentPerGweiBaseFee: BigNumber.from(0),
        },
      ],
      decayStartBlock,
    }));
  });

  // Rounding is the divergence hand-written expectations are least likely to
  // catch: interpolating absolute rather than relative amounts inverts the
  // floor/ceil branch, which is off by one only for particular block deltas.
  it("matches the reactor on curves that do not divide evenly", async () => {
    const awkward = [
      { blocks: [3], amounts: [BigInt(1000)] },
      { blocks: [7], amounts: [BigInt(1)] },
      { blocks: [7], amounts: [BigInt(-1)] },
      { blocks: [3], amounts: [BigInt(-1000)] },
      { blocks: [6], amounts: [BigInt(999_999)] },
      { blocks: [9], amounts: [BigInt(7)] },
    ];
    for (const { blocks, amounts } of awkward) {
      await expectMatchesAcrossBlocks(
        `awkward output curve ${blocks}/${amounts}`,
        (decayStartBlock) => ({
          input: {
            startAmount: BASE,
            curve: EMPTY_CURVE,
            maxAmount: BASE,
            adjustmentPerGweiBaseFee: BigNumber.from(0),
          },
          outputs: [
            {
              startAmount: BASE,
              curve: { relativeBlocks: blocks, relativeAmounts: amounts },
              minAmount: BigNumber.from(0),
              adjustmentPerGweiBaseFee: BigNumber.from(0),
            },
          ],
          decayStartBlock,
        }),
        [0, 1, 2, 3, 4, 5, 6, 7, 8]
      );
      await expectMatchesAcrossBlocks(
        `awkward input curve ${blocks}/${amounts}`,
        (decayStartBlock) => ({
          input: {
            startAmount: BASE,
            curve: { relativeBlocks: blocks, relativeAmounts: amounts },
            maxAmount: BASE.mul(2),
            adjustmentPerGweiBaseFee: BigNumber.from(0),
          },
          outputs: [
            {
              startAmount: BASE,
              curve: EMPTY_CURVE,
              minAmount: BASE,
              adjustmentPerGweiBaseFee: BigNumber.from(0),
            },
          ],
          decayStartBlock,
        }),
        [0, 1, 2, 3, 4, 5, 6, 7, 8]
      );
    }
  });

  it("matches the reactor for a multi-point curve", async () => {
    await expectMatchesAcrossBlocks("multi-point", (decayStartBlock) => ({
      input: {
        startAmount: BASE,
        curve: EMPTY_CURVE,
        maxAmount: BASE,
        adjustmentPerGweiBaseFee: BigNumber.from(0),
      },
      outputs: [
        {
          startAmount: BASE,
          curve: {
            relativeBlocks: [2, 5, 9, 14],
            relativeAmounts: [BigInt(3), BigInt(17), BigInt(-4), BigInt(101)],
          },
          minAmount: BigNumber.from(0),
          adjustmentPerGweiBaseFee: BigNumber.from(0),
        },
      ],
      decayStartBlock,
    }));
  });

  it("matches the reactor for a full 16-point curve", async () => {
    const relativeBlocks = Array.from({ length: 16 }, (_, i) => (i + 1) * 2);
    const relativeAmounts = relativeBlocks.map((_, i) =>
      BigInt((i + 1) * 37 * (i % 3 === 0 ? -1 : 1))
    );
    await expectMatchesAcrossBlocks(
      "16-point",
      (decayStartBlock) => ({
        input: {
          startAmount: BASE,
          curve: EMPTY_CURVE,
          maxAmount: BASE,
          adjustmentPerGweiBaseFee: BigNumber.from(0),
        },
        outputs: [
          {
            startAmount: BASE,
            curve: { relativeBlocks, relativeAmounts },
            minAmount: BigNumber.from(0),
            adjustmentPerGweiBaseFee: BigNumber.from(0),
          },
        ],
        decayStartBlock,
      }),
      [0, 1, 3, 7, 15, 33]
    );
  });

  // The reported vulnerability: a curve whose raw resolution crosses the signed
  // bounds. The reactor clamps; the SDK previously did not, and reported
  // economics inverted from settlement.
  it("matches the reactor for a curve crossing maxAmount and minAmount", async () => {
    const DRAIN = BigNumber.from(1_000_000);
    await expectMatchesAcrossBlocks(
      "clamp-crossing",
      (decayStartBlock) => ({
        input: {
          startAmount: BigNumber.from(1),
          curve: { relativeBlocks: [1], relativeAmounts: [BigInt(-999_999)] },
          maxAmount: BigNumber.from(1),
          adjustmentPerGweiBaseFee: BigNumber.from(0),
        },
        outputs: [
          {
            startAmount: DRAIN,
            curve: { relativeBlocks: [1], relativeAmounts: [BigInt(999_999)] },
            minAmount: DRAIN,
            adjustmentPerGweiBaseFee: BigNumber.from(0),
          },
        ],
        decayStartBlock,
      }),
      [-1, 0, 1, 2, 5]
    );
  });

  it("matches the reactor for cosigner overrides", async () => {
    await expectMatchesAcrossBlocks("cosigner overrides", (decayStartBlock) => ({
      input: {
        startAmount: BASE,
        curve: { relativeBlocks: [6], relativeAmounts: [BigInt(500)] },
        maxAmount: BASE,
        adjustmentPerGweiBaseFee: BigNumber.from(0),
      },
      outputs: [
        {
          startAmount: BASE,
          curve: { relativeBlocks: [6], relativeAmounts: [BigInt(300)] },
          minAmount: BigNumber.from(0),
          adjustmentPerGweiBaseFee: BigNumber.from(0),
        },
      ],
      // an override may only improve the order for the swapper
      inputOverride: BASE.div(2),
      outputOverrides: [BASE.mul(2)],
      decayStartBlock,
    }));
  });

  it("matches the reactor for multiple outputs", async () => {
    await expectMatchesAcrossBlocks("multi-output", (decayStartBlock) => ({
      input: {
        startAmount: BASE,
        curve: EMPTY_CURVE,
        maxAmount: BASE,
        adjustmentPerGweiBaseFee: BigNumber.from(0),
      },
      outputs: [
        {
          startAmount: BASE,
          curve: { relativeBlocks: [4], relativeAmounts: [BigInt(111)] },
          minAmount: BigNumber.from(0),
          adjustmentPerGweiBaseFee: BigNumber.from(0),
        },
        {
          startAmount: BASE.div(3),
          curve: { relativeBlocks: [7], relativeAmounts: [BigInt(-53)] },
          minAmount: BigNumber.from(0),
          adjustmentPerGweiBaseFee: BigNumber.from(0),
        },
      ],
      decayStartBlock,
    }));
  });

  // The empty-curve variant of the report: base fee adjustment alone moves the
  // amounts, and the SDK previously dropped these fields entirely.
  it("matches the reactor for base fee adjustment on an empty curve", async () => {
    await expectMatchesAcrossBlocks(
      "gas adjustment, empty curve",
      (decayStartBlock) => ({
        input: {
          startAmount: BigNumber.from(1),
          curve: EMPTY_CURVE,
          maxAmount: BigNumber.from(1),
          adjustmentPerGweiBaseFee: BigNumber.from(0),
        },
        outputs: [
          {
            startAmount: BigNumber.from(1),
            curve: EMPTY_CURVE,
            minAmount: BigNumber.from(1),
            adjustmentPerGweiBaseFee: BigNumber.from(999_999),
          },
        ],
        // basefee inside the call is below this, so the delta is negative and
        // the adjustment rounds up, exercising the mulDivUp branch
        startingBaseFee: callBaseFee.add(ONE_GWEI.mul(2)),
        decayStartBlock,
      }),
      [0, 1, 3]
    );
  });

  it("matches the reactor for base fee adjustment combined with a curve", async () => {
    await expectMatchesAcrossBlocks(
      "gas adjustment + curve",
      (decayStartBlock) => ({
        input: {
          startAmount: BASE,
          curve: { relativeBlocks: [5], relativeAmounts: [BigInt(777)] },
          maxAmount: BASE.mul(2),
          adjustmentPerGweiBaseFee: BigNumber.from(12_345),
        },
        outputs: [
          {
            startAmount: BASE,
            curve: { relativeBlocks: [5], relativeAmounts: [BigInt(-321)] },
            minAmount: BigNumber.from(0),
            adjustmentPerGweiBaseFee: BigNumber.from(54_321),
          },
        ],
        startingBaseFee: callBaseFee.add(ONE_GWEI.mul(3)),
        decayStartBlock,
      }),
      [0, 1, 2, 4, 6]
    );
  });

  it("matches the reactor when the gas adjustment is clamped by the bounds", async () => {
    await expectMatchesAcrossBlocks(
      "gas adjustment clamped",
      (decayStartBlock) => ({
        input: {
          startAmount: BASE,
          curve: EMPTY_CURVE,
          // adjustment would push the input past maxAmount
          maxAmount: BASE.add(10),
          adjustmentPerGweiBaseFee: BigNumber.from(10).pow(9),
        },
        outputs: [
          {
            startAmount: BASE,
            curve: EMPTY_CURVE,
            // adjustment would push the output below minAmount
            minAmount: BASE.sub(10),
            adjustmentPerGweiBaseFee: BigNumber.from(10).pow(9),
          },
        ],
        startingBaseFee: callBaseFee.add(ONE_GWEI.mul(5)),
        decayStartBlock,
      }),
      [0, 2]
    );
  });

  it("matches the reactor for a non-exclusive filler inside the exclusivity window", async () => {
    // the quoter is msg.sender at the reactor, so an unrelated exclusive filler
    // means neither side has filling rights
    await expectMatchesAcrossBlocks(
      "exclusivity override",
      (decayStartBlock) => ({
        input: {
          startAmount: BASE,
          curve: EMPTY_CURVE,
          maxAmount: BASE,
          adjustmentPerGweiBaseFee: BigNumber.from(0),
        },
        outputs: [
          {
            startAmount: BASE,
            curve: { relativeBlocks: [5], relativeAmounts: [BigInt(999)] },
            minAmount: BigNumber.from(0),
            adjustmentPerGweiBaseFee: BigNumber.from(0),
          },
        ],
        exclusiveFiller: fillerAddress,
        exclusivityOverrideBps: BigNumber.from(25),
        decayStartBlock,
      }),
      // negative offsets keep the current block inside the exclusivity window
      [-3, -1, 0, 1, 4]
    );
  });

  it("throws where the reactor reverts for a strictly exclusive order", async () => {
    const latest = await ethers.provider.getBlockNumber();
    const { full, signature } = await buildAndSign({
      input: {
        startAmount: BASE,
        curve: EMPTY_CURVE,
        maxAmount: BASE,
        adjustmentPerGweiBaseFee: BigNumber.from(0),
      },
      outputs: [
        {
          startAmount: BASE,
          curve: EMPTY_CURVE,
          minAmount: BASE,
          adjustmentPerGweiBaseFee: BigNumber.from(0),
        },
      ],
      exclusiveFiller: fillerAddress,
      exclusivityOverrideBps: BigNumber.from(0),
      // exclusivity window still open at the current block
      decayStartBlock: latest + 5,
    });

    let reactorReverted = false;
    try {
      await quoter.callStatic.quote(full.serialize(), signature);
    } catch {
      reactorReverted = true;
    }
    expect(reactorReverted).to.eq(
      true,
      "expected the reactor to reject a strictly exclusive order"
    );

    expect(() =>
      full.resolve({
        currentBlock: latest,
        filler: quoter.address,
        blockBaseFee: callBaseFee,
      })
    ).to.throw("NoExclusiveOverride");
  });

  // The strongest oracle available: a real fill, compared against resolve()
  // at the block and basefee the transaction actually landed in.
  it("matches actual settlement balances for an executed order", async () => {
    const latest = await ethers.provider.getBlockNumber();
    const { full, signature } = await buildAndSign({
      input: {
        startAmount: BASE,
        curve: { relativeBlocks: [7], relativeAmounts: [BigInt(1234)] },
        maxAmount: BASE,
        adjustmentPerGweiBaseFee: BigNumber.from(0),
      },
      outputs: [
        {
          startAmount: BASE,
          curve: { relativeBlocks: [7], relativeAmounts: [BigInt(4321)] },
          minAmount: BigNumber.from(0),
          adjustmentPerGweiBaseFee: BigNumber.from(0),
        },
      ],
      decayStartBlock: latest - 3,
    });

    const swapperInBefore = await tokenIn.balanceOf(swapper.address);
    const fillerOutBefore = await tokenOut.balanceOf(fillerAddress);

    const tx = await reactor
      .connect(filler)
      .execute({ order: full.serialize(), sig: signature });
    const receipt = await tx.wait();
    expect(receipt.status).to.eq(1);

    const block = await ethers.provider.getBlock(receipt.blockNumber);
    const sdkResolved = full.resolve({
      currentBlock: receipt.blockNumber,
      filler: fillerAddress,
      blockBaseFee: block.baseFeePerGas ?? BigNumber.from(0),
    });

    const inputPaid = swapperInBefore.sub(await tokenIn.balanceOf(swapper.address));
    const outputPaid = fillerOutBefore.sub(await tokenOut.balanceOf(fillerAddress));

    expect(sdkResolved.input.amount.toString()).to.eq(
      inputPaid.toString(),
      "resolved input did not match the amount actually transferred"
    );
    expect(sdkResolved.outputs[0].amount.toString()).to.eq(
      outputPaid.toString(),
      "resolved output did not match the amount actually transferred"
    );
  });
});
