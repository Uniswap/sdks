import hre, { ethers } from "hardhat";
import { expect } from "chai";
import { Signer } from "ethers";

import RelayOrderReactorAbi from "../../abis/RelayOrderReactor.json";
import MockERC20Abi from "../../abis/MockERC20.json";

import {
  Permit2,
  RelayOrderReactor,
  MockERC20,
} from "../../src/contracts";
import {
  RelayOrderQuoter as OrderQuoterLib,
  OrderValidation,
  getCancelSingleParams,
  RelayOrderBuilder,
  RelayOrderValidator,
  RelayOrder,
} from "../../src";
import { deployAndReturnPermit2 } from "./utils/permit2";
import { deployMulticall3 } from "./utils/multicall";

const { BigNumber } = ethers;
const parseEther = ethers.utils.parseEther;

describe("RelayOrderValidator", () => {
  let reactor: RelayOrderReactor;
  let permit2: Permit2;
  let chainId: number;
  let builder: RelayOrderBuilder;
  let validator: RelayOrderValidator;
  let tokenIn: MockERC20;
  let admin: Signer;
  let filler: Signer;
  let swapper: ethers.Wallet;
  let inputRecipient: string;
  let blockTimestamp: number;

  beforeEach(async () => {
    [admin, filler] = await ethers.getSigners();

    inputRecipient = await ethers.Wallet.createRandom().connect(ethers.provider).getAddress();

    chainId = hre.network.config.chainId || 1;

    await deployMulticall3();

    permit2 = await deployAndReturnPermit2(admin);

    const reactorFactory = await ethers.getContractFactory(
      RelayOrderReactorAbi.abi,
      RelayOrderReactorAbi.bytecode
    );
    reactor = (await reactorFactory.deploy(
      ethers.constants.AddressZero
    )) as RelayOrderReactor;

    builder = new RelayOrderBuilder(
      chainId,
      reactor.address,
      permit2.address
    );

    swapper = ethers.Wallet.createRandom().connect(ethers.provider);
    await admin.sendTransaction({
      to: await swapper.getAddress(),
      value: parseEther('1'),
    });
    validator = new RelayOrderValidator(ethers.provider, chainId, reactor.address);

    const tokenFactory = await ethers.getContractFactory(
      MockERC20Abi.abi,
      MockERC20Abi.bytecode
    );
    tokenIn = (await tokenFactory.deploy("TEST A", "ta", 18)) as MockERC20;

    await tokenIn.mint(await swapper.getAddress(), parseEther('1'));
    await tokenIn
      .connect(swapper)
      .approve(permit2.address, ethers.constants.MaxUint256);
    
    blockTimestamp = (await ethers.provider.getBlock("latest")).timestamp;
  });

  // TODO @ericzhong @allanwu - fix this test
  it.skip("quotes a valid order", async () => {
    const deadline = blockTimestamp + 1000
    const order = builder
      .deadline(deadline)
      .swapper(await swapper.getAddress())
      .nonce(BigNumber.from(98))
      .input({
        token: tokenIn.address,
        amount: BigNumber.from("1000000"),
        recipient: inputRecipient
      })
      .fee({
        token: tokenIn.address,
        startAmount: BigNumber.from("1000000"),
        endAmount: BigNumber.from("1100000"),
        startTime: deadline - 1000,
        endTime: deadline,
      })
      .universalRouterCalldata('0x')
      .build();

    const { domain, types, values } = order.permitData();
    const signature = await swapper._signTypedData(domain, types, values);

    const quoterLib = new OrderQuoterLib(
      ethers.provider,
      chainId,
      reactor.address
    );
    const { validation, quote } = await quoterLib.quote({ order, signature });
    expect(validation).to.equal(OrderValidation.OK);
    expect(quote).to.not.be.undefined;

    expect(quote!.fee.amount.toString()).to.equal("1000000");
  });

  it("validates a valid order", async () => {
    const deadline = blockTimestamp + 1000
    const order = builder
      .deadline(deadline)
      .swapper(await swapper.getAddress())
      .nonce(BigNumber.from(98))
      .input({
        token: tokenIn.address,
        amount: BigNumber.from("1000000"),
        recipient: inputRecipient
      })
      .fee({
        token: tokenIn.address,
        startAmount: BigNumber.from("1000000"),
        endAmount: BigNumber.from("1100000"),
        startTime: deadline - 1000,
        endTime: deadline,
      })
      .universalRouterCalldata('0x')
      .build();

    const { domain, types, values } = order.permitData();
    const signature = await swapper._signTypedData(domain, types, values);

    expect(await validator.validate({ order, signature })).to.equal(
      OrderValidation.OK
    );
  });

  it("validates a filled order", async () => {
    const deadline = blockTimestamp + 1000
    const order = builder
      .deadline(deadline)
      .swapper(await swapper.getAddress())
      .nonce(BigNumber.from(98))
      .input({
        token: tokenIn.address,
        amount: BigNumber.from("1000000"),
        recipient: inputRecipient
      })
      .fee({
        token: tokenIn.address,
        startAmount: BigNumber.from("1000000"),
        endAmount: BigNumber.from("1100000"),
        startTime: deadline - 1000,
        endTime: deadline,
      })
      .universalRouterCalldata('0x')
      .build();

    const { domain, types, values } = order.permitData();
    const signature = await swapper._signTypedData(domain, types, values);

    const res = await reactor
      .connect(filler)
      ["execute((bytes,bytes))"](
        { order: order.serialize(), sig: signature },
      );
    await res.wait();

    expect(await validator.validate({ order, signature })).to.equal(
      OrderValidation.NonceUsed
    );
  });

  it("validates an order with insufficient funds", async () => {
    const deadline = blockTimestamp + 1000
    const order = builder
    .deadline(deadline)
    .swapper(await swapper.getAddress())
    .nonce(BigNumber.from(98))
    .input({
      token: tokenIn.address,
      amount: parseEther('2'),
      recipient: inputRecipient
    })
    .fee({
      token: tokenIn.address,
      startAmount: BigNumber.from("1000000"),
      endAmount: BigNumber.from("1100000"),
      startTime: deadline - 1000,
      endTime: deadline,
    })
    .universalRouterCalldata('0x')
    .build();

    const { domain, types, values } = order.permitData();
    const signature = await swapper._signTypedData(domain, types, values);

    expect(await validator.validate({ order, signature })).to.equal(
      OrderValidation.InsufficientFunds
    );
  });

  it("validates an order with incorrect fee amounts", async () => {
    const deadline = blockTimestamp + 1000
    const info = builder
      .deadline(deadline)
      .swapper(await swapper.getAddress())
      .nonce(BigNumber.from(98))
      .input({
        token: tokenIn.address,
        amount: BigNumber.from("1000000"),
        recipient: inputRecipient
      })
      .fee({
        token: tokenIn.address,
        startAmount: BigNumber.from("1000000"),
        endAmount: BigNumber.from("1100000"),
        startTime: deadline - 1000,
        endTime: deadline,
      })
      .universalRouterCalldata('0x')
      .build().info;
      
    // fee decays downwards
    const fee = {
      token: tokenIn.address,
      startAmount: BigNumber.from("1000000"),
      endAmount: BigNumber.from("900000"),
      startTime: deadline - 1000,
      endTime: deadline,
    };

    const order = new RelayOrder(
      Object.assign(info, { fee }),
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
      .swapper(await swapper.getAddress())
      .nonce(BigNumber.from(98))
      .input({
        token: tokenIn.address,
        amount: BigNumber.from("1000000"),
        recipient: inputRecipient
      })
      .fee({
        token: tokenIn.address,
        startAmount: BigNumber.from("1000000"),
        endAmount: BigNumber.from("1100000"),
        startTime: deadline - 1000,
        endTime: deadline,
      })
      .universalRouterCalldata('0x')
      .build().info;

    const order = new RelayOrder(
      Object.assign(info, {
        deadline: deadline - 100,
        fee: {
          ...info.fee,
          startTime: deadline - 100,
          endTime: deadline - 100,
        }
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
    const deadline = blockTimestamp + 1000
    const order = builder
      .deadline(deadline)
      .swapper(await swapper.getAddress())
      .nonce(BigNumber.from(98))
      .input({
        token: tokenIn.address,
        amount: BigNumber.from("1000000"),
        recipient: inputRecipient
      })
      .fee({
        token: tokenIn.address,
        startAmount: BigNumber.from("1000000"),
        endAmount: BigNumber.from("1100000"),
        startTime: deadline - 1000,
        endTime: deadline,
      })
      .universalRouterCalldata('0x')
      .build();

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

  it("validates a canceled order", async () => {
    const deadline = blockTimestamp + 1000
    const order = builder
      .deadline(deadline)
      .swapper(await swapper.getAddress())
      .nonce(BigNumber.from(7))
      .input({
        token: tokenIn.address,
        amount: BigNumber.from("1000000"),
        recipient: inputRecipient
      })
      .fee({
        token: tokenIn.address,
        startAmount: BigNumber.from("1000000"),
        endAmount: BigNumber.from("1100000"),
        startTime: deadline - 1000,
        endTime: deadline,
      })
      .universalRouterCalldata('0x')
      .build();

    const { domain, types, values } = order.permitData();
    const signature = await swapper._signTypedData(domain, types, values);
    const { word, mask } = getCancelSingleParams(BigNumber.from(7));
    await permit2.connect(swapper).invalidateUnorderedNonces(word, mask);

    expect(await validator.validate({ order, signature })).to.equal(
      OrderValidation.NonceUsed
    );
  });
});
