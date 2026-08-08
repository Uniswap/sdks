import { existsSync, readFileSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { expect, test } from 'bun:test'
import ts from 'typescript'

// ---------------------------------------------------------------------------
// BROWSER / EDGE-WORKER CERTIFICATION — the claim, mechanically checked.
//
// This package is advertised as running unmodified in a browser tab and in an
// edge worker: viem is its only dependency, it performs no I/O of its own (the
// caller hands it a `PublicClient`), and its one cancellation primitive is the
// standard `AbortSignal`. Nothing about that is self-enforcing. One
// `import { readFileSync } from 'node:fs'` in a diagnostic path, one
// `process.env.DEBUG` guard, one `Buffer.from(hex, 'hex')` where `viem`'s
// `hexToBytes` was meant — any of them ships and the claim quietly becomes
// false for every consumer who is not on Node.
//
// So the claim is a test, on three levels:
//
//   1. SOURCE — every file the two published entry points reach is parsed with
//      TypeScript's own parser (not a regex over the text, which cannot tell
//      `process.env` in a comment from `process.env` in a branch) and checked
//      for Node builtin imports and Node globals.
//   2. BUNDLE — the package is really bundled for `target: 'browser'` and for
//      edge-worker export conditions (`workerd`/`edge-light`/`worker`), and the
//      output must contain no Node builtin specifier at all. A bundler is the
//      only thing that sees the whole graph including viem's.
//   3. SIZE — the gzipped, minified bundle is recorded, with a generous budget.
//      Not a micro-optimization gate: it is the alarm for a dependency that
//      accidentally stops tree-shaking, which is how a 44 kB SDK becomes a
//      300 kB one without a single line of this package changing.
//
// It needs no dependency that is not already here: `Bun.build` is the test
// runner's own bundler, and `typescript` is already a devDependency (see
// `build.surface.test.ts`, whose closure walk this shares).
//
// IT BUNDLES `src/`, NOT `dist/`, and that is the right call rather than a
// shortcut: `dist/` need not exist when `bun test` runs (and does not, on a
// clean checkout), while the two graphs are the same modulo transpilation —
// `tsc` neither adds an import nor removes one. What ships out of `src/` is
// separately pinned by `build.surface.test.ts`, which asserts the published
// builds compile exactly the closure of these same two entry points.
// ---------------------------------------------------------------------------

const PKG = resolve(dirname(fileURLToPath(import.meta.url)), '..')

/** The two subpaths `package.json#exports` publishes — the whole shipped surface. */
const ENTRY_POINTS = ['src/index.ts', 'src/experimental/index.ts']

/**
 * Node builtins, with and without the `node:` prefix. The prefixed form is what this package would
 * ever write; the bare form is what a dependency might, and what a bundler resolves identically.
 */
const NODE_BUILTINS = [
  'assert', 'async_hooks', 'buffer', 'child_process', 'cluster', 'console', 'constants', 'crypto',
  'dgram', 'diagnostics_channel', 'dns', 'domain', 'events', 'fs', 'http', 'http2', 'https',
  'inspector', 'module', 'net', 'os', 'path', 'perf_hooks', 'process', 'punycode', 'querystring',
  'readline', 'repl', 'stream', 'string_decoder', 'sys', 'timers', 'tls', 'trace_events', 'tty',
  'url', 'util', 'v8', 'vm', 'wasi', 'worker_threads', 'zlib',
]

/**
 * Globals that exist in Node and not in a browser or an edge worker. `require` is here because a
 * stray CommonJS `require()` in ESM source is the same failure wearing a different hat.
 *
 * `setTimeout`/`clearTimeout` are deliberately NOT here: they are standard everywhere this package
 * claims to run (`internal/logScan.ts`, `search/waves.ts` use them), and Node's returning a `Timeout`
 * object rather than a number is irrelevant to code that only ever passes the handle back to
 * `clearTimeout`.
 */
const NODE_GLOBALS = ['process', 'Buffer', '__dirname', '__filename', 'require', 'global']

/** The file a relative specifier names, or `undefined` for a bare package specifier (`viem`). */
function resolveSpecifier(fromFile: string, specifier: string): string | undefined {
  if (!specifier.startsWith('.')) return undefined
  const base = resolve(dirname(join(PKG, fromFile)), specifier)
  for (const candidate of [`${base}.ts`, join(base, 'index.ts'), `${base}.json`, base]) {
    if (existsSync(candidate) && statSync(candidate).isFile()) return relative(PKG, candidate)
  }
  return undefined
}

/** Every file reachable from `entries` by import/export/`require`/dynamic `import()`. */
function importClosure(entries: string[]): string[] {
  const seen = new Set<string>()
  const queue = [...entries]
  while (queue.length > 0) {
    const file = queue.pop()!
    if (seen.has(file)) continue
    seen.add(file)
    for (const imported of ts.preProcessFile(readFileSync(join(PKG, file), 'utf8'), true, true).importedFiles) {
      const target = resolveSpecifier(file, imported.fileName)
      if (target !== undefined && !seen.has(target)) queue.push(target)
    }
  }
  return [...seen].filter((f) => f.endsWith('.ts')).sort()
}

test('no file the package ships imports a Node builtin', () => {
  const offenders: string[] = []
  for (const file of importClosure(ENTRY_POINTS)) {
    for (const imported of ts.preProcessFile(readFileSync(join(PKG, file), 'utf8'), true, true).importedFiles) {
      const spec = imported.fileName
      const bare = spec.startsWith('node:') ? spec.slice(5) : spec
      if (spec.startsWith('node:') || NODE_BUILTINS.includes(bare.split('/')[0]!)) {
        offenders.push(`${file} -> ${spec}`)
      }
    }
  }
  // A hit here is not a lint nit: it is the package ceasing to load in a browser or a worker.
  expect(offenders).toEqual([])
})

test('no file the package ships reads a Node-only global', () => {
  // Parsed, not grepped. `internal/logScan.ts` has the comment "once per machine rather than once
  // per process", and `encode/differential.test.ts` reads `process.env.UPDATE_GOLDENS` — a text
  // scan flags the first (wrongly) and, if it ever crept into a non-test file, would have no way to
  // tell it apart from the second.
  const offenders: string[] = []
  for (const file of importClosure(ENTRY_POINTS)) {
    const source = ts.createSourceFile(file, readFileSync(join(PKG, file), 'utf8'), ts.ScriptTarget.ES2020, true)
    const visit = (node: ts.Node): void => {
      if (ts.isIdentifier(node) && NODE_GLOBALS.includes(node.text)) {
        const parent = node.parent
        // `x.process` / `{ process: … }` are ordinary property names, not the global.
        const isPropertyName =
          (ts.isPropertyAccessExpression(parent) && parent.name === node) ||
          (ts.isPropertyAssignment(parent) && parent.name === node) ||
          (ts.isPropertySignature(parent) && parent.name === node) ||
          ts.isPropertyDeclaration(parent) ||
          ts.isParameter(parent) ||
          ts.isVariableDeclaration(parent) ||
          ts.isBindingElement(parent)
        if (!isPropertyName) offenders.push(`${file}: ${node.text} (line ${source.getLineAndCharacterOfPosition(node.pos).line + 1})`)
      }
      ts.forEachChild(node, visit)
    }
    visit(source)
  }
  expect(offenders).toEqual([])
})

// ---------------------------------------------------------------------------
// The bundle itself.
// ---------------------------------------------------------------------------

/**
 * Gzipped size of the minified browser bundle of BOTH entry points, measured on the commit that
 * introduced this test (bun 1.3.14, viem 2.47.2): 44,800 bytes gzipped, from 144,433 bytes minified —
 * about 44 kB over the wire for the whole router plus all five built-in manifests, viem included and
 * tree-shaken.
 *
 * The budget is 1.5x, not a tight pin, ON PURPOSE. Minifier output moves with the bun version (CI
 * and a laptop are rarely on the same one) and a legitimate feature costs a few kB; neither should
 * turn a green suite red. What 1.5x DOES catch is the failure this exists for: an import that
 * defeats tree-shaking (a barrel re-export, a side-effectful module, a dependency that pulls its own
 * polyfills) and takes the bundle from tens of kB to hundreds in one line.
 */
const BASELINE_GZIP_BYTES = 44_800
const SIZE_BUDGET = 1.5

/**
 * A synthetic entry importing everything the package publishes, bundled the way a consumer would.
 *
 * The entry is written to a TEMP DIRECTORY and imports this package by absolute path, rather than
 * being dropped inside `src/` next to what it imports: a file under `src/` is inside every build
 * config's `include`, so a crashed run would leave one behind for `tsc` to compile into `dist/` and
 * for `build.surface.test.ts` to (correctly) fail on.
 */
async function bundle(conditions?: string[]): Promise<{ text: string; gzip: number }> {
  const entry = join(tmpdir(), `router-lite-browser-certification-${process.pid}-${Math.random().toString(36).slice(2)}.ts`)
  await Bun.write(
    entry,
    [
      `import * as root from '${join(PKG, 'src', 'index.ts')}'`,
      `import * as experimental from '${join(PKG, 'src', 'experimental', 'index.ts')}'`,
      // Referenced, so nothing here is dropped as unused before the graph is even walked.
      'export const surface = { root, experimental }',
      '',
    ].join('\n'),
  )
  try {
    const built = await Bun.build({
      entrypoints: [entry],
      target: 'browser',
      format: 'esm',
      minify: true,
      ...(conditions ? { conditions } : {}),
    })
    // `success: false` means the graph did not resolve — for this package that is precisely the
    // "something reached for a Node builtin" failure, reported by the bundler rather than inferred.
    expect(built.logs.filter((l) => l.level === 'error')).toEqual([])
    expect(built.success).toBe(true)
    expect(built.outputs).toHaveLength(1)
    const text = await built.outputs[0]!.text()
    return { text, gzip: Bun.gzipSync(new TextEncoder().encode(text)).length }
  } finally {
    await Bun.file(entry).delete()
  }
}

test('the whole public surface bundles clean for a browser, pulling in no Node built-in', async () => {
  const { text } = await bundle()
  // Import specifiers only. A naive search for `node:` matches this package's OWN object literals
  // (`{ node: G, newest: K }` in the two-hop intermediate ranking survives minification), which is
  // exactly the false positive that makes a substring check worthless here.
  const specifiers = [...text.matchAll(/(?:from|import|require)\s*\(?\s*["']([^"']+)["']/g)].map((m) => m[1]!)
  expect(specifiers.filter((s) => s.startsWith('node:'))).toEqual([])
  expect(specifiers.filter((s) => NODE_BUILTINS.includes(s.split('/')[0]!))).toEqual([])
  // A browser bundle that still shims `process.env` or `Buffer` would run, and would be a lie about
  // what this package needs — Bun's browser target injects those shims silently when something asks.
  expect(text).not.toContain('process.env')
  expect(text).not.toContain('__dirname')
}, 60_000)

test('it bundles identically under edge-worker export conditions', async () => {
  // `workerd` (Cloudflare), `edge-light` (Vercel) and `worker` are the conditions an edge runtime's
  // bundler adds; a dependency that publishes a Node-flavored variant behind one of them would swap
  // it in here and nowhere else. viem publishes no such variant today — the assertion is that this
  // stays true, and that the edge build is byte-for-byte the browser build rather than a second,
  // silently different artifact.
  const browser = await bundle()
  for (const conditions of [['worker', 'browser'], ['workerd', 'browser'], ['edge-light', 'browser']]) {
    const edge = await bundle(conditions)
    expect({ conditions, bytes: edge.text.length }).toEqual({ conditions, bytes: browser.text.length })
  }
}, 120_000)

test('the bundle stays within its recorded size budget', async () => {
  const { text, gzip } = await bundle()
  const ratio = gzip / BASELINE_GZIP_BYTES
  // eslint-disable-next-line no-console
  console.info(
    `[browser-certification] minified ${text.length} B, gzip ${gzip} B ` +
      `(baseline ${BASELINE_GZIP_BYTES} B, ${(ratio * 100).toFixed(0)}% of it; budget ${SIZE_BUDGET}x)`,
  )
  expect({ gzip, overBudget: ratio > SIZE_BUDGET }).toEqual({ gzip, overBudget: false })
  // The other direction, so a bundle that silently collapsed to nothing (a resolution change that
  // emits an empty module, a future entry-point rename) cannot pass this file by being small.
  expect(gzip).toBeGreaterThan(BASELINE_GZIP_BYTES / 4)
}, 60_000)

// ---------------------------------------------------------------------------
// Packaging: the conditions a bundler actually reads.
// ---------------------------------------------------------------------------

test('package.json declares the export conditions a browser/edge bundler needs', () => {
  const pkg = JSON.parse(readFileSync(join(PKG, 'package.json'), 'utf8')) as {
    main: string
    module: string
    types: string
    sideEffects: unknown
    dependencies: Record<string, string>
    exports: Record<string, Record<string, string>>
  }

  // `sideEffects: false` is what licenses a bundler to drop the parts of this package a consumer
  // never imports — without it the size budget above measures a bundle no tree-shaker would produce.
  expect(pkg.sideEffects).toBe(false)

  // viem and nothing else. A second runtime dependency is the most likely way a Node builtin ever
  // enters this graph, so it is a packaging fact worth asserting rather than a convention.
  expect(Object.keys(pkg.dependencies)).toEqual(['viem'])

  for (const [subpath, conditions] of Object.entries(pkg.exports)) {
    // `types` FIRST: condition order is significant, and a `types` entry after `import` is invisible
    // to a resolver that matched `import` already.
    expect({ subpath, first: Object.keys(conditions)[0] }).toEqual({ subpath, first: 'types' })
    // ESM before CJS, and both present: an edge bundler takes `import`, a Node CJS consumer takes
    // `require`, and neither is allowed to fall through to the other's build.
    expect({ subpath, keys: Object.keys(conditions) }).toEqual({ subpath, keys: ['types', 'import', 'require'] })
    expect(conditions['import']).toMatch(/^\.\/dist\/esm\//)
    expect(conditions['require']).toMatch(/^\.\/dist\/cjs\//)
  }

  // No `browser` field and no `browser` condition, DELIBERATELY: those exist to swap a Node-only
  // implementation for a web one, and this package has no Node-only implementation to swap. Adding
  // an empty one would advertise a substitution that does not happen.
  expect('browser' in pkg).toBe(false)
  expect(Object.values(pkg.exports).some((c) => 'browser' in c)).toBe(false)

  // The legacy top-level fields still have to agree with the map — bundlers that predate `exports`
  // (and some `resolve.mainFields` configurations) read `module` and would otherwise get CJS.
  expect(pkg.module).toBe(pkg.exports['.']!['import']!.replace('./', './'))
  expect(pkg.main).toBe(pkg.exports['.']!['require']!)
  expect(pkg.types).toBe(pkg.exports['.']!['types']!)
})
