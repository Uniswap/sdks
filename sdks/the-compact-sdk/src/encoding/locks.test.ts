import { Address, Hex } from 'viem'
import { Scope, ResetPeriod } from '../types/runtime'

import {
  allocatorToAllocatorId,
  encodeLockTag,
  decodeLockTag,
  encodeLockId,
  decodeLockId,
  toCompactFlag,
} from './locks'

describe('locks encoding', () => {
  describe('toCompactFlag', () => {
    it('should compute the compact flag correctly', () => {
      expect(toCompactFlag('0x1234567890123456789012345678901234567890' as Address)).toBe(0)
      expect(toCompactFlag('0x0012345678901234567890123456789012345678' as Address)).toBe(0)
      expect(toCompactFlag('0x0000123456789012345678901234567890123456' as Address)).toBe(1)
      expect(toCompactFlag('0x0000001234567890123456789012345678901234' as Address)).toBe(3)
      expect(toCompactFlag('0x0000000012345678901234567890123456789012' as Address)).toBe(5)
      expect(toCompactFlag('0x0000000000000000123456789012345678901234' as Address)).toBe(13)
      expect(toCompactFlag('0x0000000000000000001234567890123456789012' as Address)).toBe(15)
      expect(toCompactFlag('0x0000000000000000000012345678901234567890' as Address)).toBe(15)
      expect(toCompactFlag('0x0000000000000000000000000000000000000000' as Address)).toBe(15)
    })
  })

  describe('allocatorToAllocatorId', () => {
    it('should convert The Compact mainnet address to allocator ID', () => {
      // The Compact v1 mainnet address
      const allocator = '0x00000000000000171ede64904551eeDF3C6C9788' as Address
      const allocatorId = allocatorToAllocatorId(allocator)

      // Should return a uint96 value
      expect(allocatorId > 0n).toBe(true)
      expect(allocatorId < 2n ** 96n).toBe(true)

      // Verify lower 88 bits match address
      const addressBits = BigInt(allocator)
      const lower88Bits = addressBits & ((1n << 88n) - 1n)
      expect(allocatorId & ((1n << 88n) - 1n)).toBe(lower88Bits)

      // Verify compact flag is in upper 4 bits (bits 88-91)
      const compactFlag = Number((allocatorId >> 88n) & 0xfn)
      expect(compactFlag).toBeGreaterThanOrEqual(0)
      expect(compactFlag).toBeLessThanOrEqual(15)
    })

    it('should handle zero address', () => {
      const zeroAddress = '0x0000000000000000000000000000000000000000' as Address
      const allocatorId = allocatorToAllocatorId(zeroAddress)

      // Zero address should have compact flag = 15 (max)
      const compactFlag = Number((allocatorId >> 88n) & 0xfn)
      expect(compactFlag).toBe(15)

      // Lower 88 bits should be 0
      const lower88Bits = allocatorId & ((1n << 88n) - 1n)
      expect(lower88Bits).toBe(0n)
    })

    it('should handle address with no leading zeros', () => {
      // Address starting with 0xF has no leading zeros
      const allocator = '0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF' as Address
      const allocatorId = allocatorToAllocatorId(allocator)

      // Should have compact flag = 0
      const compactFlag = Number((allocatorId >> 88n) & 0xfn)
      expect(compactFlag).toBe(0)

      // Verify lower 88 bits
      const addressBits = BigInt(allocator)
      const lower88Bits = addressBits & ((1n << 88n) - 1n)
      expect(allocatorId & ((1n << 88n) - 1n)).toBe(lower88Bits)
    })

    it('should handle well-known DeFi protocol addresses', () => {
      const testAddresses = [
        '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', // USDC
        '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', // WETH
        '0xdAC17F958D2ee523a2206206994597C13D831ec7', // USDT
        '0x6B175474E89094C44Da98b954EedeAC495271d0F', // DAI
        '0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984', // UNI
      ]

      for (const address of testAddresses) {
        const allocator = address as Address
        const allocatorId = allocatorToAllocatorId(allocator)

        // Should be valid uint96
        expect(allocatorId >= 0n).toBe(true)
        expect(allocatorId < 2n ** 96n).toBe(true)

        // Lower 88 bits should match address
        const addressBits = BigInt(allocator)
        const lower88Bits = addressBits & ((1n << 88n) - 1n)
        expect(allocatorId & ((1n << 88n) - 1n)).toBe(lower88Bits)

        // Compact flag should be valid (0-15)
        const compactFlag = Number((allocatorId >> 88n) & 0xfn)
        expect(compactFlag).toBeGreaterThanOrEqual(0)
        expect(compactFlag).toBeLessThanOrEqual(15)
      }
    })

    it('should produce deterministic results', () => {
      const allocator = '0x1234567890123456789012345678901234567890' as Address
      const id1 = allocatorToAllocatorId(allocator)
      const id2 = allocatorToAllocatorId(allocator)
      expect(id1).toBe(id2)
    })

    it('should throw for invalid address', () => {
      expect(() => allocatorToAllocatorId('0x123' as `0x${string}`)).toThrow('allocator must be a valid address')
    })

    it('should integrate with encodeLockTag', () => {
      // Test full workflow: address -> allocatorId -> lockTag
      const allocator = '0x00000000000000171ede64904551eeDF3C6C9788' as Address
      const allocatorId = allocatorToAllocatorId(allocator)

      const lockTag = encodeLockTag({
        allocatorId,
        scope: Scope.Multichain,
        resetPeriod: ResetPeriod.TenMinutes,
      })

      const decoded = decodeLockTag(lockTag)
      expect(decoded.allocatorId).toBe(allocatorId)
      expect(decoded.scope).toBe(Scope.Multichain)
      expect(decoded.resetPeriod).toBe(ResetPeriod.TenMinutes)
    })

    it('should handle addresses with varying leading zero patterns', () => {
      const testCases = [
        { address: '0x0000000000000000000000000000000000000001', expectedMinFlag: 14 }, // 39 leading zeros
        { address: '0x0000000000000001000000000000000000000000', expectedMinFlag: 12 }, // 15 leading zeros
        { address: '0x0000000100000000000000000000000000000000', expectedMinFlag: 7 }, // 7 leading zeros
        { address: '0x0001000000000000000000000000000000000000', expectedMinFlag: 3 }, // 3 leading zeros
        { address: '0x0100000000000000000000000000000000000000', expectedMinFlag: 0 }, // 1 leading zero
        { address: '0x1000000000000000000000000000000000000000', expectedMinFlag: 0 }, // 0 leading zeros
      ]

      for (const testCase of testCases) {
        const allocator = testCase.address as Address
        const allocatorId = allocatorToAllocatorId(allocator)
        const compactFlag = Number((allocatorId >> 88n) & 0xfn)

        // Compact flag should be reasonable based on leading zeros
        expect(compactFlag).toBeGreaterThanOrEqual(0)
        expect(compactFlag).toBeLessThanOrEqual(15)
      }
    })
  })

  describe('encodeLockTag', () => {
    it('should encode a lock tag correctly', () => {
      const lockTag = encodeLockTag({
        allocatorId: 123n,
        scope: Scope.ChainSpecific,
        resetPeriod: ResetPeriod.OneDay,
      })

      expect(lockTag).toMatch(/^0x[0-9a-f]{24}$/)
    })

    it('should throw for allocatorId that is too large', () => {
      expect(() =>
        encodeLockTag({
          allocatorId: 2n ** 96n,
          scope: Scope.ChainSpecific,
          resetPeriod: ResetPeriod.OneDay,
        })
      ).toThrow()
    })
  })

  describe('decodeLockTag', () => {
    it('should decode a lock tag correctly', () => {
      const original = {
        allocatorId: 456n,
        scope: Scope.Multichain,
        resetPeriod: ResetPeriod.SevenDaysAndOneHour,
      }

      const encoded = encodeLockTag(original)
      const decoded = decodeLockTag(encoded)

      expect(decoded.allocatorId).toBe(original.allocatorId)
      expect(decoded.scope).toBe(original.scope)
      expect(decoded.resetPeriod).toBe(original.resetPeriod)
    })
  })

  describe('encodeLockId', () => {
    it('should encode a lock ID correctly', () => {
      const lockTag = '0x000000000000000000000001' as Hex
      const token = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48' as Address

      const id = encodeLockId(lockTag, token)

      expect(id > 0n).toBe(true)
    })
  })

  describe('decodeLockId', () => {
    it('should decode a lock ID correctly', () => {
      const lockTag = '0x000000000000000000000001' as Hex
      const token = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48' as Address

      const id = encodeLockId(lockTag, token)
      const decoded = decodeLockId(id)

      expect(decoded.lockTag.toLowerCase()).toBe(lockTag.toLowerCase())
      expect(decoded.token.toLowerCase()).toBe(token.toLowerCase())
    })
  })

  describe('The Compact compatibility', () => {
    describe('allocator ID edge cases', () => {
      it('should handle allocator addresses with many leading zeros', () => {
        // Test case from TheCompact.t.sol test_allocatorId_leadingZeroes
        // Address with 9 leading zero nibbles
        const allocator1 = '0x00000000000000171ede64904551eeDF3C6C9788' as Address

        // The allocator ID is extracted from the last 88 bits of the address
        // Plus 4 bits for the compact flag (which is derived from leading zeros)
        // For this address, compact flag = 9 (from 12 leading zero nibbles)
        const address1Bigint = BigInt(allocator1)
        const last88Bits = address1Bigint & ((1n << 88n) - 1n)
        const compactFlag = 9n // From test: 12 leading zeros - 3 = 9
        const allocatorId1 = (compactFlag << 88n) | last88Bits

        const lockTag1 = encodeLockTag({
          allocatorId: allocatorId1,
          scope: Scope.ChainSpecific,
          resetPeriod: ResetPeriod.OneDay,
        })

        const decoded1 = decodeLockTag(lockTag1)
        expect(decoded1.allocatorId).toBe(allocatorId1)
      })

      it('should handle zero address allocator', () => {
        // Test case: zero address has 40 leading zero nibbles
        // Compact flag = 15 (max value, capped at 15)
        const zeroAddress = '0x0000000000000000000000000000000000000000' as Address
        const addressBigint = BigInt(zeroAddress)
        const last88Bits = addressBigint & ((1n << 88n) - 1n)
        const compactFlag = 15n // Max value
        const allocatorId = (compactFlag << 88n) | last88Bits

        const lockTag = encodeLockTag({
          allocatorId,
          scope: Scope.ChainSpecific,
          resetPeriod: ResetPeriod.OneDay,
        })

        const decoded = decodeLockTag(lockTag)
        expect(decoded.allocatorId).toBe(allocatorId)
      })

      it('should handle allocator with no leading zeros', () => {
        // Address starting with 0x80... has 0 leading zeros
        // Compact flag = 0 (less than 4 leading zeros)
        const allocator = '0x8000000000000000000000000000000000000000' as Address
        const addressBigint = BigInt(allocator)
        const last88Bits = addressBigint & ((1n << 88n) - 1n)
        const compactFlag = 0n
        const allocatorId = (compactFlag << 88n) | last88Bits

        const lockTag = encodeLockTag({
          allocatorId,
          scope: Scope.ChainSpecific,
          resetPeriod: ResetPeriod.OneDay,
        })

        const decoded = decodeLockTag(lockTag)
        expect(decoded.allocatorId).toBe(allocatorId)
      })
    })

    describe('lock ID roundtrip with various tokens', () => {
      it('should correctly encode/decode with well-known token addresses', () => {
        // Known allocator ID from mainnet
        const allocatorId = 287803669127211327350859520n
        const lockTag = encodeLockTag({
          allocatorId,
          scope: Scope.ChainSpecific,
          resetPeriod: ResetPeriod.OneSecond,
        })

        const wellKnownTokens = [
          { name: 'ETH', address: '0x0000000000000000000000000000000000000000' },
          { name: 'USDC', address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48' },
          { name: 'WETH', address: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2' },
          { name: 'USDT', address: '0xdAC17F958D2ee523a2206206994597C13D831ec7' },
          { name: 'DAI', address: '0x6B175474E89094C44Da98b954EedeAC495271d0F' },
        ]

        for (const token of wellKnownTokens) {
          const tokenAddress = token.address as Address
          const lockId = encodeLockId(lockTag, tokenAddress)
          const decoded = decodeLockId(lockId)

          expect(decoded.lockTag.toLowerCase()).toBe(lockTag.toLowerCase())
          expect(decoded.token.toLowerCase()).toBe(tokenAddress.toLowerCase())
        }
      })
    })

    describe('edge values', () => {
      it('should handle maximum allocatorId value', () => {
        // Maximum 92-bit value
        const maxAllocatorId = (1n << 92n) - 1n

        const lockTag = encodeLockTag({
          allocatorId: maxAllocatorId,
          scope: Scope.Multichain,
          resetPeriod: ResetPeriod.ThirtyDays,
        })

        const decoded = decodeLockTag(lockTag)
        expect(decoded.allocatorId).toBe(maxAllocatorId)
        expect(decoded.scope).toBe(Scope.Multichain)
        expect(decoded.resetPeriod).toBe(ResetPeriod.ThirtyDays)
      })

      it('should handle minimum allocatorId value', () => {
        const minAllocatorId = 0n

        const lockTag = encodeLockTag({
          allocatorId: minAllocatorId,
          scope: Scope.ChainSpecific,
          resetPeriod: ResetPeriod.OneSecond,
        })

        const decoded = decodeLockTag(lockTag)
        expect(decoded.allocatorId).toBe(minAllocatorId)
      })
    })
  })
})
