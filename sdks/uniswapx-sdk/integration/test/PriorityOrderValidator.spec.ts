import hre, { ethers } from "hardhat";
import { expect } from "chai";
import { Signer } from "ethers";

import PriorityOrderReactorAbi from "../../abis/PriorityOrderReactor.json";
import OrderQuoterAbi from "../../abis/OrderQuoter.json";
import MockERC20Abi from "../../abis/MockERC20.json";

import {
  OrderQuoter,
  Permit2,
  PriorityOrderReactor,
  MockERC20,
} from "../../src/contracts";
import {
  PriorityOrderBuilder,
  UnsignedPriorityOrder,
  CosignedPriorityOrder,
  OrderValidator,
  UniswapXOrderQuoter as OrderQuoterLib,
  OrderValidation,
  getCancelSingleParams,
  PERMIT2_MAPPING,
  PriorityCosignerData,
} from "../../dist/src";
import { deployAndReturnPermit2 } from "./utils/permit2";

const { BigNumber } = ethers;
const parseEther = ethers.utils.parseEther;

describe("PriorityOrderValidator", () => {
  let reactor: PriorityOrderReactor;
  let permit2: Permit2;
  let quoter: OrderQuoter;
  let chainId: number;
  let builder: PriorityOrderBuilder;
  let validator: OrderValidator;
  let tokenIn: MockERC20;
  let tokenOut: MockERC20;
  let admin: Signer;
  let filler: Signer;
  let cosigner: ethers.Wallet;
  let swapper: ethers.Wallet;
  let blockNumber: BigNumber;
  let swapperAddress: string;
  let cosignerAddress: string;

  beforeEach(async () => {
    [admin, filler, cosigner] = await ethers.getSigners();

    chainId = hre.network.config.chainId || 1;

    permit2 = await deployAndReturnPermit2(admin);

    const reactorFactory = await ethers.getContractFactory(
      PriorityOrderReactorAbi.abi,
      PriorityOrderReactorAbi.bytecode
    );
    reactor = (await reactorFactory.deploy(
      permit2.address,
      ethers.constants.AddressZero
    )) as PriorityOrderReactor;

    const orderQuoterFactory = await ethers.getContractFactory(
      OrderQuoterAbi.abi,
      OrderQuoterAbi.bytecode
    );
    quoter = (await orderQuoterFactory.deploy()) as OrderQuoter;
    builder = new PriorityOrderBuilder(
      chainId,
      reactor.address,
      permit2.address
    );

    swapper = ethers.Wallet.createRandom().connect(ethers.provider);
    swapperAddress = await swapper.getAddress();
    cosigner = ethers.Wallet.createRandom().connect(ethers.provider);
    cosignerAddress = await cosigner.getAddress();

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
    
    blockNumber = BigNumber.from(await ethers.provider.getBlockNumber());
  });

  const getCosignerData = (
    blockNumber: BigNumber,
    overrides: Partial<PriorityCosignerData> = {}
  ): PriorityCosignerData => {
    const defaultData: PriorityCosignerData = {
      auctionTargetBlock: blockNumber
    };
    return Object.assign(defaultData, overrides);
  };

  it("quotes a valid order", async () => {
    const deadline = Math.floor(new Date().getTime() / 1000) + 1000;
    const preBuildOrder = builder
      .deadline(deadline)
      .auctionStartBlock(blockNumber)
      .cosigner(cosignerAddress)
      .baselinePriorityFeeWei(BigNumber.from(0))
      .swapper(swapperAddress)
      .nonce(BigNumber.from(98))
      .input({
        token: tokenIn.address,
        amount: BigNumber.from("1000000"),
        mpsPerPriorityFeeWei: BigNumber.from(0)
      })
      .output({
        token: tokenOut.address,
        amount: BigNumber.from("1000000000000000000"),
        mpsPerPriorityFeeWei: BigNumber.from(1),
        recipient: "0x0000000000000000000000000000000000000000",
      });
    
    let unsignedPriorityOrder = preBuildOrder.buildPartial();
    
    const cosignerData = getCosignerData(blockNumber, {});
    const cosignerHash = unsignedPriorityOrder.cosignatureHash(cosignerData);
    const cosignature = ethers.utils.joinSignature(
      cosigner._signingKey().signDigest(cosignerHash)
    );

    const order = preBuildOrder
      .cosignerData(cosignerData)
      .cosignature(cosignature)
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
    const preBuildOrder = builder
      .deadline(deadline)
      .auctionStartBlock(blockNumber)
      .cosigner(cosignerAddress)
      .baselinePriorityFeeWei(BigNumber.from(0))
      .nonce(BigNumber.from(100))
      .swapper(swapperAddress)
      .input({
        token: tokenIn.address,
        amount: BigNumber.from("1000000"),
        mpsPerPriorityFeeWei: BigNumber.from(0)
      })
      .output({
        token: tokenOut.address,
        amount: parseEther('1'),
        mpsPerPriorityFeeWei: BigNumber.from(1),
        recipient: "0x0000000000000000000000000000000000000000",
      });

    let unsignedPriorityOrder = preBuildOrder.buildPartial();
    
    const cosignerData = getCosignerData(blockNumber, {});
    const cosignerHash = unsignedPriorityOrder.cosignatureHash(cosignerData);
    const cosignature = ethers.utils.joinSignature(
      cosigner._signingKey().signDigest(cosignerHash)
    );
  
    const order = preBuildOrder
        .cosignerData(cosignerData)
        .cosignature(cosignature)
        .build();

    const { domain, types, values } = order.permitData();
    const signature = await swapper._signTypedData(domain, types, values);

    expect(await validator.validate({ order, signature })).to.equal(
      OrderValidation.OK
    );
  });

  it("validates a valid order with auctionStartBlock in the future", async () => {
    const auctionStartBlock = blockNumber.add(10);
    const deadline = Math.floor(new Date().getTime() / 1000) + 1000;
    const preBuildOrder = builder
      .deadline(deadline)
      .auctionStartBlock(auctionStartBlock)
      .cosigner(cosignerAddress)
      .baselinePriorityFeeWei(BigNumber.from(0))
      .swapper(swapperAddress)
      .nonce(BigNumber.from(98))
      .input({
        token: tokenIn.address,
        amount: BigNumber.from("1000000"),
        mpsPerPriorityFeeWei: BigNumber.from(0)
      })
      .output({
        token: tokenOut.address,
        amount: BigNumber.from("1000000000000000000"),
        mpsPerPriorityFeeWei: BigNumber.from(1),
        recipient: "0x0000000000000000000000000000000000000000",
      });
    
    let unsignedPriorityOrder = preBuildOrder.buildPartial();
    
    const cosignerData = getCosignerData(auctionStartBlock, {});
    const cosignerHash = unsignedPriorityOrder.cosignatureHash(cosignerData);
    const cosignature = ethers.utils.joinSignature(
      cosigner._signingKey().signDigest(cosignerHash)
    );

    const order = preBuildOrder
      .cosignerData(cosignerData)
      .cosignature(cosignature)
      .build();

    const { domain, types, values } = order.permitData();
    const signature = await swapper._signTypedData(domain, types, values);

    expect(await validator.validate({ order, signature })).to.equal(
      OrderValidation.OrderNotFillable
    );
  });

  it("validates a filled order", async () => {
    const deadline = Math.floor(new Date().getTime() / 1000) + 1000;
    const preBuildOrder = builder
      .deadline(deadline)
      .auctionStartBlock(blockNumber)
      .cosigner(cosignerAddress)
      .baselinePriorityFeeWei(BigNumber.from(0))
      .nonce(BigNumber.from(100))
      .swapper(swapperAddress)
      .input({
        token: tokenIn.address,
        amount: parseEther('0.1'),
        mpsPerPriorityFeeWei: BigNumber.from(0)
      })
      .output({
        token: tokenOut.address,
        amount: parseEther('0.1'),
        mpsPerPriorityFeeWei: BigNumber.from(1),
        recipient: swapperAddress
      });

    let unsignedPriorityOrder = preBuildOrder.buildPartial();
    
    const cosignerData = getCosignerData(blockNumber, {});
    const cosignerHash = unsignedPriorityOrder.cosignatureHash(cosignerData);
    const cosignature = ethers.utils.joinSignature(
      cosigner._signingKey().signDigest(cosignerHash)
    );
  
    const order = preBuildOrder
        .cosignerData(cosignerData)
        .cosignature(cosignature)
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

  it("validates an order with insufficient funds", async () => {
    const deadline = Math.floor(new Date().getTime() / 1000) + 1000;
    const preBuildOrder = builder
      .deadline(deadline)
      .auctionStartBlock(blockNumber)
      .cosigner(cosignerAddress)
      .baselinePriorityFeeWei(BigNumber.from(0))
      .nonce(BigNumber.from(100))
      .swapper(swapperAddress)
      .input({
        token: tokenIn.address,
        amount: parseEther('2'),
        mpsPerPriorityFeeWei: BigNumber.from(0),
      })
      .output({
        token: tokenOut.address,
        amount: parseEther('1'),
        mpsPerPriorityFeeWei: BigNumber.from(1),
        recipient: "0x0000000000000000000000000000000000000000",
      });
    
    let unsignedPriorityOrder = preBuildOrder.buildPartial();
    const cosignerData = getCosignerData(blockNumber, {});
    const cosignerHash = unsignedPriorityOrder.cosignatureHash(cosignerData);
    const cosignature = ethers.utils.joinSignature(
      cosigner._signingKey().signDigest(cosignerHash)
    );

    const order = preBuildOrder
      .cosignerData(cosignerData)
      .cosignature(cosignature)
      .build();

    const { domain, types, values } = order.permitData();
    const signature = await swapper._signTypedData(domain, types, values);

    expect(await validator.validate({ order, signature })).to.equal(
      OrderValidation.InsufficientFunds
    );
  });

  it("validates an order with insufficient funds with auctionStartBlock in the future", async () => {
    const auctionStartBlock = blockNumber.add(10);
    const deadline = Math.floor(new Date().getTime() / 1000) + 1000;
    const preBuildOrder = builder
      .deadline(deadline)
      .auctionStartBlock(auctionStartBlock)
      .cosigner(cosignerAddress)
      .baselinePriorityFeeWei(BigNumber.from(0))
      .nonce(BigNumber.from(100))
      .swapper(swapperAddress)
      .input({
        token: tokenIn.address,
        amount: parseEther('2'),
        mpsPerPriorityFeeWei: BigNumber.from(0),
      })
      .output({
        token: tokenOut.address,
        amount: parseEther('1'),
        mpsPerPriorityFeeWei: BigNumber.from(1),
        recipient: "0x0000000000000000000000000000000000000000",
      });
    
    let unsignedPriorityOrder = preBuildOrder.buildPartial();
    const cosignerData = getCosignerData(auctionStartBlock, {});
    const cosignerHash = unsignedPriorityOrder.cosignatureHash(cosignerData);
    const cosignature = ethers.utils.joinSignature(
      cosigner._signingKey().signDigest(cosignerHash)
    );

    const order = preBuildOrder
      .cosignerData(cosignerData)
      .cosignature(cosignature)
      .build();

    const { domain, types, values } = order.permitData();
    const signature = await swapper._signTypedData(domain, types, values);

    // even though the auctionStartBlock is in the future, we expect to bubble up all other errors before that one
    expect(await validator.validate({ order, signature })).to.equal(
      OrderValidation.InsufficientFunds
    );
  });

  it("validates an expired order", async () => {
    const deadline = Math.floor(new Date().getTime() / 1000) + 100;
    const preBuildOrder = builder
      .deadline(deadline)
      .auctionStartBlock(blockNumber)
      .cosigner(cosignerAddress)
      .baselinePriorityFeeWei(BigNumber.from(0))
      .swapper(swapperAddress)
      .nonce(BigNumber.from(100))
      .input({
        token: tokenIn.address,
        amount: BigNumber.from("1000000"),
        mpsPerPriorityFeeWei: BigNumber.from(0)
      })
      .output({
        token: tokenOut.address,
        amount: BigNumber.from("1000000000000000000"),
        mpsPerPriorityFeeWei: BigNumber.from(1),
        recipient: "0x0000000000000000000000000000000000000000",
      });
    
    let unsignedPriorityOrder = preBuildOrder.buildPartial();

    const cosignerData = getCosignerData(blockNumber, {});
    const cosignerHash = unsignedPriorityOrder.cosignatureHash(cosignerData);
    const cosignature = ethers.utils.joinSignature(
      cosigner._signingKey().signDigest(cosignerHash)
    );

    const order = preBuildOrder
      .cosignerData(cosignerData)
      .cosignature(cosignature)
      .build();

    const { domain, types, values } = order.permitData();
    const signature = await swapper._signTypedData(domain, types, values);

    // Move the block time forward
    await hre.network.provider.send("evm_setNextBlockTimestamp", [deadline + 1]);
    await hre.network.provider.send("evm_mine");

    expect(await validator.validate({ order, signature })).to.equal(
      OrderValidation.Expired
    );
  });

  it("validates a canceled order", async () => {
    const deadline = Math.floor(new Date().getTime() / 1000) + 1;
    const preBuildOrder = builder
      .deadline(deadline)
      .auctionStartBlock(blockNumber)
      .cosigner(cosignerAddress)
      .baselinePriorityFeeWei(BigNumber.from(0))
      .nonce(BigNumber.from(7))
      .swapper(swapperAddress)
      .input({
        token: tokenIn.address,
        amount: BigNumber.from("1000000"),
        mpsPerPriorityFeeWei: BigNumber.from(0)
      })
      .output({
        token: tokenOut.address,
        amount: BigNumber.from("1000000000000000000"),
        mpsPerPriorityFeeWei: BigNumber.from(1),
        recipient: "0x0000000000000000000000000000000000000000",
      });
    
      let unsignedPriorityOrder = preBuildOrder.buildPartial();

      const cosignerData = getCosignerData(blockNumber, {});
      const cosignerHash = unsignedPriorityOrder.cosignatureHash(cosignerData);
      const cosignature = ethers.utils.joinSignature(
        cosigner._signingKey().signDigest(cosignerHash)
      );
  
      const order = preBuildOrder
        .cosignerData(cosignerData)
        .cosignature(cosignature)
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
