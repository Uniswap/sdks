# Parity-sweep defect fixes — router-lite-sdk

Branch `feat/router-lite-sdk-v2` · 2026-08-11
Sweep evidence: `/Users/mark.toda/dev/sdks/scratch/parity-sweep/`

| Defect | Commit |
| --- | --- |
| 1 — hooked v4 pools quoting ~2^128 rank as best | `90131ce3b38294edbf3bbc6144bcb596215e960c` |
| 2 — budget cannot bind under CPU-heavy cycles | `599d9f0f88cc2732defb7fa7a6e7f28a0a12e406` |

Gates (run on the final tree): `bun run build` ✓ · `bun test` 1478 pass / 0 fail / 67 skip ✓ · `bun run typecheck:all` ✓ · `bun run lint` ✓

---

## Defect 1 — reject negative-int128 v4 quoter amounts at decode

### Root cause (live-confirmed)

Direct `V4Quoter.quoteExactInput` probes of every hooked v4 ETH-family/USD₮0 pool on Arbitrum
(0.01 ETH exact input) confirmed **eight** pools whose RETURNS_DELTA hooks answer with a negative
int128 output delta that the quoter reports verbatim as unsigned:

```
hooks 0xB825…51cD  dyn/60  -> 340282366920938463463374107431768311143   (= 2^128 − 4.99e14)
hooks 0x905c…51CD  dyn/60  -> 340282366920938463463374107431768311142
hooks 0x7A29…51CD  dyn/60  -> 340282366920938463463374107431768311143
hooks 0x1816…51cD  dyn/60  -> 340282366920938463463374107431768311142
hooks 0xb9CE…51cD  dyn/60  -> 340282366920938463463374107431768311142
hooks 0x1332…91cD  dyn/60  -> 340282366920938463463374107431772555508
hooks 0xD871…D1Cd  dyn/60  -> 340282366920938463463374107431769181260
hooks 0x5A50…D1Cd  dyn/60  -> 340282366920938463463374107431768311138
```

Admitted as prices, these outrank every real route (sweep: lite quoted 3.4e32 USD₮0 for 0.01 ETH,
delta +1.8e35 bps). A v4 output is an int128 delta, so `[2^127, 2^128)` is exactly the
negative-read-as-unsigned range — no honest quote can reach it.

### Fix (at the decode seam)

- `src/constants.ts` — `MAX_PLAUSIBLE_AMOUNT_OUT = 2n ** 127n` (exclusive ceiling; subsumes the
  "≥ `MAX_AMOUNT_IN` is un-encodable downstream" argument, since 2^127 < 2^128).
- `src/errors.ts` — `ImplausibleQuoteError` (internal, like `TransportError`).
- `src/protocols/v4.ts` / `src/protocols/v3.ts` — both quoter `decode`s throw it for
  `amountOut >= 2^127` (v3 for symmetry).
- `src/quote/measure.ts#isAmountIndependentFailure` — reads the class as **amount-DEPENDENT**
  (`amountIndependent: false`): the leg settles as a data-carrying `reverted` outcome that is never
  negative-cached and never feeds the hint-discredit history — the pool exists; its hook lies.

### Tests

- v4/v3 decode: `2^128 − k` throws, exactly `2^127` throws, `2^127 − 1` decodes (boundary).
- `measure.test.ts`: the poisoned returnData through the real v4 decode settles
  `{ kind: 'reverted', amountIndependent: false }`.
- `pump.test.ts` integration (new `implausible` fate in `testWorld.ts`): the garbage-quoting pool
  never enters composition while its honest sibling does; not negative-cached; no
  `quoteFailureBlocks`.
- `router.test.ts` C4-H4 test moved to the new contract: the absurd quote is rejected at decode
  (never composed), instead of demoted at the encoder.

### Live before/after (Arbitrum, `rl quote eth 0xFd08…cbb9 0.01`)

- **Before:** four+ v4 legs quoting ≥ 2^127; sweep row `lite 340,282,366,920,938,463,463,374,107,431,768.31 USD₮0` (Δ +1.8e35 bps).
- **After:** zero results ≥ 2^127 anywhere in best/alternatives; the …51CD pools settle in
  `quoting.failed` (12 attempted / 10 ok / 2 failed on the direct pair).

### Residual (out of this defect's shape — needs execution-level verification)

Two sibling pools on the same pair lie **differently**: hooks `0x0633…4088` and `0xF504…0088`
(fee 0, ts 10) answer `amountOut == amountIn` exactly (0.01 ETH → 1e16 raw USD₮0 units,
"$10B") — confirmed by direct on-chain quoter probes, so it is the chain's answer, not a decode
artifact. That value is numerically plausible (a legit 1:1 wrapper hook returns precisely this
shape), so **no decode-time gate can condemn it**; while those pools keep answering, the pair's
quote-mode top slot is still poisoned and only preflight/simulation (swap mode, `--simulate`) can
displace it. At sweep time these pools were not quoting, which is why the sweep only surfaced the
negative-int128 family. Filed here as the follow-up.

