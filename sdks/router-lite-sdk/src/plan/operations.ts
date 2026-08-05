import { UnsupportedRouteError } from '../errors'
import type { Custody, ExecutionOperation, SwapOperation } from '../types'

// ---------------------------------------------------------------------------
// Shared operation-family helpers — the single source for the compiler
// (`plan/compile.ts`) and the encoder (`encode/ur20.ts`), which both need to
// tell a swap operation from a conversion and read its custody regardless of
// v4's `settleFrom`/`takeTo` spelling.
// ---------------------------------------------------------------------------

const SWAP_KINDS = ['v2-swap', 'v3-swap', 'v4-swap'] as const

/** Positive membership test — an operation is a swap iff its `kind` is one of the three swap kinds,
 * not merely "not a conversion" (the negation reads correctly only as long as no third operation
 * family is ever added, which a positive check does not depend on). */
export function isSwapOperation(op: ExecutionOperation): op is SwapOperation {
  return (SWAP_KINDS as readonly string[]).includes(op.kind)
}

/** Custody payer of a swap operation, across v2/v3's `payer` and v4's `settleFrom` spelling. */
export function payerOf(op: SwapOperation): Custody['payer'] {
  return op.kind === 'v4-swap' ? op.settleFrom : op.payer
}

/** Custody recipient of a swap operation, across v2/v3's `recipient` and v4's `takeTo` spelling. */
export function recipientOf(op: SwapOperation): Custody['recipient'] {
  return op.kind === 'v4-swap' ? op.takeTo : op.recipient
}

/**
 * Exhaustiveness guard: a branch that reaches here means a new `ExecutionOperation`/`SwapOperation`
 * member was added to `types.ts` without updating whatever dispatches on `kind` here. The compiler
 * enforces the `never` parameter type at every call site; the throw is what happens if that
 * guarantee is ever defeated at runtime (e.g. by an `any`-typed value crossing a module boundary).
 */
export function assertNever(x: never, what: string): never {
  throw new UnsupportedRouteError(`unreachable ${what}: ${JSON.stringify(x)}`)
}
