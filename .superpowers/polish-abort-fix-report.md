# polish: abort cancellation + SIGINT fixes (router-lite-sdk)

Date: 2026-08-11 · Branch: `feat/router-lite-sdk-v2` · Status: **both fixes landed, live-verified**

## Commits

| hash | subject |
|---|---|
| `877ce32d` | fix(router-lite-sdk): caller abort cancels the in-flight measurement round |
| `3a7dee69` | fix(router-lite-sdk): first ^C stops the search and banks the cache; second exits immediately |

## Bug 1 — caller abort never cancelled the in-flight measurement round

**Fix** (`src/search/loop.ts`): the loop now owns a `dispatch` AbortController used as the pump's
signal, aborted by the caller's abort (`onAbort`, plus a born-aborted guard) and by teardown
(`finally`) alike. Built by hand rather than `AbortSignal.any` only because `engines` still admits
node 18 (no `AbortSignal.any` before 20.3); behavior is identical. Queued calls die unsent
(`AbortedCallError` → `'unattempted'` → keys settle), so the drain waits only on the HTTP requests
already on the wire — whose answers are exactly the prices the abort contract keeps. The multicall
path already checked the signal per chunk with the permit in hand, so no change below the loop.

**Coverage worker, confirmed as noted in the task**: `worker.run` deliberately keeps
`sources.signal`, so a scan chunk in flight at abort is not cancelled — bounded, because the drain
now finishes fast, the loop emits `final`, and its `finally` aborts the scans; at most one chunk
per scope outlives the caller's signal and its logs still land in the shared index. Documented in
the loop's `finally`.

**Signal-presence audit** (asked for): nothing in `src/` branches on signal presence for behavior —
only `req.signal?.…` optional chaining in `loop.ts` and a spread-shape guard in `coverage.ts:125`
(`...(env.signal !== undefined && { signal })`, exactOptionalPropertyTypes plumbing). An inert
always-present signal is semantically identical to absence.

**Test** (`src/search/loop.test.ts`, "an abort mid-detached-round cancels the queued legs"):
60-pool round → vanguard answers, `DEFAULT_CONCURRENCY` legs parked on the wire, the rest queued;
abort lands, only already-parked calls are ever released (a post-abort dispatch would hang the
drain, so "no new envelope" is enforced, not just counted). Asserts: no new wire call after abort,
`report.quoting.unattempted = 28`, `report.aborted = true`, `final` within bounded ticks, all 32
pre-abort prices survive with the pre-abort leader still leading. **Verified failing against the
old wiring** (reverting `signal: dispatch.signal` → `sources.signal` fails exactly this test).

## Bug 2 — ^C didn't stop the process

**Fix**:
- `cli/commands/context.ts`: module-level interrupt AbortController next to `startBudget`, which now
  composes it into every signal it returns — `AbortSignal.any([budgetTimer, interrupt])` when
  budgeted, the bare interrupt signal (inert until ^C) when not. `Budget.signal` is no longer
  optional; the three commands pass it unconditionally.
