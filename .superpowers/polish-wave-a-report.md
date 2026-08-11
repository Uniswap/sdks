# Polish wave A — router-lite-sdk

**Status: complete.** All 23 items applied. Gates green.

## Commits

| hash | subject |
| --- | --- |
| `349d510b` | `docs(router-lite-sdk): correct four doc claims fresh eyes caught` |
| `be9832d4` | `refactor(router-lite-sdk): one owner per fact — dedup, key format, wave-era names` |

## Gates

```
bun run build         OK
bun test              1441 pass / 67 skip / 0 fail (1508 across 70 files)
bun run typecheck:all OK  (base, tests, integration, canary, cli, scripts)
bun run lint          OK
```

Bundle baseline deliberately NOT re-recorded (101% of baseline, 1.5x budget — a later wave owns it).

## Items

All 23 completed; nothing skipped. Two carried a deviation, both flagged below.

### Doc/comment fixes

1. **state.ts `settle`** — reworded: `legsMeasured` counts distinct keys ever settled and is monotone; `measuredKeys` shrinks when `pump.ts#foldRoundInLegs` deletes out-leg keys on m_X invalidation, so `measuredKeys.size <= legsMeasured`. Verified against `foldRoundInLegs`' `state.measuredKeys.delete(key)`.
2. **loop.ts `readinessSettled`** — `sources.failures()` disjunct dropped. Confirmed dead: `launchReadiness`'s catch calls `applyReadiness(state, { requirements: [], degraded: true })` BEFORE rethrowing, so `state.requirements` is set on the bug path too. Comment now credits the catch. Loop suite green unmodified.
3. **coverage.ts `ScanEnv.progress`** — now says nonzero for any new knowledge (pool upserts, or a grown fee set — `runFeeScan` passes `grew ? 1 : 0`), 0 for a coverage-only write.
4. **state.ts cross-file line numbers** — `verifier.ts:274,296` → `verifier.ts#Verifier.advance` (with what it does there); `pump.ts:330` → just `planDueLegs`.
5. **coverage.ts `converged()`** — tagged test-only observability; verified the only non-test callers are zero (`coverage.test.ts` x2).
6. **outcomeLog.ts `FixtureRequest`** — "Present exactly when `kind === 'swap'`" scoped to `trader`; `recipient`/`slippageBps`/`deadlineSeconds` documented as swap-only AND optional.
7. **constants.ts `maxPlausibleHeadRegression`** — `basis: policy` line added.
8. **measure.ts `MeasureLegsArgs.semaphore`** — documents that omitted-semaphore + `onOutcomes` runs every dispatch group unmetered, and that this is test-only config.
9. **multicall.ts** — orphaned "Classifies a failed OUTER aggregate3 call…" docblock moved from above `shouldBisect` (which has its own) to above `coarsenOuterFailure`.
10. **types.ts `PoolRecord.source`** — `'factory'` glossed as a derived hypothesis proved by a successful quote, the legacy wire name for the pump's 'hypothesis' (kept because `PoolIndex` snapshots serialize it — `poolIndex.ts:369` validates it on decode). Cross-referenced from `pump.ts`'s `Provenance`.
11. **experimental/index.ts `DEFAULT_SLIPPAGE_BPS`** — story rewritten around a caller predicting what an un-overridden `getSwap` will encode; notes a post-hoc reader wants `limits.minAmountOut` instead. Export kept.

### Code polish

12. **pump.ts planning key** — `legKey(ref.id, shaped.currencyIn.toLowerCase(), amountIn)` → `measurementKey({ pool: ref, currencyIn, currencyOut, amountIn })`. `state.test.ts`'s equivalence pin kept and still green.
13. **coverage.ts `report()` + `applyCoverage` param** — complete arm now reads `s.scope` like the failed arm (identical for adjacency scopes, the only kind that reaches the complete arm). `applyCoverage`'s parameter renamed `endpoint` → `scope` with both roles documented (graph node for adjacency completeness; scope key for failures).
    **DEVIATION, as the item allowed:** the serialized `OutcomeEntry` field stays `endpoint` — every committed fixture in `src/internal/__fixtures__/outcomes/*.json` carries that spelling, so renaming it would invalidate all nine goldens. `record(s, { t: 'coverage', p, endpoint: scope, o })`, with the wire-name decision documented on both the union member and the function.
