/**
 * ABI binding generator: emits `src/generated/abis.ts` from a **pinned** v4-periphery commit,
 * compiled with forge — no hand-written ABI ever ships. viem encodes tuples positionally, so the
 * bindings must be byte-derived from the contracts the SDK targets; regenerating from the pin and
 * diffing (`--check`) proves the committed bindings match that source exactly.
 *
 *   bun run regenerate:abis                    # regenerate from V4_PERIPHERY_PATH (must be at the pin)
 *   bun run regenerate:abis --update-pin       # re-pin to the checkout's HEAD and regenerate
 *   bun run check:abis                         # CI gate: regenerate to memory and diff, write nothing
 *
 * Env:
 *   V4_PERIPHERY_PATH    local v4-periphery checkout (default ~/dev/v4-periphery)
 *   V4_PERIPHERY_COMMIT  expected commit override (defaults to the pin in the generated file)
 *
 * The pin lives as a human-readable "Pinned to v4-periphery commit <sha>" line in the generated
 * file header — the single source of truth the CI workflow greps for, mirroring the
 * liquidity-launcher lock-bytecode gate.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const PACKAGE_ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const OUTPUT_PATH = path.join(PACKAGE_ROOT, 'src/generated/abis.ts')
const REPOSITORY = 'Uniswap/v4-periphery'

const CONTRACTS: Array<{ exportName: string; contract: string }> = [
  { exportName: 'MARGIN_ROUTER_ABI', contract: 'src/MarginRouter.sol:MarginRouter' },
  { exportName: 'MARGIN_ACCOUNT_ABI', contract: 'src/MarginAccount.sol:MarginAccount' },
  { exportName: 'MORPHO_LENDING_ADAPTER_ABI', contract: 'src/MorphoLendingAdapter.sol:MorphoLendingAdapter' },
  { exportName: 'AAVE_LENDING_ADAPTER_ABI', contract: 'src/AaveLendingAdapter.sol:AaveLendingAdapter' },
  { exportName: 'AAVE_V4_LENDING_ADAPTER_ABI', contract: 'src/AaveV4LendingAdapter.sol:AaveV4LendingAdapter' },
  {
    exportName: 'COMPOUND_V3_LENDING_ADAPTER_ABI',
    contract: 'src/CompoundV3LendingAdapter.sol:CompoundV3LendingAdapter',
  },
  { exportName: 'ILENDING_ADAPTER_ABI', contract: 'src/interfaces/ILendingAdapter.sol:ILendingAdapter' },
]

// The venue-agnostic surface reads.ts binds to: the ILendingAdapter interface plus the two-step
// ownership handoff and the shared errors every adapter carries (assembled from the compiled
// Morpho adapter ABI so nothing is hand-written).
const SHARED_ADAPTER_FUNCTIONS = ['owner', 'pendingOwner', 'transferOwnership', 'acceptOwnership', 'resolveAmount']
const SHARED_ADAPTER_ERRORS = ['MarketNotSupported', 'NotOwner', 'ZeroOwner', 'NotPendingOwner']

type AbiItem = Record<string, unknown> & { type: string; name?: string }

const checkMode = process.argv.includes('--check')
const updatePin = process.argv.includes('--update-pin')
const peripheryPath = process.env.V4_PERIPHERY_PATH ?? `${process.env.HOME}/dev/v4-periphery`

function git(args: string[]): string {
  const proc = Bun.spawnSync(['git', '-C', peripheryPath, ...args])
  if (proc.exitCode !== 0) throw new Error(`git ${args.join(' ')} failed:\n${proc.stderr.toString()}`)
  return proc.stdout.toString().trim()
}

function readCommittedPin(): string | undefined {
  if (!fs.existsSync(OUTPUT_PATH)) return undefined
  return fs.readFileSync(OUTPUT_PATH, 'utf8').match(/Pinned to v4-periphery commit ([0-9a-f]{40})/)?.[1]
}

/** Strips solc metadata (internalType) and re-serializes with a stable key order. */
function normalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalize)
  if (typeof value === 'object' && value !== null) {
    const entry = value as Record<string, unknown>
    const ordered: Record<string, unknown> = {}
    for (const key of ['type', 'name', 'stateMutability', 'anonymous', 'indexed', 'components', 'inputs', 'outputs']) {
      if (key in entry && key !== 'internalType') ordered[key] = normalize(entry[key])
    }
    return ordered
  }
  return value
}

function forgeAbi(contract: string): AbiItem[] {
  const proc = Bun.spawnSync(['forge', 'inspect', contract, 'abi', '--json'], { cwd: peripheryPath })
  if (proc.exitCode !== 0) throw new Error(`forge inspect ${contract} failed:\n${proc.stderr.toString()}`)
  return normalize(JSON.parse(proc.stdout.toString())) as AbiItem[]
}

