import { keccak256 as viemKeccak256, toBytes } from 'viem';

/**
 * Cross-platform keccak256 hash function using viem
 * Supports both Node.js and browser environments
 */
export function keccak256(data: string | Uint8Array): string {
  if (typeof data === 'string') {
    // If it's a hex string, use as-is
    if (data.startsWith('0x') || /^[0-9a-fA-F]+$/.test(data)) {
      const hexData = data.startsWith('0x') ? data : `0x${data}`;
      return viemKeccak256(hexData as `0x${string}`);
    } else {
      // Otherwise treat as UTF-8 string and convert to bytes
      return viemKeccak256(toBytes(data));
    }
  } else {
    // Handle Uint8Array input
    return viemKeccak256(data);
  }
}

/**
 * Concatenate multiple hex strings and hash them
 * Removes 0x prefixes before concatenation
 */
export function keccak256Concat(...hexStrings: string[]): string {
  const concatenated = hexStrings
    .map((hex) => (hex.startsWith('0x') ? hex.slice(2) : hex))
    .join('');

  return keccak256(concatenated);
}
