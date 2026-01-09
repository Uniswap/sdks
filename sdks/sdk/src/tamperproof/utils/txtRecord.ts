import { ERROR_INVALID_TXT_RECORD_FORMAT } from '../constants/errors.js'

/**
 * Decodes DNS TXT record wire-format bytes (RFC 1035) into a UTF-8 string.
 *
 * TXT RDATA is a sequence of length-prefixed character strings. This function
 * iterates the chunks, validates boundaries, decodes each as UTF-8, and
 * concatenates them. Throws `ERROR_INVALID_TXT_RECORD_FORMAT` if the data is
 * truncated or malformed.
 */
export function parseTxtRecord(buffer: ArrayBuffer | Uint8Array): string {
  const view = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer)
  const decoder = new TextDecoder()
  let result = ''
  let offset = 0

  while (offset < view.length) {
    const length = view[offset]
    offset += 1

    if (offset + length > view.length) {
      throw new Error(ERROR_INVALID_TXT_RECORD_FORMAT)
    }

    const slice = view.subarray(offset, offset + length)
    result += decoder.decode(slice)
    offset += length
  }

  return result
}

/**
 * Normalizes DNS TXT record data into a string.
 *
 * - If `data` is a string, returns it as-is
 * - If `data` is a Uint8Array or ArrayBuffer, decodes RFC length-prefixed TXT chunks via `parseTxtRecord`
 * - Otherwise, returns a best-effort string cast
 *
 * Used by verification code that consumes DoH responses where TXT answers may
 * be provided either as raw wire-format bytes or plain strings.
 */
export function processTxtRecordData(data: unknown): string {
  if (typeof data === 'string') {
    return data
  }
  if (data instanceof Uint8Array || data instanceof ArrayBuffer) {
    return parseTxtRecord(data)
  }
  // Fallback for other types
  return String(data)
}
