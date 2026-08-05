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
//  - KEYED URLS NEVER PRINT. RPC endpoints come from the user's `chainz`
//    config (or `--rpc`) and routinely carry vendor keys; they are resolved
//    process-to-process (`chains.ts`) and every error path below is scrubbed
//    with `redactKeyedUrl` before it reaches a terminal — viem embeds the
//    full URL in its error text, so redaction has to sit at this choke point.
//
//  - EXPECTED FAILURES ARE ONE-LINERS. `RouterConfigError` /
//    `UnsupportedRouteError` / usage mistakes render as a single friendly
//    line and exit 3; a stack trace is reserved for genuine bugs (exit 4).
//    Business outcomes are never errors at all — they are results, and they
//    drive the scripting-facing exit codes:
//        0  actionable (quote / ready / needs-action)
//        1  no-route
//        2  inconclusive
//        3  usage or configuration error
//        4  unexpected internal error
//        5  --simulate DISPROVED the tx (a call in the proof chain reverted,
//           or delivery landed below the tx's own minAmountOut)
// ---------------------------------------------------------------------------

import { RouterConfigError, UnsupportedRouteError } from '../src/index'

import { AmountError } from './amounts'
import { bold, dim, red, setColorEnabled } from './ansi'
import { UsageError } from './args'
import { cmdChains } from './commands/chains'
import { cmdDiscover } from './commands/discover'
import { cmdQuote } from './commands/quote'
import { cmdSwap } from './commands/swap'
import { redactKeyedUrl } from './redact'


const USAGE = `${bold('rl')} — local-testing CLI for @uniswap/router-lite-sdk

${bold('usage')}
  rl quote <tokenIn> <tokenOut> <amount> [options]     price a trade
  rl swap  <tokenIn> <tokenOut> <amount> --trader 0x…  build executable calldata
  rl discover <token> [--via <token>]                  what pools the SDK sees for a token
  rl chains                                            built-in manifests × chainz endpoints

${bold('tokens')}    eth | native | 0xADDRESS | a core-intermediate symbol (usdc, weth, …)
${bold('amounts')}   human units ('1.5', decimals-aware) or raw ('2500000wei')

${bold('common options')}
  --chain, -c <id|name>   chain (default: mainnet); rl chains lists them
  --rpc <url>             endpoint override (default: resolved from chainz — never printed)
  --budget, -b <dur>      best-effort budget (unit required: 900ms, 10s, 2m) — an AbortSignal the
                          search honors between waves; transport timeouts/retries derive from it
  --hint <spec>           assert a pool for the pair: v2 | v3@500 | v4@3000/60[/0xHooks][:0xHookData]
  --watch, -w             stream every search wave to the end of the bounded search
  --verbose, -v           stream waves, stop at the first actionable result
  --json                  machine output (NDJSON per wave with --watch)

${bold('swap options')}
  --trader, -t 0x…        required — the account the tx is encoded for
  --recipient 0x…         output recipient (default: trader)
  --slippage-bps <n>      slippage tolerance (SDK default: 100)
  --deadline-secs <n>     deadline from the pinned block timestamp (SDK default: 300)
  --simulate, -s          prove the tx via eth_simulateV1 — no keys, no funds

${bold('examples')}
  rl quote eth usdc 1
  rl quote eth usdc 1 --chain base --watch
  rl quote 0x6B17…71d0F usdc 250 --budget 5s --hint v3@500
  rl swap eth usdc 0.5 --trader 0x1111111111111111111111111111111111111111 --simulate
  rl discover 0xTOKEN --chain unichain

${bold('exit codes')}   0 actionable · 1 no-route · 2 inconclusive · 3 usage/config · 4 internal · 5 simulation disproved`

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
      console.error(`${red('error:')} ${redactKeyedUrl(err.message)}`)
      console.error(dim('run `rl help` for usage'))
      return 3
    }
    if (err instanceof RouterConfigError || err instanceof UnsupportedRouteError) {
      console.error(`${red('config error:')} ${redactKeyedUrl(err.message)}`)
      return 3
    }
    const message = err instanceof Error ? (err.stack ?? err.message) : String(err)
    console.error(red('unexpected error:'))
    console.error(redactKeyedUrl(message))
    return 4
  }
}

process.exitCode = await main()
