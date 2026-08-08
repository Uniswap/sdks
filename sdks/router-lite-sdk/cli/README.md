# rl — local-testing CLI for `@uniswap/router-lite-sdk`

A terminal front-end for poking the router against live chains while developing it. Runs the SDK
**straight from `src/`** via bun (no build step — what you edit is what runs) and renders the
SDK's `SearchReport` diagnostics as a readable panel instead of raw JSON.

The CLI takes parameters and nothing else — no child processes, no config discovery. The endpoint
arrives as `--rpc <url>` or `$ETH_RPC_URL` (exactly what `chainz exec <chain> --` exports, so
chainz composes from the *outside*), and the chain identifies itself via `eth_chainId` against
that endpoint. Keyed RPC URLs are never printed — errors are scrubbed through the same redaction
rule the canary suite uses.

## 30-second tour

```bash
cd sdks/router-lite-sdk

# Which chains have built-in manifests? (offline — no endpoint needed)
bun cli/rl.ts chains

# Price a trade on mainnet — chainz provides the endpoint, the CLI detects the chain from it
chainz exec 1 -- bun cli/rl.ts quote eth usdc 1

# Or supply the endpoint yourself; both forms are equivalent
ETH_RPC_URL=https://… bun cli/rl.ts quote eth usdc 1
bun cli/rl.ts quote eth usdc 1 --rpc https://…

# Watch the bounded search improve wave by wave on Base, capped at 20s
chainz exec base -- bun cli/rl.ts quote eth usdc 1 --watch --budget 20s

# Assert a pool the search can't see yet (v2 | v3@fee | v4@fee/tickSpacing[/hooks][:hookData])
chainz exec 1 -- bun cli/rl.ts quote 0xTOKEN eth 1000 --hint v3@500 --verbose

# Build executable Universal Router calldata, then PROVE it with eth_simulateV1 (no keys, no funds)
chainz exec 1 -- bun cli/rl.ts swap eth usdc 0.5 --trader 0x1111111111111111111111111111111111111111 --simulate

# What pools does the SDK actually see for a token? (provenance, quote history, discredited hints)
chainz exec 1 -- bun cli/rl.ts discover usdc --budget 25s
chainz exec 130 -- bun cli/rl.ts discover 0xNEWTOKEN

# Guard against pointing at the wrong endpoint: --chain <id> is an assertion, not a selector
chainz exec base -- bun cli/rl.ts quote eth usdc 1 --chain 8453

# Everything takes --json for scripting; --watch emits NDJSON per wave
chainz exec 1 -- bun cli/rl.ts quote eth usdc 1 --json | jq .best.quote.amountOut
```

From the package root, `bun run cli -- quote eth usdc 1` works too, and `bun link` in `cli/`
puts `rl` on your PATH.

## Exit codes

Scripting contract: `0` actionable (quote / ready / needs-action) · `1` no-route ·
`2` inconclusive · `3` usage or configuration error · `4` unexpected internal error ·
`5` `--simulate` disproved the tx (a call in the proof chain reverted, or delivery landed below
the tx's own `minAmountOut`) — distinct from `2` because the chain gave a verdict.

## Notes

- **Chains**: the chain is **detected** from the connected endpoint (`eth_chainId`) and mapped to
  one of the five built-in manifests (`rl chains` lists them; all five swap — Robinhood Chain via
  the `ur-2.1` command set, exactly as the SDK ships it). `--chain <id>` never selects anything —
  it *asserts*, erroring
  when the endpoint serves a different chain (the wrong-`$ETH_RPC_URL` guard). Chains without a
  built-in manifest need SDK-level `manifestFor` overrides and are out of scope here.
- **Tokens**: symbols resolve against the manifest's own `coreIntermediates` by on-chain `symbol()`
  — no hardcoded token list, so `usdc` means USDC on mainnet and errors (naming what would work) on
  a chain that has none. Anything else takes an address.
- **Amounts** are human units scaled by the token's on-chain decimals (`1.5`), or raw with a
  suffix (`2500000wei`). An amount with more fractional digits than the token has decimals is an
  error, not a silent truncation — `0.0000001` of a 6-decimals token is rejected rather than
  quoted as zero (or as a different number than you typed).
- **`--budget`** (unit required: `900ms`, `10s`, `2m`) is a **best-effort** budget, not a hard
  wall-clock cap: it becomes an `AbortSignal` the SDK honors *between* search waves, and the
  transport's own per-request timeout and retries are derived from it (requests capped at the
  budget, no retries) so a stalled endpoint can't pin a wave far past it. A single in-flight
  request can still overrun a very tight budget by up to that capped timeout. Without a budget the
  search is bounded in *work*, not in seconds — a throttled endpoint can take a long time.
- **`--verbose` vs `--watch`**: both stream a line per search wave; `--verbose` stops at the first
  actionable result (what `getQuote`/`getSwap` would return), `--watch` drains the whole bounded
  search (what the `quotes()`/`swaps()` iterators expose).

## Tests

`bun test` in this directory covers the pure parts: flag/amount/hint/duration parsing, chainz list
parsing and chain matching, URL redaction, `eth_simulateV1` payload construction/evaluation, and a
snapshot of the search-report renderer against a canned `SearchReport`. Nothing here touches the
network — the CLI itself is the live tool. `bun run typecheck:cli` (or `typecheck:all`) from the
package root typechecks it; `bun run lint` lints `src` and `cli` together.
