# Pool lists

**Status: phase 1.** The format, a publisher, and a CLI consumer exist. Trust is decided by a flag,
not by a signature; provenance is not yet distinguishable at the record level; the merge lives in the
CLI rather than in the SDK. [What phase 2 adds](#what-phase-2-adds) is at the bottom.

---

## What a published list is

Exactly one thing the SDK already had, wrapped in one thing it did not.

The thing it had is `PoolIndexSnapshot` — the serializable state of a warm `PoolIndex`: which pools
exist, which block ranges have already been scanned for pool-creation events, and which fee tiers
each factory has enabled. `cli/cache.ts` already writes one to `~/.cache/router-lite/<chainId>.json`
after every `rl` run and reads it back on the next one, which is what makes a second invocation warm
instead of cold. That snapshot crosses a **process** boundary.

A pool list is the same snapshot crossing an **organization** boundary — a nightly CI job publishes
one, someone else's laptop consumes it. Nothing about the bytes changes. The only thing that changes
is who you are trusting, and that is what the envelope is for.

```
{
  "schemaVersion": 1,
  "chainId": 1,
  "asOfBlock": "23417882",              // decimal string; see "Staleness" below
  "asOfTimestamp": "2026-08-07T…Z",     // informational only — staleness is decided by the block
  "manifestFingerprint": {
    "v2": { "factory": "0x5c69…f", "deploymentBlock": "10000835" },
    "v3": { "factory": "0x1f98…4", "deploymentBlock": "12369621" },
    "v4": { "poolManager": "0x0000…90", "deploymentBlock": "21688329" }
  },
  "wrappedNative": "0xc02a…c2",
  "reorgOverlapBlocks": "32",
  "integrity": "<sha256 hex of the canonical body>",
  "body": { /* a PoolIndexSnapshot, bigints `$bigint:`-tagged */ }
}
```

**The body is nested rather than spliced flat** because `integrity` has to name a well-defined byte
range. With `pools`/`coverage`/`enabledFees` scattered at the top level next to metadata, every
consumer would have to re-derive which bytes were hashed, and two implementations that disagree
produce a list that verifies in one tool and not the other.

**The canonical form of the body is `serializeSnapshot(body)`** — the exact function `cli/cache.ts`
writes cache files with, so this package makes one bigint-encoding decision instead of two. A
verifier recovers those bytes as `JSON.stringify(envelope.body)`; `JSON.parse` preserves key
insertion order for every key a snapshot contains, so the round trip is byte-exact (pinned by a test
in `cli/poolList.test.ts`).

`wrappedNative` and `reorgOverlapBlocks` appear both in the envelope (where a human skimming the file
can read them) and in the body (where they are load-bearing). Only the body's copy is under
`integrity`, so the verifier cross-checks the two — a mismatch means the envelope was edited, and the
duplication becomes a second check rather than a hazard.

---

## The trust model

**The two halves of a snapshot are not equally safe to import.**

| | what it is | what a hostile value buys an attacker |
|---|---|---|
| **pools** | "these pool identities exist" | wasted `eth_call`s |
| **coverage** | "these block ranges are already scanned" | **a hidden pool, permanently** |

Pools are self-verifying downstream. Every pool a list asserts is priced by a real `eth_call` at a
pinned block before it can appear in any result — a quote is a probe, not a belief — and a pool that
keeps failing to quote loses its ranking privilege (`isDiscredited`). Importing a fabricated pool
costs some latency and nothing else.

Coverage is a claim that **suppresses work**. `PoolIndex.uncovered()` asks "which blocks of this
scope still need scanning?", and a coverage range answers "not these". A list that claims a range
nobody scanned does not invent a pool — it **hides** one, and the only symptom is a worse route (or a
`no-route`) with nothing anywhere saying why. Detecting the lie means running the scan the coverage
exists to avoid.

`cli/cache.ts` names this exact residual risk and accepts it, because a cache file was written by the
user's own machine. Across an organization boundary it is not acceptable by default. Hence:

- **Tier A — signed / first-party.** Pools **and** coverage are imported. Today that means the
  operator passed `--trust-coverage`, which is a human asserting "I would let this list write my
  cache directory". In phase 2 it means a signature this tool checked.
- **Tier B — anything else, and this is the DEFAULT for every list.** **Pools only.** Coverage and
  `enabledFees` are discarded on the floor.

Tier B is still most of the value. The pools are the part that costs a full-history `eth_getLogs`
sweep per scope to re-derive, and a Tier B consumer re-scans the ranges anyway — so it can only ever
end up knowing *more* than the list did, never less. What Tier A additionally buys is skipping the
scan, which is where the wall-clock collapse comes from.

`enabledFees` rides the coverage tier, not the pool tier: fee tiers come from a factory's own
enablement logs, so they are a scan product like coverage.

### What never travels

`stripEndpointSpecific` removes, at publish time:

- **`source: 'hint'` → `'factory'`.** A hint means "the caller of the process that built this
  asserted the pool exists". That caller is not the consumer's caller. Left alone the record would
  enter a stranger's index at the *top* of `SOURCE_PRIORITY` — ahead of every pool that stranger's
  own chain reads proved — which is a private assertion laundered into a third party's ranking by
  nothing but a file transfer. `'factory'` is the weakest tier ("something responded here"), the
  honest description of a republished pool identity.
- **The discredit counters** (`quoteFailureBlocks`, `lastQuoteFailureBlock`): evidence gathered
  against a hint by one endpoint at particular blocks, and their only reader
  (`isDiscredited`) only looks at `'hint'` records, which no longer exist in a list.
- **`lastQuoteSuccessBlock`**: "this quoted fine against my provider" is not a fact to inherit.
- **`learnedScanWidth`**: the widest `eth_getLogs` window the *publisher's* endpoint served. Handing
  a keyed archive node's 100k-block hint to a consumer on a 10k-capped free endpoint costs them a run
  of refused probes on every scan.

`createdAtBlock` stays: it is a chain fact, the same for every observer, and it is what the index's
LRU clock is rebuilt from on restore.

---

## The curation rule

> **A list may claim coverage only for scopes whose pool set it kept in full.**

This is `cli/cache.ts`'s *coverage and pools are inseparable* invariant with the stakes raised. There
it explains why an over-large cache is skipped wholesale rather than truncated. Here the same fact
turns a plausible-looking optimization —

> "ship the top 5,000 pools, keep the coverage; the list is smaller and the consumer still skips the
> scan"

— into a silent, permanent hole in the consumer's index. The coverage says the range is done, so the
scan that would have found the other 645,000 pools never runs again on that machine, and no amount of
later searching recovers them (short of deleting the cache).

So it is enforced as an **assertion that fails the build**
(`cli/poolList.ts#assertPoolsCoverageInseparable`), not as a convention the publisher is trusted to
remember.

**Curation therefore picks scopes first and derives the pool set from them, never the reverse.**
Choosing pools first and then asking which coverage survives is precisely the shape that produces the
hole: there is almost always some scope whose pools are *mostly* kept, and the temptation to claim it
anyway is the bug. With scopes first, the pool set is whatever the scopes oblige, and the assertion
can only fire if the curator itself has a bug — which is why it still runs on every build.

Which scopes get claimed:

- every **core-intermediate adjacency scope** the source has coverage for (their adjacency is what
  every two-hop route is built out of, and it is the most expensive thing to re-derive), plus
- the **top-N busiest exact-pair scopes** (`--top-pairs`, default 25).

Everything else — one-off adjacency scans for whatever token the publisher happened to be asked about
— is dropped, coverage and any pools that no surviving scope contains.

`--max-pools` is honored by **dropping whole scopes**, largest first, never by truncating one. A list
that cannot fit even one scope publishes its pools with no coverage at all, which is a perfectly good
Tier B list.

---

## Staleness

There is no TTL and no expiry field, for the reason `cli/cache.ts` gives about its own cache:
**coverage is block-ranged.** A six-month-old list claims to have scanned up to block N, so the
consumer's `uncovered()` asks the chain for N+1..head — plus the standing `reorgOverlapBlocks` tip
re-scan, which happens regardless of where the data came from. An old list is a bigger **delta
scan**, never a wrong answer.

`asOfBlock` is the **minimum** over every claimed scope of how far that scope's coverage reaches — not
the maximum, and not the head at build time. A list is only as current as its least current claim;
reporting the head would describe a list whose v2 coverage stopped a million blocks ago as fully
current.

---

## Publishing

```sh
# from whatever the CLI's cache already holds for this chain
chainz exec 1 -- bun scripts/buildPoolList.ts

# warm the cache first (drives `rl discover` per token), then curate
chainz exec 1 -- bun scripts/buildPoolList.ts --warm usdc,weth --warm-budget 120s

# an explicit source snapshot, a size ceiling, more pair scopes
chainz exec 8453 -- bun scripts/buildPoolList.ts --from /tmp/8453.json --max-pools 200000 --top-pairs 50
```

Output: `pool-lists/<chainId>.poollist.json` (git-ignored; the canary uploads it as an artifact).

| flag | meaning |
|---|---|
| `--from <path>` | source snapshot (default: the CLI's cache for the detected chain) |
| `--warm <t,t>` | run `rl discover <token>` per token first, to warm that cache |
| `--warm-budget <dur>` | `--budget` for each warm run (default `120s`) |
| `--top-pairs <n>` | how many `pair:` scopes to claim (default 25) |
| `--max-pools <n>` | ceiling, enforced by dropping whole scopes |
| `--sample <n>` | pools to probe live outside pair scopes (default 200) |
| `--skip-verify` | publish without the live existence check |
| `--out <path>` | override the output path |
| `--chain <id>` | *assert* the chain id — the endpoint still identifies itself |

### Verify before publish

Curation is arithmetic over a file; it cannot tell whether the file describes the real chain. So a
sample is checked **against the chain** before anything is written: every pool inside a claimed
`pair:` scope (those are small and are what a consumer leans on hardest), plus a deterministic
evenly-strided sample of the rest, up to `--sample`.

This is affordable only because of `src/internal/multicall.ts`: each probe is one `aggregate3` inner
call, 50 to a round trip and one rate-limit charge per round trip, so 200 pools cost ~4 requests
instead of 200.

**Existence, not price.** The question is only whether a pool identity corresponds to something real
right now. Liquidity, price and quoteability change every block and a list makes no claim about them.
Three oracles, each the most authoritative cheap one available:

- **v2 / v3** — ask the **factory** (`getPair` / `getPool`). An address the factory returns is a pool
  the factory created, which is strictly stronger than "there is code at that address".
- **v4** — ask the **PoolManager's storage**. A v4 pool is not a contract, so there is no address to
  have code at; `extsload` of the pool's `slot0` with a non-zero `sqrtPriceX96` is the canonical
  "initialized" test (the same one v4-core's `StateLibrary` performs).

**A revert is not a negative.** Only a *definitive* answer (the factory naming a different or zero
address; `slot0` reading back zero) fails the build. A reverting or transport-failed probe is
reported as unverifiable and tolerated — an endpoint that will not answer says nothing about the
chain, and failing a nightly publish because a provider rate-limited it would train everyone to pass
`--skip-verify`.

---

## Consuming

```sh
# Tier B (default): pools imported, coverage discarded
chainz exec 1 -- rl quote 0xTOKEN usdc 1 --pool-list ./pool-lists/1.poollist.json

# Tier A: also adopt the list's scan coverage
chainz exec 1 -- rl quote 0xTOKEN usdc 1 --pool-list ./pool-lists/1.poollist.json --trust-coverage

# https is fine; plaintext http is refused
chainz exec 1 -- rl discover 0xTOKEN --pool-list https://example.org/1.poollist.json
```

`--pool-list` is available on `quote`, `swap` and `discover`. Every run prints one unconditional
stderr line naming what was loaded and — the consequential part — which tier it was loaded at:

```
pool-list: 8814 pools (8814 new) · 7 coverage scopes discarded (pass --trust-coverage to adopt) · as of block 23417882 · ./pool-lists/1.poollist.json
```

### What is checked, and what happens when it fails

1. **envelope `schemaVersion`** — no migration path, by design.
2. **`integrity`** — checked before anything else in the body is looked at. A hash mismatch means
   these are not the bytes anyone published, so nothing else in the file is worth comparing.
3. **body shape** — via the SDK's own `PoolIndex.fromSnapshot` gate, so a malformed body is rejected
   at the boundary instead of detonating mid-search.
4. **`chainId`**, **`wrappedNative`**, and the **`manifestFingerprint`** (factory addresses and
   deployment blocks) against the manifest this run resolved.
5. **envelope-vs-body** agreement on `wrappedNative` / `reorgOverlapBlocks`.

Any failure **exits 4** with a single clear line and no stack trace. Not exit 3: the flag was used
correctly — the user named a list and meant it — so "fix your arguments" is wrong advice. And
emphatically not a warning-and-continue: a run that quietly proceeded without the list would print a
perfectly ordinary-looking quote computed from a different index than the operator asked for.

**Why only factories and deployment blocks in the fingerprint.** A manifest carries plenty a pool
list is indifferent to — the Universal Router deployment, Permit2, the command set, block time.
Changing any of those invalidates nothing about which pools exist. What *does* invalidate a list is a
different factory (its coverage ranges then describe scans of a contract this consumer will never
read) or a different deployment block (its "covered from the beginning" claim starts at the wrong
beginning). Fingerprinting the whole manifest would reject lists for reasons that do not matter,
which trains people to reach for whatever the phase-2 equivalent of `--force` is.

### How it merges with the cache

A list is merged **into** whatever the on-disk cache restored — it does not replace it, and the cache
is not disabled while a list is in use. Every write goes through a public `PoolIndex` method doing
exactly what a live discovery does:

- **pools** — `upsert`, which merges by `PoolRef.id` under the class's own provenance rules. **The
  cache wins every conflict it can have**: provenance resolves by `SOURCE_PRIORITY`, not by arrival
  order, so a list can never demote a record the consumer's own chain reads established, and the
  failure history a cached record carries survives the merge.
- **coverage** — `addCoverage`, which **unions** block ranges per scope through `mergeRanges`. Union
  in both directions is the right precedence here because both sides make the same *kind* of claim
  ("these blocks were scanned"); the union is everything scanned by anyone this run is willing to
  believe. Which is exactly why `--trust-coverage` is the whole trust decision: once adopted, a
  list's ranges are indistinguishable from the cache's.

Rebuilding a merged snapshot and calling `fromSnapshot` would also have worked, and was rejected: it
re-`upsert`s every cached pool (~2.4 µs each, i.e. seconds on a large cache) to reach the state these
calls reach incrementally, and it would have had to re-implement the per-key range union anyway —
`fromSnapshot` does a bare `Map.set` per coverage entry, so a duplicate key there is
last-writer-wins, not a merge.

One consequence worth stating: a list's pools are written back to the consumer's cache on exit, like
anything else the run learned. Its coverage is not, unless it was adopted.

### `https` yes, `http` no

The integrity hash lives in the same file it protects. It defends against corruption and truncation,
**not** against an attacker who can rewrite the response — such an attacker rewrites the hash too.
Transport authenticity is the only thing standing between a remote list and arbitrary coverage
suppression, so the plaintext scheme is not offered at all rather than offered with a warning nobody
reads.

---

## Measured (mainnet, 2026-08-07, keyed archive endpoint)

The list: built from a cache warmed by one unbounded `rl discover usdc` (complete v2/v3/v4
discovery, 655,193 pools, 275 MB). Curation kept **655,193 pools / 0 dropped** and claimed **8 of 8**
coverage scopes — v2/v3/v4 adjacency for WETH and USDC, the v4 `pair:USDC-WETH` scope, and the v3
factory's fee-discovery scope. Nothing was dropped because everything the source knew was inside a
claimed scope: this cache came from exactly the scan a list wants to publish. Live verification
probed 594 pools (every pool in the claimed pair scope plus a 200-pool stride sample) through
Multicall3 in ~4 requests; all 594 existed. The published file is 274.66 MB.

The consumer: `rl quote XPR USDC 100` — a long-tail token with 13 WETH pools across v2/v3/v4 and **no
USDC pool at all**, so wave-0 speculative direct probes cannot resolve it and the search has to reach
the adjacency the list carries. Every run starts from an empty cache directory; `eth_getLogs` counted
at the transport.

| run | wall clock | `eth_getLogs` | `eth_call` |
|---|---|---|---|
| cold, no list | 4.6 s | **26** | 17 |
| `--pool-list` (Tier B) | 8.3 s | **26** | 18 |
| `--pool-list --trust-coverage` (Tier A) | 5.7 s (1.3 s search) | **2** | 18 |
| cold, no list, `--watch` (full bounded search) | 26.0 s | 120 | 32 |
| Tier A, `--watch` | **9.2 s** | 162 | 23 |

Read it this way:

- **Tier A collapses the scans, exactly as designed: 26 → 2 `eth_getLogs`**, the 2 being the standing
  reorg-overlap re-scans, i.e. the floor. On the full bounded search it is 2.8× on wall clock.
- **Tier B changes the RPC profile not at all (26 → 26)**, which is the tier working: the pools
  arrive, the ranges are re-scanned anyway.
- **At this list size the wall clock is a wash on a short search**, because loading and hydrating a
  275 MB / 655k-pool list costs ~4.2 s of the Tier A run's 5.7 s. The search itself went 3.5 s → 1.3 s.
  A list this large is the wrong shape for a single quote and the right shape for a process that will
  run many; `--max-pools` exists for the other case.
- **`--watch` Tier A issues MORE `eth_getLogs` and still finishes 2.8× sooner** (162 vs 120). That is
  not a contradiction: the cold run's requests are a handful of enormous full-history sweeps, and the
  warm run's are many cheap delta and pair scans it had the time to reach. Request count is the wrong
  axis once coverage exists; wall clock is the right one.

**One thing the numbers say that is not about pool lists.** Every warm variant found a *worse* best
route than the cold run (0.2575 → 0.0171 USDC on the short search, → 0.1081 on the full one). A
control run with no list at all, against the same 655k-pool cache, reproduces it (0.0460) — so this
is the pre-existing behaviour of a very large index under `MAX_POOLS_PER_LEG` / `MAX_INTERMEDIATES`
pruning, not something a list introduces. It is worth knowing before anyone treats "load a big list"
as a pure win.

---

## What phase 2 adds

- **A `'list'` provenance tier** on `PoolRecord`, so a consumer can tell an imported pool from one it
  discovered — and so ranking, eviction and `rl discover`'s output can say so. Today an imported pool
  is indistinguishable from a locally probed one (`'factory'`) or a locally scanned one (`'event'`).
- **A merge API in the SDK**, replacing the CLI-side hydration in `cli/poolList.ts`. Phase 1
  deliberately touched no `src/` runtime semantics; the merge is expressible entirely in public
  `PoolIndex` methods, which is why it could live in the CLI at all.
- **Detached signatures**, which is what finally lets Tier A be decided by cryptography rather than by
  an operator typing a flag — and what makes `https` fetching of a third-party list a reasonable
  default rather than a considered risk.
