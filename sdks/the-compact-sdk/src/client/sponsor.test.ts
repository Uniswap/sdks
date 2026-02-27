/**
 * Tests for SponsorClient
 */

import invariant from 'tiny-invariant'
import { parseEther, encodeEventTopics, encodeAbiParameters, Address, Hex } from 'viem'

import { theCompactAbi } from '../abi/theCompact'
import { simpleMandate } from '../builders/mandate'
import { encodeLockId } from '../encoding/locks'
import { compactTypehash, registrationCompactClaimHash } from '../encoding/registration'

import { CompactClientConfig } from './coreClient'
import { SponsorClient } from './sponsor'

// Mock viem clients
const mockPublicClient = {
  waitForTransactionReceipt: jest.fn(),
} as any

const mockWalletClient = {
  writeContract: jest.fn(),
} as any

const testAddress = '0x00000000000000171ede64904551eeDF3C6C9788' as Address
const sponsorAddress = '0x1234567890123456789012345678901234567890' as Address
const tokenAddress = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48' as Address
const lockTag = '0x000000000000000000000001' as Hex

// Helper to create a realistic Transfer event log
function createTransferEvent(params: { from: Address; to: Address; id: bigint; by: Address; amount: bigint }) {
  const transferEvent = theCompactAbi.find((item) => item.type === 'event' && item.name === 'Transfer')
  invariant(transferEvent, 'Transfer event not found')

  const topics = encodeEventTopics({
    abi: [transferEvent],
    eventName: 'Transfer',
    args: {
      from: params.from,
      to: params.to,
      id: params.id,
    },
  })

  const data = encodeAbiParameters(
    [
      { type: 'address', name: 'by' },
      { type: 'uint256', name: 'amount' },
    ],
    [params.by, params.amount]
  )

  return {
    address: testAddress,
    topics,
    data,
  }
}

