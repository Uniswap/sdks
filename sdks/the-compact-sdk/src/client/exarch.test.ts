/**
 * Tests for ExarchClient
 */

import { Address, Hex, zeroAddress } from 'viem'

import { encodeClaimant, packBidStateData } from '../encoding/exarch'
import { ExarchFillParameters, ExarchAdjustment, FillInstruction } from '../types/exarch'
import { BatchCompact } from '../types/eip712'

import { ExarchClient, ExarchClientConfig } from './exarch'

// Mock viem clients
const mockPublicClient = {
  readContract: jest.fn(),
  simulateContract: jest.fn(),
} as any
const mockWalletClient = {
  writeContract: jest.fn(),
  account: { address: '0x1111111111111111111111111111111111111111' },
} as any

// Test addresses
const exarchAddress = '0x2222222222222222222222222222222222222222' as Address
const sponsorAddress = '0x3333333333333333333333333333333333333333' as Address
const adjusterAddress = '0x4444444444444444444444444444444444444444' as Address
const legateAddress = '0x5555555555555555555555555555555555555555' as Address
const recipientAddress = '0x6666666666666666666666666666666666666666' as Address
const tokenAddress = '0x7777777777777777777777777777777777777777' as Address
const lockTag = '0x000000000000000000000001' as Hex

// Test compact
const testCompact: BatchCompact = {
  arbiter: exarchAddress,
  sponsor: sponsorAddress,
  nonce: 1n,
  expires: BigInt(Math.floor(Date.now() / 1000) + 3600),
  commitments: [
    {
      lockTag,
      token: tokenAddress,
      amount: 1000000n,
    },
  ],
}

// Test fill parameters
const testFillParams: ExarchFillParameters = {
  chainId: 1n,
  exarch: exarchAddress,
  expires: BigInt(Math.floor(Date.now() / 1000) + 3600),
  components: [
    {
      fillToken: tokenAddress,
      minimumFillAmount: 500000n,
      recipient: recipientAddress,
      applyScaling: true,
    },
  ],
  bondAmount: 100000000000000000n, // 0.1 ETH
  earnestAmount: 10000000000000000n, // 0.01 ETH
  holdPeriod: 100n,
  baselinePriorityFee: 0n,
  scalingFactor: 1000000000000000000n,
  priceCurve: [],
  recipientCallback: [],
  salt: '0x0000000000000000000000000000000000000000000000000000000000000001' as Hex,
}

// Test adjustment
const testAdjustment: ExarchAdjustment = {
  adjuster: adjusterAddress,
  fillIndex: 0n,
  targetBlock: 1000n,
  supplementalPriceCurve: [],
  validityConditions: '0x0000000000000000000000000000000000000000000000000000000000000000' as Hex,
  nonce: 1n,
  adjustmentAuthorization: '0x' as Hex,
}

