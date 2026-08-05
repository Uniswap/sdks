// ---------------------------------------------------------------------------
// `rl chains` — what can this CLI route, and where can it connect?
//
// Cross-references the SDK's built-in manifests (what is routable) with the
// user's chainz configuration (what this machine has endpoints for), so "why
// won't --chain X work" is answerable at a glance. No RPC calls — this
// command must work offline.
// ---------------------------------------------------------------------------

import { manifestFor } from '../../src/index'
// `PROTOCOLS` (the value) is not on the public surface — only the `Protocol` type is.
import { PROTOCOLS } from '../../src/types'
import { bold, dim, green, yellow } from '../ansi'
import { parseArgs } from '../args'
import { BUILTIN_CHAINS, chainzChains } from '../chains'
import { jsonify } from '../report'

const CHAINS_FLAGS = { json: { kind: 'boolean' as const } }

export function cmdChains(argv: string[]): number {
  const parsed = parseArgs(argv, CHAINS_FLAGS)
  const chainz = chainzChains()
  const chainzById = new Map(chainz.map((c) => [c.chainId, c]))

  const rows = BUILTIN_CHAINS.map((builtin) => {
    const manifest = manifestFor(builtin.chainId)
    const protocols = PROTOCOLS.filter((p) => manifest[p] !== undefined)
    return {
      name: builtin.name,
      alias: builtin.aliases[0]!,
      chainId: builtin.chainId,
      protocols,
      swaps: builtin.swaps,
      blockTimeSeconds: manifest.chain?.blockTimeSeconds,
      chainzEndpoint: chainzById.has(builtin.chainId),
    }
  })

  if (parsed.booleans.has('json')) {
    const extras = chainz.filter((c) => !BUILTIN_CHAINS.some((b) => b.chainId === c.chainId))
    console.log(jsonify({ builtin: rows, chainzOnly: extras.map((c) => ({ name: c.name, chainId: c.chainId })) }))
    return 0
  }

  console.log(bold('built-in manifests') + dim(' — usable as --chain <alias|id>'))
  for (const row of rows) {
    const swaps = row.swaps ? green('quote+swap') : yellow('quote-only')
    const endpoint = row.chainzEndpoint ? green('chainz ✔') : yellow('no chainz endpoint — needs --rpc')
    const blockTime = row.blockTimeSeconds !== undefined ? `${row.blockTimeSeconds}s blocks` : ''
    console.log(
      `  ${bold(row.alias.padEnd(10))} ${String(row.chainId).padStart(6)}  ${row.protocols.join('/')}  ${swaps}  ${dim(blockTime)}  ${endpoint}`,
    )
  }

  const extras = chainz.filter((c) => !BUILTIN_CHAINS.some((b) => b.chainId === c.chainId))
  if (extras.length > 0) {
    console.log('')
    console.log(dim(`chainz also has endpoints for ${extras.length} chains with no built-in manifest:`))
    console.log(dim(`  ${extras.map((c) => `${c.name} (${c.chainId})`).join(', ')}`))
    console.log(dim('  (routable via the SDK with manifestFor overrides; not through this CLI)'))
  }
  return 0
}
