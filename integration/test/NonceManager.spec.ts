import hre, { ethers } from 'hardhat';
import { splitSignature } from '@ethersproject/bytes';
import { expect } from 'chai';

import { Signer, Wallet, BigNumber } from 'ethers';

import PermitPostAbi from '../../abis/PermitPost.json';

import { PermitPost } from '../../src/contracts';
import {
  NonceManager,
  PermitPost as PermitPostLib,
  PermitInfo,
  SigType,
} from '../../';

describe('NonceManager', () => {
  let permitPost: PermitPost;
  let permitPostLib: PermitPostLib;
  let wallet: Wallet;
  let nonceManager: NonceManager;
  let chainId: number;
  let admin: Signer;

  before(async () => {
    [admin] = await ethers.getSigners();
    chainId = hre.network.config.chainId || 1;

    const permitPostFactory = await ethers.getContractFactory(
      PermitPostAbi.abi,
      PermitPostAbi.bytecode
    );
    permitPost = (await permitPostFactory.deploy()) as PermitPost;
    permitPostLib = new PermitPostLib(chainId, permitPost.address);

    nonceManager = new NonceManager(
      ethers.provider,
      chainId,
      permitPost.address
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
      permitPost.address
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
      permitPost.address
    );
    expect(
      (await newManager.useNonce(await wallet.getAddress())).toString()
    ).to.equal('1');
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
      permitPost.address
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
    // maker fills their own order
    const permit: PermitInfo = {
      sigType: SigType.Unordered,
      tokens: [],
      spender: await admin.getAddress(),
      witness: ethers.constants.HashZero,
      deadline,
      nonce,
    };
    const { domain, types, values } = permitPostLib.getPermitData(permit);
    const signature = await wallet._signTypedData(domain, types, values);
    const { v, r, s } = splitSignature(signature);
    await permitPost.unorderedTransferFrom(
      {
        tokens: [],
        spender: await admin.getAddress(),
        deadline,
        witness: ethers.constants.HashZero,
      },
      [],
      [],
      [],
      nonce,
      { v, r, s }
    );
  };
});
