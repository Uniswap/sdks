import { SignatureProvider } from './SignatureProvider'
import { PermitTransferFrom, PermitBatchTransferFrom } from '../signatureTransfer'
import { BigNumber } from '@ethersproject/bignumber'
import { ethers } from 'ethers'

describe('SignatureProvider', () => {
  let provider: ethers.providers.JsonRpcProvider
  let permit2Address: string
  let owner: string
  let spender: string
  let token: string
  let signatureProvider: SignatureProvider

  beforeEach(() => {
    // Setup test environment
    const forkUrl = process.env.FORK_URL || 'http://localhost:8545'
    provider = new ethers.providers.JsonRpcProvider(forkUrl)
    permit2Address = '0x000000000022D473030F116dDEE9F6B43aC78BA3' // Mainnet Permit2 address
    owner = '0x1234567890123456789012345678901234567890'
    spender = '0x0987654321098765432109876543210987654321'
    token = '0xA0b86a33E6441b8C4C8C8C8C8C8C8C8C8C8C8C8C'
    signatureProvider = new SignatureProvider(provider, permit2Address)
  })

  describe('isNonceUsed', () => {
    it('should check if a nonce has been used', async () => {
      const nonce = BigNumber.from(123)

      const isUsed = await signatureProvider.isNonceUsed(owner, nonce)
      expect(typeof isUsed).toBe('boolean')
    })

    it('should handle different nonce values', async () => {
      const nonces = [0, 255, 256, 1000, 10000]

      for (const nonce of nonces) {
        const isUsed = await signatureProvider.isNonceUsed(owner, nonce)
        expect(typeof isUsed).toBe('boolean')
      }
    })

    it('should check specific used nonce for known swapper', async () => {
      const usedNonce = BigNumber.from('1993349591429988950323706171037443285812821323100932422320925456272859199745')
      const swapper = '0xa7152Fad7467857dC2D4060FEcaAdf9f6B8227d3'

      const isUsed = await signatureProvider.isNonceUsed(swapper, usedNonce)
      expect(isUsed).toBe(true) // Nonce should be used
    })

    it('should check specific unused nonce for known swapper', async () => {
      const unusedNonce = BigNumber.from('1234567890')
      const swapper = '0x54539967a06Fc0E3C3ED0ee320Eb67362D13C5fF'

      const isUsed = await signatureProvider.isNonceUsed(swapper, unusedNonce)
      expect(isUsed).toBe(false) // Nonce should be unused
    })
  })

  describe('isExpired', () => {
    it('should check if a deadline has expired', async () => {
      const futureDeadline = BigNumber.from(Math.floor(Date.now() / 1000) + 3600) // 1 hour from now
      const pastDeadline = BigNumber.from(Math.floor(Date.now() / 1000) - 3600) // 1 hour ago

      const futureExpired = await signatureProvider.isExpired(futureDeadline)
      const pastExpired = await signatureProvider.isExpired(pastDeadline)

      expect(typeof futureExpired).toBe('boolean')
      expect(typeof pastExpired).toBe('boolean')
      expect(futureExpired).toBe(false)
      expect(pastExpired).toBe(true)
    })
  })

  describe('isPermitValid', () => {
    it('should validate a single permit', async () => {
      const permit: PermitTransferFrom = {
        permitted: {
          token,
          amount: BigNumber.from(1000000),
        },
        spender,
        nonce: BigNumber.from(123),
        deadline: BigNumber.from(Math.floor(Date.now() / 1000) + 3600), // 1 hour from now
      }

      const isValid = await signatureProvider.isPermitValid(permit)
      expect(typeof isValid).toBe('boolean')
    })

    it('should validate a batch permit', async () => {
      const permit: PermitBatchTransferFrom = {
        permitted: [
          {
            token,
            amount: BigNumber.from(1000000),
          },
          {
            token: '0xB0b86a33E6441b8C4C8C8C8C8C8C8C8C8C8C8C8C',
            amount: BigNumber.from(2000000),
          },
        ],
        spender,
        nonce: BigNumber.from(456),
        deadline: BigNumber.from(Math.floor(Date.now() / 1000) + 3600), // 1 hour from now
      }

      const isValid = await signatureProvider.isPermitValid(permit)
      expect(typeof isValid).toBe('boolean')
    })

    it('should return false for expired permits', async () => {
      const permit: PermitTransferFrom = {
        permitted: {
          token,
          amount: BigNumber.from(1000000),
        },
        spender,
        nonce: BigNumber.from(123),
        deadline: BigNumber.from(Math.floor(Date.now() / 1000) - 3600), // 1 hour ago
      }

      const isValid = await signatureProvider.isPermitValid(permit)
      expect(isValid).toBe(false)
    })
  })

  describe('validatePermit', () => {
    it('should return detailed validation results', async () => {
      const permit: PermitTransferFrom = {
        permitted: {
          token,
          amount: BigNumber.from(1000000),
        },
        spender,
        nonce: BigNumber.from(123),
        deadline: BigNumber.from(Math.floor(Date.now() / 1000) + 3600), // 1 hour from now
      }

      const result = await signatureProvider.validatePermit(permit)

      expect(result).toHaveProperty('isUsed')
      expect(result).toHaveProperty('isExpired')
      expect(result).toHaveProperty('isValid')
      expect(typeof result.isUsed).toBe('boolean')
      expect(typeof result.isExpired).toBe('boolean')
      expect(typeof result.isValid).toBe('boolean')
    })
  })

  describe('getNonceBitmap', () => {
    it('should get the nonce bitmap for an owner', async () => {
      const wordPos = BigNumber.from(0)

      const bitmap = await signatureProvider.getNonceBitmap(owner, wordPos)
      expect(bitmap).toBeInstanceOf(BigNumber)
    })
  })

  describe('isBitSet', () => {
    it('should check if a specific bit is set in a bitmap', () => {
      const bitmap = BigNumber.from('0x0000000000000000000000000000000000000000000000000000000000000001')

      const bit0Set = SignatureProvider.isBitSet(bitmap, 0)
      const bit1Set = SignatureProvider.isBitSet(bitmap, 1)

      expect(bit0Set).toBe(true)
      expect(bit1Set).toBe(false)
    })

    it('should handle different bit positions', () => {
      const bitmap = BigNumber.from('0x00000000000000000000000000000000000000000000000000000000000000FF')

      for (let i = 0; i < 8; i++) {
        const isSet = SignatureProvider.isBitSet(bitmap, i)
        expect(isSet).toBe(true)
      }

      for (let i = 8; i < 16; i++) {
        const isSet = SignatureProvider.isBitSet(bitmap, i)
        expect(isSet).toBe(false)
      }
    })

    it('should throw error for invalid bit positions', () => {
      const bitmap = BigNumber.from(0)

      expect(() => SignatureProvider.isBitSet(bitmap, -1)).toThrow('BIT_POSITION_OUT_OF_RANGE')
      expect(() => SignatureProvider.isBitSet(bitmap, 256)).toThrow('BIT_POSITION_OUT_OF_RANGE')
    })
  })

  describe('getNoncePositions', () => {
    it('should calculate correct word and bit positions', () => {
      const nonce = BigNumber.from(123)
      const positions = SignatureProvider.getNoncePositions(nonce)

      expect(positions.wordPos.eq(BigNumber.from(0))).toBe(true) // 123 >> 8 = 0
      expect(positions.bitPos).toBe(123) // 123 & 255 = 123
    })

    it('should handle nonces that span multiple words', () => {
      const nonce = BigNumber.from(300)
      const positions = SignatureProvider.getNoncePositions(nonce)

      expect(positions.wordPos.eq(BigNumber.from(1))).toBe(true) // 300 >> 8 = 1
      expect(positions.bitPos).toBe(44) // 300 & 255 = 44
    })
  })

  describe('batchCheckNonces', () => {
    it('should check multiple nonces efficiently', async () => {
      const nonces = [BigNumber.from(1), BigNumber.from(2), BigNumber.from(256), BigNumber.from(257)]

      const results = await signatureProvider.batchCheckNonces(owner, nonces)

      expect(results).toHaveLength(nonces.length)
      results.forEach((result) => {
        expect(typeof result).toBe('boolean')
      })
    })

    it('should check specific nonces for known swapper', async () => {
      const swapper = '0xa7152Fad7467857dC2D4060FEcaAdf9f6B8227d3'
      const usedNonce = BigNumber.from('1993349591429988950323706171037443285812821323100932422320925456272859199745')

      // Test with the specific nonce and some additional nonces
      const nonces = [
        usedNonce,
        BigNumber.from(1234567890), // Different nonce
        BigNumber.from(9876543210), // Another different nonce
      ]

      const results = await signatureProvider.batchCheckNonces(swapper, nonces)

      expect(results).toHaveLength(nonces.length)
      results.forEach((result) => {
        expect(typeof result).toBe('boolean')
      })

      // The first nonce should be used (true), others likely unused (false)
      expect(results[0]).toBe(true) // The specific nonce should be used
    })
  })

  describe('getCurrentTimestamp', () => {
    it('should get the current block timestamp', async () => {
      const currentTime = Math.floor(Date.now() / 1000)
      const timestamp = await signatureProvider.getCurrentTimestamp()

      expect(typeof timestamp).toBe('number')
      expect(timestamp).toBeGreaterThan(0)

      // Check that the timestamp is close to current time (±30 seconds to account for network latency)
      const timeDifference = Math.abs(timestamp - currentTime)
      expect(timeDifference).toBeLessThanOrEqual(30)
    })
  })

  describe('Integration Tests', () => {
    it('should work together to validate a complete permit flow', async () => {
      const nonce = BigNumber.from(789)
      const deadline = BigNumber.from(Math.floor(Date.now() / 1000) + 7200) // 2 hours from now

      // Create permit
      const permit: PermitTransferFrom = {
        permitted: {
          token,
          amount: BigNumber.from(1000000),
        },
        spender,
        nonce,
        deadline,
      }

      // Check if nonce is used
      const isNonceUsed = await signatureProvider.isNonceUsed(owner, nonce)

      // Check if deadline is expired
      const isExpired = await signatureProvider.isExpired(deadline)

      // Validate permit
      const isValid = await signatureProvider.isPermitValid(permit)

      // All checks should be consistent
      expect(isValid).toBe(!isNonceUsed && !isExpired)
    })

    it('should provide consistent results between individual and batch validation', async () => {
      const nonces = [BigNumber.from(1), BigNumber.from(2), BigNumber.from(256)]

      // Check individual nonces
      const individualResults = await Promise.all(nonces.map((nonce) => signatureProvider.isNonceUsed(owner, nonce)))

      // Check batch nonces
      const batchResults = await signatureProvider.batchCheckNonces(owner, nonces)

      // Results should be consistent
      expect(batchResults).toEqual(individualResults)
    })
  })
})
