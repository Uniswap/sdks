import { describe, expect, it } from 'bun:test'

import { UsageError } from './args'
import { parseRpcHeaderPairs, resolveRpcHeaders } from './rpcHeaders'

describe('parseRpcHeaderPairs', () => {
  it('parses a single pair', () => {
    expect(parseRpcHeaderPairs('X-Api-Key: secret')).toEqual([{ name: 'X-Api-Key', value: 'secret' }])
  })

  it('splits multiple pairs on the comma foundry/chainz joins them with', () => {
    expect(parseRpcHeaderPairs('X-Api-Key: secret, Authorization: Bearer abc')).toEqual([
      { name: 'X-Api-Key', value: 'secret' },
      { name: 'Authorization', value: 'Bearer abc' },
    ])
  })

  it('splits name from value on the FIRST colon, so a value that itself contains one survives whole', () => {
    expect(parseRpcHeaderPairs('Authorization: Basic dXNlcjpwYXNz')).toEqual([
      { name: 'Authorization', value: 'Basic dXNlcjpwYXNz' },
    ])
  })

  it('trims whitespace around both the name and the value', () => {
    expect(parseRpcHeaderPairs('  X-Api-Key  :   secret  ')).toEqual([{ name: 'X-Api-Key', value: 'secret' }])
  })

  it('returns nothing for an empty or blank string', () => {
    expect(parseRpcHeaderPairs('')).toEqual([])
    expect(parseRpcHeaderPairs('   ')).toEqual([])
  })

  it('allows an empty value (a header that is present but blank)', () => {
    expect(parseRpcHeaderPairs('X-Empty:')).toEqual([{ name: 'X-Empty', value: '' }])
  })

  // A header value containing a comma is genuinely ambiguous in this wire format (no escaping) —
  // chainz itself refuses to export one rather than produce this string (src/variables.rs bails
  // first), so a comma reaching this parser is always read as a pair separator, never part of a
  // value: 'X-Csv: a,b' is NOT the one-pair value 'a,b', it is two pieces, and the second ('b') has
  // no colon of its own — which is exactly why it surfaces as the loud malformed-pair error rather
  // than silently keeping the truncated value 'a'. Matches foundry/chainz's behaviour rather
  // than inventing an escaping rule that does not exist upstream.
  it('a comma inside what looks like one value is read as a pair separator, not escaped', () => {
    expect(() => parseRpcHeaderPairs('X-Csv: a,b')).toThrow(UsageError)
  })

  it('two well-formed pairs either side of the ambiguous case still parse cleanly', () => {
    expect(parseRpcHeaderPairs('X-One: a,X-Two: b')).toEqual([
      { name: 'X-One', value: 'a' },
      { name: 'X-Two', value: 'b' },
    ])
  })

  it('rejects a pair with no colon — a malformed header is loud, never silently dropped', () => {
    expect(() => parseRpcHeaderPairs('not-a-header')).toThrow(UsageError)
    expect(() => parseRpcHeaderPairs('X-Api-Key: ok, not-a-header')).toThrow(UsageError)
  })

  it('rejects a pair with an empty name', () => {
    expect(() => parseRpcHeaderPairs(': value')).toThrow(UsageError)
  })
})

describe('resolveRpcHeaders', () => {
  it('reads $ETH_RPC_HEADERS alone', () => {
    expect(resolveRpcHeaders('X-Api-Key: secret', [])).toEqual({ 'X-Api-Key': 'secret' })
  })

  it('reads --rpc-header alone (repeatable flag, one string per occurrence)', () => {
    expect(resolveRpcHeaders(undefined, ['X-Api-Key: secret', 'Authorization: Bearer abc'])).toEqual({
      'X-Api-Key': 'secret',
      Authorization: 'Bearer abc',
    })
  })

  it('merges both sources when neither collides', () => {
    expect(resolveRpcHeaders('X-Api-Key: secret', ['Authorization: Bearer abc'])).toEqual({
      'X-Api-Key': 'secret',
      Authorization: 'Bearer abc',
    })
  })

  it('an explicit --rpc-header OVERRIDES an env pair of the same name', () => {
    expect(resolveRpcHeaders('X-Api-Key: from-env', ['X-Api-Key: from-flag'])).toEqual({ 'X-Api-Key': 'from-flag' })
  })

  it('the collision is CASE-INSENSITIVE on the header name', () => {
    expect(resolveRpcHeaders('x-api-key: from-env', ['X-API-KEY: from-flag'])).toEqual({ 'X-API-KEY': 'from-flag' })
  })

  it('two --rpc-header flags for the same name: the LAST one wins, case-insensitively — no env involved', () => {
    expect(resolveRpcHeaders(undefined, ['X-Api-Key: first', 'X-Api-Key: second'])).toEqual({ 'X-Api-Key': 'second' })
    // Casing may differ between the two occurrences too; the LAST flag's casing is what's kept.
    expect(resolveRpcHeaders(undefined, ['X-Api-Key: first', 'x-api-key: second'])).toEqual({ 'x-api-key': 'second' })
  })

  it('an unset env and no flags resolves to no headers at all', () => {
    expect(resolveRpcHeaders(undefined, [])).toEqual({})
  })

  it('a malformed env value is a UsageError, same as a malformed flag', () => {
    expect(() => resolveRpcHeaders('garbage', [])).toThrow(UsageError)
    expect(() => resolveRpcHeaders(undefined, ['garbage'])).toThrow(UsageError)
  })
})
