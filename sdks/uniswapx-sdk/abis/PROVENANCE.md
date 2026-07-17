# ABI provenance

The JSON files in this directory are **compiled contract artifacts (or hand-authored ABIs)
copied from upstream contract repos**, not generated from source in this repo. At build time
`bun run typechain` turns them into the ethers bindings committed under
[`src/contracts`](../src/contracts) (see the `typechain` script in `package.json`).

They are **build-time inputs only** — they are not part of the published package
(`"files": ["dist"]`), so reformatting or refreshing them never changes what consumers install
directly; it changes the generated `src/contracts` bindings, which are compiled into `dist`.

## Drift risk

Nothing here re-derives these artifacts and, historically, nothing recorded which upstream
commit each one came from. That means they can **silently go stale**: an upstream reactor,
resolver, or hook can change its ABI while the copy in this repo keeps describing the old
interface, and the generated bindings keep encoding/decoding against the outdated shape. There
is **no automatic upstream-drift check** — there is no published npm artifact to diff against
(unlike `v2-sdk`/`v3-sdk`, which recompute an init-code hash from `@uniswap/v2-core` /
`@uniswap/v3-core` and assert equality in their `constants.test.ts`).

This is the same class of problem as the liquidity-launcher stale-bytecode incident fixed in
[Uniswap/sdks#648](https://github.com/Uniswap/sdks/pull/648) — a hand-copied upstream artifact
pinned to nothing, with no refresh path. The blast radius here is smaller: the embedded
bytecode only deploys mocks in integration tests, and the ABIs drive typed encode/decode rather
than a CREATE2 address prediction that holds user funds. But the mechanism is identical, so this
package gets the same treatment: a recorded manifest + a deterministic refresh script.

See [`../scripts/regenerate-abis.ts`](../scripts/regenerate-abis.ts) and
[`Maintaining the contract ABIs`](../README.md#maintaining-the-contract-abis) in the README.

## Pinned upstream commits

The commit each artifact was copied from was **not recorded** when these files were first added
(the monorepo migration squashed their history), so the pins below are empty until the next
scripted refresh stamps them. `bun run regenerate:abis` writes the resolved commit back here.

- **uniswapx** pinned commit: `` (unrecorded — https://github.com/Uniswap/UniswapX)
- **permit2** pinned commit: `` (unrecorded — https://github.com/Uniswap/permit2)

## What is refreshed by the script vs. hand-maintained

`scripts/regenerate-abis.ts` refreshes only the `scripted` foundry artifacts owned by
Uniswap/UniswapX and Uniswap/permit2. Everything else is maintained by hand — update it
deliberately and record the change here.

### Scripted (refreshed from a `forge build` of the upstream repo)

| ABI file | Upstream repo | Source · contract | solc |
| --- | --- | --- | --- |
| `ExclusiveDutchOrderReactor.json` | UniswapX | `src/reactors/ExclusiveDutchOrderReactor.sol` · `ExclusiveDutchOrderReactor` | 0.8.19 |
| `ExclusiveFillerValidation.json` | UniswapX | `src/sample-validation-contracts/ExclusiveFillerValidation.sol` · `ExclusiveFillerValidation` | 0.8.19 |
| `HybridAuctionResolver.json` | UniswapX | `src/v4/resolvers/HybridAuctionResolver.sol` · `HybridAuctionResolver` | 0.8.30 |
| `ISuperstateTokenV4.json` | UniswapX | `src/interfaces/ISuperstateTokenV4.sol` · `ISuperstateTokenV4` (interface) | 0.8.28 |
| `MockERC20.json` | UniswapX | `test/util/mock/MockERC20.sol` · `MockERC20` | 0.8.16 |
| `OrderQuoter.json` | UniswapX | `src/lens/OrderQuoter.sol` · `OrderQuoter` | 0.8.19 |
| `OrderQuoterV4.json` | UniswapX | `src/v4/lens/OrderQuoterV4.sol` · `OrderQuoterV4` | 0.8.30 |
| `PriorityOrderReactor.json` | UniswapX | `src/reactors/PriorityOrderReactor.sol` · `PriorityOrderReactor` | 0.8.24 |
| `Reactor.json` | UniswapX | `src/v4/Reactor.sol` · `Reactor` | 0.8.30 |
| `RelayOrderReactor.json` | UniswapX | `src/reactors/RelayOrderReactor.sol` · `RelayOrderReactor` | 0.8.24 |
| `SwapRouter02Executor.json` | UniswapX | `src/sample-executors/SwapRouter02Executor.sol` · `SwapRouter02Executor` | 0.8.19 |
| `TokenTransferHook.json` | UniswapX | `src/v4/hooks/TokenTransferHook.sol` · `TokenTransferHook` | 0.8.30 |
| `V2DutchOrderReactor.json` | UniswapX | `src/reactors/V2DutchOrderReactor.sol` · `V2DutchOrderReactor` | 0.8.24 |
| `V3DutchOrderReactor.json` | UniswapX | `src/reactors/V3DutchOrderReactor.sol` · `V3DutchOrderReactor` | 0.8.24 |
| `Permit2.json` | permit2 | `src/Permit2.sol` · `Permit2` | 0.8.17 |

### Hand-maintained (the script leaves these untouched)

| ABI file | Origin | Why not scripted |
| --- | --- | --- |
| `ERC1967Proxy.json` | OpenZeppelin (`contracts/proxy/ERC1967/ERC1967Proxy.sol`, solc 0.8.27) | Third-party `contracts/` layout, not a UniswapX `src/` path. |
| `MockDSTokenInterface.json` | `contracts/MockDSTokenInterface.sol` (solc 0.8.26) | Third-party `contracts/` layout test mock. |
| `Proxy.json` | `contracts/Proxy.sol` (solc 0.8.26) | Third-party `contracts/` layout. |
| `DSTokenInterface.json` | interface ABI, no compiler metadata | Hand-maintained interface consumed by `PermissionedTokenValidator`. |
| `MockSuperstateTokenV4.json` | hardhat-format artifact (`hh-sol-artifact-1`) | Built with a different toolchain; provenance unrecorded. |
| `multicall2.json` | hand-authored ABI array | Standard Multicall2 helper, no bytecode. |
| `deploylessMulticall2.json` | hand-authored ABI array | Standard Multicall helper, no bytecode. |

> Note on stale generated files: `src/contracts` also contains `DutchOrderReactor.ts` and
> `DutchLimitOrderReactor.ts` (plus their factories) that have **no** backing ABI here — they
> are leftovers from ABIs that were removed without regenerating `src/contracts` from scratch
> (typechain does not delete). `EventWatcher.ts` still imports the `FillEvent` type from
> `../contracts/DutchOrderReactor`, so they cannot simply be deleted without a code change.
> This is tracked as a follow-up, not addressed by the refresh script (which is additive, like
> the build's own `typechain` step, and does not remove orphaned bindings).
