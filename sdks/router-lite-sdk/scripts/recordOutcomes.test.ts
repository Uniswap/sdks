import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'bun:test'

import { recordOutcomeFixture, serializeFixture } from '../src/internal/outcomeLog'

import { HERMETIC_SCENARIOS } from './hermeticWorlds'

// ---------------------------------------------------------------------------
// THE RECORDER, IN CI.
//
// `src/outcome.golden.test.ts` replays the committed fixtures and pins what the
// fold produces. Nothing ran the other half — the RECORDING — anywhere but on a
// developer's machine, at the moment they typed
// `bun scripts/recordOutcomes.ts --hermetic`. That is a real gap, because
// `recordOutcomeFixture` carries the corpus' load-bearing proof inside itself:
// it runs a live search, serializes the outcome log, folds the serialized form
// back, and REFUSES to emit a fixture whose fold disagrees with the search that
// produced it (see its own body). Replaying a committed fixture cannot restate
// that — a fold and a golden rebuilt from the same log are self-consistent
// whatever they both lost.
//
// So this file re-records every hermetic world from scratch, on every unit run,
// and asserts the result is byte-identical to what is committed. Three
// different regressions fail here and only here:
//
//   * the fold stops reproducing the live search (the recorder throws);
//   * a world drifts into producing a different verdict from the one its
//     scenario claims (the recorder's own scenario check, restated below so the
//     failure names the scenario);
//   * the ENGINE's behaviour changes without the corpus being re-recorded — the
//     committed fixtures would still fold to their own goldens, and only a fresh
//     recording can tell you they describe a search this build no longer runs.
//
// Hermetic by construction: every world is a scripted `Map` of pool fates and a
// client built over it, so nothing here touches a network or a clock
// (`recordedAtFromPinnedBlock` stamps the fixture from the world's constant
// head, which is exactly what makes byte-identity a legal assertion).
// ---------------------------------------------------------------------------

const FIXTURES_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'internal', '__fixtures__', 'outcomes')

/** The committed file, as `writeFixture` writes it: the serialized fixture re-pretty-printed at two
 * spaces with a trailing newline. Spelled here rather than imported because `recordOutcomes.ts` is a
 * top-level-await SCRIPT — importing it would run the recorder. */
function committed(label: string): string {
  return readFileSync(join(FIXTURES_DIR, `${label}.json`), 'utf8')
}

function asWritten(fixture: Parameters<typeof serializeFixture>[0]): string {
  return `${JSON.stringify(JSON.parse(serializeFixture(fixture)) as unknown, null, 2)}\n`
}

describe('the hermetic corpus re-records itself', () => {
  for (const scenario of HERMETIC_SCENARIOS) {
    it(`${scenario.label} — records, folds to itself, and matches what is committed`, async () => {
      const built = scenario.build()
      // Every argument here mirrors `recordOutcomes.ts#recordHermetic` exactly; a divergence would
      // make this test pass against a fixture the real recorder could never write.
      const fixture = await recordOutcomeFixture({
        label: scenario.label,
        chainId: built.ctx.manifest.chainId,
        kind: scenario.kind,
        ctx: built.ctx,
        request: built.request,
        stopAt: 'final',
        notes: scenario.notes,
        inlineManifest: true,
        recordedAtFromPinnedBlock: true,
      })

      // The scenario's own claim about what its world is FOR — the recorder script checks this too,
      // and it is restated here so a drifted world fails with its label rather than as a diff.
      expect(fixture.golden.status).toBe(scenario.expect.status)
      if (scenario.expect.reason !== undefined) expect(fixture.golden.reason?.code).toBe(scenario.expect.reason)

      // Byte-identity with the committed corpus. `recordOutcomeFixture` has already proved the fold
      // fixed point by the time this line runs (it throws otherwise); this is the second claim: the
      // fixture on disk is one THIS build's engine still produces.
      expect(asWritten(fixture)).toBe(committed(scenario.label))
    })
  }
})
