import { describe, expect, it } from 'bun:test'

import { redactKeyedUrl, REDACTED_URL } from './redact'

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
