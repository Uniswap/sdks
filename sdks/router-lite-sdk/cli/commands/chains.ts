// ---------------------------------------------------------------------------
// `rl chains` — the built-in manifest table: what this CLI can route.
//
// Offline by design (no RPC, no child processes): endpoint management lives
// OUTSIDE this tool — pair any row with `chainz exec <id> --` (or a plain
// `ETH_RPC_URL=…`) and the chain is detected from the endpoint at run time.
// ---------------------------------------------------------------------------

import { manifestFor, PROTOCOLS } from '../../src/index'
import { bold, dim, green, yellow } from '../ansi'
import { parseArgs } from '../args'
import { BUILTIN_CHAINS } from '../chains'
import { jsonify } from '../report'

const CHAINS_FLAGS = { json: { kind: 'boolean' as const } }

export function cmdChains(argv: string[]): number {
  const parsed = parseArgs(argv, CHAINS_FLAGS)

  const rows = BUILTIN_CHAINS.map((builtin) => {
    const manifest = manifestFor(builtin.chainId)
    const protocols = PROTOCOLS.filter((p) => manifest[p] !== undefined)
    return {
      name: builtin.name,
      chainId: builtin.chainId,
      protocols,
      swaps: builtin.swaps,
      blockTimeSeconds: manifest.chain?.blockTimeSeconds,
    }
  })

  if (parsed.booleans.has('json')) {
    console.log(jsonify({ builtin: rows }))
    return 0
  }

  console.log(bold('built-in manifests') + dim(' — the chain is detected from the connected RPC (eth_chainId)'))
  for (const row of rows) {
    const swaps = row.swaps ? green('quote+swap') : yellow('quote-only')
    const blockTime = row.blockTimeSeconds !== undefined ? `${row.blockTimeSeconds}s blocks` : ''
    console.log(
      `  ${bold(row.name.padEnd(16))} ${String(row.chainId).padStart(6)}  ${row.protocols.join('/')}  ${swaps}  ${dim(blockTime)}`,
    )
  }
  console.log('')
  console.log(dim('endpoints come from --rpc or $ETH_RPC_URL, e.g.: chainz exec 8453 -- bun cli/rl.ts quote eth usdc 1'))
  console.log(dim('other chains are routable via the SDK with manifestFor overrides, not through this CLI'))
  return 0
}
