# margin-sdk demos

End-to-end validation that the SDK can drive **every flow the v4-periphery margin contract tests
exercise**, against the **live mainnet deployment** (router, adapters, Morpho Blue, Aave v3,
Aave v4, and the real USDC/WETH 0.05% v4 pool) on an anvil fork. The sender is the margin
deployer/governance EOA (`0x58e28b95a2ee57c4E90613AFce9e8CCEED3aB1E8`), impersonated by anvil.

```bash
bun run demo                 # all flows on one fork
bun demo/01-long-lifecycle.ts  # or any single flow
MARGIN_DEMO_RPC=<url> bun run demo   # custom fork RPC (defaults to publicnode)
```

Requires [foundry](https://getfoundry.sh) (`anvil` on the PATH). Each flow boots (or shares) a
fork pinned ~32 blocks below head, funds the sender with `deal`-style storage writes, and runs
every transaction through `simulateContract` → `writeContract` with receipt-status checks — a
revert anywhere fails the run.

| Demo | Mirrors (v4-periphery test)                                                                          | What it proves                                                                                                                                                                                                                                  |
| ---- | ---------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `01` | `MarginRouterIntegration.t.sol`, `MarginRouterE2E.fork.t.sol`                                        | Full long lifecycle on Morpho: offchain `accountOf` prediction, Permit2 setup, quoter-sized 2x open, event decoding, SDK-vs-onchain health math, top-up, leverage-only increase, partial delever, full close with residual returned.            |
| `02` | `MarginRouterNative.t.sol`                                                                           | Native-ETH equity: open and top up with raw `msg.value` (no approvals), close returns WETH.                                                                                                                                                     |
| `03` | `AaveLendingAdapter.fork.t.sol`, `AaveV4LendingAdapter.fork.t.sol`, `MarginRouterShortInverse.t.sol` | Short ETH (collateral USDC / debt WETH, reversed decimals) with identical SDK code on Aave v3 **and** Aave v4 — only the adapter address changes; the 78% USDC liquidation threshold reads back on both.                                        |
| `04` | `MarginRouterCrossVenueHedge.fork.t.sol`                                                             | Delta-neutral long (Morpho) + short (Aave v3) under one owner on isolated sub-accounts; net ETH delta within live-pool swap impact; closing one leg leaves the other untouched.                                                                 |
| `05` | `MarginRouterExecute.t.sol`, `MarginRouterExecute.fork.t.sol`                                        | The `execute` entry point: a raw `MarginPlanner` plan reproducing the curated open action-for-action, a repay-from-wallet plan no curated entry can express, and the owner-only `MarginAccount.execute` escape hatch acting on Morpho directly. |

Anvil-fork notes baked into the harness (`lib/env.ts`, `lib/helpers.ts`):

- the fork is pinned below head because load-balanced public RPCs serve inconsistent tip state;
- sends carry padded gas — anvil's fork-mode `eth_estimateGas` runs a hair low on lazily-loaded
  cold slots;
- Aave reads are aToken-rebasing (± wei) and Morpho debt accrues per block, so cross-block
  assertions use tolerances where the venue's accounting demands it.
