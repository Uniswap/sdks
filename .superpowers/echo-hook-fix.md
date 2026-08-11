# Echo-hook fix — returns-delta hook quotes never outrank verifiable routes (quote mode)

Branch `feat/router-lite-sdk-v2` · 2026-08-11 · commit `3bbc7711364a2dee8b6cee02463107e4a2ed288f`

The live residual of defect 1 (`90131ce3`, filed in `sweep-defect-fixes.md`): Arbitrum hooks
`0x0633…4088` / `0xF504…0088` (fee 0 / ts 10) ECHO `amountIn` back as `amountOut`. Numerically
plausible per-leg — a legit 1:1 wrapper hook returns exactly this shape — so no decode gate can
condemn it; across decimals it is catastrophic (100 ETH → "100,000,000,000,000 USD₮0": raw 100e18
echoed into a 6-decimal token), and it ranked best in quote mode.

Gates (final tree): `bun run build` ✓ · `bun test` **1514 pass / 0 fail / 67 skip** ✓ ·
`bun run typecheck:all` ✓ · `bun run lint` ✓

## The structural fact (not a heuristic)

v4 hook permissions live in the hook contract's own address bits (lowest 14; v4-core `Hooks.sol`).
Verified against v4-sdk's `hookFlagIndex` (imported in the test, not restated):
`BeforeSwapReturnsDelta = bit 3`, `AfterSwapReturnsDelta = bit 2`. Either bit means the quoter's
reported amount is whatever the hook answered — the quote is the HOOK'S CLAIM, unverifiable by
construction without simulating the real swap. Live confirmation: `…4088`/`…0088` (bit 3 set,
echo family) and `…51cD` (bits 2+3, the negative-int128 family) all carry a delta bit;
`…e0C0`-style hooks (BEFORE/AFTER_SWAP only) do not.

## What changed

1. **`src/protocols/poolRef.ts` — `hasReturnsDeltaHook(ref)`**: reads the two flag bits off the v4
   arm's hooks address (last-4-bytes parse, v4-sdk's own shape). Unit-tested against the live
   Arbitrum addresses (`0x063386E9845E5d5aC7AFfBB538fcA57F59764088`,
   `0xF5044a46d9E8749E30132d137Bb434342e6f0088`, `0xB82552f3471bEF53bb683287297daf6033Ff51cD` →
   true; `0x0`, swap-permission-only `…00C0`, v2/v3 refs → false) and bit positions pinned against
   `@uniswap/v4-sdk`'s `hookFlagIndex` (each delta bit alone suffices; all-other-bits, and the
   liquidity delta bits 0/1, do not trigger).

2. **`src/quote/rank.ts` — the partition (quote mode only, a hard gate)**: `rankRoutes(quoted, kind)`
   sorts as before, then for `kind: 'quote'` partitions — every verifiable route precedes every
   returns-delta-hooked one, each block keeping its own sorted order. The unverifiable routes stay
   in the ranked list (demoted, never hidden). If ONLY unverifiable routes priced, they lead (a
   price is better than nothing) — marked. The simplicity margin runs after and composes cleanly
   (a promotable candidate is non-complex ⇒ unhooked ⇒ verifiable, so promotion never crosses the
   partition). **Swap mode never partitions** — preflight simulates the real trade (an echo hook
   cannot pay and fails), and the verifier's walk order stays exactly what `amountOut` says.
   `kind` is threaded from `search/loop.ts` / `internal/outcomeLog.ts#foldOutcomes` through
   `composeRoutes`.

