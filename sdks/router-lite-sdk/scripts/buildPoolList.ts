#!/usr/bin/env bun
/* eslint-disable no-console */
// ---------------------------------------------------------------------------
// Builds ONE chain's publishable pool list from a warm `rl` cache.
//
// Usage (ALWAYS through `chainz exec`, so the keyed RPC URL never reaches a
// shell history or this script's output — it is read from $ETH_RPC_URL and
// never printed, logged, or written into the list):
//
//   # from whatever the CLI's cache already holds for this chain
//   chainz exec 1 -- bun scripts/buildPoolList.ts
//
//   # warm the cache first, then curate (drives `rl discover` per token)
//   chainz exec 1 -- bun scripts/buildPoolList.ts --warm usdc,weth --warm-budget 90s
//
//   # from an explicit snapshot file, with a size ceiling
//   chainz exec 8453 -- bun scripts/buildPoolList.ts --from /tmp/8453.json --max-pools 200000
//
// THE THREE STAGES, AND WHY EACH IS SEPARATE:
//
//   1. SOURCE. A `PoolIndexSnapshot` — the same bytes `cli/cache.ts` writes.
//      This script never scans anything itself: warming is delegated to `rl
//      discover`, which is the tool that already knows how to bound a search,
//      bank partial coverage on interrupt, and keep a keyed URL out of its
//      output. A publisher that re-implemented discovery would be a second
//      scanner to keep in step with the first.
//   2. CURATION (`cli/poolList.ts#curate`, pure and unit-tested). Chooses the
//      SCOPES to claim and derives the pool set from them — never the reverse.
//      See that file for why the reverse is the bug this whole design exists to
//      prevent, and for the assertion that fails this build if curation ever
//      drifts.
//   3. VERIFY-BEFORE-PUBLISH (`cli/poolList.ts#verifyLive`, driven below).
//      Curation is arithmetic over a file; it cannot tell whether the file is
//      describing the real chain. So a sample of the curated pools is checked
//      AGAINST THE CHAIN before anything is written, and a single definitive
//      negative — or a run that answered nothing at all — fails the build.
// ---------------------------------------------------------------------------

import { spawnSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { createPublicClient, http, type Address, type PublicClient } from 'viem'

import { cachePath } from '../cli/cache'
import {
  buildEnvelope,
  curate,
  probeMulticall3,
  selectProbeTargets,
  serializeEnvelope,
  verifyLive,
  PoolListError,
  type CurationStats,
} from '../cli/poolList'
import { redactKeyedUrl } from '../cli/redact'
import { parseSnapshot, type PoolIndexSnapshot } from '../src/experimental/index'
import { manifestFor } from '../src/index'

const PKG_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const OUT_DIR = join(PKG_ROOT, 'pool-lists')

/** How many pools to probe live when a claimed scope is an ADJACENCY scope (potentially millions). */
const SAMPLE_POOLS = 200

type Args = {
  chain?: number
  from?: string
  out?: string
  warm: string[]
  warmBudget: string
  topPairs: number
  maxPools?: number
  sample: number
  skipVerify: boolean
}

function parseArgs(argv: string[]): Args {
  const args: Args = { warm: [], warmBudget: '120s', topPairs: 25, sample: SAMPLE_POOLS, skipVerify: false }
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i]!
    const next = (): string => {
      const v = argv[++i]
      if (v === undefined) throw new Error(`missing value for ${flag}`)
      return v
    }
    switch (flag) {
      case '--chain':
        args.chain = Number(next())
        break
      case '--from':
        args.from = next()
        break
      case '--out':
        args.out = next()
        break
      case '--warm':
        args.warm.push(...next().split(',').map((t) => t.trim()).filter(Boolean))
        break
      case '--warm-budget':
        args.warmBudget = next()
        break
      case '--top-pairs':
        args.topPairs = Number(next())
        break
      case '--max-pools':
        args.maxPools = Number(next())
        break
      case '--sample':
        args.sample = Number(next())
        break
      case '--skip-verify':
        // For a chain with no reachable endpoint, or a rebuild of a list whose pools were verified
        // minutes ago. It is a FLAG and not a default because an unverified list is exactly the
        // thing this script exists to not produce.
        args.skipVerify = true
        break
      default:
        throw new Error(`unknown flag ${flag}`)
    }
  }
  return args
}

function rpcUrl(): string {
  const url = process.env.ETH_RPC_URL ?? process.env.RPC_URL
  if (!url) throw new Error('no RPC URL: run through `chainz exec <chain> -- bun scripts/buildPoolList.ts` (or set ETH_RPC_URL)')
  return url
}

/** Drives `rl discover <token>` once per `--warm` token so the cache this script reads is warm. */
function warmCache(tokens: string[], budget: string): void {
  for (const token of tokens) {
    console.log(`[pool-list] warming: rl discover ${token} --budget ${budget}`)
    const proc = spawnSync('bun', [join(PKG_ROOT, 'cli', 'rl.ts'), 'discover', token, '--budget', budget], {
      stdio: 'inherit',
      cwd: PKG_ROOT,
      // The endpoint is inherited from the environment `chainz exec` set up; it is never passed on a
      // command line, where it would land in a process listing.
      env: process.env,
    })
    if (proc.status !== 0) console.warn(`[pool-list] discover ${token} exited ${proc.status} — continuing with whatever it banked`)
  }
}

