import { existsSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'

import { expect, test } from 'bun:test'
import ts from 'typescript'

import { ENTRY_POINTS, importClosure, PKG_ROOT } from './internal/moduleGraph'

// ---------------------------------------------------------------------------
// WHAT SHIPS IS EXACTLY WHAT THE ENTRY POINTS REACH.
//
// `package.json#files` is `["dist"]`, so every file the three build tsconfigs
// compile is published — and the build's file set is defined SUBTRACTIVELY
// (`include: src/**/*` minus a hand-written exclude list). A subtractive
// definition cannot notice a new file: `src/internal/replay.ts` — the recorded-
// replay harness, which exists only to serve `replay.golden.test.ts` and
// `scripts/recordSession.ts` — was compiled into `dist/esm`, `dist/cjs` and
// `dist/types` of every build since it was written, because the excludes named
// `src/**/testing.ts` and the test files and nothing else. It is dead weight in
// the tarball, it is an implicit public surface (anyone can deep-import a path
// that ships), and nothing anywhere would have said so.
//
// So the shipped set is checked POSITIVELY, against the only definition that
// cannot drift: the import closure of the two entry points `package.json`
// actually exports. A file in the build that nothing exported reaches is either
// dead or test-only, and both want the same answer — exclude it, or export it
// on purpose.
//
// The file list comes from TypeScript's own config parser, so this is the
// build's real answer (the same one `tsc --listFiles` prints) rather than a
// re-implementation of its glob semantics, and the closure comes from
// TypeScript's own preprocessor rather than a regex over the source — via
// `internal/moduleGraph.ts`, shared with `browser.certification.test.ts` so the
// two certifications can never walk subtly different graphs.
// ---------------------------------------------------------------------------

const PKG = PKG_ROOT

/** Every config that emits into `dist/`, i.e. every config whose output is published. */
const BUILD_CONFIGS = ['tsconfig.esm.json', 'tsconfig.cjs.json', 'tsconfig.types.json']

/** The files a build config would compile, as TypeScript itself resolves them. */
function buildFiles(configName: string): string[] {
  const configPath = join(PKG, configName)
  const read = ts.readConfigFile(configPath, ts.sys.readFile)
  expect(read.error).toBeUndefined()
  const parsed = ts.parseJsonConfigFileContent(read.config, ts.sys, dirname(configPath), undefined, configPath)
  expect(parsed.errors).toEqual([])
  return parsed.fileNames.map((f) => relative(PKG, f))
}

test('every file the published builds compile is reachable from an exported entry point', () => {
  const closure = importClosure(ENTRY_POINTS)
  for (const config of BUILD_CONFIGS) {
    const shipped = buildFiles(config)
    const unreachable = shipped.filter((f) => !closure.has(f)).sort()
    // A file listed here is compiled into `dist/` and published. Either it belongs on the surface —
    // export it from `src/index.ts` or `src/experimental/index.ts` — or it does not, and the config's
    // `exclude` is where that gets said.
    expect({ config, unreachable }).toEqual({ config, unreachable: [] })
  }
})

test('the closure is the real one: it reaches deep internals and stops at the test-only modules', () => {
  // A guard whose closure silently came back tiny (a resolution change, a moved entry point) would
  // pass the test above only by failing to reach anything, so the closure is pinned from both ends.
  const closure = importClosure(ENTRY_POINTS)
  expect(closure.size).toBeGreaterThan(20)
  for (const reached of ['src/index.ts', 'src/router.ts', 'src/internal/logScan.ts', 'src/internal/rpcErrors.ts']) {
    expect([...closure]).toContain(reached)
  }
  // The two modules that exist only for the suites and the recorder. Neither is imported by anything
  // the package exports, which is precisely why neither may be compiled into `dist/`.
  for (const testOnly of ['src/internal/testing.ts', 'src/internal/replay.ts', 'src/internal/moduleGraph.ts']) {
    expect(existsSync(join(PKG, testOnly))).toBe(true) // still there, so the check below means something
    expect([...closure]).not.toContain(testOnly)
  }
})

test('the entry points themselves ARE shipped, by every build', () => {
  // The other direction, and the reason this is a subset check rather than an equality one: the
  // subset is what keeps junk out, and this is what keeps the package from shipping nothing at all.
  for (const config of BUILD_CONFIGS) {
    const shipped = buildFiles(config)
    for (const entry of ENTRY_POINTS) expect(shipped).toContain(entry)
  }
})
