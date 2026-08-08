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
//   3. VERIFY-BEFORE-PUBLISH (below). Curation is arithmetic over a file; it
//      cannot tell whether the file is describing the real chain. So a sample
//      of the curated pools is checked AGAINST THE CHAIN before anything is
//      written, and a single definitive negative fails the build.
//
// WHY VERIFICATION IS AFFORDABLE AT ALL: `src/internal/multicall.ts`. Every
// probe is one `aggregate3` inner call, 50 to a round trip and one rate-limit
// charge per round trip, so checking 200 pools is ~4 requests rather than 200.
// That is the only reason "probe every pool in every claimed pair scope" is a
// default and not a flag nobody turns on.
// ---------------------------------------------------------------------------

import { spawnSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  createPublicClient,
  decodeFunctionResult,
  encodeFunctionData,
  encodePacked,
  http,
  keccak256,
  pad,
  parseAbi,
  toHex,
  type Address,
  type Hex,
  type PublicClient,
} from 'viem'

import { cachePath } from '../cli/cache'
import {
  buildEnvelope,
  curate,
  PoolListError,
  poolInScope,
  serializeEnvelope,
  splitCoverageKey,
  type CoverageScope,
  type CurationStats,
} from '../cli/poolList'
import { redactKeyedUrl } from '../cli/redact'
import { parseSnapshot, type PoolIndexSnapshot } from '../src/experimental/index'
import { manifestFor, type ChainManifest, type PoolRecord } from '../src/index'
import { MULTICALL3_ADDRESS, aggregateCalls } from '../src/internal/multicall'

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
// EXISTENCE, NOT PRICE. The question is only "does this pool identity
// correspond to something real on this chain right now", because that is the
// one thing a curated list can get wrong in a way a consumer cannot notice: a
// pool that does not exist wastes a consumer's `eth_call` and then vanishes
// from their ranking (`isDiscredited`), but a list full of them is a list built
// from a corrupted or wrong-chain source, and that is worth failing a build
// over. Liquidity, price and quoteability are all deliberately out of scope —
// they change every block and a list makes no claim about them.
//
// THREE DIFFERENT ORACLES, one per protocol, each the most authoritative cheap
// one available:
//   v2/v3 — ask the FACTORY. `getPair`/`getPool` is the factory's own registry;
//           an address it returns is a pool it created, which is strictly
//           stronger than "there is code at that address".
//   v4    — ask the POOL MANAGER's storage. v4 pools are not contracts, so
//           there is no address to have code at; `extsload` of the pool's slot0
//           with a non-zero sqrtPriceX96 is the canonical "initialized" test
//           (the same one v4-core's own StateLibrary performs).
//
// A REVERT IS NOT A NEGATIVE. Only a DEFINITIVE answer (the factory naming a
// different address or the zero address; slot0 reading back zero) fails the
// build. A reverting or transport-failed probe is reported as unverifiable and
// tolerated: an endpoint that will not answer says nothing about the chain, and
// failing a nightly publish because a provider rate-limited it would train
// everyone to pass `--skip-verify`.
// ---------------------------------------------------------------------------

const V2_FACTORY_GETPAIR = parseAbi(['function getPair(address tokenA, address tokenB) view returns (address pair)'])
const V3_FACTORY_GETPOOL = parseAbi(['function getPool(address tokenA, address tokenB, uint24 fee) view returns (address pool)'])
/** v4-core's `Extsload`. `POOLS_SLOT` is 6 and slot0 is the state struct's first word — see StateLibrary. */
const V4_EXTSLOAD = parseAbi(['function extsload(bytes32 slot) view returns (bytes32 value)'])
const V4_POOLS_SLOT = 6n

type Probe = { rec: PoolRecord; call: { to: Address; data: Hex }; check: (data: Hex) => 'ok' | 'missing' }

function probesFor(rec: PoolRecord, manifest: ChainManifest): Probe | undefined {
  if (rec.pool.protocol === 'v2') {
    if (!manifest.v2) return undefined
    const want = rec.pool.address.toLowerCase()
    return {
      rec,
      call: {
        to: manifest.v2.factory,
        data: encodeFunctionData({ abi: V2_FACTORY_GETPAIR, functionName: 'getPair', args: [rec.pool.token0, rec.pool.token1] }),
      },
      check: (data) => (decodeAddress(V2_FACTORY_GETPAIR, 'getPair', data) === want ? 'ok' : 'missing'),
    }
  }
  if (rec.pool.protocol === 'v3') {
    if (!manifest.v3) return undefined
    const want = rec.pool.address.toLowerCase()
    const { token0, token1, fee } = rec.pool
    return {
      rec,
      call: {
        to: manifest.v3.factory,
        data: encodeFunctionData({ abi: V3_FACTORY_GETPOOL, functionName: 'getPool', args: [token0, token1, fee] }),
      },
      check: (data) => (decodeAddress(V3_FACTORY_GETPOOL, 'getPool', data) === want ? 'ok' : 'missing'),
    }
  }
  if (!manifest.v4) return undefined
  const slot = keccak256(encodePacked(['bytes32', 'bytes32'], [rec.pool.poolId, pad(toHex(V4_POOLS_SLOT), { size: 32 })]))
  return {
    rec,
    call: {
      to: manifest.v4.poolManager,
      data: encodeFunctionData({ abi: V4_EXTSLOAD, functionName: 'extsload', args: [slot] }),
    },
    // slot0 packs sqrtPriceX96 into the LOW 160 bits; zero there means the pool was never initialized.
    check: (data) => ((BigInt(data) & ((1n << 160n) - 1n)) !== 0n ? 'ok' : 'missing'),
  }
}

