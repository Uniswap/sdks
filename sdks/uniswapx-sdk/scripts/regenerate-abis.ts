/**
 * Regenerate abis/*.json (and the typechain bindings in src/contracts) deterministically
 * from local checkouts of the upstream contract repos.
 *
 * WHY THIS EXISTS
 * ---------------
 * The files in abis/ are compiled contract artifacts hand-copied out of the UniswapX /
 * permit2 contract repos. typechain turns them into the ethers bindings in src/contracts
 * at build time. Nothing records which upstream commit each artifact came from and nothing
 * re-derives them, so they can silently go stale: an upstream reactor/hook can change its
 * ABI while the copy in this repo keeps describing the old interface. That is the same
 * class of bug that produced the liquidity-launcher stale-bytecode incident (see
 * Uniswap/sdks#648) — a hand-copied upstream artifact pinned to nothing, with no refresh
 * path. This script makes "refresh the ABIs" a single, reviewable command that reads its
 * inputs from scripts/abis.manifest.json (the provenance manifest, also documented in
 * abis/PROVENANCE.md) instead of copy/paste.
 *
 * WHAT IT DOES / DOES NOT REFRESH
 * -------------------------------
 * It only refreshes the `scripted: true` entries in the manifest — the foundry artifacts
 * owned by Uniswap/UniswapX and Uniswap/permit2. The remaining entries (third-party proxy
 * artifacts under a contracts/ layout, the hand-authored Multicall ABIs, the hardhat-format
 * mock, the metadata-less interface ABI) are `scripted: false` and are left untouched; keep
 * maintaining those by hand and record any change in the manifest.
 *
 * USAGE (from this package directory)
 * -----------------------------------
 *   UNISWAPX_REPO=/path/to/UniswapX \
 *   PERMIT2_REPO=/path/to/permit2 \
 *   UNISWAPX_COMMIT=<sha> PERMIT2_COMMIT=<sha> \
 *   bun run regenerate:abis
 *
 * You may refresh a single repo by providing only that repo's path (e.g. just
 * UNISWAPX_REPO). Repos with no provided path are skipped with a note; at least one is
 * required.
 *
 * INPUTS (env)
 *   UNISWAPX_REPO / PERMIT2_REPO   Path to a local checkout of the corresponding repo.
 *   UNISWAPX_COMMIT / PERMIT2_COMMIT
 *                                  Commit / ref to check out and pin to (optional; when
 *                                  omitted the repo's current HEAD is used and recorded).
 *
 * ESCAPE HATCHES for constrained / non-standard toolchains (all optional):
 *   FORGE_BIN         Path to the forge binary (default: "forge" on PATH).
 *   SKIP_CHECKOUT     Skip `git checkout` (use when the repo is already at the target ref).
 *   SKIP_SUBMODULES   Skip `git submodule update --init --recursive` (use when submodules
 *                     are already fetched and their remotes are unreachable).
 *   SKIP_BUILD        Skip `forge build` and read artifacts from the repo's existing out/
 *                     directory (use when the repo is already built).
 *
 * The script validates every artifact before writing anything, fails loudly (nonzero exit)
 * and writes nothing partial if forge is missing, a build fails, or an artifact is absent /
 * malformed. Refreshed artifacts are written as canonical pretty-printed JSON (2-space
 * indent, trailing newline); the first scripted refresh therefore normalizes the historical
 * hand-saved formatting of some files — that diff is formatting-only, the ABI/bytecode
 * content is what matters. After copying it regenerates src/contracts via typechain, then
 * records the resolved commit(s) back into scripts/abis.manifest.json and abis/PROVENANCE.md.
 */
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const PACKAGE_ROOT = resolve(HERE, '..')
const ABIS_DIR = join(PACKAGE_ROOT, 'abis')
const MANIFEST_FILE = join(HERE, 'abis.manifest.json')
const PROVENANCE_FILE = join(ABIS_DIR, 'PROVENANCE.md')
const TYPECHAIN_OUT = join(PACKAGE_ROOT, 'src', 'contracts')

