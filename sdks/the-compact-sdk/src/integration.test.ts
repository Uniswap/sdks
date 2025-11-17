/**
 * Integration tests against The Compact mainnet deployment
 *
 * These tests validate SDK logic against real on-chain data:
 * - Contract: 0x00000000000000171ede64904551eeDF3C6C9788 (mainnet)
 * - Known allocator: 0x060471752Be4DB56AaEe10CC2a753794795b6700
 * - Known deposit: 1 ETH by 0x0734d56DA60852A03e2Aafae8a36FFd8c12B32f1
 */

import { describe, it, expect } from '@jest/globals'
import { createPublicClient, http } from 'viem'
import { mainnet } from 'viem/chains'
import { encodeLockTag, decodeLockTag, encodeLockId, decodeLockId } from './encoding/locks'
import { Scope, ResetPeriod } from './types/runtime'
import { createCompactClient } from './client/coreClient'

// Known mainnet values
const MAINNET_COMPACT_ADDRESS = '0x00000000000000171ede64904551eeDF3C6C9788' as const
const DOMAIN_SEPARATOR = '0x4ac11bdf0eb5972bae47825af851d20c342d88f466669ec58827be03650df019' as const
const KNOWN_ALLOCATOR = '0x060471752Be4DB56AaEe10CC2a753794795b6700' as const
const KNOWN_ALLOCATOR_ID = 287803669127211327350859520n
const KNOWN_DEPOSITOR = '0x0734d56DA60852A03e2Aafae8a36FFd8c12B32f1' as const
const KNOWN_LOCK_TAG = '0x00ee10cc2a753794795b6700' as const
const NATIVE_ETH_ADDRESS = '0x0000000000000000000000000000000000000000' as const
const KNOWN_TOKEN_ID_HEX = '0x00ee10cc2a753794795b67000000000000000000000000000000000000000000' as const
const KNOWN_TOKEN_ID_DECIMAL = 420625533659260790152146045461395372006532003561106597619092546332938731520n

// Skip integration tests by default (require RPC connection)
// Run with: npm test -- --testPathPattern=integration
const describeIntegration = process.env.RPC_URL ? describe : describe.skip

