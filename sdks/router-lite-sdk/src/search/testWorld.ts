import type { Address, Hex } from 'viem'

import type { PoolIndex } from '../pools/poolIndex'
import { v2PoolRef as v2Ref } from '../protocols/poolRef'
import type { ProtocolModule } from '../protocols/types'
import type { CurrencyRef, PoolRef, Protocol } from '../types'

// ---------------------------------------------------------------------------
// THE SCRIPTED CONSTANT-PRODUCT WORLD the search suites measure against.
//
// `loop.test.ts`, `pump.test.ts` and `coverage.test.ts` each need the same two
// things and nothing more: a way to say "this pool, when quoted, answers THIS"
// (a {@link Fate}) and a `ProtocolModule` whose members the suite does not care
// about. All three grew their own copies, and the copies drifted — loop's `Fate`
// had two arms where pump's had four, so a behavior stated over the four-arm
// world (a transport loss, a revert that carries data) could not even be
// SPELLED in loop's, and the two `cpOut`/`fatePrice`/`idData` triples were
// byte-identical restatements of the same arithmetic that must agree for the
// suites' shared vocabulary ("this pool prices better than that one") to mean
// one thing.
//
// So the world lives here once, as the SUPERSET: every fate arm any suite
// scripts, and the leg-identity encoding all three read back off the wire.
//
// WHAT DELIBERATELY STAYS PER-FILE is each suite's `ProtocolModule` fake. They
// differ in ways that are the point of their own suites — loop's spread the
// REAL v2 module (so preflight simulates genuine Universal Router calldata) and
// re-point discovery at fake topics; pump's are pure local math over three
// protocols; coverage's carry adjacency shapes and `parsePoolLog` guards and
// never quote at all. A fake that tried to serve all three would be a fourth
// thing none of them tests.
//
// This module is TEST-ONLY and excluded from every build config, exactly like
// `internal/testing.ts` — `build.surface.test.ts` pins that.
// ---------------------------------------------------------------------------

/**
 * What a scripted pool does when it is measured.
 *
 * The union is the superset over every suite: `price` is the ordinary answer (with an optional
 * quoter gas figure, which only the reporting tests care about), and the three failure arms are
 * three DIFFERENT facts that the measurement layer must keep apart —
 *
 *  - `revert` — a data-less revert: the pool-absent, amount-independent shape, and the only one
 *    that may reach the negative cache (C4-H3);
 *  - `revert-data` — a revert that names a reason, so it may depend on the amount asked for;
 *  - `transport` — nothing was learned about this pool at all;
 *  - `implausible` — the quoter ANSWERED, with an amountOut in the negative-int128-as-unsigned
 *    range (>= 2^127): the decode seam rejects it (`ImplausibleQuoteError`), and the leg must
 *    settle as an amount-DEPENDENT revert — the pool exists; its hook lies.
 */
export type Fate =
  | { kind: 'price'; r0: bigint; r1: bigint; gas?: bigint }
  | { kind: 'revert' }
  | { kind: 'revert-data' }
  | { kind: 'transport' }
  | { kind: 'implausible' }

/** pool.id -> fate. The whole world a suite scripts. */
export type World = Map<string, Fate>

/** An address from a small integer — the readable way to spell "some distinct pool/token". */
export function addr(n: number): Address {
  return `0x${n.toString(16).padStart(40, '0')}` as Address
}

/** v2's own fee curve — any monotone function works; this one is easy to brute-force. */
export function cpOut(amountIn: bigint, reserveIn: bigint, reserveOut: bigint): bigint {
  const withFee = amountIn * 997n
  return (withFee * reserveOut) / (reserveIn * 1000n + withFee)
}

/** The amount a priced fate answers for this direction, or `undefined` for every other arm. */
export function fatePrice(fate: Fate, pool: PoolRef, currencyIn: CurrencyRef, amountIn: bigint): bigint | undefined {
  if (fate.kind !== 'price') return undefined
  const zeroForOne = String(currencyIn).toLowerCase() === String(pool.currencies[0]).toLowerCase()
  const [reserveIn, reserveOut] = zeroForOne ? [fate.r0, fate.r1] : [fate.r1, fate.r0]
  return cpOut(amountIn, reserveIn, reserveOut)
}

/** Leg identity as the scripted client sees it — what the dedup properties count. */
export function idData(pool: PoolRef, currencyIn: CurrencyRef, amountIn: bigint): Hex {
  return `0x${Buffer.from(`${pool.id}|${String(currencyIn).toLowerCase()}|${amountIn}`).toString('hex')}` as Hex
}

/** {@link idData} read back off the wire: `pool.id|currencyIn|amountIn`. */
export function fromIdData(data: Hex): string {
  return Buffer.from(data.slice(2), 'hex').toString()
}

/**
 * A distinct v2-shaped pool over (a, b), scripted into `world` and optionally indexed.
 *
 * The counter is module-level and shared across suites on purpose: it only has to be UNIQUE, and it
 * is monotone, so the relative order of any two pools' addresses (which is what a ranking tie-break
 * can see) is the order they were created in, whichever file created them. The base sits above every
 * hand-picked `addr(...)` literal in the suites so a generated pool can never collide with one.
 */
let nextPoolNumber = 0x10_0000

export function newPool(
  index: PoolIndex | undefined,
  world: World,
  a: Address,
  b: Address,
  fate?: Fate,
  createdAtBlock = 1n,
): PoolRef {
  const pool = v2Ref(addr(nextPoolNumber++), a, b)
  world.set(pool.id, fate ?? { kind: 'price', r0: 10n ** 12n, r1: 10n ** 12n })
  index?.upsert({ pool, source: 'event', createdAtBlock })
  return pool
}

/**
 * The `ProtocolModule` members a suite's fake does not exercise — spread into a fake to satisfy the
 * interface. `encodeQuote` and `compileOperation` THROW rather than answering: a fake that quietly
 * returned `[]` from a member a test did not mean to reach would let the test pass while measuring
 * nothing. `hypotheses` and `validateHint` cannot follow that rule — a search calls both on every
 * cycle whether or not a suite means to exercise them, so throwing would fail suites that never
 * touch this protocol at all; they instead answer with the emptiest honest reply (`hypotheses`
 * returns `[]`, `validateHint` resolves `null`), which reads to the search as "this protocol found
 * nothing to add," not as a hidden failure.
 */
export const unused = {
  hypotheses: () => [],
  validateHint: async () => null,
  encodeQuote: () => {
    throw new Error('not used')
  },
  compileOperation: () => {
    throw new Error('not used')
  },
} as unknown as Pick<ProtocolModule, 'hypotheses' | 'validateHint' | 'encodeQuote' | 'compileOperation'>

/** A module that reports itself off for every manifest — the "this protocol is not in play" stub. */
export const disabledModule = (id: Protocol): ProtocolModule =>
  ({ id, enabled: () => false, adjacencyShape: () => undefined, parsePoolLog: () => null, ...unused }) as ProtocolModule