type Artifact = {
  abiFile: string
  source: string
  contract: string
  sourcePath: string | null
  solc: string | null
  format: string
  kind: string
  scripted: boolean
  note?: string
}

type RepoSpec = {
  url: string
  toolchain: string
  outDir: string
  pinnedCommit: string
  envVar: string
}

type Manifest = {
  repos: Record<string, RepoSpec>
  artifacts: Artifact[]
  [k: string]: unknown
}

function die(message: string): never {
  console.error(`\n[regenerate-abis] ERROR: ${message}\n`)
  process.exit(1)
}

function run(bin: string, args: string[], cwd: string): string {
  try {
    return execFileSync(bin, args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] })
  } catch (err: any) {
    if (err?.code === 'ENOENT') die(`command not found: ${bin}`)
    die(`command failed: ${bin} ${args.join(' ')}`)
  }
}

function isGitRepo(dir: string): boolean {
  return existsSync(join(dir, '.git'))
}

function main() {
  const forgeBin = process.env.FORGE_BIN ?? 'forge'
  const skipCheckout = Boolean(process.env.SKIP_CHECKOUT)
  const skipSubmodules = Boolean(process.env.SKIP_SUBMODULES)
  const skipBuild = Boolean(process.env.SKIP_BUILD)

  const manifest: Manifest = JSON.parse(readFileSync(MANIFEST_FILE, 'utf8'))

  // Collect the repos we can actually refresh (scripted entries + a provided path).
  const plan: { key: string; spec: RepoSpec; repoPath: string; commit?: string; artifacts: Artifact[] }[] = []
  const skippedRepos: string[] = []
  for (const [key, spec] of Object.entries(manifest.repos)) {
    const artifacts = manifest.artifacts.filter((a) => a.scripted && a.source === key)
    if (artifacts.length === 0) continue
    const repoPath = process.env[spec.envVar]
    if (!repoPath) {
      skippedRepos.push(`${key} (set ${spec.envVar} to refresh its ${artifacts.length} artifact(s))`)
      continue
    }
    // Derive the commit var from the same `spec.envVar` as the repo path (strip the `_REPO`
    // suffix, append `_COMMIT`) so the <REPO>/<REPO>_COMMIT pair can never drift for a future
    // entry whose manifest key differs from its envVar prefix.
    const commit = process.env[`${spec.envVar.replace(/_REPO$/, '')}_COMMIT`]
    plan.push({ key, spec, repoPath: resolve(repoPath), commit, artifacts })
  }

  if (plan.length === 0) {
    die(
      'no upstream repo path provided. Set at least one of ' +
        Object.values(manifest.repos)
          .map((r) => r.envVar)
          .join(' / ') +
        ' to a local checkout.'
    )
  }
  for (const s of skippedRepos) console.log(`[regenerate-abis] skipping ${s}`)

  // Phase 1: for each planned repo, (optionally) checkout/build, then read + validate all of
  // its artifacts into memory. Nothing is written until every artifact validates.
  const toWrite: { abiFile: string; json: string }[] = []
  const resolvedCommits: Record<string, string> = {}

  for (const p of plan) {
    if (!existsSync(join(p.repoPath, 'foundry.toml'))) {
      die(`${p.spec.envVar} does not look like a foundry repo (no foundry.toml): ${p.repoPath}`)
    }
    if (!skipCheckout && p.commit) {
      console.log(`[regenerate-abis] (${p.key}) git checkout ${p.commit}`)
      run('git', ['-C', p.repoPath, 'checkout', p.commit], p.repoPath)
    }
    if (!skipSubmodules) {
      console.log(`[regenerate-abis] (${p.key}) git submodule update --init --recursive`)
      run('git', ['-C', p.repoPath, 'submodule', 'update', '--init', '--recursive'], p.repoPath)
    }
    if (!skipBuild) {
      console.log(`[regenerate-abis] (${p.key}) ${forgeBin} build`)
      run(forgeBin, ['build'], p.repoPath)
    }
    resolvedCommits[p.key] = isGitRepo(p.repoPath)
      ? run('git', ['-C', p.repoPath, 'rev-parse', 'HEAD'], p.repoPath).trim()
      : p.commit ?? p.spec.pinnedCommit

    for (const a of p.artifacts) {
      if (!a.sourcePath) die(`manifest entry ${a.abiFile} is scripted but has no sourcePath`)
      const artifactPath = join(p.repoPath, p.spec.outDir, basename(a.sourcePath), `${a.contract}.json`)
      if (!existsSync(artifactPath)) {
        die(`artifact missing (build the repo, or check the manifest sourcePath/contract): ${artifactPath}`)
      }
      let parsed: any
      try {
        parsed = JSON.parse(readFileSync(artifactPath, 'utf8'))
      } catch {
        die(`could not parse artifact JSON: ${artifactPath}`)
      }
      if (!Array.isArray(parsed?.abi)) die(`artifact has no abi array: ${artifactPath}`)
      const object: string | undefined = parsed?.bytecode?.object
      if (a.kind === 'deployable' && (!object || !/^0x[0-9a-fA-F]+$/.test(object) || object === '0x')) {
        die(`expected deployable bytecode for ${a.contract} but got empty/invalid object: ${artifactPath}`)
      }
      // Canonical formatting: 2-space indent + trailing newline.
      toWrite.push({ abiFile: a.abiFile, json: `${JSON.stringify(parsed, null, 2)}\n` })
      console.log(`[regenerate-abis] (${p.key}) validated ${a.abiFile} <- ${p.spec.outDir}/${basename(a.sourcePath)}/${a.contract}.json`)
    }
  }

  // Phase 2: everything validated — write the refreshed artifacts.
  for (const w of toWrite) writeFileSync(join(ABIS_DIR, w.abiFile), w.json)
  console.log(`[regenerate-abis] wrote ${toWrite.length} artifact(s) to abis/`)

  // Phase 3: regenerate the typechain bindings from the refreshed ABIs. Defer to the
  // package's own `typechain` script so the target / out-dir / glob stay in one place.
  console.log(`[regenerate-abis] regenerating ${TYPECHAIN_OUT} via \`bun run typechain\``)
  run('bun', ['run', 'typechain'], PACKAGE_ROOT)

  // Phase 4: record the resolved commit(s) back into the manifest + provenance doc.
  for (const [key, commit] of Object.entries(resolvedCommits)) {
    if (manifest.repos[key]) manifest.repos[key].pinnedCommit = commit
  }
  writeFileSync(MANIFEST_FILE, `${JSON.stringify(manifest, null, 2)}\n`)
  updateProvenancePins(resolvedCommits, forgeBin, plan)

  console.log('\n[regenerate-abis] done:')
  for (const [key, commit] of Object.entries(resolvedCommits)) console.log(`  ${key.padEnd(10)} ${commit}`)
}

function updateProvenancePins(
  resolvedCommits: Record<string, string>,
  forgeBin: string,
  plan: { key: string; repoPath: string }[]
) {
  if (!existsSync(PROVENANCE_FILE)) return
  let doc = readFileSync(PROVENANCE_FILE, 'utf8')
  let forgeVersion = ''
  try {
    const out = execFileSync(forgeBin, ['--version'], { encoding: 'utf8' })
    const m = out.match(/Version:\s*(\S+)/)
    forgeVersion = m ? m[1] : out.split('\n')[0].trim()
  } catch {
    forgeVersion = 'unknown'
  }
  for (const [key, commit] of Object.entries(resolvedCommits)) {
    // Replace a line like: `- **uniswapx** pinned commit: `...`` (any current value).
    const re = new RegExp(`(- \\*\\*${key}\\*\\* pinned commit: )\`[^\`]*\``)
    const stamp = `\`${commit}\` _(refreshed with ${forgeVersion})_`
    if (re.test(doc)) doc = doc.replace(re, `$1${stamp}`)
  }
  writeFileSync(PROVENANCE_FILE, doc)
}

main()
