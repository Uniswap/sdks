import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, test } from 'bun:test'

import {
  canonicalizeResult,
  foldFixture,
  OUTCOME_LOG_SCHEMA_VERSION,
  parseFixture,
  serializeFixture,
} from './internal/outcomeLog'
import type { CanonicalRoute, OutcomeFixture } from './internal/outcomeLog'
import { assertResultCoherent } from './internal/testing'

// ---------------------------------------------------------------------------
// OUTCOME-LOG GOLDEN e2e — the layer that answers "does the router reach the
// RIGHT answer", hermetically, and survives the engine being rewritten
// underneath it.
//
// Each fixture under `internal/__fixtures__/outcomes/` is one search's OUTCOME
// LOG: every `apply*` input in order, plus the few facts written outside
// `apply*` (the pinned block, the frontier, the index) and the canonical result
// the fold must produce. Replaying is `foldFixture` — the real `apply*`, the
// real `composeRoutes`, the real `buildReport`, the real `classifyQuote`/
// `classifySwap` — and the assertion is the FULL canonical result and report,
// exactly: best routeId and amountOut, every alternative, a swap's compiled
// calldata and limits, and every axis of the report.
//
// WHY THIS FORMAT REPLACED RECORDED RPC CONVERSATIONS. The predecessor keyed on
// what the search ASKED, so the event-driven cutover — which changed the
// question shapes and none of the answers — invalidated seven sessions in one
// commit, with no regeneration path that would have asserted anything. An
// outcome log is keyed on what the search CONCLUDED. A refactor that changes
// how prices are fetched moves nothing here; a regression in ranking, pruning,
// composition, classification, or report assembly moves everything.
//
// DETERMINISM: a fold is pure. It issues no RPC (the fold's client throws by
// construction), reads no clock, and its only inputs are the fixture and this
// build's own code — so a failure here is always a code change, never a flake.
// ---------------------------------------------------------------------------

const FIXTURES_DIR = join(fileURLToPath(new URL('.', import.meta.url)), 'internal', '__fixtures__', 'outcomes')

const files = readdirSync(FIXTURES_DIR)
  .filter((f) => f.endsWith('.json'))
  .sort()

function raw(file: string): string {
  return readFileSync(join(FIXTURES_DIR, file), 'utf8')
}

function load(file: string): OutcomeFixture {
  return parseFixture(raw(file))
}

const fixtures = files.map((file) => ({ file, fixture: load(file) }))

// ---------------------------------------------------------------------------
// The fold
// ---------------------------------------------------------------------------