// Helper to create a realistic ForcedWithdrawalStatusUpdated event log
function createForcedWithdrawalStatusUpdatedEvent(params: {
  account: Address
  id: bigint
  activating: boolean
  withdrawableAt: bigint
}) {
  const event = theCompactAbi.find((item) => item.type === 'event' && item.name === 'ForcedWithdrawalStatusUpdated')
  invariant(event, 'ForcedWithdrawalStatusUpdated event not found')

  const topics = encodeEventTopics({
    abi: [event],
    eventName: 'ForcedWithdrawalStatusUpdated',
    args: {
      account: params.account,
      id: params.id,
    },
  })

  const data = encodeAbiParameters(
    [
      { type: 'bool', name: 'activating' },
      { type: 'uint256', name: 'withdrawableAt' },
    ],
    [params.activating, params.withdrawableAt]
  )

  return {
    address: testAddress,
    topics,
    data,
  }
}

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
    it('should deposit native tokens, observe Transfer event, and return deterministic lock ID', async () => {
      const txHash = '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890' as Hex
      const depositAmount = parseEther('1.0')
      const expectedId = encodeLockId(lockTag, '0x0000000000000000000000000000000000000000')

      mockWalletClient.writeContract.mockResolvedValue(txHash)

      // Mock receipt with realistic Transfer event (minting from address(0))
      const transferEvent = createTransferEvent({
        from: '0x0000000000000000000000000000000000000000',
        to: sponsorAddress,
        id: expectedId,
        by: sponsorAddress,
        amount: depositAmount,
      })

      mockPublicClient.waitForTransactionReceipt.mockResolvedValue({
        logs: [transferEvent],
      })

      const result = await client.depositNative({
        lockTag,
        recipient: sponsorAddress,
        value: depositAmount,
      })

      expect(mockWalletClient.writeContract).toHaveBeenCalledWith({
        address: testAddress,
        abi: expect.any(Array),
        functionName: 'depositNative',
        args: [lockTag, sponsorAddress],
        value: depositAmount,
        chain: null,
        account: undefined,
      })

      expect(result.txHash).toBe(txHash)
      expect(result.id).toBe(expectedId)
    })

    it('should throw if observed Transfer id does not match computed id', async () => {
      const txHash = '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890' as Hex
      const depositAmount = parseEther('1.0')
      const expectedId = encodeLockId(lockTag, '0x0000000000000000000000000000000000000000')
      const wrongId = 123n

      mockWalletClient.writeContract.mockResolvedValue(txHash)

      const transferEvent = createTransferEvent({
        from: '0x0000000000000000000000000000000000000000',
        to: sponsorAddress,
        id: wrongId,
        by: sponsorAddress,
        amount: depositAmount,
      })

      mockPublicClient.waitForTransactionReceipt.mockResolvedValue({
        logs: [transferEvent],
      })

      await expect(
        client.depositNative({
          lockTag,
          recipient: sponsorAddress,
          value: depositAmount,
        })
      ).rejects.toThrow('Unexpected lock id in Transfer event (computed != observed)')

      // sanity: our computed id is not the wrong one
      expect(expectedId).not.toBe(wrongId)
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
    it('should deposit ERC20 tokens, observe Transfer event, and return deterministic lock ID', async () => {
      const txHash = '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890' as Hex
      const amount = 1000000n
      const expectedId = encodeLockId(lockTag, tokenAddress)

      mockWalletClient.writeContract.mockResolvedValue(txHash)

      const transferEvent = createTransferEvent({
        from: '0x0000000000000000000000000000000000000000',
        to: sponsorAddress,
        id: expectedId,
        by: sponsorAddress,
        amount,
      })

      mockPublicClient.waitForTransactionReceipt.mockResolvedValue({
        logs: [transferEvent],
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
        account: undefined,
      })

      expect(result.txHash).toBe(txHash)
      expect(result.id).toBe(expectedId)
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
      const txHash = '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890' as Hex
      const claimHash = '0x1111111111111111111111111111111111111111111111111111111111111111' as Hex
      const typehash = '0x2222222222222222222222222222222222222222222222222222222222222222' as Hex

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
        account: undefined,
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
          claimHash: '0x1111111111111111111111111111111111111111111111111111111111111111' as Hex,
          typehash: '0x2222222222222222222222222222222222222222222222222222222222222222' as Hex,
        })
      ).rejects.toThrow('walletClient is required')
    })
  })

  describe('registerCompact()', () => {
    it('should compute registration inputs and call register()', async () => {
      const txHash = '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890' as Hex
      mockWalletClient.writeContract.mockResolvedValue(txHash)
      mockPublicClient.waitForTransactionReceipt.mockResolvedValue({ logs: [] })

      const mandateType = simpleMandate<{ witnessArgument: bigint }>([{ name: 'witnessArgument', type: 'uint256' }])
      const mandate = { witnessArgument: 123n }

      const built = {
        struct: {
          arbiter: sponsorAddress,
          sponsor: sponsorAddress,
          nonce: 1n,
          expires: 2n,
          lockTag,
          token: tokenAddress,
          amount: 3n,
        },
        mandateType,
        mandate,
      }

      const typehash = compactTypehash(mandateType)
      const witness = mandateType.hash(mandate)
      const expectedClaimHash = registrationCompactClaimHash({
        typehash,
        arbiter: built.struct.arbiter,
        sponsor: built.struct.sponsor,
        nonce: built.struct.nonce,
        expires: built.struct.expires,
        lockTag: built.struct.lockTag,
        token: built.struct.token,
        amount: built.struct.amount,
        witness,
      })

      const result = await client.registerCompact(built as any)

      expect(mockWalletClient.writeContract).toHaveBeenCalledWith(
        expect.objectContaining({
          functionName: 'register',
          args: [expectedClaimHash, typehash],
        })
      )
      expect(result).toBe(txHash)
    })
  })

  describe('enableForcedWithdrawal()', () => {
    it('should enable forced withdrawal and extract withdrawableAt timestamp', async () => {
      const txHash = '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890' as Hex
      const lockId = 100n
      const withdrawableAt = BigInt(Date.now() + 86400000) // 24 hours from now

      mockWalletClient.writeContract.mockResolvedValue(txHash)

      // Mock receipt with realistic ForcedWithdrawalStatusUpdated event
      const statusEvent = createForcedWithdrawalStatusUpdatedEvent({
        account: sponsorAddress,
        id: lockId,
        activating: true,
        withdrawableAt,
      })

      mockPublicClient.waitForTransactionReceipt.mockResolvedValue({
        logs: [statusEvent],
      })

      const result = await client.enableForcedWithdrawal(lockId)

      expect(mockWalletClient.writeContract).toHaveBeenCalledWith({
        address: testAddress,
        abi: expect.any(Array),
        functionName: 'enableForcedWithdrawal',
        args: [lockId],
        chain: null,
        account: undefined,
      })

      expect(result.txHash).toBe(txHash)
      expect(result.withdrawableAt).toBe(withdrawableAt)
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
      const txHash = '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890' as Hex
      const lockId = 100n

      mockWalletClient.writeContract.mockResolvedValue(txHash)

      const result = await client.disableForcedWithdrawal(lockId)

      expect(mockWalletClient.writeContract).toHaveBeenCalledWith({
        address: testAddress,
        abi: expect.any(Array),
        functionName: 'disableForcedWithdrawal',
        args: [lockId],
        chain: null,
        account: undefined,
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
    it('should execute forced withdrawal with specified amount', async () => {
      const txHash = '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890' as Hex
      const lockId = 100n
      const recipient = '0xfedcbafedcbafedcbafedcbafedcbafedcbafedd' as Address
      const amount = 5000000n

      mockWalletClient.writeContract.mockResolvedValue(txHash)

      const result = await client.forcedWithdrawal(lockId, recipient, amount)

      expect(mockWalletClient.writeContract).toHaveBeenCalledWith({
        address: testAddress,
        abi: expect.any(Array),
        functionName: 'forcedWithdrawal',
        args: [lockId, recipient, amount],
        chain: null,
        account: undefined,
      })

      expect(result).toBe(txHash)
    })

    it('should throw if walletClient is missing', async () => {
      const clientWithoutWallet = new SponsorClient({
        ...config,
        walletClient: undefined,
      })

      await expect(
        clientWithoutWallet.forcedWithdrawal(100n, '0xfedcbafedcbafedcbafedcbafedcbafedcbafedd' as Address, 5000000n)
      ).rejects.toThrow('walletClient is required')
    })

    it('should throw if contract address is missing', async () => {
      const clientWithoutAddress = new SponsorClient({
        ...config,
        address: undefined,
      })

      await expect(
        clientWithoutAddress.forcedWithdrawal(100n, '0xfedcbafedcbafedcbafedcbafedcbafedcbafedd' as Address, 5000000n)
      ).rejects.toThrow('contract address is required')
    })

    it('should handle contract errors', async () => {
      mockWalletClient.writeContract.mockRejectedValue(new Error('Delay not elapsed'))

      await expect(
        client.forcedWithdrawal(100n, '0xfedcbafedcbafedcbafedcbafedcbafedd' as Address, 5000000n)
      ).rejects.toThrow('Delay not elapsed')
    })
  })

  describe('builder factories', () => {
    describe('compact()', () => {
      it('should create a CompactBuilder with correct domain', () => {
        const arbiterAddress = '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd' as Address
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
        const arbiterAddress = '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd' as Address
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
        const arbiterAddress = '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd' as Address
        const mandateType = simpleMandate([{ name: 'fillerAddress', type: 'address' }])
        const mandate = { fillerAddress: '0x9876543210987654321098765432109876543210' as Address }
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