14. **coverage.ts ingestion** — `ingestLogs`/`ingestMerged` collapsed into `ingest(env, moduleFor, logs)`; the merged case passes a new `dispatchByEmitter(emitters)` closure (which carries the emitter-dispatch rationale). `runAdjacencyScans`' param renamed `byEmitter` → `emitters` to avoid shadowing.
15. **pump.ts hookData stamp** — `materializeLeg` and `legOf` now share `stampHookData(leg, hookData)`.
16. **Coverage-key ownership** — `coverageScopeKey(protocol, scope)` exported from `pools/poolIndex.ts` (where the format was already private). Now the single spelling for: `PoolIndex.addCoverage`/`uncovered`/`addEnabledFees`/`enabledFees`, `adjacencyPlan.ts#scopeKey`, `coverage.ts#coverageKey`, and `cli/cache.ts`'s prefix filter (`coverageScopeKey(p, '')`).
    **Note:** `cli/cache.ts` reaches it via a deep import `../src/pools/poolIndex`, following `cli/poolList.ts#assertSnapshotShape`'s precedent, rather than widening the `/experimental` blessed surface. That kept the public surface (and its pinned surface test) untouched — which mattered because the bundle baseline is owned by a later wave.
17. **router.ts `dispatchPinnedBlock`** — reuses `createRouter`'s computed `reorgOverlapBlocks` instead of re-calling `reorgOverlapBlocksOf(manifest)` per request.
18. **`MAX_INTERMEDIATES` → `INTERMEDIATES_BATCH`** — constants.ts, loop.ts, loop.test.ts, router.test.ts, report.test.ts, README. Verified not exported from `src/index.ts` or `src/experimental/index.ts`, so no public break. The constant's name-apology deleted; `types.ts#intermediatesPruned` reworded to drop the unresolvable old-name reference.
19. **measure.ts** — `const indices = legs.map((_, i) => i)` hoisted once, sliced per group.
20. **router.ts** — redundant `code !== '0x'` conjunct dropped (`code.length > 2` subsumes it), with a line saying why.
21. **CLI lead classifier** — `makeLeadClassifier(ctx, trade)` added to `commands/context.ts`, carrying quote.ts's snapshot-timing comment (strengthened: taken later, the probe's own discovery is in the set and every lead reads `cache`). Both `quote.ts` and `swap.ts` now do `const classify = makeLeadClassifier(ctx, trade)`. `classifyLeadOrigin` stays exported (it is the documented primitive and `stream.ts` references it by name), now called only from `context.ts`.
22. **`progressBody(search)`** — exported from `cli/report.ts`; `renderTimelineLine`'s progress arm and `stream.ts#progressKey` both go through it, so the dedup key IS the line body.
23. **`wave0PairScanBlocks` → `eagerPairScanBlocks`, `WAVE0_RECENT_WINDOW_SECONDS` → `EAGER_PAIR_WINDOW_SECONDS`** — manifest.ts, constants.ts, coverage.ts, types.ts, manifest.test.ts, coverage.test.ts, loop.test.ts, canary/robinhood.test.ts, canary/env.ts, README. Checked first: neither is exported from `/experimental` or the root, so this is a pure internal rename — no `feat!`.
    Also retired the stale prose that still called TODAY's window "the wave-0 window" (manifest.ts x3, experimental/index.ts, canary/env.ts). Left the two genuinely historical mentions that compare against the old wave engine (`manifest.ts:401`'s study note, `constants.ts:193`'s breadth comparison) and README's deliberate "there are no waves" framing.

## Nothing skipped

No item turned out to be behavior-changing on inspection. The two places where the literal instruction was adjusted (13's wire name, 16's import route) were both anticipated by the item text or forced by the "don't touch the baseline / don't modify tests" constraints, and both are documented in the source at the point of the decision.
