import hre, { ethers } from "hardhat";
import { expect } from "chai";
import { Signer } from "ethers";

import DirectTakerFillContract from "../../abis/DirectTakerExecutor.json";
import DutchLimitOrderReactorAbi from "../../abis/DutchLimitOrderReactor.json";
import Permit2Abi from "../../abis/Permit2.json";
import OrderQuoterAbi from "../../abis/OrderQuoter.json";
import MockERC20Abi from "../../abis/MockERC20.json";

import {
  OrderQuoter,
  Permit2,
  DutchLimitOrderReactor,
  MockERC20,
} from "../../src/contracts";
import {
  DutchLimitOrderBuilder,
  DutchLimitOrder,
  OrderValidator,
  OrderQuoter as OrderQuoterLib,
  OrderValidation,
  getCancelSingleParams,
} from "../../";

const { BigNumber } = ethers;

describe("OrderValidator", () => {
  let fillContract: string;
  let reactor: DutchLimitOrderReactor;
  let permit2: Permit2;
  let quoter: OrderQuoter;
  let chainId: number;
  let builder: DutchLimitOrderBuilder;
  let validator: OrderValidator;
  let tokenIn: MockERC20;
  let tokenOut: MockERC20;
  let admin: Signer;
  let taker: Signer;
  let maker: ethers.Wallet;

  beforeEach(async () => {
    [admin, taker] = await ethers.getSigners();

    const directTakerFillContractFactory = await ethers.getContractFactory(
      DirectTakerFillContract.abi,
      DirectTakerFillContract.bytecode
    );
    fillContract = (
      await directTakerFillContractFactory.deploy(await taker.getAddress())
    ).address;

    const permit2Factory = await ethers.getContractFactory(
      Permit2Abi.abi,
      Permit2Abi.bytecode
    );
    permit2 = (await permit2Factory.deploy()) as Permit2;

    const reactorFactory = await ethers.getContractFactory(
      DutchLimitOrderReactorAbi.abi,
      DutchLimitOrderReactorAbi.bytecode
    );
    reactor = (await reactorFactory.deploy(
      permit2.address,
      0,
      ethers.constants.AddressZero
    )) as DutchLimitOrderReactor;

    const orderQuoterFactory = await ethers.getContractFactory(
      OrderQuoterAbi.abi,
      OrderQuoterAbi.bytecode
    );
    quoter = (await orderQuoterFactory.deploy()) as OrderQuoter;
    chainId = hre.network.config.chainId || 1;
    builder = new DutchLimitOrderBuilder(
      chainId,
      reactor.address,
      permit2.address
    );

    maker = ethers.Wallet.createRandom().connect(ethers.provider);
    await admin.sendTransaction({
      to: await maker.getAddress(),
      value: BigNumber.from(10).pow(18),
    });
    validator = new OrderValidator(ethers.provider, chainId, quoter.address);

    const tokenFactory = await ethers.getContractFactory(
      MockERC20Abi.abi,
      MockERC20Abi.bytecode
    );
    tokenIn = (await tokenFactory.deploy("TEST A", "ta", 18)) as MockERC20;
    tokenOut = (await tokenFactory.deploy("TEST B", "tb", 18)) as MockERC20;

    await tokenIn.mint(await maker.getAddress(), BigNumber.from(10).pow(18));
    await tokenIn
      .connect(maker)
      .approve(permit2.address, ethers.constants.MaxUint256);

    await tokenOut.mint(
      await taker.getAddress(),
      BigNumber.from(10).pow(18).mul(100)
    );
    await tokenOut
      .connect(taker)
      .approve(fillContract, ethers.constants.MaxUint256);
  });

  it("quotes a valid order", async () => {
    const deadline = Math.floor(new Date().getTime() / 1000) + 1000;
    const order = builder
      .deadline(deadline)
      .endTime(deadline)
      .startTime(deadline - 1000)
      .offerer(await maker.getAddress())
      .nonce(BigNumber.from(98))
      .input({
        token: tokenIn.address,
        startAmount: BigNumber.from("1000000"),
        endAmount: BigNumber.from("1000000"),
      })
      .output({
        token: tokenOut.address,
        startAmount: BigNumber.from("1000000000000000000"),
        endAmount: BigNumber.from("900000000000000000"),
        recipient: "0x0000000000000000000000000000000000000000",
        isFeeOutput: false,
      })
      .build();

    const { domain, types, values } = order.permitData();
    const signature = await maker._signTypedData(domain, types, values);

    const quoterLib = new OrderQuoterLib(
      ethers.provider,
      chainId,
      quoter.address
    );
    const { validation, quote } = await quoterLib.quote({ order, signature });
    expect(validation).to.equal(OrderValidation.OK);
    if (!quote) {
      throw new Error("Invalid quote");
    }

    expect(quote.input.amount.toString()).to.equal("1000000");
  });

  it("validates a valid order", async () => {
    const deadline = Math.floor(new Date().getTime() / 1000) + 1000;
    const order = builder
      .deadline(deadline)
      .endTime(deadline)
      .startTime(deadline - 1000)
      .nonce(BigNumber.from(100))
      .offerer(await maker.getAddress())
      .input({
        token: tokenIn.address,
        startAmount: BigNumber.from("1000000"),
        endAmount: BigNumber.from("1000000"),
      })
      .output({
        token: tokenOut.address,
        startAmount: BigNumber.from("1000000000000000000"),
        endAmount: BigNumber.from("900000000000000000"),
        recipient: "0x0000000000000000000000000000000000000000",
        isFeeOutput: false,
      })
      .build();

    const { domain, types, values } = order.permitData();
    const signature = await maker._signTypedData(domain, types, values);

    expect(await validator.validate({ order, signature })).to.equal(
      OrderValidation.OK
    );
  });

  it("validatesa a filled order", async () => {
    const deadline = Math.floor(new Date().getTime() / 1000) + 1000;
    const amount = BigNumber.from(10).pow(18);
    const order = builder
      .deadline(deadline)
      .endTime(deadline)
      .startTime(deadline - 1000)
      .nonce(BigNumber.from(100))
      .offerer(await maker.getAddress())
      .input({
        token: tokenIn.address,
        startAmount: amount,
        endAmount: amount,
      })
      .output({
        token: tokenOut.address,
        startAmount: amount,
        endAmount: BigNumber.from(10).pow(17).mul(9),
        recipient: await maker.getAddress(),
        isFeeOutput: false,
      })
      .build();

    const { domain, types, values } = order.permitData();
    const signature = await maker._signTypedData(domain, types, values);

    const res = await reactor
      .connect(taker)
      .execute(
        { order: order.serialize(), sig: signature },
        fillContract,
        "0x"
      );
    await res.wait();

    expect(await validator.validate({ order, signature })).to.equal(
      OrderValidation.NonceUsed
    );
  });

  it("validates an order with insufficient funds", async () => {
    const deadline = Math.floor(new Date().getTime() / 1000) + 1000;
    const order = builder
      .deadline(deadline)
      .endTime(deadline)
      .startTime(deadline - 1000)
      .nonce(BigNumber.from(100))
      .offerer(await maker.getAddress())
      .input({
        token: tokenIn.address,
        startAmount: BigNumber.from("10").pow(18).mul(2),
        endAmount: BigNumber.from("10").pow(18).mul(2),
      })
      .output({
        token: tokenOut.address,
        startAmount: BigNumber.from("1000000000000000000"),
        endAmount: BigNumber.from("900000000000000000"),
        recipient: "0x0000000000000000000000000000000000000000",
        isFeeOutput: false,
      })
      .build();

    const { domain, types, values } = order.permitData();
    const signature = await maker._signTypedData(domain, types, values);

    expect(await validator.validate({ order, signature })).to.equal(
      OrderValidation.InsufficientFunds
    );
  });

  it("validates an order with both input and output decay", async () => {
    const deadline = Math.floor(new Date().getTime() / 1000) + 1000;
    const order = builder
      .deadline(deadline)
      .endTime(deadline)
      .startTime(deadline - 1000)
      .nonce(BigNumber.from(100))
      .offerer(await maker.getAddress())
      .input({
        token: tokenIn.address,
        startAmount: BigNumber.from("1000000"),
        endAmount: BigNumber.from("2000000"),
      })
      .output({
        token: tokenOut.address,
        startAmount: BigNumber.from("1000000000000000000"),
        endAmount: BigNumber.from("900000000000000000"),
        recipient: "0x0000000000000000000000000000000000000000",
        isFeeOutput: false,
      })
      .build();

    const { domain, types, values } = order.permitData();
    const signature = await maker._signTypedData(domain, types, values);

    expect(await validator.validate({ order, signature })).to.equal(
      OrderValidation.InvalidOrderFields
    );
  });

  it("validates an order with incorrect input amount", async () => {
    const deadline = Math.floor(new Date().getTime() / 1000) + 1000;
    // input decays downward
    const order = builder
      .deadline(deadline)
      .endTime(deadline)
      .startTime(deadline - 1000)
      .nonce(BigNumber.from(100))
      .offerer(await maker.getAddress())
      .input({
        token: tokenIn.address,
        startAmount: BigNumber.from("1000000"),
        endAmount: BigNumber.from("200000"),
      })
      .output({
        token: tokenOut.address,
        startAmount: BigNumber.from("1000000000000000000"),
        endAmount: BigNumber.from("1000000000000000000"),
        recipient: "0x0000000000000000000000000000000000000000",
        isFeeOutput: false,
      })
      .build();

    const { domain, types, values } = order.permitData();
    const signature = await maker._signTypedData(domain, types, values);

    expect(await validator.validate({ order, signature })).to.equal(
      OrderValidation.InvalidOrderFields
    );
  });

  it("validates an order with incorrect output amount", async () => {
    const deadline = Math.floor(new Date().getTime() / 1000) + 1000;
    // output decays upward
    const info = builder
      .deadline(deadline)
      .endTime(deadline)
      .startTime(deadline - 1000)
      .nonce(BigNumber.from(100))
      .offerer(await maker.getAddress())
      .input({
        token: tokenIn.address,
        startAmount: BigNumber.from("1000000"),
        endAmount: BigNumber.from("1000000"),
      })
      .output({
        token: tokenOut.address,
        startAmount: BigNumber.from("1000000000000000000"),
        endAmount: BigNumber.from("1000000000000000000"),
        recipient: "0x0000000000000000000000000000000000000000",
        isFeeOutput: false,
      })
      .build().info;
    const output = Object.assign({}, info.outputs[0], {
      endAmount: BigNumber.from("20000000000000000000"),
    });

    const order = new DutchLimitOrder(
      Object.assign(info, { outputs: [output] }),
      chainId,
      permit2.address
    );

    const { domain, types, values } = order.permitData();
    const signature = await maker._signTypedData(domain, types, values);

    expect(await validator.validate({ order, signature })).to.equal(
      OrderValidation.InvalidOrderFields
    );
  });

  it("validates an expired order", async () => {
    const deadline = Math.floor(new Date().getTime() / 1000) + 1;
    const info = builder
      .deadline(deadline)
      .endTime(deadline)
      .startTime(deadline)
      .offerer(await maker.getAddress())
      .nonce(BigNumber.from(100))
      .input({
        token: tokenIn.address,
        startAmount: BigNumber.from("1000000"),
        endAmount: BigNumber.from("1000000"),
      })
      .output({
        token: tokenOut.address,
        startAmount: BigNumber.from("1000000000000000000"),
        endAmount: BigNumber.from("900000000000000000"),
        recipient: "0x0000000000000000000000000000000000000000",
        isFeeOutput: false,
      })
      .build().info;
    const order = new DutchLimitOrder(
      Object.assign(info, {
        deadline: deadline - 100,
        endTime: deadline - 100,
        startTime: deadline - 101,
      }),
      chainId,
      permit2.address
    );

    const { domain, types, values } = order.permitData();
    const signature = await maker._signTypedData(domain, types, values);

    expect(await validator.validate({ order, signature })).to.equal(
      OrderValidation.Expired
    );
  });

  it("validates an order before and after expiry", async () => {
    const deadline = Math.floor(new Date().getTime() / 1000) + 1000;
    const info = builder
      .deadline(deadline)
      .endTime(deadline)
      .startTime(deadline - 1000)
      .offerer(await maker.getAddress())
      .nonce(BigNumber.from(100))
      .input({
        token: tokenIn.address,
        startAmount: BigNumber.from("1000000"),
        endAmount: BigNumber.from("1000000"),
      })
      .output({
        token: tokenOut.address,
        startAmount: BigNumber.from("1000000000000000000"),
        endAmount: BigNumber.from("900000000000000000"),
        recipient: "0x0000000000000000000000000000000000000000",
        isFeeOutput: false,
      })
      .build().info;

    const order = new DutchLimitOrder(info, chainId, permit2.address);

    const { domain, types, values } = order.permitData();
    const signature = await maker._signTypedData(domain, types, values);

    expect(await validator.validate({ order, signature })).to.equal(
      OrderValidation.OK
    );
    await hre.network.provider.send("evm_increaseTime", [3600]);
    await hre.network.provider.send("evm_mine"); // this one will have 02:00 PM as its timestamp
    expect(await validator.validate({ order, signature })).to.equal(
      OrderValidation.Expired
    );
    expect(await validator.validate({ order, signature })).to.equal(
      OrderValidation.Expired
    );
    expect(await validator.validate({ order, signature })).to.equal(
      OrderValidation.Expired
    );
    expect(await validator.validate({ order, signature })).to.equal(
      OrderValidation.Expired
    );
  });

  it("validates an invalid dutch decay", async () => {
    const deadline = Math.floor(new Date().getTime() / 1000) + 1;
    const info = builder
      .deadline(deadline)
      .endTime(deadline)
      .startTime(deadline)
      .offerer(await maker.getAddress())
      .nonce(BigNumber.from(100))
      .input({
        token: tokenIn.address,
        startAmount: BigNumber.from("1000000"),
        endAmount: BigNumber.from("1000000"),
      })
      .output({
        token: tokenOut.address,
        startAmount: BigNumber.from("1000000000000000000"),
        endAmount: BigNumber.from("900000000000000000"),
        recipient: "0x0000000000000000000000000000000000000000",
        isFeeOutput: false,
      })
      .build().info;
    const order = new DutchLimitOrder(
      Object.assign(info, { endTime: deadline - 100 }),
      chainId,
      permit2.address
    );

    const { domain, types, values } = order.permitData();
    const signature = await maker._signTypedData(domain, types, values);

    expect(await validator.validate({ order, signature })).to.equal(
      OrderValidation.InvalidOrderFields
    );
  });

  it("validates a canceled order", async () => {
    const deadline = Math.floor(new Date().getTime() / 1000) + 1;
    const info = builder
      .deadline(deadline)
      .endTime(deadline)
      .startTime(deadline - 1000)
      .nonce(BigNumber.from(7))
      .offerer(await maker.getAddress())
      .input({
        token: tokenIn.address,
        startAmount: BigNumber.from("1000000"),
        endAmount: BigNumber.from("1000000"),
      })
      .output({
        token: tokenOut.address,
        startAmount: BigNumber.from("1000000000000000000"),
        endAmount: BigNumber.from("900000000000000000"),
        recipient: "0x0000000000000000000000000000000000000000",
        isFeeOutput: false,
      })
      .build().info;
    const order = new DutchLimitOrder(info, chainId, permit2.address);

    const { domain, types, values } = order.permitData();
    const signature = await maker._signTypedData(domain, types, values);
    const { word, mask } = getCancelSingleParams(BigNumber.from(7));
    await permit2.connect(maker).invalidateUnorderedNonces(word, mask);

    expect(await validator.validate({ order, signature })).to.equal(
      OrderValidation.NonceUsed
    );
  });
});
