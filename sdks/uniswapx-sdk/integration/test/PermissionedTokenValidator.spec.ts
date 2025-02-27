import { expect } from 'chai';
import { ethers } from 'hardhat';
import { PermissionedTokenValidator } from '../../src/utils/PermissionedTokenValidator';
import { MockDSTokenInterface, Proxy } from '../../src/contracts';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { PERMISSIONED_TOKENS } from '../../src/constants';
import ProxyAbi from '../../abis/Proxy.json';
import MockDSTokenInterfaceAbi from '../../abis/MockDSTokenInterface.json';

describe('PermissionedTokenValidator', () => {
  let mockDSToken: MockDSTokenInterface;
  let mockProxy: Proxy;
  let owner: SignerWithAddress;
  let user1: SignerWithAddress;
  let user2: SignerWithAddress;
  let chainId: number;
  let originalTokens: typeof PERMISSIONED_TOKENS;

  before(async () => {
    [owner, user1, user2] = await ethers.getSigners();
    
    chainId = (await ethers.provider.getNetwork()).chainId;

    // Deploy mock token
    const mockDSTokenFactory = await ethers.getContractFactory(
      MockDSTokenInterfaceAbi.abi,
      MockDSTokenInterfaceAbi.bytecode
    );
    mockDSToken = (await mockDSTokenFactory.deploy()) as MockDSTokenInterface;
    await mockDSToken.deployed();

    // Deploy proxy
    const mockProxyFactory = await ethers.getContractFactory(
      ProxyAbi.abi,
      ProxyAbi.bytecode
    );
    mockProxy = (await mockProxyFactory.deploy()) as Proxy;
    await mockProxy.deployed();

    // Override PERMISSIONED_TOKENS for testing
    originalTokens = [...PERMISSIONED_TOKENS];
    PERMISSIONED_TOKENS.length = 0;
    PERMISSIONED_TOKENS.push(
      { address: mockDSToken.address, usesProxy: false, symbol: 'TEST1', chainId },
      { address: mockProxy.address, usesProxy: true, symbol: 'TEST2', chainId }
    );
  });

  after(() => {
    PERMISSIONED_TOKENS.length = 0;
    PERMISSIONED_TOKENS.push(...originalTokens);
  });

  describe('isPermissionedToken', () => {
    it('returns true for tokens in PERMISSIONED_TOKENS list', () => {
      expect(PermissionedTokenValidator.isPermissionedToken(PERMISSIONED_TOKENS[0].address, chainId)).to.be.true;
    });

    it('returns false for non-permissioned tokens', () => {
      const randomAddress = ethers.Wallet.createRandom().address;
      expect(PermissionedTokenValidator.isPermissionedToken(randomAddress, chainId)).to.be.false;
    });

    it('returns false for tokens on different chain', () => {
      const differentChainId = chainId + 1;
      expect(PermissionedTokenValidator.isPermissionedToken(PERMISSIONED_TOKENS[0].address, differentChainId)).to.be.false;
    });

    it('is case-insensitive', () => {
      expect(PermissionedTokenValidator.isPermissionedToken(PERMISSIONED_TOKENS[0].address.toUpperCase(), chainId)).to.be.true;
    });
  });

  describe('preTransferCheck', () => {
    it('returns true for non-permissioned tokens', async () => {
      const result = await PermissionedTokenValidator.preTransferCheck(
        ethers.provider,
        ethers.Wallet.createRandom().address,
        user1.address,
        user2.address,
        ethers.utils.parseEther('1').toString()
      );
      expect(result).to.be.true;
    });

    it('checks transfer permission for direct token', async () => {
      await mockDSToken.setPreTransferCheckResponse(20, "Wallet not in registry service");
      const result = await PermissionedTokenValidator.preTransferCheck(
        ethers.provider,
        mockDSToken.address,
        user1.address,
        user2.address,
        ethers.utils.parseEther('1').toString()
      );
      expect(result).to.be.false;
    });

    it('checks transfer permission through proxy', async () => {
      await mockDSToken.setPreTransferCheckResponse(20, "Wallet not in registry service");
      await mockProxy.setTarget(mockDSToken.address);
      
      const result = await PermissionedTokenValidator.preTransferCheck(
        ethers.provider,
        mockProxy.address,
        user1.address,
        user2.address,
        ethers.utils.parseEther('1').toString()
      );
      expect(result).to.be.false;
    });

    it('handles successful transfer checks', async () => {
      await mockDSToken.setPreTransferCheckResponse(0, "Valid");

      const result = await PermissionedTokenValidator.preTransferCheck(
        ethers.provider,
        mockDSToken.address,
        user1.address,
        user2.address,
        ethers.utils.parseEther('1').toString()
      );
      expect(result).to.be.true;
    });

    it('handles proxy target changes', async () => {
      await mockDSToken.setPreTransferCheckResponse(20, "Wallet not in registry service");
      // Deploy a new implementation
      const newmockDSTokenFactory = await ethers.getContractFactory(
        MockDSTokenInterfaceAbi.abi,
        MockDSTokenInterfaceAbi.bytecode
      );
      const newmockDSToken = (await newmockDSTokenFactory.deploy()) as MockDSTokenInterface;
      await newmockDSToken.deployed();
      
      // Set success response on new implementation
      await newmockDSToken.setPreTransferCheckResponse(0, "Valid");
      
      // Update proxy target
      await mockProxy.setTarget(newmockDSToken.address);
      
      const result = await PermissionedTokenValidator.preTransferCheck(
        ethers.provider,
        mockProxy.address,
        user1.address,
        user2.address,
        ethers.utils.parseEther('1').toString()
      );
      expect(result).to.be.true;
    });
  });
}); 