describe('ExarchClient', () => {
  let config: ExarchClientConfig
  let client: ExarchClient

  beforeEach(() => {
    config = {
      chainId: 1,
      exarchAddress,
      publicClient: mockPublicClient,
      walletClient: mockWalletClient,
    }
    client = new ExarchClient(config)
    jest.clearAllMocks()
  })

  describe('constructor', () => {
    it('should create client with config', () => {
      expect(client).toBeDefined()
    })

    it('should work without wallet client for view-only operations', () => {
      const viewOnlyClient = new ExarchClient({
        chainId: 1,
        exarchAddress,
        publicClient: mockPublicClient,
      })
      expect(viewOnlyClient).toBeDefined()
    })
  })

  describe('getDomain()', () => {
    it('should return correct EIP-712 domain', () => {
      const domain = client.getDomain()

      expect(domain.name).toBe('Exarch')
      expect(domain.version).toBe('1')
      expect(domain.chainId).toBe(1)
      expect(domain.verifyingContract).toBe(exarchAddress)
    })
  })

  describe('placeBid()', () => {
    it('should place a bid successfully', async () => {
      const txHash = '0xabcd1234' as Hex
      mockWalletClient.writeContract.mockResolvedValue(txHash)

      const claimant = encodeClaimant(lockTag, recipientAddress)
      const result = await client.placeBid(
        {
          compact: testCompact,
          legate: legateAddress,
          fillParams: testFillParams,
          fillHashes: [],
          adjustment: testAdjustment,
          claimant,
        },
        { value: testFillParams.bondAmount }
      )

      expect(result.txHash).toBe(txHash)
      expect(result.claimHash).toMatch(/^0x[0-9a-f]{64}$/)
      expect(result.mandateHash).toMatch(/^0x[0-9a-f]{64}$/)

      expect(mockWalletClient.writeContract).toHaveBeenCalledWith({
        address: exarchAddress,
        abi: expect.any(Array),
        functionName: 'placeBid',
        args: [testCompact, legateAddress, testFillParams, [], testAdjustment, claimant],
        value: testFillParams.bondAmount,
        chain: null,
        account: mockWalletClient.account,
      })
    })

    it('should throw if walletClient is missing', async () => {
      const viewOnlyClient = new ExarchClient({
        chainId: 1,
        exarchAddress,
        publicClient: mockPublicClient,
      })

      await expect(
        viewOnlyClient.placeBid(
          {
            compact: testCompact,
            legate: legateAddress,
            fillParams: testFillParams,
            fillHashes: [],
            adjustment: testAdjustment,
            claimant: '0x' as Hex,
          },
          { value: 0n }
        )
      ).rejects.toThrow('walletClient is required for placeBid')
    })
  })

  describe('registerAndPlaceBid()', () => {
    it('should register and place bid successfully', async () => {
      const txHash = '0xabcd1234' as Hex
      mockWalletClient.writeContract.mockResolvedValue(txHash)

      const sponsorSignature = '0xsignature' as Hex
      const claimant = encodeClaimant(lockTag, recipientAddress)

      const result = await client.registerAndPlaceBid(
        {
          compact: testCompact,
          legate: legateAddress,
          fillParams: testFillParams,
          fillHashes: [],
          adjustment: testAdjustment,
          claimant,
          sponsorSignature,
        },
        { value: testFillParams.bondAmount }
      )

      expect(result.txHash).toBe(txHash)
      expect(mockWalletClient.writeContract).toHaveBeenCalledWith(
        expect.objectContaining({
          functionName: 'registerAndPlaceBid',
          args: expect.arrayContaining([sponsorSignature]),
        })
      )
    })
  })

  describe('registerViaPermit2AndPlaceBid()', () => {
    it('should register via Permit2 and place bid', async () => {
      const txHash = '0xabcd1234' as Hex
      mockWalletClient.writeContract.mockResolvedValue(txHash)

      const permit2Args = {
        permitted: [{ token: tokenAddress, amount: 1000000n }],
        details: { nonce: 1n, deadline: BigInt(Date.now() + 3600000), lockTag },
        signature: '0xpermit2signature' as Hex,
      }
      const claimant = encodeClaimant(lockTag, recipientAddress)

      const result = await client.registerViaPermit2AndPlaceBid(
        {
          compact: testCompact,
          legate: legateAddress,
          fillParams: testFillParams,
          fillHashes: [],
          adjustment: testAdjustment,
          claimant,
          permit2Args,
        },
        { value: testFillParams.bondAmount }
      )

      expect(result.txHash).toBe(txHash)
      expect(mockWalletClient.writeContract).toHaveBeenCalledWith(
        expect.objectContaining({
          functionName: 'registerViaPermit2AndPlaceBid',
        })
      )
    })
  })

  describe('settleBid()', () => {
    it('should settle a bid successfully', async () => {
      const txHash = '0xabcd1234' as Hex
      mockWalletClient.writeContract.mockResolvedValue(txHash)

      const executionHash = '0x1111111111111111111111111111111111111111111111111111111111111111' as Hex
      const result = await client.settleBid({
        claim: {
          compact: testCompact,
          sponsorSignature: '0x' as Hex,
          allocatorSignature: '0x' as Hex,
        },
        adjuster: adjusterAddress,
        legate: legateAddress,
        fillParams: testFillParams,
        fillHashes: [],
        executionHash,
      })

      expect(result.txHash).toBe(txHash)
      expect(mockWalletClient.writeContract).toHaveBeenCalledWith(
        expect.objectContaining({
          functionName: 'settleBid',
          args: expect.arrayContaining([executionHash]),
        })
      )
    })

    it('should throw if walletClient is missing', async () => {
      const viewOnlyClient = new ExarchClient({
        chainId: 1,
        exarchAddress,
        publicClient: mockPublicClient,
      })

      await expect(
        viewOnlyClient.settleBid({
          claim: {
            compact: testCompact,
            sponsorSignature: '0x' as Hex,
            allocatorSignature: '0x' as Hex,
          },
          adjuster: adjusterAddress,
          legate: legateAddress,
          fillParams: testFillParams,
          fillHashes: [],
          executionHash: '0x' as Hex,
        })
      ).rejects.toThrow('walletClient is required for settleBid')
    })
  })

  describe('rescindBid()', () => {
    it('should rescind a bid', async () => {
      const txHash = '0xabcd1234' as Hex
      mockWalletClient.writeContract.mockResolvedValue(txHash)

      const claimHash = '0x1111111111111111111111111111111111111111111111111111111111111111' as Hex
      const result = await client.rescindBid(claimHash)

      expect(result.txHash).toBe(txHash)
      expect(mockWalletClient.writeContract).toHaveBeenCalledWith(
        expect.objectContaining({
          functionName: 'rescindBid',
          args: [claimHash],
        })
      )
    })
  })

  describe('cancel()', () => {
    it('should cancel an auction', async () => {
      const txHash = '0xabcd1234' as Hex
      mockWalletClient.writeContract.mockResolvedValue(txHash)

      const mandateHash = '0x1111111111111111111111111111111111111111111111111111111111111111' as Hex
      const result = await client.cancel(testCompact, mandateHash)

      expect(result.txHash).toBe(txHash)
      expect(mockWalletClient.writeContract).toHaveBeenCalledWith(
        expect.objectContaining({
          functionName: 'cancel',
          args: [testCompact, mandateHash],
        })
      )
    })
  })

  describe('fill()', () => {
    it('should execute a fill', async () => {
      const txHash = '0xabcd1234' as Hex
      mockWalletClient.writeContract.mockResolvedValue(txHash)

      const fillInstructions: FillInstruction[] = [
        {
          fillToken: tokenAddress,
          fillAmount: 500000n,
          recipient: recipientAddress,
        },
      ]
      const claimHash = '0x1111111111111111111111111111111111111111111111111111111111111111' as Hex

      const result = await client.fill({ fillInstructions, claimHash })

      expect(result.txHash).toBe(txHash)
      expect(result.executionHash).toMatch(/^0x[0-9a-f]{64}$/)
      expect(mockWalletClient.writeContract).toHaveBeenCalledWith(
        expect.objectContaining({
          functionName: 'fill',
          args: [fillInstructions, claimHash],
        })
      )
    })

    it('should support native token fills with value', async () => {
      const txHash = '0xabcd1234' as Hex
      mockWalletClient.writeContract.mockResolvedValue(txHash)

      const fillInstructions: FillInstruction[] = [
        {
          fillToken: zeroAddress,
          fillAmount: 1000000000000000000n,
          recipient: recipientAddress,
        },
      ]
      const claimHash = '0x1111111111111111111111111111111111111111111111111111111111111111' as Hex

      await client.fill({ fillInstructions, claimHash }, { value: 1000000000000000000n })

      expect(mockWalletClient.writeContract).toHaveBeenCalledWith(
        expect.objectContaining({
          value: 1000000000000000000n,
        })
      )
    })
  })

  describe('fillAndDispatch()', () => {
    it('should fill and dispatch', async () => {
      const txHash = '0xabcd1234' as Hex
      mockWalletClient.writeContract.mockResolvedValue(txHash)

      const mandateHash = '0x2222222222222222222222222222222222222222222222222222222222222222' as Hex
      const fillInstructions: FillInstruction[] = [
        {
          fillToken: tokenAddress,
          fillAmount: 500000n,
          recipient: recipientAddress,
        },
      ]
      const dispatchParameters = {
        chainId: 10n,
        target: recipientAddress,
        value: 0n,
        context: '0x' as Hex,
      }

      const result = await client.fillAndDispatch({
        compact: testCompact,
        mandateHash,
        fillInstructions,
        dispatchParameters,
      })

      expect(result.txHash).toBe(txHash)
      expect(result.claimHash).toMatch(/^0x[0-9a-f]{64}$/)
      expect(result.executionHash).toMatch(/^0x[0-9a-f]{64}$/)
    })
  })

  describe('dispatch()', () => {
    it('should dispatch a callback', async () => {
      const txHash = '0xabcd1234' as Hex
      mockWalletClient.writeContract.mockResolvedValue(txHash)

      const mandateHash = '0x2222222222222222222222222222222222222222222222222222222222222222' as Hex
      const executionHash = '0x3333333333333333333333333333333333333333333333333333333333333333' as Hex
      const dispatchParams = {
        chainId: 10n,
        target: recipientAddress,
        value: 0n,
        context: '0x' as Hex,
      }

      const result = await client.dispatch({
        compact: testCompact,
        mandateHash,
        dispatchParams,
        executionHash,
      })

      expect(result.txHash).toBe(txHash)
      expect(result.claimHash).toMatch(/^0x[0-9a-f]{64}$/)
    })
  })

  describe('claimAndFill()', () => {
    it('should claim and fill atomically', async () => {
      const txHash = '0xabcd1234' as Hex
      const claimHash = '0x4444444444444444444444444444444444444444444444444444444444444444' as Hex
      const fillAmounts = [500000n]
      const claimAmounts = [1000000n]

      mockPublicClient.simulateContract.mockResolvedValue({
        result: [claimHash, fillAmounts, claimAmounts],
      })
      mockWalletClient.writeContract.mockResolvedValue(txHash)

      const mandateHash = '0x2222222222222222222222222222222222222222222222222222222222222222' as Hex
      const claimant = encodeClaimant(lockTag, recipientAddress)

      const result = await client.claimAndFill({
        claim: {
          compact: testCompact,
          sponsorSignature: '0x' as Hex,
          allocatorSignature: '0x' as Hex,
        },
        mandateHash,
        fillParams: testFillParams,
        adjustment: testAdjustment,
        claimant,
      })

      expect(result.txHash).toBe(txHash)
      expect(result.claimHash).toBe(claimHash)
      expect(result.fillAmounts).toEqual(fillAmounts)
      expect(result.claimAmounts).toEqual(claimAmounts)
    })
  })

  describe('getAuctionState()', () => {
    it('should return auction state', async () => {
      const bidder = '0x8888888888888888888888888888888888888888' as Address
      const bond = 100000000000000000n
      const expiry = 1000n
      const claimant = '0x0000000000000000000000000000000000000000000000000000000000000001' as Hex

      mockPublicClient.readContract.mockResolvedValue([bidder, bond, expiry, claimant, false, false])

      const claimHash = '0x1111111111111111111111111111111111111111111111111111111111111111' as Hex
      const state = await client.getAuctionState(claimHash)

      expect(state.bidder).toBe(bidder)
      expect(state.bond).toBe(bond)
      expect(state.expiry).toBe(expiry)
      expect(state.claimant).toBe(claimant)
      expect(state.isFilled).toBe(false)
      expect(state.cancelled).toBe(false)

      expect(mockPublicClient.readContract).toHaveBeenCalledWith({
        address: exarchAddress,
        abi: expect.any(Array),
        functionName: 'getAuctionState',
        args: [claimHash],
      })
    })

    it('should handle filled auction', async () => {
      mockPublicClient.readContract.mockResolvedValue([zeroAddress, 100n, 0n, '0x' as Hex, true, false])

      const claimHash = '0x1111111111111111111111111111111111111111111111111111111111111111' as Hex
      const state = await client.getAuctionState(claimHash)

      expect(state.isFilled).toBe(true)
      expect(state.cancelled).toBe(false)
    })

    it('should handle cancelled auction', async () => {
      mockPublicClient.readContract.mockResolvedValue([zeroAddress, 0n, 0n, '0x' as Hex, false, true])

      const claimHash = '0x1111111111111111111111111111111111111111111111111111111111111111' as Hex
      const state = await client.getAuctionState(claimHash)

      expect(state.isFilled).toBe(false)
      expect(state.cancelled).toBe(true)
    })
  })

  describe('canPlaceBid()', () => {
    it('should return true when bid can be placed', async () => {
      mockPublicClient.readContract.mockResolvedValue(true)

      const claimHash = '0x1111111111111111111111111111111111111111111111111111111111111111' as Hex
      const result = await client.canPlaceBid(claimHash)

      expect(result).toBe(true)
    })

    it('should return false when bid cannot be placed', async () => {
      mockPublicClient.readContract.mockResolvedValue(false)

      const claimHash = '0x1111111111111111111111111111111111111111111111111111111111111111' as Hex
      const result = await client.canPlaceBid(claimHash)

      expect(result).toBe(false)
    })
  })

  describe('getBidState()', () => {
    it('should return unpacked bid state', async () => {
      const claimant = '0x0000000000000000000000000000000000000001aabbccdd1122334455667788' as Hex
      const scalingFactor = 1000000000000000000n
      const packedData = packBidStateData({
        aggregateBond: 100000000000000000n,
        bidExpiry: 12345n,
        fillIndex: 0,
        filled: false,
        cancelled: false,
      })

      mockPublicClient.readContract.mockResolvedValue({
        claimant,
        scalingFactor,
        packedData,
      })

      const claimHash = '0x1111111111111111111111111111111111111111111111111111111111111111' as Hex
      const state = await client.getBidState(claimHash)

      expect(state.claimant).toBe(claimant)
      expect(state.scalingFactor).toBe(scalingFactor)
      expect(state.aggregateBond).toBe(100000000000000000n)
      expect(state.bidExpiry).toBe(12345n)
      expect(state.fillIndex).toBe(0)
      expect(state.filled).toBe(false)
      expect(state.cancelled).toBe(false)
    })
  })

  describe('isExecuted()', () => {
    it('should return true for executed hash', async () => {
      mockPublicClient.readContract.mockResolvedValue(true)

      const executionHash = '0x1111111111111111111111111111111111111111111111111111111111111111' as Hex
      const result = await client.isExecuted(executionHash)

      expect(result).toBe(true)
    })

    it('should return false for non-executed hash', async () => {
      mockPublicClient.readContract.mockResolvedValue(false)

      const executionHash = '0x1111111111111111111111111111111111111111111111111111111111111111' as Hex
      const result = await client.isExecuted(executionHash)

      expect(result).toBe(false)
    })
  })

  describe('isNonceConsumed()', () => {
    it('should return true for consumed nonce', async () => {
      mockPublicClient.readContract.mockResolvedValue(true)

      const result = await client.isNonceConsumed(adjusterAddress, 1n)

      expect(result).toBe(true)
      expect(mockPublicClient.readContract).toHaveBeenCalledWith({
        address: exarchAddress,
        abi: expect.any(Array),
        functionName: 'isNonceConsumed',
        args: [adjusterAddress, 1n],
      })
    })

    it('should return false for unconsumed nonce', async () => {
      mockPublicClient.readContract.mockResolvedValue(false)

      const result = await client.isNonceConsumed(adjusterAddress, 999n)

      expect(result).toBe(false)
    })
  })

  describe('helper methods', () => {
    describe('computeMandateHash()', () => {
      it('should compute mandate hash correctly', () => {
        const fills = [testFillParams]
        const hash = client.computeMandateHash(adjusterAddress, legateAddress, fills)

        expect(hash).toMatch(/^0x[0-9a-f]{64}$/)
      })

      it('should return consistent results', () => {
        const fills = [testFillParams]
        const hash1 = client.computeMandateHash(adjusterAddress, legateAddress, fills)
        const hash2 = client.computeMandateHash(adjusterAddress, legateAddress, fills)

        expect(hash1).toBe(hash2)
      })

      it('should return different hashes for different inputs', () => {
        const fills = [testFillParams]
        const hash1 = client.computeMandateHash(adjusterAddress, legateAddress, fills)
        const hash2 = client.computeMandateHash(legateAddress, adjusterAddress, fills) // Swapped

        expect(hash1).not.toBe(hash2)
      })
    })

    describe('computeClaimHash()', () => {
      it('should compute claim hash correctly', () => {
        const mandateHash = '0x1111111111111111111111111111111111111111111111111111111111111111' as Hex
        const hash = client.computeClaimHash(testCompact, mandateHash)

        expect(hash).toMatch(/^0x[0-9a-f]{64}$/)
      })
    })

    describe('computeExecutionHash()', () => {
      it('should compute execution hash correctly', () => {
        const fillInstructions: FillInstruction[] = [
          {
            fillToken: tokenAddress,
            fillAmount: 500000n,
            recipient: recipientAddress,
          },
        ]
        const claimHash = '0x1111111111111111111111111111111111111111111111111111111111111111' as Hex
        const hash = client.computeExecutionHash(fillInstructions, claimHash)

        expect(hash).toMatch(/^0x[0-9a-f]{64}$/)
      })
    })
  })
})
