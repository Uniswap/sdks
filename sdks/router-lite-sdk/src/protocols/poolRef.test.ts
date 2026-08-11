import { expect, test } from 'bun:test'
import type { Address } from 'viem'
import { zeroAddress } from 'viem'

import { computeV4PoolId } from '../internal/poolId'
import type { CurrencyRef, PoolKey, PoolRef, RouteCandidate } from '../types'

import { isHooked, routeId, v2PoolRef, v3PoolRef, v4PoolRef } from './poolRef'

const USDC = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48' as Address
const WETH = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2' as Address
const V2_POOL = '0x00000000000000000000000000000000000b0001' as Address
const V3_POOL = '0x00000000000000000000000000000000000a0001' as Address
const HOOK = '0x0000000000000000000000000000000000000088' as Address

test('v2/v3 refs sort their token pair rather than trusting the caller', () => {
  // USDC < WETH, so the second call is the reversed (wrong) order a caller could pass in.
  expect(v2PoolRef(V2_POOL, WETH, USDC)).toEqual(v2PoolRef(V2_POOL, USDC, WETH))
  expect(v3PoolRef(V3_POOL, WETH, USDC, 500)).toEqual(v3PoolRef(V3_POOL, USDC, WETH, 500))

  const reversed = v2PoolRef(V2_POOL, WETH, USDC)
  expect([reversed.token0, reversed.token1]).toEqual([USDC, WETH])
  expect(reversed.currencies).toEqual([USDC, WETH])
})

test('the identity string is protocol + lowercased address, and drives PoolRef.id', () => {
  expect(v2PoolRef(V2_POOL, USDC, WETH).id).toBe(`v2:${V2_POOL.toLowerCase()}`)
  expect(v3PoolRef(V3_POOL, USDC, WETH, 500).id).toBe(`v3:${V3_POOL.toLowerCase()}`)

  const key: PoolKey = { currency0: zeroAddress, currency1: USDC, fee: 500, tickSpacing: 10, hooks: zeroAddress }
  const ref = v4PoolRef(key)
  expect(ref.poolId).toBe(computeV4PoolId(key))
  expect(ref.id).toBe(`v4:${computeV4PoolId(key).toLowerCase()}`)
})

test('v4 currencies are domain form (address(0) -> native) and its key order is left alone', () => {
  const native: PoolKey = { currency0: zeroAddress, currency1: USDC, fee: 500, tickSpacing: 10, hooks: zeroAddress }
  expect(v4PoolRef(native).currencies).toEqual(['native', USDC])

  // Reordering a PoolKey would change its hash — i.e. name a different pool — so the constructor
  // never does it. Sorting is the calling module's job (`v4Module.validateHint`).
  const unsorted: PoolKey = { currency0: WETH, currency1: USDC, fee: 500, tickSpacing: 10, hooks: zeroAddress }
  expect(v4PoolRef(unsorted).poolKey).toEqual(unsorted)
  expect(v4PoolRef(unsorted).currencies).toEqual([WETH, USDC])
})

test('routeId is determined by the ordered pool sequence, and by nothing else', () => {
  // `routeId` is the identity the whole engine keys on: the compiled-plan memo (`search/verifier.ts`),
  // the leader-change test that decides whether an event is a `lead` (`search/loop.ts`), the ranking
  // tie-break (`quote/rank.ts`), and the outcome log's per-route entries. Every one of those breaks
  // in a different, confusing way if the same route can produce two ids, or two routes one id — so
  // the contract gets its own direct test rather than being inferred from those four call sites.
  const a = v2PoolRef(V2_POOL, USDC, WETH)
  const b = v3PoolRef(V3_POOL, WETH, USDC, 500)
  const legs = (...refs: [PoolRef, CurrencyRef, CurrencyRef][]): RouteCandidate => ({
    legs: refs.map(([pool, currencyIn, currencyOut]) => ({ pool, currencyIn, currencyOut })),
  })

  const usdcFirst = legs([a, USDC, WETH], [b, WETH, USDC])
  // Same pools, same directions, freshly-built leg objects: identical id. (Reference identity is not
  // what makes two candidates the same route — the engine builds candidates independently in
  // different cycles and must still recognise them as one.)
  expect(routeId(usdcFirst)).toBe(routeId(legs([a, USDC, WETH], [b, WETH, USDC])))

  // Order is part of the identity: the same two pools traversed the other way round is a DIFFERENT
  // route, and must not collide with the first in any of the four maps keyed by this string.
  expect(routeId(legs([b, USDC, WETH], [a, WETH, USDC]))).not.toBe(routeId(usdcFirst))

  // And the id is exactly the ordered pool ids — so it carries no amount, no block, and nothing else
  // that varies between cycles for one route.
  expect(routeId(usdcFirst)).toBe(`${a.id}>${b.id}`)
})

test('isHooked is true only for a v4 pool with a non-zero hooks address', () => {
  const key = (hooks: Address): PoolKey => ({ currency0: zeroAddress, currency1: USDC, fee: 3000, tickSpacing: 60, hooks })
  expect(isHooked(v4PoolRef(key(HOOK)))).toBe(true)
  expect(isHooked(v4PoolRef(key(zeroAddress)))).toBe(false)
  expect(isHooked(v2PoolRef(V2_POOL, USDC, WETH))).toBe(false)
  expect(isHooked(v3PoolRef(V3_POOL, USDC, WETH, 500))).toBe(false)
})
