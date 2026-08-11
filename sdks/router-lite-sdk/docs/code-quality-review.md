# Router Lite SDK — Code Quality Review

*2026-08-10 · companion to `architecture-review.md`. Findings are ranked within each section; anything marked **confirmed** was reproduced during this review (live run or direct source verification).*

## Verdict

Code quality is high across every layer: naming is consistent, error taxonomies are real, invariants are stated and usually tested, and the test suite is one of the strongest reviewed (behavior-first, mutation-audit-driven, self-defending fixtures). The findings split into: a handful of real bugs (one confirmed live), a comment regime whose *volume* has become the package's main readability and drift liability, targeted duplication, and a short list of type-tightness and hardening gaps.

---

## 1. Bugs and behavioral defects

**B1 (confirmed live). `rl discover` mislabels counterparties for native-token queries.**
`cli/commands/discover.ts:164` picks the "other side" with `viewKey(c) !== viewKey(token.ref)`, while the metadata hydration ten lines up uses `sameFamily` (`counterpartOf`, `:158`). For `rl discover eth`, the neighbor fold means v2/v3 records hold WETH — `viewKey(WETH) !== 'native'`, so whenever WETH sorts first the row renders WETH itself as the counterparty. Reproduced on Base: rows print `↔ 0x4200…0006` (WETH) instead of the real token, and the symbol that *was* fetched for the real counterpart goes unused. Fix: `renderRecord` should take `counterpartOf`'s result instead of re-deriving membership.

**B2. `canary/simulate.ts` checks the wrong slippage floor for non-default slippage.**
`simulateSwapE2E` re-derives the success bar from `DEFAULT_SLIPPAGE_BPS` (`canary/simulate.ts:377-378`) and claims the result doesn't carry the request's slippage — but `ReadySwap.limits.minAmountOut` is exactly the number encoded into the tx, and `cli/simulate.ts:217` was already fixed to use it. The mirror-copy contract between the two files (`canary/simulate.ts:62-66`) failed in practice. Fix: use `result.limits.minAmountOut`; delete `computeMinAmountOut` and the parameter.

**B3. `classifyRpcError` and `parseDeclaredCap` disagree about the same provider sentences.**
The declared-cap parsers recognize mevblocker's `range … exceeds limit of …` (`internal/rpcErrors.ts:235`) and the free-tier `ranges over N blocks` (`:247`), but neither sentence matches `NODE_STATE_MESSAGE`/`TRANSPORT_MESSAGE`, so the classifier returns `'execution'` — a phantom on-chain verdict for a serving-policy refusal, the exact defect class this file documents fixing twice (drpc, quicknode). Today the scan survives because the policy's declared-cap branch usually fires first, but when the cap doesn't explain the refusal (`capBlocks >= chunkSize`) the `'execution'` kind suppresses the expensive-refusal collapse, and any other consumer of `classifyRpcError` inherits the mis-tier. Structural fix: *any failure from which a cap parses is `'unavailable'` by construction*; then delete the four cap-shaped regex alternatives from `NODE_STATE_MESSAGE` so the two families can never disagree again.

