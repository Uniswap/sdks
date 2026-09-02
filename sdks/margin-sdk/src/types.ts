import { type Address, type Hex } from 'viem'

/**
 * TypeScript mirrors of the onchain structs the margin flows encode. Field order and types match
 * the deployed contracts exactly:
 * - Market: v4-periphery `types/Market.sol`
 * - PoolKey: v4-core `types/PoolKey.sol`
 * - IncreaseParams / DecreaseParams / AddCollateralParams: v4-periphery `IMarginRouter.sol`
 * - PositionData: v4-periphery `types/PositionData.sol`
 *
 * `Ltv` values are WAD-scaled bigints (1e18 == 100%); leverage values are WAD multipliers
 * (1e18 == 1x). Fields the contract documents as optional-with-zero-default are optional here and
 * filled by the encoders.
 *
 * Position swaps route through the **Universal Router**, supplied per call: the caller builds the
 * route offchain (`routeCommands`/`routeInputs`, e.g. with `buildV4ExactOutRoute`) so liquidity
 * can be sourced across v2/v3/v4, and picks the Universal Router deployment the route targets.
 */

/**
 * The lending-protocol-agnostic market descriptor: the `(collateral, debt)` token pair. Direction
 * is set entirely by the pairing — the position is long the collateral and short the debt. Margin
 * markets are ERC-20 only (use WETH, never the native-ETH zero address).
 */
export interface Market {
  /** The ERC-20 token supplied as collateral in the lending market. */
  collateral: Address
  /** The ERC-20 token borrowed as debt in the lending market. */
  debt: Address
}

/** A v4 pool descriptor (used by plan swap actions and the v4 route builder). `currency0 < currency1`. */
export interface PoolKey {
  currency0: Address
  currency1: Address
  /** uint24, hundredths of a bip. */
  fee: number
  /** int24. */
  tickSpacing: number
  /** address(0) for a hookless pool. */
  hooks: Address
}

/** Parameters for `increasePosition` (open a position or add leverage to one). */
export interface IncreaseParams {
  /** The allowlisted lending adapter that selects the venue (Morpho Blue, Aave v3, Aave v4, Compound v3). */
  adapter: Address
  /** The (collateral, debt) pair. This sets direction: long the collateral, short the debt. */
  market: Market
  /**
   * Collateral equity the caller contributes, in the collateral token's native decimals. Pulled
   * via Permit2. Ignored when the call sends native ETH (`value > 0`) — pass 0 there.
   */
  equity: bigint
  /**
   * uint128. The exact collateral the route buys (its exact-output amount), in native decimals.
   * The router asserts the account received it, so it must match the route's `amountOut`.
   */
  collateralToBuy: bigint
  /**
   * uint128. The mandatory, binding slippage bound: the maximum debt the router flash-takes and
   * lets the Universal Router spend (a scoped Permit2 allowance of exactly this much), independent
   * of the route's own `amountInMaximum`. Derive it from a quote, not spot price.
   */
  maxDebtIn: bigint
  /**
   * The Universal Router the debt->collateral swap routes through. Supplied per call so the caller
   * picks the deployment their route targets; must carry already-unlocked `V4_SWAP` support.
   */
  universalRouter: Address
  /**
   * The Universal Router command byte string for the debt->collateral swap. The route MUST buy
   * `collateralToBuy` exact-output and deliver it to the caller's MarginAccount, drawing the input
   * from the router (the payer) via Permit2 — see `buildV4ExactOutRoute` for the single-pool case.
   */
  routeCommands: Hex
  /** The per-command ABI-encoded inputs for `routeCommands`. */
  routeInputs: Hex[]
  /**
   * Optional resulting-LTV bound (WAD, 1e18 == 100%), asserted after the position settles. Zero
   * (default) skips the check; a supplied bound must sit strictly below 1e18
   * (`IneffectiveLtvBound` otherwise).
   */
  maxLtvAfter?: bigint
  /** Sub-account index; (caller, subId) determines the MarginAccount. Default 0. */
  subId?: bigint
  /** Unix timestamp after which the call reverts `DeadlinePassed`. */
  deadline: bigint
}

