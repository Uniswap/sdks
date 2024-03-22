import hre, { ethers } from "hardhat";
import { expect } from "chai";
import { BigNumber, Signer, Wallet } from "ethers";

import { BlockchainTime } from "./utils/time";

import V2DutchOrderReactorAbi from "../../abis/V2DutchOrderReactor.json";
import Permit2Abi from "../../abis/Permit2.json";
import MockERC20Abi from "../../abis/MockERC20.json";

import { Permit2, V2DutchOrderReactor, MockERC20 } from "../../src/contracts";
import { V2DutchOrderBuilder, CosignerData } from "../..";

describe("DutchV2Order", () => {
  const FEE_RECIPIENT = "0x1111111111111111111111111111111111111111";
  const AMOUNT = BigNumber.from(10).pow(18);
  let NONCE = BigNumber.from(100);

  let reactor: V2DutchOrderReactor;
  let permit2: Permit2;
  let chainId: number;
  let swapper: Wallet;
  let cosigner: Wallet;
  let tokenIn: MockERC20;
  let tokenOut: MockERC20;
  let admin: Signer;
  let filler: Signer;
  let openFiller: Signer;

  let swapperAddress: string;
  let cosignerAddress: string;
  let fillerAddress: string;
  let openFillerAddress: string;

  before(async () => {
    [admin, filler, openFiller] = await ethers.getSigners();
    const permit2Factory = await ethers.getContractFactory(
      Permit2Abi.abi,
      Permit2Abi.bytecode
    );
    permit2 = (await permit2Factory.deploy()) as Permit2;

    const reactorFactory = await ethers.getContractFactory(
      V2DutchOrderReactorAbi.abi,
      V2DutchOrderReactorAbi.bytecode
    );
    reactor = (await reactorFactory.deploy(
      permit2.address,
      ethers.constants.AddressZero
    )) as V2DutchOrderReactor;

    chainId = hre.network.config.chainId || 1;

    swapper = ethers.Wallet.createRandom().connect(ethers.provider);
    cosigner = ethers.Wallet.createRandom().connect(ethers.provider);
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
    await tokenOut.mint(
      await openFiller.getAddress(),
      BigNumber.from(10).pow(18).mul(100)
    );
    await tokenOut
      .connect(filler)
      .approve(reactor.address, ethers.constants.MaxUint256);
    await tokenOut
      .connect(openFiller)
      .approve(reactor.address, ethers.constants.MaxUint256);

    swapperAddress = await swapper.getAddress();
    cosignerAddress = await cosigner.getAddress();
    fillerAddress = await filler.getAddress();
    openFillerAddress = await openFiller.getAddress();
  });

  afterEach(() => {
    NONCE = NONCE.add(1);
  });

  describe("Partial Order", () => {
    it("correctly builds a partial order", async () => {
      const deadline = await new BlockchainTime().secondsFromNow(1000);
      const preBuildOrder = new V2DutchOrderBuilder(
        chainId,
        reactor.address,
        permit2.address
      )
        .cosigner(cosignerAddress)
        .deadline(deadline)
        .swapper(swapperAddress)
        .nonce(NONCE)
        .input({
          token: tokenIn.address,
          startAmount: AMOUNT,
          endAmount: AMOUNT,
        })
        .output({
          token: tokenOut.address,
          startAmount: AMOUNT,
          endAmount: BigNumber.from(10).pow(17).mul(9),
          recipient: swapperAddress,
        });

      let order = preBuildOrder.buildPartial();

      expect(order.info.deadline).to.eq(deadline);
      expect(order.info.swapper).to.eq(swapperAddress);
      expect(order.info.cosigner).to.eq(cosignerAddress);
      expect(order.info.nonce.toNumber()).to.eq(100);

      expect(order.info.input.token).to.eq(tokenIn.address);
      expect(order.info.input.startAmount).to.eq(AMOUNT);
      expect(order.info.input.endAmount).to.eq(AMOUNT);

      const builtOutput = order.info.outputs[0];

      expect(builtOutput.token).to.eq(tokenOut.address);
      expect(builtOutput.startAmount).to.eq(AMOUNT);
      expect(builtOutput.endAmount.eq(BigNumber.from(10).pow(17).mul(9))).to.be
        .true;
      expect(builtOutput.recipient).to.eq(swapperAddress);

      order = preBuildOrder
        .nonFeeRecipient(ethers.constants.AddressZero, FEE_RECIPIENT)
        .buildPartial();
      expect(order.info.outputs[0].recipient).to.eq(
        ethers.constants.AddressZero
      );
    });

    it("nonFeeRecipient updates recipient for non fee outputs", async () => {
      const AMOUNT = BigNumber.from(10).pow(18);
      const deadline = await new BlockchainTime().secondsFromNow(1000);
      const swapperAddress = await swapper.getAddress();
      const cosignerAddress = await cosigner.getAddress();
      const preBuildOrder = new V2DutchOrderBuilder(
        chainId,
        reactor.address,
        permit2.address
      )
        .cosigner(cosignerAddress)
        .deadline(deadline)
        .swapper(swapperAddress)
        .nonce(NONCE)
        .input({
          token: tokenIn.address,
          startAmount: AMOUNT,
          endAmount: AMOUNT,
        })
        .output({
          token: tokenOut.address,
          startAmount: AMOUNT,
          endAmount: BigNumber.from(10).pow(17).mul(9),
          recipient: swapperAddress,
        })
        .output({
          token: tokenOut.address,
          startAmount: AMOUNT,
          endAmount: BigNumber.from(10).pow(17).mul(9),
          recipient: FEE_RECIPIENT,
        });

      let order = preBuildOrder.buildPartial();
      expect(order.info.outputs[0].recipient).to.eq(swapperAddress);
      expect(order.info.outputs[1].recipient).to.eq(FEE_RECIPIENT);

      order = preBuildOrder
        .nonFeeRecipient(ethers.constants.AddressZero, FEE_RECIPIENT)
        .buildPartial();

      expect(order.info.outputs[0].recipient).to.eq(
        ethers.constants.AddressZero
      );
      expect(order.info.outputs[1].recipient).to.eq(FEE_RECIPIENT);
    });

    it("nonFeeRecipient updates recipient for all outputs if no feeRecipient given", async () => {
      const AMOUNT = BigNumber.from(10).pow(18);
      const deadline = await new BlockchainTime().secondsFromNow(1000);
      const swapperAddress = await swapper.getAddress();
      const cosignerAddress = await cosigner.getAddress();
      const preBuildOrder = new V2DutchOrderBuilder(
        chainId,
        reactor.address,
        permit2.address
      )
        .cosigner(cosignerAddress)
        .deadline(deadline)
        .swapper(swapperAddress)
        .nonce(NONCE)
        .input({
          token: tokenIn.address,
          startAmount: AMOUNT,
          endAmount: AMOUNT,
        })
        .output({
          token: tokenOut.address,
          startAmount: AMOUNT,
          endAmount: BigNumber.from(10).pow(17).mul(9),
          recipient: swapperAddress,
        })
        .output({
          token: tokenOut.address,
          startAmount: AMOUNT,
          endAmount: BigNumber.from(10).pow(17).mul(9),
          recipient: FEE_RECIPIENT,
        });

      let order = preBuildOrder.buildPartial();
      expect(order.info.outputs[0].recipient).to.eq(swapperAddress);
      expect(order.info.outputs[1].recipient).to.eq(FEE_RECIPIENT);

      order = preBuildOrder
        .nonFeeRecipient(ethers.constants.AddressZero)
        .buildPartial();

      expect(order.info.outputs[0].recipient).to.eq(
        ethers.constants.AddressZero
      );
      expect(order.info.outputs[1].recipient).to.eq(
        ethers.constants.AddressZero
      );
    });

    it("nonFeeRecipient fails if same as newRecipient", async () => {
      const AMOUNT = BigNumber.from(10).pow(18);
      const deadline = await new BlockchainTime().secondsFromNow(1000);
      const swapperAddress = await swapper.getAddress();
      const cosignerAddress = await cosigner.getAddress();
      const preBuildOrder = new V2DutchOrderBuilder(
        chainId,
        reactor.address,
        permit2.address
      )
        .cosigner(cosignerAddress)
        .deadline(deadline)
        .swapper(swapperAddress)
        .nonce(NONCE)
        .input({
          token: tokenIn.address,
          startAmount: AMOUNT,
          endAmount: AMOUNT,
        })
        .output({
          token: tokenOut.address,
          startAmount: AMOUNT,
          endAmount: BigNumber.from(10).pow(17).mul(9),
          recipient: swapperAddress,
        })
        .output({
          token: tokenOut.address,
          startAmount: AMOUNT,
          endAmount: BigNumber.from(10).pow(17).mul(9),
          recipient: FEE_RECIPIENT,
        });

      let order = preBuildOrder.buildPartial();
      expect(order.info.outputs[0].recipient).to.eq(swapperAddress);
      expect(order.info.outputs[1].recipient).to.eq(FEE_RECIPIENT);

      expect(() =>
        preBuildOrder
          .nonFeeRecipient(FEE_RECIPIENT, FEE_RECIPIENT)
          .buildPartial()
      ).to.throw("newRecipient must be different from feeRecipient");
    });
  });

  describe("Cosigned Order", () => {
    it("correctly builds a cosigned order", async () => {
      const deadline = await new BlockchainTime().secondsFromNow(1000);
      const swapperAddress = await swapper.getAddress();
      const fillerAddress = await filler.getAddress();
      const cosignerAddress = await cosigner.getAddress();
      const cosignerData = getCosignerData(deadline);
      const preBuildOrder = new V2DutchOrderBuilder(
        chainId,
        reactor.address,
        permit2.address
      )
        .cosigner(cosignerAddress)
        .deadline(deadline)
        .swapper(swapperAddress)
        .nonce(NONCE)
        .input({
          token: tokenIn.address,
          startAmount: AMOUNT,
          endAmount: AMOUNT,
        })
        .output({
          token: tokenOut.address,
          startAmount: AMOUNT,
          endAmount: BigNumber.from(10).pow(17).mul(9),
          recipient: swapperAddress,
        });

      const partialOrder = preBuildOrder.buildPartial();
      //const { domain, types, values } = order.permitData();
      //const userSignature = await swapper._signTypedData(domain, types, values);
      const cosignature = await cosigner.signMessage(
        partialOrder.cosignatureHash(cosignerData)
      );

      const order = preBuildOrder
        .cosignature(cosignature)
        .cosignerData(cosignerData)
        .build();

      expect(order.info.deadline).to.eq(deadline);
      expect(order.info.swapper).to.eq(swapperAddress);
      expect(order.info.cosigner).to.eq(cosignerAddress);
      expect(order.info.cosignature).to.eq(cosignature);
      expect(order.info.nonce.toNumber()).to.eq(NONCE);

      expect(order.info.input.token).to.eq(tokenIn.address);
      expect(order.info.input.startAmount).to.eq(AMOUNT);
      expect(order.info.input.endAmount).to.eq(AMOUNT);

      const builtOutput = order.info.outputs[0];

      expect(builtOutput.token).to.eq(tokenOut.address);
      expect(builtOutput.startAmount).to.eq(AMOUNT);
      expect(builtOutput.endAmount.eq(BigNumber.from(10).pow(17).mul(9))).to.be
        .true;
      expect(builtOutput.recipient).to.eq(swapperAddress);
    });

    it("reverts if cosignature is invalid", async () => {
      const deadline = await new BlockchainTime().secondsFromNow(1000);
      const order = new V2DutchOrderBuilder(
        chainId,
        reactor.address,
        permit2.address
      )
        .cosigner(cosigner.address)
        .deadline(deadline)
        .swapper(swapper.address)
        .nonce(NONCE)
        .input({
          token: tokenIn.address,
          startAmount: AMOUNT,
          endAmount: AMOUNT,
        })
        .output({
          token: tokenOut.address,
          startAmount: AMOUNT,
          endAmount: AMOUNT,
          recipient: swapper.address,
        })
        .buildPartial();

      const { domain, types, values } = order.permitData();
      const signature = await swapper._signTypedData(domain, types, values);

      const cosignerData = getCosignerData(deadline, {});
      const cosignerHash = order.cosignatureHash(cosignerData);
      let cosignature = ethers.utils.joinSignature(
        cosigner._signingKey().signDigest(cosignerHash)
      );
      const fullOrder = V2DutchOrderBuilder.fromOrder(order)
        .cosignerData({ ...cosignerData, inputOverride: AMOUNT.sub(1) })
        .cosignature(cosignature)
        .build();

      await expect(
        reactor
          .connect(openFiller)
          .execute({ order: fullOrder.serialize(), sig: signature })
      ).to.be.revertedWithCustomError(reactor, "InvalidCosignature");
    });

    it("executes a serialized order with no decay", async () => {
      const deadline = await new BlockchainTime().secondsFromNow(1000);
      const order = new V2DutchOrderBuilder(
        chainId,
        reactor.address,
        permit2.address
      )
        .cosigner(cosigner.address)
        .deadline(deadline)
        .swapper(swapper.address)
        .nonce(NONCE)
        .input({
          token: tokenIn.address,
          startAmount: AMOUNT,
          endAmount: AMOUNT,
        })
        .output({
          token: tokenOut.address,
          startAmount: AMOUNT,
          endAmount: AMOUNT,
          recipient: swapper.address,
        })
        .buildPartial();

      const { domain, types, values } = order.permitData();
      const signature = await swapper._signTypedData(domain, types, values);

      const cosignerData = getCosignerData(deadline, {});
      const cosignerHash = order.cosignatureHash(cosignerData);
      const cosignature = ethers.utils.joinSignature(
        cosigner._signingKey().signDigest(cosignerHash)
      );
      const fullOrder = V2DutchOrderBuilder.fromOrder(order)
        .cosignerData(cosignerData)
        .cosignature(cosignature)
        .build();

      const swapperTokenInBalanceBefore = await tokenIn.balanceOf(
        swapperAddress
      );
      const fillerTokenInBalanceBefore = await tokenIn.balanceOf(fillerAddress);
      const swapperTokenOutBalanceBefore = await tokenOut.balanceOf(
        swapperAddress
      );
      const fillerTokenOutBalanceBefore = await tokenOut.balanceOf(
        fillerAddress
      );

      const res = await reactor
        .connect(filler)
        .execute({ order: fullOrder.serialize(), sig: signature });
      const receipt = await res.wait();
      expect(receipt.status).to.equal(1);
      expect((await tokenIn.balanceOf(swapperAddress)).toString()).to.equal(
        swapperTokenInBalanceBefore.sub(AMOUNT).toString()
      );
      expect((await tokenIn.balanceOf(fillerAddress)).toString()).to.equal(
        fillerTokenInBalanceBefore.add(AMOUNT).toString()
      );

      const amountOut = order.info.outputs[0].startAmount
        .add(order.info.outputs[0].endAmount)
        .div(2);

      // some variance in block timestamp so we need to use a threshold
      expectThreshold(
        await tokenOut.balanceOf(swapperAddress),
        swapperTokenOutBalanceBefore.add(amountOut),
        BigNumber.from(10).pow(15)
      );
      expectThreshold(
        await tokenOut.balanceOf(fillerAddress),
        fillerTokenOutBalanceBefore.sub(amountOut),
        BigNumber.from(10).pow(15)
      );
    });

    it("executes a serialized order with no decay, override of double original output amount", async () => {
      const deadline = await new BlockchainTime().secondsFromNow(1000);
      const order = new V2DutchOrderBuilder(
        chainId,
        reactor.address,
        permit2.address
      )
        .cosigner(cosigner.address)
        .deadline(deadline)
        .swapper(swapper.address)
        .nonce(NONCE)
        .input({
          token: tokenIn.address,
          startAmount: AMOUNT,
          endAmount: AMOUNT,
        })
        .output({
          token: tokenOut.address,
          startAmount: AMOUNT,
          endAmount: AMOUNT,
          recipient: swapper.address,
        })
        .buildPartial();

      const { domain, types, values } = order.permitData();
      const signature = await swapper._signTypedData(domain, types, values);

      const cosignerData = getCosignerData(deadline, {
        outputOverrides: [AMOUNT.mul(2)],
      });
      const cosignerHash = order.cosignatureHash(cosignerData);
      const cosignature = ethers.utils.joinSignature(
        cosigner._signingKey().signDigest(cosignerHash)
      );
      const fullOrder = V2DutchOrderBuilder.fromOrder(order)
        .cosignerData(cosignerData)
        .cosignature(cosignature)
        .build();

      const swapperTokenInBalanceBefore = await tokenIn.balanceOf(
        swapperAddress
      );
      const fillerTokenInBalanceBefore = await tokenIn.balanceOf(fillerAddress);
      const swapperTokenOutBalanceBefore = await tokenOut.balanceOf(
        swapperAddress
      );
      const fillerTokenOutBalanceBefore = await tokenOut.balanceOf(
        fillerAddress
      );

      const res = await reactor
        .connect(filler)
        .execute({ order: fullOrder.serialize(), sig: signature });
      const receipt = await res.wait();
      expect(receipt.status).to.equal(1);
      expect((await tokenIn.balanceOf(swapperAddress)).toString()).to.equal(
        swapperTokenInBalanceBefore.sub(AMOUNT).toString()
      );
      expect((await tokenIn.balanceOf(fillerAddress)).toString()).to.equal(
        fillerTokenInBalanceBefore.add(AMOUNT).toString()
      );

      expect((await tokenOut.balanceOf(swapperAddress)).toString()).to.equal(
        swapperTokenOutBalanceBefore.add(AMOUNT.mul(2)).toString()
      );
      expect((await tokenOut.balanceOf(fillerAddress)).toString()).to.equal(
        fillerTokenOutBalanceBefore.sub(AMOUNT.mul(2)).toString()
      );
    });

    it("executes a serialized order with no decay, override of half original input amount", async () => {
      const deadline = await new BlockchainTime().secondsFromNow(1000);
      const order = new V2DutchOrderBuilder(
        chainId,
        reactor.address,
        permit2.address
      )
        .cosigner(cosigner.address)
        .deadline(deadline)
        .swapper(swapper.address)
        .nonce(NONCE)
        .input({
          token: tokenIn.address,
          startAmount: AMOUNT,
          endAmount: AMOUNT,
        })
        .output({
          token: tokenOut.address,
          startAmount: AMOUNT,
          endAmount: AMOUNT,
          recipient: swapper.address,
        })
        .buildPartial();

      const { domain, types, values } = order.permitData();
      const signature = await swapper._signTypedData(domain, types, values);

      const cosignerData = getCosignerData(deadline, {
        inputOverride: AMOUNT.div(2),
      });
      const cosignerHash = order.cosignatureHash(cosignerData);
      const cosignature = ethers.utils.joinSignature(
        cosigner._signingKey().signDigest(cosignerHash)
      );
      const fullOrder = V2DutchOrderBuilder.fromOrder(order)
        .cosignerData(cosignerData)
        .cosignature(cosignature)
        .build();

      const swapperTokenInBalanceBefore = await tokenIn.balanceOf(
        swapperAddress
      );
      const fillerTokenInBalanceBefore = await tokenIn.balanceOf(fillerAddress);
      const swapperTokenOutBalanceBefore = await tokenOut.balanceOf(
        swapperAddress
      );
      const fillerTokenOutBalanceBefore = await tokenOut.balanceOf(
        fillerAddress
      );

      const res = await reactor
        .connect(filler)
        .execute({ order: fullOrder.serialize(), sig: signature });
      const receipt = await res.wait();
      expect(receipt.status).to.equal(1);
      expect((await tokenIn.balanceOf(swapperAddress)).toString()).to.equal(
        swapperTokenInBalanceBefore.sub(AMOUNT.div(2)).toString()
      );
      expect((await tokenIn.balanceOf(fillerAddress)).toString()).to.equal(
        fillerTokenInBalanceBefore.add(AMOUNT.div(2)).toString()
      );
      expect((await tokenOut.balanceOf(swapperAddress)).toString()).to.equal(
        swapperTokenOutBalanceBefore.add(AMOUNT).toString()
      );
      expect((await tokenOut.balanceOf(fillerAddress)).toString()).to.equal(
        fillerTokenOutBalanceBefore.sub(AMOUNT).toString()
      );
    });

    it("executes a serialized order with decay", async () => {
      const deadline = await new BlockchainTime().secondsFromNow(1000);
      const order = new V2DutchOrderBuilder(
        chainId,
        reactor.address,
        permit2.address
      )
        .cosigner(cosigner.address)
        .deadline(deadline)
        .decayStartTime(deadline - 2000)
        .swapper(swapper.address)
        .nonce(NONCE)
        .input({
          token: tokenIn.address,
          startAmount: AMOUNT,
          endAmount: AMOUNT,
        })
        .output({
          token: tokenOut.address,
          startAmount: AMOUNT,
          endAmount: AMOUNT,
          recipient: swapper.address,
        })
        .buildPartial();

      const { domain, types, values } = order.permitData();
      const signature = await swapper._signTypedData(domain, types, values);

      const cosignerData = getCosignerData(deadline, {});
      const cosignerHash = order.cosignatureHash(cosignerData);
      const cosignature = ethers.utils.joinSignature(
        cosigner._signingKey().signDigest(cosignerHash)
      );
      const fullOrder = V2DutchOrderBuilder.fromOrder(order)
        .cosignerData(cosignerData)
        .cosignature(cosignature)
        .build();

      const swapperTokenInBalanceBefore = await tokenIn.balanceOf(
        await swapper.getAddress()
      );
      const fillerTokenInBalanceBefore = await tokenIn.balanceOf(
        await filler.getAddress()
      );
      const swapperTokenOutBalanceBefore = await tokenOut.balanceOf(
        await swapper.getAddress()
      );
      const fillerTokenOutBalanceBefore = await tokenOut.balanceOf(
        await filler.getAddress()
      );

      const res = await reactor
        .connect(filler)
        .execute({ order: fullOrder.serialize(), sig: signature });
      const receipt = await res.wait();
      expect(receipt.status).to.equal(1);
      expect(
        (await tokenIn.balanceOf(await swapper.getAddress())).toString()
      ).to.equal(swapperTokenInBalanceBefore.sub(AMOUNT).toString());
      expect(
        (await tokenIn.balanceOf(await filler.getAddress())).toString()
      ).to.equal(fillerTokenInBalanceBefore.add(AMOUNT).toString());
      expect(
        (await tokenOut.balanceOf(await swapper.getAddress())).toString()
      ).to.equal(swapperTokenOutBalanceBefore.add(AMOUNT).toString());
      expect(
        (await tokenOut.balanceOf(await filler.getAddress())).toString()
      ).to.equal(fillerTokenOutBalanceBefore.sub(AMOUNT).toString());
    });

    it("open filler executes an open order past exclusivity", async () => {
      const deadline = await new BlockchainTime().secondsFromNow(1000);
      const order = new V2DutchOrderBuilder(
        chainId,
        reactor.address,
        permit2.address
      )
        .cosigner(cosigner.address)
        .deadline(deadline)
        .swapper(swapper.address)
        .nonce(NONCE)
        .input({
          token: tokenIn.address,
          startAmount: AMOUNT,
          endAmount: AMOUNT,
        })
        .output({
          token: tokenOut.address,
          startAmount: AMOUNT,
          endAmount: AMOUNT.div(2),
          recipient: swapper.address,
        })
        .buildPartial();

      const { domain, types, values } = order.permitData();
      const signature = await swapper._signTypedData(domain, types, values);

      const cosignerData = getCosignerData(deadline, {
        exclusiveFiller: fillerAddress,
        decayStartTime: deadline - 1000,
      });
      const cosignerHash = order.cosignatureHash(cosignerData);
      const cosignature = ethers.utils.joinSignature(
        cosigner._signingKey().signDigest(cosignerHash)
      );
      const fullOrder = V2DutchOrderBuilder.fromOrder(order)
        .cosignerData(cosignerData)
        .cosignature(cosignature)
        .build();

      const swapperTokenInBalanceBefore = await tokenIn.balanceOf(
        swapperAddress
      );
      const fillerTokenInBalanceBefore = await tokenIn.balanceOf(fillerAddress);
      const openFillerTokenInBalanceBefore = await tokenIn.balanceOf(
        openFillerAddress
      );
      const swapperTokenOutBalanceBefore = await tokenOut.balanceOf(
        swapperAddress
      );
      const fillerTokenOutBalanceBefore = await tokenOut.balanceOf(
        fillerAddress
      );
      const openFillerTokenOutBalanceBefore = await tokenOut.balanceOf(
        openFillerAddress
      );

      // mine another block to pass exclusivity
      await new BlockchainTime().increaseTime(500);

      const res = await reactor
        .connect(openFiller)
        .execute({ order: fullOrder.serialize(), sig: signature });
      const receipt = await res.wait();
      expect(receipt.status).to.equal(1);
      expect((await tokenIn.balanceOf(swapperAddress)).toString()).to.equal(
        swapperTokenInBalanceBefore.sub(AMOUNT).toString()
      );
      // exclusive filler did not fill
      expect((await tokenIn.balanceOf(fillerAddress)).toString()).to.equal(
        fillerTokenInBalanceBefore.toString()
      );
      // filled by open filler
      expect((await tokenIn.balanceOf(openFillerAddress)).toString()).to.equal(
        openFillerTokenInBalanceBefore.add(AMOUNT).toString()
      );

      const amountOut = order.info.outputs[0].startAmount
        .add(order.info.outputs[0].endAmount)
        .div(2);

      // some variance in block timestamp so we need to use a threshold
      expectThreshold(
        await tokenOut.balanceOf(swapperAddress),
        swapperTokenOutBalanceBefore.add(amountOut),
        BigNumber.from(10).pow(15)
      );
      expectThreshold(
        await tokenOut.balanceOf(openFillerAddress),
        openFillerTokenOutBalanceBefore.sub(amountOut),
        BigNumber.from(10).pow(15)
      );
    });

    it("open filler fails to execute an open order before exclusivity", async () => {
      const deadline = await new BlockchainTime().secondsFromNow(1000);
      const order = new V2DutchOrderBuilder(
        chainId,
        reactor.address,
        permit2.address
      )
        .cosigner(cosigner.address)
        .deadline(deadline)
        .swapper(swapper.address)
        .nonce(NONCE)
        .input({
          token: tokenIn.address,
          startAmount: AMOUNT,
          endAmount: AMOUNT,
        })
        .output({
          token: tokenOut.address,
          startAmount: AMOUNT,
          endAmount: AMOUNT.div(2),
          recipient: swapper.address,
        })
        .buildPartial();

      const { domain, types, values } = order.permitData();
      const signature = await swapper._signTypedData(domain, types, values);

      const cosignerData = getCosignerData(deadline, {
        exclusiveFiller: fillerAddress,
        decayStartTime: deadline - 500,
      });
      const cosignerHash = order.cosignatureHash(cosignerData);
      const cosignature = ethers.utils.joinSignature(
        cosigner._signingKey().signDigest(cosignerHash)
      );
      const fullOrder = V2DutchOrderBuilder.fromOrder(order)
        .cosignerData(cosignerData)
        .cosignature(cosignature)
        .build();

      // mine another block, but do not pass exclusivity
      await new BlockchainTime().increaseTime(100);

      await expect(
        reactor
          .connect(openFiller)
          .execute({ order: fullOrder.serialize(), sig: signature })
      ).to.be.revertedWithCustomError(reactor, "NoExclusiveOverride");
    });
  });

  const getCosignerData = (
    deadline: number,
    overrides: Partial<CosignerData> = {}
  ): CosignerData => {
    const defaultData: CosignerData = {
      decayStartTime: deadline - 100,
      decayEndTime: deadline,
      exclusiveFiller: ethers.constants.AddressZero,
      exclusivityOverrideBps: BigNumber.from(0),
      inputOverride: AMOUNT,
      outputOverrides: [AMOUNT],
    };
    return Object.assign(defaultData, overrides);
  };

  function expectThreshold(
    a: BigNumber,
    b: BigNumber,
    threshold: BigNumber
  ): void {
    if (a.gt(b)) {
      expect(a.sub(b).lte(threshold)).to.equal(true);
    } else {
      expect(b.sub(a).lte(threshold)).to.equal(true);
    }
  }
});
