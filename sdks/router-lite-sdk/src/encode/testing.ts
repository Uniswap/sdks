import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import type { ExecutionPlan } from '../types'

// ---------------------------------------------------------------------------
// The golden corpus, and the bigint tagging that lets it live in JSON.
//
// THE CORPUS IS SPLIT BY WHAT VARIES. Every shape's compiled `ExecutionPlan`
// and its tx `value` were byte-for-byte identical across the two command sets —
// 73 of 73, both fields — which is not a coincidence to be noticed later but
// the design: a command set revises the ABI LAYOUT of three swap payloads
// (`ur21.ts`) and nothing about what the plan says to do or what ether it
// carries. Stored per-set, that fact had to be re-established by comparing two
// large files, and the two copies were free to drift with nobody the wiser.
//
// So there are three files instead of two, and the shared one is the plans:
//
//   goldens-plans.json   name -> { plan, value }   ONE corpus, both sets
//   goldens.json         name -> calldata          ur-2.0's wire bytes
//   goldens-ur21.json    name -> calldata          ur-2.1's wire bytes
//
// The duplication is gone (the plans were ~90% of both files), the invariant is
// STRUCTURAL rather than asserted, and a real divergence — a command set that
// genuinely needed a different plan — now fails at the point where the two runs
// hand in their plans (`differential.test.ts`) instead of hiding as a diff in a
// 380 kB file nobody reads.
//
// TEST-ONLY, and excluded from every build by the existing `src/**/testing.ts`
// rule (`tsconfig.{esm,cjs,types}.json`) — the same treatment
// `internal/testing.ts` gets. `build.surface.test.ts` asserts that nothing
// reachable from the entry points imports it.
// ---------------------------------------------------------------------------

/** What a shape's golden says, once the two files are joined on its name. */
type Golden = { plan: ExecutionPlan; calldata: string; value: string }

/** The half of a golden that does NOT vary with the command set. */
export type GoldenPlan = { plan: unknown; value: string }

export const PLANS_FILE = './goldens-plans.json'

/**
 * Renders a value as JSON with bigints tagged, so an `ExecutionPlan` survives the round trip
 * unambiguously. `{ $bigint: "1000" }` rather than a bare string, because a plan is full of both
 * (addresses and calldata are strings that must come back as strings).
 */
export function withTaggedBigints(value: unknown): string {
  return JSON.stringify(value, (_key, raw) => (typeof raw === 'bigint' ? { $bigint: raw.toString() } : raw), 2)
}

/** The exact inverse of {@link withTaggedBigints}. `replay.test.ts`-style round-trip asserted in
 * `differential.test.ts`, so the pair cannot drift apart the way two hand-written copies of this
 * function (one in `ur20.test.ts`, one in `ur21.test.ts`) silently could. */
export function reviveBigints<T>(json: string): T {
  return JSON.parse(json, (_key, value) =>
    value !== null && typeof value === 'object' && typeof (value as { $bigint?: string }).$bigint === 'string'
      ? BigInt((value as { $bigint: string }).$bigint)
      : value,
  ) as T
}

function read(file: string): string {
  return readFileSync(fileURLToPath(new URL(file, import.meta.url)), 'utf8')
}

/** The shared plan corpus: shape name -> the compiled plan and the tx value, bigints revived. */
export function loadGoldenPlans(): Record<string, GoldenPlan> {
  return reviveBigints<Record<string, GoldenPlan>>(read(PLANS_FILE))
}

/** One command set's wire bytes: shape name -> calldata. No bigints; plain strings throughout. */
export function loadGoldenCalldata(file: string): Record<string, string> {
  return JSON.parse(read(file)) as Record<string, string>
}

/** The joined view a replay wants: plan + value from the shared corpus, calldata from one set's file. */
export function loadGoldens(calldataFile: string): Record<string, Golden> {
  const plans = loadGoldenPlans()
  const calldata = loadGoldenCalldata(calldataFile)
  const out: Record<string, Golden> = {}
  for (const [name, entry] of Object.entries(plans)) {
    const data = calldata[name]
    if (data === undefined) throw new Error(`golden corpus is inconsistent: ${calldataFile} has no calldata for '${name}'`)
    out[name] = { plan: entry.plan as ExecutionPlan, calldata: data, value: entry.value }
  }
  for (const name of Object.keys(calldata)) {
    if (plans[name] === undefined) throw new Error(`golden corpus is inconsistent: ${calldataFile} has '${name}', the plan corpus does not`)
  }
  return out
}
