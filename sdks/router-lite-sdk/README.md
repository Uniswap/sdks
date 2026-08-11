# Router Lite SDK

Find a working direct or one-intermediate route across configured Uniswap v2, v3, and v4
deployments using RPC-only discovery, and return executable Universal Router calldata when the route
can be verified. A **fallback and new-asset router**, and an [anytime one](#mental-model): there is a
best answer at every moment, improving as knowledge arrives. Bounded hops and partial history are
explicit, reported properties — never overstated.

Two use cases: (1) a fallback when the main routing stack fails or returns nothing; (2) brand-new
assets with one or few pools, where a launcher can hand the router its creation receipt and the
pool is routable with zero historical scanning.

The SDK is built on [viem](https://viem.sh) — bring your own `PublicClient`, no transport of its
own. That is its only dependency, and it performs no I/O itself, so it runs unmodified in browsers
and edge workers (44.8 kB gzipped, certified on every commit — see
[Runs in browsers and edge workers](#runs-in-browsers-and-edge-workers)).

## Installation

```bash
bun add @uniswap/router-lite-sdk viem
# or: npm i @uniswap/router-lite-sdk viem
```

## Mental model

The search is an **anytime algorithm**: at every moment there is a current best answer plus an
honesty report, and both improve monotonically as knowledge arrives. `await router.getSwap(req)`
resolves at the first actionable route; `for await (const ev of router.swaps(req))` streams every
improvement as a [`SearchEvent`](#the-event-stream-lead--progress--final) until the search
converges; a standard `AbortSignal` cancels either, and the instance keeps everything it learned
(pool identities, scan coverage) for the next call — by default for as long as the instance lives;
see [PoolIndex lifecycle](#poolindex-lifecycle) for how to observe, bound, clear, or hand off that
memory.

Under the hood there are no waves, stages, tiers, or timers. The router pins a block, then one loop
sequences **three convergence processes**, each running on its own data-driven cadence and waking
the loop whenever it learns something:

- **The pricing pump** converges toward *every measurable leg of every relevant pair, priced at the
  pinned block, at the amount that leg would actually see*. A "leg" is one (pool, direction, amount)
  measurement, and that triple is also its dedup key — so one measurement serves every candidate
  route that crosses it, and the report counts work done rather than routes considered. Nothing is
  *selected* per pair: pools are measured, and the winner is whichever priced best. Two-hop routes
  are **composed** from measured legs, with the out-leg priced at exactly the in-leg's realized
  output — so a two-hop quote is an exact chained on-chain number, not an estimate built from two
  independent ones.
- **The coverage worker** converges toward *every demanded log scope covered*, walking uncovered
  ranges head-backward (the head end is mandatory anyway, warm searches only need the head-adjacent
  delta, and brand-new pools are the one scan-discoverable class with a temporal prior). Pools flow
  into the pump chunk by chunk as each `eth_getLogs` lands, so prices improve *during* a scan rather
  than after it.
- **The verifier** converges the leader toward a verdict: compile and encode, then the trader's
  readiness reads, then a real Universal Router preflight simulation — at most one in flight, racing
  discovery rather than waiting for it. A leader that reverts is marked `failed` with its verbatim
  `revertData` and the next candidate is tried.

**The cost gate — cheap information first.** Until the search goes *quiet* — pump dry **and**
readiness settled **and** verifier idle — the only scanning demanded is one bounded, recent-window
scan of the exact pair (see [the launcher recipe](#launcher-recipe-routing-a-brand-new-pool-immediately)).
Only on quiet does the gate open every scope's full `[deploymentBlock, head]`. Quiet, rather than
merely "the pump has nothing due", is what makes the launcher promise structural: a hinted
`getSwap` whose preflight is one round trip from resolving issues **zero** unbounded log scans, and
that is a counted contract test rather than a timing accident.

**The intermediates frontier.** Two-hop intermediates are not capped — they are a frontier that
advances one batch (`MAX_INTERMEDIATES`, 8) per quiet cycle, ordered hinted → manifest cores →
newest-pool-touching discovered node. So `enumeration.intermediatesPruned` reads *"not reached
yet"*, never *"capped"*: a consumer that keeps pulling drives it to zero.

**Exhaustive in the limit.** There is exactly one advance rule — *when the search goes quiet and the
consumer is still pulling, the gate opens and every frontier advances one notch* — and "still
pulling" is structural, not a heuristic: the loop body only runs between pulls of the generator, so
a consumer that stops freezes both coverage and the frontier immediately, and abandoning the
iterator aborts everything in flight. Given a consumer that keeps pulling, coverage reaches the
deployment floors, every eligible intermediate is eventually selected, and
`search.enumeration.exhaustiveWithinMaxHops: true` is actually reachable — where the old wave engine
was bounded forever. What that costs is reported, never hidden: every axis of
[`SearchReport`](#status-semantics) says how far this particular search actually got.

## Quickstart

```ts
import { createPublicClient, createWalletClient, http, type Address } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { mainnet } from 'viem/chains'
import { createRouter, MAINNET_MANIFEST } from '@uniswap/router-lite-sdk'

const account = privateKeyToAccount('0x...') // or any viem Account
const trader: Address = account.address

const client = createPublicClient({ chain: mainnet, transport: http('...', { batch: true }) })
const walletClient = createWalletClient({ account, chain: mainnet, transport: http('...') })
const router = createRouter({ client, manifest: MAINNET_MANIFEST })

const tokenIn = 'native' as const
const tokenOut: Address = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48' // USDC
const amountIn = 10n ** 18n

const result = await router.getSwap({
  tokenIn,
  tokenOut,
  amountIn,
  trader,
  signal: AbortSignal.timeout(900), // e.g. a latency SLA
})

if (result.status === 'ready') {
  await walletClient.sendTransaction(result.tx) // { to, data, value } — send as-is, from the trader's own wallet client
  console.log(result.limits) // { minAmountOut, deadline } — the same numbers asserted inside `tx`
} else if (result.status === 'needs-action') {
  // result.requirements lists what's missing (approval, Permit2 allowance, balance — a
  // Permit2 signature requirement is future work; see "Status semantics" below)
} else if (result.status === 'inconclusive' && result.best) {
  // The deadline (or the provider) cut the search short, but it had already found and priced a
  // route — `result.best`, `result.tx` and `result.alternatives` are all still here. Nobody could
  // verify it, so it is not offered as `ready`; retry, or use it at your own risk. A candidate the
  // chain *did* reject is never offered here: it appears in `result.alternatives` as
  // `execution: 'failed'` with its `revertData`, and its calldata is withheld.
}

// `result.search` and `result.alternatives` are on every result, whatever the status — no narrowing
// needed to log how far the search got or how many routes it priced.
console.log(result.status, result.alternatives.length, result.search.quoting)
```

### The event stream: `lead` / `progress` / `final`

To watch the search improve instead of waiting for one answer, iterate instead of awaiting. The
iterators yield `SearchEvent`s, not bare results — the same `AbortSignal` still applies
(`tokenIn`/`tokenOut`/`amountIn`/`trader` as in the quickstart above):

```ts
import type { SwapResult } from '@uniswap/router-lite-sdk' // `SearchEvent<SwapResult>` is what this yields

for await (const ev of router.swaps({ tokenIn, tokenOut, amountIn, trader, signal: AbortSignal.timeout(900) })) {
  if (ev.type === 'progress') {
    // An axis of the report moved without the answer moving — the engine's heartbeat.
    console.log(ev.search.enumeration.legsMeasured, ev.search.enumeration.intermediatesSelected)
    continue
  }
  // `lead` and `final` both carry a FULL result — exactly what `getSwap` would have resolved with
  // had the search stopped there. No delta logic, no accumulation.
  const result: SwapResult = ev.result
  if (ev.type === 'lead' && (result.status === 'ready' || result.status === 'needs-action')) {
    break // good enough — abandoning the iterator aborts everything still in flight
  }
}
```

Three arms, and every one of them is total:

| `ev.type` | Fires when | Carries |
| --- | --- | --- |
| `lead` | The best route's observable identity changed — a new `routeId`, a better `amountOut`, a new execution status, or a `tx` appearing. | `result`: a full interim `QuoteResult`/`SwapResult`. |
| `progress` | A report axis moved without a new lead. Coalesced to at most one per engine wake cycle. | `search`: a bare `SearchReport`. |
| `final` | Exactly once, always last — the search settled: every process converged, or the caller's `AbortSignal` fired. (A consumer that simply stops pulling gets no `final`; it gets nothing more at all, which is the same guarantee seen from the other side.) | `result`: the settled result, identical in shape to what the promise surface answers with. |

`getQuote`/`getSwap` are themselves consumers of this same stream: each stops at the first
actionable `lead` (`quote` for quotes; `ready`/`needs-action` for swaps) or at `final`, whichever
comes first. There is one search behind both shapes, so nothing about a promise-shaped call is a
different code path from an iterated one.

### `getSwap` is anytime, and "first actionable" is a real choice

Because `getSwap`/`getQuote` stop at the **first** actionable lead, they deliberately return before
the search has converged — that is the point of an anytime algorithm, and it is what keeps a hinted
or cached trade at one round trip. The consequence worth stating plainly: **a route through a pool
that only a log scan could have found may not be in the index yet when the promise resolves.** If a hint, the
index, or a speculative direct measurement can answer, the answer comes back before the coverage
worker has walked the history that would have turned up a better pool — the price is real and
verified, but it is the best of what was known *at that moment*, not the best that exists.

A consumer that wants convergence rather than latency has two ways to ask for it, and both are the
public API rather than a knob:

```ts
import type { QuoteResult } from '@uniswap/router-lite-sdk'

// (1) Drain the stream to `final`: the search widens for exactly as long as you keep pulling.
for await (const ev of router.quotes({ tokenIn, tokenOut, amountIn })) {
  if (ev.type === 'final') console.log(ev.result.search.enumeration.exhaustiveWithinMaxHops)
}

// (2) Or spend a fixed budget and take the best answer it bought.
const signal = AbortSignal.timeout(10_000)
let best: QuoteResult | undefined
for await (const ev of router.quotes({ tokenIn, tokenOut, amountIn, signal })) {
  if (ev.type !== 'progress') best = ev.result
}
```

Either way `result.search` is the receipt: `discovery` per protocol, `enumeration.intermediatesPruned`
(how much frontier is left), and `enumeration.exhaustiveWithinMaxHops` all say precisely how much of
the space this particular answer is the best of.

### Quote-only mode

A caller that only ever wants prices — a price-feed service, never `getSwap`/`swaps` — does not need
a Universal Router, Permit2, or commandSet configured at all: drop `execution` from the manifest
(`manifest.wrappedNative` alone still normalizes native/wrapped pairs) and `getQuote` works exactly
as above.

```ts
const quoteOnly = manifestFor(1, { execution: undefined }) // no Universal Router, Permit2, or commandSet
const router = createRouter({ client, manifest: quoteOnly })

const usdc = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48' as Address
const result = await router.getQuote({ tokenIn: 'native', tokenOut: usdc, amountIn: 10n ** 18n })
if (result.status === 'quote') console.log(result.best.quote.amountOut) // `best` lives on that arm alone
```

Calling `getSwap`/`swaps` on a manifest with no `execution` bundle throws `RouterConfigError`
synchronously, before any RPC — see [Error handling](#error-handling).

Quote-only is not only a caller's choice: it is also the honest shape for a chain whose Universal
Router this package cannot encode for. `ROBINHOOD_MANIFEST` (`chainId: 4663`) shipped that way
while its only Universal Router (a 2.1.1 deployment) had no encoder here; the `ur-2.1` command set
closed that gap and the manifest now swaps — see [Supported chains](#supported-chains) — so
reaching the behaviour above on any built-in chain now takes the `{ execution: undefined }`
override shown here.

## Status semantics

Both `getQuote`/`quotes` and `getSwap`/`swaps` resolve to a tagged result union — quotes never carry
a transaction, swaps always do:

| Status | Applies to | Meaning |
| --- | --- | --- |
| `quote` | quotes | A route was found and priced: `best`, with `alternatives` listing the runners-up. Quote routes are plain `QuotedRoute`s — quoting verifies nothing, so no execution status rides along. (A quote's `no-route`/`inconclusive` always carries an *empty* `alternatives`: nothing priced means no runners-up.) |
| `ready` | swaps | The exact `tx` simulated successfully from the real trader at the reported block. Send it as-is. `best.execution` is always `'verified'`. `limits` echoes the compiled plan's own `minAmountOut`/`deadline` — the same numbers asserted inside `tx`, not a re-derivation from `slippageBps`/`deadlineSeconds` with its own chance to disagree. |
| `needs-action` | swaps | A route was found and encoded, but listed `requirements` (approval, Permit2 allowance, balance) are missing — execution is necessarily unverified until they're met. `best.execution` is always `'needs-action'`. A Permit2-*signature* requirement (as opposed to the on-chain allowance above) is future work: `ExecutionRequirement` has no arm for it today, since nothing in this package produces one yet. `limits` is present here too, for the same reason as `ready`'s. |
| `no-route` | both | The search **converged** — nothing measurable was left — and found nothing viable. For swaps, this also covers "a route was found but every candidate failed execution verification with an authoritative revert" — `alternatives` carries every candidate that was tried, including the nominal best, so the caller can see what was attempted. A verification that could not be *carried out* (see `inconclusive`) is never one of these. |
| `inconclusive` | both | The search did **not** complete — an abort, a provider failure, or legs left unmeasured got in the way. Provider trouble is always `inconclusive`, never `no-route`. It is an *incomplete* search, not an empty one: **for swaps**, whatever it did find comes back with it — `best`, and `tx` when one was compiled (the two travel together: there is never a `tx` without the `best` it is calldata for). **For quotes there is no `best` on this status at all**, and that asymmetry is deliberate: a price is a price, so a quote that found a leader is reported `quote` however incomplete the search that found it — the truncation shows up on `search` (`aborted`, the per-protocol `discovery` statuses, `quoting.unattempted`), which is the same evidence the `reason` code is built from. A quote is `inconclusive` only when nothing priced. A candidate that **reverted** in preflight is never the `best` here: it is demoted into `alternatives` as `execution: 'failed'` (with its `revertData`) exactly as on the `no-route` path, and no `tx` is offered for it — a revert stays authoritative however incomplete the rest of the search was. |

Every result carries `search: SearchReport` and `alternatives`, whatever its status — the two fields
sit on the union's base rather than on individual variants, so logging and telemetry read them off
any result without narrowing first, and an empty `alternatives` means "nothing else priced" rather
than "this variant doesn't have the field". `SearchReport` has independent completeness axes:
discovery coverage per protocol, how far the search space was explored (`enumeration`), leg
measurements (`quoting`), a preflight-simulation budget (`search.verification`), whether the search
was aborted, and whether its pinned head went backwards — so "no v2 route" is always distinguishable
from "v2 wasn't searched."

### Reading `search.enumeration`

Four counts and two verdicts, all of them about *how much of the space this answer is the best of*:

| Field | What it says |
| --- | --- |
| `intermediatesDiscovered` | Eligible two-hop intermediate nodes the index currently knows about, refreshed every cycle. |
| `intermediatesSelected` | How many of them the frontier has actually reached and priced legs for. |
| `intermediatesPruned` | `discovered − selected` — read it as **"not reached yet"**, never as "capped". The frontier advances a batch per quiet cycle, so a consumer that keeps pulling drives this to zero; the old `MAX_INTERMEDIATES` cap held it above zero forever. |
| `legsMeasured` | Leg measurements that reached a terminal state — priced, reverted, or lost to the transport past their one retry. Legs are deduped by (pool, direction, amount), so this counts **work done**, not routes considered: one leg serves every candidate that crosses it. |
| `pairCeilingHit` | The abuse backstop fired: some pair held more pools than `MEASUREMENT_PAIR_CEILING` (128) and the excess was never measured. Not a selection cap — a pair that trips it is a pool-spam pair, and the search is no longer exhaustive over it. |
| `exhaustiveWithinMaxHops` | True only when nothing measurable was left out: discovery complete on every enabled protocol, the frontier having reached every intermediate it found, the pair ceiling untouched, no abort, and no leg left unattempted or lost to the transport. |

The old pruning counters are **gone**, along with the caps they reported: there is no
`poolsPruned`, no `candidatesPruned`, and no `candidatesGenerated`, because per-pair pool selection
and the candidate cap that made them meaningful no longer exist. Everything measurable is measured;
what is left is what the frontier has not reached *yet*, which is `intermediatesPruned`'s job alone.

`quoting` counts the same measurements one level down, by channel (`attempted === succeeded + failed
+ transportFailed`). These count **dispatches**, so a leg re-dispatched after a transport loss is
counted twice, while `enumeration.legsMeasured` counts **settled** legs and therefore never exceeds
`attempted`.

`search.verification.preflightAttempted` is the running total of real preflight simulations this
search issued; `preflightBudgetExhausted` is true when the verifier's most recent walk down the
ranked list gave up after exhausting its simulation budget while an untried candidate remained. That
budget (`PREFLIGHT_TOP_K`) is now **per search**, not per wave — there are no waves to spend it
per — so a deep search issues strictly fewer simulations than the old engine did. Neither field
changes a `no-route` verdict into `inconclusive`: a candidate that reverted in preflight is real
evidence the route does not execute, whatever else was left untried, and `alternatives` already
shows exactly what was attempted (see `search/verifier.ts` for the reasoning, mirrored in
`router.ts#isSearchComplete`).

Swap routes are `RankedRoute`s, and one field beyond `execution`/`revertData` can appear on any of
them: `promotedOverComplex: true`, set when a mixed-protocol or hooked route would have priced
better but a simpler route came within `SIMPLICITY_MARGIN_BPS` and was promoted ahead of it — making
that override visible on the result itself rather than only inferable by re-deriving the ranking.
It usually rides along on `best` (the promoted route is the one that typically ends up leading), but
it is a fact about the route, not about final placement — if the promoted route itself then fails
preflight, it carries the marker into `alternatives` instead.

### `quote.gasEstimate`: reported, never ranked

Every `QuotedRoute`'s `quote` may carry `gasEstimate?: bigint` — the gas word QuoterV2 and V4Quoter
already return alongside `amountOut`, decoded rather than discarded. It is there to display and to
compare routes against each other, and it is deliberately not part of any decision this package
makes.

- **Absent for v2.** A v2 quote is local constant-product math over `getReserves()`; nothing
  simulated a swap, so there is no measurement to report. Absence is the honest answer, not a gap.
- **Summed across segments, all-or-nothing.** A route quoted in two rounds (a protocol boundary, or
  two solo v2 legs) reports the sum of its segments' estimates, and only when *every* segment
  reported one — one v2 leg anywhere makes the whole route's estimate absent, rather than a partial
  sum that silently under-counts a leg.
- **Not a gas limit.** It covers the swap inside the quoter and nothing else: no 21k intrinsic, no
  calldata cost, no Permit2 pull, no Universal Router dispatch or custody. The number to send a
  transaction with comes from preflight / `eth_estimateGas` against the encoded `tx`.
- **Envelope-dependent to a few percent.** The quoter measures `gasBefore - gasleft()`, which
  includes EIP-2929 cold/warm state-access costs — so the same route at the same block reads
  differently depending on what the carrying call already touched, and this SDK aggregates quoting
  rounds through Multicall3. Measured live on mainnet at block 25,707,079: a v3 WETH→USDC 0.05%
  quote reported **90,012** as a direct `eth_call`, **90,012** alone inside `aggregate3`, **90,012**
  aggregated behind unrelated calls, and **83,512** (−6,500, −7.2%) aggregated behind another call
  to the same pool; the v4 ETH→USDC twin read 43,222 / 43,222 / 40,722 (−2,500, −5.8%). `amountOut`
  was byte-identical in every envelope.
- **Ranking never reads it.** `rankRoutes` orders on `amountOut` and its declared tie-breakers
  alone; a route with no estimate is never disadvantaged and a cheap-gas route is never promoted.
  Gas-aware ranking needs a gas price and an output-token price, both of which are the caller's.

The CLI prints it dimmed on route lines (`~90k gas`), rounded to three significant figures because
that is as much precision as the figure actually has.

### `reason`

`no-route` and `inconclusive` both carry `reason: { code: ReasonCode; detail: string }` instead of a
bare string. `code` is the part a caller may safely `switch`/`===` on — a closed, exported union —
and `detail` is human-readable prose (free to reword in a later release; it carries no contract).
`ReasonCode` is one of:

| `code` | Meaning |
| --- | --- |
| `rpc-unavailable` | Total outage: not even the pinned block could be fetched, so nothing was searched at all. |
| `rpc-degraded` | Partial outage: some `eth_call`s were 429'd / timed out / lost, a verification read failed in the transport channel, or the pinned head regressed. The search ran and produced real partial results, but cannot be promised complete. |
| `aborted` | The caller's `AbortSignal` fired before the search finished. |
| `discovery-incomplete` | One or more protocols' log-scan discovery is `partial`/`failed` (see `search.discovery`). |
| `quotes-unattempted` | The search was cut short with quote candidates still unquoted (see `search.quoting.unattempted`). |
| `no-viable-route` | The search **completed** and never priced a single candidate. |
| `no-route-verified` | The search **completed** and priced at least one candidate, but none could be turned into a verified/executable plan — every preflight reverted, or nothing compiled (`detail` names the cause when the engine knows it, e.g. a recipient colliding with the route's own pool). |

`REASON_CODES` (the `readonly ReasonCode[]` `code` is drawn from) is exported alongside the type, for
callers that want to iterate or validate against the closed set rather than hand-copy it.

Swap routes are `RankedRoute`s: the quote, an `execution` status, and — on a candidate the chain
rejected — the verbatim `revertData` of the simulation that failed it, never decoded here (the caller
owns the error ABIs of the hooks and tokens its route touches). A route left `unverified` by a lost
simulation has none: nothing reached the chain to report.

`ReadySwap`, `NeedsActionSwap`, and `SuccessfulQuote` are exported for the variants callers narrow to
and then pass around (`Extract<SwapResult, { status: 'ready' }>` and friends, named).

Quote attempts are tallied by *channel*, because a revert and a 429 are not the same evidence:
`quoting.failed` counts calls the chain answered by reverting ("this route cannot price at this
block"), while `quoting.transportFailed` counts calls that never got an answer at all — a rate limit,
a timeout, a dropped socket — which say nothing about the chain (`attempted === succeeded + failed +
transportFailed`). `verificationDegraded` is the same idea for preflight: the simulation could not be
carried out, so the route stays `unverified` rather than `failed`. Either one makes the result
`inconclusive` (`rpc-degraded`) instead of an authoritative `no-route`.

A node that cannot serve the *pinned block* counts as a lost call too, not as a revert: `header not
found`, `missing trie node`, `unknown block`, `state at block N is not available`, `Nonexistent
block: requested N, latest M` and the range/response caps are all evidence about the provider — the
usual cause is a load balancer serving the block-pinned `eth_call`s from a replica a few blocks
behind the node that answered `eth_getBlockByNumber`. `search.headRegressed` is the same failure mode
when nothing errors at all: the head this search pinned was *below* one an earlier search on the same
router had already pinned (the block is refetched once first, so a one-off blip costs a round trip
rather than a verdict). Like `aborted`, it makes the result `inconclusive` (`rpc-degraded`) — a search
that ran entirely against a head the router has already been past is never entitled to a `no-route`.
Two consecutive answers *implausibly* far below the recorded head reset it instead: a glitched high
answer is a bug in the record, not a chain that rewound, and it must not brick the router.

## What this is not

- **No split routes.** One route wins; the trade is not divided across multiple paths.
- **No exact-out.** Exact-input only.
- **Max 2 hops.** Direct or one intermediate; protocols may mix within those two hops.
- **Quotes are per-block, best-effort estimates**, not firm prices — everything is read and
  simulated at one pinned block, and a v2 leg's quote is local reserve math assuming standard
  ERC-20 transfers, not a canonical on-chain quoter call.
- **Fee-on-transfer / rebasing / restricted tokens are safely rejected or downgraded, not
  supported.** They may quote, but are never returned `ready` on a mispriced quote — there are no
  generic ERC-20 state overrides to paper over the difference.
- **v4 `hookData` only flows through hints.** Unknown hooks are always tried with empty `0x` data
  unless the caller's hint supplies bytes explicitly; there is no `resolveHookData` callback yet.
- **No partial-fill refund is emitted.** If a pool can't fill the whole input, the unconsumed
  remainder is not swept back — this only matters for router-custodied input (native or
  wrapped-native value, or anything with a leading wrap/unwrap); Permit2-paid legs never strand
  anything, since an unspent allowance is simply never drawn. See the encoder's deep-dive comment
  in `src/encode/ur20.ts` for the full reasoning.
- **The pre-gate path is not zero RPC.** Before the [cost gate](#mental-model) opens, the search
  measures hints, cached pools, and locally derivable pool identities (v2/v3 CREATE2 addresses at
  standard and fee-scan-discovered tiers, v4 standard configs) with no historical scanning — plus one
  bounded, recent-window log scan of the exact pair, which is the latency guarantee for the
  brand-new-asset case, not a full history scan. A brand-new pool outside that window is reachable
  before the gate only via `ingestReceipt`/`ingestPool`/`hints`; the remaining history is scanned
  after the gate opens.
- **A first-actionable answer can predate the history that would have improved it.** The quotes are
  never stale — everything is measured at the pinned block — but `getQuote`/`getSwap` stop at the
  first actionable lead, so a pool only a log scan could have found may not be in the index yet when
  they resolve. That is the anytime bargain, stated once more because it is the one behavior a
  latency-shaped caller and a best-price-shaped caller should choose differently: see
  [`getSwap` is anytime](#getswap-is-anytime-and-first-actionable-is-a-real-choice).
- **v4 pools at a nonstandard `(fee, tickSpacing)` are never guessed.** The no-scan-required
  hypotheses only cover the four standard, no-hook configs (100/1, 500/10, 3000/60, 10000/200 —
  `STANDARD_V4_CONFIGS`); a pool at any other tier — which is every hooked pool, and any v3-style
  custom fee tier reused on v4 — is reachable only via a `hints`/`ingestPool`/`ingestReceipt`
  assertion or the pair/adjacency log scans, never via a guess. Discovery reporting `v4: complete` is
  a claim about LOG coverage, not about hypothesis surface: it means every relevant `Initialize` log
  has been scanned, not that every fee/hook combination was ever tried. A pool nobody hinted, on a
  tier nobody scanned to yet, is invisible until one of those two things happens — same as any other
  protocol's un-scanned history, and consistent with "the pre-gate path is not zero RPC" above, just
  for the hypothesis axis rather than the log-history one.
- **Endpoint adjacency is scanned in four `eth_getLogs` chains, not twelve.** (Six cold on chains
  where v2 and v3 deployed apart, e.g. mainnet — see the segmentation note below.) `eth_getLogs` accepts
  an *address array* and an *array within one topic position*, so a single request asks the v2
  factory **and** the v3 factory — `topics[0] = [PairCreated, PoolCreated]` — about **both** ends of
  your trade at once. v2 and v3 merge because both index the pair at the same two topic slots; v4's
  `Initialize` puts the PoolId first, so its currencies sit one slot deeper and it merges only with
  itself. Where a cold search used to run 3 protocols x 2 endpoints x 2 topic slots = 12 request
  chains, it runs 4 — 6 cold on chains where v2 and v3 deployed apart, because the stretch below v3's
  deployment block is a segment of its own that only v2 can be asked about (mainnet's gap is ~2.4M
  blocks; a chain whose factories launched together never pays it). Both endpoints are demanded
  together and converge concurrently, rather than one being scanned before the other, so a two-hop
  route through a token neither end has cached becomes reachable as soon as either chain lands it.
  Measured live on mainnet: the merged v2+v3 request took 49ms against 134ms for the two it replaces,
  and returned exactly the union of their logs.
  Merging never widens what is scanned. A merged request records its coverage under every
  (protocol, endpoint) scope it asked for, so it is only issued over blocks *every* one of those
  scopes still needs — v2 and v3 have different deployment blocks (~2.4M apart on mainnet), and on a
  warm router the two endpoints' cached coverage rarely matches. The leftovers are scanned by
  narrower requests, so nothing is ever recorded as covered that was not actually asked for.
- **Log scanning is budgeted, so a throttling endpoint yields partial discovery rather than an
  unbounded scan.** Each `eth_getLogs` walk adapts its block window to whatever the provider will
  actually serve — starting at the whole remaining range (up to a 16M-block ceiling, or
  [`logChunkBlocks`](#transport-options) when you pin one), halving on failure, growing back after a
  run of clean chunks, and backing off (exponentially, capped at 2s) before retrying at the smallest
  window. It gives up after a fixed number of requests, and the blocks it never reached are simply
  reported as uncovered: discovery comes back `partial` (`search.discovery[protocol]`) instead of the
  scan grinding on for tens of thousands of sequential requests. A severely rate-limited endpoint
  therefore produces honest partial results, not a hang. **That bounds the work, not the wall
  clock** — 4,000 sequential requests against an endpoint that takes ~1s to fail each one is on the
  order of an hour before the partial answer comes back (deliberate backoff adds at most a further
  60s) — so any caller with a latency budget should pass an `AbortSignal`, which is the only
  wall-clock bound there is. On a well-behaved endpoint the budget is now almost entirely headroom:
  measured 2026-08-05, keyed mainnet endpoint, a cold first-actionable result costs ONE
  `eth_getLogs` call (~0.3-0.9s — the whole eager pair-scan window resolved in a single request), and a full
  cold drain to complete discovery lands inside a 60s budget at ~310-473 `eth_getLogs` calls total —
  not the ~2,600 a fixed 10,000-block window used to cost. These move run to run with mainnet load
  and provider mood, and a timeout-shaped provider (one that hangs rather than rejecting an
  over-wide window instantly) still pays the full cost of the scan descent before any of this
  headroom shows up.

## Launcher recipe: routing a brand-new pool immediately

A pool that was just created has no useful log-scan history yet, and its fee tier or hook may be
unguessable from the outside. If the caller already has the creation receipt (e.g. a launcher that
just deployed the pool), hand it to the router before searching — this makes the new pool routable
with zero historical scanning, regardless of how deep it sits in log history:

```ts
// Assuming client/manifest/tokenIn/tokenOut/amountIn/trader as in the quickstart above; `receipt`
// is the TransactionReceipt from the transaction that created the pool (e.g. handed off by a
// launcher right after deploy), and `poolKey` is the new pool's v4 PoolKey.
const router = createRouter({ client, manifest })

// Feed the router the receipt from the transaction that created the pool.
router.ingestReceipt(receipt) // routes every log through each protocol's own parser; non-matching logs are ignored

// Optionally pass a hint too — useful when the caller knows more than the receipt reveals
// (e.g. a v4 hook that requires specific hookData for every quote/swap against this pool).
const result = await router.getSwap({
  tokenIn,
  tokenOut,
  amountIn,
  trader,
  hints: [{ protocol: 'v4', poolKey, hookData: '0x...' }], // hookData only ever comes from hints, never stored in the index
})
```

`hookData` is request-scoped: it depends on the trade's amount/direction, so it is never persisted
on the pool index — only ever rebuilt from that call's own `hints`. A later call to the same router
instance that omits the hint still finds the pool (it's cached), but with empty hook data.

**`ingestLogs` trusts the caller's log provenance.** It does not verify that the logs it is handed
were actually emitted on chain — it decodes anything that matches a configured factory's event and
indexes the pool. That is exactly what makes the launcher recipe work with zero scanning, and it
means a caller forwarding logs it did not fetch itself is asserting those pools exist on the say-so
of whoever handed them over. Malformed *entries* are handled defensively (a `null`, a log with no
`address`, truncated `data` — each is skipped, and the rest of the batch is still indexed), and
`logs.length` is deliberately uncapped, since a receipt is something the caller already holds
rather than remote input.

**Hints are capped at 64 per request**, and a hint's `hookData` at 4096 bytes — anything beyond
either throws `RouterConfigError`. Every accepted hint is written into an index that lives as long
as the router instance, and v3 hints cost an `eth_call` each, so both are caller-driven fan-out that
has to be bounded. Hints also earn their rank: because a v2/v4 hint can only be validated *locally*
(a pair address is a pure CREATE2 derivation, a v4 poolId is the hash of the key you passed), a
hinted pool that fails to quote at two separate blocks without ever succeeding is demoted below the
pools discovery actually proved exist. It is not dropped — a hint may legitimately name a pool that
starts working later — and it is restored either by its first successful quote or by a creation log
for that pool arriving (via a scan, or via your own `ingestLogs`/`ingestReceipt`).

## PoolIndex lifecycle

The mental model above says the instance "keeps everything it learned... for the next call" —
that memory is the router's `PoolIndex`, and by default it is exactly as unbounded as that phrase
implies: every distinct pool ever hinted, discovered, or merely probed and found to respond earns a
permanent entry (~3.1 KB/pool, adjacency included), and every distinct pair or endpoint a caller has
ever asked about earns a permanent scan-coverage entry too. For most deployments that is the right
tradeoff — a process that lives for hours routes the same handful of major pairs over and over, and
paying a few MB to never re-scan them is a bargain. A process that fields a long tail of one-off
pairs (an aggregator relaying arbitrary user-chosen tokens) can instead accumulate this forever: one
long-tail trade's WETH-adjacency scan alone has been measured at 150–250 MB, permanently.

Four knobs manage that lifecycle:

- **`router.stats(): RouterStats`** — a sizes-only snapshot (`pools`, `adjacencyEdges`,
  `coverageScopes`, `negativeCacheBlocks`, `enabledFeeFactories`), safe to log on an interval. It
  never carries the pools or routes themselves, only counts of them.
- **`router.clearIndex(): void`** — swaps in a fresh, empty index, dropping every learned pool,
  adjacency edge, scan-coverage range, hint-discredit counter, the negative-quote cache, and the
  per-factory `enabledFees` cache, all at once — nothing about the index survives. The one thing that
  *does* survive is the router's cross-search head watermark (it lives beside the index, not inside
  it), so the next search still compares against every block this router has ever pinned exactly as
  before the clear. Safe to call at any time, including while a search is in flight: a `quotes`/
  `swaps` generator already draining the OLD index keeps using that exact instance to completion (the
  search's own context pins the index reference the moment it starts) — `clearIndex` only changes what
  the *next* call sees.
- **`createRouter({ ..., index })`** — inject a pre-built `PoolIndex` instead of letting
  `createRouter` allocate an empty one. For a host that owns an index's lifetime independently of any
  one router instance: warm an index via one router's `ingestLogs`/`ingestReceipt`/searches, then
  hand that same instance to a freshly created router with zero re-scanning. `PoolIndex` is exported
  from `@uniswap/router-lite-sdk/experimental`. The injected index's `wrappedNative` must match
  `manifest.wrappedNative` (present on every manifest, whether or not it carries an `execution`
  bundle — see [Quote-only mode](#quote-only-mode)), checked synchronously before any RPC — a
  mismatch throws `RouterConfigError` immediately, since a silently mismatched index would misroute
  every native-family pair.
- **`createRouter({ ..., maxPools })`** — bound the index `createRouter` allocates to at most this
  many distinct pools (default: unbounded, matching every version before this option existed). Once
  the cap is reached, inserting a new pool evicts the least-recently-*touched* one first (touch = an
  upsert, a successful quote, a failed one, or simply being selected as a route leg during candidate
  enumeration — a pool alive only as a two-hop intermediate is touched too, not just ones a quote
  actually resolves) — except a pool touched at the same block as the one that just pushed the index
  over the cap, which is never evicted, however far over that leaves it: a pool useful to the
  *current* search is never sacrificed to satisfy a bound that exists for pools from searches long
  past. A discredited hint (one the chain has already contradicted enough to demote — see "Hints also
  earn their rank" above) is the *last* thing evicted, not an ordinary candidate: its record is tiny
  and its accumulated failure history is the one thing worth paying to keep, since evicting it would
  let a caller resubmit the same junk hint and get it back at full rank. Eviction also removes the
  evicted pool's adjacency edges, so a later `pair`/`neighbors` lookup never returns a dangling
  reference to it. Ignored when `index` is supplied — an injected index keeps whatever bound (if any)
  it was constructed with.

```ts
import { PoolIndex } from '@uniswap/router-lite-sdk/experimental'

// Bounded mode: this router never holds more than 5,000 distinct pools.
const bounded = createRouter({ client, manifest, maxPools: 5_000 })

// Warm handoff: build an index against one router, then move it to a fresh one.
const warm = new PoolIndex(manifest.wrappedNative)
const routerA = createRouter({ client, manifest, index: warm })
routerA.ingestReceipt(receipt)
// ...later, perhaps after a redeploy:
const routerB = createRouter({ client: newClient, manifest, index: warm }) // zero re-scanning

console.log(routerB.stats()) // { pools, adjacencyEdges, coverageScopes, negativeCacheBlocks, enabledFeeFactories }
routerB.clearIndex() // start over empty, whenever the host decides to
```

### Snapshots: warm starts across processes

Injection moves a warm index between routers. `PoolIndex.toSnapshot()` / `PoolIndex.fromSnapshot()`
move one between **processes** — the case a long-lived server never has and a CLI, a serverless
handler, or a restarted worker always does.

```ts
import { PoolIndex, parseSnapshot, serializeSnapshot } from '@uniswap/router-lite-sdk/experimental'

// On the way out:
await writeFile(path, serializeSnapshot(index.toSnapshot()))

// On the way back in — `createRouter` re-checks it against the manifest, exactly as for any
// injected index:
const restored = PoolIndex.fromSnapshot(parseSnapshot(await readFile(path, 'utf8')))
const router = createRouter({ client, manifest, index: restored })
```

Use `serializeSnapshot`/`parseSnapshot` rather than `JSON.stringify`/`JSON.parse`: a snapshot is full
of `bigint`s (block numbers, coverage bounds), `JSON.stringify` throws outright on the first one, and
the obvious workaround silently turns `createdAtBlock` into a string that every downstream block
comparison then gets wrong. The pair encodes them as tagged strings and decodes them back.

What travels: the pool records (with their provenance and hint-discredit history), the scan-coverage
ranges, the per-factory `enabledFees`, and the two chain facts the rest is expressed in terms of
(`wrappedNative`, `reorgOverlapBlocks`). Adjacency is rebuilt from the records rather than stored.
What does not: the negative-quote cache, which is block-scoped by construction and would be evicted
on first use anyway.

**A snapshot cannot go stale, only behind.** Coverage is block-ranged, so a week-old snapshot claims
to have scanned up to block N and nothing more — the next search asks the chain for N+1..head, which
is the same incremental path a long-lived in-process router already takes. The tip is re-scanned
either way, because `uncovered()` re-opens the last `reorgOverlapBlocks` of coverage on every call
regardless of where the data came from. A `schemaVersion` mismatch throws `RouterConfigError`; there
is deliberately no migration path, because everything in a snapshot is re-readable from the chain and
starting fresh costs one delta scan.

The CLI (`cli/rl.ts`) is the reference consumer: it keeps one snapshot per chain under
`~/.cache/router-lite/<chainId>.json` (respecting `$XDG_CACHE_HOME`), loads it at start, and writes
it back atomically on exit. It is on by default for every command; `--no-cache` opts out, and
`--verbose` reports what was loaded and saved. Measured 2026-08-05, keyed mainnet endpoint, `rl
discover usdc` goes from 59s cold (budget-aborted, v2 discovery still partial) to 4.8s fully warm,
with `eth_getLogs` dropping to 14 on the warm run — the 14 being the standing reorg-overlap
re-scans. (Run to run variance is real here too — treat 59s/4.8s as representative, not exact.) The
cost is on the other side: a maximal 275 MB snapshot adds ~1.5s to load, so a major-pair `rl quote`
that would have resolved off the cheap pre-gate path without the index gets slower (and more thorough) rather than
faster. See `cli/cache.ts` for the size bound and the numbers behind it.

### Pool lists: the same snapshot, published

A snapshot crosses a **process** boundary. A **pool list** is the same snapshot crossing an
**organization** boundary — a CI job publishes one, someone else's machine consumes it. The bytes are
identical; what changes is who you are trusting, which is what the envelope around them is for.

Full treatment in [`docs/pool-lists.md`](./docs/pool-lists.md). The three things worth knowing here:

**The two halves of a snapshot are not equally safe to import.** *Pools* are self-verifying
downstream — every one is priced by a real `eth_call` at a pinned block before it can appear in a
result, and one that keeps failing loses its rank — so a fabricated pool costs an attacker's target
some latency and nothing else. *Coverage* is a claim that **suppresses work**: "these blocks were
already scanned" makes the next search skip them, so a list that lies here **hides** a pool rather
than inventing one, and the only symptom is a worse route with nothing anywhere saying why. So a list
is imported at one of two tiers: **Tier A** (signed / first-party — today, the operator passed
`--trust-coverage`) takes pools *and* coverage; **Tier B**, the default for every list, takes **pools
only**. Tier B is still most of the value — the pools are the expensive part to re-derive, and a Tier
B consumer re-scans the ranges anyway, so it can only end up knowing more than the list did.

**A list may claim coverage only for scopes whose pool set it kept in full.** This is the
coverage-and-pools-are-inseparable invariant from `cli/cache.ts`, and violating it puts a silent,
permanent hole in the consumer's index (coverage says the range is done, so the scan that would have
found the dropped pools never runs again). It is enforced as an assertion that **fails the build**,
not as a convention — and curation therefore picks *scopes* first and derives the pool set from them,
never the reverse.

**A list cannot go stale, only behind**, for the same reason a snapshot cannot: coverage is
block-ranged, so an old list is a bigger delta scan, never a wrong answer.

```sh
# publish (see docs/pool-lists.md for curation flags and the live verify pass)
chainz exec 1 -- bun scripts/buildPoolList.ts --warm usdc,weth

# consume — Tier B by default, Tier A with --trust-coverage
chainz exec 1 -- rl quote 0xTOKEN usdc 1 --pool-list ./pool-lists/1.poollist.json
chainz exec 1 -- rl quote 0xTOKEN usdc 1 --pool-list ./pool-lists/1.poollist.json --trust-coverage
```

The list's integrity hash, chain id, `wrappedNative` and factory fingerprint are all checked against
the manifest the run resolved; any mismatch exits 4 rather than running without it. Phase 2 adds a
`'list'` provenance tier, a merge API inside the SDK, and signatures.

## Transport options

Two knobs on `createRouter` tune how this package talks to `client.request`, both provider-shaped
rather than chain-shaped (contrast with the `chain` bundle below, which is a fact about the chain
itself):

- **`concurrency`** (default `20`) — a REAL, router-wide bound on how many `eth_call`/`eth_getLogs`
  requests may be in flight at once, across every concurrent operation sharing this router instance:
  leg measurements, log scans, readiness reads, and preflight all fire concurrently within a single
  search (the three convergence processes of the [mental model](#mental-model) run at once), so without a shared
  bound the real peak is the SUM of every concurrently-running operation's own batch size, not any
  one of them — a router with no coordination between them can see 40+ requests in flight at once
  even though nothing asked for that. One semaphore, built once per router instance, is what makes
  `concurrency` a genuine ceiling rather than a per-batch one. Raise it for a provider with deep
  connection headroom that would rather trade concurrency for latency; lower it fronting a
  stricter/shared-quota endpoint. A single log scan contributes up to 4 of those permits on its own:
  once it has learned a block-window width the endpoint will actually serve, it dispatches that many
  same-width chunks at a time instead of walking them one by one. The bisection that *finds* the
  width is still strictly sequential, and so is everything after a chunk fails.
- **`logChunkBlocks`** (default `16_000_000n`) — a CEILING on the block span of an `eth_getLogs`
  window: the widest this router will ever ask a log scan for, as both the starting width and the
  regrowth ceiling. Scans **start wide and bisect down** — the first request spans
  `min(remaining range, ceiling)`, a refusal halves it, and the window climbs back after a run of
  clean chunks — because `eth_getLogs` caps are per-*query*, not per-endpoint (a selective filter
  sails through a span a busy one cannot; a merged adjacency filter, returning the union of what its
  constituents would have, caps at a narrower span than any of them and pulls the router's shared
  learned width down with it — the safe direction, since the regrowth ratchet climbs back out within
  a few doublings), and because per-request latency is dominated by the round
  trip rather than the width: measured live on a keyed mainnet endpoint, a 10,000-block window cost
  456ms per request and a 1,000,000-block window cost 89ms. Discovering the real width therefore pays
  for itself immediately, and the descent is bounded by ~log2 of the range. How much that descent
  actually costs depends on how the provider refuses: one that **validates the span** rejects an
  over-wide window instantly, and those probes are free in all but round trips; one that **executes
  the query first** (a result-size cap) or **hangs until it times out** (drpc's archive reads do this,
  and viem retries a timeout three times before the scanner ever sees it) bills real time per step, so
  the scanner classifies the failure and collapses straight to a conservative 100,000-block window
  instead of halving thirteen times. Providers that state their cap in the error text skip the descent
  entirely. Pass this option when you already KNOW your provider's cap and would rather not pay any of
  it — Ankr's public endpoint caps `eth_getLogs` around 3,000 blocks:

```ts
// Fronting a stricter/shared-quota endpoint with a known eth_getLogs cap: lower both.
const router = createRouter({ client, manifest, concurrency: 8, logChunkBlocks: 3_000n }) // Ankr-shaped
```

Both are optional; a zero-config caller gets the shared concurrency bound and the adaptive scan
window without asking for either.

### Quoting rounds go out through Multicall3

There is no knob for this one, and it is the reason `concurrency` buys less than it used to.
A measurement round's `eth_call`s are aggregated into `aggregate3` calls of **50** against the
chain's Multicall3, so a round of legs is a handful of requests instead of one per leg (a round is
itself capped at `PUMP_ROUND_CAP` = 400 legs). Each chunk is still
one ordinary block-pinned `eth_call` holding one semaphore permit, so nothing above changes meaning.
What changes is the unit a **rate limiter** charges: measured against a burst-limited public
endpoint (mainnet.base.org, which 429s bursts of ≥ 4), 20 concurrent individual quotes lost ~95% of
the round while one `aggregate3` carrying the same quotes landed complete. That is the difference
between a 3-5% quote success rate and a finished search on exactly the zero-config endpoints this
package is meant to work against.

**The address is probed, not assumed.** Multicall3 is a CREATE2 deployment at the same address on
250+ chains, so no manifest states it — but an `aggregate3` sent to an address with *no* code
**succeeds** with `0x`, and every inner result would vanish into the outer decode as a chain-wide
silent "no route". So the router spends one `eth_getCode` at that address, **once per router
instance**, before it ever aggregates. The probe is fired concurrently with manifest validation, so
on the first search it hides behind a round trip that was already happening and afterwards behind
nothing at all. Code present → every search aggregates; code absent → every search quotes
call-by-call, permanently, exactly as before aggregation existed. A probe that *failed* is not
cached: nothing was learned, so that search quotes per-call and the next one asks again.

**`manifestFor` gained a `multicall3` override** for the rare chain that deployed Multicall3
somewhere non-canonical. It is a **scalar, not a bundle** — a single address has no halves to fall
out of sync, so it is replaced on its own rather than wholesale — and unlike `wrappedNative` it is
**removable**: passing `multicall3: undefined` explicitly restores the canonical default rather than
being rejected.

```ts
const weird = manifestFor(12345, { wrappedNative, multicall3: '0x…' }) // non-canonical deployment
const back = manifestFor(1, { multicall3: undefined })                 // back to the canonical one
```

Two things this does **not** change. Aggregation cannot forward a per-call `from` or `value`, so any
call carrying either is dispatched individually — the partition is on the call's own shape, not on
callers remembering, and no quote call this package builds carries either today. And it cannot
change what a v4 hook sees: a hook's `sender` is the address that called the PoolManager, which is
the quoter contract in both envelopes. That is proved on a fork rather than argued —
`integration/adversarial.fork.test.ts` gates a pool behind a hook that writes the sender it saw into
its own revert data, and both envelopes record the V4Quoter, byte-identically. The one figure that
*is* envelope-dependent is [`gasEstimate`](#quotegasestimate-reported-never-ranked), which is why it
is display-only.

## Runs in browsers and edge workers

The package ships one runtime dependency (viem), performs no I/O of its own — the caller hands it a
`PublicClient`, and every RPC goes through that — and cancels with a standard `AbortSignal`. There
is no filesystem access, no `process.env`, no `Buffer`, no `node:` import anywhere in what it
publishes, so the same build that runs on a Node server runs unmodified in a browser tab, a service
worker, a Cloudflare Worker, or a Vercel edge function. Bundled for `target: browser` with both
entry points imported, the whole thing — router, search engine, encoder, all five built-in manifests,
viem included and tree-shaken — is **~144 kB minified, ~45 kB gzipped**.

Those two numbers are a **recorded baseline, not a constant**: they are minifier output, so they
move with the bun version (144,433 B / 44,800 B gzipped under bun 1.3.14 with viem 2.47.2, the
toolchain the baseline was recorded on) and a different bun would print a slightly different pair
for byte-identical source. That is why CI pins `bun-version: 1.3.14` in the workflows that run this
suite, and why the assertion below is a 1.5x budget rather than a tight pin — the failure worth
catching is a dependency that stops tree-shaking, not a minifier release.

That is certified, not asserted: `src/browser.certification.test.ts` runs in the ordinary suite
(`bun test`, hence in CI) and checks three things on every commit. It parses every file the two
published entry points reach with TypeScript's own parser and rejects a Node builtin import or a
Node-only global (`process`, `Buffer`, `__dirname`, `require`); it really bundles the package with
`Bun.build` for `target: browser` and again under the `worker` / `workerd` / `edge-light` export
conditions an edge runtime's bundler adds, requiring a clean build with no Node specifier and no
injected `process.env` shim, byte-identical across all four; and it measures the gzipped bundle
against a recorded baseline with a 1.5x budget — loose enough to absorb a minifier version bump or a
feature, tight enough to catch the one failure that actually matters, a dependency that stops
tree-shaking and doubles the download for every consumer.

`sideEffects: false` and an `exports` map with `types` first and ESM before CJS (asserted by the
same test) are what let a bundler drop the parts a given consumer never imports.

## Error handling

Operator/configuration mistakes throw `RouterConfigError` or `UnsupportedRouteError` rather than
surfacing as a business-outcome result. Only malformed-request validation (shape/argument checks)
is synchronous and pre-RPC — that covers `amountIn` (positive, below the v4 quoter's `uint128`
ceiling of 2^128), `slippageBps` (integer in `[0, 10000]`), `deadlineSeconds` (integer in
`[1, 86400]`), `hints` (≤ 64, `hookData` ≤ 4096 bytes of well-formed hex), the `trader`/
`recipient` addresses, which may be neither the zero address, nor a Universal Router sentinel, nor
one of the contracts the trade is *about* (`tokenIn`, `tokenOut`, the Universal Router, Permit2, or
the wrapped-native token — output sent to any of those is unrecoverable), and — swap requests only,
since quoting has no execution bundle to be missing — a manifest whose `execution` bundle is
absent, which `getSwap`/`swaps` reject with `RouterConfigError` before either reaches the search
engine. A recipient that turns out to be one of the pools the chosen route trades through is caught
a layer later, when the plan exists. `UnsupportedRouteError` (a route shape outside the closed
supported set of {single, two-hop} × {v2, v3, v4, mixed} × {erc20, native} in/out, exact-input,
optional permit) falls in the same bucket. Manifest validation is *not* synchronous: on first use,
the router confirms the manifest's `chainId` matches the connected client — spending one
`getChainId` call to read it, **unless** the caller supplied [`assumeChainId`](#api-surface), which
replaces that *read* with a value the caller already observed on this same client (the comparison
itself always runs) — and, when an `execution` bundle is present with a `codeHash` set, one
`eth_getCode` call to confirm the deployed bytecode at `execution.address` hashes to it. Both
outcomes are cached forever after: a mismatch is a permanent property of that pairing. Either check
failing rejects that first call with `RouterConfigError`. Everything else — no route found, a reverting quote, a provider outage — is a
**result**, never a throw; see [Status semantics](#status-semantics).

## API surface

| Export | What it is |
| --- | --- |
| `createRouter({ client, manifest, index?, maxPools?, concurrency?, logChunkBlocks?, assumeChainId? })` | Builds a `Router`. `index`/`maxPools` are optional PoolIndex-lifecycle knobs — see [PoolIndex lifecycle](#poolindex-lifecycle). `concurrency`/`logChunkBlocks` are transport-tuning knobs — see [Transport options](#transport-options). No policy object, no other mode/budget knobs. |
| `assumeChainId?: number` | A validation *shortcut*, not a knob: the chain id you have **already read off this same client**, supplied so manifest validation skips its `eth_chainId` round trip. It replaces the read, never the check — the value is still compared against `manifest.chainId` and still throws `RouterConfigError` on a mismatch, and the `eth_getCode` immutable fingerprint behind it is untouched. **The misuse hazard is the whole story:** pass an id from a config file, an env var, or `manifest.chainId` itself and the cross-check becomes a tautology — you have disabled the one thing it exists to catch (a manifest pointed at the wrong chain) to save one round trip. Only a caller that probed *this* client for *this* value may pass it; a CLI that autodetects the chain from its endpoint is the motivating case, and it saves ~0.9s on the critical path of every invocation. |
| `router.getQuote` / `router.getSwap` | Promises resolving at the first actionable result — an anytime answer, not a converged one; see [`getSwap` is anytime](#getswap-is-anytime-and-first-actionable-is-a-real-choice). |
| `router.quotes(req)` / `router.swaps(req)` | Async iterators over `SearchEvent<QuoteResult>` / `SearchEvent<SwapResult>` — a `lead` per improved best, coalesced `progress` when only the report moved, one terminal `final`. There is no options argument: `IterateOptions`/`onFirstRoute` are gone, because the first `lead` **is** that callback, in order, on the one stream. See [the event stream](#the-event-stream-lead--progress--final). |
| `SearchEvent<R>` | The stream's closed union: `{ type: 'lead'; result: R }`, `{ type: 'progress'; search: SearchReport }`, `{ type: 'final'; result: R }`. Exported as a type from the package root. |
| `router.ingestPool(hint)` | Validates a hint and upserts it into the router's index. |
| `router.ingestLogs(logs)` / `router.ingestReceipt(receipt)` | Feed known pool-creation logs (or a whole receipt) into the index ahead of a search. |
| `router.stats()` | A sizes-only snapshot of what the router's index currently holds — see [PoolIndex lifecycle](#poolindex-lifecycle). |
| `router.clearIndex()` | Drops every learned pool/coverage/discredit and starts the index over empty — see [PoolIndex lifecycle](#poolindex-lifecycle). |
| `PoolIndex#toSnapshot()` / `PoolIndex.fromSnapshot(snap, { maxPools? })` | Serializable form of a warm index, and its inverse — warm starts across processes. `/experimental`; see [Snapshots](#snapshots-warm-starts-across-processes). |
| `serializeSnapshot(snap)` / `parseSnapshot(json)` | The bigint-safe JSON pair for a `PoolIndexSnapshot`. `/experimental`. |
| `manifestFor(chainId, overrides?)`, `MAINNET_MANIFEST`, `BASE_MANIFEST`, `UNICHAIN_MANIFEST`, `ARBITRUM_MANIFEST`, `ROBINHOOD_MANIFEST` | Chain configuration: the required top-level `wrappedNative`, per-protocol deployment bundles, an optional Universal Router deployment (`execution` — omitted for [quote-only](#quote-only-mode) manifests), and the `chain` bundle of chain facts (block time, reorg depth) — see [Supported chains](#supported-chains). |
| `RouterConfigError`, `UnsupportedRouteError` | The two typed throws — see [Error handling](#error-handling). |

The package root also exports two closed sets **as values**, not only as types, so a caller can walk
them instead of hand-copying a literal that silently stops matching: `REASON_CODES` (every
[`reason.code`](#reason)) and `PROTOCOLS` (`['v2', 'v3', 'v4']` — exactly the key set of
`SearchReport.discovery`, so a per-protocol table or a `Record<Protocol, …>` builder can be derived
rather than transcribed).

Pure, no-stability-guarantee building blocks are exported from
`@uniswap/router-lite-sdk/experimental` for callers building their own search policy:

| `/experimental` export | What it is |
| --- | --- |
| `generateRoutes` | Enumerate candidate routes from a `PoolIndex`. |
| `compileExecutionPlan` | `QuotedRoute` → version-neutral `ExecutionPlan`. |
| `encoderFor(commandSet)` | Returns the encoder bound to that command set (`'ur-2.0'` / `'ur-2.1'`), which turns an `ExecutionPlan` into calldata. **This is the name** — there is no `encodeExecutionPlan` export; the command set has to be chosen before there is anything to encode with. |
| `PoolIndex`, `POOL_INDEX_SCHEMA_VERSION` | The index class and the schema version its snapshots are checked against exactly. |
| `serializeSnapshot` / `parseSnapshot` | The bigint-safe JSON pair for a `PoolIndexSnapshot`. |
| `PROTOCOL_MODULES`, `v2Module` / `v3Module` / `v4Module` | The registry and the individual protocol modules (plus the `ProtocolModule` / `QuoteProbe` / `FeeDiscovery` / `Custody` / `CommandSet` types). |
| `v2PoolRef` / `v3PoolRef` / `v4PoolRef` | The `PoolRef` constructors. A `PoolRef` carries derived fields (`id`, `currencies`) only these know how to fill, so a caller holding `PoolIndex.upsert` or `generateRoutes` cannot build an argument without them. |
| `isHooked(ref)` | Whether a pool ref carries a v4 hook — readable protocol-agnostically, so it is safe to call on a v2/v3 ref. |
| `buildHookData` | Builds the request-scoped `poolId → hookData` map from a request's hints. |

Every argument these functions need is constructible from that subpath alone (plus the public types
from the package root) — `src/experimental/surface.test.ts` is the compile-time guard that keeps it
true: `generateRoutes` only requires `hookData` when stamping v4 hook data (it otherwise defaults to
empty), and `compileExecutionPlan`'s `modules` defaults to `PROTOCOL_MODULES`.

## Supported chains

Five chains ship as built-in manifests — `manifestFor(chainId)` works out of the box for each, no
overrides required:

| Chain | `chainId` | Manifest constant | `blockTimeSeconds` | `reorgOverlapBlocks` | eager pair-scan window (blocks) | swaps? |
| --- | --- | --- | --- | --- | --- | --- |
| Mainnet | `1` | `MAINNET_MANIFEST` | `12` | `32n` | `50,400` | yes |
| Base | `8453` | `BASE_MANIFEST` | `2` | `150n` | `302,400` | yes |
| Unichain | `130` | `UNICHAIN_MANIFEST` | `1` | `300n` | `604,800` | yes |
| Arbitrum One | `42161` | `ARBITRUM_MANIFEST` | `0.25` | `1200n` | `2,419,200` | yes |
| Robinhood Chain | `4663` | `ROBINHOOD_MANIFEST` | `0.1` | `3000n` | `6,048,000` | yes — `ur-2.1` |

Each ships v2/v3/v4 protocol bundles (factory/poolManager addresses and deployment blocks),
`coreIntermediates`, and a Universal Router deployment — the first four under `commandSet:
'ur-2.0'`, Robinhood Chain under `'ur-2.1'` (its only router is a 2.1.1 deployment; see
`src/encode/ur21.ts` for what that changes and how it was verified). Every address and deployment
block was independently verified against that chain's RPC — see the `VERIFIED` comment block
directly above each manifest constant in `src/manifest.ts` for the exact
`eth_getCode`/`eth_call`/`eth_getLogs` evidence, method, and date. All five have also now been
verified to actually route a live trade, not merely to hold correct-looking addresses; the
first-live-quote results are recorded alongside the manifests in that same file, and Robinhood
Chain's swaps are proved by live `eth_simulateV1` execution (`canary/robinhood.test.ts` — the chain
cannot be forked, so simulation is the execution proof there).

Two entries are documented exceptions, both stated as such in `src/manifest.ts`:

- **Arbitrum's v2 factory `deploymentBlock` is UNVERIFIED/conservative** — the public Arbitrum RPC
  does not serve archive state far enough back to binary-search it, so it is pinned to the v3
  factory's own verified block. Safe because an early bound only costs extra scan work, never a
  missed pool.
- **Robinhood Chain's Universal Router is a 2.1.1 deployment, carried under
  `commandSet: 'ur-2.1'`.** The 2.1 command set differs from 2.0 only in the ABI of the three
  exact-in swap payloads (each gains a `minHopPriceX36` per-hop-floor field, emitted empty), but
  the deployed router *requires* that layout — a 2.0-shaped payload reverts or misparses, which is
  why the manifest shipped quote-only until `src/encode/ur21.ts` existed rather than mislabel the
  router `'ur-2.0'`. `coreIntermediates` there is wrapped native + **USDG** ("Global Dollar"), not
  USDC — no USDC deployment exists on that chain.

For any other chain, build a manifest via
`manifestFor(chainId, { wrappedNative, execution?, chain?, v2?, v3?, v4?, coreIntermediates? })` —
protocol bundles are optional (a protocol without a bundle is reported `disabled`, distinctly from
`no-route`), and so is `execution` (the Universal Router deployment — see
[Quote-only mode](#quote-only-mode)), but `wrappedNative` is required: quoting needs it whether or
not a swap execution bundle is ever attached. The error thrown for an unrecognized chain with
neither `wrappedNative` nor `execution` override lists every built-in chain id, so a caller sees at
a glance which chains need no configuration at all. (Supplying only `execution` still works —
`wrappedNative` then defaults from `execution.wrappedNative`, since the two must agree anyway.)

Every bundle key is replaced **wholesale**: supplying one replaces it outright rather than merging
field by field, which is what keeps a manifest from ever describing a pool discovery that runs
against one factory while the Universal Router executes against another. `wrappedNative` is not a
bundle — it is a required scalar, like `chainId` — so an override replaces just the address and
never removes it.

### The `chain` bundle: block time and reorg depth

```ts
const base = manifestFor(8453, { chain: { blockTimeSeconds: 2, reorgOverlapBlocks: 600n } })
```

Both fields are facts about the chain, not tuning knobs, and both default to mainnet's answer:

| Field | Default | What reads it |
| --- | --- | --- |
| `blockTimeSeconds` | `12` | Converts this package's time-shaped policies into block counts. Today: the eager pre-gate pair-scan window (`wave0PairScanBlocks`, a surviving code identifier), which is one week of wall-clock — `ceil(604800 / blockTimeSeconds)` blocks, so 50,400 on mainnet, 302,400 at 2s, 2,419,200 at 0.25s. Leaving it at the mainnet default on a 2s chain shrinks that window to ~28 hours, and a token launched the day before yesterday stops being visible to the fast path. The unit is **seconds** — values above 3,600 are rejected as a milliseconds mix-up. |
| `reorgOverlapBlocks` | `32n` | How much already-covered tip every warm scan re-opens, and the unit the head-regression guard is 4x of. Mainnet's 32 is one beacon epoch; on an L2 the depth that matters is an unsafe-head rewind, usually much larger in that chain's faster blocks. |

Because `reorgOverlapBlocks` is baked into a `PoolIndex` when it is constructed, injecting an index
built with a different value throws `RouterConfigError` — the same check `wrappedNative` gets, for
the same reason: it is a property of the chain the index's contents were gathered under, and nothing
downstream could notice the disagreement.

### Init code hashes

`v2.initCodeHash` and `v3.poolInitCodeHash` default to the canonical Uniswap values, which every
ordinary EVM fork shares. Chains whose CREATE2 derivation differs (zkSync-class chains hash a
different preimage) must state their own: without it, every locally-derived pool address points at
empty space, every speculative probe reverts, and the search reports a confident `no-route` that
looks exactly like a pair with no liquidity.

## Development

Comments throughout this package carry short task tags (`C4-P6`, `C5-B`, `R3`, `F1`, `Task 17`, and
similar) — they index the historical implementation-plan documents this codebase was built from.
Those plan documents themselves are gone (deleted in commit `e65a1988`, once superseded), but the
tags are kept in code deliberately, as archaeology pointers: `git log --grep <tag>` finds the commits
that did the work a tag refers to, which is usually enough context on its own.

### Where the engine lives

`src/search/` is the whole engine, one module per responsibility (the old `waves.ts` staged pipeline
is gone — with it, `quoteWhileDiscovering`, the wave-0a/0b split, the detached pair scan, the
`onFirstRoute` side-channel, and per-pair pool selection):

| Module | Owns |
| --- | --- |
| `loop.ts` | **Sequencing only.** The async generator behind `quotes()`/`swaps()`: one cycle per wake — pump → verify → emit → terminate-or-widen — plus the quiet gate and the frontier advance. It decides *when* each of the others runs and nothing else. |
| `pump.ts` | Pricing: due-leg planning, one batched measurement round per call, hypotheses (CREATE2/standard-config/hint pool identities), and dominance composition into direct and two-hop routes. |
| `coverage.ts` | Scanning: demand as a pure function of (scopes, gate state), `uncovered = demand − have`, merged plan (`adjacencyPlan.ts`), head-backward walk, chunk-by-chunk ingest, and the per-protocol discovery verdict. |
| `verifier.ts` | The leader's verdict: memoized compile/encode, the readiness gate, one preflight in flight, fall-through on revert, and the per-search `PREFLIGHT_TOP_K` budget. |
| `state.ts` | Single-writer `SearchState`: every mutation goes through a typed `apply*`, which is what makes the report's counter invariants hold by construction (and what the outcome-log goldens replay). |
| `notify.ts` | The one wake primitive (a coalescing notifier) and `SourceSet`, the tracked-promise/abort bundle the loop's `finally` tears down. |
| `report.ts` | `buildReport(state)` — a pure fold from state to `SearchReport`. |

The design document behind all of this, including the two amendments adopted during implementation,
is `docs/superpowers/specs/2026-08-10-event-driven-search-core-design.md` in the monorepo root.

Three private workspaces sit beside `src/`, none of them published:

- **`integration/`** — anvil-fork integration suite (opt-in via `ROUTER_LITE_FORK=1`).
- **`canary/`** — live-RPC nightly canary over `eth_simulateV1` (opt-in via `ROUTER_LITE_CANARY=1`).
  Imports the SDK by package name, resolving through `dist/` rather than `src/` (unlike `cli/`
  below) — CI always rebuilds before running it, but a local run after editing `src/` needs a
  rebuild first too, or it silently tests the last build. See `canary/env.ts`'s header.
- **`cli/`** — a local-testing CLI (`ETH_RPC_URL=… bun cli/rl.ts quote eth usdc 1`, or e.g.
  `chainz exec 1 -- bun cli/rl.ts quote eth usdc 1`) that runs the SDK straight from `src/` with
  no build step: quotes, swaps (with an `eth_simulateV1` execution proof), per-token pool
  discovery dumps, and a readable rendering of every result's `SearchReport`. The endpoint is a
  parameter (`--rpc`/`$ETH_RPC_URL`); the chain is detected from it. A header-authenticated gateway
  is the same story — `--rpc-header "Name: value"` (repeatable) or `$ETH_RPC_HEADERS` (foundry's
  format, which `chainz exec`/`chainz shell` export automatically) — and header values are
  credentials the CLI never prints, caches, or lets an error message echo back. See `cli/README.md`.

`bun run typecheck:all` typechecks the package and all three (plus `scripts/`); `bun run lint` covers `src` and `cli`.

Everything that needs a network is **opt-in and off by default**, so `bun test src cli` is hermetic.
The complete set of environment variables the private workspaces read:

| Variable | Read by | What it does |
| --- | --- | --- |
| `ROUTER_LITE_FORK=1` | `integration/anvil.ts` | Opts the anvil-fork suites in. Also requires `anvil` to be on `PATH`; without both, every fork suite skips. |
| `ROUTER_LITE_SKIP_FORK=1` | `integration/anvil.ts` | Force-skips the fork suites **even when opted in** — the CI kill switch, checked before `ROUTER_LITE_FORK`. |
| `MAINNET_RPC_URL` | `integration/anvil.ts` | The archive endpoint anvil forks from. Strongly recommended: without it the harness falls back to a list of public candidates, which are rate-limited and often cannot serve the pinned block. |
| `ROUTER_LITE_CANARY=1` | `canary/env.ts` | Opts the live-RPC canary in. Never PR-blocking. |
| `CANARY_RPC_URL_1` | `canary/env.ts` | The primary canary endpoint. Required — `ROUTER_LITE_CANARY=1` alone does not enable the canary. |
| `CANARY_RPC_URL_2`, `CANARY_RPC_URL_3` | `canary/env.ts` | Optional. Together with `_1` they form the **same-chain provider matrix** the canary compares against itself. |
| `CANARY_RPC_URL_ROBINHOOD` | `canary/env.ts` | Robinhood Chain's endpoint. Deliberately *not* a fourth `CANARY_RPC_URL_*`: those three are one chain seen three ways, this is a different chain. Its suites skip when it is unset, even with the canary on. |
| `ETH_RPC_URL` | `cli/`, `scripts/` | The endpoint for the CLI and the recorder/pool-list scripts. Passed through the environment rather than a command line, where a keyed URL would land in a process listing. Part of the `--rpc > $ETH_RPC_URL > $RPC_URL` precedence every entry point shares — see `cli/chains.ts#resolveRpcUrl`. |
| `RPC_URL` | `cli/`, `scripts/` | The same endpoint as `ETH_RPC_URL`, one rung lower in the shared `--rpc > $ETH_RPC_URL > $RPC_URL` precedence — a fallback for a caller that already exports this more generic name for other tooling. |
| `ETH_RPC_HEADERS` | `cli/`, `scripts/recordOutcomes.ts` | Extra RPC headers, foundry's own format (comma-separated `Name: value` pairs) — exactly what `chainz exec`/`chainz shell` export, so a header-authenticated gateway needs no flag at all. The CLI's `--rpc-header <spec>` (repeatable) overrides an env pair of the same name; both are parsed by the one shared `cli/rpcHeaders.ts`. Values are never printed or cached. |
| `UNISWAP_API_KEY` | `scripts/compare.ts` | The Trading API key `compare.ts` needs to quote the API side of its side-by-side comparison. Unset means the `api` column reads `skipped` rather than the script failing — `--dry-run` needs no key at all. |
| `XDG_CACHE_HOME` | `cli/cache.ts` | Where the CLI's on-disk pool-index cache lives: `$XDG_CACHE_HOME/router-lite` when set, else `~/.cache/router-lite`. |
| `NO_COLOR` | `cli/ansi.ts` | Disables ANSI styling in CLI output (https://no-color.org) — checked alongside "is stdout a TTY", so piping output already disables color without it. |

### Outcome-log golden fixtures

`src/outcome.golden.test.ts` is the hermetic "does the router reach the RIGHT answer" layer: each
fixture under `src/internal/__fixtures__/outcomes/` is one real search's **outcome log** — every
`apply*` input in order (`search/state.ts`) — plus the handful of facts written outside `apply*` (the
pinned block, the intermediates frontier, the `PoolIndex` snapshot) and the canonical result it
produced. The test *folds* each log back through the real `apply*` + `composeRoutes` + `buildReport`
+ `classifyQuote`/`classifySwap` and asserts the exact best route, exact `amountOut`, every
alternative, a swap's compiled calldata and limits, and the whole `SearchReport` against the
committed golden. It runs as part of the ordinary unit suite (`bun test src`) — no env gate, no
network, no clock.

**Why outcomes and not RPC conversations.** The predecessor recorded a search's complete
block-pinned RPC conversation and replayed the engine against it. That keyed the golden on what the
search *asked*, so the event-driven engine — which changed every request shape and none of the
answers — retired the whole corpus in one commit, with no regeneration path that would have asserted
anything. An outcome log is keyed on what the search *concluded*: a refactor of how prices are
fetched moves nothing in it, while a regression in ranking, composition, classification or report
assembly moves everything. RPC-level fixtures survive only in
`src/internal/__fixtures__/providerErrors.json`, which is about wire shapes on purpose
(`internal/providerConformance.test.ts`).

**What a fold reproduces, and what the fixture carries.** `internal/outcomeLog.ts`'s header is the
full account; in short, the log is complete for everything `apply*` owns (every counter, every
measurement, every verdict) and the fixture supplies the three things written elsewhere: the pinned
block and head verdict, the frontier and pair ceiling, and the index — whose coverage cache the
report's `coveredRanges` come from and whose negative cache composition excludes routes by. Two
`SearchState` fields are deliberately not reproduced, because nothing the golden asserts reads them:
`gateOpened` and `indexVersion`.

The corpus is recorded, never hand-written, by `scripts/recordOutcomes.ts` — which refuses to emit a
fixture whose fold disagrees with the live search it came from:

```bash
# the hermetic four (ready swap, two-hop quote, completed no-route, rpc-degraded) — no network at all
bun scripts/recordOutcomes.ts --hermetic

# a live golden, through chainz so the keyed RPC URL never touches a shell history
chainz exec 1 -- bun scripts/recordOutcomes.ts --label live-mainnet-eth-usdc --chain 1 \
  --token-in native --token-out 0xA0b8...eB48 --amount-in 1000000000000000000 --notes "..."

# re-fold every committed fixture and rewrite its golden — NO network, no RPC URL, no chainz
bun scripts/recordOutcomes.ts --regold
```

A **hermetic** fixture is a deterministic fake world (`scripts/hermeticWorlds.ts`) driven to `final`;
a **live** fixture stops exactly where `getQuote`/`getSwap` stop, at the first actionable lead, since
driving a mainnet search to `final` would mean walking every factory's whole deployment history for a
golden that is about the answer. Both go through the same recorder, and a header-authenticated
gateway needs no extra step — `chainz exec` exports `$ETH_RPC_HEADERS` and the script reads it
through the same parser the CLI's `--rpc-header` uses (`cli/rpcHeaders.ts`).

`--regold` is the update path when the change is to what a result *reports* rather than to what the
search *finds*. Because a golden rebuilt from the same outcomes is self-consistent whatever it
dropped, the canonical SHAPE is pinned in the test rather than in the files — the key set is closed,
`gasEstimate` is asserted present exactly when a route has no v2 leg, and `execution` exactly on a
swap's routes. The corpus itself is asserted too: it must always contain a ready swap, a two-hop
quote, a completed no-route, and an rpc-degraded search.

Goldens legitimately change when: (a) ranking/pruning/classification policy changes on purpose —
re-record and review the diff as the behavioral change it is; (b) a live fixture is deliberately
re-pinned to a newer block; (c) the canonical result shape gains a field — `--regold`, no network.
They never legitimately change on their own: a fold is pure, so a golden diff with no code change is
a determinism bug. **Redaction is structural**: an outcome entry has no field that can hold a URL, a
key, or a provider's error text, and `outcome.golden.test.ts` asserts exactly that over the
committed bytes.
