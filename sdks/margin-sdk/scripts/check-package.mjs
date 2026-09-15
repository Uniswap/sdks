// Built-artifact smoke test: packs the package exactly as npm would publish it, installs it into
// an isolated consumer directory with ONLY its declared runtime/peer dependencies resolvable, and
// loads it under native Node in both module systems. This is what catches the failure class CI's
// source-level tests cannot: undeclared runtime deps (tslib), extensionless ESM specifiers,
// missing module-type markers — bugs that only exist in the published artifact.
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const pkgRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const pkg = JSON.parse(fs.readFileSync(path.join(pkgRoot, 'package.json'), 'utf8'))

// bun's isolated linker keeps deps in the package's own node_modules; hoisted layouts use the
// workspace root. Check both.
function resolveDep(name) {
  for (const base of [path.join(pkgRoot, 'node_modules'), path.resolve(pkgRoot, '../../node_modules')]) {
    const candidate = path.join(base, name)
    if (fs.existsSync(candidate)) return fs.realpathSync(candidate)
  }
  throw new Error(`declared dependency ${name} is not installed in the workspace`)
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'margin-sdk-package-check-'))
try {
  // 1. Pack the real publish artifact.
  execFileSync('npm', ['pack', '--pack-destination', tmp], { cwd: pkgRoot, stdio: 'pipe' })
  const tarball = fs.readdirSync(tmp).find((f) => f.endsWith('.tgz'))
  if (!tarball) throw new Error('npm pack produced no tarball')
  execFileSync('tar', ['-xzf', tarball], { cwd: tmp })

  // 2. "Install": place the extracted package under node_modules, then link ONLY the deps the
  //    package.json declares. An undeclared runtime import fails here exactly as it would on a
  //    consumer's clean install.
  const installDir = path.join(tmp, 'node_modules', ...pkg.name.split('/'))
  fs.mkdirSync(path.dirname(installDir), { recursive: true })
  fs.renameSync(path.join(tmp, 'package'), installDir)
  for (const name of [...Object.keys(pkg.dependencies ?? {}), ...Object.keys(pkg.peerDependencies ?? {})]) {
    const link = path.join(tmp, 'node_modules', ...name.split('/'))
    fs.mkdirSync(path.dirname(link), { recursive: true })
    fs.symlinkSync(resolveDep(name), link, 'dir')
  }

  // 3. Load and exercise the package under native Node, both module systems. The functional check
  //    (a known mainnet accountOf vector) proves the module graph actually initialized.
  const functionalCheck = `
    const account = sdk.predictMarginAccountAddress({
      owner: '0x0000000000000000000000000000000000000001',
      subId: 0n,
      marginRouter: '0x0000000004BBC92D0657580CAe35aEBF054E5CDC',
      accountImplementation: '0x83Fc96d2B162dAF8532e5677C6Ec32A1Cb7882E4',
    })
    if (account !== '0x64487fb85302b5A2f38EF91144155986D331D2Fe') {
      throw new Error('predictMarginAccountAddress returned ' + account)
    }
    if (!Array.isArray(sdk.MARGIN_ROUTER_ABI) || typeof sdk.MarginPlanner !== 'function') {
      throw new Error('expected exports missing')
    }
  `
  fs.writeFileSync(
    path.join(tmp, 'check.cjs'),
    `const sdk = require('${pkg.name}')\n${functionalCheck}\nconsole.log('CJS OK')\n`
  )
  fs.writeFileSync(
    path.join(tmp, 'check.mjs'),
    `import * as sdk from '${pkg.name}'\n${functionalCheck}\nconsole.log('ESM OK')\n`
  )
  for (const consumer of ['check.cjs', 'check.mjs']) {
    execFileSync('node', [consumer], { cwd: tmp, stdio: 'inherit' })
  }

  // 4a. Browser target, static: the shipped ESM module graph must reference no Node builtins.
  //     This is the actual browser failure mode for an isomorphic library — a stray
  //     `node:crypto`/`fs` import that Node smoke tests would never catch.
  const { builtinModules } = await import('node:module')
  const builtins = new Set(builtinModules)
  const esmDir = path.join(installDir, 'dist', 'esm')
  const offenders = []
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) walk(full)
      else if (entry.name.endsWith('.js')) {
        const source = fs.readFileSync(full, 'utf8')
        for (const match of source.matchAll(/(?:from\s*|import\s*\(\s*|require\s*\(\s*)['"]([^'"]+)['"]/g)) {
          const spec = match[1]
          if (spec.startsWith('node:') || builtins.has(spec)) {
            offenders.push(`${path.relative(installDir, full)} imports ${spec}`)
          }
        }
      }
    }
  }
  walk(esmDir)
  if (offenders.length > 0) {
    throw new Error(`shipped ESM references Node builtins (breaks the browser target):\n  ${offenders.join('\n  ')}`)
  }

  // 4b. Browser target, dynamic: load the installed ESM entry with jsdom's window/document as the
  //     global environment and run the functional vector. jsdom is a devDependency resolved from
  //     the package root; the SDK still resolves its own deps from the isolated install.
  const esmEntry = path.join(installDir, 'dist', 'esm', 'src', 'index.js')
  fs.writeFileSync(
    path.join(tmp, 'check-browser.mjs'),
    `import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
const require = createRequire(${JSON.stringify(path.join(pkgRoot, 'package.json'))})
const { JSDOM } = require('jsdom')
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://margin-sdk.test' })
for (const [key, value] of Object.entries({ window: dom.window, document: dom.window.document, self: dom.window })) {
  try {
    Object.defineProperty(globalThis, key, { value, configurable: true })
  } catch {
    /* some globals are non-configurable on newer Node; the import below is the real check */
  }
}
const sdk = await import(pathToFileURL(${JSON.stringify(esmEntry)}).href)
${functionalCheck}
console.log('BROWSER (jsdom) OK')
`
  )
  execFileSync('node', ['check-browser.mjs'], { cwd: tmp, stdio: 'inherit' })

  console.log(
    `package check passed: ${pkg.name} loads under native Node (CJS + ESM) with declared deps only, ` +
      'ships no Node builtins, and loads under jsdom'
  )
} finally {
  fs.rmSync(tmp, { recursive: true, force: true })
}
