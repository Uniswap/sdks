/**
 * Regenerate — or, with `--check`, verify — src/lockRecipientBytecode.ts (and the
 * keccak pins in src/lock.test.ts) deterministically from a liquidity-launcher checkout.
 *
 * The three creation bytecodes embedded in lockRecipientBytecode.ts are lifted from a
 * `forge build` of the liquidity-launcher contracts. They have silently gone stale
 * before (the Robinhood timelock no-op bug), so extraction is scripted here to remove
 * transcription error and, crucially, to give CI something it can actually FAIL on.
 *
 * Two modes:
 *
 *   (default) regenerate — rebuild and WRITE lockRecipientBytecode.ts + refresh the
 *     keccak pins in lock.test.ts. This is what a maintainer runs when bumping the pin.
 *
 *   --check — rebuild in memory and DIFF against the committed constants + pins WITHOUT
 *     writing anything. Exits nonzero (with a clear message) on any difference, 0 when
 *     in sync. This is what CI runs. Two CI shapes reuse it:
 *       * consistency gate (PR): build at the commit pinned in the file header and prove
 *         the committed bytecode matches that commit's build. LAUNCHER_COMMIT is left
 *         unset so the pinned commit is read from the file (the human-readable source of
 *         truth).
 *       * staleness alarm (scheduled): build at upstream's latest ref (pass it via
 *         LAUNCHER_COMMIT) and prove the committed bytecode still matches HEAD/the latest
 *         release. A mismatch here means upstream advanced and the pin must be bumped.
 *
 * Usage (from this package directory):
 *
 *   # regenerate (write):
 *   LAUNCHER_REPO=/path/to/liquidity-launcher \
 *   LAUNCHER_COMMIT=<commit-sha> \
 *   bun run regenerate:lock-bytecode
 *
 *   # check consistency at the pinned commit (no write):
 *   LAUNCHER_REPO=/path/to/liquidity-launcher \
 *   bun run check:lock-bytecode
 *
 *   # check staleness against an arbitrary upstream ref (no write):
 *   LAUNCHER_REPO=/path/to/liquidity-launcher \
 *   LAUNCHER_COMMIT=origin/main \
 *   bun run check:lock-bytecode
 *
 * Equivalent positional form:
 *
 *   bun run scripts/regenerate-lock-bytecode.ts <launcher-repo> <commit-sha> [--check]
 *
 * Inputs (env, override the positional args when set):
 *   LAUNCHER_REPO    Path to a local liquidity-launcher clone (required).
 *   LAUNCHER_COMMIT  Commit sha / ref to check out and pin to. Required for regenerate.
 *                    Optional for --check: defaults to the commit recorded in the
 *                    lockRecipientBytecode.ts header.
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

type Built = { key: string; object: Hex; hash: Hex }

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

/** Read the launcher commit recorded in the committed bytecode file header. */
function pinnedCommitFromFile(): string {
  const text = readFileSync(BYTECODE_FILE, 'utf8')
  const m = text.match(/Pinned to liquidity-launcher commit ([0-9a-fA-F]{7,40})/)
  if (!m) die(`could not read the pinned commit from the header of ${BYTECODE_FILE}`)
  return m[1]
}

/** Parse the three committed creation-bytecode constants out of the bytecode file. */
function committedBytecode(): Record<string, Hex> {
  const text = readFileSync(BYTECODE_FILE, 'utf8')
  const out: Record<string, Hex> = {}
  for (const c of CONTRACTS) {
    const m = text.match(new RegExp(`${c.key}:\\s*'(0x[0-9a-fA-F]+)'`))
    if (!m) die(`could not find committed bytecode constant ${c.key} in ${BYTECODE_FILE}`)
    out[c.key] = m[1] as Hex
  }
  return out
}

/** Parse the three committed keccak pins out of the test file. */
function committedPins(): Record<string, Hex> {
  const text = readFileSync(TEST_FILE, 'utf8')
  const out: Record<string, Hex> = {}
  for (const c of CONTRACTS) {
    const m = text.match(
      new RegExp(`keccak256\\(LOCK_RECIPIENT_CREATION_BYTECODE\\.${c.key}\\)\\)\\.toBe\\(\\s*'(0x[0-9a-fA-F]{64})'`)
    )
    if (!m) die(`could not find committed keccak pin for ${c.key} in ${TEST_FILE}`)
    out[c.key] = m[1] as Hex
  }
  return out
}

/**
 * Park the launcher repo at `commitArg`, (optionally) refresh submodules, build only
 * the three periphery sources, and return the resolved commit + freshly-built bytecode.
 * Writes nothing to this package — pure extraction.
 */