---

## Defect 2 — budgets bind under CPU-heavy searches

### Profile first (as directed) — root cause

Instrumented every cycle phase (`console.time`-style accumulators on
planDueLegs / orderedIntermediates / measurablePools / composeRoutes / buildReport /
reportSignature / applyBatch / advanceIntermediates) and ran the live repro
(`chainz exec 8453 -- bun cli/rl.ts quote AERO usdc 1000000 --watch --budget 10s`, warm
974k-pool Base cache):

```
orderedIntermediates   total 13,380ms   66 calls   max 428ms   ← 95% of the search's wall
  neighbors(out=USDC)  total 13,359ms   66 calls   max 427ms   ← 99.8% of that
pump/planDueLegs       total 12,069ms   58 calls               (the same time, one frame down)
advanceIntermediates   total  1,255ms    7 calls
measurablePools        total    135ms  543 calls               noise
composeRoutes          total      9ms                          noise
buildReport/signature  total      3ms                          noise
```

**One-liner: `orderedIntermediates` re-ran `index.neighbors(tokenOut)` — an O(max-degree) full
materialization of a dense endpoint's adjacency (every `PoolRecord[]` of every adjacent node) —
once per settled measurement envelope (every applied batch dirties the pump cursor), so the loop
burned ~430ms×N of synchronous CPU between abort checks and the budget could never bind.** This
confirms the filed residual (warm-index planning CPU with a per-envelope multiplier); the
suspected O(intermediates × pools) `planPair` walk measured as noise.

### Fix (memoize the hot derivation + structural bindability)

- `PoolIndex.version()` — new index-global mutation counter (bumped by `upsert` insert *and*
  merge, and by every eviction; deliberately **not** by `markSuccess`/`markNegative`/`touchAll`).
  Because it is index-global, a **concurrent** search's upserts/evictions invalidate the memo —
  the cross-search shrink the per-search `state.indexVersion` can never see.
- `PoolIndex.commonNeighborNodes(a, b)` — the eligible-intermediates question answered in
  O(min-degree) key intersection, no record materialization.
- `pump.ts#orderedIntermediates` — memoized per search (WeakMap on `PumpCtx`) keyed on
  `(index.version(), inNode|outNode)`; recompute uses the intersection + a per-node newest-block
  map precomputed *before* the sort (the old comparator re-derived it O(n log n) times).
  Frontier advance and mX changes don't invalidate it because they are not inputs to it —
  `planDueLegs` itself stays freshly computed each cycle (measured at noise level), so those
  epochs remain naturally correct.
- Structural bindability: `planDueLegs` checks the dispatch signal **between intermediates** (the
  checked yield point in the one legitimately long synchronous pass), and `pump()` re-checks after
  planning — an abort mid-pass stops within one pair's worth of work and a partial plan is never
  dispatched.

### Tests

- Memo invalidation regressions: index growth forces a recompute that sees the new node; a
  `maxPools` eviction forces one that drops the evicted intermediate (identity-checked memo hits
  in between).
- Property (fast-check): memoized ≡ fresh after **every prefix** of generated upsert/eviction
  interleavings (small cap so evictions really fire) — the "wrong caching silently wrong-routes"
  guard.
- Pathological world (loop-level): 250 intermediates × 2,001 pools, abort mid-search → `final`
  within a bounded number of ticks (hang-detector race), best-so-far intact.
- Planning abort: `planDueLegs` under an aborted signal plans only the direct pair; `pump`
  dispatches nothing.
- The loop.test.ts cross-search-shrink test re-staged through `commonNeighborNodes` + a real
  version-moving upsert (per its own "revisit together with any such change" warning).

### Live before/after (same commands as the sweep)

| Run | Before (sweep evidence) | After |
| --- | --- | --- |
| Base AERO→USDC 1M `--budget 10s` (converge) | **325.5s** final, ~98% CPU, 50 transport-lost | **10.3–10.4s** search wall; first lead 167ms |
| Mainnet eth/usdc `--budget 10s` (converge) | 10s budgets at 44–157s on sweep chains | **10.2s** wall — 6,151 discovered intermediates, 136 explored, 6,631 legs settled, **0 transport-lost** |
| Profiled intermediate run (pre-fix, same repro) | 20.1s wall, 13.4s in orderedIntermediates | orderedIntermediates no longer measurable |

Process CPU for the full AERO run: 11.96s user / 16.2s real — and most of the user time is the
496MB Base snapshot JSON parse during setup (not charged to the budget), vs. the sweep's ~98% CPU
for 5+ minutes.

---

### Files touched

Defect 1: `src/constants.ts`, `src/errors.ts`, `src/protocols/{v3,v4}.ts`,
`src/quote/measure.ts`, tests (`protocols/{v3,v4}.test.ts`, `quote/measure.test.ts`,
`search/{testWorld,pump.test}.ts`, `router.test.ts`).

Defect 2: `src/pools/poolIndex.ts`, `src/search/pump.ts`, tests
(`search/{pump,loop}.test.ts`).