describeIntegration('The Compact SDK - Mainnet Integration', () => {
  // Create a public client for mainnet queries
  const publicClient = createPublicClient({
    chain: mainnet,
    transport: http(),
  })

  describe('lockTag encoding/decoding', () => {
    it('should correctly encode and decode the known lock tag', () => {
      // Decode the known lock tag to verify our decoding logic
      const decoded = decodeLockTag(KNOWN_LOCK_TAG)

      expect(decoded.allocatorId).toBe(KNOWN_ALLOCATOR_ID)
      expect(decoded.scope).toBe(Scope.Multichain)
      expect(decoded.resetPeriod).toBe(ResetPeriod.OneSecond)

      // Re-encode it and verify we get the same value back
      const reencoded = encodeLockTag(decoded)
      expect(reencoded.toLowerCase()).toBe(KNOWN_LOCK_TAG.toLowerCase())
    })

    it('should produce the correct token ID from lock tag and token address', () => {
      // Encode the lock ID from the known lock tag and native ETH address
      const tokenId = encodeLockId(KNOWN_LOCK_TAG, NATIVE_ETH_ADDRESS)

      // Verify the encoded token ID matches the known value
      expect(tokenId).toBe(KNOWN_TOKEN_ID_DECIMAL)
      expect(`0x${tokenId.toString(16).padStart(64, '0')}`).toBe(KNOWN_TOKEN_ID_HEX.toLowerCase())
    })

    it('should correctly decode the token ID back to lock tag and token', () => {
      const { lockTag, token } = decodeLockId(KNOWN_TOKEN_ID_DECIMAL)

      expect(lockTag.toLowerCase()).toBe(KNOWN_LOCK_TAG.toLowerCase())
      expect(token.toLowerCase()).toBe(NATIVE_ETH_ADDRESS.toLowerCase())
    })
  })

  describe('allocator ID computation', () => {
    it('should derive the correct allocator ID from address', () => {
      // Extract allocator ID from the known lock tag
      const decoded = decodeLockTag(KNOWN_LOCK_TAG)

      // The allocator ID should match the known value
      expect(decoded.allocatorId).toBe(KNOWN_ALLOCATOR_ID)
    })

    it('should extract allocator ID correctly from token ID', () => {
      const { lockTag } = decodeLockId(KNOWN_TOKEN_ID_DECIMAL)
      const { allocatorId } = decodeLockTag(lockTag)

      expect(allocatorId).toBe(KNOWN_ALLOCATOR_ID)
    })
  })

  describe('on-chain queries (requires RPC)', () => {
    it('should query the balance of the known depositor', async () => {
      const compactClient = createCompactClient({
        chainId: 1,
        address: MAINNET_COMPACT_ADDRESS,
        publicClient,
      })

      // Query the balance
      const balance = await compactClient.view.balanceOf({
        account: KNOWN_DEPOSITOR,
        id: KNOWN_TOKEN_ID_DECIMAL,
      })

      // The depositor should have at least 1 ETH deposited
      // (may be more if they've made additional deposits)
      expect(balance).toBeGreaterThanOrEqual(1000000000000000000n)
    }, 30000) // 30s timeout for RPC call

    it('should query lock details for the token ID', async () => {
      const compactClient = createCompactClient({
        chainId: 1,
        address: MAINNET_COMPACT_ADDRESS,
        publicClient,
      })

      // Query lock details
      const lockDetails = await compactClient.view.getLockDetails(KNOWN_TOKEN_ID_DECIMAL)

      // Verify the lock details match our expectations
      expect(lockDetails.token.toLowerCase()).toBe(NATIVE_ETH_ADDRESS.toLowerCase())
      expect(lockDetails.lockTag.toLowerCase()).toBe(KNOWN_LOCK_TAG.toLowerCase())

      // Verify the allocator can be derived from lock details
      const { allocatorId } = decodeLockTag(lockDetails.lockTag)
      expect(allocatorId).toBe(KNOWN_ALLOCATOR_ID)
    }, 30000)

    it('should verify domain separator matches on-chain value', async () => {
      const compactClient = createCompactClient({
        chainId: 1,
        address: MAINNET_COMPACT_ADDRESS,
        publicClient,
      })

      // Get domain separator from contract
      const onChainDomainSeparator = await compactClient.view.getDomainSeparator()

      // Domain separator should be a valid bytes32
      expect(onChainDomainSeparator).toEqual(DOMAIN_SEPARATOR)
    }, 30000)
  })

  describe('round-trip encoding tests', () => {
    it('should correctly round-trip encode/decode various lock tags', () => {
      const testCases = [
        {
          name: 'ChainSpecific with OneDay reset',
          parts: {
            allocatorId: 123456789n,
            scope: Scope.ChainSpecific,
            resetPeriod: ResetPeriod.OneDay,
          },
        },
        {
          name: 'Multichain with OneMinute reset',
          parts: {
            allocatorId: 987654321n,
            scope: Scope.Multichain,
            resetPeriod: ResetPeriod.OneMinute,
          },
        },
        {
          name: 'Maximum allocator ID',
          parts: {
            allocatorId: (1n << 92n) - 1n, // Max 92-bit value
            scope: Scope.ChainSpecific,
            resetPeriod: ResetPeriod.ThirtyDays,
          },
        },
      ]

      for (const testCase of testCases) {
        const encoded = encodeLockTag(testCase.parts)
        const decoded = decodeLockTag(encoded)

        expect(decoded.allocatorId).toBe(testCase.parts.allocatorId)
        expect(decoded.scope).toBe(testCase.parts.scope)
        expect(decoded.resetPeriod).toBe(testCase.parts.resetPeriod)
      }
    })

    it('should correctly round-trip encode/decode lock IDs with various tokens', () => {
      const testLockTag = encodeLockTag({
        allocatorId: KNOWN_ALLOCATOR_ID,
        scope: Scope.ChainSpecific,
        resetPeriod: ResetPeriod.OneDay,
      })

      const testTokens = [
        '0x0000000000000000000000000000000000000000', // Native ETH
        '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', // USDC
        '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', // WETH
        '0xdAC17F958D2ee523a2206206994597C13D831ec7', // USDT
      ]

      for (const token of testTokens) {
        const lockId = encodeLockId(testLockTag, token as `0x${string}`)
        const decoded = decodeLockId(lockId)

        expect(decoded.lockTag.toLowerCase()).toBe(testLockTag.toLowerCase())
        expect(decoded.token.toLowerCase()).toBe(token.toLowerCase())
      }
    })
  })
})
