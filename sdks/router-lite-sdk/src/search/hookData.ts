import type { Hex } from 'viem'

import { MAX_HOOK_DATA_BYTES } from '../constants'
import { RouterConfigError } from '../errors'
import { sortAddresses } from '../internal/currency'
import { computeV4PoolId } from '../internal/poolId'
import type { PoolHint, PoolKey } from '../types'

// ---------------------------------------------------------------------------
// hookData: request-scoped, keyed by lowercased poolId — the index itself
// never stores it (it can depend on trader/amount/direction; see types.ts).
// Shared between `router.ts` (building it from a request's own hints) and
// `../experimental` callers building their own `SearchContext`-equivalent
// wiring around `generateRoutes`.
//
// This is also the ONLY place a hint's opaque bytes are inspected, so it is
// where they are bounds- and shape-checked (C4-H4). `hookData` is copied
// verbatim into every quote call for the pool and into the final calldata,
// and nothing downstream can tell a 2 MB blob or a truncated nibble from
// legitimate hook input: viem's ABI encoder accepts an odd-length `0x` string
// by silently padding it, so a malformed hint would otherwise reach the chain
// as different bytes than the caller wrote.
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
