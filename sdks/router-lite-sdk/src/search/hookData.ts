import type { Address, Hex } from 'viem'
import { isAddress } from 'viem'

import { MAX_HOOK_DATA_BYTES } from '../constants'
import { RouterConfigError } from '../errors'
import { sortAddresses } from '../internal/currency'
import { computeV4PoolId } from '../internal/poolId'
import type { PoolHint, PoolKey } from '../types'

// ---------------------------------------------------------------------------
// hookData: request-scoped, keyed by lowercased poolId — the index itself
// never stores it (it can depend on trader/amount/direction; see types.ts).
// Shared between `router.ts` (building it from a request's own hints) and
// `../experimental` callers building their own wiring around
// `compileExecutionPlan`.
//
// This is also the hint FIELD-VALIDATION seam (C4-H4) — the one place a hint's
// caller-supplied values are checked before anything derives an address, a
// poolId or a calldata blob from them. Two kinds of value are checked:
//
//  - `hookData`, the opaque bytes. Copied verbatim into every quote call for
//    the pool and into the final calldata, and nothing downstream can tell a
//    2 MB blob or a truncated nibble from legitimate hook input: viem's ABI
//    encoder accepts an odd-length `0x` string by silently padding it, so a
//    malformed hint would otherwise reach the chain as different bytes than
//    the caller wrote.
//  - The ADDRESS fields (R3). `PoolHint` types them as `Address`, but that is
//    a compile-time assertion about a value a stranger may have composed —
//    `'0xnope'` satisfies no runtime check the type performs. Left unchecked it
//    travels into `computeV2PairAddress`/`computeV4PoolId`/`getPool`, where
//    viem throws its own `InvalidAddressError` from the middle of a search: a
//    stack pointing at an encoder rather than a named, pre-RPC complaint about
//    the field the caller got wrong.
// ---------------------------------------------------------------------------

/** `0x` followed by an even number of hex digits — the only shape a `bytes` argument can be. */
const HEX_BYTES = /^0x([0-9a-fA-F]{2})*$/

/** Names the offending hint by its pool key, since a request may carry many and the index is the
 * only other way to tell them apart — and the caller is the one who has to find the bad one. */
function hintLabel(poolKey: PoolKey): string {
  return `v4 hint ${poolKey.currency0}/${poolKey.currency1} fee ${poolKey.fee} hooks ${poolKey.hooks}`
}

function assertHookData(hookData: Hex, poolKey: PoolKey): void {
  if (typeof hookData !== 'string' || !HEX_BYTES.test(hookData)) {
    throw new RouterConfigError(`${hintLabel(poolKey)} carries hookData that is not 0x-prefixed even-length hex`)
  }
  const bytes = (hookData.length - 2) / 2
  if (bytes > MAX_HOOK_DATA_BYTES) {
    throw new RouterConfigError(`${hintLabel(poolKey)} carries ${bytes} bytes of hookData, over the ${MAX_HOOK_DATA_BYTES}-byte limit`)
  }
}

/**
 * Rejects a hint address that is not a syntactically valid 20-byte address, naming the exact field
 * so the caller can find it in a request that may carry up to `MAX_HINTS_PER_REQUEST` of them.
 *
 * `strict: false` is deliberate: it checks the SHAPE (`0x` + 40 hex digits) without demanding EIP-55
 * checksum casing. Callers legitimately pass all-lowercase addresses — that is what every JSON-RPC
 * response and most config files contain — and every comparison this package makes is
 * case-insensitive anyway, so strict mode would reject correct input.
 */
function assertHintAddress(value: Address, field: string, hintIndex: number): void {
  if (typeof value !== 'string' || !isAddress(value, { strict: false })) {
    throw new RouterConfigError(`hint[${hintIndex}].${field} is not a valid address, got ${String(value)}`)
  }
}

/**
 * Validates every address a {@link PoolHint} carries — synchronously, before any RPC and before any
 * CREATE2/poolId derivation reads them. See this module's header for why the `Address` type alone is
 * not the check.
 *
 * `pool` is optional on v2/v3 hints and validated only when supplied. v4's `hooks` is validated like
 * any other field: `address(0)` (the no-hooks case) is a perfectly valid address and passes.
 */
export function assertHintAddresses(hints: PoolHint[] | undefined): void {
  if (!hints) return
  hints.forEach((hint, i) => {
    if (hint === null || typeof hint !== 'object') throw new RouterConfigError(`hint[${i}] is not an object, got ${String(hint)}`)
    if (hint.protocol === 'v4') {
      const key = hint.poolKey as PoolKey | undefined
      if (key === null || typeof key !== 'object') throw new RouterConfigError(`hint[${i}].poolKey is not an object, got ${String(key)}`)
      assertHintAddress(key.currency0, 'poolKey.currency0', i)
      assertHintAddress(key.currency1, 'poolKey.currency1', i)
      assertHintAddress(key.hooks, 'poolKey.hooks', i)
      return
    }
    assertHintAddress(hint.token0, 'token0', i)
    assertHintAddress(hint.token1, 'token1', i)
    if (hint.pool !== undefined) assertHintAddress(hint.pool, 'pool', i)
  })
}

/**
 * Builds the poolId -> hookData map a search/compile call keys its v4 legs against, rejecting any
 * hint whose `hookData` is malformed or oversized with a {@link RouterConfigError}.
 */
export function buildHookData(hints: PoolHint[] | undefined): Map<string, Hex> {
  const map = new Map<string, Hex>()
  if (!hints) return map
  for (const hint of hints) {
    if (hint.protocol !== 'v4' || hint.hookData === undefined) continue
    const [currency0, currency1] = sortAddresses(hint.poolKey.currency0, hint.poolKey.currency1)
    const poolKey: PoolKey = { ...hint.poolKey, currency0, currency1 }
    assertHookData(hint.hookData, poolKey)
    map.set(computeV4PoolId(poolKey).toLowerCase(), hint.hookData)
  }
  return map
}
