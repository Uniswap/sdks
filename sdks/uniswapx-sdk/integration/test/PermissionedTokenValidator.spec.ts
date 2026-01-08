import { expect } from 'chai';
import { ethers } from 'hardhat';
import { PermissionedTokenValidator } from '../../src/utils/PermissionedTokenValidator';
import { MockDSTokenInterface, Proxy } from '../../src/contracts';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { PERMISSIONED_TOKENS, PermissionedTokenInterface, PermissionedTokenProxyType } from '../../src/constants';
import ProxyAbi from '../../abis/Proxy.json';
import MockDSTokenInterfaceAbi from '../../abis/MockDSTokenInterface.json';
import { ERC1967Proxy__factory } from '../../src/contracts/factories/ERC1967Proxy__factory';
import MockSuperstateTokenV4Abi from '../../abis/MockSuperstateTokenV4.json';
import ERC1967ProxyAbi from '../../abis/ERC1967Proxy.json';

describe('PermissionedTokenValidator', () => {
  let mockDSToken: MockDSTokenInterface;
  let mockProxy: Proxy;
  let owner: SignerWithAddress;
  let user1: SignerWithAddress;
  let user2: SignerWithAddress;
  let chainId: number;
  let testPermissionedTokens: typeof PERMISSIONED_TOKENS;

  before(async () => {
    [owner, user1, user2] = await ethers.getSigners();

    chainId = (await ethers.provider.getNetwork()).chainId;

    // Deploy mock token
    const mockDSTokenFactory = await ethers.getContractFactory(
      MockDSTokenInterfaceAbi.abi,
      MockDSTokenInterfaceAbi.bytecode.object,
      owner
    );
    mockDSToken = (await mockDSTokenFactory.deploy()) as MockDSTokenInterface;
    await mockDSToken.deployed();

    // Deploy proxy
    const mockProxyFactory = await ethers.getContractFactory(
      ProxyAbi.abi,
      ProxyAbi.bytecode.object,
      owner
    );
    mockProxy = (await mockProxyFactory.deploy()) as Proxy;
    await mockProxy.deployed();

    testPermissionedTokens = [
      { address: mockDSToken.address, proxyType: undefined, symbol: 'TEST1', chainId, interface: PermissionedTokenInterface.DSTokenInterface },
      { address: mockProxy.address, proxyType: PermissionedTokenProxyType.Standard, symbol: 'TEST2', chainId, interface: PermissionedTokenInterface.DSTokenInterface }
    ];
  });

  describe('isPermissionedToken', () => {
    it('returns true for tokens in list', () => {
      expect(PermissionedTokenValidator.isPermissionedToken(
        testPermissionedTokens[0].address, chainId, testPermissionedTokens
      )).to.be.true;
    });

    it('returns false for non-permissioned tokens', () => {
      const randomAddress = ethers.Wallet.createRandom().address;
      expect(PermissionedTokenValidator.isPermissionedToken(randomAddress, chainId, testPermissionedTokens)).to.be.false;
    });

    it('returns false for tokens on different chain', () => {
      const differentChainId = chainId + 1;
      expect(PermissionedTokenValidator.isPermissionedToken(testPermissionedTokens[0].address, differentChainId, testPermissionedTokens)).to.be.false;
    });

    it('is case-insensitive', () => {
      expect(PermissionedTokenValidator.isPermissionedToken(testPermissionedTokens[0].address.toUpperCase(), chainId, testPermissionedTokens)).to.be.true;
    });
  });

  describe('preTransferCheck', () => {
    it('returns true for non-permissioned tokens', async () => {
      const result = await PermissionedTokenValidator.preTransferCheck(
        ethers.provider,
        ethers.Wallet.createRandom().address,
        user1.address,
        user2.address,
        ethers.utils.parseEther('1').toString(),
        testPermissionedTokens
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
        ethers.utils.parseEther('1').toString(),
        testPermissionedTokens
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
        ethers.utils.parseEther('1').toString(),
        testPermissionedTokens
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
        ethers.utils.parseEther('1').toString(),
        testPermissionedTokens
      );
      expect(result).to.be.true;
    });

    it('handles proxy target changes', async () => {
      await mockDSToken.setPreTransferCheckResponse(20, "Wallet not in registry service");
      // Deploy a new implementation
      const newmockDSTokenFactory = await ethers.getContractFactory(
        MockDSTokenInterfaceAbi.abi,
        MockDSTokenInterfaceAbi.bytecode.object,
        owner
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
        ethers.utils.parseEther('1').toString(),
        testPermissionedTokens
      );
      expect(result).to.be.true;
    });

    describe('ISuperstateTokenV4 interface', () => {
      let mockSuperstateToken: any;
      beforeEach(async () => {
        const factory = await ethers.getContractFactory(
          MockSuperstateTokenV4Abi.abi,
          MockSuperstateTokenV4Abi.bytecode,
          owner
        );
        mockSuperstateToken = await factory.deploy();
        await mockSuperstateToken.deployed();
        testPermissionedTokens.push({
          address: mockSuperstateToken.address,
          proxyType: undefined,
          symbol: 'SUPER',
          chainId,
          interface: PermissionedTokenInterface.ISuperstateTokenV4,
        });
      });
      afterEach(() => {
        testPermissionedTokens.pop();
      });
      it('returns true if both from and to are allowed', async () => {
        await mockSuperstateToken.setIsAllowed(user1.address, true);
        await mockSuperstateToken.setIsAllowed(user2.address, true);
        const result = await PermissionedTokenValidator.preTransferCheck(
          ethers.provider,
          mockSuperstateToken.address,
          user1.address,
          user2.address,
          ethers.utils.parseEther('1').toString(),
          testPermissionedTokens
        );
        expect(result).to.be.true;
      });
      it('returns false if from is not allowed', async () => {
        await mockSuperstateToken.setIsAllowed(user1.address, false);
        await mockSuperstateToken.setIsAllowed(user2.address, true);
        const result = await PermissionedTokenValidator.preTransferCheck(
          ethers.provider,
          mockSuperstateToken.address,
          user1.address,
          user2.address,
          ethers.utils.parseEther('1').toString(),
          testPermissionedTokens
        );
        expect(result).to.be.false;
      });
      it('returns false if to is not allowed', async () => {
        await mockSuperstateToken.setIsAllowed(user1.address, true);
        await mockSuperstateToken.setIsAllowed(user2.address, false);
        const result = await PermissionedTokenValidator.preTransferCheck(
          ethers.provider,
          mockSuperstateToken.address,
          user1.address,
          user2.address,
          ethers.utils.parseEther('1').toString(),
          testPermissionedTokens
        );
        expect(result).to.be.false;
      });
      it('returns false if neither is allowed', async () => {
        await mockSuperstateToken.setIsAllowed(user1.address, false);
        await mockSuperstateToken.setIsAllowed(user2.address, false);
        const result = await PermissionedTokenValidator.preTransferCheck(
          ethers.provider,
          mockSuperstateToken.address,
          user1.address,
          user2.address,
          ethers.utils.parseEther('1').toString(),
          testPermissionedTokens
        );
        expect(result).to.be.false;
      });
    });

    it('throws for unknown token interface', async () => {
      const randomToken = ethers.Wallet.createRandom().address;
      testPermissionedTokens.push({
        address: randomToken,
        proxyType: undefined,
        symbol: 'UNKNOWN',
        chainId,
        interface: 'UnknownInterface' as any,
      });
      await expect(PermissionedTokenValidator.preTransferCheck(
        ethers.provider,
        randomToken,
        user1.address,
        user2.address,
        ethers.utils.parseEther('1').toString(),
        testPermissionedTokens
      )).to.be.rejectedWith('Unknown token interface: UnknownInterface');
      testPermissionedTokens.pop();
    });

    it('checks transfer permission through ERC1967 proxy', async () => {
      // Deploy mock implementation
      const mockDSTokenFactory = await ethers.getContractFactory(
        MockDSTokenInterfaceAbi.abi,
        MockDSTokenInterfaceAbi.bytecode.object,
        owner
      );
      const mockImpl = await mockDSTokenFactory.deploy();
      await mockImpl.deployed();
      await mockImpl.setPreTransferCheckResponse(20, "Wallet not in registry service");

      // Deploy ERC1967Proxy with implementation address
      const ERC1967ProxyFactory = await ethers.getContractFactory(
        ERC1967ProxyAbi.abi,
        ERC1967ProxyAbi.bytecode.object,
        owner
      );
      // The constructor for ERC1967Proxy is (_logic, admin, _data)
      const proxy = await ERC1967ProxyFactory.deploy(
        mockImpl.address,
        '0x'
      );
      await proxy.deployed();

      testPermissionedTokens.push({
        address: proxy.address,
        proxyType: PermissionedTokenProxyType.ERC1967,
        symbol: 'ERC1967PROXY',
        chainId,
        interface: PermissionedTokenInterface.DSTokenInterface,
      });

      const result = await PermissionedTokenValidator.preTransferCheck(
        ethers.provider,
        proxy.address,
        user1.address,
        user2.address,
        ethers.utils.parseEther('1').toString(),
        testPermissionedTokens
      );
      expect(result).to.be.false;
      testPermissionedTokens.pop();
    });
  });
}); 