// ---------------------------------------------------------------------------
// Verify-before-publish.
//
// THE DECISIONS LIVE IN `cli/poolList.ts` (which oracle per protocol, which
// pools to probe, what counts as a definitive negative, and why a run that
// verified NOTHING is a build failure rather than a quiet success) — this file
// only supplies the client and the block. That split is not tidiness: `cli/` is
// inside `bun test src cli`, and `scripts/` is not, so verification logic left
// here is logic no gate ever runs.
//
// WHY VERIFICATION IS AFFORDABLE AT ALL: `src/internal/multicall.ts`. Every
// probe is one `aggregate3` inner call, 50 to a round trip and one rate-limit
// charge per round trip, so checking 200 pools is ~4 requests rather than 200.
// That is the only reason "probe every pool in every claimed pair scope" is a
// default and not a flag nobody turns on — and it is why the Multicall3
// deployment is PROBED (`eth_getCode`) rather than assumed: on a chain without
// one, an unprobed `aggregate3` "succeeds" with `0x`, every probe comes back
// unverifiable, and the build publishes an unverified list. `verifyLive` falls
// back to per-call `eth_call`s there instead.
// ---------------------------------------------------------------------------

function report(stats: CurationStats, asOfBlock: string, bytes: number, out: string): void {
  console.log('[pool-list] curation:')
  console.log(`  pools      ${stats.keptPools} kept / ${stats.droppedPools} dropped (source: ${stats.sourcePools})`)
  console.log(`  scopes     ${stats.claimedScopes.length} claimed / ${stats.sourceScopes - stats.claimedScopes.length} dropped`)
  if (stats.scopesDroppedForSize.length > 0) console.log(`  size-drops ${stats.scopesDroppedForSize.join(', ')}`)
  if (stats.hintsDowngraded > 0) console.log(`  hints      ${stats.hintsDowngraded} downgraded to 'factory' provenance`)
  for (const key of stats.claimedScopes) console.log(`  claim      ${key}`)
  console.log(`[pool-list] wrote ${out} — ${(bytes / 1_000_000).toFixed(2)} MB, as of block ${asOfBlock}`)
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2))
  const url = rpcUrl()

  // The chain identifies ITSELF from the endpoint (the same rule `cli/chains.ts` documents);
  // `--chain` is an assertion cross-checked against it, never a selector.
  const probe = createPublicClient({ transport: http(url, { timeout: 30_000, retryCount: 0 }) }) as PublicClient
  const chainId = await probe.getChainId()
  if (args.chain !== undefined && args.chain !== chainId) {
    throw new Error(`--chain ${args.chain} asserted, but the endpoint serves chain ${chainId}`)
  }
  const manifest = manifestFor(chainId)

  if (args.warm.length > 0) warmCache(args.warm, args.warmBudget)

  const sourcePath = args.from ?? cachePath(chainId)
  console.log(`[pool-list] source: ${sourcePath}`)
  const source: PoolIndexSnapshot = parseSnapshot(readFileSync(sourcePath, 'utf8'))

  const { body, stats } = curate(source, {
    coreIntermediates: manifest.coreIntermediates ?? [manifest.wrappedNative],
    factories: [manifest.v2?.factory, manifest.v3?.factory, manifest.v4?.poolManager].filter((a): a is Address => a !== undefined),
    wrappedNative: manifest.wrappedNative,
    topPairs: args.topPairs,
    ...(args.maxPools !== undefined ? { maxPools: args.maxPools } : {}),
  })

  if (!args.skipVerify) {
    const client = createPublicClient({ transport: http(url, { batch: false, timeout: 60_000 }) }) as PublicClient
    const targets = selectProbeTargets(body, stats.claimedScopes, args.sample, manifest.wrappedNative)
    // The `eth_getCode` probe FIRST, and the block number only after it: on a chain with no
    // Multicall3 the aggregated path is silently vacuous (see the section header), so which dispatch
    // to use is decided before anything is asked about pools.
    const multicall3: Address | null = await probeMulticall3(client, manifest)
    const blockNumber = await client.getBlockNumber()
    const { checked, unverifiable, aggregated } = await verifyLive({ client, manifest, targets, blockNumber, multicall3 })
    console.log(
      `[pool-list] verified ${checked} pools live at block ${blockNumber} via ${aggregated ? 'aggregate3' : 'per-call eth_call (no Multicall3 on this chain)'}` +
        `${unverifiable > 0 ? ` — ${unverifiable} unverifiable (endpoint did not answer)` : ''}`,
    )
  } else {
    console.warn('[pool-list] --skip-verify: publishing WITHOUT a live existence check')
  }

  const envelope = buildEnvelope({ chainId, manifest, body })
  const text = serializeEnvelope(envelope)
  const out = args.out ?? join(OUT_DIR, `${chainId}.poollist.json`)
  mkdirSync(dirname(resolve(out)), { recursive: true })
  writeFileSync(out, text, 'utf8')
  report(stats, envelope.asOfBlock, Buffer.byteLength(text), out)
}

try {
  await main()
} catch (err) {
  // Redacted like every other path in this package: viem embeds the keyed URL in its error text.
  console.error(redactKeyedUrl(err instanceof Error ? (err instanceof PoolListError ? err.message : (err.stack ?? err.message)) : String(err)))
  process.exit(1)
}
