// ---------------------------------------------------------------------------
// Reason-code explanations — one human sentence per `ReasonCode`, with the
// action a routing engineer at a terminal would actually take next.
//
// `satisfies Record<ReasonCode, string>` keeps the table exhaustive at
// compile time: an eighth reason code added to the SDK fails this CLI's
// typecheck instead of printing an unexplained code at the terminal.
// ---------------------------------------------------------------------------

import type { ReasonCode } from '../src/index'

const EXPLANATIONS = {
  'rpc-unavailable':
    'Total RPC outage — not even the pinned block could be fetched, so nothing was searched. Check what --rpc/$ETH_RPC_URL points at.',
  'rpc-degraded':
    'Some RPC calls were rate-limited, timed out, or lost, so the search ran but cannot be promised complete. Retry, or point at a healthier endpoint.',
  aborted: 'The --budget expired before the bounded search finished. Raise it (or drop it) and rerun.',
  'discovery-incomplete':
    'Log-scan discovery did not finish for at least one protocol — see the per-protocol coverage above; an un-scanned range can hide pools.',
  'quotes-unattempted': 'The search ended with route candidates still unquoted — a longer budget would price more of them.',
  'no-viable-route':
    'The bounded search completed and priced nothing — no direct or one-intermediate route exists within its limits. A --hint can assert a pool it cannot see.',
  'no-route-verified':
    'Routes priced, but none survived execution verification — every candidate reverted in preflight or failed to compile. Check the alternatives’ revert data below.',
} satisfies Record<ReasonCode, string>

/** The one-sentence explanation for `code` — total over the SDK's closed set. */
export function explainReason(code: ReasonCode): string {
  return EXPLANATIONS[code]
}
