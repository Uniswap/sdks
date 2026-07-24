/**
 * ABI drift gate: verifies every hand-written SDK ABI entry against the Solidity source of truth.
 *
 * viem encodes tuples positionally, so a silent field reorder in the (still-draft) contracts
 * would produce valid-looking but wrong calldata with unit tests still green. This script compiles
 * the contracts with `forge inspect` from a local v4-periphery checkout and asserts that every
 * function / event / error in the SDK ABIs exists there with an identical canonical signature,
 * identical outputs, state mutability, and event index layout.
 *
 *   V4_PERIPHERY_PATH=~/dev/v4-periphery bun run check:abi-drift
 *
 * Run it whenever the contracts move; it requires foundry and a checkout of the margin-trading
 * branch, so it is a manual/optional gate rather than part of the default CI test run.
 */
import { type AbiParameter } from 'viem'

import {
  AAVE_LENDING_ADAPTER_ABI,
  AAVE_V4_LENDING_ADAPTER_ABI,
  LENDING_ADAPTER_ABI,
  MARGIN_ACCOUNT_ABI,
  MARGIN_ROUTER_ABI,
  MORPHO_LENDING_ADAPTER_ABI,
} from '../src/abis.js'

const peripheryPath = process.env.V4_PERIPHERY_PATH ?? `${process.env.HOME}/dev/v4-periphery`

interface AbiItem {
  type: string
  name?: string
  inputs?: readonly AbiParameter[]
  outputs?: readonly AbiParameter[]
  stateMutability?: string
}

function canonicalType(param: AbiParameter): string {
  if (param.type.startsWith('tuple')) {
    const components = (param as { components?: readonly AbiParameter[] }).components ?? []
    return `(${components.map(canonicalType).join(',')})${param.type.slice('tuple'.length)}`
  }
  return param.type
}

function signature(item: AbiItem): string {
  return `${item.name}(${(item.inputs ?? []).map(canonicalType).join(',')})`
}

function indexedLayout(item: AbiItem): string {
  return (item.inputs ?? []).map((input) => ((input as { indexed?: boolean }).indexed ? '1' : '0')).join('')
}

async function forgeAbi(contract: string): Promise<AbiItem[]> {
  const proc = Bun.spawnSync(['forge', 'inspect', contract, 'abi', '--json'], { cwd: peripheryPath })
  if (proc.exitCode !== 0) {
    throw new Error(`forge inspect ${contract} failed:\n${proc.stderr.toString()}`)
  }
  return JSON.parse(proc.stdout.toString()) as AbiItem[]
}

function diffAbi(label: string, sdkAbi: readonly unknown[], solidity: AbiItem[]): string[] {
  const problems: string[] = []
  const bySignature = new Map<string, AbiItem>()
  for (const item of solidity) {
    if (item.type === 'function' || item.type === 'event' || item.type === 'error') {
      bySignature.set(`${item.type}:${signature(item)}`, item)
    }
  }
  for (const entry of sdkAbi as AbiItem[]) {
    if (entry.type !== 'function' && entry.type !== 'event' && entry.type !== 'error') continue
    const key = `${entry.type}:${signature(entry)}`
    const onchain = bySignature.get(key)
    if (!onchain) {
      problems.push(`${label}: ${key} not found in the Solidity ABI (renamed, removed, or reordered fields?)`)
      continue
    }
    if (entry.type === 'function') {
      const sdkOutputs = (entry.outputs ?? []).map(canonicalType).join(',')
      const solOutputs = (onchain.outputs ?? []).map(canonicalType).join(',')
      if (sdkOutputs !== solOutputs) {
        problems.push(`${label}: ${key} outputs drifted: sdk (${sdkOutputs}) vs solidity (${solOutputs})`)
      }
      if (entry.stateMutability !== onchain.stateMutability) {
        problems.push(
          `${label}: ${key} stateMutability drifted: sdk ${entry.stateMutability} vs solidity ${onchain.stateMutability}`
        )
      }
    }
    if (entry.type === 'event' && indexedLayout(entry) !== indexedLayout(onchain)) {
      problems.push(
        `${label}: ${key} indexed layout drifted: sdk ${indexedLayout(entry)} vs solidity ${indexedLayout(onchain)}`
      )
    }
  }
  return problems
}

const CHECKS: Array<[string, readonly unknown[], string]> = [
  ['MARGIN_ROUTER_ABI', MARGIN_ROUTER_ABI, 'src/MarginRouter.sol:MarginRouter'],
  ['MARGIN_ACCOUNT_ABI', MARGIN_ACCOUNT_ABI, 'src/MarginAccount.sol:MarginAccount'],
  ['MORPHO_LENDING_ADAPTER_ABI', MORPHO_LENDING_ADAPTER_ABI, 'src/MorphoLendingAdapter.sol:MorphoLendingAdapter'],
  ['AAVE_LENDING_ADAPTER_ABI', AAVE_LENDING_ADAPTER_ABI, 'src/AaveLendingAdapter.sol:AaveLendingAdapter'],
  ['AAVE_V4_LENDING_ADAPTER_ABI', AAVE_V4_LENDING_ADAPTER_ABI, 'src/AaveV4LendingAdapter.sol:AaveV4LendingAdapter'],
  // The venue-agnostic surface must hold on every venue.
  ['LENDING_ADAPTER_ABI vs Morpho', LENDING_ADAPTER_ABI, 'src/MorphoLendingAdapter.sol:MorphoLendingAdapter'],
  ['LENDING_ADAPTER_ABI vs Aave v3', LENDING_ADAPTER_ABI, 'src/AaveLendingAdapter.sol:AaveLendingAdapter'],
  ['LENDING_ADAPTER_ABI vs Aave v4', LENDING_ADAPTER_ABI, 'src/AaveV4LendingAdapter.sol:AaveV4LendingAdapter'],
]

const allProblems: string[] = []
for (const [label, sdkAbi, contract] of CHECKS) {
  const solidity = await forgeAbi(contract)
  const problems = diffAbi(label, sdkAbi, solidity)
  allProblems.push(...problems)
  console.log(problems.length === 0 ? `✓ ${label} matches ${contract}` : `✗ ${label}: ${problems.length} drift(s)`)
}

if (allProblems.length > 0) {
  console.error(`\n${allProblems.length} ABI drift problem(s):`)
  for (const problem of allProblems) console.error(`  - ${problem}`)
  process.exit(1)
}
console.log(`\nall SDK ABIs match the Solidity at ${peripheryPath}`)
