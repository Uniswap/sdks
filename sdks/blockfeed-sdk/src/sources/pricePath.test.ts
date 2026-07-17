import { Ether, Token } from '@uniswap/sdk-core'
import { describe, expect, it } from 'bun:test'
import type { Address } from 'viem'

import { BlockfeedError } from '../errors'
import { ok } from '../internal/testing'
import { poolIdFromPoolKey } from '../math/poolId'
import type { CallResult, PathLeg, PricePath, TickData, TickIdentity } from '../types'

import { pricePathKey, pricePathSource } from './pricePath'

const USDC = new Token(1, '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', 6, 'USDC', 'USD Coin')
const WETH = new Token(1, '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', 18, 'WETH', 'Wrapped Ether')
const DAI = new Token(1, '0x6B175474E89094C44Da98b954EedeAC495271d0F', 18, 'DAI', 'Dai Stablecoin')
const ETH = Ether.onChain(1)

const V3_POOL = '0x88e6A0c2dDD26FEEb64F039a2c41296FcB3f5640' as Address
const V2_PAIR = '0xB4e16d0168e52d35CaCD2c6185b44281Ec28C9Dc' as Address

const SQRT_USDC_WETH = 1771595571142957102961017161607260n // ≈ WETH = 2000 USDC

const IDENTITY: TickIdentity = {
  chainId: 1,
  blockNumber: 100n,
  parentBlockHash: '0xabc',
  timestamp: 1_700_000_000n,
}

function tick(results: Record<string, CallResult>): TickData {
  return { identity: IDENTITY, results, logs: [], retractions: [] }
}


// v3 slot0 returns a 7-tuple; only index 0 (sqrtPriceX96) matters.
const slot0 = (sqrtPriceX96: bigint) => ok([sqrtPriceX96, 0, 0, 0, 0, 0, true])
// v4 getSlot0 returns a 4-tuple.
const v4Slot0 = (sqrtPriceX96: bigint) => ok([sqrtPriceX96, 0, 0, 0])
// v2 getReserves returns a 3-tuple.
const reserves = (r0: bigint, r1: bigint) => ok([r0, r1, 0])

describe('pricePathSource construction', () => {
  it('derives chainId from path.base and resolves a v4 leg without an options arg', () => {
    const path: PricePath = {
      base: WETH,
      quote: USDC,
      legs: [
        {
          pool: { protocol: 'v4', poolKey: { currency0: USDC.address, currency1: WETH.address, fee: 500, tickSpacing: 10, hooks: '0x0000000000000000000000000000000000000000' } },
          base: WETH,
          quote: USDC,
        },
      ],
    }
    // chainId comes from path.base.chainId (1) — no options needed for the v4 StateView resolution.
    expect(() => pricePathSource(path)).not.toThrow()
  })

  it('throws when a leg currency is on a different chain than path.base', () => {
    const USDC_OP = new Token(10, '0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85', 6, 'USDC', 'USD Coin')
    const path: PricePath = {
      base: WETH, // chain 1
      quote: USDC_OP, // chain 10 → mismatch
      legs: [{ pool: { protocol: 'v3', pool: V3_POOL }, base: WETH, quote: USDC_OP }],
    }
    expect(() => pricePathSource(path)).toThrow(BlockfeedError)
  })

  it('throws when adjacent legs do not chain (leg[i].quote != leg[i+1].base)', () => {
    const path: PricePath = {
      base: WETH,
      quote: USDC,
      legs: [
        { pool: { protocol: 'v3', pool: V3_POOL }, base: WETH, quote: DAI },
        { pool: { protocol: 'v2', pair: V2_PAIR }, base: WETH, quote: USDC }, // base should be DAI
      ],
    }
    expect(() => pricePathSource(path)).toThrow(BlockfeedError)
  })

  it('throws when path.base/quote do not match the first/last leg endpoints', () => {
    const path: PricePath = {
      base: DAI, // first leg base is WETH
      quote: USDC,
      legs: [{ pool: { protocol: 'v3', pool: V3_POOL }, base: WETH, quote: USDC }],
    }
    expect(() => pricePathSource(path)).toThrow(BlockfeedError)
  })

  it('throws on an empty leg list', () => {
    expect(() => pricePathSource({ base: WETH, quote: USDC, legs: [] })).toThrow(BlockfeedError)
  })
})

