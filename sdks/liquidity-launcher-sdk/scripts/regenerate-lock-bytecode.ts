/**
 * Regenerate src/lockRecipientBytecode.ts (and refresh the keccak pins in
 * src/lock.test.ts) deterministically from a local liquidity-launcher checkout.
 *
 * The three creation bytecodes embedded in lockRecipientBytecode.ts are hand-lifted
 * from a `forge build` of the liquidity-launcher contracts. They have silently gone
 * stale before (the Robinhood timelock no-op bug), so extraction is scripted here to
 * remove transcription error and make "bump the pin" a single, reviewable command.
 *
 * Usage (from this package directory):
 *
 *   LAUNCHER_REPO=/path/to/liquidity-launcher \
 *   LAUNCHER_COMMIT=<commit-sha> \
 *   bun run regenerate:lock-bytecode
 *
 * Equivalent positional form:
 *
 *   bun run scripts/regenerate-lock-bytecode.ts <launcher-repo> <commit-sha>
 *
 * Inputs (env, override the positional args when set):
 *   LAUNCHER_REPO    Path to a local liquidity-launcher clone (required).
 *   LAUNCHER_COMMIT  Commit sha / ref to check out and pin to (required).
 *
 * Escape hatches for constrained / non-standard toolchains (all optional; the
 * defaults are plain `forge` on PATH and normal submodules for a dev machine):
 *   FORGE_BIN        Path to the forge binary (default: "forge").
 *   SOLC_PATH        Path to a solc binary; passed to `forge build --use <path>`.
 *                    Omit to let forge resolve solc itself.
 *   SKIP_SUBMODULES  Set to any value to skip `git submodule update --init`
 *                    (use when submodules are already fetched and the upstream
 *                    remotes are unreachable, e.g. the OpenZeppelin SSH remote).
 *   SKIP_CHECKOUT    Set to any value to skip `git checkout <commit>` (use when the
 *                    repo is already parked at the target commit).
 *
 * The script fails loudly (nonzero exit) and writes nothing if forge is missing, the
 * build fails, or any contract artifact is absent — never partial/empty output.
 */
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { keccak256, toBytes, type Hex } from 'viem'

const HERE = dirname(fileURLToPath(import.meta.url))
const PACKAGE_ROOT = resolve(HERE, '..')
const BYTECODE_FILE = join(PACKAGE_ROOT, 'src', 'lockRecipientBytecode.ts')
const TEST_FILE = join(PACKAGE_ROOT, 'src', 'lock.test.ts')

// Source contract -> exported constant name. Order is the file order.
const CONTRACTS = [
  {
    key: 'TIMELOCK',
    source: 'src/periphery/TimelockedPositionRecipient.sol',
    contract: 'TimelockedPositionRecipient',
  },
  {
    key: 'FEES_FORWARDER',
    source: 'src/periphery/PositionFeesForwarder.sol',
    contract: 'PositionFeesForwarder',
  },
  {
    key: 'BUYBACK_BURN',
    source: 'src/periphery/BuybackAndBurnPositionRecipient.sol',
    contract: 'BuybackAndBurnPositionRecipient',
  },
] as const

