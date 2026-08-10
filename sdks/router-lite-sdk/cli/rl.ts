#!/usr/bin/env bun
// ---------------------------------------------------------------------------
// rl — the local-testing CLI for @uniswap/router-lite-sdk.
//
// Design decisions, in order of importance:
//
//  - SOURCE, NOT DIST. Everything imports `../src` directly (bun transpiles
//    in place), so what runs is always the working tree's current code —
//    never a stale build. That is the whole point of a local-testing tool,
//    and it is why this CLI lives as a private nested workspace beside
//    `integration/` and `canary/` rather than shipping in the package.
//
//  - PARAMETERS IN, NOTHING ELSE. This tool spawns no child processes and
//    reads no machine config: the endpoint arrives as `--rpc <url>` or
//    `$ETH_RPC_URL` (exactly what `chainz exec <chain> --` exports — compose
//    with chainz, don't integrate it), and the chain identifies itself via
//    `eth_chainId` against that endpoint. `--chain <id>` is an assertion
//    cross-checked against that answer, never a selector.
//
//  - KEYED URLS AND RPC HEADER VALUES NEVER PRINT. The endpoint routinely
//    carries a vendor key, and viem embeds the full URL in its error text;
//    `--rpc-header`/$ETH_RPC_HEADERS (see `rpcHeaders.ts`) hand this CLI
//    header credentials the same way. Every error path below is scrubbed
//    with `redact` (`redact.ts` — keyed-URL rule plus a registered-header-
//    value scrub) before it reaches a terminal.
//
//  - EXPECTED FAILURES ARE ONE-LINERS. `RouterConfigError` /
//    `UnsupportedRouteError` / usage mistakes render as a single friendly
//    line and exit 3; a stack trace is reserved for genuine bugs (exit 4).
//    Business outcomes are never errors at all — they are results, and they
//    drive the scripting-facing exit codes:
//        0  actionable (quote / ready / needs-action)
//        1  no-route
//        2  inconclusive — including an `RpcError`: the endpoint could not
//           answer a read the command needed (429/timeout/dead socket), which
//           is not a usage mistake and must not be reported as one
//        3  usage or configuration error
//        4  unexpected internal error
//        5  --simulate DISPROVED the tx (a call in the proof chain reverted,
//           or delivery landed below the tx's own minAmountOut)
//
//    `--pool-list` IS THE ONE DELIBERATE EXCEPTION TO "4 MEANS A BUG". A list
//    that fails its integrity/chain/manifest checks exits 4 with a single clean
//    line and no stack. It is not 3, because the flag was used correctly — the
//    user named a list and meant it, and telling them to fix their arguments
//    would be wrong advice; and it is emphatically not 0-with-a-warning,
//    because a run that quietly proceeded without the list would print a
//    perfectly ordinary-looking quote computed from a different index than the
//    operator asked for. 4 is the code a script must never treat as "carry on".
// ---------------------------------------------------------------------------

import { RouterConfigError, UnsupportedRouteError } from '../src/index'

import { AmountError } from './amounts'
import { bold, dim, red, setColorEnabled } from './ansi'
import { UsageError } from './args'
import { flushCacheSave } from './cache'
import { cmdChains } from './commands/chains'
import { cmdDiscover } from './commands/discover'
import { cmdQuote } from './commands/quote'
import { cmdSwap } from './commands/swap'
import { PoolListError } from './poolList'
import { redact } from './redact'
import { RpcError } from './tokens'


