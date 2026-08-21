---
'@uniswap/liquidity-launcher-sdk': major
---

`isPermanentTimelock` now always judges permanence from the real time horizon past the auction end. The chain-agnostic raw-block form is removed, along with the `PERMANENT_UNLOCK_BLOCK_THRESHOLD` export it used.

**Breaking:**

- `PERMANENT_UNLOCK_BLOCK_THRESHOLD` is deleted.
- `PermanentTimelockParams` no longer accepts `{unlockBlock}` alone — the block form requires `chainId` and `endBlock`. The timestamp form and the structural (`'burn'` / `'creatorFees'`) short-circuit are unchanged.

**Why:** the threshold could not express "1000 years" on every chain — it was ~76,000 years at 12 s/block and only ~634 at 0.1 s — so which locks it caught depended on the chain it happened to be applied to. It also could not see a genuinely permanent lock on a slow chain at all: a 1000-year horizon is ~2.6e9 blocks at 12 s, three orders of magnitude under the 2e11 bound. The horizon is derivable wherever the auction is in hand, so the approximation had no remaining reason to exist: the only production caller (data-api's quick-launch classifier) already passed `chainId`/`endBlock`, and the serving path that motivated the raw form has both available at its call site.

**One behavior change in the field.** A lock whose stored unlock block was converted at a block time the chain no longer runs at now re-derives to its true horizon. Chain 4663 has exactly one such row — auction `4663_0xC5EdF1…` (2026-07-08), horizon `PERMANENT_TIMELOCK_REQUEST_SECONDS / 12` = 262,800,000,000 blocks, i.e. the 100,000-year Permanent preset converted at 12 s/block a day before that chain's 0.1 s cadence was registered. At the real cadence it is 833 years, so it is now finite. That matches what the classifier already stored for it (`is_quick_launch = false`); previously the raw-block form made the serving path disagree with the classifier on the same lock. Verified against all 2,642 production `auction_liquidity_locks` rows: this is the only row where the two rules differ.
