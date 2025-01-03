import { expect } from "chai";
import { BigNumber, Contract, ethers } from "ethers";

import PriorityOrderReactorAbi from "../../abis/PriorityOrderReactor.json";
import OrderQuoterAbi from "../../abis/OrderQuoter.json";
import MockERC20Abi from "../../abis/MockERC20.json";

import {
  OrderQuoter,
  Permit2,
  PriorityOrderReactor,
  MockERC20,
  Permit2__factory,
} from "../../src/contracts";
import {
  PriorityOrderBuilder,
  OrderValidator,
  UniswapXOrderQuoter as OrderQuoterLib,
  OrderValidation,
  PriorityCosignerData,
  CosignedPriorityOrder,
} from "../../src";
import { StaticJsonRpcProvider } from "@ethersproject/providers";
import { REACTOR_ADDRESS_MAPPING, UNISWAPX_ORDER_QUOTER_MAPPING } from "../../src/constants";
import { parseEther } from "ethers/lib/utils";
import { PERMIT2_ADDRESS } from "@uniswap/permit2-sdk";

if(!process.env.FORK_URL_8453) {
  throw new Error("FORK_URL_8453 not defined in environment");
}

// Priority order integration tests do not run on hardhat because they require
// a full JsonRpcProvider which supports block overrides
describe("PriorityOrderValidator", () => {
  let reactor: PriorityOrderReactor;
  let permit2: Permit2;
  let quoter: OrderQuoter;
  let chainId: number;
  let builder: PriorityOrderBuilder;
  let validator: OrderValidator;
  let tokenIn: MockERC20;
  let cosigner: ethers.Wallet;
  let swapper: ethers.Wallet;
  let blockNumber: BigNumber;
  let swapperAddress: string;
  let cosignerAddress: string;

  const provider = new StaticJsonRpcProvider(process.env.FORK_URL_8453);
  const USDC_BASE = "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913";
  const ZERO_ADDRESS = ethers.constants.AddressZero; // tokenOut for simplicity

  beforeEach(async () => {
    chainId = 8453;

    permit2 = new Contract(PERMIT2_ADDRESS, Permit2__factory.abi, provider) as Permit2;
    reactor = new Contract(REACTOR_ADDRESS_MAPPING[chainId].Priority!, PriorityOrderReactorAbi.abi, provider) as PriorityOrderReactor;
    quoter = new Contract(UNISWAPX_ORDER_QUOTER_MAPPING[chainId], OrderQuoterAbi.abi, provider) as OrderQuoter;

    builder = new PriorityOrderBuilder(
      chainId,
      reactor.address,
      permit2.address
    );

    swapper = ethers.Wallet.createRandom().connect(provider);
    swapperAddress = await swapper.getAddress();
    cosigner = ethers.Wallet.createRandom().connect(provider);
    cosignerAddress = await cosigner.getAddress();

    validator = new OrderValidator(provider, chainId, quoter.address);

    tokenIn = new Contract(USDC_BASE, MockERC20Abi.abi, provider) as MockERC20;

    blockNumber = BigNumber.from(await provider.getBlockNumber());
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
        amount: BigNumber.from(0),
        mpsPerPriorityFeeWei: BigNumber.from(0)
      })
      .output({
        token: ZERO_ADDRESS,
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
      provider,
      chainId,
      quoter.address
    );
    const { validation, quote } = await quoterLib.quote({ order, signature });
    expect(validation).to.equal(OrderValidation.OK);
    if (!quote) {
      throw new Error("Invalid quote");
    }

    expect(quote.input.amount.toString()).to.equal("0");
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
        amount: BigNumber.from(0),
        mpsPerPriorityFeeWei: BigNumber.from(0)
      })
      .output({
        token: ZERO_ADDRESS,
        amount: BigNumber.from(0),
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
        amount: BigNumber.from(0),
        mpsPerPriorityFeeWei: BigNumber.from(0)
      })
      .output({
        token: ZERO_ADDRESS,
        amount: BigNumber.from(0),
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
      OrderValidation.OrderNotFillableYet
    );
  });

  it("validates an order with input and output scaling", async () => {
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
        amount: BigNumber.from(0),
        mpsPerPriorityFeeWei: BigNumber.from(0)
      })
      .output({
        token: ZERO_ADDRESS,
        amount: BigNumber.from(0),
        mpsPerPriorityFeeWei: BigNumber.from(1),
        recipient: "0x0000000000000000000000000000000000000000",
      });

    let unsignedPriorityOrder = preBuildOrder.buildPartial();
    
    const cosignerData = getCosignerData(blockNumber, {});
    const cosignerHash = unsignedPriorityOrder.cosignatureHash(cosignerData);
    const cosignature = ethers.utils.joinSignature(
      cosigner._signingKey().signDigest(cosignerHash)
    );
  
    let order = preBuildOrder
        .cosignerData(cosignerData)
        .cosignature(cosignature)
        .build();

    order = new CosignedPriorityOrder(
      Object.assign(order.info, {
        input: {
          token: tokenIn.address,
          amount: BigNumber.from(0),
          mpsPerPriorityFeeWei: BigNumber.from(1),
        },
      }),
      chainId,
      permit2.address
    )

    const { domain, types, values } = order.permitData();
    const signature = await swapper._signTypedData(domain, types, values);

    expect(await validator.validate({ order, signature })).to.equal(
      OrderValidation.InvalidOrderFields
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
        token: ZERO_ADDRESS,
        amount: BigNumber.from(0),
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
        token: ZERO_ADDRESS,
        amount: BigNumber.from(0),
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
    const deadline = Math.floor(new Date().getTime() / 1000) + 1;
    const preBuildOrder = builder
      .deadline(deadline)
      .auctionStartBlock(blockNumber)
      .cosigner(cosignerAddress)
      .baselinePriorityFeeWei(BigNumber.from(0))
      .swapper(swapperAddress)
      .nonce(BigNumber.from(100))
      .input({
        token: tokenIn.address,
        amount: BigNumber.from(0),
        mpsPerPriorityFeeWei: BigNumber.from(0)
      })
      .output({
        token: ZERO_ADDRESS,
        amount: BigNumber.from(0),
        mpsPerPriorityFeeWei: BigNumber.from(1),
        recipient: "0x0000000000000000000000000000000000000000",
      });


    const cosignerData = getCosignerData(blockNumber, {});
    const cosignerHash = preBuildOrder.buildPartial().cosignatureHash(cosignerData);
    const cosignature = ethers.utils.joinSignature(
      cosigner._signingKey().signDigest(cosignerHash)
    );

    let order = preBuildOrder
      .cosignerData(cosignerData)
      .cosignature(cosignature)
      .build();

    order = new CosignedPriorityOrder(
        Object.assign(order.info, {
          deadline: deadline - 100
        }),
        chainId,
        permit2.address
      )

    const { domain, types, values } = order.permitData();
    const signature = await swapper._signTypedData(domain, types, values);

    expect(await validator.validate({ order, signature })).to.equal(
      OrderValidation.Expired
    );
  });
});