/** Parameters for `decreasePosition` (partial delever, or full close via {@link FULL_CLOSE}). */
export interface DecreaseParams {
  /** The lending adapter. Close/decrease never require the adapter to be allowlisted. */
  adapter: Address
  /** The (collateral, debt) pair. */
  market: Market
  /**
   * The exact debt the route buys and repays (its exact-output amount), in the debt token's
   * native decimals, or `FULL_CLOSE` (`type(uint256).max`) to fully close: repay all, withdraw
   * all, return the residual to the caller. On a full close the route must buy AT LEAST the
   * current debt (quote it with a small accrual buffer); over-bought debt is returned.
   */
  debtToRepay: bigint
  /**
   * uint128. The mandatory, binding slippage bound: the maximum collateral the router flash-takes
   * and lets the Universal Router spend (a scoped Permit2 allowance), independent of the route's
   * own `amountInMaximum`. A zero-debt full close takes a swap-free path and ignores it.
   */
  maxCollateralIn: bigint
  /**
   * The Universal Router the collateral->debt swap routes through. Required on the swap path (any
   * partial decrease, and a full close of a position with debt); a zero-debt full close is
   * swap-free and may omit it.
   */
  universalRouter?: Address
  /**
   * The Universal Router command byte string for the collateral->debt swap. The route MUST buy the
   * target debt exact-output and deliver it to the caller's MarginAccount, drawing the input from
   * the router (the payer) via Permit2. Same swap-path requirement as `universalRouter`.
   */
  routeCommands?: Hex
  /** The per-command ABI-encoded inputs for `routeCommands`. */
  routeInputs?: Hex[]
  /**
   * The maximum LTV the position may have after a partial decrease (WAD, strictly below 1e18).
   * Mandatory for a partial decrease; ignored on a full close.
   */
  maxLtvAfter?: bigint
  /** Sub-account index identifying which MarginAccount to decrease or close. Default 0. */
  subId?: bigint
  /** Unix timestamp after which the call reverts `DeadlinePassed`. */
  deadline: bigint
}

/** Parameters for `addCollateral` (supply collateral without changing debt; no swap). */
export interface AddCollateralParams {
  /** The allowlisted lending adapter. */
  adapter: Address
  /** The (collateral, debt) pair. */
  market: Market
  /**
   * The collateral to add, in native decimals. Pulled via Permit2. Ignored when the call sends
   * native ETH (`value > 0`) — pass 0 there.
   */
  amount: bigint
  /** Sub-account index. The account is deployed if it does not yet exist. Default 0. */
  subId?: bigint
  /** Unix timestamp after which the call reverts `DeadlinePassed`. */
  deadline: bigint
}

/**
 * A consolidated position snapshot returned by `ILendingAdapter.describePosition`. Amounts are
 * interest-accrued; there are no price fields (prices and liquidation prices are left to the
 * offchain quoter).
 */
export interface PositionData {
  /** Supplied collateral with accrued interest, in the collateral token's native decimals. */
  collateralAmount: bigint
  /** Outstanding debt with accrued interest, in the debt token's native decimals. */
  debtAmount: bigint
  /** The market's maximum (liquidation) LTV (WAD, 1e18 == 100%). */
  maxLtv: bigint
  /** The position's current LTV (WAD); zero when there is no debt. */
  currentLtv: bigint
  /**
   * `maxLtv / currentLtv` in WAD (1e18 == 1.0; below 1e18 is liquidatable). `type(uint256).max`
   * when there is no debt.
   */
  healthFactorWad: bigint
}

/** A single hop of a multi-hop v4 swap path (v4-periphery `libraries/PathKey.sol`). */
export interface PathKey {
  intermediateCurrency: Address
  /** uint24. */
  fee: number
  /** int24. */
  tickSpacing: number
  hooks: Address
  hookData: Hex
}