const USAGE = `${bold('rl')} — local-testing CLI for @uniswap/router-lite-sdk

${bold('usage')}
  rl quote <tokenIn> <tokenOut> <amount> [options]     price a trade
  rl swap  <tokenIn> <tokenOut> <amount> --trader 0x…  build executable calldata
  rl discover <token> [--via <token>]                  what pools the SDK sees for a token
  rl chains                                            built-in manifest table (offline)

${bold('tokens')}    eth | native | 0xADDRESS | a core-intermediate symbol (usdc, weth, …)
${bold('amounts')}   human units ('1.5', decimals-aware) or raw ('2500000wei')

${bold('endpoint')}  --rpc <url>, else $ETH_RPC_URL — exactly what \`chainz exec <chain> --\` exports.
${bold('chain')}     detected from the endpoint via eth_chainId; \`rl chains\` lists the built-in manifests.

${bold('common options')}
  --chain, -c <id>        ASSERT the chain id — errors if the endpoint serves a different chain
  --rpc <url>             endpoint (overrides $ETH_RPC_URL; never printed)
  --rpc-header <spec>     repeatable — an extra header for the RPC transport, 'Name: value' (the
                          same foundry format $ETH_RPC_HEADERS carries, which chainz exec/shell
                          export automatically). Explicit flags override an env pair of the same
                          name (case-insensitive). Values are credentials: never printed, never
                          cached, scrubbed out of any error text that echoes one back.
  --budget, -b <dur>      best-effort budget for the SEARCH (unit required: 900ms, 10s, 2m) — an
                          AbortSignal the search honors between waves; transport timeouts/retries
                          derive from it. The clock starts when the search does: chain detection,
                          the cache load and token metadata are NOT charged to it.
  --concurrency <n>       max in-flight RPC requests, 1-1024 (SDK default: 20). Raise it for an
                          endpoint with connection headroom — 40 measurably beat 20 on a keyed
                          mainnet endpoint; lower it against a shared or rate-limited quota.
  --hint <spec>           assert a pool for the pair: v2 | v3@500 | v4@3000/60[/0xHooks][:0xHookData]
  --addresses             restore inline pool addresses on every route line (best and alternatives
                          alike) instead of the default compact notation (\`v3 0.01%\`) with the
                          leading route's own address demoted to a dim line underneath.
  --watch, -w             stream the "how it went" timeline live, to the end of the bounded search,
                          instead of only printing it once at the end.
  --verbose, -v           stream the timeline live, stop at the first actionable result
  --json                  machine output (NDJSON per wave with --watch)
  --no-cache              skip the on-disk pool index (~/.cache/router-lite/<chainId>.json).
                          It is ON by default: a warm second run re-scans only the block delta,
                          never the history. --verbose reports what it loaded and saved.
  --pool-list <path|url>  load a published pool list (a path, or an https:// URL) and MERGE it into
                          this run's index alongside the cache. Its integrity hash, chain id,
                          wrapped native and factory fingerprint are checked against the resolved
                          manifest; any mismatch exits 4 rather than running without it. POOLS ARE
                          IMPORTED, COVERAGE IS NOT — see --trust-coverage.
  --trust-coverage        also import the list's SCAN COVERAGE: its claim that particular block
                          ranges have already been fully scanned for pool-creation events. This
                          makes the search SKIP those ranges, so a list that claims a range it did
                          not really scan permanently hides every pool created in it — with no
                          symptom beyond a worse route. AND IT OUTLIVES THIS FLAG: adopted coverage
                          is written into your local cache on exit, so every later run reuses it
                          whether or not you pass --trust-coverage again (delete the file named by
                          the cache line, or run --no-cache, to be rid of it). Pass this only for a
                          list you would trust with your own cache directory. Without it a list is
                          still a large win: the pools arrive, and the ranges are simply re-scanned.

${bold('swap options')}
  --trader, -t 0x…        required — the account the tx is encoded for
  --recipient 0x…         output recipient (default: trader)
  --slippage-bps <n>      slippage tolerance (SDK default: 100)
  --deadline-secs <n>     deadline from the pinned block timestamp (SDK default: 300)
  --simulate, -s          prove the tx via eth_simulateV1 — no keys, no funds

${bold('examples')} (rl = \`bun cli/rl.ts\` from the package dir)
  chainz exec 1 -- rl quote eth usdc 1                  # headers flow automatically from chainz
  chainz exec base -- rl quote eth usdc 1 --watch
  ETH_RPC_URL=… rl quote 0x6B17…71d0F usdc 250 --budget 5s --hint v3@500
  ETH_RPC_URL=… rl quote eth usdc 1 --rpc-header "X-Api-Key: secret"  # header-authed endpoint, no chainz
  chainz exec 1 -- rl swap eth usdc 0.5 --trader 0x1111111111111111111111111111111111111111 --simulate
  chainz exec 130 -- rl discover 0xTOKEN --chain 130

${bold('exit codes')}   0 actionable · 1 no-route · 2 inconclusive (incl. rpc unavailable) · 3 usage/config · 4 internal (or a rejected --pool-list) · 5 simulation disproved`

