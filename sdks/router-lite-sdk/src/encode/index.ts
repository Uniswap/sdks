import { UnsupportedRouteError } from '../errors'
import type { CommandSet, EncodedTx, ExecutionPlan, UniversalRouterDeployment } from '../types'

import { encodeExecutionPlan } from './ur20'
import { encodeExecutionPlanUr21 } from './ur21'

// ---------------------------------------------------------------------------
// `encoderFor` — the dispatch seam between a compiled plan and the
// command-set-specific encoder that turns it into calldata.
//
// Every real caller (the wave engine's `search/leader.ts`, and `experimental`
// for callers building their own search policy) goes through this instead of
// importing `encodeExecutionPlan` directly — which is why `ur-2.1` (the
// second family, proving the extension axis) was a matter of registering it
// in `ENCODERS`, not hunting down every call site that hardcoded `ur-2.0`'s
// encoder.
// ---------------------------------------------------------------------------

type Encoder = (plan: ExecutionPlan, deployment: UniversalRouterDeployment, deadline: bigint) => EncodedTx

const ENCODERS: Record<CommandSet, Encoder> = { 'ur-2.0': encodeExecutionPlan, 'ur-2.1': encodeExecutionPlanUr21 }

/** The encoder for `commandSet`, or throws {@link UnsupportedRouteError} — the same error a route
 * outside the closed supported shape throws — for anything outside the registered set. */
export function encoderFor(commandSet: CommandSet): Encoder {
  const encoder = ENCODERS[commandSet]
  if (!encoder)
    throw new UnsupportedRouteError(
      `unsupported Universal Router command set '${String(commandSet)}'; the encodable sets are ${Object.keys(ENCODERS).join(', ')}`,
    )
  return encoder
}
