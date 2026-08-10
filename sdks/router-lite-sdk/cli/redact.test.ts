import { afterEach, describe, expect, it } from 'bun:test'

import { redact, redactHeaderValues, redactKeyedUrl, REDACTED_URL, registerRpcHeaders, resetRpcHeaders } from './redact'

// These cases mirror `canary/providers.test.ts`'s own suite — the two implementations are
// deliberate duplicates (see `redact.ts`'s header), and this pins them to identical behaviour.
describe('redactKeyedUrl', () => {
  it('redacts a URL whose path carries a vendor key', () => {
    const message = 'HTTP request failed.\n\nURL: https://eth-mainnet.g.alchemy.com/v2/EXAMPLE-KEY-NOT-REAL-00\nStatus: 400'
    expect(redactKeyedUrl(message)).toBe(`HTTP request failed.\n\nURL: ${REDACTED_URL}\nStatus: 400`)
  })

  it('redacts a URL that carries the key in a query string', () => {
    expect(redactKeyedUrl('URL: https://rpc.example.com/eth?apikey=abc')).toBe(`URL: ${REDACTED_URL}`)
  })

  it('leaves keyless public URLs intact — the vendor is the diagnostic', () => {
    for (const url of ['https://eth.drpc.org', 'https://cloudflare-eth.com/', 'https://rpc.ankr.com/eth']) {
      expect(redactKeyedUrl(`URL: ${url}\n`)).toBe(`URL: ${url}\n`)
    }
  })

  it('leaves messages with no URL untouched', () => {
    const message = 'execution reverted: STF'
    expect(redactKeyedUrl(message)).toBe(message)
  })

  it('is idempotent', () => {
    const once = redactKeyedUrl('URL: https://eth-mainnet.g.alchemy.com/v2/EXAMPLE-KEY-NOT-REAL-00')
    expect(redactKeyedUrl(once)).toBe(once)
  })
})

// ---------------------------------------------------------------------------
// RPC header values — a leak path a keyed URL's shape-based rule cannot see
// (a header value has no shape of its own; only "this run sent it" marks it
// secret), so this is an exact-match scrub against whatever was registered.
// ---------------------------------------------------------------------------

describe('redactHeaderValues', () => {
  afterEach(() => {
    resetRpcHeaders() // one test's registered headers must never leak into the next
  })

  it('scrubs a registered header value out of an arbitrary message, naming the header', () => {
    registerRpcHeaders({ 'X-Api-Key': 'super-secret-token' })
    const message = "gateway rejected key 'super-secret-token' — invalid credentials"
    expect(redactHeaderValues(message)).toBe("gateway rejected key '<X-Api-Key: redacted>' — invalid credentials")
  })

  it('scrubs every occurrence, not just the first', () => {
    registerRpcHeaders({ Authorization: 'Bearer abc123' })
    const message = 'sent Bearer abc123, echoed back Bearer abc123 in the error'
    expect(redactHeaderValues(message)).toBe(
      'sent <Authorization: redacted>, echoed back <Authorization: redacted> in the error',
    )
  })

  it('scrubs more than one registered header, longest value first so a substring cannot leave a partial value exposed', () => {
    registerRpcHeaders({ 'X-Short': 'ab', 'X-Long': 'ab-longer-secret' })
    expect(redactHeaderValues('leaked: ab-longer-secret')).toBe('leaked: <X-Long: redacted>')
  })

  it('never redacts an empty header value (nothing to leak, and it would corrupt unrelated text)', () => {
    registerRpcHeaders({ 'X-Empty': '' })
    expect(redactHeaderValues('perfectly ordinary text')).toBe('perfectly ordinary text')
  })

  it('is a no-op with nothing registered', () => {
    expect(redactHeaderValues('secret-value-1234 appears here')).toBe('secret-value-1234 appears here')
  })

  it('a later registration REPLACES the prior one rather than accumulating', () => {
    registerRpcHeaders({ 'X-First': 'first-secret' })
    registerRpcHeaders({ 'X-Second': 'second-secret' })
    expect(redactHeaderValues('first-secret and second-secret')).toBe('first-secret and <X-Second: redacted>')
  })
})

describe('redact (composed: keyed-URL rule + registered header values)', () => {
  afterEach(() => {
    resetRpcHeaders()
  })

  it('applies both rules to one message', () => {
    registerRpcHeaders({ 'X-Api-Key': 'super-secret-token' })
    const message =
      'HTTP request failed.\n\nURL: https://eth-mainnet.g.alchemy.com/v2/EXAMPLE-KEY-NOT-REAL-00\nkey super-secret-token rejected'
    expect(redact(message)).toBe(`HTTP request failed.\n\nURL: ${REDACTED_URL}\nkey <X-Api-Key: redacted> rejected`)
  })
})
