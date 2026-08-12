# @uniswap/margin-sdk

A framework-agnostic TypeScript SDK for the **Uniswap v4 margin trading periphery**: open, manage,
and close leveraged spot positions built from a **Universal Router** swap (sourcing v2/v3/v4
liquidity) composed with a borrow/supply against an external lending venue — **Morpho Blue,
Aave v3, Aave v4, or Compound v3** — all behind one `MarginRouter`.

The SDK covers:

- **Calldata + write descriptors** for every router entry point (`increasePosition`,
  `decreasePosition`, `addCollateral`, `execute`, `multicall`, forwarded Permit2 `permit`),
  validated against the deployed contracts byte-for-byte.
- **Offchain account derivation** — `predictMarginAccountAddress` mirrors `router.accountOf`
  (Solady clone-with-immutable-args CREATE2) with no RPC round-trip.
- **Leverage & health math** — decimal-aware position sizing (`sizeIncrease` / `sizeDecrease`),
  leverage↔LTV conversions, health factors, slippage helpers.
- **Universal Router route builders** — the position swap is a caller-built UR command plan
  supplied per call; `buildV4ExactOutRoute` covers the canonical single-pool v4 case.
- **A plan builder** (`MarginPlanner`) for the advanced `execute` entry point: compose v4 routing
  actions, `ROUTE_SWAP` Universal Router legs, and margin account actions into one atomic
  flash-accounted plan.
- **Read descriptors** that drop into wagmi `useReadContract(s)` / viem `readContract`, identical
  across all lending venues.

