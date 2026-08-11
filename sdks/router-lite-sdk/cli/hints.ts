// ---------------------------------------------------------------------------
// `--hint` shorthand — a pool assertion for the pair being traded, without
// making the user hand-build a PoolHint JSON blob at the shell.
//
//   --hint v2                      the v2 pair for tokenIn/tokenOut
//   --hint v3@500                  the v3 pool at fee 500 (0.05%)
//   --hint v4@3000/60              the v4 pool at fee 3000, tickSpacing 60, no hooks
//   --hint v4@8388608/60/0xHooks   a hooked v4 pool (any fee/spacing the pool really has)
//   --hint v4@3000/60:0xdeadbeef   trailing `:0x…` attaches hookData (v4 only)
//
// The shorthand is deliberately scoped to THE REQUEST'S OWN PAIR — hints for
// unrelated pools are a programmatic use case, and the SDK's `ingestPool` is
// the right door for those. Native endpoints are translated per protocol the
// same way the SDK's own validators expect them: wrapped-native for v2/v3 (a
// v2/v3 pool can only hold the wrapped form), address(0) for v4.
// ---------------------------------------------------------------------------

import { isAddress, zeroAddress, type Address, type Hex } from 'viem'

import { sortAddresses } from '../src/experimental/index'
import type { CurrencyRef, PoolHint } from '../src/index'

import { UsageError } from './args'


function isHex(s: string): s is Hex {
  return /^0x([0-9a-fA-F]{2})*$/.test(s)
}

/** The concrete per-protocol form of a possibly-native endpoint (see module header). */
function concrete(ref: CurrencyRef, protocol: 'v2' | 'v3' | 'v4', wrappedNative: Address): Address {
  if (ref !== 'native') return ref
  return protocol === 'v4' ? zeroAddress : wrappedNative
}

function parsePositiveInt(text: string, what: string, spec: string): number {
  if (!/^\d+$/.test(text)) throw new UsageError(`bad --hint '${spec}': ${what} '${text}' is not a non-negative integer`)
  return Number(text)
}

/**
 * Parses one `--hint` value into a {@link PoolHint} for the `tokenIn`/`tokenOut` pair. Throws
 * {@link UsageError} (with the offending spec named) on any malformed input — a silently dropped
 * hint would make "did my hint change the route?" untestable, which is this flag's entire job.
 */
export function parseHint(spec: string, tokenIn: CurrencyRef, tokenOut: CurrencyRef, wrappedNative: Address): PoolHint {
  const [head, hookData] = splitOnce(spec, ':')
  if (hookData !== undefined && !isHex(hookData)) {
    throw new UsageError(`bad --hint '${spec}': hookData '${hookData}' is not well-formed hex`)
  }
  const [protocol, params] = splitOnce(head, '@')

  if (protocol === 'v2') {
    if (params !== undefined) throw new UsageError(`bad --hint '${spec}': v2 takes no fee (a pair has exactly one pool)`)
    if (hookData !== undefined) throw new UsageError(`bad --hint '${spec}': hookData is v4-only`)
    const [token0, token1] = sortAddresses(concrete(tokenIn, 'v2', wrappedNative), concrete(tokenOut, 'v2', wrappedNative))
    return { protocol: 'v2', token0, token1 }
  }

  if (protocol === 'v3') {
    if (params === undefined) throw new UsageError(`bad --hint '${spec}': v3 needs a fee, e.g. v3@500`)
    if (hookData !== undefined) throw new UsageError(`bad --hint '${spec}': hookData is v4-only`)
    const fee = parsePositiveInt(params, 'fee', spec)
    const [token0, token1] = sortAddresses(concrete(tokenIn, 'v3', wrappedNative), concrete(tokenOut, 'v3', wrappedNative))
    return { protocol: 'v3', token0, token1, fee }
  }

  if (protocol === 'v4') {
    if (params === undefined) throw new UsageError(`bad --hint '${spec}': v4 needs fee/tickSpacing, e.g. v4@3000/60`)
    const parts = params.split('/')
    if (parts.length < 2 || parts.length > 3) {
      throw new UsageError(`bad --hint '${spec}': v4 is fee/tickSpacing or fee/tickSpacing/hooks`)
    }
    const fee = parsePositiveInt(parts[0]!, 'fee', spec)
    const tickSpacing = parsePositiveInt(parts[1]!, 'tickSpacing', spec)
    const hooks = parts[2] ?? zeroAddress
    if (!isAddress(hooks, { strict: false })) throw new UsageError(`bad --hint '${spec}': hooks '${hooks}' is not an address`)
    const [currency0, currency1] = sortAddresses(concrete(tokenIn, 'v4', wrappedNative), concrete(tokenOut, 'v4', wrappedNative))
    const hint: PoolHint = { protocol: 'v4', poolKey: { currency0, currency1, fee, tickSpacing, hooks } }
    return hookData !== undefined ? { ...hint, hookData } : hint
  }

  throw new UsageError(`bad --hint '${spec}': unknown protocol '${protocol}' (v2, v3, or v4)`)
}

/** Splits on the FIRST `sep` only; `[whole, undefined]` when absent. */
function splitOnce(s: string, sep: string): [string, string | undefined] {
  const i = s.indexOf(sep)
  return i < 0 ? [s, undefined] : [s.slice(0, i), s.slice(i + 1)]
}
