/**
 * Tests for ViewClient
 */

import { Address, Hex } from 'viem'

import { encodeLockId } from '../encoding/locks'
import { ResetPeriod, Scope } from '../types/runtime'

import { CompactClientConfig } from './coreClient'
import { ViewClient } from './view'

// Mock viem clients
const mockPublicClient = {
  readContract: jest.fn(),
} as any

const testAddress = '0x00000000000000171ede64904551eeDF3C6C9788' as Address
const sponsorAddress = '0x1234567890123456789012345678901234567890' as Address
const allocatorAddress = '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd' as Address
const tokenAddress = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48' as Address

describe('ViewClient', () => {
  let config: CompactClientConfig
  let client: ViewClient

  beforeEach(() => {
    config = {
      chainId: 1,
      address: testAddress,
      publicClient: mockPublicClient,
    }
    client = new ViewClient(config)
    jest.clearAllMocks()
  })

  describe('getLockDetails()', () => {
    it('should get lock details', async () => {
      const lockId = encodeLockId('0x123456789012345678901234' as Hex, tokenAddress)

      // Mock contract response [token, allocator, resetPeriod, scope, lockTag]
      mockPublicClient.readContract.mockResolvedValue([
        tokenAddress,
        allocatorAddress,
        ResetPeriod.TenMinutes,
        Scope.Multichain,
        '0x123456789012345678901234',
      ])

      const result = await client.getLockDetails(lockId)

      expect(mockPublicClient.readContract).toHaveBeenCalledWith({
        address: testAddress,
        abi: expect.any(Array),
        functionName: 'getLockDetails',
        args: [lockId],
      })

      expect(result.token).toBe(tokenAddress)
      expect(result.allocator).toBe(allocatorAddress)
      expect(result.resetPeriod).toBe(ResetPeriod.TenMinutes)
      expect(result.scope).toBe(Scope.Multichain)
      expect(result.lockTag).toBe('0x123456789012345678901234')
    })

    it('should throw if contract address is missing', async () => {
      const clientWithoutAddress = new ViewClient({
        ...config,
        address: undefined,
      })

      await expect(clientWithoutAddress.getLockDetails(100n)).rejects.toThrow('contract address is required')
    })
  })

  describe('isRegistered()', () => {
    it('should check if claim is registered', async () => {
      const claimHash = '0x1111111111111111111111111111111111111111111111111111111111111111' as Hex
      const typehash = '0x2222222222222222222222222222222222222222222222222222222222222222' as `0x${string}`

      mockPublicClient.readContract.mockResolvedValue(true)

      const result = await client.isRegistered({
        sponsor: sponsorAddress,
        claimHash,
        typehash,
      })

      expect(mockPublicClient.readContract).toHaveBeenCalledWith({
        address: testAddress,
        abi: expect.any(Array),
        functionName: 'isRegistered',
        args: [sponsorAddress, claimHash, typehash],
      })

      expect(result).toBe(true)
    })

    it('should return false for unregistered claim', async () => {
      const claimHash = '0x1111111111111111111111111111111111111111111111111111111111111111' as Hex
      const typehash = '0x2222222222222222222222222222222222222222222222222222222222222222' as Hex

      mockPublicClient.readContract.mockResolvedValue(false)

      const result = await client.isRegistered({
        sponsor: sponsorAddress,
        claimHash,
        typehash,
      })

      expect(result).toBe(false)
    })

    it('should throw if contract address is missing', async () => {
      const clientWithoutAddress = new ViewClient({
        ...config,
        address: undefined,
      })

      await expect(
        clientWithoutAddress.isRegistered({
          sponsor: sponsorAddress,
          claimHash: '0x1111111111111111111111111111111111111111111111111111111111111111' as `0x${string}`,
          typehash: '0x2222222222222222222222222222222222222222222222222222222222222222' as `0x${string}`,
        })
      ).rejects.toThrow('contract address is required')
    })
  })

  describe('balanceOf()', () => {
    it('should get balance for account and id', async () => {
      const lockId = 100n
      const balance = 1000000n

      mockPublicClient.readContract.mockResolvedValue(balance)

      const result = await client.balanceOf({
        account: sponsorAddress,
        id: lockId,
      })

      expect(mockPublicClient.readContract).toHaveBeenCalledWith({
        address: testAddress,
        abi: expect.any(Array),
        functionName: 'balanceOf',
        args: [sponsorAddress, lockId],
      })

      expect(result).toBe(balance)
    })

    it('should throw if contract address is missing', async () => {
      const clientWithoutAddress = new ViewClient({
        ...config,
        address: undefined,
      })

      await expect(
        clientWithoutAddress.balanceOf({
          account: sponsorAddress,
          id: 100n,
        })
      ).rejects.toThrow('contract address is required')
    })
  })

  describe('hasConsumedAllocatorNonce()', () => {
    it('should check if allocator nonce is consumed', async () => {
      const nonce = 42n

      mockPublicClient.readContract.mockResolvedValue(true)

      const result = await client.hasConsumedAllocatorNonce({
        nonce,
        allocator: allocatorAddress,
      })

      expect(mockPublicClient.readContract).toHaveBeenCalledWith({
        address: testAddress,
        abi: expect.any(Array),
        functionName: 'hasConsumedAllocatorNonce',
        args: [nonce, allocatorAddress],
      })

      expect(result).toBe(true)
    })

    it('should return false for unconsumed nonce', async () => {
      const nonce = 42n

      mockPublicClient.readContract.mockResolvedValue(false)

      const result = await client.hasConsumedAllocatorNonce({
        nonce,
        allocator: allocatorAddress,
      })

      expect(result).toBe(false)
    })

    it('should throw if contract address is missing', async () => {
      const clientWithoutAddress = new ViewClient({
        ...config,
        address: undefined,
      })

      await expect(
        clientWithoutAddress.hasConsumedAllocatorNonce({
          nonce: 42n,
          allocator: allocatorAddress,
        })
      ).rejects.toThrow('contract address is required')
    })
  })

  describe('getForcedWithdrawalStatus()', () => {
    it('should get forced withdrawal status when enabled', async () => {
      const lockId = 100n
      const withdrawableAt = BigInt(Date.now() + 86400000) // 24 hours from now

      // Mock contract returns [status enum, withdrawableAt]
      mockPublicClient.readContract.mockResolvedValue([2, withdrawableAt]) // 2 = Enabled

      const result = await client.getForcedWithdrawalStatus(sponsorAddress, lockId)

      expect(mockPublicClient.readContract).toHaveBeenCalledWith({
        address: testAddress,
        abi: expect.any(Array),
        functionName: 'getForcedWithdrawalStatus',
        args: [sponsorAddress, lockId],
      })

      expect(result.status).toBe(2) // ForcedWithdrawalStatusEnum.Enabled
      expect(result.withdrawableAt).toBe(withdrawableAt)
    })

    it('should get forced withdrawal status when pending', async () => {
      const lockId = 100n
      const withdrawableAt = BigInt(Date.now() + 86400000) // 24 hours from now

      // Mock contract returns [status enum, withdrawableAt]
      mockPublicClient.readContract.mockResolvedValue([1, withdrawableAt]) // 1 = Pending

      const result = await client.getForcedWithdrawalStatus(sponsorAddress, lockId)

      expect(result.status).toBe(1) // ForcedWithdrawalStatusEnum.Pending
      expect(result.withdrawableAt).toBe(withdrawableAt)
    })

    it('should get forced withdrawal status when disabled', async () => {
      const lockId = 100n

      // Mock contract returns [status enum, withdrawableAt]
      mockPublicClient.readContract.mockResolvedValue([0, 0n]) // 0 = Disabled

      const result = await client.getForcedWithdrawalStatus(sponsorAddress, lockId)

      expect(result.status).toBe(0) // ForcedWithdrawalStatusEnum.Disabled
      expect(result.withdrawableAt).toBe(0n)
    })

    it('should throw if contract address is missing', async () => {
      const clientWithoutAddress = new ViewClient({
        ...config,
        address: undefined,
      })

      await expect(clientWithoutAddress.getForcedWithdrawalStatus(sponsorAddress, 100n)).rejects.toThrow(
        'contract address is required'
      )
    })
  })

  describe('getDomainSeparator()', () => {
    it('should get domain separator', async () => {
      const domainSeparator = '0x3333333333333333333333333333333333333333333333333333333333333333' as `0x${string}`

      mockPublicClient.readContract.mockResolvedValue(domainSeparator)

      const result = await client.getDomainSeparator()

      expect(mockPublicClient.readContract).toHaveBeenCalledWith({
        address: testAddress,
        abi: expect.any(Array),
        functionName: 'DOMAIN_SEPARATOR',
      })

      expect(result).toBe(domainSeparator)
    })

    it('should throw if contract address is missing', async () => {
      const clientWithoutAddress = new ViewClient({
        ...config,
        address: undefined,
      })

      await expect(clientWithoutAddress.getDomainSeparator()).rejects.toThrow('contract address is required')
    })
  })

  describe('getEmissaryStatus()', () => {
    it('should get emissary status', async () => {
      const lockTag = '0x000000000000000000000001' as Hex
      const emissary = '0x1111111111111111111111111111111111111111' as Address
      const availableAt = 123n

      mockPublicClient.readContract.mockResolvedValue([2, availableAt, emissary])

      const result = await client.getEmissaryStatus(sponsorAddress, lockTag)

      expect(mockPublicClient.readContract).toHaveBeenCalledWith({
        address: testAddress,
        abi: expect.any(Array),
        functionName: 'getEmissaryStatus',
        args: [sponsorAddress, lockTag],
      })

      expect(result.status).toBe(2)
      expect(result.emissaryAssignmentAvailableAt).toBe(availableAt)
      expect(result.currentEmissary).toBe(emissary)
    })
  })

  describe('allowance()', () => {
    it('should return allowance for owner/spender/id', async () => {
      mockPublicClient.readContract.mockResolvedValue(123n)
      const result = await client.allowance({ owner: sponsorAddress, spender: allocatorAddress, id: 1n })
      expect(result).toBe(123n)
    })
  })

  describe('isOperator()', () => {
    it('should return operator status', async () => {
      mockPublicClient.readContract.mockResolvedValue(true)
      const result = await client.isOperator({ owner: sponsorAddress, operator: allocatorAddress })
      expect(result).toBe(true)
    })
  })

  describe('getRequiredWithdrawalFallbackStipends()', () => {
    it('should return stipend tuple', async () => {
      mockPublicClient.readContract.mockResolvedValue([1n, 2n])
      const result = await client.getRequiredWithdrawalFallbackStipends()
      expect(result).toEqual({ nativeTokenStipend: 1n, erc20TokenStipend: 2n })
    })
  })
})
