import hre, { ethers } from 'hardhat';
import { expect } from 'chai';
import { BigNumber, Signer } from 'ethers';

import { BlockchainTime } from './utils/time';

import ExclusiveDutchOrderReactorAbi from '../../abis/ExclusiveDutchOrderReactor.json';
import Permit2Abi from '../../abis/Permit2.json';
import MockERC20Abi from '../../abis/MockERC20.json';

import {
  Permit2,
  ExclusiveDutchOrderReactor,
  MockERC20,
} from '../../src/contracts';
import { DutchOrderBuilder } from '../../';

describe('DutchOrder', () => {
  const DIRECT_FILL = '0x0000000000000000000000000000000000000001';

  let reactor: ExclusiveDutchOrderReactor;
  let permit2: Permit2;
  let chainId: number;
  let swapper: ethers.Wallet;
  let tokenIn: MockERC20;
  let tokenOut: MockERC20;
  let admin: Signer;
  let filler: Signer;

  before(async () => {
    [admin, filler] = await ethers.getSigners();
    const permit2Factory = await ethers.getContractFactory(
      Permit2Abi.abi,
      Permit2Abi.bytecode
    );
    permit2 = (await permit2Factory.deploy()) as Permit2;

    const reactorFactory = await ethers.getContractFactory(
      ExclusiveDutchOrderReactorAbi.abi,
      ExclusiveDutchOrderReactorAbi.bytecode
    );
    reactor = (await reactorFactory.deploy(
      permit2.address,
      ethers.constants.AddressZero
    )) as ExclusiveDutchOrderReactor;

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
    tokenIn = (await tokenFactory.deploy('TEST A', 'ta', 18)) as MockERC20;

    tokenOut = (await tokenFactory.deploy('TEST B', 'tb', 18)) as MockERC20;

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
      .approve(reactor.address, ethers.constants.MaxUint256);
  });

  it('correctly builds an order', async () => {
    const amount = BigNumber.from(10).pow(18);
    const deadline = await new BlockchainTime().secondsFromNow(1000);
    const swapperAddress = await swapper.getAddress();
    const preBuildOrder = new DutchOrderBuilder(
      chainId,
      reactor.address,
      permit2.address
    )
      .deadline(deadline)
      .decayEndTime(deadline)
      .decayStartTime(deadline - 100)
      .swapper(swapperAddress)
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
        recipient: swapperAddress,
      });

    let order = preBuildOrder.build();

    expect(order.info.deadline).to.eq(deadline);
    expect(order.info.decayEndTime).to.eq(deadline);
    expect(order.info.decayStartTime).to.eq(deadline - 100);
    expect(order.info.swapper).to.eq(swapperAddress);
    expect(order.info.nonce.toNumber()).to.eq(100);

    expect(order.info.input.token).to.eq(tokenIn.address);
    expect(order.info.input.startAmount).to.eq(amount);
    expect(order.info.input.endAmount).to.eq(amount);

    const builtOutput = order.info.outputs[0];

    expect(builtOutput.token).to.eq(tokenOut.address);
    expect(builtOutput.startAmount).to.eq(amount);
    expect(builtOutput.endAmount.eq(BigNumber.from(10).pow(17).mul(9))).to.be
      .true;
    expect(builtOutput.recipient).to.eq(swapperAddress);

    order = preBuildOrder.nonFeeRecipient(ethers.constants.AddressZero, '0x1111111111111111111111111111111111111111').build();
    expect(order.info.outputs[0].recipient).to.eq(ethers.constants.AddressZero);
  });

  it('nonFeeRecipient updates recipient for non fee outputs', async () => {
    const amount = BigNumber.from(10).pow(18);
    const deadline = await new BlockchainTime().secondsFromNow(1000);
    const swapperAddress = await swapper.getAddress();
    const feeRecipient = '0x1111111111111111111111111111111111111111';
    const preBuildOrder = new DutchOrderBuilder(
      chainId,
      reactor.address,
      permit2.address
    )
      .deadline(deadline)
      .decayEndTime(deadline)
      .decayStartTime(deadline - 100)
      .swapper(swapperAddress)
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
        recipient: swapperAddress,
      })
      .output({
        token: tokenOut.address,
        startAmount: amount,
        endAmount: BigNumber.from(10).pow(17).mul(9),
        recipient: feeRecipient,
      });

    let order = preBuildOrder.build();

    expect(order.info.outputs[0].recipient).to.eq(swapperAddress);
    expect(order.info.outputs[1].recipient).to.eq(feeRecipient);

    order = preBuildOrder.nonFeeRecipient(ethers.constants.AddressZero, feeRecipient).build();
    expect(order.info.outputs[0].recipient).to.eq(ethers.constants.AddressZero);
    expect(order.info.outputs[1].recipient).to.eq(feeRecipient);
  });

  it('nonFeeRecipient updates recipient for all outputs if no feeRecipient given', async () => {
    const amount = BigNumber.from(10).pow(18);
    const deadline = await new BlockchainTime().secondsFromNow(1000);
    const swapperAddress = await swapper.getAddress();
    const feeRecipient = '0x1111111111111111111111111111111111111111';
    const preBuildOrder = new DutchOrderBuilder(
      chainId,
      reactor.address,
      permit2.address
    )
      .deadline(deadline)
      .decayEndTime(deadline)
      .decayStartTime(deadline - 100)
      .swapper(swapperAddress)
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
        recipient: swapperAddress,
      })
      .output({
        token: tokenOut.address,
        startAmount: amount,
        endAmount: BigNumber.from(10).pow(17).mul(9),
        recipient: feeRecipient,
      });

    let order = preBuildOrder.build();

    expect(order.info.outputs[0].recipient).to.eq(swapperAddress);
    expect(order.info.outputs[1].recipient).to.eq(feeRecipient);

    order = preBuildOrder.nonFeeRecipient(ethers.constants.AddressZero).build();
    expect(order.info.outputs[0].recipient).to.eq(ethers.constants.AddressZero);
    expect(order.info.outputs[1].recipient).to.eq(ethers.constants.AddressZero);
  });

  it('nonFeeRecipient fails if same as newRecipient', async () => {
    const amount = BigNumber.from(10).pow(18);
    const deadline = await new BlockchainTime().secondsFromNow(1000);
    const swapperAddress = await swapper.getAddress();
    const feeRecipient = '0x1111111111111111111111111111111111111111';
    const preBuildOrder = new DutchOrderBuilder(
      chainId,
      reactor.address,
      permit2.address
    )
      .deadline(deadline)
      .decayEndTime(deadline)
      .decayStartTime(deadline - 100)
      .swapper(swapperAddress)
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
        recipient: swapperAddress,
      })
      .output({
        token: tokenOut.address,
        startAmount: amount,
        endAmount: BigNumber.from(10).pow(17).mul(9),
        recipient: feeRecipient,
      });

    let order = preBuildOrder.build();

    expect(order.info.outputs[0].recipient).to.eq(swapperAddress);
    expect(order.info.outputs[1].recipient).to.eq(feeRecipient);

    expect(() => preBuildOrder.nonFeeRecipient(feeRecipient, feeRecipient).build())
      .to.throw("newRecipient must be different from feeRecipient");
  });

  it('executes a serialized order with no decay', async () => {
    const amount = BigNumber.from(10).pow(18);
    const deadline = await new BlockchainTime().secondsFromNow(1000);
    const order = new DutchOrderBuilder(
      chainId,
      reactor.address,
      permit2.address
    )
      .deadline(deadline)
      .decayEndTime(deadline)
      .decayStartTime(deadline - 100)
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
      .execute(
        { order: order.serialize(), sig: signature },
      );
    const receipt = await res.wait();
    expect(receipt.status).to.equal(1);
    expect(
      (await tokenIn.balanceOf(await swapper.getAddress())).toString()
    ).to.equal(swapperTokenInBalanceBefore.sub(amount).toString());
    expect(
      (await tokenIn.balanceOf(await filler.getAddress())).toString()
    ).to.equal(fillerTokenInBalanceBefore.add(amount).toString());
    expect(
      (await tokenOut.balanceOf(await swapper.getAddress())).toString()
    ).to.equal(swapperTokenOutBalanceBefore.add(amount).toString());
    expect(
      (await tokenOut.balanceOf(await filler.getAddress())).toString()
    ).to.equal(fillerTokenOutBalanceBefore.sub(amount).toString());
  });

  it('executes a serialized order with decay', async () => {
    const amount = BigNumber.from(10).pow(18);
    const time = new BlockchainTime();
    const deadline = await time.secondsFromNow(1000);
    const order = new DutchOrderBuilder(
      chainId,
      reactor.address,
      permit2.address
    )
      .deadline(deadline)
      .decayEndTime(deadline)
      .decayStartTime(deadline - 2000)
      .nonce(BigNumber.from(101))
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
      .execute(
        { order: order.serialize(), sig: signature },
      );
    const receipt = await res.wait();
    expect(receipt.status).to.equal(1);
    expect(
      (await tokenIn.balanceOf(await swapper.getAddress())).toString()
    ).to.equal(swapperTokenInBalanceBefore.sub(amount).toString());
    expect(
      (await tokenIn.balanceOf(await filler.getAddress())).toString()
    ).to.equal(fillerTokenInBalanceBefore.add(amount).toString());
    const amountOut = order.info.outputs[0].startAmount
      .add(order.info.outputs[0].endAmount)
      .div(2);
    // some variance in block timestamp so we need to use a threshold
    expectThreshold(
      await tokenOut.balanceOf(await swapper.getAddress()),
      swapperTokenOutBalanceBefore.add(amountOut),
      BigNumber.from(10).pow(15)
    );
    expectThreshold(
      await tokenOut.balanceOf(await filler.getAddress()),
      fillerTokenOutBalanceBefore.sub(amountOut),
      BigNumber.from(10).pow(15)
    );
  });

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