describe('outcome-log goldens', () => {
  test('the corpus exists', () => {
    expect(files.length).toBeGreaterThan(0)
  })

  for (const { file, fixture } of fixtures) {
    test(`${fixture.label}: folding the outcome log reproduces the golden exactly`, () => {
      expect(fixture.schemaVersion).toBe(OUTCOME_LOG_SCHEMA_VERSION)

      const folded = foldFixture(fixture)

      // Held to the same invariants every other suite's results are — a classification bug fails
      // here even when the golden itself would still have matched.
      assertResultCoherent(folded.result)

      const canonical = canonicalizeResult(folded.result)
      const { golden } = fixture

      // The targeted assertions first, so a regression names the axis it broke before the full
      // deep-equal restates it wholesale.
      expect(canonical.status).toBe(golden.status)
      expect(canonical.reason?.code).toBe(golden.reason?.code)
      expect(canonical.best?.routeId).toBe(golden.best?.routeId)
      // A hermetic fold at a pinned block: the number is exact or it is wrong.
      expect(canonical.best?.amountOut).toBe(golden.best?.amountOut)
      expect(canonical.best?.gasEstimate).toBe(golden.best?.gasEstimate)
      expect(canonical.best?.execution).toBe(golden.best?.execution)
      expect(canonical.alternatives.map((a) => ({ routeId: a.routeId, amountOut: a.amountOut }))).toEqual(
        golden.alternatives.map((a) => ({ routeId: a.routeId, amountOut: a.amountOut })),
      )
      // Calldata is the one field where "close" is meaningless — a single wrong byte is a different
      // transaction — so it is compared before the deep-equal buries it in a report diff.
      expect(canonical.tx).toEqual(golden.tx)
      expect(canonical.report).toEqual(golden.report)

      // ...and everything else, exactly.
      expect(canonical).toEqual(golden)
    })

    test(`${fixture.label}: the fold is stable and the encoding is lossless`, () => {
      // Two folds of one fixture must agree (the fold is pure), AND a fold of the fixture ROUND-TRIPPED
      // through its own serializer must agree with both — the encoding is what CI actually reads, so a
      // bigint that came back a string has to fail here rather than as a mystery amount later.
      const first = canonicalizeResult(foldFixture(fixture).result)
      const second = canonicalizeResult(foldFixture(fixture).result)
      const roundTripped = canonicalizeResult(foldFixture(parseFixture(serializeFixture(fixture))).result)
      expect(second).toEqual(first)
      expect(roundTripped).toEqual(first)
      expect(parseFixture(serializeFixture(fixture)).context.block.number).toBe(fixture.context.block.number)
      expect(typeof parseFixture(serializeFixture(fixture)).request.amountIn).toBe('bigint')
      expect(file.endsWith('.json')).toBe(true)
    })
  }

  test('a fixture from a schema this build cannot read is REFUSED, not folded', () => {
    // The version is the one thing a fixture asserts about itself, and folding past it would mean
    // reading a `context` whose missing field silently changes the answer. There is no migration path.
    const stale = { ...fixtures[0]!.fixture, schemaVersion: OUTCOME_LOG_SCHEMA_VERSION + 1 }
    expect(() => foldFixture(stale)).toThrow(/schemaVersion/)
  })
})

// ---------------------------------------------------------------------------
// THE GOLDEN SCHEMA, PINNED IN THE TEST AND NOT IN THE GOLDENS.
//
// The deep-equal above is a fixed point, and a fixed point cannot notice a
// field that stopped existing: if the engine silently stopped reporting a
// canonical field, ONE `scripts/recordOutcomes.ts --regold` rewrites every
// golden without it — from the same recorded outcomes, so nothing re-records,
// nothing errors, and the diff is a plausible-looking removal — and every run
// afterwards is green against a corpus that has stopped asserting the thing.
//
// `gasEstimate` is the field that made this concrete: it is a return slot of
// the very quoter calls these searches make and was discarded on decode for
// most of this package's life. A decode that started reading the wrong slot
// again, or a two-segment sum quietly dropped, would produce goldens that are
// perfectly self-consistent.
//
// So the SHAPE is asserted here, against rules derived from the production
// contract rather than from the files:
//
//   * the key set is closed — a field that vanished fails, and so does one that
//     appeared without anybody deciding to add it;
//   * `gasEstimate` is present EXACTLY when the route has no v2 leg. That is
//     the all-or-nothing gas rule restated (`search/pump.ts#composeRoutes`): a
//     v2 segment is local constant-product arithmetic over `getReserves()` and
//     measures no gas, so one v2 leg makes the whole route's sum undefined;
//   * `execution` is present EXACTLY on a swap fixture's routes. Quoting
//     verifies nothing, and `router.ts#toQuoted` strips the field — so a quote
//     golden carrying one would mean the facade started leaking verification
//     state onto a surface whose type says no such key exists.
// ---------------------------------------------------------------------------

const REQUIRED_ROUTE_KEYS = ['amountIn', 'amountOut', 'intermediateAmounts', 'path', 'protocols', 'routeId']
const OPTIONAL_ROUTE_KEYS = ['gasEstimate', 'promotedOverComplex', 'quoteUnverifiable', 'execution', 'revertData']

/** The fixture's own top-level shape. A `--regold` cannot touch it, but a recorder change can — and a
 * `context` field that quietly stopped being written would make every fold read a default instead. */