function decodeAddress(abi: typeof V2_FACTORY_GETPAIR | typeof V3_FACTORY_GETPOOL, fn: 'getPair' | 'getPool', data: Hex): string {
  // A call to an address with no code succeeds with `0x`, which decodes to nothing — treated as a
  // non-answer (never equal to the wanted address, hence 'missing'), which is the correct reading
  // for a factory address the manifest is wrong about.
  try {
    return (decodeFunctionResult({ abi, functionName: fn, data } as never) as string).toLowerCase()
  } catch {
    return ''
  }
}

/**
 * Picks which pools to probe: EVERY pool inside a claimed `pair:` scope (those are the scopes a
 * consumer will lean on hardest and they are small), plus a deterministic sample of the rest up to
 * `sample`. Deterministic — an evenly-spaced stride over insertion order rather than a random draw —
 * so two builds of the same source verify the same pools and a failure is reproducible.
 */
function selectProbeTargets(body: PoolIndexSnapshot, claimed: string[], sample: number, wrappedNative: Address): PoolRecord[] {
  const pairScopes = claimed
    .map(splitCoverageKey)
    .filter((s): s is CoverageScope => s !== undefined && s.scope.startsWith('pair:'))

  const chosen = new Map<string, PoolRecord>()
  for (const rec of body.pools) {
    if (pairScopes.some((s) => poolInScope(rec, s, wrappedNative))) chosen.set(rec.pool.id, rec)
  }
  const rest = body.pools.filter((rec) => !chosen.has(rec.pool.id))
  const take = Math.min(sample, rest.length)
  if (take > 0) {
    const stride = rest.length / take
    for (let i = 0; i < take; i++) chosen.set(rest[Math.floor(i * stride)]!.pool.id, rest[Math.floor(i * stride)]!)
  }
  return [...chosen.values()]
}

async function verifyLive(
  client: PublicClient,
  manifest: ChainManifest,
  targets: PoolRecord[],
): Promise<{ checked: number; unverifiable: number }> {
  if (targets.length === 0) return { checked: 0, unverifiable: 0 }
  const blockNumber = await client.getBlockNumber()
  const probes = targets.map((rec) => probesFor(rec, manifest)).filter((p): p is Probe => p !== undefined)
  const results = await aggregateCalls({
    client,
    multicall3: manifest.multicall3 ?? MULTICALL3_ADDRESS,
    calls: probes.map((p) => p.call),
    blockNumber,
  })

  const missing: string[] = []
  let unverifiable = 0
  results.forEach((result, i) => {
    const probe = probes[i]!
    if (result instanceof Error) {
      unverifiable++
      return
    }
    if (probe.check(result) === 'missing') missing.push(probe.rec.pool.id)
  })

  if (missing.length > 0) {
    throw new PoolListError(
      `verify-before-publish FAILED at block ${blockNumber}: ${missing.length}/${probes.length} probed pools do not exist on chain ` +
        `(e.g. ${missing.slice(0, 3).join(', ')}). The source snapshot describes a different chain, or is corrupt — not publishing.`,
    )
  }
  return { checked: probes.length - unverifiable, unverifiable }
}

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
    wrappedNative: manifest.wrappedNative,
    topPairs: args.topPairs,
    ...(args.maxPools !== undefined ? { maxPools: args.maxPools } : {}),
  })

  if (!args.skipVerify) {
    const client = createPublicClient({ transport: http(url, { batch: false, timeout: 60_000 }) }) as PublicClient
    const targets = selectProbeTargets(body, stats.claimedScopes, args.sample, manifest.wrappedNative)
    const { checked, unverifiable } = await verifyLive(client, manifest, targets)
    console.log(`[pool-list] verified ${checked} pools live${unverifiable > 0 ? ` (${unverifiable} unverifiable — endpoint did not answer)` : ''}`)
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
