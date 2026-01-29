import { BigNumber, Signer, Wallet } from "ethers";
import hre, { ethers } from "hardhat";
import Permit2Abi from "../../abis/Permit2.json";
import ReactorAbi from "../../abis/Reactor.json";
import HybridAuctionResolverAbi from "../../abis/HybridAuctionResolver.json";
import TokenTransferHookAbi from "../../abis/TokenTransferHook.json";
import OrderQuoterV4Abi from "../../abis/OrderQuoterV4.json";
import MockERC20Abi from "../../abis/MockERC20.json";
import {
  Permit2,
  Reactor,
  HybridAuctionResolver,
  TokenTransferHook,
  MockERC20,
  OrderQuoterV4,
} from "../../src/contracts";
import { BlockchainTime } from "./utils/time";
import { HybridOrderBuilder } from "../../src/builder/HybridOrderBuilder";
import { expect } from "chai";
import {
  V4OrderValidator,
  V4OrderQuoter,
  OrderValidation,
} from "../../src/utils";
import { getCancelSingleParams } from "../../";
import { UnsignedHybridOrder } from "../../src/order/v4/HybridOrder";

describe("V4OrderValidator", () => {
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
  let quoter: OrderQuoterV4;
  let validator: V4OrderValidator;
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

    // Deploy OrderQuoterV4
    const quoterFactory = await ethers.getContractFactory(
      OrderQuoterV4Abi.abi,
      OrderQuoterV4Abi.bytecode
    );
    quoter = (await quoterFactory.deploy()) as OrderQuoterV4;

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

    // Create validator with deployed quoter
    validator = new V4OrderValidator(ethers.provider, chainId, quoter.address);
  });

  afterEach(() => {
    NONCE = NONCE.add(1);
  });

  describe("Quote", () => {
    it("quotes a valid order", async () => {
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
        .auctionStartBlock(BigNumber.from(0))
        .baselinePriorityFee(BigNumber.from(0))
        .scalingFactor(BASE_SCALING_FACTOR)
        .priceCurve([])
        .buildPartial();

      const { domain, types, values } = order.permitData();
      const signature = await swapper._signTypedData(domain, types, values);

      const quoterLib = new V4OrderQuoter(
        ethers.provider,
        chainId,
        quoter.address
      );
      const { validation, quote } = await quoterLib.quote({ order, signature });
      expect(validation).to.equal(OrderValidation.OK);
      expect(quote).to.not.be.undefined;

      expect(quote!.input.amount.toString()).to.equal(AMOUNT.toString());
    });
  });

  describe("Validate", () => {
    it("validates a valid order", async () => {
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
        .auctionStartBlock(BigNumber.from(0))
        .baselinePriorityFee(BigNumber.from(0))
        .scalingFactor(BASE_SCALING_FACTOR)
        .priceCurve([])
        .buildPartial();

      const { domain, types, values } = order.permitData();
      const signature = await swapper._signTypedData(domain, types, values);

      expect(await validator.validate({ order, signature })).to.equal(
        OrderValidation.OK
      );
    });

    it("validates a filled order", async () => {
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
        .auctionStartBlock(BigNumber.from(0))
        .baselinePriorityFee(BigNumber.from(0))
        .scalingFactor(BASE_SCALING_FACTOR)
        .priceCurve([])
        .buildPartial();

      const { domain, types, values } = order.permitData();
      const signature = await swapper._signTypedData(domain, types, values);

      // Execute the order to consume the nonce
      const res = await reactor
        .connect(filler)
        .execute({ order: order.serialize(), sig: signature });
      await res.wait();

      // Validate should return NonceUsed
      expect(await validator.validate({ order, signature })).to.equal(
        OrderValidation.NonceUsed
      );
    });

    it("validates an order with insufficient funds", async () => {
      // Use an amount greater than what swapper has
      const largeAmount = AMOUNT.mul(1000);
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
          maxAmount: largeAmount,
        })
        .output({
          token: tokenOut.address,
          minAmount: AMOUNT,
          recipient: swapperAddress,
        })
        .auctionStartBlock(BigNumber.from(0))
        .baselinePriorityFee(BigNumber.from(0))
        .scalingFactor(BASE_SCALING_FACTOR)
        .priceCurve([])
        .buildPartial();

      const { domain, types, values } = order.permitData();
      const signature = await swapper._signTypedData(domain, types, values);

      expect(await validator.validate({ order, signature })).to.equal(
        OrderValidation.InsufficientFunds
      );
    });

    it("validates an expired order", async () => {
      const deadline = Math.floor(new Date().getTime() / 1000) + 1;
      const info = new HybridOrderBuilder(
        chainId,
        reactor.address,
        resolver.address,
        permit2.address
      )
        .cosigner(ethers.constants.AddressZero)
        .deadline(deadline)
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
        .auctionStartBlock(BigNumber.from(0))
        .baselinePriorityFee(BigNumber.from(0))
        .scalingFactor(BASE_SCALING_FACTOR)
        .priceCurve([])
        .buildPartial().info;

      const order = new UnsignedHybridOrder(
        { ...info, deadline: deadline - 100 },
        chainId,
        resolverAddress,
        permit2.address
      );

      const { domain, types, values } = order.permitData();
      const signature = await swapper._signTypedData(domain, types, values);

      expect(await validator.validate({ order, signature })).to.equal(
        OrderValidation.Expired
      );
    });

    it("validates an order before and after expiry", async () => {
      const currentBlock = await ethers.provider.getBlock("latest");
      const deadline = currentBlock.timestamp + 1000;
      const info = new HybridOrderBuilder(
        chainId,
        reactor.address,
        resolver.address,
        permit2.address
      )
        .cosigner(ethers.constants.AddressZero)
        .deadline(deadline)
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
        .auctionStartBlock(BigNumber.from(0))
        .baselinePriorityFee(BigNumber.from(0))
        .scalingFactor(BASE_SCALING_FACTOR)
        .priceCurve([])
        .buildPartial().info;

      const order = new UnsignedHybridOrder(
        info,
        chainId,
        resolverAddress,
        permit2.address
      );

      const { domain, types, values } = order.permitData();
      const signature = await swapper._signTypedData(domain, types, values);

      expect(await validator.validate({ order, signature })).to.equal(
        OrderValidation.OK
      );

      const snapshot = await hre.network.provider.send("evm_snapshot");

      await hre.network.provider.send("evm_setNextBlockTimestamp", [
        deadline + 1,
      ]);
      await hre.network.provider.send("evm_mine");
      expect(await validator.validate({ order, signature })).to.equal(
        OrderValidation.Expired
      );

      await hre.network.provider.send("evm_revert", [snapshot]);
    });

    it("validates a canceled order", async () => {
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
        .auctionStartBlock(BigNumber.from(0))
        .baselinePriorityFee(BigNumber.from(0))
        .scalingFactor(BASE_SCALING_FACTOR)
        .priceCurve([])
        .buildPartial();

      const { domain, types, values } = order.permitData();
      const signature = await swapper._signTypedData(domain, types, values);

      // Cancel the order by invalidating the nonce
      const { word, mask } = getCancelSingleParams(NONCE);
      await permit2.connect(swapper).invalidateUnorderedNonces(word, mask);

      expect(await validator.validate({ order, signature })).to.equal(
        OrderValidation.NonceUsed
      );
    });

    it("validates an order with invalid cosignature", async () => {
      // Build a cosigned order with an INVALID cosignature
      // The cosigner is set, cosignerData is provided, but the cosignature is wrong
      const invalidCosignature = "0x" + "00".repeat(64) + "1b"; // Invalid 65-byte signature

      const order = new HybridOrderBuilder(
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
        .auctionStartBlock(BigNumber.from(0))
        .baselinePriorityFee(BigNumber.from(0))
        .scalingFactor(BASE_SCALING_FACTOR)
        .priceCurve([])
        .cosignerData({
          auctionTargetBlock: BigNumber.from(0),
          supplementalPriceCurve: [],
          exclusiveFiller: ethers.constants.AddressZero,
          exclusivityOverrideBps: BigNumber.from(0),
          exclusivityEndBlock: BigNumber.from(0),
        })
        .cosignature(invalidCosignature)
        .build();

      const { domain, types, values } = order.permitData();
      const signature = await swapper._signTypedData(domain, types, values);

      // Order has invalid cosignature - should fail validation
      const validation = await validator.validate({ order, signature });
      expect(validation).to.equal(OrderValidation.InvalidCosignature);
    });
  });
});