function die(message: string): never {
  console.error(`\n[regenerate-lock-bytecode] ERROR: ${message}\n`)
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

function main() {
  const repoArg = process.env.LAUNCHER_REPO ?? process.argv[2]
  const commitArg = process.env.LAUNCHER_COMMIT ?? process.argv[3]
  const forgeBin = process.env.FORGE_BIN ?? 'forge'
  const solcPath = process.env.SOLC_PATH
  const skipSubmodules = Boolean(process.env.SKIP_SUBMODULES)
  const skipCheckout = Boolean(process.env.SKIP_CHECKOUT)

  if (!repoArg) die('LAUNCHER_REPO (or the first positional arg) is required')
  if (!commitArg) die('LAUNCHER_COMMIT (or the second positional arg) is required')

  const repo = resolve(repoArg)
  if (!existsSync(join(repo, 'foundry.toml'))) {
    die(`LAUNCHER_REPO does not look like a foundry repo (no foundry.toml): ${repo}`)
  }

  // 1. Park the launcher repo at the target commit and (optionally) refresh submodules.
  if (!skipCheckout) {
    console.log(`[regenerate-lock-bytecode] git checkout ${commitArg}`)
    run('git', ['-C', repo, 'checkout', commitArg], repo)
  }
  if (!skipSubmodules) {
    console.log('[regenerate-lock-bytecode] git submodule update --init --recursive')
    run('git', ['-C', repo, 'submodule', 'update', '--init', '--recursive'], repo)
  }

  const commit = run('git', ['-C', repo, 'rev-parse', 'HEAD'], repo).trim()

  // 2. Build only the three target sources. The launcher pins several unrelated
  //    contracts to `=0.8.26`; compiling just the periphery recipients (pragma
  //    `^0.8.26`) keeps this deterministic and avoids needing every submodule.
  const buildArgs = ['build']
  if (solcPath) buildArgs.push('--use', solcPath)
  for (const c of CONTRACTS) buildArgs.push(c.source)
  console.log(`[regenerate-lock-bytecode] ${forgeBin} ${buildArgs.join(' ')}`)
  run(forgeBin, buildArgs, repo)

  // 3. Read each freshly-built artifact and validate before writing anything.
  const forgeVersion = (() => {
    const out = run(forgeBin, ['--version'], repo)
    const m = out.match(/Version:\s*(\S+)/)
    return m ? m[1] : out.split('\n')[0].trim()
  })()

  let solcVersion = ''
  const built: { key: string; object: Hex; hash: Hex }[] = []
  for (const c of CONTRACTS) {
    const artifactPath = join(repo, 'out', `${c.contract}.sol`, `${c.contract}.json`)
    if (!existsSync(artifactPath)) die(`artifact missing after build: ${artifactPath}`)
    let artifact: any
    try {
      artifact = JSON.parse(readFileSync(artifactPath, 'utf8'))
    } catch {
      die(`could not parse artifact JSON: ${artifactPath}`)
    }
    const object: string | undefined = artifact?.bytecode?.object
    if (!object || !/^0x[0-9a-fA-F]+$/.test(object) || object === '0x') {
      die(`empty or invalid bytecode.object for ${c.contract} in ${artifactPath}`)
    }
    const version: string | undefined = artifact?.metadata?.compiler?.version
    if (version) solcVersion = version
    const hex = object as Hex
    built.push({ key: c.key, object: hex, hash: keccak256(toBytes(hex)) })
  }
  if (!solcVersion) die('could not determine solc version from artifact metadata')

  // 4. Rewrite src/lockRecipientBytecode.ts from the template.
  writeFileSync(BYTECODE_FILE, renderBytecodeFile(commit, forgeVersion, solcVersion, built))
  console.log(`[regenerate-lock-bytecode] wrote ${BYTECODE_FILE}`)

  // 5. Refresh the three keccak pins in src/lock.test.ts in place.
  let test = readFileSync(TEST_FILE, 'utf8')
  for (const b of built) {
    const re = new RegExp(
      `(keccak256\\(LOCK_RECIPIENT_CREATION_BYTECODE\\.${b.key}\\)\\)\\.toBe\\(\\s*')0x[0-9a-fA-F]{64}(')`
    )
    if (!re.test(test)) die(`could not locate keccak pin for ${b.key} in ${TEST_FILE}`)
    test = test.replace(re, `$1${b.hash}$2`)
  }
  writeFileSync(TEST_FILE, test)
  console.log(`[regenerate-lock-bytecode] updated keccak pins in ${TEST_FILE}`)

  console.log('\n[regenerate-lock-bytecode] done:')
  console.log(`  commit ${commit}`)
  console.log(`  forge  ${forgeVersion}`)
  console.log(`  solc   ${solcVersion}`)
  for (const b of built) console.log(`  ${b.key.padEnd(14)} ${b.hash}`)
}

function renderBytecodeFile(
  commit: string,
  forgeVersion: string,
  solcVersion: string,
  built: { key: string; object: Hex }[]
): string {
  const entries = built.map((b) => `  ${b.key}:\n    '${b.object}' as Hex,`).join('\n')
  return `// AUTO-GENERATED by scripts/regenerate-lock-bytecode.ts — do not edit by hand.
// Creation bytecode for the liquidity-launcher periphery position recipients.
//
// Pinned to liquidity-launcher commit ${commit}.
// Compiled with forge ${forgeVersion} / solc ${solcVersion}.
//
// Regenerate whenever the launcher periphery contracts OR their dependencies
// (including base contracts such as BlockNumberish) change:
//   LAUNCHER_REPO=<path-to-liquidity-launcher> \\
//   LAUNCHER_COMMIT=${commit} \\
//   bun run regenerate:lock-bytecode
//
// Constructor args are ABI-encoded and appended at deploy time (see buildLockRecipient).
// The keccak pins in lock.test.ts only guard against accidental local edits of these
// bytes; they do NOT detect upstream contract drift — regeneration is the only thing
// that picks up upstream changes.
import { type Hex } from 'viem'

export const LOCK_RECIPIENT_CREATION_BYTECODE = {
${entries}
} as const
`
}

main()
