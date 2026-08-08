import { describe, expect, test } from 'bun:test'

import { canonicalKey, canonicalParams } from './replay'

// ---------------------------------------------------------------------------
// The replay harness's request IDENTITY function, tested against hand-written
// expectations rather than against itself.
//
// WHY THIS FILE EXISTS. `canonicalKey` is the whole basis of recorded replay:
// the recorder keys every response by it and `replayClient` looks every request
// up by it, so the two agree BY CONSTRUCTION and no golden can ever disagree
// with the canonicalizer — a session recorded under a broken rule replays
// perfectly under the same broken rule. Every property this function is
// supposed to have was therefore untested, and the two failure directions are
// both silent and both bad:
//
//   * TOO COARSE — two genuinely different requests collide on one key. The
//     recorder writes the second over the first, and replay serves one call's
//     answer to the other. Nothing errors; the router just gets a wrong quote
//     for a route, hermetically, forever, and the golden bakes it in.
//   * TOO FINE — one request produces different keys on different runs. Replay
//     throws `unrecorded key`, which is at least loud, but the sessions are
//     re-recorded to make it stop and the real variance is never diagnosed.
//
// So everything below states the expected canonical string (or the expected
// collision / non-collision) directly, and never by calling the function twice.
// ---------------------------------------------------------------------------

describe('canonicalParams', () => {
  test('lowercases strings — every param this package sends is case-insensitive', () => {
    // Addresses, hex data, hex quantities and block tags: viem emits mixed-case checksummed
    // addresses in some paths and lowercase in others, for the same call.
    expect(canonicalParams('0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2')).toBe(
      '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2',
    )
    expect(canonicalParams('LATEST')).toBe('latest')
    expect(canonicalParams('0xAbCdEf')).toBe('0xabcdef')
  })

  test('renders bigints as 0x hex, so a bigint and its hex string are ONE request', () => {
    expect(canonicalParams(0n)).toBe('0x0')
    expect(canonicalParams(255n)).toBe('0xff')
    expect(canonicalParams(21_000_000n)).toBe('0x1406f40')
    // The pairing that matters: a block number handed over as a bigint in one code path and as a
    // pre-formatted tag in another must key identically, because they ARE the same request.
    expect(canonicalKey('eth_call', [{ to: '0xaa' }, 255n])).toBe(canonicalKey('eth_call', [{ to: '0xAA' }, '0xff']))
  })

  test('sorts object keys, so field order in a params object is not part of the identity', () => {
    expect(canonicalParams({ to: '0xAA', data: '0xBB', from: '0xCC' })).toEqual({
      data: '0xbb',
      from: '0xcc',
      to: '0xaa',
    })
    expect(JSON.stringify(canonicalParams({ to: '0xaa', data: '0xbb' }))).toBe(
      JSON.stringify(canonicalParams({ data: '0xbb', to: '0xaa' })),
    )
  })

  test('drops undefined object fields — an omitted optional and an explicit undefined are one request', () => {
    // `internal/rpc.ts#ethCall` builds its transaction object conditionally (`from`/`value` are only
    // set when present), but a caller spreading an options object can hand over an explicit
    // `undefined`. JSON.stringify already erases the difference in the payload; the key must agree.
    expect(canonicalParams({ to: '0xaa', from: undefined })).toEqual({ to: '0xaa' })
    expect(canonicalKey('eth_call', [{ to: '0xaa', value: undefined }])).toBe(canonicalKey('eth_call', [{ to: '0xaa' }]))
  })

  test('recurses through arrays and nested objects, preserving ARRAY order', () => {
    // Array order is load-bearing and must NOT be sorted away: `eth_getLogs` topics are positional
    // (topic0 is the event signature, topic1 the first indexed arg), and `eth_call`'s params are
    // [transaction, blockTag]. Sorting them would make two different queries one key.
    expect(canonicalParams([{ topics: ['0xAA', null, '0xBB'] }, 'LATEST'])).toEqual([
      { topics: ['0xaa', null, '0xbb'] },
      'latest',
    ])
    expect(canonicalKey('eth_getLogs', [{ topics: ['0xaa', '0xbb'] }])).not.toBe(
      canonicalKey('eth_getLogs', [{ topics: ['0xbb', '0xaa'] }]),
    )
  })

  test('passes numbers, booleans and null through unchanged', () => {
    expect(canonicalParams(42)).toBe(42)
    expect(canonicalParams(false)).toBe(false)
    expect(canonicalParams(null)).toBeNull()
    // `eth_getBlockByNumber`'s second param is a real boolean, not a hex string.
    expect(canonicalKey('eth_getBlockByNumber', ['latest', false])).toBe('eth_getBlockByNumber ["latest",false]')
  })

  test('is idempotent — canonicalizing an already-canonical value changes nothing', () => {
    const once = canonicalParams([{ to: '0xAA', data: '0xBB' }, 255n])
    expect(canonicalParams(once)).toEqual(once)
  })
})

