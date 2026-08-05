# rl — local-testing CLI for `@uniswap/router-lite-sdk`

A terminal front-end for poking the router against live chains while developing it. Runs the SDK
**straight from `src/`** via bun (no build step — what you edit is what runs), resolves RPC
endpoints from your local `chainz` config (or `--rpc`), and renders the SDK's
`SearchReport` diagnostics as a readable panel instead of raw JSON. Keyed RPC URLs are never
printed — errors are scrubbed through the same redaction rule the canary suite uses.

## 30-second tour

```bash
cd sdks/router-lite-sdk

# What can I route, and where can I connect? (offline)
bun cli/rl.ts chains

# Price a trade on mainnet (tokens: eth/native, an address, or a core-intermediate symbol)
bun cli/rl.ts quote eth usdc 1

# Watch the bounded search improve wave by wave, capped at 20s
bun cli/rl.ts quote eth usdc 1 --chain base --watch --budget 20s

# Assert a pool the search can't see yet (v2 | v3@fee | v4@fee/tickSpacing[/hooks][:hookData])
bun cli/rl.ts quote 0xTOKEN eth 1000 --hint v3@500 --verbose

# Build executable Universal Router calldata, then PROVE it with eth_simulateV1 (no keys, no funds)
bun cli/rl.ts swap eth usdc 0.5 --trader 0x1111111111111111111111111111111111111111 --simulate

# What pools does the SDK actually see for a token? (provenance, quote history, discredited hints)
bun cli/rl.ts discover usdc --budget 25s
bun cli/rl.ts discover 0xNEWTOKEN --chain unichain

# Everything takes --json for scripting; --watch emits NDJSON per wave
bun cli/rl.ts quote eth usdc 1 --json | jq .best.quote.amountOut
```

From the package root, `bun run cli -- quote eth usdc 1` works too, and `bun link` in `cli/`
puts `rl` on your PATH.

## Exit codes

Scripting contract: `0` actionable (quote / ready / needs-action) · `1` no-route ·
`2` inconclusive · `3` usage or configuration error · `4` unexpected internal error.

## Notes

- **Chains**: the five built-in manifests (`rl chains` lists them; Robinhood Chain is quote-only,
  exactly as the SDK ships it). Chains without a built-in manifest need SDK-level `manifestFor`
  overrides and are out of scope here.
- **Tokens**: symbols resolve against the manifest's own `coreIntermediates` by on-chain `symbol()`
  — no hardcoded token list, so `usdc` means USDC on mainnet and errors (naming what would work) on
  a chain that has none. Anything else takes an address.
- **Amounts** are human units scaled by the token's on-chain decimals (`1.5`), or raw with a
  suffix (`2500000wei`).
- **`--budget`** maps to `AbortSignal.timeout` — the SDK's only wall-clock bound. Without it a
  throttled endpoint can take a long time; the search is bounded in *work*, not in seconds.
- **`--verbose` vs `--watch`**: both stream a line per search wave; `--verbose` stops at the first
  actionable result (what `getQuote`/`getSwap` would return), `--watch` drains the whole bounded
  search (what the `quotes()`/`swaps()` iterators expose).

## Tests

`bun test` in this directory covers the pure parts: flag/amount/hint/duration parsing, chainz list
parsing and chain matching, URL redaction, `eth_simulateV1` payload construction/evaluation, and a
snapshot of the search-report renderer against a canned `SearchReport`. Nothing here touches the
network — the CLI itself is the live tool. `bun run typecheck:cli` (or `typecheck:all`) from the
package root typechecks it; `bun run lint` lints `src` and `cli` together.