function buildFromLauncher(
  repoArg: string,
  commitArg: string,
  opts: { forgeBin: string; solcPath?: string; skipSubmodules: boolean; skipCheckout: boolean }
): { commit: string; forgeVersion: string; solcVersion: string; built: Built[] } {
  const repo = resolve(repoArg)
  if (!existsSync(join(repo, 'foundry.toml'))) {
    die(`LAUNCHER_REPO does not look like a foundry repo (no foundry.toml): ${repo}`)
  }

  // 1. Park the launcher repo at the target commit and (optionally) refresh submodules.
  if (!opts.skipCheckout) {
    console.log(`[regenerate-lock-bytecode] git checkout ${commitArg}`)
    run('git', ['-C', repo, 'checkout', commitArg], repo)
  }
  if (!opts.skipSubmodules) {
    console.log('[regenerate-lock-bytecode] git submodule update --init --recursive')
    run('git', ['-C', repo, 'submodule', 'update', '--init', '--recursive'], repo)
  }

  const commit = run('git', ['-C', repo, 'rev-parse', 'HEAD'], repo).trim()

  // 2. Build only the three target sources. The launcher pins several unrelated
  //    contracts to `=0.8.26`; compiling just the periphery recipients (pragma
  //    `^0.8.26`) keeps this deterministic and avoids needing every submodule.
  const buildArgs = ['build']
  if (opts.solcPath) buildArgs.push('--use', opts.solcPath)
  for (const c of CONTRACTS) buildArgs.push(c.source)
  console.log(`[regenerate-lock-bytecode] ${opts.forgeBin} ${buildArgs.join(' ')}`)
  run(opts.forgeBin, buildArgs, repo)

  // 3. Read each freshly-built artifact and validate before returning anything.
  const forgeVersion = (() => {
    const out = run(opts.forgeBin, ['--version'], repo)
    const m = out.match(/Version:\s*(\S+)/)
    return m ? m[1] : out.split('\n')[0].trim()
  })()

  let solcVersion = ''
  const built: Built[] = []
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

  return { commit, forgeVersion, solcVersion, built }
}

function main() {
  const positionals = process.argv.slice(2).filter((a) => !a.startsWith('--'))
  const checkMode = process.argv.includes('--check')

  const repoArg = process.env.LAUNCHER_REPO ?? positionals[0]
  const forgeBin = process.env.FORGE_BIN ?? 'forge'
  const solcPath = process.env.SOLC_PATH
  const skipSubmodules = Boolean(process.env.SKIP_SUBMODULES)
  const skipCheckout = Boolean(process.env.SKIP_CHECKOUT)

  if (!repoArg) die('LAUNCHER_REPO (or the first positional arg) is required')

  // In --check mode the commit defaults to whatever the file header pins to, so the
  // consistency gate needs no arguments. Regenerate always requires an explicit commit.
  const pinned = pinnedCommitFromFile()
  const commitArg = process.env.LAUNCHER_COMMIT ?? positionals[1] ?? (checkMode ? pinned : undefined)
  if (!commitArg) die('LAUNCHER_COMMIT (or the second positional arg) is required')

  const { commit, forgeVersion, solcVersion, built } = buildFromLauncher(repoArg, commitArg, {
    forgeBin,
    solcPath,
    skipSubmodules,
    skipCheckout,
  })

  if (checkMode) {
    checkAgainstCommitted({ commit, pinned, built })
    return
  }

  // Regenerate: rewrite the bytecode file and refresh the pins.
  writeFileSync(BYTECODE_FILE, renderBytecodeFile(commit, forgeVersion, solcVersion, built))
  console.log(`[regenerate-lock-bytecode] wrote ${BYTECODE_FILE}`)

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

/**
 * Compare freshly-built bytecode against the committed constants + pins. Exits nonzero
 * with an actionable message on any difference; prints an all-clear and returns on match.
 */
function checkAgainstCommitted(args: { commit: string; pinned: string; built: Built[] }): void {
  const { commit, pinned, built } = args
  const bytecode = committedBytecode()
  const pins = committedPins()

  const diffs: string[] = []
  for (const b of built) {
    if (bytecode[b.key] !== b.object) diffs.push(`  - ${b.key}: creation bytecode differs`)
    if (pins[b.key] !== b.hash) {
      diffs.push(`  - ${b.key}: keccak pin differs (committed ${pins[b.key]}, built ${b.hash})`)
    }
  }

  // `commit` is the fully-resolved sha of whatever ref we built; `pinned` is what the
  // file records. When they match, this is the PR consistency gate; when they differ,
  // the caller pointed us at a floating upstream ref (the staleness alarm).
  const isStalenessCheck = !commit.startsWith(pinned) && !pinned.startsWith(commit)

  if (diffs.length === 0) {
    if (isStalenessCheck) {
      console.log(
        `\n[regenerate-lock-bytecode] OK: committed lock-recipient bytecode still matches upstream ` +
          `${commit} (pinned commit ${pinned}).\n`
      )
    } else {
      console.log(
        `\n[regenerate-lock-bytecode] OK: committed lock-recipient bytecode matches pinned launcher ` +
          `commit ${pinned}.\n`
      )
    }
    process.exit(0)
  }

  if (isStalenessCheck) {
    console.error(
      `\n[regenerate-lock-bytecode] STALE: upstream liquidity-launcher has advanced to ${commit}, ` +
        `whose build no longer matches the committed lock-recipient bytecode (pinned to ${pinned}).\n` +
        `Differences:\n${diffs.join('\n')}\n\n` +
        `A maintainer must review the upstream changes, then bump the pin:\n` +
        `  LAUNCHER_REPO=<path> LAUNCHER_COMMIT=${commit} bun run regenerate:lock-bytecode\n`
    )
  } else {
    console.error(
      `\n[regenerate-lock-bytecode] OUT OF SYNC: lock-recipient bytecode is out of sync with pinned ` +
        `launcher commit ${pinned} — run \`bun run regenerate:lock-bytecode\`.\n` +
        `Differences:\n${diffs.join('\n')}\n`
    )
  }
  process.exit(1)
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
// CI enforces this: the consistency gate rebuilds at the pinned commit above and fails
// if these bytes drift; a weekly staleness alarm rebuilds at upstream HEAD and fails if
// the launcher has advanced past the pin. See README "Maintaining the lock-recipient
// bytecode".
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
