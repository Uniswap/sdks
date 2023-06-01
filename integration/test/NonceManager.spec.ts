import hre, { ethers } from 'hardhat';
import { expect } from 'chai';

import { Signer, Wallet, BigNumber } from 'ethers';
import { PermitTransferFrom, SignatureTransfer } from '@uniswap/permit2-sdk';

import Permit2Abi from '../../abis/Permit2.json';

import { Permit2 } from '../../src/contracts';
import {
  NonceManager,
} from '../../';

describe('NonceManager', () => {
  let permit2: Permit2;
  let wallet: Wallet;
  let nonceManager: NonceManager;
  let chainId: number;
  let admin: Signer;

  before(async () => {
    [admin] = await ethers.getSigners();
    chainId = hre.network.config.chainId || 1;

    const permit2Factory = await ethers.getContractFactory(
      Permit2Abi.abi,
      Permit2Abi.bytecode
    );
    permit2 = (await permit2Factory.deploy()) as Permit2;

    nonceManager = new NonceManager(
      ethers.provider,
      chainId,
      permit2.address
    );

    wallet = ethers.Wallet.createRandom().connect(ethers.provider);
    await admin.sendTransaction({
      to: await wallet.getAddress(),
      value: BigNumber.from(10).pow(18),
    });
  });

  it('fetches and increments nonces', async () => {
    for (let i = 0; i < 512; i++) {
      expect(
        (await nonceManager.useNonce(await wallet.getAddress())).toString()
      ).to.equal(i.toString());
    }
  });

  it('fresh instance refetches 0', async () => {
    const newManager = new NonceManager(
      ethers.provider,
      chainId,
      permit2.address
    );
    expect(
      (await newManager.useNonce(await wallet.getAddress())).toString()
    ).to.equal('0');
  });

  it('fetches on-chain used nonces', async () => {
    await sendPermit(BigNumber.from(0));
    const newManager = new NonceManager(
      ethers.provider,
      chainId,
      permit2.address
    );
    expect(
      (await newManager.useNonce(await wallet.getAddress())).toString()
    ).to.equal('1');
  });

  it('properly returns isUsed', async () => {
    const newManager = new NonceManager(
      ethers.provider,
      chainId,
      permit2.address
    );
    expect(
      await newManager.isUsed(await wallet.getAddress(), BigNumber.from(1234))
    ).to.equal(false);

    expect(
      await newManager.isUsed(await wallet.getAddress(), BigNumber.from(992343))
    ).to.equal(false);

    await sendPermit(BigNumber.from(1234));

    expect(
      await newManager.isUsed(await wallet.getAddress(), BigNumber.from(1234))
    ).to.equal(true);

    expect(
      await newManager.isUsed(await wallet.getAddress(), BigNumber.from(992343))
    ).to.equal(false);

    await sendPermit(BigNumber.from(992343));

    expect(
      await newManager.isUsed(await wallet.getAddress(), BigNumber.from(992343))
    ).to.equal(true);
  });

  it('ignores high on-chain used nonces', async () => {
    await sendPermit(BigNumber.from(512));
    await sendPermit(BigNumber.from(513));
    await sendPermit(BigNumber.from(514));
    await sendPermit(BigNumber.from(3));
    await sendPermit(BigNumber.from(4));
    const newManager = new NonceManager(
      ethers.provider,
      chainId,
      permit2.address
    );
    expect(
      (await newManager.useNonce(await wallet.getAddress())).toString()
    ).to.equal('1');

    expect(
      (await newManager.useNonce(await wallet.getAddress())).toString()
    ).to.equal('2');
    expect(
      (await newManager.useNonce(await wallet.getAddress())).toString()
    ).to.equal('5');
  });

  const sendPermit = async (nonce: BigNumber) => {
    const deadline = Math.floor(new Date().getTime() / 1000) + 1000;

    // swapper fills their own order
    const permit: PermitTransferFrom = {
      permitted: {
        token: '0x0000000000000000000000000000000000000000',
        amount: ethers.utils.parseEther('1'),
      },
      spender: await admin.getAddress(),
      nonce,
      deadline,
    };
    const { domain, types, values } = SignatureTransfer.getPermitData(permit, permit2.address, chainId);
    const signature = await wallet._signTypedData(domain, types, values);
    await permit2["permitTransferFrom(((address,uint256),uint256,uint256),(address,uint256),address,bytes)"](
      permit,
      {
        to: await admin.getAddress(),
        requestedAmount: ethers.utils.parseEther('1'),
      },
      await wallet.getAddress(),
      signature
    );
  };
});