async function dispatch(command: string | undefined, rest: string[]): Promise<number> {
  switch (command) {
    case 'quote':
      return cmdQuote(rest)
    case 'swap':
      return cmdSwap(rest)
    case 'discover':
      return cmdDiscover(rest)
    case 'chains':
      return cmdChains(rest)
    case undefined:
    case 'help':
    case '--help':
    case '-h':
      console.log(USAGE)
      return command === undefined ? 3 : 0
    default:
      throw new UsageError(`unknown command '${command}' — run \`rl help\``)
  }
}

async function main(): Promise<number> {
  const [command, ...rest] = process.argv.slice(2)
  // `--json` anywhere disables color so machine output is never ANSI-polluted, even when piped
  // through a pty; human output keeps the TTY/NO_COLOR default from `ansi.ts`.
  if (rest.includes('--json')) setColorEnabled(false)
  try {
    return await dispatch(command, rest)
  } catch (err) {
    if (err instanceof UsageError || err instanceof AmountError) {
      console.error(`${red('error:')} ${redact(err.message)}`)
      console.error(dim('run `rl help` for usage'))
      return 3
    }
    // Exit 2, not 3: the endpoint failed to answer, which says nothing about the arguments. A script
    // that treats 3 as "fix your input" and 2 as "try again" must not be told to fix a correct
    // address because the provider rate-limited a `decimals()` read.
    if (err instanceof RpcError) {
      console.error(`${red('rpc error:')} ${redact(err.message)}`)
      return 2
    }
    // A rejected `--pool-list`: exit 4 (see the exit-code block in this file's header for why), but
    // as a one-liner — the failure is fully diagnosed in the message and a stack would only bury it.
    if (err instanceof PoolListError) {
      console.error(`${red('pool-list error:')} ${redact(err.message)}`)
      return 4
    }
    if (err instanceof RouterConfigError || err instanceof UnsupportedRouteError) {
      console.error(`${red('config error:')} ${redact(err.message)}`)
      return 3
    }
    const message = err instanceof Error ? (err.stack ?? err.message) : String(err)
    console.error(red('unexpected error:'))
    console.error(redact(message))
    return 4
  } finally {
    // The on-disk pool index (P2), written on EVERY exit path including the error ones: a search that
    // died partway still learned real, block-ranged coverage, and discarding it would make exactly
    // the runs that are already going badly permanently slow. `flushCacheSave` never throws, so this
    // cannot change the exit code a branch above already decided on.
    //
    // The `--budget` clock is NOT cancelled here, and no longer can be: its ref'd timer (see
    // `commands/context.ts#startBudget`) belongs to the command that started it, which clears it in
    // its own `finally` — a lifetime a scope can express, rather than a module-level handle this
    // file reaches across to clear.
    await flushCacheSave()
  }
}

// ---------------------------------------------------------------------------
// Ctrl-C banks the cache too.
//
// A default-terminating SIGINT never unwinds the stack, so `main`'s `finally`
// never runs and everything the interrupted run learned is discarded. That is
// not an edge case here: interrupting is the single most common way a long
// `discover` ends (the output has scrolled, the answer is visible, the search
// is still draining), and it was precisely the run with the most coverage to
// bank. The handler makes the exit deliberate instead: flush, then exit with
// 128+signo, which is what a shell expects from a signalled process.
//
// SIGTERM gets the same treatment for the same reason — a `timeout 30s rl …`
// or a killed CI step should not be uniquely punished by losing its progress.
// ---------------------------------------------------------------------------
for (const [signal, signo] of [
  ['SIGINT', 2],
  ['SIGTERM', 15],
] as const) {
  process.on(signal, () => {
    void (async (): Promise<void> => {
      // `flushCacheSave` clears its own registration, so the `finally` in `main` — if it ever gets to
      // run — is a no-op rather than a second write, and the save itself never throws. A pending
      // budget timer needs no attention on this path: `process.exit` does not wait for the loop to
      // drain, so nothing it holds open can delay the exit.
      await flushCacheSave()
      process.exit(128 + signo)
    })()
  })
}

process.exitCode = await main()
