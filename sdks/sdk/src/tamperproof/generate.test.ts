import { generate } from './generate'
import { normalizeHex } from './utils/hex'

interface ParsedResult {
  publicKeys: {
    id: string
    alg: string
    publicKey: string
  }[]
}

describe('generate', () => {
  const testKeys = {
    rsassa:
      '30820122300d06092a864886f70d01010105000382010f003082010a02820101009d36845018ef5dc07a3097055a5657404be931644c98350ad86918ac3873dad2b3950ab8913856d1f47281a48eeec17737a0c7dd02f3dda3e1d86bfd72932968efee7b6d2a73e9b72a1eb741d3016b212a41f000936e0e7b9bc9726b7522447b8059a3263020c0685896f2d597a6b25dc8255c34c8ac12c3f6410d8200a8aa880f93cda8e7085550dba93ddb2623325094ef2fff466057998bf9da851c4ff7064a719cde40882ccec5c1c32ecc5918b63fb46416f1d3761aab4a2249737b5700e9e65df075a91cb33846e4efafccb45bfa622af11a6ff9ca6fcf7d3140d6227652b63337a90db79461957bb0390934454530292f243e9a2ace92d0375136e3f10203010001',
    rsaPss:
      '30820122300d06092a864886f70d01010105000382010f003082010a0282010100a1b2c3d4e5f6789abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef010203010001',
    ecdsa:
      '3059301306072a8648ce3d020106082a8648ce3d030107034200041234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
    ed25519: '302a300506032b6570032100abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890ab',
  }

  describe('single algorithm tests', () => {
    describe('RS256 (RSASSA-PKCS1-v1_5)', () => {
      it('should generate correct JSON for single key', () => {
        const result = generate({
          key: testKeys.rsassa,
          algorithm: 'RS256',
        })

        const parsed = JSON.parse(result) as ParsedResult
        expect(parsed.publicKeys).toHaveLength(1)
        expect(parsed.publicKeys[0]).toEqual({
          id: '1',
          alg: 'RS256',
          publicKey: `0x${testKeys.rsassa}`,
        })
      })
    })

    describe('PS256 (RSA-PSS)', () => {
      it('should generate correct JSON for single key', () => {
        const result = generate({
          key: testKeys.rsaPss,
          algorithm: 'PS256',
        })

        const parsed = JSON.parse(result) as ParsedResult
        expect(parsed.publicKeys).toHaveLength(1)
        expect(parsed.publicKeys[0]).toEqual({
          id: '1',
          alg: 'PS256',
          publicKey: normalizeHex(testKeys.rsaPss),
        })
      })
    })

    describe('ES256 (ECDSA)', () => {
      it('should generate correct JSON for single key', () => {
        const result = generate({
          key: testKeys.ecdsa,
          algorithm: 'ES256',
        })

        const parsed = JSON.parse(result) as ParsedResult
        expect(parsed.publicKeys).toHaveLength(1)
        expect(parsed.publicKeys[0]).toEqual({
          id: '1',
          alg: 'ES256',
          publicKey: `0x${testKeys.ecdsa}`,
        })
      })
    })

    describe('EdDSA (Ed25519)', () => {
      it('should generate correct JSON for single key', () => {
        const result = generate({
          key: testKeys.ed25519,
          algorithm: 'EdDSA',
        })

        const parsed = JSON.parse(result) as ParsedResult
        expect(parsed.publicKeys).toHaveLength(1)
        expect(parsed.publicKeys[0]).toEqual({
          id: '1',
          alg: 'EdDSA',
          publicKey: `0x${testKeys.ed25519}`,
        })
      })
    })

    describe('RS384 (RSASSA-PKCS1-v1_5)', () => {
      it('should generate correct JSON for single key', () => {
        const result = generate({
          key: testKeys.rsassa,
          algorithm: 'RS384',
        })

        const parsed = JSON.parse(result) as ParsedResult
        expect(parsed.publicKeys).toHaveLength(1)
        expect(parsed.publicKeys[0]).toEqual({
          id: '1',
          alg: 'RS384',
          publicKey: `0x${testKeys.rsassa}`,
        })
      })
    })

    describe('RS512 (RSASSA-PKCS1-v1_5)', () => {
      it('should generate correct JSON for single key', () => {
        const result = generate({
          key: testKeys.rsassa,
          algorithm: 'RS512',
        })

        const parsed = JSON.parse(result) as ParsedResult
        expect(parsed.publicKeys).toHaveLength(1)
        expect(parsed.publicKeys[0]).toEqual({
          id: '1',
          alg: 'RS512',
          publicKey: `0x${testKeys.rsassa}`,
        })
      })
    })

    describe('PS384 (RSA-PSS)', () => {
      it('should generate correct JSON for single key', () => {
        const result = generate({
          key: testKeys.rsaPss,
          algorithm: 'PS384',
        })

        const parsed = JSON.parse(result) as ParsedResult
        expect(parsed.publicKeys).toHaveLength(1)
        expect(parsed.publicKeys[0]).toEqual({
          id: '1',
          alg: 'PS384',
          publicKey: normalizeHex(testKeys.rsaPss),
        })
      })
    })

    describe('PS512 (RSA-PSS)', () => {
      it('should generate correct JSON for single key', () => {
        const result = generate({
          key: testKeys.rsaPss,
          algorithm: 'PS512',
        })

        const parsed = JSON.parse(result) as ParsedResult
        expect(parsed.publicKeys).toHaveLength(1)
        expect(parsed.publicKeys[0]).toEqual({
          id: '1',
          alg: 'PS512',
          publicKey: normalizeHex(testKeys.rsaPss),
        })
      })
    })

    describe('ES384 (ECDSA)', () => {
      it('should generate correct JSON for single key', () => {
        const result = generate({
          key: testKeys.ecdsa,
          algorithm: 'ES384',
        })

        const parsed = JSON.parse(result) as ParsedResult
        expect(parsed.publicKeys).toHaveLength(1)
        expect(parsed.publicKeys[0]).toEqual({
          id: '1',
          alg: 'ES384',
          publicKey: `0x${testKeys.ecdsa}`,
        })
      })
    })

    describe('ES512 (ECDSA)', () => {
      it('should generate correct JSON for single key', () => {
        const result = generate({
          key: testKeys.ecdsa,
          algorithm: 'ES512',
        })

        const parsed = JSON.parse(result) as ParsedResult
        expect(parsed.publicKeys).toHaveLength(1)
        expect(parsed.publicKeys[0]).toEqual({
          id: '1',
          alg: 'ES512',
          publicKey: `0x${testKeys.ecdsa}`,
        })
      })
    })
  })

  describe('multiple algorithms tests', () => {
    it('should generate correct JSON for two different algorithms', () => {
      const result = generate(
        {
          key: testKeys.rsassa,
          algorithm: 'RS256',
        },
        {
          key: testKeys.ecdsa,
          algorithm: 'ES256',
        }
      )

      const parsed = JSON.parse(result) as ParsedResult
      expect(parsed.publicKeys).toHaveLength(2)
      expect(parsed.publicKeys[0]).toEqual({
        id: '1',
        alg: 'RS256',
        publicKey: `0x${testKeys.rsassa}`,
      })
      expect(parsed.publicKeys[1]).toEqual({
        id: '2',
        alg: 'ES256',
        publicKey: `0x${testKeys.ecdsa}`,
      })
    })

    it('should generate correct JSON for three different algorithms', () => {
      const result = generate(
        {
          key: testKeys.rsassa,
          algorithm: 'RS256',
        },
        {
          key: testKeys.ecdsa,
          algorithm: 'ES256',
        },
        {
          key: testKeys.ed25519,
          algorithm: 'EdDSA',
        }
      )

      const parsed = JSON.parse(result) as ParsedResult
      expect(parsed.publicKeys).toHaveLength(3)
      expect(parsed.publicKeys[0]).toEqual({
        id: '1',
        alg: 'RS256',
        publicKey: `0x${testKeys.rsassa}`,
      })
      expect(parsed.publicKeys[1]).toEqual({
        id: '2',
        alg: 'ES256',
        publicKey: `0x${testKeys.ecdsa}`,
      })
      expect(parsed.publicKeys[2]).toEqual({
        id: '3',
        alg: 'EdDSA',
        publicKey: `0x${testKeys.ed25519}`,
      })
    })

    it('should generate correct JSON for all four algorithms', () => {
      const result = generate(
        {
          key: testKeys.rsassa,
          algorithm: 'RS256',
        },
        {
          key: testKeys.rsaPss,
          algorithm: 'PS256',
        },
        {
          key: testKeys.ecdsa,
          algorithm: 'ES256',
        },
        {
          key: testKeys.ed25519,
          algorithm: 'EdDSA',
        }
      )

      const parsed = JSON.parse(result) as ParsedResult
      expect(parsed.publicKeys).toHaveLength(4)
      expect(parsed.publicKeys[0]).toEqual({
        id: '1',
        alg: 'RS256',
        publicKey: `0x${testKeys.rsassa}`,
      })
      expect(parsed.publicKeys[1]).toEqual({
        id: '2',
        alg: 'PS256',
        publicKey: normalizeHex(testKeys.rsaPss),
      })
      expect(parsed.publicKeys[2]).toEqual({
        id: '3',
        alg: 'ES256',
        publicKey: `0x${testKeys.ecdsa}`,
      })
      expect(parsed.publicKeys[3]).toEqual({
        id: '4',
        alg: 'EdDSA',
        publicKey: `0x${testKeys.ed25519}`,
      })
    })

    it('should handle duplicate algorithms with different keys', () => {
      const alternateEcdsaKey =
        '3059301306072a8648ce3d020106082a8648ce3d030107034200040987654321fedcba0987654321fedcba0987654321fedcba0987654321fedcba0987654321fedcba0987654321fedcba0987654321fedcba0987654321fedcba'

      const result = generate(
        {
          key: testKeys.ecdsa,
          algorithm: 'ES256',
        },
        {
          key: alternateEcdsaKey,
          algorithm: 'ES256',
        }
      )

      const parsed = JSON.parse(result) as ParsedResult
      expect(parsed.publicKeys).toHaveLength(2)
      expect(parsed.publicKeys[0]).toEqual({
        id: '1',
        alg: 'ES256',
        publicKey: `0x${testKeys.ecdsa}`,
      })
      expect(parsed.publicKeys[1]).toEqual({
        id: '2',
        alg: 'ES256',
        publicKey: `0x${alternateEcdsaKey}`,
      })
    })
  })

  describe('edge cases', () => {
    it('should handle empty input gracefully', () => {
      const result = generate()

      const parsed = JSON.parse(result) as ParsedResult
      expect(parsed.publicKeys).toHaveLength(0)
      expect(parsed.publicKeys).toEqual([])
    })

    it('should fail with invalid algorithm', () => {
      expect(() => {
        generate({
          key: testKeys.rsassa,
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-explicit-any
          algorithm: 'INVALID_ALGORITHM' as any,
        })
      }).toThrow()
    })

    it('should preserve key order in output', () => {
      const result = generate(
        {
          key: testKeys.ed25519,
          algorithm: 'EdDSA',
        },
        {
          key: testKeys.rsassa,
          algorithm: 'RS256',
        },
        {
          key: testKeys.ecdsa,
          algorithm: 'ES256',
        }
      )

      const parsed = JSON.parse(result) as ParsedResult
      expect(parsed.publicKeys).toHaveLength(3)
      expect(parsed.publicKeys[0].alg).toBe('EdDSA')
      expect(parsed.publicKeys[1].alg).toBe('RS256')
      expect(parsed.publicKeys[2].alg).toBe('ES256')
    })

    it('should assign sequential IDs regardless of algorithm type', () => {
      const result = generate(
        {
          key: testKeys.ed25519,
          algorithm: 'EdDSA',
        },
        {
          key: testKeys.rsaPss,
          algorithm: 'PS256',
        },
        {
          key: testKeys.rsassa,
          algorithm: 'RS256',
        },
        {
          key: testKeys.ecdsa,
          algorithm: 'ES256',
        }
      )

      const parsed = JSON.parse(result) as ParsedResult
      expect(parsed.publicKeys).toHaveLength(4)
      expect(parsed.publicKeys.map((key) => key.id)).toEqual(['1', '2', '3', '4'])
    })

    it('should preserve existing 0x prefix in keys', () => {
      const keyWithPrefix = `0x${testKeys.ecdsa}`

      const result = generate({
        key: keyWithPrefix,
        algorithm: 'ES256',
      })

      const parsed = JSON.parse(result) as ParsedResult
      expect(parsed.publicKeys).toHaveLength(1)
      expect(parsed.publicKeys[0]).toEqual({
        id: '1',
        alg: 'ES256',
        publicKey: keyWithPrefix, // Should remain unchanged
      })
    })

    it('should add 0x prefix to keys without prefix', () => {
      const result = generate({
        key: testKeys.ecdsa,
        algorithm: 'ES256',
      })

      const parsed = JSON.parse(result) as ParsedResult
      expect(parsed.publicKeys).toHaveLength(1)
      expect(parsed.publicKeys[0]).toEqual({
        id: '1',
        alg: 'ES256',
        publicKey: `0x${testKeys.ecdsa}`,
      })
    })

    it('should handle mixed keys with and without 0x prefix', () => {
      const keyWithPrefix = `0x${testKeys.rsassa}`
      const keyWithoutPrefix = testKeys.ecdsa

      const result = generate(
        {
          key: keyWithPrefix,
          algorithm: 'RS256',
        },
        {
          key: keyWithoutPrefix,
          algorithm: 'ES256',
        }
      )

      const parsed = JSON.parse(result) as ParsedResult
      expect(parsed.publicKeys).toHaveLength(2)
      expect(parsed.publicKeys[0]).toEqual({
        id: '1',
        alg: 'RS256',
        publicKey: keyWithPrefix, // Should preserve existing prefix
      })
      expect(parsed.publicKeys[1]).toEqual({
        id: '2',
        alg: 'ES256',
        publicKey: `0x${keyWithoutPrefix}`, // Should add prefix
      })
    })

    it('should not create double 0x prefix', () => {
      const keyWithPrefix = `0x${testKeys.ed25519}`

      const result = generate({
        key: keyWithPrefix,
        algorithm: 'EdDSA',
      })

      const parsed = JSON.parse(result) as ParsedResult
      expect(parsed.publicKeys).toHaveLength(1)
      expect(parsed.publicKeys[0].publicKey).toBe(keyWithPrefix)
      expect(parsed.publicKeys[0].publicKey).not.toContain('0x0x')
    })

    it('should throw for non-hex characters', () => {
      expect(() =>
        generate({
          key: 'not-hex',
          algorithm: 'ES256',
        })
      ).toThrow(/Invalid hex string/)
    })

    it('should throw for invalid hex with 0x prefix', () => {
      expect(() =>
        generate({
          key: '0xzzzz',
          algorithm: 'ES256',
        })
      ).toThrow(/Invalid hex string/)
    })
  })
})