const REQUIRED_FIXTURE_KEYS = ['schemaVersion', 'label', 'chainId', 'kind', 'recordedAt', 'request', 'context', 'log', 'golden']
const OPTIONAL_FIXTURE_KEYS = ['notes', 'manifest']
const REQUIRED_CONTEXT_KEYS = [
  'block',
  'headRegressed',
  'intermediates',
  'pairCeilingHit',
  'firstRoundComplete',
  'hookData',
  'index',
]

/**
 * The GOLDEN's own two levels, closing the gap the route-level pin above left open (C4-T14).
 *
 * `CanonicalRoute` was pinned; `CanonicalResult` and `CanonicalReport` were not, so a field that
 * stopped being emitted at either of those levels — an axis dropped from the report, `limits` no
 * longer written onto a swap — would survive a `--regold` in silence: every fixture would agree with
 * a fold that had quietly stopped reporting it, and the deep-equal would pass. Only the enumerated
 * key sets catch a vanishing field, because there is nothing left to compare it against.
 *
 * Split required/optional the same way as the route keys, and for the same reason: `reason` belongs
 * only to a failed search, `tx`/`limits` only to a compiled swap, `requirements` only to
 * `needs-action`. The `iff` tests below assert WHICH statuses may carry each — this pair only says
 * the vocabulary is closed.
 */
const REQUIRED_RESULT_KEYS = ['status', 'alternatives', 'report']
const OPTIONAL_RESULT_KEYS = ['reason', 'best', 'tx', 'limits', 'requirements']
const REQUIRED_REPORT_KEYS = [
  'block',
  'discovery',
  'enumeration',
  'quoting',
  'aborted',
  'verificationDegraded',
  'headRegressed',
  'firstRoundComplete',
  'verification',
]
const REQUIRED_ENUMERATION_KEYS = [
  'exhaustiveWithinMaxHops',
  'intermediatesDiscovered',
  'intermediatesSelected',
  'intermediatesPruned',
  'legsMeasured',
  'pairCeilingHit',
]
const REQUIRED_QUOTING_KEYS = ['attempted', 'succeeded', 'failed', 'transportFailed', 'unattempted']