3. **Observability — `QuotedRoute.quoteUnverifiable?: true`**: structural marker stamped by
   `rankRoutes` in BOTH modes (recomputed from the legs, idempotent, corrects hand-built inputs),
   travelling like `promotedOverComplex` (`router.ts#toQuoted` preserves it; `withExecution`
   spreads it; canonical golden routes carry it). `types.ts` documents the why (quoter delegates to
   the hook; RETURNS_DELTA ⇒ the reported amount is the hook's claim, not pool math).
   `internal/resultCoherence.ts` gains the second licensed best-outpriced-by-alternatives shape:
   the outpricing alternative's own `quoteUnverifiable` marker. CLI: full caveat suffix on a
   leading unverifiable quote line (`hook-reported quote — unverifiable without simulation`),
   compact `hook-reported` mark on runners-up rows and swap execution badges; `promotionNote`
   ignores unverifiable amounts when reporting what a promotion gave up.

4. **Tests**: rank partition units (delta-hooked higher-amountOut never leads; own relative order
   below the verifiable block; only-delta world leads marked with NO promotion marker; swap
   ordering untouched but still marked; partition+margin composition; stale-marker strip +
   idempotency in both modes). `hasReturnsDeltaHook` units as above. Golden schema:
   `quoteUnverifiable` added to `OPTIONAL_ROUTE_KEYS` + a corpus-coverage test for the partitioned
   shape. New hermetic golden `hermetic-echo-hook-unverifiable` (an `echo` fate quoting exactly
   `amountIn` above the honest v2 price; best = honest route, echo alternative outprices it wearing
   the marker). The `hermetic-hooked-promoted` world's hook moved `0x99…99` → `0x99…c0`
   (BEFORE/AFTER_SWAP, no delta) so the margin fixture keeps testing the margin. CLI render test
   covers both the runners-up mark and the leading-line caveat.

## Live before/after (Arbitrum, `chainz exec 42161 -- bun cli/rl.ts quote eth 0xFd08…cbb9 100 --budget 10s`)

**Before** (also `scratch/parity-sweep/rerun-42161.txt`: api 186,047.917889 vs lite 1e14, Δ +5.37e12 bps):

```
✔ 100 ETH → 100,000,000,000,000 USD₮0  (1 ETH = 1,000,000,000,000 USD₮0)  best of 62 routes · 1.9s
  WETH ─ v4 0%/10 0x0adb…013c hooks 0x0633…4088 → USD₮0 ~28k gas
runners-up                Δ vs best
                      0.000000 USD₮0        0.0 bps   WETH ─ v4 0%/10 0x1ce2…538c hooks 0xF504…0088 → USD₮0
    -99,999,999,813,432.933971 USD₮0   -10000.0 bps   WETH ─ v3 0.05% 0xC696…E8D0 → USDC ─ v4 0.0008%/1 0xab05…4fd2 → USD₮0
```

**After** (commit `3bbc7711`):

```
✔ 100 ETH → 186,732.198903 USD₮0  (1 ETH = 1,867.321989 USD₮0)  impact -14 bps  best of 62 routes · 2.0s
  WETH ─ v3 0.05% → USDC ─ v4 0.0008% → USD₮0 ~261k gas
        hop 1  pool 0xC696…E8D0
        hop 2  pool 0xab05…4fd2
runners-up                Δ vs best
         -85.17 USD₮0      -4.6 bps   WETH ─ v3 0.05% → USDC ─ v4 dyn+hooks → USD₮0 ~1.0M gas
      -2,017.19 USD₮0    -108.0 bps   WETH ─ v3 0.05% → USD₮0                       ~730k gas
```

Best is the real ~186k route (api parity: 186,047 at sweep time; 186,732–186,782 at these blocks).
The JSON result (same command, `--json`) shows the partition exactly: 61 alternatives, the **12**
delta-hooked routes at indices 49–60 — zero verifiable routes below them — every one marked
`quoteUnverifiable: true`, led by the two echo pools still claiming `100000000000000000000`:

```
alt[49] amountOut=100000000000000000000  hooks 0x063386E9845E5d5aC7AFfBB538fcA57F59764088
alt[50] amountOut=100000000000000000000  hooks 0xF5044a46d9E8749E30132d137Bb434342e6f0088
alt[51] amountOut=186772098038           hooks 0x62E9d5D34ed979DcdA33CDd01d3b8dCc71CDC0C8
...
```

Note `alt[51]`/`alt[52]`: delta-hooked routes whose claims are numerically **indistinguishable from
real prices** (186,772.098038, 4.6 bps off best) — exactly why the gate is structural. On this
dense pair the echo pools sit below 49 verifiable routes, so they fall outside the CLI's 5-row
runners-up table; on thinner pairs they surface there wearing the `hook-reported` mark (pinned by
the CLI render test and the hermetic golden).

## Files touched

`src/protocols/{poolRef,index}.ts`, `src/quote/rank.ts`, `src/search/{pump,loop}.ts`,
`src/internal/{outcomeLog,resultCoherence}.ts`, `src/router.ts`, `src/types.ts`,
`cli/report.ts`, `scripts/hermeticWorlds.ts`, tests
(`protocols/poolRef.test.ts`, `quote/rank.test.ts`, `search/pump.test.ts`,
`outcome.golden.test.ts`, `cli/report.test.ts`), fixtures
(`hermetic-echo-hook-unverifiable.json` new, `hermetic-hooked-promoted.json` re-recorded).

## Residual / concerns

- **The marker is per-flag-bit, not per-behavior**: honest returns-delta hooks (e.g. the
  186,772-quoting `…C0C8` pools) are marked and demoted alongside liars. That is the design — the
  quote is a claim either way — but it means a genuinely-better delta-hooked route can never lead a
  quote while any verifiable route prices. Swap mode (preflight) is the path that can prove such a
  route and let it win.
- **Runners-up visibility**: on dense pairs the demoted echo routes rank below every verifiable
  route and fall outside the CLI's 5-row table (JSON carries them all, marked). If eyeballing them
  matters, a `--all`-style table cap or a one-line "N hook-reported routes demoted" note would do it.
- Hook addresses are read structurally from the poolKey; a chain whose v4 fork moved the flag bits
  would silently mis-read — the v4-sdk pin covers canonical v4 only.
