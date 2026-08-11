# `docs/` — what is in here, and which of it is still true

Documents in this directory are **dated artifacts, not living documentation**: each was written at a
moment and is kept as written, so the `Status` column below — not the prose inside — is what tells
you whether to read a document as current behavior, as a snapshot of a moment, or as history. The
package `README.md` and `cli/README.md` are the only always-current descriptions of what the code
does today; where a document here disagrees with them, they win.

| Doc | What it is | Date | Status |
| --- | --- | --- | --- |
| [`pool-lists.md`](./pool-lists.md) | The published-snapshot format, the trust tiers a consumer imports at, the publisher script, and what phase 2 adds. | 2026-08-11 | **CURRENT** |
| [`event-core-review.md`](./event-core-review.md) | Capstone review of the event-core branch: coherence pass, live performance evaluation, test-suite verdict, residual-risk list. | 2026-08-11 | **POINT-IN-TIME** |
| [`architecture-review.md`](./architecture-review.md) | First-principles architecture review of the pre-refactor wave engine — the document the event-core redesign was written against. | 2026-08-10 | **HISTORICAL** |
| [`code-quality-review.md`](./code-quality-review.md) | Companion code-quality review of the same pre-refactor tree: bugs, comment-volume drift, duplication, type-tightness gaps. | 2026-08-10 | **HISTORICAL** |

**What the three statuses mean.** **CURRENT** — maintained, and describing the code as it is now.
**POINT-IN-TIME** — accurate for the commit it was written at; its structural findings still hold,
but specific figures and rules may since have moved (the banner at the top of the file says which).
**HISTORICAL** — describes code that no longer exists, kept because a later design was written from
it; read it for the reasoning, never for the current shape.

The design specs these reviews fed into live outside this package, in the monorepo root:
`docs/superpowers/specs/2026-08-10-event-driven-search-core-design.md` (with its amendments and
post-v1 addendum) and `docs/superpowers/specs/2026-08-03-router-lite-sdk-design.md`.
