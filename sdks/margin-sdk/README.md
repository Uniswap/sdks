# @uniswap/margin-sdk

A framework-agnostic TypeScript SDK for the **Uniswap v4 margin trading periphery**: open, manage,
and close leveraged spot positions built from a v4 swap composed with a borrow/supply against an
external lending venue — **Morpho Blue, Aave v3, or Aave v4** — all behind one `MarginRouter`.

The SDK covers:

- **Calldata + write descriptors** for every router entry point (`increasePosition`,
  `decreasePosition`, `addCollateral`, `execute`, `multicall`, forwarded Permit2 `permit`),
  validated against the deployed contracts byte-for-byte.
- **Offchain account derivation** — `predictMarginAccountAddress` mirrors `router.accountOf`
  (Solady clone-with-immutable-args CREATE2) with no RPC round-trip.
- **Leverage & health math** — decimal-aware position sizing (`sizeIncrease` / `sizeDecrease`),
  leverage↔LTV conversions, health factors, slippage helpers.
- **A plan builder** (`MarginPlanner`) for the advanced `execute` entry point: compose v4 routing
  actions and margin account actions into one atomic flash-accounted plan.
- **Read descriptors** that drop into wagmi `useReadContract(s)` / viem `readContract`, identical
  across all three lending venues.

Built on [viem](https://viem.sh); no other runtime dependencies.

## How a position works

A margin position is leveraged spot exposure assembled in a single transaction inside one
`PoolManager` unlock: borrow the **debt** token, swap it into the **collateral** token
(exact-output), and supply the collateral (your equity plus the bought amount) to the lending
market. The position is **long the collateral and short the debt** — direction is set entirely by
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
const poolKey = toPoolKey({ currencyA: WETH, currencyB: USDC, fee: 3000, tickSpacing: 60 })

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

// 2. One-time Permit2 setup for the equity token:
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

// 3. Simulate (surfaces decoded reverts), then send.
const { request } = await publicClient.simulateContract({
  account,
  ...increasePositionCall({
    marginRouter: addresses.marginRouter,
    params: {
      adapter: addresses.lendingAdapters.morphoBlue!,
      market,
      poolKey,
      equity,
      collateralToBuy,
      maxDebtIn,
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
import { FULL_CLOSE, closePositionCall, decreasePositionCall, sizeDecrease } from '@uniswap/margin-sdk'

// Full close: repay all debt, withdraw all collateral, return the residual (realized PnL).
// Size the collateral cap from the CURRENT debt plus headroom (debt accrues interest).
const { maxCollateralIn } = sizeDecrease({
  debtToRepay: position.debtAmount,
  priceCollateralPerDebtToken: parseUnits('0.000333333333333333', 18), // WETH per USDC quote
  debtDecimals: 6,
  slippageBps: 100,
})
const close = closePositionCall({
  marginRouter: addresses.marginRouter,
  params: { adapter, market, poolKey, maxCollateralIn, deadline },
})

// Partial delever: repay a fixed amount and bound the resulting LTV (mandatory).
const delever = decreasePositionCall({
  marginRouter: addresses.marginRouter,
  params: {
    adapter,
    market,
    poolKey,
    debtToRepay: parseUnits('1000', 6),
    maxCollateralIn,
    maxLtvAfter: parseUnits('0.7', 18), // keep LTV ≤ 70%
    deadline,
  },
})
```

Closing and delevering **never** require the adapter to be allowlisted, so a position is always
exitable — even if its adapter is later removed from governance's allowlist.

## Going short & venue selection

A short is the same call with the market pairing reversed and the venue chosen per call by
adapter — nothing else changes:

```ts
const shortMarket = { collateral: USDC, debt: WETH }
const params = {
  adapter: addresses.lendingAdapters.aaveV3!, // or aaveV4
  market: shortMarket,
  poolKey, // same USDC/WETH pool
  equity: parseUnits('3000', 6), // ⚠️ USDC decimals now
  collateralToBuy, // 6-decimal USDC
  maxDebtIn, // 18-decimal WETH
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
| MarginRouter                 | `0x0000000004BBC92D0657580CAe35aEBF054E5CDC` |
| MarginAccount implementation | `0x83Fc96d2B162dAF8532e5677C6Ec32A1Cb7882E4` |
| MorphoLendingAdapter         | `0x9A7f8F5A9496D3c9dc0BEEfb44cCaC17CAAF28fa` |
| AaveLendingAdapter (v3)      | `0x8EeacdB24c7650478496845A61f03fF6BC263222` |
| AaveV4LendingAdapter         | `0x3a9Cc5eEbAC911E5a316de1F2bCD166016d7469E` |

The SDK's ABIs, selectors, and account derivation are test-anchored against this live deployment
(see `src/*.test.ts`).

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
`MARKET_MISMATCH`, `INVALID_PLAN`, …) — catch with `isMarginSdkError` and forward. Onchain reverts
(`SlippageBoundRequired`, `PositionUnhealthy`, `AdapterNotAllowed`, `DeadlinePassed`,
`NativeCollateralMismatch`, `IncompleteFill`, …) are declared in `MARGIN_ROUTER_ABI`, so viem's
`simulateContract` decodes them into readable messages — always simulate before writing.

## Reference

Full protocol and integration documentation lives in v4-periphery
[`docs/margin-trading.md`](https://github.com/Uniswap/v4-periphery/blob/margin-trading/docs/margin-trading.md),
including the security model, the `execute` opcode reference, and venue-specific notes
(Aave v4 hub-and-spoke, reserve ids, premium-inclusive debt).
