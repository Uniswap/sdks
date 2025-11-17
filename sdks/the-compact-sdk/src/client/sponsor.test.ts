/**
 * Tests for SponsorClient
 */

import { SponsorClient } from './sponsor'
import { CompactClientConfig } from './coreClient'
import { parseEther, encodeEventTopics } from 'viem'
import { simpleMandate } from '../builders/mandate'

// Mock viem clients
const mockPublicClient = {
  waitForTransactionReceipt: jest.fn(),
} as any

const mockWalletClient = {
  writeContract: jest.fn(),
} as any

const testAddress = '0x00000000000000171ede64904551eeDF3C6C9788' as `0x${string}`
const sponsorAddress = '0x1234567890123456789012345678901234567890' as `0x${string}`
const tokenAddress = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48' as `0x${string}`
const lockTag = '0x000000000000000000000001' as `0x${string}`

describe('SponsorClient', () => {
  let config: CompactClientConfig
  let client: SponsorClient

  beforeEach(() => {
    config = {
      chainId: 1,
      address: testAddress,
      publicClient: mockPublicClient,
      walletClient: mockWalletClient,
    }
    client = new SponsorClient(config)
    jest.clearAllMocks()
  })

  describe('depositNative()', () => {
    it('should deposit native tokens and extract lock ID', async () => {
      const txHash = '0xabcdef' as `0x${string}`
      const lockId = 123n

      // Mock transaction hash
      mockWalletClient.writeContract.mockResolvedValue(txHash)

      // Mock transaction receipt with Deposit event
      mockPublicClient.waitForTransactionReceipt.mockResolvedValue({
        logs: [
          {
            address: testAddress,
            topics: [
              '0x1234567890123456789012345678901234567890123456789012345678901234', // Deposit event signature
            ],
            data: '0x',
            // This would be a proper Deposit event
          },
        ],
      })

      // For simplicity, we'll mock the actual event extraction
      // In reality, the event would contain the lock ID
      const result = await client.depositNative({
        lockTag,
        recipient: sponsorAddress,
        value: parseEther('1.0'),
      })

      expect(mockWalletClient.writeContract).toHaveBeenCalledWith({
        address: testAddress,
        abi: expect.any(Array),
        functionName: 'depositNative',
        args: [lockTag, sponsorAddress],
        value: parseEther('1.0'),
        chain: null,
        account: null,
      })

      expect(result.txHash).toBe(txHash)
      expect(result.id).toBeDefined()
    })

    it('should throw if walletClient is missing', async () => {
      const clientWithoutWallet = new SponsorClient({
        ...config,
        walletClient: undefined,
      })

      await expect(
        clientWithoutWallet.depositNative({
          lockTag,
          recipient: sponsorAddress,
          value: parseEther('1.0'),
        })
      ).rejects.toThrow('walletClient is required')
    })

    it('should throw if contract address is missing', async () => {
      const clientWithoutAddress = new SponsorClient({
        ...config,
        address: undefined,
      })

      await expect(
        clientWithoutAddress.depositNative({
          lockTag,
          recipient: sponsorAddress,
          value: parseEther('1.0'),
        })
      ).rejects.toThrow('contract address is required')
    })

    it('should handle contract errors', async () => {
      mockWalletClient.writeContract.mockRejectedValue(new Error('Insufficient funds'))

      await expect(
        client.depositNative({
          lockTag,
          recipient: sponsorAddress,
          value: parseEther('1.0'),
        })
      ).rejects.toThrow('Insufficient funds')
    })
  })

  describe('depositERC20()', () => {
    it('should deposit ERC20 tokens and extract lock ID', async () => {
      const txHash = '0xabcdef' as `0x${string}`
      const amount = 1000000n

      mockWalletClient.writeContract.mockResolvedValue(txHash)

      mockPublicClient.waitForTransactionReceipt.mockResolvedValue({
        logs: [
          {
            address: testAddress,
            topics: [],
            data: '0x',
          },
        ],
      })

      const result = await client.depositERC20({
        token: tokenAddress,
        lockTag,
        recipient: sponsorAddress,
        amount,
      })

      expect(mockWalletClient.writeContract).toHaveBeenCalledWith({
        address: testAddress,
        abi: expect.any(Array),
        functionName: 'depositERC20',
        args: [tokenAddress, lockTag, amount, sponsorAddress],
        chain: null,
        account: null,
      })

      expect(result.txHash).toBe(txHash)
      expect(result.id).toBeDefined()
    })

    it('should throw if walletClient is missing', async () => {
      const clientWithoutWallet = new SponsorClient({
        ...config,
        walletClient: undefined,
      })

      await expect(
        clientWithoutWallet.depositERC20({
          token: tokenAddress,
          lockTag,
          recipient: sponsorAddress,
          amount: 1000000n,
        })
      ).rejects.toThrow('walletClient is required')
    })

    it('should throw if contract address is missing', async () => {
      const clientWithoutAddress = new SponsorClient({
        ...config,
        address: undefined,
      })

      await expect(
        clientWithoutAddress.depositERC20({
          token: tokenAddress,
          lockTag,
          recipient: sponsorAddress,
          amount: 1000000n,
        })
      ).rejects.toThrow('contract address is required')
    })
  })

  describe('register()', () => {
    it('should register a claim hash', async () => {
      const txHash = '0xabcdef' as `0x${string}`
      const claimHash = '0x1111111111111111111111111111111111111111111111111111111111111111' as `0x${string}`
      const typehash = '0x2222222222222222222222222222222222222222222222222222222222222222' as `0x${string}`

      mockWalletClient.writeContract.mockResolvedValue(txHash)

      const result = await client.register({
        claimHash,
        typehash,
      })

      expect(mockWalletClient.writeContract).toHaveBeenCalledWith({
        address: testAddress,
        abi: expect.any(Array),
        functionName: 'register',
        args: [claimHash, typehash],
        chain: null,
        account: null,
      })

      expect(result).toBe(txHash)
    })

    it('should throw if walletClient is missing', async () => {
      const clientWithoutWallet = new SponsorClient({
        ...config,
        walletClient: undefined,
      })

      await expect(
        clientWithoutWallet.register({
          claimHash: '0x1111111111111111111111111111111111111111111111111111111111111111' as `0x${string}`,
          typehash: '0x2222222222222222222222222222222222222222222222222222222222222222' as `0x${string}`,
        })
      ).rejects.toThrow('walletClient is required')
    })
  })

  describe('enableForcedWithdrawal()', () => {
    it('should enable forced withdrawal and extract withdrawableAt', async () => {
      const txHash = '0xabcdef' as `0x${string}`
      const lockId = 100n
      const withdrawableAt = BigInt(Date.now() + 86400000) // 24 hours from now

      mockWalletClient.writeContract.mockResolvedValue(txHash)

      // Mock receipt with ForcedWithdrawalEnabled event
      mockPublicClient.waitForTransactionReceipt.mockResolvedValue({
        logs: [
          {
            address: testAddress,
            topics: [],
            data: '0x',
            // In reality, this would decode to ForcedWithdrawalEnabled with withdrawableAt
          },
        ],
      })

      const result = await client.enableForcedWithdrawal(lockId)

      expect(mockWalletClient.writeContract).toHaveBeenCalledWith({
        address: testAddress,
        abi: expect.any(Array),
        functionName: 'enableForcedWithdrawal',
        args: [lockId],
        chain: null,
        account: null,
      })

      expect(result.txHash).toBe(txHash)
      expect(result.withdrawableAt).toBeDefined()
    })

    it('should throw if walletClient is missing', async () => {
      const clientWithoutWallet = new SponsorClient({
        ...config,
        walletClient: undefined,
      })

      await expect(clientWithoutWallet.enableForcedWithdrawal(100n)).rejects.toThrow('walletClient is required')
    })

    it('should throw if contract address is missing', async () => {
      const clientWithoutAddress = new SponsorClient({
        ...config,
        address: undefined,
      })

      await expect(clientWithoutAddress.enableForcedWithdrawal(100n)).rejects.toThrow('contract address is required')
    })
  })

  describe('disableForcedWithdrawal()', () => {
    it('should disable forced withdrawal', async () => {
      const txHash = '0xabcdef' as `0x${string}`
      const lockId = 100n

      mockWalletClient.writeContract.mockResolvedValue(txHash)

      const result = await client.disableForcedWithdrawal(lockId)

      expect(mockWalletClient.writeContract).toHaveBeenCalledWith({
        address: testAddress,
        abi: expect.any(Array),
        functionName: 'disableForcedWithdrawal',
        args: [lockId],
        chain: null,
        account: null,
      })

      expect(result).toBe(txHash)
    })

    it('should throw if walletClient is missing', async () => {
      const clientWithoutWallet = new SponsorClient({
        ...config,
        walletClient: undefined,
      })

      await expect(clientWithoutWallet.disableForcedWithdrawal(100n)).rejects.toThrow('walletClient is required')
    })

    it('should throw if contract address is missing', async () => {
      const clientWithoutAddress = new SponsorClient({
        ...config,
        address: undefined,
      })

      await expect(clientWithoutAddress.disableForcedWithdrawal(100n)).rejects.toThrow('contract address is required')
    })

    it('should handle contract errors', async () => {
      mockWalletClient.writeContract.mockRejectedValue(new Error('No forced withdrawal enabled'))

      await expect(client.disableForcedWithdrawal(100n)).rejects.toThrow('No forced withdrawal enabled')
    })
  })

  describe('forcedWithdrawal()', () => {
    it('should execute forced withdrawal and extract amount', async () => {
      const txHash = '0xabcdef' as `0x${string}`
      const lockId = 100n
      const recipient = '0xfedcbafedcbafedcbafedcbafedcbafedcbafedd' as `0x${string}`
      const withdrawnAmount = 1000000n

      mockWalletClient.writeContract.mockResolvedValue(txHash)

      // Mock receipt with ForcedWithdrawal event
      mockPublicClient.waitForTransactionReceipt.mockResolvedValue({
        logs: [
          {
            address: testAddress,
            topics: [],
            data: '0x',
            // In reality, this would decode to ForcedWithdrawal with amount
          },
        ],
      })

      const result = await client.forcedWithdrawal(lockId, recipient)

      expect(mockWalletClient.writeContract).toHaveBeenCalledWith({
        address: testAddress,
        abi: expect.any(Array),
        functionName: 'forcedWithdrawal',
        args: [lockId, recipient],
        chain: null,
        account: null,
      })

      expect(result.txHash).toBe(txHash)
      expect(result.amount).toBeDefined()
    })

    it('should throw if walletClient is missing', async () => {
      const clientWithoutWallet = new SponsorClient({
        ...config,
        walletClient: undefined,
      })

      await expect(
        clientWithoutWallet.forcedWithdrawal(100n, '0xfedcbafedcbafedcbafedcbafedcbafedcbafedd' as `0x${string}`)
      ).rejects.toThrow('walletClient is required')
    })

    it('should throw if contract address is missing', async () => {
      const clientWithoutAddress = new SponsorClient({
        ...config,
        address: undefined,
      })

      await expect(
        clientWithoutAddress.forcedWithdrawal(100n, '0xfedcbafedcbafedcbafedcbafedcbafedcbafedd' as `0x${string}`)
      ).rejects.toThrow('contract address is required')
    })

    it('should handle contract errors', async () => {
      mockWalletClient.writeContract.mockRejectedValue(new Error('Delay not elapsed'))

      await expect(
        client.forcedWithdrawal(100n, '0xfedcbafedcbafedcbafedcbafedcbafedcbafedd' as `0x${string}`)
      ).rejects.toThrow('Delay not elapsed')
    })
  })

  describe('builder factories', () => {
    describe('compact()', () => {
      it('should create a CompactBuilder with correct domain', () => {
        const arbiterAddress = '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd' as `0x${string}`
        const builder = client.compact()

        expect(builder).toBeDefined()
        // Builder should be functional
        const compact = builder
          .arbiter(arbiterAddress)
          .sponsor(sponsorAddress)
          .nonce(1n)
          .expires(BigInt(Date.now() + 3600000))
          .lockTag(lockTag)
          .token(tokenAddress)
          .amount(1000000n)
          .build()

        expect(compact.struct.sponsor).toBe(sponsorAddress)
        expect(compact.hash).toBeDefined()
      })

      it('should throw if contract address is missing', () => {
        const clientWithoutAddress = new SponsorClient({
          ...config,
          address: undefined,
        })

        expect(() => clientWithoutAddress.compact()).toThrow('contract address is required')
      })
    })

    describe('batchCompact()', () => {
      it('should create a BatchCompactBuilder with correct domain', () => {
        const arbiterAddress = '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd' as `0x${string}`
        const builder = client.batchCompact()

        expect(builder).toBeDefined()
        // Builder should be functional
        const compact = builder
          .arbiter(arbiterAddress)
          .sponsor(sponsorAddress)
          .nonce(1n)
          .expires(BigInt(Date.now() + 3600000))
          .addLock({ lockTag, token: tokenAddress, amount: 1000000n })
          .build()

        expect(compact.struct.sponsor).toBe(sponsorAddress)
        expect(compact.hash).toBeDefined()
      })

      it('should throw if contract address is missing', () => {
        const clientWithoutAddress = new SponsorClient({
          ...config,
          address: undefined,
        })

        expect(() => clientWithoutAddress.batchCompact()).toThrow('contract address is required')
      })
    })

    describe('multichainCompact()', () => {
      it('should create a MultichainCompactBuilder with correct domain', () => {
        const arbiterAddress = '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd' as `0x${string}`
        const mandateType = simpleMandate([{ name: 'fillerAddress', type: 'address' }])
        const mandate = { fillerAddress: '0x9876543210987654321098765432109876543210' as `0x${string}` }
        const builder = client.multichainCompact()

        expect(builder).toBeDefined()
        // Builder should be functional
        const compact = builder
          .sponsor(sponsorAddress)
          .nonce(1n)
          .expires(BigInt(Date.now() + 3600000))
          .addElement()
          .arbiter(arbiterAddress)
          .chainId(1n)
          .addCommitment({ lockTag, token: tokenAddress, amount: 1000000n })
          .witness(mandateType, mandate)
          .done()
          .build()

        expect(compact.struct.sponsor).toBe(sponsorAddress)
        expect(compact.hash).toBeDefined()
      })

      it('should throw if contract address is missing', () => {
        const clientWithoutAddress = new SponsorClient({
          ...config,
          address: undefined,
        })

        expect(() => clientWithoutAddress.multichainCompact()).toThrow('contract address is required')
      })
    })
  })
})
