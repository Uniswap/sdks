/**
 * Tests for ArbiterClient
 */

import { Address, Hex } from 'viem'
import { claimHash, batchClaimHash } from '../encoding/hashes'
import { Claim, BatchClaim, MultichainClaim, BatchMultichainClaim } from '../types/claims'

import { ArbiterClient } from './arbiter'
import { CompactClientConfig } from './coreClient'

// Mock viem clients
const mockPublicClient = {} as any
const mockWalletClient = {
  writeContract: jest.fn(),
} as any

const testAddress = '0x00000000000000171ede64904551eeDF3C6C9788' as Address
const sponsorAddress = '0x1234567890123456789012345678901234567890' as Address
const recipientAddress = '0xfedcbafedcbafedcbafedcbafedcbafedcbafedd' as Address
const lockTag = '0x000000000000000000000001' as Hex

describe('ArbiterClient', () => {
  let config: CompactClientConfig
  let client: ArbiterClient

  beforeEach(() => {
    config = {
      chainId: 1,
      address: testAddress,
      publicClient: mockPublicClient,
      walletClient: mockWalletClient,
    }
    client = new ArbiterClient(config)
    jest.clearAllMocks()
  })

  describe('claim()', () => {
    it('should submit a valid claim', async () => {
      const claim: Claim = {
        allocatorData: '0x' as Hex,
        sponsorSignature: '0x' as Hex,
        sponsor: sponsorAddress,
        nonce: 1n,
        expires: BigInt(Date.now() + 3600000),
        witness: '0x0000000000000000000000000000000000000000000000000000000000000000' as Hex,
        witnessTypestring: '',
        id: 100n,
        allocatedAmount: 1000000n,
        claimants: [
          {
            claimant: (BigInt(lockTag) << 160n) | BigInt(recipientAddress),
            amount: 1000000n,
          },
        ],
      }

      const txHash = '0xabcdef' as Hex
      mockWalletClient.writeContract.mockResolvedValue(txHash)

      const result = await client.claim(claim)

      expect(mockWalletClient.writeContract).toHaveBeenCalledWith({
        address: testAddress,
        abi: expect.any(Array),
        functionName: 'claim',
        args: [claim],
        chain: null,
        account: undefined,
      })

      expect(result.txHash).toBe(txHash)
      expect(result.claimHash).toMatch(/^0x[0-9a-f]{64}$/)
      expect(result.claimHash).toBe(claimHash(claim))
    })

    it('should throw if walletClient is missing', async () => {
      const clientWithoutWallet = new ArbiterClient({
        ...config,
        walletClient: undefined,
      })

      const claim = {
        sponsor: sponsorAddress,
        nonce: 1n,
      } as Claim

      await expect(clientWithoutWallet.claim(claim)).rejects.toThrow('walletClient is required for claims')
    })

    it('should throw if contract address is missing', async () => {
      const clientWithoutAddress = new ArbiterClient({
        ...config,
        address: undefined,
      })

      const claim = {
        sponsor: sponsorAddress,
        nonce: 1n,
      } as Claim

      await expect(clientWithoutAddress.claim(claim)).rejects.toThrow('contract address is required')
    })

    it('should handle contract errors', async () => {
      const claim = {
        sponsor: sponsorAddress,
        nonce: 1n,
      } as Claim

      mockWalletClient.writeContract.mockRejectedValue(new Error('Contract error'))

      await expect(client.claim(claim)).rejects.toThrow('Contract error')
    })
  })

  describe('batchClaim()', () => {
    it('should submit a valid batch claim', async () => {
      const claim: BatchClaim = {
        allocatorData: '0x' as Hex,
        sponsorSignature: '0x' as Hex,
        sponsor: sponsorAddress,
        nonce: 1n,
        expires: BigInt(Date.now() + 3600000),
        witness: '0x0000000000000000000000000000000000000000000000000000000000000000' as Hex,
        witnessTypestring: '',
        claims: [
          {
            id: 100n,
            allocatedAmount: 1000000n,
            portions: [
              {
                claimant: (BigInt(lockTag) << 160n) | BigInt(recipientAddress),
                amount: 1000000n,
              },
            ],
          },
          {
            id: 200n,
            allocatedAmount: 2000000n,
            portions: [
              {
                claimant: (BigInt(lockTag) << 160n) | BigInt(recipientAddress),
                amount: 2000000n,
              },
            ],
          },
        ],
      }

      const txHash = '0xabcdef' as Hex
      mockWalletClient.writeContract.mockResolvedValue(txHash)

      const result = await client.batchClaim(claim)

      expect(mockWalletClient.writeContract).toHaveBeenCalledWith({
        address: testAddress,
        abi: expect.any(Array),
        functionName: 'batchClaim',
        args: [claim],
        chain: null,
        account: undefined,
      })

      expect(result.txHash).toBe(txHash)
      expect(result.claimHash).toMatch(/^0x[0-9a-f]{64}$/)
      expect(result.claimHash).toBe(batchClaimHash(claim))
    })

    it('should throw if walletClient is missing', async () => {
      const clientWithoutWallet = new ArbiterClient({
        ...config,
        walletClient: undefined,
      })

      const claim = {
        sponsor: sponsorAddress,
      } as BatchClaim

      await expect(clientWithoutWallet.batchClaim(claim)).rejects.toThrow('walletClient is required for claims')
    })
  })

  describe('multichainClaim()', () => {
    it('should submit a valid multichain claim', async () => {
      const claim: MultichainClaim = {
        allocatorData: '0x' as Hex,
        sponsorSignature: '0x' as Hex,
        sponsor: sponsorAddress,
        nonce: 1n,
        expires: BigInt(Date.now() + 3600000),
        witness: '0x0000000000000000000000000000000000000000000000000000000000000000' as Hex,
        witnessTypestring: '',
        id: 100n,
        allocatedAmount: 1000000n,
        claimants: [
          {
            claimant: (BigInt(lockTag) << 160n) | BigInt(recipientAddress),
            amount: 1000000n,
          },
        ],
        additionalChains: ['0x1111111111111111111111111111111111111111111111111111111111111111' as Hex],
      }

      const txHash = '0xabcdef' as Hex
      mockWalletClient.writeContract.mockResolvedValue(txHash)

      const result = await client.multichainClaim(claim)

      expect(mockWalletClient.writeContract).toHaveBeenCalledWith({
        address: testAddress,
        abi: expect.any(Array),
        functionName: 'multichainClaim',
        args: [claim],
        chain: null,
        account: undefined,
      })

      expect(result.txHash).toBe(txHash)
      expect(result.claimHash).toMatch(/^0x[0-9a-f]{64}$/)
    })

    it('should throw if walletClient is missing', async () => {
      const clientWithoutWallet = new ArbiterClient({
        ...config,
        walletClient: undefined,
      })

      const claim = {
        sponsor: sponsorAddress,
      } as MultichainClaim

      await expect(clientWithoutWallet.multichainClaim(claim)).rejects.toThrow('walletClient is required for claims')
    })
  })

  describe('batchMultichainClaim()', () => {
    it('should submit a valid batch multichain claim', async () => {
      const claim: BatchMultichainClaim = {
        allocatorData: '0x' as Hex,
        sponsorSignature: '0x' as Hex,
        sponsor: sponsorAddress,
        nonce: 1n,
        expires: BigInt(Date.now() + 3600000),
        witness: '0x0000000000000000000000000000000000000000000000000000000000000000' as Hex,
        witnessTypestring: '',
        claims: [
          {
            id: 100n,
            allocatedAmount: 1000000n,
            portions: [
              {
                claimant: (BigInt(lockTag) << 160n) | BigInt(recipientAddress),
                amount: 1000000n,
              },
            ],
          },
        ],
        additionalChains: ['0x1111111111111111111111111111111111111111111111111111111111111111' as Hex],
      }

      const txHash = '0xabcdef' as Hex
      mockWalletClient.writeContract.mockResolvedValue(txHash)

      const result = await client.batchMultichainClaim(claim)

      expect(mockWalletClient.writeContract).toHaveBeenCalledWith({
        address: testAddress,
        abi: expect.any(Array),
        functionName: 'batchMultichainClaim',
        args: [claim],
        chain: null,
        account: undefined,
      })

      expect(result.txHash).toBe(txHash)
      expect(result.claimHash).toMatch(/^0x[0-9a-f]{64}$/)
    })

    it('should throw if walletClient is missing', async () => {
      const clientWithoutWallet = new ArbiterClient({
        ...config,
        walletClient: undefined,
      })

      const claim = {
        sponsor: sponsorAddress,
      } as BatchMultichainClaim

      await expect(clientWithoutWallet.batchMultichainClaim(claim)).rejects.toThrow(
        'walletClient is required for claims'
      )
    })
  })

  describe('builder factories', () => {
    describe('singleClaimBuilder()', () => {
      it('should create a SingleClaimBuilder with correct domain', () => {
        const builder = client.singleClaimBuilder()

        expect(builder).toBeDefined()
        // Builder should be functional
        const claim = builder
          .sponsor(sponsorAddress)
          .nonce(1n)
          .expires(BigInt(Date.now() + 3600000))
          .id(100n)
          .allocatedAmount(1000000n)
          .lockTag(lockTag)
          .addTransfer({ recipient: recipientAddress, amount: 1000000n })
          .build()

        expect(claim.struct.sponsor).toBe(sponsorAddress)
        expect(claim.hash).toBeDefined()
      })

      it('should throw if contract address is missing', () => {
        const clientWithoutAddress = new ArbiterClient({
          ...config,
          address: undefined,
        })

        expect(() => clientWithoutAddress.singleClaimBuilder()).toThrow('contract address is required')
      })
    })

    describe('batchClaimBuilder()', () => {
      it('should create a BatchClaimBuilder with correct domain', () => {
        const builder = client.batchClaimBuilder()

        expect(builder).toBeDefined()
        // Builder should be functional
        const claim = builder
          .sponsor(sponsorAddress)
          .nonce(1n)
          .expires(BigInt(Date.now() + 3600000))
          .addClaim()
          .id(100n)
          .allocatedAmount(1000000n)
          .addPortion(lockTag, {
            kind: 'transfer',
            recipient: recipientAddress,
            amount: 1000000n,
          })
          .done()
          .build()

        expect(claim.struct.sponsor).toBe(sponsorAddress)
        expect(claim.hash).toBeDefined()
      })

      it('should throw if contract address is missing', () => {
        const clientWithoutAddress = new ArbiterClient({
          ...config,
          address: undefined,
        })

        expect(() => clientWithoutAddress.batchClaimBuilder()).toThrow('contract address is required')
      })
    })

    describe('multichainClaimBuilder()', () => {
      it('should create a MultichainClaimBuilder with correct domain', () => {
        const builder = client.multichainClaimBuilder()

        expect(builder).toBeDefined()
        // Builder should be functional
        const claim = builder
          .sponsor(sponsorAddress)
          .nonce(1n)
          .expires(BigInt(Date.now() + 3600000))
          .id(100n)
          .lockTag(lockTag)
          .allocatedAmount(1000000n)
          .addTransfer({ recipient: recipientAddress, amount: 1000000n })
          .build()

        expect(claim.struct.sponsor).toBe(sponsorAddress)
        expect(claim.hash).toBeDefined()
      })

      it('should throw if contract address is missing', () => {
        const clientWithoutAddress = new ArbiterClient({
          ...config,
          address: undefined,
        })

        expect(() => clientWithoutAddress.multichainClaimBuilder()).toThrow('contract address is required')
      })
    })

    describe('batchMultichainClaimBuilder()', () => {
      it('should create a BatchMultichainClaimBuilder with correct domain', () => {
        const builder = client.batchMultichainClaimBuilder()

        expect(builder).toBeDefined()
        // Builder should be functional
        const claim = builder
          .sponsor(sponsorAddress)
          .nonce(1n)
          .expires(BigInt(Date.now() + 3600000))
          .addClaim()
          .id(100n)
          .allocatedAmount(1000000n)
          .addPortion(lockTag, {
            kind: 'transfer',
            recipient: recipientAddress,
            amount: 1000000n,
          })
          .done()
          .build()

        expect(claim.struct.sponsor).toBe(sponsorAddress)
        expect(claim.hash).toBeDefined()
      })

      it('should throw if contract address is missing', () => {
        const clientWithoutAddress = new ArbiterClient({
          ...config,
          address: undefined,
        })

        expect(() => clientWithoutAddress.batchMultichainClaimBuilder()).toThrow('contract address is required')
      })
    })
  })
})