describe('pricePathSource.calls', () => {
  it('emits the right read per protocol', () => {
    const legs: PathLeg[] = [
      { pool: { protocol: 'v3', pool: V3_POOL }, base: WETH, quote: DAI },
      {
        pool: { protocol: 'v4', poolKey: { currency0: '0x0000000000000000000000000000000000000000', currency1: DAI.address, fee: 500, tickSpacing: 10, hooks: '0x0000000000000000000000000000000000000000' } },
        base: DAI,
        quote: ETH,
      },
    ]
    const source = pricePathSource({ base: WETH, quote: ETH, legs })
    const calls = source.calls(undefined)
    expect(Object.keys(calls).sort()).toEqual(['leg0', 'leg1'])
    expect(calls.leg0.functionName).toBe('slot0')
    expect(calls.leg0.address).toBe(V3_POOL)
    expect(calls.leg1.functionName).toBe('getSlot0')
    // v4 leg reads StateView with the derived poolId.
    const poolId = poolIdFromPoolKey({ currency0: '0x0000000000000000000000000000000000000000' as Address, currency1: DAI.address, fee: 500, tickSpacing: 10, hooks: '0x0000000000000000000000000000000000000000' as Address })
    expect(calls.leg1.args[0]).toBe(poolId)
  })

  it('ISOLATION INVARIANT: every leg read is allowFailure:true (a bad path never fails other sources’ tick)', () => {
    const source = pricePathSource({
      base: WETH,
      quote: USDC,
      legs: [
        { pool: { protocol: 'v2', pair: V2_PAIR }, base: WETH, quote: DAI },
        { pool: { protocol: 'v3', pool: V3_POOL }, base: DAI, quote: USDC },
      ],
    })
    const calls = source.calls(undefined)
    expect(Object.keys(calls).length).toBeGreaterThan(0)
    for (const key of Object.keys(calls)) {
      expect({ key, allowFailure: calls[key].allowFailure }).toEqual({ key, allowFailure: true })
    }
  })

  it('uses getReserves for a v2 leg', () => {
    const source = pricePathSource({
      base: WETH,
      quote: USDC,
      legs: [{ pool: { protocol: 'v2', pair: V2_PAIR }, base: WETH, quote: USDC }],
    })
    const calls = source.calls(undefined)
    expect(calls.leg0.functionName).toBe('getReserves')
    expect(calls.leg0.address).toBe(V2_PAIR)
  })
})

describe('pricePathSource.derive', () => {
  it('derives a single v3 leg price (WETH in USDC ≈ 2000)', () => {
    const source = pricePathSource({
      base: WETH,
      quote: USDC,
      legs: [{ pool: { protocol: 'v3', pool: V3_POOL }, base: WETH, quote: USDC }],
    })
    const emission = source.derive(tick({ leg0: slot0(SQRT_USDC_WETH) }), undefined)
    expect(emission).toBeDefined()
    expect(emission!.value.price.baseCurrency.equals(WETH)).toBe(true)
    expect(emission!.value.price.quoteCurrency.equals(USDC)).toBe(true)
    expect(emission!.value.price.toSignificant(5).startsWith('2000')).toBe(true)
    // priceFloat mirrors the composed price as a plain number.
    expect(Math.round(emission!.value.priceFloat)).toBe(2000)
    expect(emission!.value.legPrices).toHaveLength(1)
    expect(emission!.identity).toBe(IDENTITY)
  })

  it('composes a 2-leg path (DAI→WETH v2, WETH→USDC v3) via .multiply', () => {
    // Leg 0 (v2 DAI/WETH): reserves ⇒ 1 WETH = 2000 DAI, i.e. DAI in WETH = 1/2000.
    //   token0=DAI(0x6B..), token1=WETH(0xC0..). reserve0=DAI, reserve1=WETH.
    //   2,000,000 DAI and 1000 WETH ⇒ WETH per DAI (raw, decimals equal) = 1000/2_000_000 = 0.0005.
    const r0 = 2_000_000n * 10n ** 18n // DAI
    const r1 = 1000n * 10n ** 18n // WETH
    // Leg 1 (v3 WETH/USDC): WETH in USDC ≈ 2000.
    const source = pricePathSource({
      base: DAI,
      quote: USDC,
      legs: [
        { pool: { protocol: 'v2', pair: V2_PAIR }, base: DAI, quote: WETH },
        { pool: { protocol: 'v3', pool: V3_POOL }, base: WETH, quote: USDC },
      ],
    })
    const emission = source.derive(tick({ leg0: reserves(r0, r1), leg1: slot0(SQRT_USDC_WETH) }), undefined)
    expect(emission).toBeDefined()
    // DAI in USDC = (WETH per DAI) × (USDC per WETH) = 0.0005 × 2000 = 1.00.
    expect(emission!.value.price.baseCurrency.equals(DAI)).toBe(true)
    expect(emission!.value.price.quoteCurrency.equals(USDC)).toBe(true)
    expect(emission!.value.price.toSignificant(4)).toBe('1')
    expect(emission!.value.legPrices).toHaveLength(2)
  })

  it('composes across a native/WETH boundary (leg quote WETH → next base native ETH)', () => {
    // Leg 0 v3 DAI/WETH quoting WETH; leg 1 v4 WETH/USDC pool but the leg is priced from native ETH.
    // The boundary leg0.quote=WETH → leg1.base=ETH(native) is wrapped-equivalent and must compose.
    // sqrtP=2^96 with DAI(18)/WETH(18) ⇒ DAI in WETH = 1. Then ETH(≡WETH) in USDC ≈ 2000 ⇒ product ≈ 2000.
    const Q96 = 2n ** 96n
    // v4 pool currency0=USDC, currency1=WETH (address-sorted, non-native); leg prices from native ETH.
    const v4Key = { currency0: USDC.address, currency1: WETH.address, fee: 500, tickSpacing: 10, hooks: '0x0000000000000000000000000000000000000000' as Address }
    const source = pricePathSource({
      base: DAI,
      quote: USDC,
      legs: [
        { pool: { protocol: 'v3', pool: V3_POOL }, base: DAI, quote: WETH },
        { pool: { protocol: 'v4', poolKey: v4Key }, base: ETH, quote: USDC },
      ],
    })
    const emission = source.derive(tick({ leg0: slot0(Q96), leg1: v4Slot0(SQRT_USDC_WETH) }), undefined)
    expect(emission).toBeDefined()
    expect(emission!.value.price.baseCurrency.equals(DAI)).toBe(true)
    expect(emission!.value.price.quoteCurrency.equals(USDC)).toBe(true)
    expect(emission!.value.price.toSignificant(5).startsWith('2000')).toBe(true)
  })

  it('returns undefined for an uninitialized v4 pool (sqrtPriceX96 === 0)', () => {
    const v4Key = { currency0: USDC.address, currency1: WETH.address, fee: 500, tickSpacing: 10, hooks: '0x0000000000000000000000000000000000000000' as Address }
    const source = pricePathSource({
      base: WETH,
      quote: USDC,
      legs: [{ pool: { protocol: 'v4', poolKey: v4Key }, base: WETH, quote: USDC }],
    })
    expect(source.derive(tick({ leg0: v4Slot0(0n) }), undefined)).toBeUndefined()
  })

  it('returns undefined when a leg read is missing or failed', () => {
    const source = pricePathSource({
      base: WETH,
      quote: USDC,
      legs: [{ pool: { protocol: 'v3', pool: V3_POOL }, base: WETH, quote: USDC }],
    })
    expect(source.derive(tick({}), undefined)).toBeUndefined()
    const failed: CallResult = { status: 'failure', error: new Error('revert') }
    expect(source.derive(tick({ leg0: failed }), undefined)).toBeUndefined()
  })
})

