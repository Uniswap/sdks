export const ERROR_ALGORITHM_NOT_SUPPORTED = (alg: unknown): string => `Algorithm is not supported: ${String(alg)}`

export const ERROR_NO_TXT_RECORDS_FOR_HOST = (host: string): string => `No TXT records found for host ${host}`

export const ERROR_NO_TXT_WITH_PREFIX_FOR_HOST = (prefix: string, host: string): string =>
  `No TXT record found with prefix ${prefix} for host ${host}`

export const ERROR_MULTIPLE_TXT_WITH_PREFIX_FOR_HOST = (prefix: string, host: string): string =>
  `Multiple TXT records found with prefix ${prefix} for host ${host}. Only one is allowed.`

export const ERROR_TWIST_PATH_TOO_LONG = 'TWIST path too long'

export const ERROR_MANIFEST_HTTPS_ONLY = 'Manifest must be fetched over HTTPS'

export const ERROR_MANIFEST_FETCH_FAILED = (status: number): string => `Failed to fetch manifest: HTTP ${status}`

export const ERROR_MANIFEST_CONTENT_TYPE = 'Manifest Content-Type must be application/json'

export const ERROR_MANIFEST_TOO_LARGE = 'Manifest too large'

export const ERROR_PUBLIC_KEY_ID_NOT_FOUND = (id: string | number): string => `Public key with id ${id} not found`

export const ERROR_MULTIPLE_PUBLIC_KEYS_WITH_ID = (id: string | number): string =>
  `Multiple public keys found with id ${id}. Key IDs must be unique.`

export const ERROR_INVALID_TXT_RECORD_FORMAT = 'Invalid TXT record format: length exceeds buffer size'

export const ERROR_INVALID_HEX_LENGTH_EVEN = 'Invalid hex string: length must be even'

export const ERROR_INVALID_HEX_STRING = (hex: string): string => `Invalid hex string: ${hex}`

export const ERROR_NO_BASE64_DECODER = 'No base64 decoder available in this environment'
