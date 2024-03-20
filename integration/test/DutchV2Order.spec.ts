import hre, { ethers } from 'hardhat';
import { expect } from 'chai';
import { BigNumber, Signer } from 'ethers';

import { BlockchainTime } from './utils/time';

import V2DutchOrderReactorAbi from '../../abis/V2DutchOrderReactor.json';
import Permit2Abi from '../../abis/Permit2.json';
import MockERC20Abi from '../../abis/MockERC20.json';

import {
  Permit2,
  V2DutchOrderReactor,
  MockERC20,
} from '../../src/contracts';
import { V2DutchOrderBuilder, CosignerData } from '../../';

describe('DutchV2Order', () => {
  let reactor: V2DutchOrderReactor;
  let permit2: Permit2;
  let chainId: number;
  let swapper: ethers.Wallet;
  let cosigner: ethers.Wallet;
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

  it('executes a serialized order with no decay', async () => {
    const amount = ethers.utils.parseEther("10");
    const deadline = await new BlockchainTime().secondsFromNow(1000);
    const order = new V2DutchOrderBuilder(
      chainId,
      reactor.address,
      permit2.address
    )
      .cosigner(cosigner.address)
      .deadline(deadline)
      .swapper(swapper.address)
      .nonce(BigNumber.from(100))
      .input({
        token: tokenIn.address,
        startAmount: amount,
        endAmount: amount,
      })
      .output({
        token: tokenOut.address,
        startAmount: amount,
        endAmount: amount,
        recipient: swapper.address,
      })
      .buildPartial();

    const { domain, types, values } = order.permitData();
    const signature = await swapper._signTypedData(domain, types, values);

    const cosignerData: CosignerData = {
      decayStartTime: deadline - 100,
      decayEndTime: deadline,
      exclusiveFiller: ethers.constants.AddressZero,
      exclusivityOverrideBps: BigNumber.from(0),
      inputOverride: amount,
      outputOverrides: [amount],
    };
    const cosignerHash = order.cosignatureHash(cosignerData);
    const cosignature = ethers.utils.joinSignature(await cosigner._signingKey().signDigest(cosignerHash));
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
      .execute(
        { order: fullOrder.serialize(), sig: signature },
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
});
