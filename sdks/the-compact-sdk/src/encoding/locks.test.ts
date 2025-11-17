import { encodeLockTag, decodeLockTag, encodeLockId, decodeLockId } from './locks'
import { Scope, ResetPeriod } from '../types/runtime'

describe('locks encoding', () => {
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
      const lockTag = '0x000000000000000000000001' as `0x${string}`
      const token = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48' as `0x${string}`

      const id = encodeLockId(lockTag, token)

      expect(id > 0n).toBe(true)
    })
  })

  describe('decodeLockId', () => {
    it('should decode a lock ID correctly', () => {
      const lockTag = '0x000000000000000000000001' as `0x${string}`
      const token = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48' as `0x${string}`

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
        const allocator1 = '0x00000000000000171ede64904551eeDF3C6C9788' as `0x${string}`

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
        const zeroAddress = '0x0000000000000000000000000000000000000000' as `0x${string}`
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
        const allocator = '0x8000000000000000000000000000000000000000' as `0x${string}`
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
          const tokenAddress = token.address as `0x${string}`
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

