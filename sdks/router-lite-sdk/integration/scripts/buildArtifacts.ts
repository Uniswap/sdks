/**
 * Regenerates `artifacts/contracts.json` from `forge build` output.
 *
 * Run by hand (`bun run build:artifacts`) whenever `contracts/*.sol` changes — the test suite reads
 * only the committed JSON, so foundry is NOT needed to compile at test time (only `anvil`, to run
 * the fork). Both flavors of bytecode are kept because the harness uses both:
 *   - `creation`  — tokens, deployed with a normal CREATE transaction (constructors run).
 *   - `deployed`  — hooks, installed with `anvil_setCode` at a permission-encoding address.
 */
import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..')

/** `[solidity file, contract name]` pairs to export, in artifact order. */
const CONTRACTS: Array<[string, string]> = [
  ['TestERC20.sol', 'TestERC20'],
  ['TestERC20.sol', 'TestFeeOnTransferERC20'],
  ['TestHooks.sol', 'NoopHook'],
  ['TestHooks.sol', 'RevertOnSwapHook'],
  ['TestHooks.sol', 'SenderGateHook'],
  ['TestHooks.sol', 'SkimFeeHook'],
]

execFileSync('forge', ['build'], { cwd: ROOT, stdio: 'inherit' })

const out: Record<string, { creation: string; deployed: string }> = {}
for (const [file, name] of CONTRACTS) {
  const artifact = JSON.parse(readFileSync(join(ROOT, 'out', file, `${name}.json`), 'utf8'))
  const creation: string = artifact.bytecode.object
  const deployed: string = artifact.deployedBytecode.object
  if (!creation.startsWith('0x') || creation.length < 4) throw new Error(`${name}: empty creation bytecode`)
  out[name] = { creation, deployed }
}

mkdirSync(join(ROOT, 'artifacts'), { recursive: true })
writeFileSync(join(ROOT, 'artifacts', 'contracts.json'), `${JSON.stringify(out, null, 2)}\n`)
console.log(`wrote artifacts/contracts.json (${Object.keys(out).join(', ')})`)
