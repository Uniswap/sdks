import hre, { ethers } from "hardhat";
import { expect } from "chai";
import { BigNumber, Signer, Event } from "ethers";

import { BlockchainTime } from "./utils/time";

import DutchLimitOrderReactorAbi from "../../abis/DutchLimitOrderReactor.json";
import Permit2Abi from "../../abis/Permit2.json";
import MockERC20Abi from "../../abis/MockERC20.json";
import DirectTakerFillContract from "../../abis/DirectTakerExecutor.json";

import {
  Permit2,
  DutchLimitOrderReactor,
  MockERC20,
} from "../../src/contracts";
import { DutchLimitOrderBuilder, EventWatcher, FillData } from "../../";

describe("EventWatcher", () => {
  let reactor: DutchLimitOrderReactor;
  let fillContract: string;
  let permit2: Permit2;
  let chainId: number;
  let maker: ethers.Wallet;
  let tokenIn: MockERC20;
  let tokenOut: MockERC20;
  let admin: Signer;
  let taker: Signer;
  let watcher: EventWatcher;

  before(async () => {
    [admin, taker] = await ethers.getSigners();
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
      100,
      ethers.constants.AddressZero
    )) as DutchLimitOrderReactor;

    chainId = hre.network.config.chainId || 1;

    maker = ethers.Wallet.createRandom().connect(ethers.provider);
    await admin.sendTransaction({
      to: await maker.getAddress(),
      value: BigNumber.from(10).pow(18),
    });

    const directTakerFillContractFactory = await ethers.getContractFactory(
      DirectTakerFillContract.abi,
      DirectTakerFillContract.bytecode
    );
    fillContract = (
      await directTakerFillContractFactory.deploy(await taker.getAddress())
    ).address;

    const tokenFactory = await ethers.getContractFactory(
      MockERC20Abi.abi,
      MockERC20Abi.bytecode
    );
    tokenIn = (await tokenFactory.deploy("TEST A", "ta", 18)) as MockERC20;

    tokenOut = (await tokenFactory.deploy("TEST B", "tb", 18)) as MockERC20;

    await tokenIn.mint(
      await maker.getAddress(),
      BigNumber.from(10).pow(18).mul(100)
    );
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
    watcher = new EventWatcher(ethers.provider, reactor.address);
  });

  it("Fetches fill events", async () => {
    const amount = BigNumber.from(10).pow(18);
    const deadline = await new BlockchainTime().secondsFromNow(1000);
    const order = new DutchLimitOrderBuilder(
      chainId,
      reactor.address,
      permit2.address
    )
      .deadline(deadline)
      .endTime(deadline)
      .startTime(deadline - 100)
      .offerer(await maker.getAddress())
      .nonce(BigNumber.from(100))
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

    const bn = await ethers.provider.getBlockNumber();

    const logs = await watcher.getFillEvents(0, bn);
    expect(logs.length).to.equal(1);
    expect(logs[0].orderHash).to.equal(order.hash());
    expect(logs[0].filler).to.equal(await taker.getAddress());
    expect(logs[0].offerer).to.equal(await maker.getAddress());
    expect(logs[0].nonce.toString()).to.equal("100");

    const fillInfo = await watcher.getFillInfo(0, bn);
    expect(fillInfo.length).to.equal(1);
    expect(fillInfo[0].blockNumber).to.greaterThan(0);
    expect(fillInfo[0].outputs.length).to.equal(1);
    expect(fillInfo[0].outputs[0].token).to.equal(tokenOut.address);
    expect(fillInfo[0].outputs[0].amount.toString()).to.equal(
      amount.toString()
    );
  });

  it("Handles callbacks on fill events", async () => {
    const amount = BigNumber.from(10).pow(18);
    const deadline = await new BlockchainTime().secondsFromNow(1000);
    const order = new DutchLimitOrderBuilder(
      chainId,
      reactor.address,
      permit2.address
    )
      .deadline(deadline)
      .endTime(deadline)
      .startTime(deadline - 100)
      .offerer(await maker.getAddress())
      .nonce(BigNumber.from(101))
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

    const makerAddress = await maker.getAddress();
    const takerAddress = await taker.getAddress();
    watcher.onFill((fill: FillData) => {
      expect(fill.filler).to.equal(takerAddress);
      expect(fill.offerer).to.equal(makerAddress);
    });
    const res = await reactor
      .connect(taker)
      .execute(
        { order: order.serialize(), sig: signature },
        fillContract,
        "0x"
      );
    await res.wait();
  });
});