describe('canonicalKey', () => {
  test('is the method plus the canonical params, exactly', () => {
    expect(canonicalKey('eth_chainId', [])).toBe('eth_chainId []')
    expect(canonicalKey('eth_getCode', ['0xCA11bde05977b3631167028862bE2a173976CA11', 'latest'])).toBe(
      'eth_getCode ["0xca11bde05977b3631167028862be2a173976ca11","latest"]',
    )
    expect(canonicalKey('eth_call', [{ to: '0xAA', data: '0xBB' }, '0x1406F40'])).toBe(
      'eth_call [{"data":"0xbb","to":"0xaa"},"0x1406f40"]',
    )
  })

  test('treats absent params as the empty list, so `params: undefined` and `params: []` are one key', () => {
    expect(canonicalKey('eth_chainId', undefined)).toBe(canonicalKey('eth_chainId', []))
  })

  // --- THE COLLISION AXIS: different requests must never share a key -------------------------
  test('the METHOD is part of the identity', () => {
    expect(canonicalKey('eth_call', ['0xaa'])).not.toBe(canonicalKey('eth_getCode', ['0xaa']))
  })

  test('two quotes of the same pool at different BLOCKS are different keys', () => {
    const tx = { to: '0xaa', data: '0xbb' }
    expect(canonicalKey('eth_call', [tx, 0x1406f40n])).not.toBe(canonicalKey('eth_call', [tx, 0x1406f41n]))
  })

  test('two quotes at the same block with different CALLDATA are different keys', () => {
    // Different amountIn, different pool, different path — all of it lives in `data`, and this is
    // the collision that would silently serve one route's answer to another.
    expect(canonicalKey('eth_call', [{ to: '0xaa', data: '0xbb01' }, '0x1'])).not.toBe(
      canonicalKey('eth_call', [{ to: '0xaa', data: '0xbb02' }, '0x1']),
    )
  })

  test('the same calldata sent to different TARGETS is two keys', () => {
    // Two pools' no-arg `getReserves()` share calldata entirely; only `to` separates them.
    expect(canonicalKey('eth_call', [{ to: '0xaa', data: '0x0902f1ac' }, '0x1'])).not.toBe(
      canonicalKey('eth_call', [{ to: '0xbb', data: '0x0902f1ac' }, '0x1']),
    )
  })

  test('an extra field is a different key — a `from`-carrying call is not the anonymous one', () => {
    // `internal/multicall.ts` refuses to aggregate a call that sets `from`, precisely because
    // `msg.sender` changes what it returns. The two must never be one recorded response.
    expect(canonicalKey('eth_call', [{ to: '0xaa', data: '0xbb', from: '0xcc' }, '0x1'])).not.toBe(
      canonicalKey('eth_call', [{ to: '0xaa', data: '0xbb' }, '0x1']),
    )
  })

  test('scans over different block ranges are different keys', () => {
    const base = { address: '0xaa', topics: ['0xddf252ad'] }
    expect(canonicalKey('eth_getLogs', [{ ...base, fromBlock: 1n, toBlock: 100n }])).not.toBe(
      canonicalKey('eth_getLogs', [{ ...base, fromBlock: 1n, toBlock: 101n }]),
    )
  })

  // --- THE DEDUP AXIS: one request must always produce one key ---------------------------------
  test('the same request built three different ways dedups to one key', () => {
    // Mixed-case address (viem checksummed) + bigint block + reordered fields + an explicit
    // `undefined` optional: four independent sources of spurious variance in ONE request, which is
    // exactly the shape the recorder has to fold together or it writes the same response repeatedly
    // and `replayClient` misses on the run that spells it differently.
    const keys = new Set([
      canonicalKey('eth_call', [{ to: '0xAAaaAAaaAAaaAAaaAAaaAAaaAAaaAAaaAAaaAAaa', data: '0xBEEF' }, 255n]),
      canonicalKey('eth_call', [{ data: '0xbeef', to: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' }, '0xff']),
      canonicalKey('eth_call', [{ to: '0xaaAAaaAAaaAAaaAAaaAAaaAAaaAAaaAAaaAAaaAA', data: '0xbeef', from: undefined }, '0xFF']),
    ])
    expect(keys.size).toBe(1)
  })

  test('a key is a stable string, so it can be a Map key across processes', () => {
    // The recorder writes these into JSON and the replayer reads them back: the function must
    // produce something JSON already round-trips, with no object identity involved.
    const key = canonicalKey('eth_call', [{ to: '0xaa', data: '0xbb' }, '0x1'])
    expect(typeof key).toBe('string')
    expect(JSON.parse(JSON.stringify({ [key]: 1 }))).toEqual({ [key]: 1 })
  })
})
