export type SigningAlgorithmConfig = {
  name: string
  hash?: { name: string }
  saltLength?: number
  namedCurve?: string
  ecdsaCoordinateLength?: number
}

export const SIGNING_ALGORITHM_IMPORT_PARAMS = {
  ES256: {
    name: 'ECDSA',
    namedCurve: 'P-256',
  } as EcKeyImportParams,
  ES384: {
    name: 'ECDSA',
    namedCurve: 'P-384',
  } as EcKeyImportParams,
  ES512: {
    name: 'ECDSA',
    namedCurve: 'P-521',
  } as EcKeyImportParams,
  EdDSA: {
    name: 'Ed25519',
  } as Algorithm,
  PS256: {
    name: 'RSA-PSS',
    hash: { name: 'SHA-256' },
  } as RsaHashedImportParams,
  PS384: {
    name: 'RSA-PSS',
    hash: { name: 'SHA-384' },
  } as RsaHashedImportParams,
  PS512: {
    name: 'RSA-PSS',
    hash: { name: 'SHA-512' },
  } as RsaHashedImportParams,
  RS256: {
    name: 'RSASSA-PKCS1-v1_5',
    hash: { name: 'SHA-256' },
  } as RsaHashedImportParams,
  RS384: {
    name: 'RSASSA-PKCS1-v1_5',
    hash: { name: 'SHA-384' },
  } as RsaHashedImportParams,
  RS512: {
    name: 'RSASSA-PKCS1-v1_5',
    hash: { name: 'SHA-512' },
  } as RsaHashedImportParams,
}

export const SIGNING_ALGORITHM_CONFIG = {
  ES256: {
    name: 'ECDSA',
    hash: { name: 'SHA-256' },
    namedCurve: 'P-256',
    ecdsaCoordinateLength: 32,
  },
  ES384: {
    name: 'ECDSA',
    hash: { name: 'SHA-384' },
    namedCurve: 'P-384',
    ecdsaCoordinateLength: 48,
  },
  ES512: {
    name: 'ECDSA',
    hash: { name: 'SHA-512' },
    namedCurve: 'P-521',
    ecdsaCoordinateLength: 66,
  },
  EdDSA: {
    name: 'Ed25519',
  },
  PS256: {
    name: 'RSA-PSS',
    hash: { name: 'SHA-256' },
    saltLength: 32,
  },
  PS384: {
    name: 'RSA-PSS',
    hash: { name: 'SHA-384' },
    saltLength: 48,
  },
  PS512: {
    name: 'RSA-PSS',
    hash: { name: 'SHA-512' },
    saltLength: 64,
  },
  RS256: {
    name: 'RSASSA-PKCS1-v1_5',
    hash: { name: 'SHA-256' },
  },
  RS384: {
    name: 'RSASSA-PKCS1-v1_5',
    hash: { name: 'SHA-384' },
  },
  RS512: {
    name: 'RSASSA-PKCS1-v1_5',
    hash: { name: 'SHA-512' },
  },
} satisfies Record<string, SigningAlgorithmConfig>