Built on [viem](https://viem.sh); no other runtime dependencies.

## How a position works

A margin position is leveraged spot exposure assembled in a single transaction inside one
`PoolManager` unlock: borrow the **debt** token, swap it into the **collateral** token
(exact-output, routed through the Universal Router you supply per call — so liquidity can come
from v2, v3, and v4), and supply the collateral (your equity plus the bought amount) to the
lending market. The position is **long the collateral and short the debt** — direction is set entirely by
the `(collateral, debt)` pairing, there is no separate flag:

| Goal               | Market                             | Resulting position  |
| ------------------ | ---------------------------------- | ------------------- |
| Long WETH vs USDC  | `{ collateral: WETH, debt: USDC }` | hold WETH, owe USDC |
| Short WETH vs USDC | `{ collateral: USDC, debt: WETH }` | hold USDC, owe WETH |

Each position lives in a per-user **`MarginAccount`** — a soulbound clone addressed by
`(owner, subId)` — which is itself the borrower/supplier on the lending venue. One owner can hold
many independent positions under distinct `subId`s (e.g. a delta-neutral long + short pair).

## Install

```bash
npm install @uniswap/margin-sdk viem
```

## Quickstart: open a 2x long

```ts
import { createPublicClient, createWalletClient, custom, erc20Abi, http, parseUnits } from 'viem'
import { mainnet } from 'viem/chains'
import {
  buildV4ExactOutRoute,
  getMarginAccountAddress,
  getMarginAddresses,
  increasePositionCall,
  parseLeverageX18,
  permit2ApproveCall,
  sizeIncrease,
  toPoolKey,
} from '@uniswap/margin-sdk'

const addresses = getMarginAddresses(mainnet.id)!
const publicClient = createPublicClient({ chain: mainnet, transport: http() })
const walletClient = createWalletClient({ chain: mainnet, transport: custom(window.ethereum) })

const WETH = addresses.weth9
const USDC = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48'
const market = { collateral: WETH, debt: USDC } // long WETH, short USDC

// 1. Size the swap from equity + target leverage. The price MUST come from a real quote
//    (debt-wei per one whole collateral token), not spot; maxDebtIn is the binding slippage cap.
const equity = parseUnits('1', 18) // 1 WETH
const { collateralToBuy, maxDebtIn } = sizeIncrease({
  equity,
  leverageX18: parseLeverageX18(2),
  priceDebtPerCollateralToken: parseUnits('3000', 6), // 3000 USDC/WETH quote
  collateralDecimals: 18,
  slippageBps: 50,
})

// 2. Build the swap route: a Universal Router command plan that buys collateralToBuy
//    exact-output and delivers it to YOUR MarginAccount (derived offchain). The single-pool v4
//    case is one helper call; multi-hop or cross-version routes come from the
//    universal-router-sdk. The Universal Router is a per-call parameter — pass a deployment with
//    already-unlocked V4_SWAP support.
const account = getMarginAccountAddress(mainnet.id, owner, 0n)
const poolKey = toPoolKey({ currencyA: WETH, currencyB: USDC, fee: 500, tickSpacing: 10 })
const route = buildV4ExactOutRoute({
  poolKey,
  input: USDC, // the debt the router flash-takes and the UR spends
  output: WETH, // the collateral the route buys
  amountOut: collateralToBuy,
  amountInMaximum: maxDebtIn,
  recipient: account,
})

// 3. One-time Permit2 setup for the equity token:
//    ERC20.approve(permit2) then Permit2.approve(token, router).
await walletClient.writeContract({
  account,
  address: WETH,
  abi: erc20Abi,
  functionName: 'approve',
  args: [addresses.permit2, 2n ** 256n - 1n],
})
await walletClient.writeContract({
  account,
  ...permit2ApproveCall({ permit2: addresses.permit2, token: WETH, spender: addresses.marginRouter, amount: equity }),
})

// 4. Simulate (surfaces decoded reverts), then send.
const { request } = await publicClient.simulateContract({
  account: owner,
  ...increasePositionCall({
    marginRouter: addresses.marginRouter,
    params: {
      adapter: addresses.lendingAdapters.morphoBlue!,
      market,
      equity,
      collateralToBuy,
      maxDebtIn,
      universalRouter, // your chosen UR deployment (must carry already-unlocked V4_SWAP)
      routeCommands: route.commands,
      routeInputs: route.inputs,
      deadline: BigInt(Math.floor(Date.now() / 1000) + 900),
    },
  }),
})
await walletClient.writeContract(request)
```

**Native ETH equity**: pass `nativeEquity` instead (the router wraps it to WETH; the market
collateral must be WETH, and `params.equity` must be `0n`):

```ts
increasePositionCall({
  marginRouter: addresses.marginRouter,
  params: { ...params, equity: 0n },
  nativeEquity: parseUnits('1', 18),
})
```

## Read a position

```ts
import { getMarginAccountAddress, getPosition, healthFactor } from '@uniswap/margin-sdk'

// No RPC needed for the account address — it's a pure function of (owner, subId, deployment).
const account = getMarginAccountAddress(mainnet.id, owner, 0n)

const position = await getPosition(publicClient, {
  adapter: addresses.lendingAdapters.morphoBlue!,
  account,
  market,
})
// { collateralAmount, debtAmount, maxLtv, currentLtv, healthFactorWad } — interest-accrued,
// WAD ratios (1e18 == 100%).
```

Every read also has a pure `*Call` descriptor (e.g. `describePositionCall`, `positionOfCall`,
`isSupportedMarketCall`) for wagmi `useReadContracts` / viem `multicall`.

## Close or delever

```ts
import {
  FULL_CLOSE,
  buildV4ExactOutRoute,
  closePositionCall,
  decreasePositionCall,
  measureBorrowRatePerSecond,
  sizeDecrease,
  sizeFullClose,
} from '@uniswap/margin-sdk'

// Full close: repay all debt, withdraw all collateral, return the residual (realized PnL).
// The close route must buy AT LEAST the live debt, and debt keeps accruing between the quote and
// inclusion. Size the over-buy from the position's own realized accrual rather than a flat
// haircut: measure the per-second growth from two positionOf reads, project it over the expected
// inclusion horizon, and keep swap slippage as a separate cap. Over-bought debt is returned to
// the caller after the unlock, so a tight buffer means less swapped and less returned.
// Caveat: the measurement window must not contain a mutation of the position (see the docstring).
const { ratePerSecondWad } = await measureBorrowRatePerSecond(publicClient, { adapter, account, market })
const { debtToBuy, maxCollateralIn } = sizeFullClose({
  debtAmount: position.debtAmount,
  ratePerSecondWad,
  horizonBlocks: 10n, // expected blocks until inclusion (12s mainnet blocks)
  priceCollateralPerDebtToken: parseUnits('0.000333333333333333', 18), // WETH per USDC quote
  debtDecimals: 6,
  slippageBps: 100,
})
const closeRoute = buildV4ExactOutRoute({
  poolKey,
  input: WETH, // the collateral sold
  output: USDC, // the debt bought back
  amountOut: debtToBuy,
  amountInMaximum: maxCollateralIn,
  recipient: account,
})
const close = closePositionCall({
  marginRouter: addresses.marginRouter,
  params: {
    adapter,
    market,
    maxCollateralIn,
    universalRouter,
    routeCommands: closeRoute.commands,
    routeInputs: closeRoute.inputs,
    deadline,
  },
})

// Partial delever: repay a fixed amount and bound the resulting LTV (mandatory). The route buys
// exactly debtToRepay.
const delever = decreasePositionCall({
  marginRouter: addresses.marginRouter,
  params: {
    adapter,
    market,
    debtToRepay: parseUnits('1000', 6),
    maxCollateralIn,
    universalRouter,
    routeCommands: deleverRoute.commands, // buildV4ExactOutRoute({ ..., amountOut: debtToRepay })
    routeInputs: deleverRoute.inputs,
    maxLtvAfter: parseUnits('0.7', 18), // keep LTV ≤ 70%, must sit strictly below 100%
    deadline,
  },
})
```

Closing and delevering **never** require the adapter to be allowlisted, so a position is always
exitable — even if its adapter is later removed from governance's allowlist.

## Withdraw collateral (without touching debt)

`decreasePosition` withdraws collateral as part of repaying debt. To pull collateral out while
leaving debt untouched — de-risking, or taking excess equity off the table — there is no curated
entry point (the router's only write entry points are `increasePosition`, `decreasePosition`,
`addCollateral`, and `execute`), so this composes the `IMarginAccount.withdrawCollateral` primitive
into a minimal `execute` plan:

```ts
import { executeCall, getPosition, withdrawCollateralPlan } from '@uniswap/margin-sdk'

const position = await getPosition(publicClient, { adapter, account, market })

const unlockData = withdrawCollateralPlan({
  adapter,
  market,
  amount: position.collateralAmount / 4n, // explicit — read live, never a sentinel
  to: owner, // must be the account's owner or the router
  maxLtvAfter: (position.maxLtv * 80n) / 100n, // mandatory: keep 20% headroom
})

const call = executeCall({ marginRouter: addresses.marginRouter, unlockData, deadline })
```

Three things the helper enforces that a hand-rolled plan does not:

- **The recipient must be a literal address** — the account's owner or the MarginRouter. Unlike the
  router-level `TAKE`/`SWEEP` opcodes, the `ACCOUNT_*` actions are **not** run through
  `_mapRecipient`, so the `MSG_SENDER`/`ADDRESS_THIS` sentinels arrive at the account as the literal
  addresses `0x…01`/`0x…02` and revert `ReceiverNotAllowed`.
- **The amount must be explicit.** `OPEN_DELTA` is not a full-balance sentinel on this action: it
  resolves to the router's open delta owed to the pool, which is the correct amount inside a
  swap-bearing delever but **zero** in a swap-free withdrawal — silently withdrawing nothing.
- **`maxLtvAfter` is mandatory.** Withdrawing raises LTV and `ASSERT_HEALTH` skips a zero bound, so
  an unbounded withdrawal can walk a position to the liquidation edge in one transaction.

To exit a WETH-collateral position as native ETH, withdraw `to: addresses.marginRouter` and continue
the plan with `unwrap` + `sweep` rather than using the helper.

Withdrawals are not allowlist-gated either — like closing, a position must always be exitable.

**Owner escape hatch.** The account's primitives are callable by `{manager, owner}`, so the owner can
withdraw directly without the router if it is ever deprecated, paused, or compromised:

```ts
import { accountWithdrawCollateralCall, getMarginAccountAddress } from '@uniswap/margin-sdk'

const call = accountWithdrawCollateralCall({
  account: getMarginAccountAddress(mainnet.id, owner, 0n),
  params: { adapter, market, amount, to: owner },
})
```

This path carries **no** health assertion — the lending venue's own borrow-limit check is the only
backstop, so an unsafe withdrawal reverts inside the venue rather than with `PositionUnhealthy`.
Prefer the router path for normal operation.

The sibling primitives are encoded the same way, for recovering a position when the router is
unavailable: `accountSupplyCollateralCall`, `accountRepayCall` (pass `FULL_CLOSE` for a share-based
full repay that leaves no interest dust), `accountBorrowCall`, and `accountSweepCall` (pass the zero
address as the currency to sweep native ETH). All of them supply from or deliver to the account
itself, so they never pull from the owner's wallet, and `borrow` bypasses both the adapter allowlist
and any health assertion — use `increasePositionCall` instead unless the router is unavailable.

## Going short & venue selection

A short is the same call with the market pairing reversed and the venue chosen per call by
adapter — nothing else changes:

```ts
const shortMarket = { collateral: USDC, debt: WETH }
const shortRoute = buildV4ExactOutRoute({
  poolKey, // same USDC/WETH pool — direction comes from input/output
  input: WETH, // the debt sold on a short open
  output: USDC, // the collateral bought
  amountOut: collateralToBuy,
  amountInMaximum: maxDebtIn,
  recipient: shortAccount, // getMarginAccountAddress(chainId, owner, 1n)
})
const params = {
  adapter: addresses.lendingAdapters.aaveV3!, // or aaveV4, compoundV3
  market: shortMarket,
  equity: parseUnits('3000', 6), // ⚠️ USDC decimals now
  collateralToBuy, // 6-decimal USDC
  maxDebtIn, // 18-decimal WETH
  universalRouter,
  routeCommands: shortRoute.commands,
  routeInputs: shortRoute.inputs,
  subId: 1n, // isolate from the long under subId 0
  deadline,
}
```

Mind the decimals: for a short, `equity`/`collateralToBuy` are in the collateral token's decimals
(USDC: 6) and `maxDebtIn` in the debt token's (WETH: 18) — `sizeIncrease` handles this when given
the correct `collateralDecimals` and a correctly-scaled price. **Keep one Aave position per
`subId`**: Aave (v3 and each v4 Spoke) tracks health account-wide, so co-locating two Aave markets
under one sub-account blends their reads and can break a later decrease/close. Morpho markets are
isolated and unaffected.

## Advanced: `execute` plans

`execute(unlockData, deadline)` runs an arbitrary plan of v4 routing + margin actions atomically —
flows the curated entry points cannot express (adjust margin and leverage together, migrate
between sub-accounts, repay from the wallet). `MarginPlanner` builds and validates the plan:

```ts
import { MarginPlanner, OPEN_DELTA, MSG_SENDER, executeCall } from '@uniswap/margin-sdk'

// Repay 500 USDC of debt straight from the caller's wallet (no swap, no withdraw):
const unlockData = new MarginPlanner()
  .setAccount(0n) // bind the caller's sub-account 0 (always caller-derived)
  .pullToAccount(USDC, parseUnits('500', 6), true) // pull via Permit2
  .repay(adapter, market, parseUnits('500', 6))
  .assertHealth(adapter, market, parseUnits('0.8', 18)) // opt-in health guard
  .finalize()

const call = executeCall({ marginRouter: addresses.marginRouter, unlockData, deadline })
```

`execute` performs **no entry validation** — the plan carries exactly the guardrails it encodes.
Encode swap bounds, `assertFill` after exact-output swaps, `assertHealth` per touched account, and
terminate with `sweep` for every currency the plan may leave on the router (residuals are
claimable by the next caller). The planner enforces the structural rules it can check offchain
(account-scoped actions need a preceding `setAccount`; `pullToAccount` rejects the zero-amount and
`CONTRACT_BALANCE`-from-user footguns).

> ⚠️ **Signing an `execute` plan is equivalent to handing over the sub-account.** A malicious plan
> can borrow to the market maximum and direct everything to an arbitrary address with no token
> approval required. Never execute a plan built by an untrusted party — build the calldata
> yourself with `MarginPlanner`.

## Deployments

Resolved via `getMarginAddresses(chainId)`; Ethereum mainnet today:

| Contract                     | Address                                      |
| ---------------------------- | -------------------------------------------- |
| MarginRouter                 | `0x00000000000Dc78b00e36d3a7997Bd9c4cd9F1f0` |
| MarginAccount implementation | `0x36e5317CEE9F70c0A41A97A4676899Dfe9a10239` |
| MorphoLendingAdapter         | `0x08e4C6b61D99B6f2AD472c16ECE641F63F5635D5` |
| AaveLendingAdapter (v3)      | `0x2c0bDc6786D285665337Ce7d544C8bC80a23A55C` |
| AaveV4LendingAdapter         | `0xaC98DBcdC8c9f665372BbBE68C6A9123A8CbA6Eb` |
| CompoundV3LendingAdapter     | `0xAaD2B75B9557748a16216f991613deFE42134c36` |

The **Universal Router is deliberately not in this table**: it is a per-call parameter of the
position flows, so callers pick the deployment their route targets. It must carry already-unlocked
`V4_SWAP` support (universal-router PR #491) — deployments that predate it revert.

The SDK's ABIs, selectors, and account derivation are test-anchored against this live deployment
(see `src/*.test.ts`).

> The margin contracts ([v4-periphery#563](https://github.com/Uniswap/v4-periphery/pull/563)) are
> still in review and router governance has not yet moved to a timelock/multisig, so the package
> is published as a `0.0.x` pre-release until the deployment is final.

## Validation gates

Beyond the unit suite (`bun test`), three gates validate what unit tests structurally cannot:

- **`bun run check:package`** — packs the publish artifact, installs it into an isolated consumer
  with only its declared dependencies resolvable, and loads it under **native Node in both module
  systems** (CJS `require` + ESM `import`) plus the **browser target** (a static scan proving the
  shipped ESM references no Node builtins, and a jsdom-globals load), running a real
  account-derivation vector in each. Catches undeclared runtime deps, extensionless ESM emit,
  missing module-type markers, and accidental Node-only imports. Runs as part of `test`.
- **`bun run check:abis`** — the margin-contract ABIs are **forge-generated, never hand-written**:
  `src/generated/abis.ts` is produced by `bun run regenerate:abis` from a v4-periphery checkout
  **pinned to a specific commit** (recorded in the file header). The check mode recompiles the
  pinned commit and diffs the regenerated bindings against the committed file; the
  `margin-sdk-abi-check` CI workflow runs it on every PR touching the package, cloning
  v4-periphery at the pin. viem encodes tuples positionally, so this closes the
  silent-wrong-calldata risk of a contract field reorder. When the contracts move, re-pin with
  `bun scripts/generate-abis.ts --update-pin` against the new checkout.
- **`bun run test:fork`** — the end-to-end demo suite against an anvil mainnet fork (see below);
  runs inside `test` when `FORK_URL` (or `MARGIN_DEMO_RPC`) is set and skips cleanly otherwise,
  so CI with the `FORK_URL` secret exercises the SDK against the live deployment on every run.

## End-to-end demos

[`demo/`](./demo) contains runnable flows that validate the SDK against the live deployment on an
anvil mainnet fork — each mirrors a v4-periphery contract test: the full long lifecycle,
native-ETH equity, Aave v3/v4 shorts, a cross-venue delta-neutral hedge on sub-accounts, and raw
`execute` plans (including a `MarginPlanner` reconstruction of the curated open and the owner
escape hatch). With [foundry](https://getfoundry.sh) installed:

```bash
bun run demo
```

## Error handling

All SDK validation throws `MarginSdkError` with a stable `code`
(`INVALID_LEVERAGE`, `INVALID_AMOUNT`, `AMOUNT_OVERFLOW`, `SLIPPAGE_BOUND_REQUIRED`,
`INEFFECTIVE_LTV_BOUND`, `UNIVERSAL_ROUTER_REQUIRED`, `MARKET_MISMATCH`, `INVALID_PLAN`, …) —
catch with `isMarginSdkError` and forward. Onchain reverts (`SlippageBoundRequired`, `ZeroAmount`,
`IneffectiveLtvBound`, `UniversalRouterNotSet`, `PositionUnhealthy`, `AdapterNotAllowed`,
`DeadlinePassed`, `NativeCollateralMismatch`, `IncompleteFill`, …) are declared in
`MARGIN_ROUTER_ABI`, so viem's `simulateContract` decodes them into readable messages — always
simulate before writing.

## Reference

Full protocol and integration documentation lives in v4-periphery
[`docs/margin-trading.md`](https://github.com/Uniswap/v4-periphery/blob/margin-trading/docs/margin-trading.md),
including the security model, the `execute` opcode reference, and venue-specific notes
(Aave v4 hub-and-spoke, reserve ids, premium-inclusive debt, Compound v3 single-base Comets).
