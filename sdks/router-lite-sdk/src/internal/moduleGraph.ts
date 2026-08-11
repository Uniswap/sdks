import { existsSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'

import ts from 'typescript'

// ---------------------------------------------------------------------------
// The import-closure walk, shared by the two suites that certify what this
// package SHIPS.
//
// `build.surface.test.ts` asks "is every file the published builds compile
// reachable from an exported entry point"; `browser.certification.test.ts` asks
// "does anything reachable from those entry points touch Node". Both questions
// are the same walk over the same graph from the same two entry points, and
// both used to carry their own copy of it — `browser.certification.test.ts`'s
// header already claimed it "shares" the other's, which was aspirational.
// Nothing forced the copies to agree: a resolution rule fixed in one (the
// `index.ts` fallback, the `.json` candidate) simply would not exist in the
// other, and the direction that fails is silent — a closure that resolves LESS
// reaches fewer files and both tests pass by looking at nothing.
//
// TEST-ONLY, AND EXCLUDED FROM EVERY BUILD FOR IT (`tsconfig.{esm,cjs,types}
// .json#exclude`, the same treatment `internal/outcomeLog.ts` gets). It imports
// `typescript` and `node:fs`, neither of which this package ships; shipping it
// would put both in the published graph and fail the very certifications it
// exists to serve. `build.surface.test.ts` asserts the exclusion holds.
//
// It is deliberately NOT in `internal/testing.ts`: that module is imported by
// most of the unit suite, and pulling the TypeScript compiler into all of it to
// serve two files would be paid on every run.
// ---------------------------------------------------------------------------

/** The package root — the directory holding `package.json`, `src/` and the build tsconfigs. */
export const PKG_ROOT = resolve(dirname(new URL(import.meta.url).pathname), '..', '..')

/**
 * The two subpaths `package.json#exports` publishes — the whole shipped surface, and the only
 * definition of "reachable" that cannot drift from what consumers can actually import.
 */
export const ENTRY_POINTS = ['src/index.ts', 'src/experimental/index.ts']

/**
 * The file a relative specifier names, or `undefined` for a bare package specifier (`viem`) — those
 * are dependencies, not files this package ships.
 */
function resolveSpecifier(fromFile: string, specifier: string): string | undefined {
  if (!specifier.startsWith('.')) return undefined
  const base = resolve(dirname(join(PKG_ROOT, fromFile)), specifier)
  for (const candidate of [`${base}.ts`, join(base, 'index.ts'), `${base}.json`, base]) {
    if (existsSync(candidate) && statSync(candidate).isFile()) return relative(PKG_ROOT, candidate)
  }
  return undefined
}

/** Every import specifier `file` names, as the TypeScript compiler's own scanner sees them. */
export function importedSpecifiers(file: string): string[] {
  // `ts.preProcessFile` is the compiler's own scanner: it sees `import`, `export … from`,
  // `import type`, dynamic `import()` and `require()`, including the forms a regex over the text
  // routinely misses (multi-line specifiers, `export * as ns from`).
  return ts.preProcessFile(readFileSync(join(PKG_ROOT, file), 'utf8'), true, true).importedFiles.map((i) => i.fileName)
}

/** Every file reachable from `entries` by import/export/`require`/dynamic `import()`, entries included. */
export function importClosure(entries: string[] = ENTRY_POINTS): Set<string> {
  const seen = new Set<string>()
  const queue = [...entries]
  while (queue.length > 0) {
    const file = queue.pop()!
    if (seen.has(file)) continue
    seen.add(file)
    for (const specifier of importedSpecifiers(file)) {
      const target = resolveSpecifier(file, specifier)
      if (target !== undefined && !seen.has(target)) queue.push(target)
    }
  }
  return seen
}