describe('pricePathSource.valueEquals', () => {
  it('suppresses equal prices from fresh objects', () => {
    const source = pricePathSource({
      base: WETH,
      quote: USDC,
      legs: [{ pool: { protocol: 'v3', pool: V3_POOL }, base: WETH, quote: USDC }],
    })
    const a = source.derive(tick({ leg0: slot0(SQRT_USDC_WETH) }), undefined)!
    const b = source.derive(tick({ leg0: slot0(SQRT_USDC_WETH) }), undefined)!
    expect(a.value).not.toBe(b.value) // different object identities
    expect(source.valueEquals!(a.value, b.value)).toBe(true)
    // A moved price is not suppressed.
    const c = source.derive(tick({ leg0: slot0(SQRT_USDC_WETH + 10n ** 30n) }), undefined)!
    expect(source.valueEquals!(a.value, c.value)).toBe(false)
  })
})

describe('pricePathKey', () => {
  it('is identical for two structurally-identical paths', () => {
    const make = (): PricePath => ({
      base: WETH,
      quote: USDC,
      legs: [{ pool: { protocol: 'v3', pool: V3_POOL }, base: WETH, quote: USDC }],
    })
    expect(pricePathKey(make())).toBe(pricePathKey(make()))
  })

  it('differs when a pool or currency differs', () => {
    const base: PricePath = {
      base: WETH,
      quote: USDC,
      legs: [{ pool: { protocol: 'v3', pool: V3_POOL }, base: WETH, quote: USDC }],
    }
    const otherPool: PricePath = {
      base: WETH,
      quote: USDC,
      legs: [{ pool: { protocol: 'v3', pool: V2_PAIR }, base: WETH, quote: USDC }],
    }
    expect(pricePathKey(base)).not.toBe(pricePathKey(otherPool))
  })

  it('encodes the v4 poolId so two paths with the same poolKey collapse', () => {
    const v4Key = { currency0: USDC.address, currency1: WETH.address, fee: 500, tickSpacing: 10, hooks: '0x0000000000000000000000000000000000000000' as Address }
    const p: PricePath = {
      base: WETH,
      quote: USDC,
      legs: [{ pool: { protocol: 'v4', poolKey: { ...v4Key } }, base: WETH, quote: USDC }],
    }
    const q: PricePath = {
      base: WETH,
      quote: USDC,
      legs: [{ pool: { protocol: 'v4', poolKey: { ...v4Key } }, base: WETH, quote: USDC }],
    }
    expect(pricePathKey(p)).toBe(pricePathKey(q))
  })
})
