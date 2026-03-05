/**
 * Runtime-safe random helpers (Node + Browser)
 *
 * - Uses Web Crypto when available (`globalThis.crypto.getRandomValues`)
 * - Falls back to Node.js `crypto.randomBytes` via dynamic require (no top-level import)
 *
 * Avoids Buffer usage to keep browser bundles clean.
 */

import type { Hex } from 'viem'

function bytesToHex(bytes: Uint8Array): Hex {
  let hex = '0x'
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i].toString(16).padStart(2, '0')
  }
  return hex as Hex
}

/**
 * Generate a cryptographically random 32-byte hex string.
 */
export function randomHex32(): Hex {
  const bytes = new Uint8Array(32)

  const cryptoObj = (globalThis as any).crypto
  if (cryptoObj && typeof cryptoObj.getRandomValues === 'function') {
    cryptoObj.getRandomValues(bytes)
    return bytesToHex(bytes)
  }

  // Node.js fallback (dynamic require keeps browser bundles from hard-failing)
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const nodeCrypto = require('crypto') as { randomBytes: (size: number) => Uint8Array }
  const rand = nodeCrypto.randomBytes(32)
  bytes.set(rand)
  return bytesToHex(bytes)
}
