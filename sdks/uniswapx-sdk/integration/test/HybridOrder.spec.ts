import { BigNumber, Signer, Wallet } from "ethers";
import hre, { ethers } from "hardhat";
import Permit2Abi from "../../abis/Permit2.json";
import ReactorAbi from "../../abis/Reactor.json";
import HybridAuctionResolverAbi from "../../abis/HybridAuctionResolver.json";
import TokenTransferHookAbi from "../../abis/TokenTransferHook.json";
import MockERC20Abi from "../../abis/MockERC20.json";
import { Permit2, Reactor, HybridAuctionResolver, TokenTransferHook, MockERC20 } from "../../src/contracts";
import { BlockchainTime } from "./utils/time";
import { HybridOrderBuilder } from "../../src/builder/HybridOrderBuilder";
import { expect } from "chai";
import { HybridCosignerData } from "../../src/order/v4/types";

describe("HybridOrder", () => {
  const AMOUNT = BigNumber.from(10).pow(18);
  const BASE_SCALING_FACTOR = BigNumber.from(10).pow(18); // 1e18
  let NONCE = BigNumber.from(100);
  let futureDeadline: number;
  let futureBlock: number;
  let admin: Signer;
  let filler: Signer;
  let permit2: Permit2;
  let reactor: Reactor;
  let resolver: HybridAuctionResolver;
  let hook: TokenTransferHook;
  const chainId = hre.network.config.chainId || 1;
  let swapper: Wallet;
  let cosigner: Wallet;
  let tokenIn: MockERC20;
  let tokenOut: MockERC20;
  let swapperAddress: string;
  let fillerAddress: string;
  let cosignerAddress: string;
  let resolverAddress: string;
  let hookAddress: string;

  before(async () => {
    futureDeadline = await new BlockchainTime().secondsFromNow(1000);
    futureBlock = await new BlockchainTime().blocksFromNow(100);
    [admin, filler] = await ethers.getSigners();

    // Deploy Permit2
    const permit2Factory = await ethers.getContractFactory(
      Permit2Abi.abi,
      Permit2Abi.bytecode
    );
    permit2 = (await permit2Factory.deploy()) as Permit2;

    // Deploy V4 Reactor
    const reactorFactory = await ethers.getContractFactory(
      ReactorAbi.abi,
      ReactorAbi.bytecode
    );
    reactor = (await reactorFactory.deploy(
      await admin.getAddress(),
      permit2.address
    )) as Reactor;

    // Deploy HybridAuctionResolver
    const resolverFactory = await ethers.getContractFactory(
      HybridAuctionResolverAbi.abi,
      HybridAuctionResolverAbi.bytecode
    );
    resolver = (await resolverFactory.deploy()) as HybridAuctionResolver;

    // Deploy TokenTransferHook
    const hookFactory = await ethers.getContractFactory(
      TokenTransferHookAbi.abi,
      TokenTransferHookAbi.bytecode
    );
    hook = (await hookFactory.deploy(
      permit2.address,
      reactor.address
    )) as TokenTransferHook;

    // Create wallets
    swapper = ethers.Wallet.createRandom().connect(ethers.provider);
    cosigner = ethers.Wallet.createRandom().connect(ethers.provider);
    swapperAddress = await swapper.getAddress();
    cosignerAddress = await cosigner.getAddress();
    fillerAddress = await filler.getAddress();
    resolverAddress = resolver.address;
    hookAddress = hook.address;

    // Fund swapper
    await admin.sendTransaction({
      to: swapperAddress,
      value: AMOUNT.mul(10),
    });

    // Deploy test tokens
    const tokenFactory = await ethers.getContractFactory(
      MockERC20Abi.abi,
      MockERC20Abi.bytecode
    );

    tokenIn = (await tokenFactory.deploy("Token A", "A", 18)) as MockERC20;
    tokenOut = (await tokenFactory.deploy("Token B", "B", 18)) as MockERC20;

    // Mint and approve tokens for swapper
    await tokenIn.mint(swapperAddress, AMOUNT.mul(100));
    await tokenIn
      .connect(swapper)
      .approve(permit2.address, ethers.constants.MaxUint256);

    // Mint and approve tokens for filler
    await tokenOut.mint(fillerAddress, AMOUNT.mul(100));
    await tokenOut
      .connect(filler)
      .approve(reactor.address, ethers.constants.MaxUint256);
  });

  afterEach(() => {
    NONCE = NONCE.add(1);
  });

  const getCosignerData = (
    targetBlock?: BigNumber,
    supplementalCurve: BigNumber[] = []
  ): HybridCosignerData => {
    return {
      auctionTargetBlock: targetBlock || BigNumber.from(0),
      supplementalPriceCurve: supplementalCurve,
    };
  };

  const encodePriceCurveElement = (duration: number, scalingFactor: BigNumber): BigNumber => {
    // Pack: duration (16 bits) << 240 | scalingFactor (240 bits)
    return BigNumber.from(duration).shl(240).or(scalingFactor);
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

  describe("Order Building", () => {
    it("correctly builds a partial order without cosigner", async () => {
      const order = new HybridOrderBuilder(
        chainId,
        reactor.address,
        resolver.address,
        permit2.address
      )
        .cosigner(ethers.constants.AddressZero)
        .deadline(futureDeadline)
        .swapper(swapperAddress)
        .nonce(NONCE)
        .auctionResolver(resolverAddress)
        .preExecutionHook(hookAddress, "0x")
        .postExecutionHook(ethers.constants.AddressZero, "0x")
        .input({
          token: tokenIn.address,
          maxAmount: AMOUNT,
        })
        .output({
          token: tokenOut.address,
          minAmount: AMOUNT,
          recipient: swapperAddress,
        })
        .auctionStartBlock(BigNumber.from(futureBlock))
        .baselinePriorityFee(BigNumber.from(0))
        .scalingFactor(BASE_SCALING_FACTOR) // Neutral scaling
        .priceCurve([])
        .buildPartial();

      expect(order.info.deadline).to.eq(futureDeadline);
      expect(order.info.swapper).to.eq(swapperAddress);
      expect(order.info.nonce).to.eq(NONCE);
      expect(order.info.auctionResolver).to.eq(resolverAddress);
      expect(order.info.preExecutionHook).to.eq(hookAddress);
      expect(order.info.cosigner).to.eq(ethers.constants.AddressZero);
      expect(order.info.input.token).to.eq(tokenIn.address);
      expect(order.info.input.maxAmount).to.eq(AMOUNT);
      expect(order.info.outputs[0].token).to.eq(tokenOut.address);
      expect(order.info.outputs[0].minAmount).to.eq(AMOUNT);
      expect(order.info.scalingFactor).to.eq(BASE_SCALING_FACTOR);
    });

    it("correctly builds an order with price curve", async () => {
      const priceCurve = [
        encodePriceCurveElement(10, BASE_SCALING_FACTOR.mul(105).div(100)), // 5% improvement over 10 blocks
      ];

      const order = new HybridOrderBuilder(
        chainId,
        reactor.address,
        resolver.address,
        permit2.address
      )
        .cosigner(ethers.constants.AddressZero)
        .deadline(futureDeadline)
        .swapper(swapperAddress)
        .nonce(NONCE)
        .auctionResolver(resolverAddress)
        .preExecutionHook(hookAddress, "0x")
        .postExecutionHook(ethers.constants.AddressZero, "0x")
        .input({
          token: tokenIn.address,
          maxAmount: AMOUNT,
        })
        .output({
          token: tokenOut.address,
          minAmount: AMOUNT,
          recipient: swapperAddress,
        })
        .auctionStartBlock(BigNumber.from(futureBlock))
        .baselinePriorityFee(BigNumber.from(0))
        .scalingFactor(BASE_SCALING_FACTOR.mul(105).div(100))
        .priceCurve(priceCurve)
        .buildPartial();

      expect(order.info.priceCurve.length).to.eq(1);
      expect(order.info.priceCurve[0]).to.eq(priceCurve[0]);
    });
  });

  describe("Order Execution", () => {
    it("executes a simple order without price curve (neutral scaling)", async () => {
      const orderClass = new HybridOrderBuilder(
        chainId,
        reactor.address,
        resolver.address,
        permit2.address
      )
        .cosigner(ethers.constants.AddressZero)
        .deadline(futureDeadline)
        .swapper(swapperAddress)
        .nonce(NONCE)
        .auctionResolver(resolverAddress)
        .preExecutionHook(hookAddress, "0x")
        .postExecutionHook(ethers.constants.AddressZero, "0x")
        .input({
          token: tokenIn.address,
          maxAmount: AMOUNT,
        })
        .output({
          token: tokenOut.address,
          minAmount: AMOUNT,
          recipient: swapperAddress,
        })
        .auctionStartBlock(BigNumber.from(0)) // No target block
        .baselinePriorityFee(BigNumber.from(0))
        .scalingFactor(BASE_SCALING_FACTOR) // 1e18 = neutral
        .priceCurve([])
        .buildPartial();

      const { domain, types, values } = orderClass.permitData();
      const signature = await swapper._signTypedData(domain, types, values);

      const swapperTokenInBalanceBefore = await tokenIn.balanceOf(swapperAddress);
      const fillerTokenInBalanceBefore = await tokenIn.balanceOf(fillerAddress);
      const swapperTokenOutBalanceBefore = await tokenOut.balanceOf(swapperAddress);
      const fillerTokenOutBalanceBefore = await tokenOut.balanceOf(fillerAddress);

      const res = await reactor
        .connect(filler)
        .execute({ order: orderClass.serialize(), sig: signature });

      const receipt = await res.wait();
      expect(receipt.status).to.equal(1);

      // Verify balance changes
      expect(await tokenIn.balanceOf(swapperAddress)).to.equal(
        swapperTokenInBalanceBefore.sub(AMOUNT)
      );
      expect(await tokenIn.balanceOf(fillerAddress)).to.equal(
        fillerTokenInBalanceBefore.add(AMOUNT)
      );
      expect(await tokenOut.balanceOf(swapperAddress)).to.equal(
        swapperTokenOutBalanceBefore.add(AMOUNT)
      );
      expect(await tokenOut.balanceOf(fillerAddress)).to.equal(
        fillerTokenOutBalanceBefore.sub(AMOUNT)
      );
    });
  });

  describe("Exact-In Mode", () => {
    it("executes exact-in order (scalingFactor > 1e18)", async () => {
      // Exact-in: input is fixed, outputs scale up from price curve
      const auctionStartBlock = await ethers.provider.getBlockNumber();
      const priceCurve = [
        encodePriceCurveElement(100, BASE_SCALING_FACTOR.mul(12).div(10)), // 1.2e18
      ];

      const baselinePriorityFee = ethers.utils.parseUnits("10", "gwei");
      const scalingFactor = BigNumber.from("10").pow(18).add(BigNumber.from("10").pow(7)); // 1.00000000001e18

      const orderClass = new HybridOrderBuilder(
        chainId,
        reactor.address,
        resolver.address,
        permit2.address
      )
        .cosigner(ethers.constants.AddressZero)
        .deadline(futureDeadline)
        .swapper(swapperAddress)
        .nonce(NONCE)
        .auctionResolver(resolverAddress)
        .preExecutionHook(hookAddress, "0x")
        .postExecutionHook(ethers.constants.AddressZero, "0x")
        .input({
          token: tokenIn.address,
          maxAmount: AMOUNT,
        })
        .output({
          token: tokenOut.address,
          minAmount: AMOUNT,
          recipient: swapperAddress,
        })
        .auctionStartBlock(BigNumber.from(auctionStartBlock))
        .baselinePriorityFee(baselinePriorityFee)
        .scalingFactor(scalingFactor)
        .priceCurve(priceCurve)
        .buildPartial();

      const { domain, types, values } = orderClass.permitData();
      const signature = await swapper._signTypedData(domain, types, values);

      // Advance 49 blocks so that the execute() transaction will be at block +50
      const targetBlock = auctionStartBlock + 49;
      const currentBlock = await ethers.provider.getBlockNumber();
      for (let i = currentBlock; i < targetBlock; i++) {
        await ethers.provider.send("evm_mine", []);
      }

      const swapperTokenOutBalanceBefore = await tokenOut.balanceOf(swapperAddress);

      await ethers.provider.send("hardhat_setNextBlockBaseFeePerGas", [
        ethers.utils.parseUnits("1", "gwei").toHexString()
      ]);

      // Set tx.gasprice: 1 gwei basefee + 10 gwei baseline + 5 gwei = 16 gwei total
      // This gives priorityFee = 16 - 1 = 15 gwei, and priorityFeeAboveBaseline = 15 - 10 = 5 gwei
      await reactor
        .connect(filler)
        .execute(
          { order: orderClass.serialize(), sig: signature },
          { gasPrice: ethers.utils.parseUnits("16", "gwei") }
        );

      // Current scaling from curve: 1.2 - (1.2-1.0) * 0.5 = 1.1
      // scalingFactor = 1.00000000001e18, priorityFee = 5 gwei
      // scalingMultiplier = 1.1e18 + ((1.00000000001e18 - 1e18) * 5 gwei)
      const swapperTokenOutBalanceAfter = await tokenOut.balanceOf(swapperAddress);
      const actualOutput = swapperTokenOutBalanceAfter.sub(swapperTokenOutBalanceBefore);

      const priorityFeeAboveBaseline = ethers.utils.parseUnits("5", "gwei");
      const currentCurveScaling = BASE_SCALING_FACTOR.mul(11).div(10); // 1.1e18
      const expectedScaling = currentCurveScaling.add(
        scalingFactor.sub(BASE_SCALING_FACTOR).mul(priorityFeeAboveBaseline)
      );

      // mulWadUp: (amount * scaling + 1e18 - 1) / 1e18
      const expectedOutput = AMOUNT.mul(expectedScaling).add(BASE_SCALING_FACTOR).sub(1).div(BASE_SCALING_FACTOR);

      expectThreshold(actualOutput, expectedOutput, AMOUNT.div(1000));
    });
  });

  describe("Exact-Out Mode", () => {
    it("executes exact-out order (scalingFactor < 1e18)", async () => {
      // Exact-out: outputs are fixed, input scales down from price curve
      const auctionStartBlock = await ethers.provider.getBlockNumber();
      const priceCurve = [
        encodePriceCurveElement(100, BASE_SCALING_FACTOR.mul(8).div(10)), // 0.8e18
      ];

      const baselinePriorityFee = ethers.utils.parseUnits("10", "gwei");
      const scalingFactor = BASE_SCALING_FACTOR.mul(999).div(1000); // 0.999e18

      const orderClass = new HybridOrderBuilder(
        chainId,
        reactor.address,
        resolver.address,
        permit2.address
      )
        .cosigner(ethers.constants.AddressZero)
        .deadline(futureDeadline)
        .swapper(swapperAddress)
        .nonce(NONCE)
        .auctionResolver(resolverAddress)
        .preExecutionHook(hookAddress, "0x")
        .postExecutionHook(ethers.constants.AddressZero, "0x")
        .input({
          token: tokenIn.address,
          maxAmount: AMOUNT,
        })
        .output({
          token: tokenOut.address,
          minAmount: AMOUNT,
          recipient: swapperAddress,
        })
        .auctionStartBlock(BigNumber.from(auctionStartBlock))
        .baselinePriorityFee(baselinePriorityFee)
        .scalingFactor(scalingFactor)
        .priceCurve(priceCurve)
        .buildPartial();

      const { domain, types, values } = orderClass.permitData();
      const signature = await swapper._signTypedData(domain, types, values);

      // Advance 49 blocks so that the execute() transaction will be at block +50
      const targetBlock = auctionStartBlock + 49;
      const currentBlock = await ethers.provider.getBlockNumber();
      for (let i = currentBlock; i < targetBlock; i++) {
        await ethers.provider.send("evm_mine", []);
      }

      const swapperTokenInBalanceBefore = await tokenIn.balanceOf(swapperAddress);
      const swapperTokenOutBalanceBefore = await tokenOut.balanceOf(swapperAddress);
      const fillerTokenInBalanceBefore = await tokenIn.balanceOf(fillerAddress);

      await ethers.provider.send("hardhat_setNextBlockBaseFeePerGas", [
        ethers.utils.parseUnits("1", "gwei").toHexString()
      ]);

      // Set tx.gasprice: 1 gwei basefee + 10 gwei baseline + 1 wei
      // This gives priorityFee = (10 gwei + 1 wei) - 1 gwei = 9 gwei + 1 wei, and priorityFeeAboveBaseline = 1 wei
      const gasPrice = ethers.utils.parseUnits("1", "gwei")
        .add(baselinePriorityFee)
        .add(1);
      await reactor
        .connect(filler)
        .execute(
          { order: orderClass.serialize(), sig: signature },
          { gasPrice }
        );

      // Output fixed in exact-out - verify swapper received exactly AMOUNT more
      const swapperTokenOutBalanceAfter = await tokenOut.balanceOf(swapperAddress);
      expect(swapperTokenOutBalanceAfter.sub(swapperTokenOutBalanceBefore)).to.equal(AMOUNT);

      // Current scaling from curve: 0.8 + (1.0-0.8) * 0.5 = 0.9
      // Priority adjustment: 0.9 - (1.0 - 0.999) * 1 wei
      const swapperTokenInBalanceAfter = await tokenIn.balanceOf(swapperAddress);
      const fillerTokenInBalanceAfter = await tokenIn.balanceOf(fillerAddress);
      const actualInput = swapperTokenInBalanceBefore.sub(swapperTokenInBalanceAfter);

      const currentCurveScaling = BASE_SCALING_FACTOR.mul(9).div(10); // 0.9e18
      const priorityFeeAboveBaseline = BigNumber.from(1); // 1 wei
      const expectedScaling = currentCurveScaling.sub(
        BASE_SCALING_FACTOR.sub(scalingFactor).mul(priorityFeeAboveBaseline)
      );

      // mulWad: (amount * scaling) / 1e18
      const expectedInput = AMOUNT.mul(expectedScaling).div(BASE_SCALING_FACTOR);

      // Verify filler received the input
      expect(fillerTokenInBalanceAfter).to.equal(fillerTokenInBalanceBefore.add(actualInput));

      expectThreshold(actualInput, expectedInput, AMOUNT.div(1000));
    });
  });

  describe("Cosigner Functionality", () => {
    it("executes order with cosigner and target block override", async () => {
      const partialOrder = new HybridOrderBuilder(
        chainId,
        reactor.address,
        resolver.address,
        permit2.address
      )
        .cosigner(cosignerAddress)
        .deadline(futureDeadline)
        .swapper(swapperAddress)
        .nonce(NONCE)
        .auctionResolver(resolverAddress)
        .preExecutionHook(hookAddress, "0x")
        .postExecutionHook(ethers.constants.AddressZero, "0x")
        .input({
          token: tokenIn.address,
          maxAmount: AMOUNT,
        })
        .output({
          token: tokenOut.address,
          minAmount: AMOUNT,
          recipient: swapperAddress,
        })
        .auctionStartBlock(BigNumber.from(futureBlock))
        .baselinePriorityFee(BigNumber.from(0))
        .scalingFactor(BASE_SCALING_FACTOR)
        .priceCurve([]);

      const currentBlock = await ethers.provider.getBlockNumber();
      const cosignerData = getCosignerData(BigNumber.from(currentBlock));

      const order = partialOrder
        .cosignerData(cosignerData)
        .buildPartial();

      const cosignerHash = order.cosignatureHash(cosignerData);
      const cosignatureObj = await cosigner._signingKey().signDigest(cosignerHash);
      const cosignature = ethers.utils.joinSignature(cosignatureObj);

      const orderClass = HybridOrderBuilder.fromOrder(order)
        .cosignerData(cosignerData)
        .cosignature(cosignature)
        .build();

      const { domain, types, values } = orderClass.permitData();
      const signature = await swapper._signTypedData(domain, types, values);

      const res = await reactor
        .connect(filler)
        .execute({ order: orderClass.serialize(), sig: signature });

      const receipt = await res.wait();
      expect(receipt.status).to.equal(1);
    });

    it("reverts on invalid cosignature", async () => {
      const partialOrder = new HybridOrderBuilder(
        chainId,
        reactor.address,
        resolver.address,
        permit2.address
      )
        .cosigner(cosignerAddress)
        .deadline(futureDeadline)
        .swapper(swapperAddress)
        .nonce(NONCE)
        .auctionResolver(resolverAddress)
        .preExecutionHook(hookAddress, "0x")
        .postExecutionHook(ethers.constants.AddressZero, "0x")
        .input({
          token: tokenIn.address,
          maxAmount: AMOUNT,
        })
        .output({
          token: tokenOut.address,
          minAmount: AMOUNT,
          recipient: swapperAddress,
        })
        .auctionStartBlock(BigNumber.from(futureBlock))
        .baselinePriorityFee(BigNumber.from(0))
        .scalingFactor(BASE_SCALING_FACTOR)
        .priceCurve([])
        .buildPartial();

      const currentBlock = await ethers.provider.getBlockNumber();
      const cosignerData = getCosignerData(BigNumber.from(currentBlock));

      const partialWithCosignerData = HybridOrderBuilder.fromOrder(partialOrder)
        .cosignerData(cosignerData)
        .buildPartial();

      // Sign with WRONG cosigner (swapper instead of cosigner)
      const cosignerHash = partialWithCosignerData.cosignatureHash(cosignerData);
      const wrongCosignatureObj = await swapper._signingKey().signDigest(cosignerHash);
      const wrongCosignature = ethers.utils.joinSignature(wrongCosignatureObj);

      const orderClass = HybridOrderBuilder.fromOrder(partialWithCosignerData)
        .cosignerData(cosignerData)
        .cosignature(wrongCosignature)
        .build();

      const { domain, types, values } = orderClass.permitData();
      const signature = await swapper._signTypedData(domain, types, values);

      await expect(
        reactor.connect(filler).execute({ order: orderClass.serialize(), sig: signature })
      ).to.be.reverted; // Should revert due to invalid cosignature
    });
  });

  describe("Multiple Outputs", () => {
    it("executes order with multiple output tokens", async () => {
      // Deploy additional output token
      const tokenFactory = await ethers.getContractFactory(
        MockERC20Abi.abi,
        MockERC20Abi.bytecode
      );
      const tokenOut2 = (await tokenFactory.deploy("Token C", "C", 18)) as MockERC20;

      await tokenOut2.mint(fillerAddress, AMOUNT.mul(100));
      await tokenOut2
        .connect(filler)
        .approve(reactor.address, ethers.constants.MaxUint256);

      const orderClass = new HybridOrderBuilder(
        chainId,
        reactor.address,
        resolver.address,
        permit2.address
      )
        .cosigner(ethers.constants.AddressZero)
        .deadline(futureDeadline)
        .swapper(swapperAddress)
        .nonce(NONCE)
        .auctionResolver(resolverAddress)
        .preExecutionHook(hookAddress, "0x")
        .postExecutionHook(ethers.constants.AddressZero, "0x")
        .input({
          token: tokenIn.address,
          maxAmount: AMOUNT,
        })
        .output({
          token: tokenOut.address,
          minAmount: AMOUNT.div(2),
          recipient: swapperAddress,
        })
        .output({
          token: tokenOut2.address,
          minAmount: AMOUNT.div(2),
          recipient: swapperAddress,
        })
        .auctionStartBlock(BigNumber.from(0))
        .baselinePriorityFee(BigNumber.from(0))
        .scalingFactor(BASE_SCALING_FACTOR)
        .priceCurve([])
        .buildPartial();

      const { domain, types, values } = orderClass.permitData();
      const signature = await swapper._signTypedData(domain, types, values);

      const swapperTokenOut1Before = await tokenOut.balanceOf(swapperAddress);
      const swapperTokenOut2Before = await tokenOut2.balanceOf(swapperAddress);

      const res = await reactor
        .connect(filler)
        .execute({ order: orderClass.serialize(), sig: signature });

      const receipt = await res.wait();
      expect(receipt.status).to.equal(1);

      // Verify both outputs were received
      expect(await tokenOut.balanceOf(swapperAddress)).to.equal(
        swapperTokenOut1Before.add(AMOUNT.div(2))
      );
      expect(await tokenOut2.balanceOf(swapperAddress)).to.equal(
        swapperTokenOut2Before.add(AMOUNT.div(2))
      );
    });
  });

  describe("Price Curve Tests", () => {
    it("executes order with simple linear price curve", async () => {
      const currentBlock = await ethers.provider.getBlockNumber();
      const targetBlock = currentBlock + 1; // Next block

      // Price curve: 10 blocks to reach 105% scaling factor
      const priceCurve = [
        encodePriceCurveElement(10, BASE_SCALING_FACTOR.mul(105).div(100)),
      ];

      const orderClass = new HybridOrderBuilder(
        chainId,
        reactor.address,
        resolver.address,
        permit2.address
      )
        .cosigner(ethers.constants.AddressZero)
        .deadline(futureDeadline)
        .swapper(swapperAddress)
        .nonce(NONCE)
        .auctionResolver(resolverAddress)
        .preExecutionHook(hookAddress, "0x")
        .postExecutionHook(ethers.constants.AddressZero, "0x")
        .input({
          token: tokenIn.address,
          maxAmount: AMOUNT,
        })
        .output({
          token: tokenOut.address,
          minAmount: AMOUNT,
          recipient: swapperAddress,
        })
        .auctionStartBlock(BigNumber.from(targetBlock))
        .baselinePriorityFee(BigNumber.from(0))
        .scalingFactor(BASE_SCALING_FACTOR)
        .priceCurve(priceCurve)
        .buildPartial();

      const { domain, types, values } = orderClass.permitData();
      const signature = await swapper._signTypedData(domain, types, values);

      const res = await reactor
        .connect(filler)
        .execute({ order: orderClass.serialize(), sig: signature });

      const receipt = await res.wait();
      expect(receipt.status).to.equal(1);
    });

    it("executes order with multi-segment price curve", async () => {
      // Price curve: 3 segments, all > 1e18 (exact-in mode)
      // priceCurve[0] = (30 << 240) | 1.5e18  -> 30 blocks starting at 1.5x
      // priceCurve[1] = (40 << 240) | 1.3e18  -> 40 blocks to 1.3x
      // priceCurve[2] = (30 << 240) | 1.1e18  -> 30 blocks to 1.1x (ends at 1.0x)
      // Total duration: 100 blocks

      const priceCurve = [
        encodePriceCurveElement(30, BASE_SCALING_FACTOR.mul(15).div(10)), // 1.5e18
        encodePriceCurveElement(40, BASE_SCALING_FACTOR.mul(13).div(10)), // 1.3e18
        encodePriceCurveElement(30, BASE_SCALING_FACTOR.mul(11).div(10)), // 1.1e18
      ];

      const inputAmount = AMOUNT;
      const outputMinAmount = AMOUNT;
      const auctionStartBlock = await ethers.provider.getBlockNumber();

      // Test at block 15: interpolating from 1.5 to 1.3 within first segment
      // Expected: 1.5 - (1.5 - 1.3) * (15/30) = 1.4
      const orderClass = new HybridOrderBuilder(
        chainId,
        reactor.address,
        resolver.address,
        permit2.address
      )
        .cosigner(ethers.constants.AddressZero)
        .deadline(futureDeadline)
        .swapper(swapperAddress)
        .nonce(NONCE)
        .auctionResolver(resolverAddress)
        .preExecutionHook(hookAddress, "0x")
        .postExecutionHook(ethers.constants.AddressZero, "0x")
        .input({
          token: tokenIn.address,
          maxAmount: inputAmount,
        })
        .output({
          token: tokenOut.address,
          minAmount: outputMinAmount,
          recipient: swapperAddress,
        })
        .auctionStartBlock(BigNumber.from(auctionStartBlock))
        .baselinePriorityFee(BigNumber.from(0))
        .scalingFactor(BASE_SCALING_FACTOR) // Neutral - no priority fee adjustment
        .priceCurve(priceCurve)
        .buildPartial();

      const { domain, types, values } = orderClass.permitData();
      const signature = await swapper._signTypedData(domain, types, values);

      // Advance 14 blocks so execute() is at block +15
      const currentBlock = await ethers.provider.getBlockNumber();
      for (let i = currentBlock; i < auctionStartBlock + 14; i++) {
        await ethers.provider.send("evm_mine", []);
      }

      const swapperTokenOutBefore = await tokenOut.balanceOf(swapperAddress);

      const res = await reactor
        .connect(filler)
        .execute({ order: orderClass.serialize(), sig: signature });

      const receipt = await res.wait();
      expect(receipt.status).to.equal(1);

      // Verify output: expected scaling at block 15 is 1.4e18
      // mulWadUp(outputMinAmount, 1.4e18)
      const expectedScaling = BASE_SCALING_FACTOR.mul(14).div(10); // 1.4e18
      const expectedOutput = outputMinAmount.mul(expectedScaling).add(BASE_SCALING_FACTOR).sub(1).div(BASE_SCALING_FACTOR);
      const swapperTokenOutAfter = await tokenOut.balanceOf(swapperAddress);
      const actualOutput = swapperTokenOutAfter.sub(swapperTokenOutBefore);

      expect(actualOutput).to.equal(expectedOutput);
    });

    it("executes order with zero-duration instant price point", async () => {
      // Test zero-duration elements which create instantaneous price jumps
      // priceCurve[0] = (10 << 240) | 1.2e18  -> 10 blocks interpolating from 1.2x to next
      // priceCurve[1] = (0 << 240) | 1.5e18   -> Zero duration at 1.5x (waypoint)
      // priceCurve[2] = (20 << 240) | 1e18    -> 20 blocks from waypoint to 1x
      const priceCurve = [
        encodePriceCurveElement(10, BASE_SCALING_FACTOR.mul(12).div(10)), // 1.2e18
        encodePriceCurveElement(0, BASE_SCALING_FACTOR.mul(15).div(10)),  // 1.5e18 (zero-duration)
        encodePriceCurveElement(20, BASE_SCALING_FACTOR),                  // 1.0e18
      ];

      const inputAmount = AMOUNT;
      const outputMinAmount = AMOUNT;
      const auctionStartBlock = await ethers.provider.getBlockNumber();

      // Test 1: At block 5, interpolating from 1.2x towards 1.5x
      // Expected: 1.2 + (1.5 - 1.2) * (5/10) = 1.35
      const orderClass1 = new HybridOrderBuilder(
        chainId,
        reactor.address,
        resolver.address,
        permit2.address
      )
        .cosigner(ethers.constants.AddressZero)
        .deadline(futureDeadline)
        .swapper(swapperAddress)
        .nonce(NONCE)
        .auctionResolver(resolverAddress)
        .preExecutionHook(hookAddress, "0x")
        .postExecutionHook(ethers.constants.AddressZero, "0x")
        .input({
          token: tokenIn.address,
          maxAmount: inputAmount,
        })
        .output({
          token: tokenOut.address,
          minAmount: outputMinAmount,
          recipient: swapperAddress,
        })
        .auctionStartBlock(BigNumber.from(auctionStartBlock))
        .baselinePriorityFee(BigNumber.from(0))
        .scalingFactor(BASE_SCALING_FACTOR)
        .priceCurve(priceCurve)
        .buildPartial();

      const { domain: domain1, types: types1, values: values1 } = orderClass1.permitData();
      const signature1 = await swapper._signTypedData(domain1, types1, values1);

      // Advance 4 blocks so execute() is at block +5
      let currentBlock = await ethers.provider.getBlockNumber();
      for (let i = currentBlock; i < auctionStartBlock + 4; i++) {
        await ethers.provider.send("evm_mine", []);
      }

      const swapperTokenOutBefore1 = await tokenOut.balanceOf(swapperAddress);

      await reactor
        .connect(filler)
        .execute({ order: orderClass1.serialize(), sig: signature1 });

      const swapperTokenOutAfter1 = await tokenOut.balanceOf(swapperAddress);
      const actualOutput1 = swapperTokenOutAfter1.sub(swapperTokenOutBefore1);

      // Expected scaling: 1.35e18
      const expectedScaling1 = BASE_SCALING_FACTOR.mul(135).div(100);
      const expectedOutput1 = outputMinAmount.mul(expectedScaling1).add(BASE_SCALING_FACTOR).sub(1).div(BASE_SCALING_FACTOR);

      expectThreshold(actualOutput1, expectedOutput1, outputMinAmount.div(1000)); // 0.1% threshold

      // Test 2: At block 10, exactly at zero-duration element (1.5x)
      const auctionStartBlock2 = await ethers.provider.getBlockNumber();
      const priceCurve2 = [
        encodePriceCurveElement(10, BASE_SCALING_FACTOR.mul(12).div(10)),
        encodePriceCurveElement(0, BASE_SCALING_FACTOR.mul(15).div(10)),
        encodePriceCurveElement(20, BASE_SCALING_FACTOR),
      ];

      const orderClass2 = new HybridOrderBuilder(
        chainId,
        reactor.address,
        resolver.address,
        permit2.address
      )
        .cosigner(ethers.constants.AddressZero)
        .deadline(futureDeadline)
        .swapper(swapperAddress)
        .nonce(NONCE.add(1))
        .auctionResolver(resolverAddress)
        .preExecutionHook(hookAddress, "0x")
        .postExecutionHook(ethers.constants.AddressZero, "0x")
        .input({
          token: tokenIn.address,
          maxAmount: inputAmount,
        })
        .output({
          token: tokenOut.address,
          minAmount: outputMinAmount,
          recipient: swapperAddress,
        })
        .auctionStartBlock(BigNumber.from(auctionStartBlock2))
        .baselinePriorityFee(BigNumber.from(0))
        .scalingFactor(BASE_SCALING_FACTOR)
        .priceCurve(priceCurve2)
        .buildPartial();

      const { domain: domain2, types: types2, values: values2 } = orderClass2.permitData();
      const signature2 = await swapper._signTypedData(domain2, types2, values2);

      // Advance 9 blocks so execute() is at block +10
      currentBlock = await ethers.provider.getBlockNumber();
      for (let i = currentBlock; i < auctionStartBlock2 + 9; i++) {
        await ethers.provider.send("evm_mine", []);
      }

      const swapperTokenOutBefore2 = await tokenOut.balanceOf(swapperAddress);

      await reactor
        .connect(filler)
        .execute({ order: orderClass2.serialize(), sig: signature2 });

      const swapperTokenOutAfter2 = await tokenOut.balanceOf(swapperAddress);
      const actualOutput2 = swapperTokenOutAfter2.sub(swapperTokenOutBefore2);

      // Expected scaling at block 10: exactly 1.5e18 (at zero-duration waypoint)
      const expectedScaling2 = BASE_SCALING_FACTOR.mul(15).div(10);
      const expectedOutput2 = outputMinAmount.mul(expectedScaling2).add(BASE_SCALING_FACTOR).sub(1).div(BASE_SCALING_FACTOR);

      expectThreshold(actualOutput2, expectedOutput2, outputMinAmount.div(1000)); // 0.1% threshold
    });

    it("reverts when price curve duration is exceeded", async () => {
      // Price curve: only 10 blocks total duration
      const priceCurve = [
        encodePriceCurveElement(10, BASE_SCALING_FACTOR.mul(12).div(10)), // 1.2e18 for 10 blocks
      ];

      const auctionStartBlock = await ethers.provider.getBlockNumber();

      const orderClass = new HybridOrderBuilder(
        chainId,
        reactor.address,
        resolver.address,
        permit2.address
      )
        .cosigner(ethers.constants.AddressZero)
        .deadline(futureDeadline)
        .swapper(swapperAddress)
        .nonce(NONCE)
        .auctionResolver(resolverAddress)
        .preExecutionHook(hookAddress, "0x")
        .postExecutionHook(ethers.constants.AddressZero, "0x")
        .input({
          token: tokenIn.address,
          maxAmount: AMOUNT,
        })
        .output({
          token: tokenOut.address,
          minAmount: AMOUNT,
          recipient: swapperAddress,
        })
        .auctionStartBlock(BigNumber.from(auctionStartBlock))
        .baselinePriorityFee(BigNumber.from(0))
        .scalingFactor(BASE_SCALING_FACTOR)
        .priceCurve(priceCurve)
        .buildPartial();

      const { domain, types, values } = orderClass.permitData();
      const signature = await swapper._signTypedData(domain, types, values);

      // Advance 10 blocks so execute() is at block +11 (exceeds 10 block duration)
      const currentBlock = await ethers.provider.getBlockNumber();
      for (let i = currentBlock; i < auctionStartBlock + 10; i++) {
        await ethers.provider.send("evm_mine", []);
      }

      // Should revert with PriceCurveBlocksExceeded
      await expect(
        reactor.connect(filler).execute({ order: orderClass.serialize(), sig: signature })
      ).to.be.reverted;
    });

    it("reverts when auction start block is in the future", async () => {
      const futureStartBlock = (await ethers.provider.getBlockNumber()) + 100;

      const orderClass = new HybridOrderBuilder(
        chainId,
        reactor.address,
        resolver.address,
        permit2.address
      )
        .cosigner(ethers.constants.AddressZero)
        .deadline(futureDeadline)
        .swapper(swapperAddress)
        .nonce(NONCE)
        .auctionResolver(resolverAddress)
        .preExecutionHook(hookAddress, "0x")
        .postExecutionHook(ethers.constants.AddressZero, "0x")
        .input({
          token: tokenIn.address,
          maxAmount: AMOUNT,
        })
        .output({
          token: tokenOut.address,
          minAmount: AMOUNT,
          recipient: swapperAddress,
        })
        .auctionStartBlock(BigNumber.from(futureStartBlock))
        .baselinePriorityFee(BigNumber.from(0))
        .scalingFactor(BASE_SCALING_FACTOR)
        .priceCurve([])
        .buildPartial();

      const { domain, types, values } = orderClass.permitData();
      const signature = await swapper._signTypedData(domain, types, values);

      // Should revert with InvalidAuctionBlock
      await expect(
        reactor.connect(filler).execute({ order: orderClass.serialize(), sig: signature })
      ).to.be.reverted;
    });

    it("executes reverse dutch auction (price increases over time)", async () => {
      // Migrated from contract test: test_Doc_ReverseDutchAuction
      // Contract tests at blocks 0, 100, 199 with 200-block curve starting at 2x
      // SDK tests at blocks 1, 100, 199 (block 0 not possible due to auto-mining)
      //
      // priceCurve[0] = (200 << 240) | 2e18  -> 200 blocks from 2x to 1x
      const priceCurve = [
        encodePriceCurveElement(200, BASE_SCALING_FACTOR.mul(2)), // 2e18
      ];

      const inputAmount = AMOUNT;
      const outputMinAmount = AMOUNT;

      // Helper to create and execute order at specific block
      const executeAtBlock = async (
        targetBlocksElapsed: number,
        nonceOffset: number,
        auctionStart: number
      ) => {
        const orderClass = new HybridOrderBuilder(
          chainId,
          reactor.address,
          resolver.address,
          permit2.address
        )
          .cosigner(ethers.constants.AddressZero)
          .deadline(futureDeadline)
          .swapper(swapperAddress)
          .nonce(NONCE.add(nonceOffset))
          .auctionResolver(resolverAddress)
          .preExecutionHook(hookAddress, "0x")
          .postExecutionHook(ethers.constants.AddressZero, "0x")
          .input({
            token: tokenIn.address,
            maxAmount: inputAmount,
          })
          .output({
            token: tokenOut.address,
            minAmount: outputMinAmount,
            recipient: swapperAddress,
          })
          .auctionStartBlock(BigNumber.from(auctionStart))
          .baselinePriorityFee(BigNumber.from(0))
          .scalingFactor(BASE_SCALING_FACTOR)
          .priceCurve(priceCurve)
          .buildPartial();

        const { domain, types, values } = orderClass.permitData();
        const signature = await swapper._signTypedData(domain, types, values);

        // Advance blocks if needed
        const currentBlock = await ethers.provider.getBlockNumber();
        const targetBlock = auctionStart + targetBlocksElapsed - 1; // -1 because execute mines a block
        for (let i = currentBlock; i < targetBlock; i++) {
          await ethers.provider.send("evm_mine", []);
        }

        const balanceBefore = await tokenOut.balanceOf(swapperAddress);
        const tx = await reactor
          .connect(filler)
          .execute({ order: orderClass.serialize(), sig: signature });
        const receipt = await tx.wait();
        const balanceAfter = await tokenOut.balanceOf(swapperAddress);

        return {
          output: balanceAfter.sub(balanceBefore),
          executionBlock: receipt.blockNumber,
          blocksElapsed: receipt.blockNumber - auctionStart,
        };
      };

      // Test 1: At block 1 (contract tests block 0, but SDK can't due to auto-mining)
      // Contract at block 0: 2x
      // SDK at block 1: 2.0 - (2.0 - 1.0) * (1/200) = 1.995
      const auctionStartBlock1 = await ethers.provider.getBlockNumber();
      const result1 = await executeAtBlock(1, 0, auctionStartBlock1);

      expect(result1.blocksElapsed).to.equal(1, "First execution should be at block 1");
      const expectedScaling1 = BASE_SCALING_FACTOR.mul(1995).div(1000); // 1.995e18
      const expectedOutput1 = outputMinAmount.mul(expectedScaling1).add(BASE_SCALING_FACTOR).sub(1).div(BASE_SCALING_FACTOR);
      expectThreshold(result1.output, expectedOutput1, outputMinAmount.div(1000)); // 0.1% threshold

      // Test 2: At block 100 (midway) - should be 1.5x
      // Expected: 2.0 - (2.0 - 1.0) * (100/200) = 1.5
      const auctionStartBlock2 = await ethers.provider.getBlockNumber();
      const result2 = await executeAtBlock(100, 1, auctionStartBlock2);

      expect(result2.blocksElapsed).to.equal(100, "Second execution should be at block 100");
      const expectedScaling2 = BASE_SCALING_FACTOR.mul(15).div(10); // 1.5e18
      const expectedOutput2 = outputMinAmount.mul(expectedScaling2).add(BASE_SCALING_FACTOR).sub(1).div(BASE_SCALING_FACTOR);
      expectThreshold(result2.output, expectedOutput2, outputMinAmount.div(1000)); // 0.1% threshold

      // Test 3: At block 199 (last valid block) - should be close to 1x
      // Expected: 2.0 - (2.0 - 1.0) * (199/200) = 1.005
      const auctionStartBlock3 = await ethers.provider.getBlockNumber();
      const result3 = await executeAtBlock(199, 2, auctionStartBlock3);

      expect(result3.blocksElapsed).to.equal(199, "Third execution should be at block 199");
      const expectedScaling3 = BASE_SCALING_FACTOR.mul(1005).div(1000); // 1.005e18
      const expectedOutput3 = outputMinAmount.mul(expectedScaling3).add(BASE_SCALING_FACTOR).sub(1).div(BASE_SCALING_FACTOR);
      expectThreshold(result3.output, expectedOutput3, outputMinAmount.div(1000)); // 0.1% threshold
    });

    it("executes order with step function plateaus", async () => {
      // Migrated from contract test: test_StepFunctionWithPlateaus
      // Contract tests at blocks 25, 50, 75, 100
      //
      // priceCurve[0] = (50 << 240) | 1.5e18  -> 50 blocks from 1.5x to 1.2x
      // priceCurve[1] = (50 << 240) | 1.2e18  -> 50 blocks from 1.2x to 1.0x
      // priceCurve[2] = (50 << 240) | 1e18   -> 50 blocks at 1.0x (to neutral)
      // Total duration: 150 blocks
      const priceCurve = [
        encodePriceCurveElement(50, BASE_SCALING_FACTOR.mul(15).div(10)), // 1.5e18
        encodePriceCurveElement(50, BASE_SCALING_FACTOR.mul(12).div(10)), // 1.2e18
        encodePriceCurveElement(50, BASE_SCALING_FACTOR),                  // 1.0e18
      ];

      const inputAmount = AMOUNT;
      const outputMinAmount = AMOUNT;

      // Use a large nonce offset to avoid conflicts with previous tests
      const baseNonce = NONCE.add(100);

      // Helper to create and execute order at specific block
      const executeAtBlock = async (
        targetBlocksElapsed: number,
        nonceOffset: number,
        auctionStart: number
      ) => {
        const orderClass = new HybridOrderBuilder(
          chainId,
          reactor.address,
          resolver.address,
          permit2.address
        )
          .cosigner(ethers.constants.AddressZero)
          .deadline(futureDeadline)
          .swapper(swapperAddress)
          .nonce(baseNonce.add(nonceOffset))
          .auctionResolver(resolverAddress)
          .preExecutionHook(hookAddress, "0x")
          .postExecutionHook(ethers.constants.AddressZero, "0x")
          .input({
            token: tokenIn.address,
            maxAmount: inputAmount,
          })
          .output({
            token: tokenOut.address,
            minAmount: outputMinAmount,
            recipient: swapperAddress,
          })
          .auctionStartBlock(BigNumber.from(auctionStart))
          .baselinePriorityFee(BigNumber.from(0))
          .scalingFactor(BASE_SCALING_FACTOR)
          .priceCurve(priceCurve)
          .buildPartial();

        const { domain, types, values } = orderClass.permitData();
        const signature = await swapper._signTypedData(domain, types, values);

        // Advance blocks if needed
        const currentBlock = await ethers.provider.getBlockNumber();
        const targetBlock = auctionStart + targetBlocksElapsed - 1; // -1 because execute mines a block
        for (let i = currentBlock; i < targetBlock; i++) {
          await ethers.provider.send("evm_mine", []);
        }

        const balanceBefore = await tokenOut.balanceOf(swapperAddress);
        const tx = await reactor
          .connect(filler)
          .execute({ order: orderClass.serialize(), sig: signature });
        const receipt = await tx.wait();
        const balanceAfter = await tokenOut.balanceOf(swapperAddress);

        return {
          output: balanceAfter.sub(balanceBefore),
          executionBlock: receipt.blockNumber,
          blocksElapsed: receipt.blockNumber - auctionStart,
        };
      };

      // Test 1: At block 25 (during first segment)
      // Expected: 1.5 - (1.5 - 1.2) * (25/50) = 1.35
      const auctionStartBlock1 = await ethers.provider.getBlockNumber();
      const result1 = await executeAtBlock(25, 0, auctionStartBlock1);

      expect(result1.blocksElapsed).to.equal(25, "First execution should be at block 25");
      const expectedScaling1 = BASE_SCALING_FACTOR.mul(135).div(100); // 1.35e18
      const expectedOutput1 = outputMinAmount.mul(expectedScaling1).add(BASE_SCALING_FACTOR).sub(1).div(BASE_SCALING_FACTOR);
      expect(result1.output).to.equal(expectedOutput1);

      // Test 2: At block 50 (start of second segment)
      // Expected: 1.2 - (1.2 - 1.0) * (0/50) = 1.2
      const auctionStartBlock2 = await ethers.provider.getBlockNumber();
      const result2 = await executeAtBlock(50, 1, auctionStartBlock2);

      expect(result2.blocksElapsed).to.equal(50, "Second execution should be at block 50");
      const expectedScaling2 = BASE_SCALING_FACTOR.mul(12).div(10); // 1.2e18
      const expectedOutput2 = outputMinAmount.mul(expectedScaling2).add(BASE_SCALING_FACTOR).sub(1).div(BASE_SCALING_FACTOR);
      expect(result2.output).to.equal(expectedOutput2);

      // Test 3: At block 75 (halfway through second segment)
      // Expected: 1.2 - (1.2 - 1.0) * (25/50) = 1.1
      const auctionStartBlock3 = await ethers.provider.getBlockNumber();
      const result3 = await executeAtBlock(75, 2, auctionStartBlock3);

      expect(result3.blocksElapsed).to.equal(75, "Third execution should be at block 75");
      const expectedScaling3 = BASE_SCALING_FACTOR.mul(11).div(10); // 1.1e18
      const expectedOutput3 = outputMinAmount.mul(expectedScaling3).add(BASE_SCALING_FACTOR).sub(1).div(BASE_SCALING_FACTOR);
      expect(result3.output).to.equal(expectedOutput3);

      // Test 4: At block 100 (start of third segment)
      // Expected: 1.0 - (1.0 - 1.0) * (0/50) = 1.0
      const auctionStartBlock4 = await ethers.provider.getBlockNumber();
      const result4 = await executeAtBlock(100, 3, auctionStartBlock4);

      expect(result4.blocksElapsed).to.equal(100, "Fourth execution should be at block 100");
      const expectedScaling4 = BASE_SCALING_FACTOR; // 1.0e18
      const expectedOutput4 = outputMinAmount.mul(expectedScaling4).add(BASE_SCALING_FACTOR).sub(1).div(BASE_SCALING_FACTOR);
      expect(result4.output).to.equal(expectedOutput4);
    });
  });

  describe("Supplemental Price Curve Tests", () => {
    it("executes order with cosigner supplemental price curve", async () => {
      // Migrated from contract test: test_CosignerSupplementalPriceCurve
      // This test verifies that the cosigner can provide a supplemental price curve
      // that modifies the base price curve.
      //
      // Note: SDK tests differ from contract tests in block timing:
      // - Contract tests (Foundry): execute at same block as auctionStartBlock
      // - SDK tests (Hardhat): execute at auctionStartBlock + 1 due to auto-mining

      // Ensure swapper has enough tokenIn and approval for this test
      await tokenIn.mint(swapperAddress, AMOUNT.mul(10));
      await tokenIn
        .connect(swapper)
        .approve(permit2.address, ethers.constants.MaxUint256);

      // Ensure filler has enough tokens and approval for this test
      await tokenOut.mint(fillerAddress, AMOUNT.mul(10));
      await tokenOut
        .connect(filler)
        .approve(reactor.address, ethers.constants.MaxUint256);

      // Use a large nonce offset to avoid conflicts with previous tests
      const testNonce = NONCE.add(200);

      // Get current block and set auctionStartBlock far in the future (will be overridden by cosigner)
      const farFutureBlock = (await ethers.provider.getBlockNumber()) + 1000;

      // Base curve: 1.2x for 100 blocks (decays from 1.2x to 1.0x)
      const baseCurve = [
        encodePriceCurveElement(100, BASE_SCALING_FACTOR.mul(12).div(10)), // 1.2e18
      ];

      // Supplemental curve: adds 0.1x (combined at block 0: 1.3x)
      // Formula: combinedScaling = baseCurveScaling + supplementalScaling - 1e18
      // Contract test uses PriceCurveLib.create(0, 1.1e18) which encodes as (0 << 240) | 1.1e18
      const supplementalCurve = [
        encodePriceCurveElement(0, BASE_SCALING_FACTOR.mul(11).div(10)), // (0, 1.1e18)
      ];

      // Build order with neutral scalingFactor and price curve
      // The price curve provides the actual scaling behavior
      const partialOrder = new HybridOrderBuilder(
        chainId,
        reactor.address,
        resolver.address,
        permit2.address
      )
        .cosigner(cosignerAddress)
        .deadline(futureDeadline)
        .swapper(swapperAddress)
        .nonce(testNonce)
        .auctionResolver(resolverAddress)
        .preExecutionHook(hookAddress, "0x")
        .postExecutionHook(ethers.constants.AddressZero, "0x")
        .input({
          token: tokenIn.address,
          maxAmount: AMOUNT,
        })
        .output({
          token: tokenOut.address,
          minAmount: AMOUNT,
          recipient: swapperAddress,
        })
        .auctionStartBlock(BigNumber.from(farFutureBlock))
        .baselinePriorityFee(BigNumber.from(0))
        .scalingFactor(BASE_SCALING_FACTOR) // Neutral
        .priceCurve(baseCurve);

      // Cosigner overrides the auction start to current block and provides supplemental curve
      const auctionTargetBlock = await ethers.provider.getBlockNumber();
      const cosignerData = getCosignerData(BigNumber.from(auctionTargetBlock), supplementalCurve);
      const order = partialOrder.cosignerData(cosignerData).buildPartial();

      const cosignerHash = order.cosignatureHash(cosignerData);
      const cosignatureObj = await cosigner._signingKey().signDigest(cosignerHash);
      const cosignature = ethers.utils.joinSignature(cosignatureObj);

      const orderClass = HybridOrderBuilder.fromOrder(order)
        .cosignerData(cosignerData)
        .cosignature(cosignature)
        .build();

      const { domain, types, values } = orderClass.permitData();
      const signature = await swapper._signTypedData(domain, types, values);

      const swapperTokenOutBefore = await tokenOut.balanceOf(swapperAddress);

      const tx = await reactor
        .connect(filler)
        .execute({ order: orderClass.serialize(), sig: signature });
      const receipt = await tx.wait();

      const swapperTokenOutAfter = await tokenOut.balanceOf(swapperAddress);
      const actualOutput = swapperTokenOutAfter.sub(swapperTokenOutBefore);

      // BLOCK ASSERTION: Verify execution happened at auctionTargetBlock + 1
      const executionBlock = receipt.blockNumber;
      const blocksElapsed = executionBlock - auctionTargetBlock;
      expect(blocksElapsed).to.equal(1, "Execution should be at block 1 (auctionTargetBlock + 1)");

      // Execute happens at block+1 (cosigner's auctionTargetBlock + 1) because auto-mining advances block
      // Base curve at block 1: 1.2 - (1.2 - 1.0) * (1/100) = 1.198
      // Supplemental at block 1: still 1.1 (duration=0 element)
      // Combined: 1.198 + 1.1 - 1.0 = 1.298
      //
      // In contract test at block 0: 1.2 + 1.1 - 1.0 = 1.3
      // The 0.002 difference (1.3 vs 1.298) is exactly due to 1 block of decay on base curve
      const baseCurveAtBlock1 = BASE_SCALING_FACTOR.mul(12).div(10).sub(
        BASE_SCALING_FACTOR.mul(2).div(10).div(100)
      ); // 1.198e18
      const supplementalScaling = BASE_SCALING_FACTOR.mul(11).div(10); // 1.1e18
      const expectedScaling = baseCurveAtBlock1.add(supplementalScaling).sub(BASE_SCALING_FACTOR);
      const expectedOutput = AMOUNT.mul(expectedScaling).add(BASE_SCALING_FACTOR).sub(1).div(BASE_SCALING_FACTOR);

      // Verify the output is approximately 1.298x (allowing small rounding differences)
      expectThreshold(actualOutput, expectedOutput, AMOUNT.div(1000)); // 0.1% threshold

      // Additional verification: If we were at block 0 (like contract test), output would be 1.3x
      const baseCurveAtBlock0 = BASE_SCALING_FACTOR.mul(12).div(10); // 1.2e18
      const expectedScalingAtBlock0 = baseCurveAtBlock0.add(supplementalScaling).sub(BASE_SCALING_FACTOR); // 1.3e18
      const expectedOutputAtBlock0 = AMOUNT.mul(expectedScalingAtBlock0).add(BASE_SCALING_FACTOR).sub(1).div(BASE_SCALING_FACTOR);

      // Actual output should be LESS than block 0 output (since price decays over time in exact-in)
      expect(actualOutput.lt(expectedOutputAtBlock0)).to.equal(true,
        "Output at block 1 should be less than theoretical block 0 output due to price decay");
    });
  });
});