- `cli/interrupt.ts` (extracted from `rl.ts`'s inline closure; `rl.ts` stays glue): first
  SIGINT/SIGTERM aborts the interrupt, prints
  `interrupted — finishing up and banking the cache; press ^C again to exit immediately`, flushes
  the cache, exits 128+signo. Second signal (entry-counted, so one arriving mid-flush counts)
  exits 128+signo immediately, no second flush.

**Tests**: `cli/interrupt.test.ts` (first-call aborts the shared controller + flush + exit 130 with
injected IO; second-call during the first's still-parked flush exits immediately with no second
flush; SIGTERM → 143) and `cli/commands/context.test.ts` (interrupt aborts both budgeted and
unbudgeted signals; budgeted signal still fires on its own timer; unbudgeted signal is inert with
no clock — replacing the old "no signal at all" contract test).

## Live verification (mainnet via `chainz exec 1`, UNI→USDC, warm 67k-pool cache)

**Bug 1 — budget overshoot** (`bun cli/rl.ts quote 0x1f98…F984 usdc 100 --watch --budget 10s`),
three runs, dense pair (2.3k–4k legs settled per run):

| run | search clock at `final` | overshoot | wall total |
|---|---|---|---|
| 1 | 14.3s | +4.3s (one slow in-flight envelope) | 17.0s |
| 2 | 10.0s | +0.0s | 12.9s |
| 3 | 11.2s | +1.2s | 13.6s |

Wall total = ~1.4s setup (not charged to budget, by design) + search + ~1.5s cache save. Run 2's
final panel showed the new mechanism directly: `76 never attempted` — the killed queue. Overshoot
is now bounded by the slowest single in-flight aggregate3 envelope (was: the whole 50-leg round's
full drain, observed 12+s past budget, every time).

Run-2 tail:
```
  10.0s   search complete — 358 of 2,290 legs priced (budget reached — 10.0s)
  legs measured    2,290 settled · 358 priced · 1,932 couldn't price · 0 lost to RPC · 76 never attempted
```

**Bug 2 — SIGINT** (same command, no budget, backgrounded; `kill -INT <bun pid>` at t=8s):

```
sending SIGINT to bun pid 29328
exit code: 130, seconds from SIGINT to exit: 0.29
--- log ---
interrupted — finishing up and banking the cache; press ^C again to exit immediately
  …final panel rendered, notes: aborted
```

Exit **0.29s** after SIGINT, code 130, one interrupt line on stderr, the search's final panel
reports `aborted`, and the 40.5MB cache file's mtime matches the exit — coverage banked. No second
^C needed. (A first attempt signalled the chainz wrapper by mistake — `pgrep -f` matched both —
and separately demonstrated SIGTERM: the harness's timeout SIGTERM stopped a 3-minute-old search
within ~1s via the same handler.)

## Test / gate summary

`bun run build` ✓ · `bun test` ✓ (1508 tests, 0 fail, 67 skip — env-gated live/fork suites) ·
`bun run typecheck:all` ✓ · `bun run lint` ✓. New tests: 1 engine (loop), 3 interrupt-handler,
3 budget-composition (1 rewritten contract test).

## Concerns

- **Overshoot tail**: the residual overshoot equals the slowest in-flight envelope (observed up to
  ~4.3s on a 10s budget). Cutting it further means aborting the HTTP request itself; viem's http
  transport takes no per-request signal, so that would be a transport-level change. The per-request
  timeout already derives from the budget, capping the worst case at ~min(budget, chain timeout).
- **Unbudgeted runs now carry a (composed, inert) signal** into the SDK. Audited: nothing branches
  on presence beyond abort observation. If the SDK ever grows presence-dependent behavior
  ("no signal → skip abort bookkeeping"), the CLI contract here must be revisited.
- **Coverage scans** still outlive a caller abort by at most one in-flight chunk per scope
  (deliberate, documented in `loop.ts`'s `finally`); their logs land in the shared index, so the
  work is banked, not wasted.

---

## Follow-up (same day): first ^C renders the result; abort cause labeled

Commit `8c628100` — fix(router-lite-sdk): first ^C finishes and renders the result; abort cause labeled correctly.

1. **First ^C no longer exits from the handler.** It only aborts the interrupt controller + prints
   the notice; the search drains, the command renders its full result panel, `main`'s `finally`
   banks the cache, and `rl.ts` overrides the exit code with 128+signo (`terminationExitCode`).
   Second ^C: immediate exit, unchanged.
2. **Abort cause attribution.** `Budget.cause(): 'budget' | 'interrupt' | undefined` (first source
   wins); renderers stop inferring "budget reached" from the budget's presence — post-abort
   timeline lines and the panel note read "(interrupted)" / "interrupted" on ^C.

Live (60s budget, SIGINT at t=7s): notice → `search complete — 385 of 2,514 legs priced
(interrupted)` → full panel (best route + 255 routes, runners-up, confidence, `notes interrupted`)
→ **exit 130, 0.99s after SIGINT**, cache mtime matches exit. Control run (budget actually firing):
labels stay `budget reached (60.0s)`, exit 0. All gates green (1513 tests, 0 fail).

---

## Follow-up round 2: first ^C renders best-so-far immediately

Commit `05e2b002` — fix(router-lite-sdk): first ^C renders best-so-far immediately instead of draining.

Root cause of the remaining complaint: `chainz exec`'s wrapper dies instantly on ^C, so the prompt
returns while our process spent 1-3s draining before its panel. Now `consumeSearch` races every
pull against the interrupt signal (^C half only — budget expiry keeps drain semantics), breaks
immediately, abandons the iterator (SDK teardown cancels in-flight work), and renders the last
lead's interim snapshot stamped `aborted`; leadless interrupt prints one stderr line. README notes
the wrapper prompt/panel interleave.

Live (timestamped, SIGINT at t=5s of a 60s-budget watch run): notice **+2ms**, panel headline
**+111ms** (one leg-symbol hydration round trip), `notes interrupted`, exit **130** at +1.27s
(tail = cache flush after rendering). Gates green: 1522 tests, 0 fail; 4 new stream tests.