**B4. `cli/simulate.ts` violates the CLI's own exit-code taxonomy.**
Three non-usage outcomes throw `UsageError` (exit 3, "fix your input"): "no acquisition route" (`cli/simulate.ts:203-205`, a routing outcome), "acquisition leg can't buy enough" (`:208`, a liquidity fact), and "`eth_simulateV1` returned no block results — the endpoint may not support it" (`:216`, endpoint territory, exit-2 by the CLI's own contract in `rl.ts:27-41`). Scripts gating on exit codes get lied to.

**B5. `canary/simulate.fork.test.ts` runs in no CI job, and collides on port 8647.**
The fork workflow runs only `integration/`; the canary workflow runs without `ROUTER_LITE_FORK`. So the file self-described as "the one executable proof of the canary's chained simulate" only runs when someone opts in locally. It also reuses port 8647 with `integration/mixed.fork.test.ts:70` (every other fork suite has a unique port). Add it to the fork workflow; give it 8651.

**B6. Comment/doc drift that states falsehoods (each cheap, each already misleading):**
- `integration/e2e.ts:27-32` (and `discovery.fork.test.ts:16`) justify a deep import by claiming `assertResultCoherent` "is reachable through neither export path" — it has been exported from `/experimental` (`src/experimental/index.ts:90`). The import also mixes a working-tree checker with a dist-built router, the exact stale-dist hazard `canary/env.ts` documents.
- `manifest.ts:635-642`: a complete docstring for `assertChainData` orphaned above a second docstring for a different function; `assertChainData` itself is undocumented.
- `internal/logScan.ts:169-177`: `delay`'s docstring attached to nothing.
- `logScanPolicy.ts:311`: "initialPolicy has no MIN_CHUNK floor" — now false (line 209 floors the hint).
- `cli/amounts.ts:127` says `parseBudget` feeds `AbortSignal.timeout` — the API the CLI's own source-guard test bans.

**B7. Hardening one-liners** (convention-safe today, watertight tomorrow): `mapConcurrent` with `limit <= 0` returns an array of `undefined` holes (`internal/rpc.ts:220` — floor at 1); `Semaphore.release()` has no underflow guard; `moduleGraph.ts:33` uses `new URL(...).pathname` (breaks on Windows; `fileURLToPath`); `rl discover` exits 0 even on a total RPC outage (`cli/commands/discover.ts:84,108`); `rl quote --help` is an "unknown option" error rather than help.

---

## 2. The comment regime (the big readability finding)

The package's single largest maintainability liability is comment **volume and register**, not code. Measured across layers: `constants.ts` ~94% prose, `manifest.ts` ~75%, `types.ts`/`waves.ts`/internal ~55-65%. Roughly 22.5k of 48.6k total lines are non-test source, and well under half of that is code.

What's genuinely good — and should be kept exactly as is: invariant-at-the-branch comments ("never fabricate on-chain evidence", the two-bound conservation argument, why node-state text is checked before transport text), and measured constants with dates and endpoints.

What hurts:
- **Changelog narration** ("used to be X, measured Y, so now Z") duplicating what `git log` owns. The review-code vocabulary (C4-P7, C5-B, R3, F1…) *is* anchored — README "Development" explains the tags index deleted plan docs, recoverable via `git log --grep` — but the anchor is one paragraph at line ~805 of the README, and notably **four of five independent reviewers concluded the codes were unexplained**. Discoverability has failed in practice; per-file headers should link the convention, or the codes should go.
- **Cross-file audits that will rot** — `rpc.ts:25-69` enumerates every semaphore call site in the package; `waves.ts`'s header re-narrates three other files. Several such claims have already drifted (see B6).
- **Restated essays** — the lowercase-vs-`isAddressEqual` rationale appears ≥8 times near-verbatim across `v2/v3/v4.ts`, `manifest.ts`, `constants.ts`; the tx/limits pairing promise was restated in three modules until `CompiledRoute` fixed it structurally (the right pattern — repeat it).
- **Emphatic register** — ALL-CAPS thesis sentences on nearly every block mean nothing reads as more important than anything else.

Recommendation: keep rationale and invariants; move measurements/history to `docs/` (an `engineering-log.md` the tags can point into); dedupe restated essays to one canonical home each. Estimated 2,500-4,000 lines removable with zero behavioral information lost — the tests already pin the regressions the essays describe.

## 3. Duplication and dead code

| Item | Where | Action |
|---|---|---|
| `canary/simulate.ts` ↔ `cli/simulate.ts` (~620 lines total, already drifted — see B2) | both | Extract shared pure core (payload builder, evaluator, `traderInputCurrency`, wire types); keep per-world router wrappers |
| Publisher pipeline inside the CLI (~300 code lines: curate/envelope/verify-live) | `cli/poolList.ts` | Move to `scripts/`; CLI keeps parse/verify/hydrate |
| `cmdQuote`/`cmdSwap` skeleton (~60 lines each, comments triplicated verbatim) | `cli/commands/quote.ts:26-116`, `swap.ts:52-163` | `runTradeSearch({buildRequest, stopAt, render})` helper |
| `visibleLength` re-implements `ansi.ts#visibleWidth` | `cli/report.ts:306` | Delete |
| `BUILTIN_CHAINS` hand-copies `KNOWN_MANIFESTS` facts | `cli/chains.ts:31-37` | Derive ids + `swaps` flag; keep only display names |
| Multicall parity proven at three layers | `quote.test.ts:696-829`, `waves.test.ts:2149-2301`, `router.test.ts:2460+` | Keep one parity suite (waves) + unit layer (~250-350 lines) |
| Scan-cap decisions re-pinned post-extraction | `logScan.test.ts:937-1231` vs `logScanPolicy.test.ts` | One wire-level test per decision *category* (~150-250 lines) |
| Timeline state tracking duplicated live vs retrospective | `cli/waves.ts:154-156` vs `report.ts:370-377` | Shared `TimelineCursor` |
| Unused surface | `integration/anvil.ts:60-64` (`wsUrl`, `walletClient`), `worldBuilder.ts:643` (`getAmountOut`) | Delete |
| `mapConcurrent`'s `number \| Semaphore` union exists to say "don't double-gate" | `internal/rpc.ts:191` | Marginal; `Infinity` would do |

*Explicitly examined and worth keeping*: `ansi.ts` (30 lines vs a chalk dep), `cli/cache.ts` (67s→5.1s measured), the fork harness's independent ABIs/math/addresses (anti-collusion by design, drift-checked by the adversarial manifest test).

## 4. Type-system tightness

- **Brand the string identities.** `PoolRef.id` and `routeId` are unbranded `string`s built by centralized constructors — brand them (`` `${Protocol}:${string}` `` or a tagged type) so the constructors are the only compile-time producers. Same pattern for `adjacencyPlan.ts:72`'s scope keys and for **graph nodes**, which today are lowercased strings typed variously as `string`/`Address` and cast back (`waves.ts:1239` `neighbor as Address`, `candidates.ts:312` `node as Address`). A `GraphNode` brand makes family-normalization mistakes unrepresentable.
- **`manifest.ts:586,598`**: `(manifest as any)[key] = (overrides as any)[key]` — the only `any`s in the core; a typed `setBundle` helper removes them.
- **Representable illegal states** (all runtime-guarded today, worth a note or a type): `RouteLeg.hookData` attachable to non-v4 legs (silently ignored); `Segment.legs` can disagree with `Segment.protocol`; `ConversionOperation.amount: bigint | 'router-balance'` string sentinel.
- The acknowledged single-seam casts (`as Run` in `waves.ts:1680`, `protocolRecord`'s `as unknown as`) are fine — they're documented, unique, and replace scattered casts. The `client.request({...} as any)` pattern at each leaf RPC site could share one typed `rawRequest` helper.

## 5. Test quality

**Overall: exceptionally strong.** Behavior-first through real interfaces (facade tests stub only the transport and run real protocol modules); fixtures that refuse to lie (`serveAggregate3`'s out-of-band violation channel, live-capture-only provider fixtures); meta-tests pinned against vacuity (surface closure proves it reaches internals; parity tables prove bidirectional cover); the quarantine mechanism warns on every run, fails if stale, and fails when its own fix lands; and clear evidence of a mutation-audit loop (tests written only after a mutant survived). That practice is worth keeping as a standing discipline.

Costs and gaps, ranked:

1. **Re-record the two quarantined replay sessions** (both adjacency-wave sessions — the deepest e2e path currently has no hermetic coverage). Root cause worth noting for the architecture discussion: recorded sessions key on exact request shapes, so the C5-C request-merge invalidated them. A world-model fake (serve `eth_getLogs`/`eth_call` generically from a pool-world description — `integration/worldBuilder.ts` is already this idea on forks) would survive request-shape refactors; the event-fold design in the architecture review gives the same for free.
2. **Exact request-count pins (~32 assertions across four files)** are the largest standing maintenance tax; for an RPC-efficiency SDK they are arguably the spec, but any benign scheduling change ripples through all of them. The pure-reducer extraction already mitigates; stop re-deriving costs in two places (see §3).
3. **Missing tests**: two concurrent searches on one router (most realistic untested scenario); `subtractRanges` property test (the trickiest range op has only 4 examples while its siblings got properties after mutants survived); `logScanPolicy` sequence-invariant properties over generated outcome arrays; `canonicalParams` idempotence/equivalence properties; `rl.ts`'s error→exit-code map (the CLI's scripting contract, currently untested); command-level tests for `cmdQuote`/`cmdSwap`/`cmdDiscover` (B1 lived exactly in that untested glue).
4. **Small frictions**: the two 8s quarantine-obsolescence probes cost 16s of every run (shrink to ~2s); `providers.test.ts` writes to a committed fixture during nightly runs (working-tree dirt by design — keep aware); a corpus test asserting no committed session contains a keyed URL would make the redaction contract self-enforcing; wire `redactKeyedUrl` around `robinhood.test.ts`'s uncaught-error path (the gap its own comment admits).

## 6. Smaller quality notes

- `scripts/compare.ts` reuses one router across the pair matrix, so later pairs' `firstActionableMs` are warm numbers feeding the printed latency median — fresh router per pair, or an explicit caveat (`canary/env.ts#freshClient` exists for exactly this).
- `scripts/buildPoolList.ts --warm` silently ignores `--rpc` (children read the env) — guard it.
- `cli/chains.ts:107` hardcodes chain 4663 for the client timeout where `blockTimeSecondsOf` could generalize.
- Bless `DEFAULT_CONCURRENCY`/`MAX_CONCURRENCY` (the CLI's one weakly-justified deep import; they're already consumer-facing via `--help`).
- Export `InnerCallFailure`/`revertDataOf` from `/experimental` or annotate `adversarial.fork.test.ts:27-29`'s grouped source imports.
- UX nit observed live: the CLI cache header prints `v2 ✓ v3 ✓ v4 ✓` (633k pools) while the confidence panel prints `0.0%` coverage for the same protocols — both are correct (per-protocol presence vs per-endpoint intersection) but two coverage vocabularies on one screen read as a contradiction.
- Encode-layer watchlist (not bugs): `minHopPriceX36` has no oracle for its non-empty encoding (fine while always empty — file the fixture plan alongside the extension note); the partial-fill refund divergence (#3, `encode/core.ts:62-81`) is documented but never exercised, so unlike divergences A/B it is invisible to the differential oracle rather than normalized by it.

## 7. Quick-win list (all low-risk, high-signal)

1. Fix B1 (discover counterparty) + add a command-level test.
2. Back-port `limits.minAmountOut` into `canary/simulate.ts` (B2), then extract the shared simulate core.
3. Unify cap-parse/classifier in `rpcErrors.ts` (B3).
4. Re-class the three `simulate.ts` exit-code violations (B4).
5. Add `canary/simulate.fork.test.ts` to the fork CI job; fix the port (B5).
6. Sweep the five drifted comments (B6) and the hardening one-liners (B7).
7. Add the four cheap property tests + the concurrent-searches test.
8. Delete: `visibleLength`, unused anvil surface, `BUILTIN_CHAINS` duplication.
