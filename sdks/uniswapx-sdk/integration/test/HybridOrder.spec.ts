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
import { HybridOrderClass } from "../../src/order/v4/HybridOrder";
import { HybridOrder, HybridCosignerData } from "../../src/order/v4/types";

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
        .baselinePriorityFeeWei(BigNumber.from(0))
        .scalingFactor(BASE_SCALING_FACTOR) // Neutral scaling
        .priceCurve([])
        .buildPartial();

      expect(order.order.info.deadline).to.eq(futureDeadline);
      expect(order.order.info.swapper).to.eq(swapperAddress);
      expect(order.order.info.nonce).to.eq(NONCE);
      expect(order.order.info.auctionResolver).to.eq(resolverAddress);
      expect(order.order.info.preExecutionHook).to.eq(hookAddress);
      expect(order.order.cosigner).to.eq(ethers.constants.AddressZero);
      expect(order.order.input.token).to.eq(tokenIn.address);
      expect(order.order.input.maxAmount).to.eq(AMOUNT);
      expect(order.order.outputs[0].token).to.eq(tokenOut.address);
      expect(order.order.outputs[0].minAmount).to.eq(AMOUNT);
      expect(order.order.scalingFactor).to.eq(BASE_SCALING_FACTOR);
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
        .baselinePriorityFeeWei(BigNumber.from(0))
        .scalingFactor(BASE_SCALING_FACTOR.mul(105).div(100))
        .priceCurve(priceCurve)
        .buildPartial();

      expect(order.order.priceCurve.length).to.eq(1);
      expect(order.order.priceCurve[0]).to.eq(priceCurve[0]);
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
        .baselinePriorityFeeWei(BigNumber.from(0))
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
        .baselinePriorityFeeWei(baselinePriorityFee)
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
        .baselinePriorityFeeWei(baselinePriorityFee)
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
        .baselinePriorityFeeWei(BigNumber.from(0))
        .scalingFactor(BASE_SCALING_FACTOR)
        .priceCurve([]);

      const currentBlock = await ethers.provider.getBlockNumber();
      const cosignerData = getCosignerData(BigNumber.from(currentBlock));

      const order = partialOrder
        .cosignerData(cosignerData)
        .buildPartial();

      const cosignerHash = order.cosignatureHash();
      const cosignatureObj = await cosigner._signingKey().signDigest(cosignerHash);
      const cosignature = ethers.utils.joinSignature(cosignatureObj);

      const orderClass = HybridOrderBuilder.fromOrder(order)
        .cosignature(cosignature)
        .build();

      const permit2DomainSeparator = await permit2.DOMAIN_SEPARATOR();
      const signingHash = orderClass.getPermitSigningHash(permit2DomainSeparator);
      const signatureObj = await swapper._signingKey().signDigest(signingHash);
      const signature = ethers.utils.joinSignature(signatureObj);

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
        .baselinePriorityFeeWei(BigNumber.from(0))
        .scalingFactor(BASE_SCALING_FACTOR)
        .priceCurve([])
        .buildPartial();

      const currentBlock = await ethers.provider.getBlockNumber();
      const cosignerData = getCosignerData(BigNumber.from(currentBlock));

      const partialWithCosignerData = HybridOrderBuilder.fromOrder(partialOrder)
        .cosignerData(cosignerData)
        .buildPartial();

      // Sign with WRONG cosigner (swapper instead of cosigner)
      const cosignerHash = partialWithCosignerData.cosignatureHash();
      const wrongCosignatureObj = await swapper._signingKey().signDigest(cosignerHash);
      const wrongCosignature = ethers.utils.joinSignature(wrongCosignatureObj);

      const orderClass = HybridOrderBuilder.fromOrder(partialWithCosignerData)
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
        .baselinePriorityFeeWei(BigNumber.from(0))
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
        .baselinePriorityFeeWei(BigNumber.from(0))
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
        .baselinePriorityFeeWei(BigNumber.from(0))
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
  });
});
