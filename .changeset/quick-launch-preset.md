---
'@uniswap/liquidity-launcher-sdk': minor
---

Add the canonical quick-launch definition as the single source of truth for CCA "quick launches", replacing the two drifting client copies (universe's `quickLaunchAuction.ts` heuristic and the create flow's `quickLaunchPreset.ts`).

- `QUICK_LAUNCH_PRESET` — the frozen, defining CCA parameter set: CCA auction type, instant start, 4h duration (14400s, superseding the old 30m/1h/4h set), 1B fixed supply (1e27 @ 18dp), native (ETH) raise, ~$5k floor FDV, 50/50 supply split, V4 LP (0.25% fee tier, full-range + concentrated, permanent buyback-&-burn timelock), and the fixed convex emission curve.
- `isQuickLaunch(params, options?)` — a pure, deterministic, address-free matcher that classifies a CCA auction's on-chain parameters against the preset. Usable client-side (universe) and server-side (data-api). Matches on native raise, 1B supply, and the 4h window (with the 50/50 reserve and permanent buyback-&-burn lock as optional refinements); duration is 4h-only by default, with an opt-in override for historical 30m/1h windows.
- Field constants (`QUICK_LAUNCH_DURATION_SECONDS`, `QUICK_LAUNCH_TOTAL_SUPPLY_RAW`, `QUICK_LAUNCH_RESERVED_FOR_LP_RAW`, etc.) and `getQuickLaunchDurationBlocks(chainId)`.

The LP fee tier (0.25% vs 0.3%) and the $50k graduation FDV are marked pending final sign-off in code comments. This classifier is a cosmetic / discovery descriptor only and, being reproducible by construction, must not gate suppression of security warnings.