function render(pin: string, abis: Map<string, AbiItem[]>): string {
  const morpho = abis.get('MORPHO_LENDING_ADAPTER_ABI')!
  const shared = [
    ...abis.get('ILENDING_ADAPTER_ABI')!,
    ...morpho.filter((item) => item.type === 'function' && SHARED_ADAPTER_FUNCTIONS.includes(item.name ?? '')),
    ...morpho.filter((item) => item.type === 'error' && SHARED_ADAPTER_ERRORS.includes(item.name ?? '')),
  ]

  const sections = [...CONTRACTS, { exportName: 'LENDING_ADAPTER_ABI', contract: '(assembled, see header)' }].map(
    ({ exportName, contract }) => {
      const abi = exportName === 'LENDING_ADAPTER_ABI' ? shared : abis.get(exportName)!
      return `/** ${contract} */\nexport const ${exportName} = ${JSON.stringify(abi, null, 2)} as const satisfies Abi`
    }
  )

  return `/**
 * GENERATED FILE — DO NOT EDIT.
 *
 * Forge-generated ABI bindings for the margin trading periphery.
 * Pinned to v4-periphery commit ${pin}
 * (https://github.com/${REPOSITORY}/commit/${pin})
 *
 * Regenerate with \`bun run regenerate:abis\`; CI verifies the bindings against a fresh build of
 * the pinned commit via \`bun run check:abis\`. LENDING_ADAPTER_ABI is the venue-agnostic surface:
 * the compiled ILendingAdapter interface plus the ownership functions and shared errors selected
 * from the compiled MorphoLendingAdapter ABI (identical across venues; the check gate proves the
 * per-venue ABIs against their own contracts).
 */
import { type Abi } from 'viem'

/** The v4-periphery source this file was generated from. */
export const V4_PERIPHERY_PIN = { repository: '${REPOSITORY}', commit: '${pin}' } as const

${sections.join('\n\n')}
`
}

function prettify(source: string): string {
  const proc = Bun.spawnSync(['bunx', 'prettier', '--stdin-filepath', OUTPUT_PATH], {
    cwd: PACKAGE_ROOT,
    stdin: Buffer.from(source),
  })
  if (proc.exitCode !== 0) throw new Error(`prettier failed:\n${proc.stderr.toString()}`)
  return proc.stdout.toString()
}

// -- main ------------------------------------------------------------------

const committedPin = readCommittedPin()
const expectedPin = process.env.V4_PERIPHERY_COMMIT ?? committedPin
const head = git(['rev-parse', 'HEAD'])

if (updatePin) {
  if (checkMode) throw new Error('--update-pin cannot be combined with --check')
} else {
  if (!expectedPin) throw new Error('no existing pin found — run with --update-pin to establish one')
  if (head !== expectedPin) {
    console.error(`v4-periphery checkout at ${peripheryPath} is at ${head}`)
    console.error(`but the bindings are pinned to        ${expectedPin}`)
    console.error('check out the pinned commit (or pass --update-pin to re-pin to HEAD)')
    process.exit(1)
  }
}
// untracked files can't affect the compiled output; only tracked modifications poison the pin
if (git(['status', '--porcelain', '--untracked-files=no']).length > 0) {
  console.error(`v4-periphery checkout at ${peripheryPath} has uncommitted tracked changes — refusing to generate`)
  process.exit(1)
}
git(['submodule', 'update', '--init', '--recursive'])

const abis = new Map<string, AbiItem[]>()
for (const { exportName, contract } of CONTRACTS) {
  abis.set(exportName, forgeAbi(contract))
  console.log(`✓ compiled ${contract} (${abis.get(exportName)!.length} ABI items)`)
}

const generated = prettify(render(updatePin ? head : expectedPin!, abis))

if (checkMode) {
  const committed = fs.existsSync(OUTPUT_PATH) ? fs.readFileSync(OUTPUT_PATH, 'utf8') : ''
  if (committed !== generated) {
    console.error('✗ committed ABI bindings do not match a fresh build of the pinned v4-periphery commit')
    console.error('  run `bun run regenerate:abis` and commit the result')
    const committedLines = committed.split('\n')
    const generatedLines = generated.split('\n')
    for (let i = 0; i < Math.max(committedLines.length, generatedLines.length); i++) {
      if (committedLines[i] !== generatedLines[i]) {
        console.error(`  first difference at line ${i + 1}:`)
        console.error(`    committed: ${committedLines[i] ?? '<missing>'}`)
        console.error(`    generated: ${generatedLines[i] ?? '<missing>'}`)
        break
      }
    }
    process.exit(1)
  }
  console.log(`✓ committed ABI bindings match the pinned v4-periphery build (${expectedPin})`)
} else {
  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true })
  fs.writeFileSync(OUTPUT_PATH, generated)
  console.log(`wrote ${path.relative(PACKAGE_ROOT, OUTPUT_PATH)} pinned to ${updatePin ? head : expectedPin}`)
}
