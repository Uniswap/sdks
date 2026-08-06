// src/types.test.ts
import { describe, expect, test } from 'bun:test'

import { RouterConfigError, UnsupportedRouteError } from './errors'
import { emptyReport, v2Ref } from './internal/testing'
import type { PoolRef, QuoteResult, RouteLeg, SwapResult } from './types'

describe('domain types', () => {
  test('errors are typed and named', () => {
    expect(new RouterConfigError('x').name).toBe('RouterConfigError')
    expect(new UnsupportedRouteError('x').name).toBe('UnsupportedRouteError')
    expect(new RouterConfigError('x')).toBeInstanceOf(Error)
  })
  test('discriminated unions narrow', () => {
    const ref: PoolRef = v2Ref(
      '0x0000000000000000000000000000000000000001',
      '0x0000000000000000000000000000000000000002',
      '0x0000000000000000000000000000000000000003',
    )
    const leg: RouteLeg = { pool: ref, currencyIn: 'native', currencyOut: ref.token1 }
    const r: SwapResult = {
      status: 'no-route',
      reason: { code: 'no-viable-route', detail: 'test' },
      alternatives: [],
      search: emptyReport(),
    }
    expect(leg.pool.protocol).toBe('v2')
    expect(r.status).toBe('no-route')
    // `search` and `alternatives` are hoisted onto the union's base, so status-agnostic code reads
    // them without narrowing first (this file compiles under `tsc` only via the test excludes, but
    // the same two accesses are what `integration/e2e.ts#describeResult` typechecks against).
    expect(r.alternatives).toEqual([])
    expect(r.search.aborted).toBe(false)
  })

  // These two assert on the TYPES; the runtime `expect` is only there to give bun a test to run.
  // `assertResultCoherent` enforces the same two shapes at runtime for JS callers — this is the half
  // that fails at the keyboard instead.
  test("an inconclusive swap cannot carry a tx without the route it's calldata for", () => {
    // @ts-expect-error — `tx` without `best` is a dangling reference: bytes to send, with nothing
    // naming the route they execute. The `inconclusive` arm is split precisely so this cannot compile.
    const dangling: SwapResult = {
      status: 'inconclusive',
      reason: { code: 'aborted', detail: 'test' },
      tx: { to: '0x0000000000000000000000000000000000000004', data: '0xfeed', value: 0n },
      alternatives: [],
      search: emptyReport(),
    }
    expect(dangling.status).toBe('inconclusive')
  })

  test('an inconclusive quote carries no leader at all', () => {
    const q: QuoteResult = {
      status: 'inconclusive',
      reason: { code: 'aborted', detail: 'test' },
      alternatives: [],
      search: emptyReport(),
    }
    // @ts-expect-error — quoting reports any leader it found as `status: 'quote'`, however incomplete
    // the search; `inconclusive` means nothing priced, so there is no `best` on this arm to read.
    expect(q.best).toBeUndefined()
    expect(q.status).toBe('inconclusive')
  })
})
