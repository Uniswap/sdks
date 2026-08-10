# rl — local-testing CLI for `@uniswap/router-lite-sdk`

A terminal front-end for poking the router against live chains while developing it. Runs the SDK
**straight from `src/`** via bun (no build step — what you edit is what runs) and renders the
SDK's `SearchReport` diagnostics as a readable panel instead of raw JSON.

The CLI takes parameters and nothing else — no child processes, no config discovery. The endpoint
arrives as `--rpc <url>` or `$ETH_RPC_URL` (exactly what `chainz exec <chain> --` exports, so
chainz composes from the *outside*), and the chain identifies itself via `eth_chainId` against
that endpoint. Extra RPC headers — for a gateway that authenticates by header rather than by a key
in the URL — arrive the same way: `--rpc-header "Name: value"` (repeatable) or `$ETH_RPC_HEADERS`
(foundry's own format, comma-separated `Name: value` pairs, exactly what `chainz exec`/`chainz
shell` export automatically). Keyed RPC URLs and header values are never printed — errors are
scrubbed through the same redaction rule the canary suite uses.

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

# Header-authenticated gateway: chainz exports $ETH_RPC_HEADERS automatically (no flag needed)...
chainz exec 1 -- bun cli/rl.ts quote eth usdc 1

# ...or without chainz, name the header(s) explicitly — repeatable, merges over $ETH_RPC_HEADERS
ETH_RPC_URL=https://… bun cli/rl.ts quote eth usdc 1 --rpc-header "X-Api-Key: secret"

# Start from a published pool list instead of re-scanning history (pools only, by default)
chainz exec 1 -- bun cli/rl.ts quote eth usdc 1 --pool-list ./1.poollist.json

# Run against nothing but this endpoint — no cache read, no cache write
chainz exec 1 -- bun cli/rl.ts quote eth usdc 1 --no-cache

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

**`4` has one deliberate non-bug meaning: a rejected `--pool-list`.** A list that fails its
integrity hash, chain id, wrapped-native or factory-fingerprint check exits `4` as a single clean
line with no stack. It is not `3`, because the flag was used correctly — the user named a list and
meant it, and "fix your arguments" would be wrong advice; and it is emphatically not `0`-with-a-
warning, because a run that quietly proceeded without the list would print a perfectly ordinary
quote computed from a different index than the operator asked for. `4` is the code a script must
never treat as "carry on".

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
  search (what the `quotes()`/`swaps()` iterators expose). Wave lines are numbered from `wave 1`
  (the engine counts its own waves from 0; the display counts the lines you have been shown).
- **`--concurrency <n>`** caps in-flight RPC requests, `1`–`1024`, defaulting to the SDK's `20`.
  The right value is a property of the *endpoint*, which only you know: `40` measurably beat `20`
  on a keyed mainnet endpoint, while a shared or rate-limited quota wants less. It is validated
  against the SDK's own bounds before the endpoint is touched.
- **`--rpc-header "Name: value"`** (repeatable) / **`$ETH_RPC_HEADERS`** add extra headers to every
  RPC request — for a gateway that authenticates by header instead of (or in addition to) a keyed
  URL. The env var is foundry's own wire format (comma-separated `Name: value` pairs), which is
  exactly what `chainz exec`/`chainz shell` export, so headers just work when you compose with
  chainz and need no flag at all. An explicit `--rpc-header` overrides an env pair of the same name
  (case-insensitive). Header **values are credentials**: they are never printed, never cached, and
  scrubbed out of any error text that happens to echo one back — `--verbose` shows header *names*
  only. They also never change what the on-disk cache keys on (chain id only; see below).

## The on-disk cache (on by default)

**This is the biggest single factor in how a run behaves, and nothing turns it on — it is already
on.** A process is exactly the lifetime of a `PoolIndex`, so without it every invocation re-scans
the same block history to re-learn the same pools. After a search, the index is written to
`$XDG_CACHE_HOME/router-lite/<chainId>.json` (`~/.cache/router-lite/…` when that is unset), keyed
by **chain id only** — two providers serving the same chain see the same pools, so they share one
file.

- Every cached run prints one unconditional `cache: chain <id> · <path>` line to **stderr**, plus
  the load time when it is large enough to feel. `--verbose` adds what was loaded, discarded, or
  saved. Nothing the cache does ever touches stdout, so `--json` stays machine-clean.
- Restoring is safe because coverage is **block-ranged**: a snapshot from last week claims to have
  scanned up to block *N*, so the next search asks for *N+1..head* plus the standing reorg overlap.
  A stale cache is a bigger delta scan, never a wrong answer — there is no TTL.
- Every failure resolves to "start fresh with a note": a corrupt file, a bumped schema version, a
  different `wrappedNative` or a different reorg overlap are all *discarded*, never fatal.
- It is written on **every** exit path, including errors and Ctrl-C — a search that died partway
  still learned real coverage, and throwing it away would make exactly the runs that are already
  going badly permanently slow.
- `--no-cache` skips both the read and the write. Reach for it when you want to measure a cold
  search, or when you want a run that cannot inherit anything.

## Pool lists

`--pool-list <path|https-url>` loads a published snapshot — the same bytes the cache stores,
wrapped in a trust envelope — and **merges** it into whatever the cache restored. Both are
snapshot-shaped and the union goes through the index's own merge rules, so neither source shadows
the other, and a cached pool the chain proved is never demoted by a list's copy of it. `http://` is
refused outright (the integrity hash lives in the file it protects, so it defends against
corruption, not against someone who can rewrite the response).

**Pools are imported; coverage is not.** They are not equally safe to accept from a stranger: a
pool is self-verifying downstream (every one is priced by a real `eth_call` before it can appear in
a result, so a hostile list buys wasted calls, not a wrong price), whereas coverage is a claim that
*suppresses work* — "these blocks are already scanned" makes the search skip them, so a list that
lies there does not invent a pool, it **hides** one, with no symptom beyond a worse route.

`--trust-coverage` opts into the second half, and it is stickier than it looks: **adopted coverage
is saved into your local cache and outlives this flag.** Once adopted, a list's ranges are
indistinguishable from ones your own machine scanned, and every later run reuses them whether or
not you pass the flag again. Delete the file named by the `cache:` line (or use `--no-cache`) to be
rid of it. Pass it only for a list you would trust with your cache directory. Without it a list is
still a large win — the pools arrive, and the ranges are simply re-scanned.

A list that fails any of its checks exits `4` and does not run; see the exit-code note above.

## Tests

`bun test` in this directory runs 13 files and touches no network — the CLI itself is the live
tool:

| file | what it owns |
| --- | --- |
| `args.test.ts` | flag/positional parsing |
| `amounts.test.ts` | human and raw amount parsing, `--budget` durations |
| `chains.test.ts` | chainz list parsing, `--chain` assertion matching |
| `hints.test.ts` | `--hint` spec parsing |
| `rpcHeaders.test.ts` | `--rpc-header`/`$ETH_RPC_HEADERS` parsing (foundry format) and the flag-over-env merge |
| `redact.test.ts` | keyed-URL scrubbing, and registered RPC-header-value scrubbing |
| `report.test.ts` | every rendered line, snapshotted against a canned `SearchReport` |
| `waves.test.ts` | the `--watch`/`--verbose` stream as a stream: ordering, NDJSON event types |
| `simulate.test.ts` | `eth_simulateV1` payload construction and verdict evaluation |
| `tokens.test.ts` | symbol/address resolution, and which failures are retryable |
| `cache.test.ts` | save/load round trip, discard rules, atomic writes, tmp sweeping |
| `poolList.test.ts` | curation, the envelope, trust tiers, verify-before-publish |
| `commands/context.test.ts` | the setup seam: `--budget`'s clock, the transport (incl. RPC headers), `--pool-list` |

`cli/testing.ts` holds the fixtures more than one of them needs. `bun run typecheck:cli` (or
`typecheck:all`) from the package root typechecks it; `bun run lint` lints `src` and `cli`
together.
