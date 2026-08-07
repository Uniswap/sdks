// src/types.test.ts
import { describe, expect, test } from 'bun:test'

import { RouterConfigError, UnsupportedRouteError } from './errors'
import { emptyReport, v2Ref } from './internal/testing'
import type { PoolRef, RouteLeg, SwapResult } from './types'

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
})
