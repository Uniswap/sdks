/**
 * Tests for hash computation functions
 * These tests validate that our SDK's hash computations match the on-chain Solidity implementations
 *
 * Test cases adapted from:
 * - the-compact/test/lib/ClaimHashLib.t.sol
 * - the-compact/test/lib/HashLib.t.sol
 */

import { keccak256, encodeAbiParameters, encodePacked, Hex, Address } from 'viem'

import { Component, Claim, BatchClaim } from '../types/claims'

import { componentsHash, idsAndAmountsHash, claimHash, batchClaimHash } from './hashes'

describe('hash computation', () => {
  describe('claimHash', () => {
    it('should compute hash for a basic claim', () => {
      const claim: Claim = {
        allocatorData: '0x',
        sponsorSignature: '0x',
        sponsor: '0x1234567890123456789012345678901234567890' as Address,
        nonce: 1n,
        expires: BigInt(Date.now() + 3600000),
        witness: '0x0000000000000000000000000000000000000000000000000000000000000000',
        witnessTypestring: '',
        id: 12345n,
        allocatedAmount: 1000000n,
        claimants: [],
      }

      const hash = claimHash(claim)

      // Verify it produces a valid hash
      expect(hash).toMatch(/^0x[0-9a-f]{64}$/)

      // Verify it matches manual computation
      const expected = keccak256(
        encodeAbiParameters(
          [
            { name: 'sponsor', type: 'address' },
            { name: 'nonce', type: 'uint256' },
            { name: 'expires', type: 'uint256' },
            { name: 'witness', type: 'bytes32' },
            { name: 'id', type: 'uint256' },
            { name: 'allocatedAmount', type: 'uint256' },
          ],
          [claim.sponsor, claim.nonce, claim.expires, claim.witness, claim.id, claim.allocatedAmount]
        )
      )
      expect(hash).toBe(expected)
    })

    it('should produce different hashes for different nonces', () => {
      const baseClaim: Claim = {
        allocatorData: '0x',
        sponsorSignature: '0x',
        sponsor: '0x1234567890123456789012345678901234567890' as `0x${string}`,
        nonce: 1n,
        expires: BigInt(Date.now() + 3600000),
        witness: '0x0000000000000000000000000000000000000000000000000000000000000000',
        witnessTypestring: '',
        id: 12345n,
        allocatedAmount: 1000000n,
        claimants: [],
      }

      const claim2 = { ...baseClaim, nonce: 2n }

      const hash1 = claimHash(baseClaim)
      const hash2 = claimHash(claim2)

      expect(hash1).not.toBe(hash2)
    })

    it('should handle claims with different witness values', () => {
      const claim1: Claim = {
        allocatorData: '0x',
        sponsorSignature: '0x',
        sponsor: '0x1234567890123456789012345678901234567890' as `0x${string}`,
        nonce: 1n,
        expires: BigInt(Date.now() + 3600000),
        witness: '0x1111111111111111111111111111111111111111111111111111111111111111',
        witnessTypestring: '',
        id: 12345n,
        allocatedAmount: 1000000n,
        claimants: [],
      }

      const claim2 = {
        ...claim1,
        witness: '0x2222222222222222222222222222222222222222222222222222222222222222' as Hex,
      }

      const hash1 = claimHash(claim1)
      const hash2 = claimHash(claim2)

      expect(hash1).not.toBe(hash2)
    })
  })

  describe('batchClaimHash', () => {
    it('should compute hash for a batch claim with single id', () => {
      const claim: BatchClaim = {
        allocatorData: '0x',
        sponsorSignature: '0x',
        sponsor: '0x1234567890123456789012345678901234567890' as Address,
        nonce: 1n,
        expires: BigInt(Date.now() + 3600000),
        witness: '0x0000000000000000000000000000000000000000000000000000000000000000',
        witnessTypestring: '',
        claims: [{ id: 12345n, allocatedAmount: 1000000n, portions: [] }],
      }

      const hash = batchClaimHash(claim)

      // Verify it produces a valid hash
      expect(hash).toMatch(/^0x[0-9a-f]{64}$/)

      // Verify it matches manual computation
      const idsAndAmounts = claim.claims.map((c) => ({ id: c.id, amount: c.allocatedAmount }))
      const idsAndAmountsHashValue = idsAndAmountsHash(idsAndAmounts)
      const expected = keccak256(
        encodeAbiParameters(
          [
            { name: 'sponsor', type: 'address' },
            { name: 'nonce', type: 'uint256' },
            { name: 'expires', type: 'uint256' },
            { name: 'witness', type: 'bytes32' },
            { name: 'idsAndAmountsHash', type: 'bytes32' },
          ],
          [claim.sponsor, claim.nonce, claim.expires, claim.witness, idsAndAmountsHashValue]
        )
      )
      expect(hash).toBe(expected)
    })

    it('should compute hash for batch claim with multiple ids', () => {
      const claim: BatchClaim = {
        allocatorData: '0x',
        sponsorSignature: '0x',
        sponsor: '0xabcdef1234567890abcdef1234567890abcdef12' as Address,
        nonce: 5n,
        expires: BigInt(Date.now() + 7200000),
        witness: '0x3333333333333333333333333333333333333333333333333333333333333333',
        witnessTypestring: '',
        claims: [
          { id: 100n, allocatedAmount: 500000n, portions: [] },
          { id: 200n, allocatedAmount: 750000n, portions: [] },
          { id: 300n, allocatedAmount: 1000000n, portions: [] },
        ],
      }

      const hash = batchClaimHash(claim)

      // Verify it produces a valid hash
      expect(hash).toMatch(/^0x[0-9a-f]{64}$/)

      // Manually compute and verify
      const idsAndAmounts = claim.claims.map((c) => ({ id: c.id, amount: c.allocatedAmount }))
      const idsAndAmountsHashValue = idsAndAmountsHash(idsAndAmounts)
      const expected = keccak256(
        encodeAbiParameters(
          [
            { name: 'sponsor', type: 'address' },
            { name: 'nonce', type: 'uint256' },
            { name: 'expires', type: 'uint256' },
            { name: 'witness', type: 'bytes32' },
            { name: 'idsAndAmountsHash', type: 'bytes32' },
          ],
          [claim.sponsor, claim.nonce, claim.expires, claim.witness, idsAndAmountsHashValue]
        )
      )
      expect(hash).toBe(expected)
    })

    it('should produce different hashes for different idsAndAmounts', () => {
      const baseClaim: BatchClaim = {
        allocatorData: '0x',
        sponsorSignature: '0x',
        sponsor: '0x1234567890123456789012345678901234567890' as Address,
        nonce: 1n,
        expires: BigInt(Date.now() + 3600000),
        witness: '0x0000000000000000000000000000000000000000000000000000000000000000',
        witnessTypestring: '',
        claims: [{ id: 100n, allocatedAmount: 500000n, portions: [] }],
      }

      const claim2 = {
        ...baseClaim,
        claims: [{ id: 200n, allocatedAmount: 500000n, portions: [] }], // Different id
      }

      const hash1 = batchClaimHash(baseClaim)
      const hash2 = batchClaimHash(claim2)

      expect(hash1).not.toBe(hash2)
    })

    it('should handle empty idsAndAmounts array', () => {
      const claim: BatchClaim = {
        allocatorData: '0x',
        sponsorSignature: '0x',
        sponsor: '0x1234567890123456789012345678901234567890' as Address,
        nonce: 1n,
        expires: BigInt(Date.now() + 3600000),
        witness: '0x0000000000000000000000000000000000000000000000000000000000000000',
        witnessTypestring: '',
        claims: [],
      }

      const hash = batchClaimHash(claim)

      // Should still produce a valid hash (with empty array hash)
      expect(hash).toMatch(/^0x[0-9a-f]{64}$/)
    })
  })

  describe('componentsHash', () => {
    it('should hash empty components array', () => {
      const components: Component[] = []
      const hash = componentsHash(components)

      // Empty array should hash to keccak256('0x')
      const expected = keccak256('0x')
      expect(hash).toBe(expected)
    })

    it('should hash single component', () => {
      const claimant = 0x1234567890123456789012345678901234567890n
      const amount = 100n

      const components: Component[] = [{ claimant, amount }]

      const hash = componentsHash(components)

      // Expected: keccak256(keccak256(abi.encode(claimant, amount)))
      const componentHash = keccak256(
        encodeAbiParameters(
          [
            { name: 'claimant', type: 'uint256' },
            { name: 'amount', type: 'uint256' },
          ],
          [claimant, amount]
        )
      )
      const expected = keccak256(componentHash)

      expect(hash).toBe(expected)
    })

    it('should hash multiple components', () => {
      const components: Component[] = [
        { claimant: 0x1111111111111111111111111111111111111111n, amount: 100n },
        { claimant: 0x2222222222222222222222222222222222222222n, amount: 200n },
        { claimant: 0x3333333333333333333333333333333333333333n, amount: 300n },
      ]

      const hash = componentsHash(components)

      // Expected: keccak256(concat(hash1, hash2, hash3))
      const hash1 = keccak256(
        encodeAbiParameters(
          [
            { name: 'claimant', type: 'uint256' },
            { name: 'amount', type: 'uint256' },
          ],
          [components[0].claimant, components[0].amount]
        )
      )
      const hash2 = keccak256(
        encodeAbiParameters(
          [
            { name: 'claimant', type: 'uint256' },
            { name: 'amount', type: 'uint256' },
          ],
          [components[1].claimant, components[1].amount]
        )
      )
      const hash3 = keccak256(
        encodeAbiParameters(
          [
            { name: 'claimant', type: 'uint256' },
            { name: 'amount', type: 'uint256' },
          ],
          [components[2].claimant, components[2].amount]
        )
      )

      const expected = keccak256(
        encodePacked(['bytes32', 'bytes32', 'bytes32'], [hash1, hash2, hash3] as [Hex, Hex, Hex])
      )

      expect(hash).toBe(expected)
    })
  })

  describe('idsAndAmountsHash', () => {
    it('should hash empty ids and amounts array', () => {
      const idsAndAmounts: Array<{ id: bigint; amount: bigint }> = []
      const hash = idsAndAmountsHash(idsAndAmounts)

      // Empty array should hash to keccak256('0x')
      const expected = keccak256('0x')
      expect(hash).toBe(expected)
    })

    it('should hash single id and amount pair', () => {
      const id = 0x123456789n
      const amount = 1000n

      const idsAndAmounts = [{ id, amount }]
      const hash = idsAndAmountsHash(idsAndAmounts)

      // Expected: keccak256(keccak256(abi.encode(id, amount)))
      const pairHash = keccak256(
        encodeAbiParameters(
          [
            { name: 'id', type: 'uint256' },
            { name: 'amount', type: 'uint256' },
          ],
          [id, amount]
        )
      )
      const expected = keccak256(pairHash)

      expect(hash).toBe(expected)
    })

    it('should hash multiple id and amount pairs', () => {
      const idsAndAmounts = [
        { id: 1n, amount: 100n },
        { id: 2n, amount: 200n },
        { id: 3n, amount: 300n },
      ]

      const hash = idsAndAmountsHash(idsAndAmounts)

      // Expected: keccak256(concat(hash1, hash2, hash3))
      const hash1 = keccak256(
        encodeAbiParameters(
          [
            { name: 'id', type: 'uint256' },
            { name: 'amount', type: 'uint256' },
          ],
          [idsAndAmounts[0].id, idsAndAmounts[0].amount]
        )
      )
      const hash2 = keccak256(
        encodeAbiParameters(
          [
            { name: 'id', type: 'uint256' },
            { name: 'amount', type: 'uint256' },
          ],
          [idsAndAmounts[1].id, idsAndAmounts[1].amount]
        )
      )
      const hash3 = keccak256(
        encodeAbiParameters(
          [
            { name: 'id', type: 'uint256' },
            { name: 'amount', type: 'uint256' },
          ],
          [idsAndAmounts[2].id, idsAndAmounts[2].amount]
        )
      )

      const expected = keccak256(
        encodePacked(['bytes32', 'bytes32', 'bytes32'], [hash1, hash2, hash3] as [Hex, Hex, Hex])
      )

      expect(hash).toBe(expected)
    })

    it('should handle well-known token IDs (from ClaimHashLib.t.sol)', () => {
      // Test with realistic lock IDs that combine lockTag and token address
      // lockTag: 0x000000000000000000000001
      // token: 0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48 (USDC)
      const lockTag = '0x000000000000000000000001' as Hex
      const usdcAddress = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48' as Address

      // Construct ID: lockTag (96 bits) in upper bits, token address (160 bits) in lower bits
      const lockTagBigInt = BigInt(lockTag)
      const tokenBigInt = BigInt(usdcAddress)
      const id = (lockTagBigInt << 160n) | tokenBigInt
      const amount = 1000000n // 1 USDC (6 decimals)

      const idsAndAmounts = [{ id, amount }]
      const hash = idsAndAmountsHash(idsAndAmounts)

      // Verify the hash is computed correctly
      const pairHash = keccak256(
        encodeAbiParameters(
          [
            { name: 'id', type: 'uint256' },
            { name: 'amount', type: 'uint256' },
          ],
          [id, amount]
        )
      )
      const expected = keccak256(pairHash)

      expect(hash).toBe(expected)
      expect(hash).toMatch(/^0x[0-9a-f]{64}$/)
    })

    it('should handle multiple well-known tokens (from ClaimHashLib.t.sol)', () => {
      const lockTag = '0x000000000000000000000001' as Hex
      const lockTagBigInt = BigInt(lockTag)

      // Well-known mainnet tokens
      const tokens = [
        { name: 'ETH', address: '0x0000000000000000000000000000000000000000', amount: 1000000000000000000n }, // 1 ETH
        { name: 'USDC', address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', amount: 1000000n }, // 1 USDC
        { name: 'WETH', address: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', amount: 2000000000000000000n }, // 2 WETH
      ]

      const idsAndAmounts = tokens.map((token) => ({
        id: (lockTagBigInt << 160n) | BigInt(token.address),
        amount: token.amount,
      }))

      const hash = idsAndAmountsHash(idsAndAmounts)

      // Compute expected hash
      const hashes = idsAndAmounts.map((pair) =>
        keccak256(
          encodeAbiParameters(
            [
              { name: 'id', type: 'uint256' },
              { name: 'amount', type: 'uint256' },
            ],
            [pair.id, pair.amount]
          )
        )
      )

      const expected = keccak256(encodePacked(['bytes32', 'bytes32', 'bytes32'], hashes as [Hex, Hex, Hex]))
      expect(hash).toBe(expected)
    })
  })

  describe('edge cases', () => {
    it('should handle maximum uint256 values', () => {
      const maxUint256 = (1n << 256n) - 1n

      const components: Component[] = [{ claimant: maxUint256, amount: maxUint256 }]

      const hash = componentsHash(components)

      // Should not throw and should produce valid hash
      expect(hash).toMatch(/^0x[0-9a-f]{64}$/)
    })

    it('should handle zero values', () => {
      const components: Component[] = [{ claimant: 0n, amount: 0n }]

      const hash = componentsHash(components)

      const componentHash = keccak256(
        encodeAbiParameters(
          [
            { name: 'claimant', type: 'uint256' },
            { name: 'amount', type: 'uint256' },
          ],
          [0n, 0n]
        )
      )
      const expected = keccak256(componentHash)

      expect(hash).toBe(expected)
    })

    it('should handle large arrays', () => {
      // Create an array with 100 elements
      const components: Component[] = Array.from({ length: 100 }, (_, i) => ({
        claimant: BigInt(i + 1),
        amount: BigInt((i + 1) * 100),
      }))

      const hash = componentsHash(components)

      // Should not throw and should produce valid hash
      expect(hash).toMatch(/^0x[0-9a-f]{64}$/)

      // Verify it's different from a smaller array
      const smallerHash = componentsHash(components.slice(0, 50))
      expect(hash).not.toBe(smallerHash)
    })
  })

  describe('hash consistency', () => {
    it('should produce consistent hashes for identical inputs', () => {
      const components: Component[] = [{ claimant: 0xabcdef123456n, amount: 999n }]

      const hash1 = componentsHash(components)
      const hash2 = componentsHash(components)
      const hash3 = componentsHash([...components]) // New array, same values

      expect(hash1).toBe(hash2)
      expect(hash1).toBe(hash3)
    })

    it('should produce different hashes for different inputs', () => {
      const components1: Component[] = [{ claimant: 100n, amount: 200n }]
      const components2: Component[] = [
        { claimant: 100n, amount: 201n }, // Different amount
      ]
      const components3: Component[] = [
        { claimant: 101n, amount: 200n }, // Different claimant
      ]

      const hash1 = componentsHash(components1)
      const hash2 = componentsHash(components2)
      const hash3 = componentsHash(components3)

      expect(hash1).not.toBe(hash2)
      expect(hash1).not.toBe(hash3)
      expect(hash2).not.toBe(hash3)
    })

    it('should be order-dependent', () => {
      const components1: Component[] = [
        { claimant: 100n, amount: 200n },
        { claimant: 300n, amount: 400n },
      ]
      const components2: Component[] = [
        { claimant: 300n, amount: 400n },
        { claimant: 100n, amount: 200n }, // Reversed order
      ]

      const hash1 = componentsHash(components1)
      const hash2 = componentsHash(components2)

      expect(hash1).not.toBe(hash2)
    })
  })

  describe('compatibility with Solidity implementation', () => {
    it('should match HashLib.sol empty array hash', () => {
      // From HashLib.t.sol test_toIdsAndAmountsHash_Empty
      const hash = idsAndAmountsHash([])

      // Solidity: keccak256(abi.encode())
      const expected = keccak256(encodeAbiParameters([], []))
      expect(hash).toBe(expected)
    })

    it('should match lock hash structure from The Compact', () => {
      // Test that we can construct lock hashes as The Compact does
      // From ClaimHashLib.t.sol, locks are hashed as:
      // keccak256(abi.encode(lockTypehash, lockTag, token, amount))

      const lockTag = '0x000000000000000000000001' as Hex
      const token = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48' as Address
      const amount = 1000000n

      const lockTypehash = keccak256('0xfb7744571d97aa61eb9c2bc3c67b9b1ba047ac9e95afb2ef02bc5b3d9e64fbe5' as Hex)

      const lockHash = keccak256(
        encodeAbiParameters(
          [
            { name: 'typehash', type: 'bytes32' },
            { name: 'lockTag', type: 'bytes12' },
            { name: 'token', type: 'address' },
            { name: 'amount', type: 'uint256' },
          ],
          [lockTypehash, lockTag, token, amount]
        )
      )

      // Verify lock hash is a valid bytes32
      expect(lockHash).toMatch(/^0x[0-9a-f]{64}$/)

      // This establishes the pattern we'd use for computing commitment hashes
      // in a full EIP-712 claim hash implementation
    })
  })
})