describe('the golden canonical shape (independent of the deep-equal)', () => {
  const allRoutes: { label: string; route: CanonicalRoute }[] = []

  for (const { fixture } of fixtures) {
    const routes = [...(fixture.golden.best ? [fixture.golden.best] : []), ...fixture.golden.alternatives]
    for (const route of routes) allRoutes.push({ label: fixture.label, route })

    test(`${fixture.label}: the fixture carries the whole recorded shape`, () => {
      const keys = Object.keys(fixture).sort()
      expect(
        keys.filter((k) => !REQUIRED_FIXTURE_KEYS.includes(k) && !OPTIONAL_FIXTURE_KEYS.includes(k)),
        `${fixture.label}: fixture carries a key the format does not declare`,
      ).toEqual([])
      expect(
        REQUIRED_FIXTURE_KEYS.filter((k) => !keys.includes(k)),
        `${fixture.label}: fixture is MISSING a declared field`,
      ).toEqual([])
      expect(Object.keys(fixture.context).sort()).toEqual([...REQUIRED_CONTEXT_KEYS].sort())

      // The golden's own two levels — the vanishing-field guard, one rung up from the routes.
      const resultKeys = Object.keys(fixture.golden).sort()
      expect(
        resultKeys.filter((k) => !REQUIRED_RESULT_KEYS.includes(k) && !OPTIONAL_RESULT_KEYS.includes(k)),
        `${fixture.label}: golden carries a key CanonicalResult does not declare`,
      ).toEqual([])
      expect(
        REQUIRED_RESULT_KEYS.filter((k) => !resultKeys.includes(k)),
        `${fixture.label}: golden is MISSING a CanonicalResult field — one --regold can do this silently`,
      ).toEqual([])
      expect(Object.keys(fixture.golden.report).sort()).toEqual([...REQUIRED_REPORT_KEYS].sort())
      expect(Object.keys(fixture.golden.report.enumeration).sort()).toEqual([...REQUIRED_ENUMERATION_KEYS].sort())
      expect(Object.keys(fixture.golden.report.quoting).sort()).toEqual([...REQUIRED_QUOTING_KEYS].sort())
      expect(fixture.log.length).toBeGreaterThan(0)
      // Every entry is one of the five `apply*` vocabularies — a sixth would mean `state.ts` grew a
      // writer this format does not replay, which a fold would silently ignore.
      for (const entry of fixture.log) {
        expect(['measurement', 'coverage', 'readiness', 'preflight', 'abort']).toContain(entry.t)
      }
    })

    test(`${fixture.label}: every golden route carries the whole canonical shape, gas exactly where it is measurable, and execution exactly on a swap`, () => {
      if (fixture.golden.status === 'quote' || fixture.golden.status === 'ready') expect(routes.length).toBeGreaterThan(0)
      for (const route of routes) {
        const keys = Object.keys(route).sort()
        expect(
          keys.filter((k) => !REQUIRED_ROUTE_KEYS.includes(k) && !OPTIONAL_ROUTE_KEYS.includes(k)),
          `${fixture.label} ${route.routeId}: golden route carries a key the canonical shape does not declare`,
        ).toEqual([])
        expect(
          REQUIRED_ROUTE_KEYS.filter((k) => !keys.includes(k)),
          `${fixture.label} ${route.routeId}: golden route is MISSING a canonical field — one --regold can do this silently`,
        ).toEqual([])

        // The gas iff. `protocols` is this route's own leg list, so the rule is checked against the
        // route rather than against a remembered expectation per fixture.
        const measurable = !route.protocols.includes('v2')
        expect(
          route.gasEstimate !== undefined,
          `${fixture.label} ${route.routeId} (${route.protocols.join('+')}): gasEstimate should be ${measurable ? 'present' : 'absent'}`,
        ).toBe(measurable)
        if (measurable) expect(route.gasEstimate).toMatch(/^\d+$/)

        // The execution iff.
        expect(
          route.execution !== undefined,
          `${fixture.label} ${route.routeId}: execution should be ${fixture.kind === 'swap' ? 'present' : 'absent'} on a ${fixture.kind} golden`,
        ).toBe(fixture.kind === 'swap')

        expect(route.amountIn).toMatch(/^\d+$/)
        expect(route.amountOut).toMatch(/^\d+$/)
        expect(route.path.length).toBe(route.protocols.length + 1)
      }
    })
  }

  // The rules above are only worth anything if the corpus exercises both sides of the iff. Without
  // this, a corpus that drifted to v2-only routes would satisfy "gas absent" everywhere and the
  // vanishing-field guard would be back to asserting nothing.
  test('the corpus exercises both sides of the gas rule', () => {
    expect(allRoutes.some(({ route }) => route.gasEstimate !== undefined)).toBe(true)
    expect(allRoutes.some(({ route }) => route.protocols.includes('v2'))).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// THE CORPUS ITSELF IS AN ASSERTION.
//
// A golden suite is only as good as what it holds, and the four cases below are
// the ones whose absence would be invisible: each is a different terminal
// verdict, and three of them are verdicts NO amount of quote-shaped fixtures can
// reach. Derived from the goldens rather than from a self-declared tag on each
// fixture — a label can lie about what its search found; a status cannot.
// ---------------------------------------------------------------------------

describe('the corpus covers every verdict the goldens exist to pin', () => {
  const goldens = fixtures.map(({ fixture }) => ({ kind: fixture.kind, golden: fixture.golden }))

  test('a READY swap — a leader compiled, simulated, and handed back with its calldata', () => {
    const ready = goldens.filter((g) => g.kind === 'swap' && g.golden.status === 'ready')
    expect(ready.length).toBeGreaterThan(0)
    for (const g of ready) {
      expect(g.golden.best?.execution).toBe('verified')
      expect(g.golden.tx?.data).toMatch(/^0x[0-9a-f]+$/)
      expect(g.golden.limits?.minAmountOut).toMatch(/^\d+$/)
    }
  })

  test('a NEEDS-ACTION swap — calldata handed back behind a stated requirement, not withheld (C4-T14)', () => {
    const needsAction = goldens.filter((g) => g.kind === 'swap' && g.golden.status === 'needs-action')
    expect(needsAction.length).toBeGreaterThan(0)
    for (const g of needsAction) {
      // The whole point of the verdict: the caller gets the transaction AND what stands between them
      // and sending it. A corpus without this case cannot tell `needs-action` apart from `no-route`.
      expect(g.golden.tx?.data).toMatch(/^0x[0-9a-f]+$/)
      expect(g.golden.limits?.minAmountOut).toMatch(/^\d+$/)
      expect(g.golden.requirements?.length).toBeGreaterThan(0)
      for (const requirement of g.golden.requirements ?? []) expect(requirement.kind).toBeTruthy()
    }
  })

  test('a PROMOTED-OVER-COMPLEX quote — a `best` deliberately outpriced by its own alternatives (C4-T14)', () => {
    const promoted = goldens.filter((g) => g.golden.best?.promotedOverComplex === true)
    expect(promoted.length).toBeGreaterThan(0)
    for (const g of promoted) {
      const best = g.golden.best!
      // The marker is the LICENCE for this shape — `assertResultCoherent` rejects a `best` below an
      // alternative without it — so the fixture has to actually be in that shape, or the marker is
      // pinned on a result that never needed it.
      expect(g.golden.alternatives.some((a) => BigInt(a.amountOut) > BigInt(best.amountOut))).toBe(true)
      // ...and the route that lost is the complex one: hooked v4, or a protocol boundary.
      const complex = g.golden.alternatives.find((a) => BigInt(a.amountOut) > BigInt(best.amountOut))!
      expect(new Set(complex.protocols).size > 1 || complex.protocols.includes('v4')).toBe(true)
      expect(new Set(best.protocols).size).toBe(1)
    }
  })

  test('an UNVERIFIABLE-QUOTE partition — a returns-delta-hooked route outpricing `best`, licensed by its own marker', () => {
    // The other legal best-outpriced-by-alternatives shape: the echo route claims MORE than the
    // honest route delivers (the live Arbitrum defect this corpus pins), and quote-mode ranking
    // demotes it structurally — `best` wears NO promotion marker, because no promotion happened;
    // the licence is `quoteUnverifiable` on the outpricing alternative itself.
    const partitioned = goldens.filter(
      (g) =>
        g.kind === 'quote' &&
        g.golden.best !== undefined &&
        g.golden.best.promotedOverComplex !== true &&
        g.golden.alternatives.some((a) => a.quoteUnverifiable === true && BigInt(a.amountOut) > BigInt(g.golden.best!.amountOut)),
    )
    expect(partitioned.length).toBeGreaterThan(0)
    for (const g of partitioned) {
      expect(g.golden.best!.quoteUnverifiable).toBeUndefined() // the leader is the VERIFIABLE route
      // Every unverifiable route is v4 — the marker is v4 hook address bits and nothing else.
      for (const alt of g.golden.alternatives.filter((a) => a.quoteUnverifiable === true)) {
        expect(alt.protocols).toContain('v4')
      }
    }
  })

  test('an m_X INVALIDATION — one out-leg pool measured twice in one search, at two different amounts (C4-T14)', () => {
    // The arm where a better in-leg arrives after an out-leg has already been priced: `m_X` improves,
    // every out-leg measured at the old amount is outdated, and the search re-measures rather than
    // composing a route through an amount that is no longer on offer. It has a unit test; this pins it
    // through a GOLDEN, where the recorded log is the engine's own account of having done it.
    const withRemeasure = fixtures.filter(({ fixture }) => {
      const seen = new Map<string, Set<string>>()
      for (const entry of fixture.log) {
        if (entry.t !== 'measurement' || entry.o.kind !== 'success') continue
        const { pool, currencyIn, amountIn } = entry.o.m
        const key = `${pool.id ?? JSON.stringify(pool)}|${String(currencyIn)}`
        seen.set(key, (seen.get(key) ?? new Set()).add(String(amountIn)))
      }
      return [...seen.values()].some((amounts) => amounts.size > 1)
    })
    expect(withRemeasure.length).toBeGreaterThan(0)
    for (const { fixture } of withRemeasure) {
      // The re-measurement is not wasted work: the composed answer chains through the LATER amount.
      expect(fixture.golden.best?.intermediateAmounts).toHaveLength(1)
    }
  })

  test('a TWO-HOP quote — composition through an intermediate, with its realized mid-leg amount', () => {
    const twoHop = goldens.filter((g) => g.golden.status === 'quote' && (g.golden.best?.protocols.length ?? 0) === 2)
    expect(twoHop.length).toBeGreaterThan(0)
    for (const g of twoHop) {
      expect(g.golden.best?.path).toHaveLength(3)
      expect(g.golden.best?.intermediateAmounts).toHaveLength(1)
    }
  })

  test('a NO-ROUTE completed search — the authoritative negative, which only a complete search may claim', () => {
    const noRoute = goldens.filter((g) => g.golden.status === 'no-route')
    expect(noRoute.length).toBeGreaterThan(0)
    for (const g of noRoute) {
      const { report } = g.golden
      expect(report.aborted).toBe(false)
      expect(report.quoting.transportFailed).toBe(0)
      expect(report.quoting.unattempted).toBe(0)
      expect(report.verificationDegraded).toBe(false)
      expect(report.headRegressed).toBe(false)
      expect(Object.values(report.discovery).every((d) => d.status === 'complete' || d.status === 'disabled')).toBe(true)
    }
  })

  test('an RPC-DEGRADED search — the same shape as the no-route, separated from it only by lost calls', () => {
    const degraded = goldens.filter((g) => g.golden.status === 'inconclusive' && g.golden.reason?.code === 'rpc-degraded')
    expect(degraded.length).toBeGreaterThan(0)
    for (const g of degraded) {
      const { report } = g.golden
      // The axis that made it degraded, present and named — otherwise this fixture would be a
      // no-route that happened to be spelled differently.
      expect(report.quoting.transportFailed > 0 || report.verificationDegraded || report.headRegressed).toBe(true)
    }
  })
})

// ---------------------------------------------------------------------------
// REDACTION — asserted over the committed BYTES, not over the intent.
//
// An outcome log has no field that could carry a provider's identity: entries
// hold pool refs, currency refs, amounts, block numbers, route ids, raw revert
// DATA, and a compile-failure reason this package itself wrote. That is a
// structural guarantee (see `internal/outcomeLog.ts`'s header) and it is exactly
// the kind of guarantee that quietly stops holding when somebody widens an
// entry. Live fixtures are recorded through `chainz exec` against keyed
// endpoints, so the cost of being wrong is a credential in git history.
// ---------------------------------------------------------------------------

describe('no fixture carries transport identity', () => {
  const FORBIDDEN: { name: string; pattern: RegExp }[] = [
    { name: 'a URL', pattern: /https?:\/\//i },
    { name: 'a keyed query parameter', pattern: /[?&](api[-_]?key|key|token|auth|secret|access[-_]?token)=/i },
    { name: 'an Authorization header value', pattern: /bearer\s+\S/i },
    { name: 'a basic-auth credential pair', pattern: /\/\/[^/\s"]+:[^/\s"]+@/ },
    // The recorder's own redaction placeholder. Its PRESENCE would mean a fixture went through a
    // string-scrubbing path — which would mean an entry is carrying provider text this format says
    // it cannot hold, redacted or not.
    { name: 'a redaction placeholder (so something WAS a URL)', pattern: /<redacted/i },
  ]

  for (const { file } of fixtures) {
    test(`${file} contains no endpoint, key, or credential`, () => {
      const text = raw(file)
      for (const { name, pattern } of FORBIDDEN) {
        expect(pattern.test(text), `${file} contains ${name}`).toBe(false)
      }
    })
  }
})
