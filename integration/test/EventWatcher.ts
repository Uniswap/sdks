import hre, { ethers } from "hardhat";
import { expect } from "chai";
import { BigNumber, Signer, Event } from "ethers";

import { BlockchainTime } from "./utils/time";

import DutchLimitOrderReactorAbi from "../../abis/DutchLimitOrderReactor.json";
import Permit2Abi from "../../abis/Permit2.json";
import MockERC20Abi from "../../abis/MockERC20.json";

import {
  Permit2,
  DutchLimitOrderReactor,
  MockERC20,
} from "../../src/contracts";
import { DutchOrderBuilder, EventWatcher, FillData } from "../../";

describe("EventWatcher", () => {
  let reactor: DutchLimitOrderReactor;
  let permit2: Permit2;
  let chainId: number;
  let swapper: ethers.Wallet;
  let tokenIn: MockERC20;
  let tokenOut: MockERC20;
  let admin: Signer;
  let filler: Signer;
  let watcher: EventWatcher;

  const DIRECT_FILL = '0x0000000000000000000000000000000000000001';

  before(async () => {
    [admin, filler] = await ethers.getSigners();
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
      ethers.constants.AddressZero
    )) as DutchLimitOrderReactor;

    chainId = hre.network.config.chainId || 1;

    swapper = ethers.Wallet.createRandom().connect(ethers.provider);
    await admin.sendTransaction({
      to: await swapper.getAddress(),
      value: BigNumber.from(10).pow(18),
    });

    const tokenFactory = await ethers.getContractFactory(
      MockERC20Abi.abi,
      MockERC20Abi.bytecode
    );
    tokenIn = (await tokenFactory.deploy("TEST A", "ta", 18)) as MockERC20;

    tokenOut = (await tokenFactory.deploy("TEST B", "tb", 18)) as MockERC20;

    await tokenIn.mint(
      await swapper.getAddress(),
      BigNumber.from(10).pow(18).mul(100)
    );
    await tokenIn
      .connect(swapper)
      .approve(permit2.address, ethers.constants.MaxUint256);

    await tokenOut.mint(
      await filler.getAddress(),
      BigNumber.from(10).pow(18).mul(100)
    );
    await tokenOut
      .connect(filler)
      .approve(permit2.address, ethers.constants.MaxUint256);
    watcher = new EventWatcher(ethers.provider, reactor.address);

    await permit2.connect(filler).approve(tokenOut.address, reactor.address, BigNumber.from(2).pow(160).sub(1), BigNumber.from(2).pow(48).sub(1));
  });

  it("Fetches fill events", async () => {
    const amount = BigNumber.from(10).pow(18);
    const deadline = await new BlockchainTime().secondsFromNow(1000);
    const order = new DutchOrderBuilder(
      chainId,
      reactor.address,
      permit2.address
    )
      .deadline(deadline)
      .endTime(deadline)
      .startTime(deadline - 100)
      .swapper(await swapper.getAddress())
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
        recipient: await swapper.getAddress(),
      })
      .build();

    const { domain, types, values } = order.permitData();
    const signature = await swapper._signTypedData(domain, types, values);

    const res = await reactor
      .connect(filler)
      .execute(
        { order: order.serialize(), sig: signature },
        DIRECT_FILL,
        "0x"
      );
    await res.wait();

    const bn = await ethers.provider.getBlockNumber();

    const logs = await watcher.getFillEvents(0, bn);
    expect(logs.length).to.equal(1);
    expect(logs[0].orderHash).to.equal(order.hash());
    expect(logs[0].filler).to.equal(await filler.getAddress());
    expect(logs[0].swapper).to.equal(await swapper.getAddress());
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
    const order = new DutchOrderBuilder(
      chainId,
      reactor.address,
      permit2.address
    )
      .deadline(deadline)
      .endTime(deadline)
      .startTime(deadline - 100)
      .swapper(await swapper.getAddress())
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
        recipient: await swapper.getAddress(),
      })
      .build();

    const { domain, types, values } = order.permitData();
    const signature = await swapper._signTypedData(domain, types, values);

    const swapperAddress = await swapper.getAddress();
    const fillerAddress = await filler.getAddress();
    watcher.onFill((fill: FillData) => {
      expect(fill.filler).to.equal(fillerAddress);
      expect(fill.swapper).to.equal(swapperAddress);
    });
    const res = await reactor
      .connect(filler)
      .execute(
        { order: order.serialize(), sig: signature },
        DIRECT_FILL,
        "0x"
      );
    await res.wait();
  });
});
