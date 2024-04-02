import hre, { ethers } from "hardhat";
import { expect } from "chai";
import { Signer } from "ethers";

import ExclusiveDutchOrderReactorAbi from "../../abis/ExclusiveDutchOrderReactor.json";
import ExclusiveFillerValidationAbi from "../../abis/ExclusiveFillerValidation.json";
import OrderQuoterAbi from "../../abis/OrderQuoter.json";
import MockERC20Abi from "../../abis/MockERC20.json";
import { encodeExclusiveFillerData } from "../../src/order/validation";

import {
  OrderQuoter,
  Permit2,
  DutchOrderReactor,
  MockERC20,
} from "../../src/contracts";
import {
  DutchOrderBuilder,
  DutchOrder,
  OrderValidator,
  UniswapXOrderQuoter as OrderQuoterLib,
  OrderValidation,
  getCancelSingleParams,
  PERMIT2_MAPPING,
} from "../../";
import { deployAndReturnPermit2 } from "./utils/permit2";

const { BigNumber } = ethers;
const parseEther = ethers.utils.parseEther;

describe("OrderValidator", () => {
  const TWENTY_SECOND_CENTURY = 4102444800;
  const DIRECT_FILL = '0x0000000000000000000000000000000000000001';

  let additionalValidationContract: string;
  let reactor: DutchOrderReactor;
  let permit2: Permit2;
  let quoter: OrderQuoter;
  let chainId: number;
  let builder: DutchOrderBuilder;
  let validator: OrderValidator;
  let tokenIn: MockERC20;
  let tokenOut: MockERC20;
  let admin: Signer;
  let filler: Signer;
  let swapper: ethers.Wallet;

  beforeEach(async () => {
    [admin, filler] = await ethers.getSigners();

    chainId = hre.network.config.chainId || 1;

    const exclusivityValidatorFactory = await ethers.getContractFactory(
      ExclusiveFillerValidationAbi.abi,
      ExclusiveFillerValidationAbi.bytecode
    );
    additionalValidationContract = (await exclusivityValidatorFactory.deploy()).address;

    permit2 = await deployAndReturnPermit2(admin);

    const reactorFactory = await ethers.getContractFactory(
      ExclusiveDutchOrderReactorAbi.abi,
      ExclusiveDutchOrderReactorAbi.bytecode
    );
    reactor = (await reactorFactory.deploy(
      permit2.address,
      ethers.constants.AddressZero
    )) as DutchOrderReactor;

    const orderQuoterFactory = await ethers.getContractFactory(
      OrderQuoterAbi.abi,
      OrderQuoterAbi.bytecode
    );
    quoter = (await orderQuoterFactory.deploy()) as OrderQuoter;
    builder = new DutchOrderBuilder(
      chainId,
      reactor.address,
      permit2.address
    );

    swapper = ethers.Wallet.createRandom().connect(ethers.provider);
    await admin.sendTransaction({
      to: await swapper.getAddress(),
      value: parseEther('1'),
    });
    validator = new OrderValidator(ethers.provider, chainId, quoter.address);

    const tokenFactory = await ethers.getContractFactory(
      MockERC20Abi.abi,
      MockERC20Abi.bytecode
    );
    tokenIn = (await tokenFactory.deploy("TEST A", "ta", 18)) as MockERC20;
    tokenOut = (await tokenFactory.deploy("TEST B", "tb", 18)) as MockERC20;

    await tokenIn.mint(await swapper.getAddress(), parseEther('1'));
    await tokenIn
      .connect(swapper)
      .approve(permit2.address, ethers.constants.MaxUint256);

    await tokenOut.mint(
      await filler.getAddress(),
      parseEther('100'),
    );
    await tokenOut
      .connect(filler)
      .approve(reactor.address, ethers.constants.MaxUint256);
  });

  it("quotes a valid order", async () => {
    const deadline = Math.floor(new Date().getTime() / 1000) + 1000;
    const order = builder
      .deadline(deadline)
      .decayEndTime(deadline)
      .decayStartTime(deadline - 1000)
      .swapper(await swapper.getAddress())
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
      })
      .build();

    const { domain, types, values } = order.permitData();
    const signature = await swapper._signTypedData(domain, types, values);

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
      .decayEndTime(deadline)
      .decayStartTime(deadline - 1000)
      .nonce(BigNumber.from(100))
      .swapper(await swapper.getAddress())
      .input({
        token: tokenIn.address,
        startAmount: BigNumber.from("1000000"),
        endAmount: BigNumber.from("1000000"),
      })
      .output({
        token: tokenOut.address,
        startAmount: parseEther('1'),
        endAmount: parseEther('0.9'),
        recipient: "0x0000000000000000000000000000000000000000",
      })
      .build();

    const { domain, types, values } = order.permitData();
    const signature = await swapper._signTypedData(domain, types, values);

    expect(await validator.validate({ order, signature })).to.equal(
      OrderValidation.OK
    );
  });

  it("validates a filled order", async () => {
    const deadline = Math.floor(new Date().getTime() / 1000) + 1000;
    const amount = parseEther('1');
    const order = builder
      .deadline(deadline)
      .decayEndTime(deadline)
      .decayStartTime(deadline - 1000)
      .nonce(BigNumber.from(100))
      .swapper(await swapper.getAddress())
      .input({
        token: tokenIn.address,
        startAmount: amount,
        endAmount: amount,
      })
      .output({
        token: tokenOut.address,
        startAmount: amount,
        endAmount: BigNumber.from(10).pow(17).mul(9),
        recipient: await swapper.getAddress(),
      })
      .build();

    const { domain, types, values } = order.permitData();
    const signature = await swapper._signTypedData(domain, types, values);

    const res = await reactor
      .connect(filler)
      .execute(
        { order: order.serialize(), sig: signature },
      );
    await res.wait();

    expect(await validator.validate({ order, signature })).to.equal(
      OrderValidation.NonceUsed
    );
  });

  it("validates an order failing internal exclusivity", async () => {
    const decayStartTime = Math.floor(new Date().getTime() / 1000) + 1000;
    const order = builder
      .deadline(decayStartTime + 1000)
      .decayEndTime(decayStartTime + 1000)
      .decayStartTime(decayStartTime)
      .nonce(BigNumber.from(100))
      .swapper(await swapper.getAddress())
      .input({
        token: tokenIn.address,
        startAmount: parseEther('1'),
        endAmount: parseEther('1'),
      })
      .output({
        token: tokenOut.address,
        startAmount: parseEther('1'),
        endAmount: parseEther('0.9'),
        recipient: "0x0000000000000000000000000000000000000000",
      })
      .exclusiveFiller(
        '0x1111111111111111111111111111111111111111',
        BigNumber.from(0),
      )
      .build();

    const { domain, types, values } = order.permitData();
    const signature = await swapper._signTypedData(domain, types, values);

    expect(await validator.validate({ order, signature })).to.equal(
      OrderValidation.ExclusivityPeriod
    );
  });

  it("quotes an order with exclusivity override", async () => {
    const decayStartTime = Math.floor(new Date().getTime() / 1000) + 1000;
    const order = builder
      .deadline(decayStartTime + 1000)
      .decayEndTime(decayStartTime + 1000)
      .decayStartTime(decayStartTime)
      .nonce(BigNumber.from(100))
      .swapper(await swapper.getAddress())
      .input({
        token: tokenIn.address,
        startAmount: parseEther('1'),
        endAmount: parseEther('1'),
      })
      .output({
        token: tokenOut.address,
        startAmount: parseEther('1'),
        endAmount: parseEther('1'),
        recipient: "0x0000000000000000000000000000000000000000",
      })
      .exclusiveFiller(
        '0x1111111111111111111111111111111111111111',
        BigNumber.from(5),
      )
      .build();

    const { domain, types, values } = order.permitData();
    const signature = await swapper._signTypedData(domain, types, values);

    expect(await validator.validate({ order, signature })).to.equal(
      OrderValidation.OK
    );

    const quoterLib = new OrderQuoterLib(
      ethers.provider,
      chainId,
      quoter.address
    );
    const { validation, quote } = await quoterLib.quote({ order, signature });
    expect(validation).to.equal(OrderValidation.OK);
    expect(quote).does.not.equal(null);
    expect(quote!.outputs[0].amount.toString()).to.equal(parseEther("1").mul(10005).div(10000).toString());
  });

  it("validates an order failing external exclusivity", async () => {
    const validationInfo = encodeExclusiveFillerData(
      DIRECT_FILL,
      TWENTY_SECOND_CENTURY,
      1,
      additionalValidationContract
    );
    const deadline = Math.floor(new Date().getTime() / 1000) + 1000;
    const order = builder
      .deadline(deadline)
      .decayEndTime(deadline)
      .decayStartTime(deadline - 1000)
      .nonce(BigNumber.from(100))
      .swapper(await swapper.getAddress())
      .input({
        token: tokenIn.address,
        startAmount: parseEther('1'),
        endAmount: parseEther('1'),
      })
      .output({
        token: tokenOut.address,
        startAmount: parseEther('1'),
        endAmount: parseEther('0.9'),
        recipient: "0x0000000000000000000000000000000000000000",
      })
      .validation({
        additionalValidationContract: validationInfo.additionalValidationContract,
        additionalValidationData: validationInfo.additionalValidationData,
      })
      .build();

    const { domain, types, values } = order.permitData();
    const signature = await swapper._signTypedData(domain, types, values);

    expect(await validator.validate({ order, signature })).to.equal(
      OrderValidation.ExclusivityPeriod
    );
  });

  it("validates an order with insufficient funds", async () => {
    const deadline = Math.floor(new Date().getTime() / 1000) + 1000;
    const order = builder
      .deadline(deadline)
      .decayEndTime(deadline)
      .decayStartTime(deadline - 1000)
      .nonce(BigNumber.from(100))
      .swapper(await swapper.getAddress())
      .input({
        token: tokenIn.address,
        startAmount: parseEther('2'),
        endAmount: parseEther('2'),
      })
      .output({
        token: tokenOut.address,
        startAmount: parseEther('1'),
        endAmount: parseEther('0.9'),
        recipient: "0x0000000000000000000000000000000000000000",
      })
      .build();

    const { domain, types, values } = order.permitData();
    const signature = await swapper._signTypedData(domain, types, values);

    expect(await validator.validate({ order, signature })).to.equal(
      OrderValidation.InsufficientFunds
    );
  });

  it("validates an order with both input and output decay", async () => {
    const deadline = Math.floor(new Date().getTime() / 1000) + 1000;
    const order = builder
      .deadline(deadline)
      .decayEndTime(deadline)
      .decayStartTime(deadline - 1000)
      .nonce(BigNumber.from(100))
      .swapper(await swapper.getAddress())
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
      })
      .build();

    const { domain, types, values } = order.permitData();
    const signature = await swapper._signTypedData(domain, types, values);

    expect(await validator.validate({ order, signature })).to.equal(
      OrderValidation.InvalidOrderFields
    );
  });

  it("validates an order with incorrect input amount", async () => {
    const deadline = Math.floor(new Date().getTime() / 1000) + 1000;
    // input decays downward
    const order = builder
      .deadline(deadline)
      .decayEndTime(deadline)
      .decayStartTime(deadline - 1000)
      .nonce(BigNumber.from(100))
      .swapper(await swapper.getAddress())
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
      })
      .build();

    const { domain, types, values } = order.permitData();
    const signature = await swapper._signTypedData(domain, types, values);

    expect(await validator.validate({ order, signature })).to.equal(
      OrderValidation.InvalidOrderFields
    );
  });

  it("validates an order with incorrect output amount", async () => {
    const deadline = Math.floor(new Date().getTime() / 1000) + 1000;
    // output decays upward
    const info = builder
      .deadline(deadline)
      .decayEndTime(deadline)
      .decayStartTime(deadline - 1000)
      .nonce(BigNumber.from(100))
      .swapper(await swapper.getAddress())
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
      })
      .build().info;
    const output = Object.assign({}, info.outputs[0], {
      endAmount: BigNumber.from("20000000000000000000"),
    });

    const order = new DutchOrder(
      Object.assign(info, { outputs: [output] }),
      chainId,
      permit2.address
    );

    const { domain, types, values } = order.permitData();
    const signature = await swapper._signTypedData(domain, types, values);

    expect(await validator.validate({ order, signature })).to.equal(
      OrderValidation.InvalidOrderFields
    );
  });

  it("validates an expired order", async () => {
    const deadline = Math.floor(new Date().getTime() / 1000) + 1;
    const info = builder
      .deadline(deadline)
      .decayEndTime(deadline)
      .decayStartTime(deadline)
      .swapper(await swapper.getAddress())
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
      })
      .build().info;
    const order = new DutchOrder(
      Object.assign(info, {
        deadline: deadline - 100,
        decayEndTime: deadline - 100,
        decayStartTime: deadline - 101,
      }),
      chainId,
      permit2.address
    );

    const { domain, types, values } = order.permitData();
    const signature = await swapper._signTypedData(domain, types, values);

    expect(await validator.validate({ order, signature })).to.equal(
      OrderValidation.Expired
    );
  });

  it("validates an order before and after expiry", async () => {
    const deadline = Math.floor(new Date().getTime() / 1000) + 1000;
    const info = builder
      .deadline(deadline)
      .decayEndTime(deadline)
      .decayStartTime(deadline - 1000)
      .swapper(await swapper.getAddress())
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
      })
      .build().info;

    const order = new DutchOrder(info, chainId, permit2.address);

    const { domain, types, values } = order.permitData();
    const signature = await swapper._signTypedData(domain, types, values);

    expect(await validator.validate({ order, signature })).to.equal(
      OrderValidation.OK
    );
    
    const snapshot = await hre.network.provider.send("evm_snapshot");

    await hre.network.provider.send("evm_setNextBlockTimestamp", [deadline + 1]);
    await hre.network.provider.send("evm_mine"); 
    expect(await validator.validate({ order, signature })).to.equal(
      OrderValidation.Expired
    );

    await hre.network.provider.send("evm_revert", [snapshot]);
  });

  it("validates an invalid dutch decay", async () => {
    const deadline = Math.floor(new Date().getTime() / 1000) + 1;
    const info = builder
      .deadline(deadline)
      .decayEndTime(deadline)
      .decayStartTime(deadline)
      .swapper(await swapper.getAddress())
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
      })
      .build().info;
    const order = new DutchOrder(
      Object.assign(info, { decayEndTime: deadline - 100 }),
      chainId,
      permit2.address
    );

    const { domain, types, values } = order.permitData();
    const signature = await swapper._signTypedData(domain, types, values);

    expect(await validator.validate({ order, signature })).to.equal(
      OrderValidation.InvalidOrderFields
    );
  });

  it("validates a canceled order", async () => {
    const deadline = Math.floor(new Date().getTime() / 1000) + 1;
    const info = builder
      .deadline(deadline)
      .decayEndTime(deadline)
      .decayStartTime(deadline - 1000)
      .nonce(BigNumber.from(7))
      .swapper(await swapper.getAddress())
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
      })
      .build().info;
    const order = new DutchOrder(info, chainId, permit2.address);

    const { domain, types, values } = order.permitData();
    const signature = await swapper._signTypedData(domain, types, values);
    const { word, mask } = getCancelSingleParams(BigNumber.from(7));
    await permit2.connect(swapper).invalidateUnorderedNonces(word, mask);

    expect(await validator.validate({ order, signature })).to.equal(
      OrderValidation.NonceUsed
    );
  });
});
