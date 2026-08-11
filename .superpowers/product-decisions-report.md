# Product decisions: first-round answer gate + price-impact reporting

Branch `feat/router-lite-sdk-v2`, package `sdks/router-lite-sdk`.

- **Commit 1** `cb83d238` — feat(router-lite-sdk): getQuote/getSwap answer only after the first measurement wave settles
- **Commit 2** `defc4871` — feat(router-lite-sdk): price-impact reporting on the answering route — never refusal

## CHANGE 1 — answer after round 1 settles (`firstRoundComplete`)

**One deliberate semantic decision, made against live evidence.** The literal reading — "every leg
of the round the initial planning pass dispatches" — was implemented first (pending-key countdown in
`state.ts`) and **failed the live acceptance test**: the initial round holds only the direct pair +
in-legs (out-legs are deferred until an `m_X` exists), so at the flip LINK→WBTC still answered
0.000711 WBTC — two-hop compositions weren't in yet. The shipped semantics are the initial
**wave**: the first round *plus everything its own answers make due* (two-hop out-legs re-measured
to their final `m_X`, each transport-lost key's one retry) — structurally, the pump's **first dry
moment**, observed and written by the loop (single-writer, same arrangement as `intermediates`),
monotone thereafter. This is a strict strengthening of the stated rule ("every leg of the first
dispatched round has settled" still holds at the flip) and is what makes the LINK→WBTC live verify
pass. Documented precisely on `SearchReport.firstRoundComplete` (types.ts) and in the README.

- Engine: `SearchState.firstRoundComplete` + report fold (`report.ts`); `leadSignature` carries the
  axis so **the flip cycle always emits a `lead`** — without that, a search whose leader was
  already right after the first wave would drag the promise surface to `final` (full-history
  scans). Transport-retry rule: settled-once counts, a retry gates the flip until it settles,
  `unattempted` (abort) never completes it — an aborted first wave honestly reports `false`.
- Facade: `getQuote`/`getSwap` stop at the first actionable lead with `firstRoundComplete` (or
  `final`). `quotes()`/`swaps()` unchanged — every envelope-cadence lead still flows, stamped.
- Coherence: `no-route` with `quoting.attempted > 0` requires `firstRoundComplete`
  (`resultCoherence.ts`).
- Goldens: `FixtureContext.firstRoundComplete` + `CanonicalReport.firstRoundComplete`, schema pin
  updated (context/report key sets), `OUTCOME_LOG_SCHEMA_VERSION` 1 → 2 (no migration path);
  hermetic corpus re-recorded (`--hermetic`), both live fixtures re-recorded via `chainz exec`
  at the final stop rule; recorder's `actionable-lead` stop mirrors the facade.
- CLI: default and `--verbose` `stopAt` mirror the facade rule (quote + swap commands).
- README: anytime-semantics rewritten (first answer = settled first wave, ~400–800ms warm;
  convergence still via draining `swaps()` or a budget).

## CHANGE 2 — price-impact reporting (`priceImpactBps`, never refusal)

- `quote/impact.ts`: `dustReference` (amountIn/10_000, floor 1), `composePriceImpactBps` (bigint
  per-leg ratio product → bps, negative = worse), `measureRouteImpact` (one `measureLegs` envelope
  quoting the answering route's legs at dust amounts against the quote's own execution amounts,
  same pinned block; total over failure → `undefined`).
- Facade: `getQuote`/`getSwap` stamp `best.quote.priceImpactBps` on the result they answer with
  (answering lead or actionable `final`); rebuilt object, never mutation — alternatives and
  streamed leads never carry it. The annotation reuses the router's already-resolved Multicall3
  verdict (never re-probes) and passes the caller's signal (expired budget → absent). Quote mode
  documented as now possibly issuing this one extra envelope.
- v2 legs: included in the reference envelope (implementer's choice per the spec) — their dust
  quote is the same `getReserves` read priced locally, so no special casing.
- CLI: `impact -N bps` on the result line (dim; red when worse than −500 bps) + warning line
  `⚠ high price impact — this route moves the pool ~X%` when worse than −500 bps (strict; display
  policy only). The CLI answers off the streams, so it mirrors the facade's annotation via the
  newly-blessed `measureRouteImpact` (`experimental/index.ts`, surface pin updated) — exactly as
  its `stopAt` mirrors the stop rule. JSON output carries the field.
- Goldens: canonical route shape never emits the field; key-set pins keep it that way.

## Live evidence

**(a) LINK→WBTC 1000 (`--budget 10s`) — the saturated-pool smoking gun.** Was: first lead
0.000431 WBTC (−9968 bps vs API). Now answers the converged two-hop at 619ms:

```
✔ 1,000 LINK → 0.134841 WBTC  (1 LINK = 0.000134 WBTC)  impact +2 bps  best of 62 routes · 619ms
  LINK ─ v3 0.3% → WETH ─ v3 0.05% → WBTC ~180k gas
how it went
  144ms   lead from cache — 0.000431 WBTC
  186ms   found a better route: +0.018886 WBTC
  ...
  286ms   found a better route: +0.134125 WBTC
  484ms   new lead at the same price        ← the first-wave flip; default mode answers here
```
API comparison (sweep): 0.13449 WBTC → the answer is now +2.6 bps vs API instead of −9968.

**(b) wstETH→ETH 1000 — the −91% reverse-miss.** Change 1 *fixed the route itself* (the old
first-lead answer was the thin hooked pool; the settled wave finds the deep v3 0.01% pool, exact
API parity), so the answering route's impact is genuinely tiny and the impact figure — not the
warning — renders:

```
✔ 1,000 wstETH → 1,240.959244 ETH  (1 wstETH = 1.240959 ETH)  impact -2 bps  best of 86 routes · 785ms
  wstETH ─ v3 0.01% → WETH ~167k gas
```

The warning path verified live on a trade whose best route really does move the pool
(wstETH→ETH 300,000):

```
✔ 300,000 wstETH → 2,844.179837 ETH  (1 wstETH = 0.00948 ETH)  impact -9,913 bps  best of 81 routes · 756ms
  wstETH ─ v4 0%+hooks → ETH ~403k gas
  ⚠ high price impact — this route moves the pool ~99%
```

Warm-latency regression check: ETH→USDC @1 answers in ~600ms (was ~480ms) — inside the documented
400–800ms warm band.

## Gates

`bun run build`, `bun test` (1,499 pass / 0 fail / 67 skip), `bun run typecheck:all` (0 errors),
`bun run lint` (clean) — all green at both commits.

New tests: state (`firstRoundComplete` initial state), loop (flip fires exactly when the wave's
last leg settles and emits a lead with an unchanged leader), facade (fast-bad-envelope vs
slow-good-envelope world — stream shows the bad lead stamped `false`, `getQuote` returns the good
route; impact: answering-route-only stamping, thin-pool −6654 bps exact, failed reference
envelope → absent, `getSwap` stamping), impact unit suite (sign, multi-leg composition, dust
floor, not-computable arms, degrade-to-absent), CLI render suite (impact note, warning threshold
strict at −500, absent → nothing).

## Concerns

1. **Wave vs round semantics** (Change 1): shipped "first wave = first pump-dry" instead of the
   literal "first dispatched round", because the literal rule demonstrably still answered off the
   saturated pool (out-legs not yet composed). If the literal semantics were wanted regardless,
   the live verify (a) cannot pass as specified.
2. **Verify (b) as written expected the warning on the 1000-wstETH trade** — Change 1 fixed that
   trade's route, so its honest impact is −2 bps and no warning is due; the warning is
   demonstrated on the 300k-wstETH trade instead.
3. `firstRoundComplete` flips vacuously true on a search with nothing measurable (first cycle dry)
   — documented; the facade behaves as before for that degenerate case.
4. Schema v2 goldens: old fixtures are refused by name (no migration path, per the format's own
   contract); anyone with out-of-tree fixtures must re-record.
5. Warm latency for promise callers rises by roughly one wave (~150–300ms observed) plus one
   impact envelope (~50–150ms) — the documented trade.
