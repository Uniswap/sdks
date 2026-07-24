import { type Address } from 'viem'

/** WAD fixed-point scale: 1e18 == 100% for `Ltv` values and 1x for `LeverageX18` values. */
export const WAD = 10n ** 18n

/** 1x leverage in WAD (the `LeverageX18` lower bound; sub-1x leverage is invalid). */
export const ONE_X18 = WAD

export const MAX_UINT256 = (1n << 256n) - 1n
export const MAX_UINT160 = (1n << 160n) - 1n
export const MAX_UINT128 = (1n << 128n) - 1n
export const MAX_UINT48 = (1n << 48n) - 1n

/**
 * `decreasePosition` sentinel: passing this as `debtToRepay` fully closes the position — repay all
 * debt (by shares, avoiding interest dust), withdraw all collateral, and return the residual
 * (realized PnL) to the caller.
 */
export const FULL_CLOSE = MAX_UINT256

/**
 * v4 periphery `ActionConstants.OPEN_DELTA`: an encoded `0` amount that resolves to the full open
 * balance/delta for the action. NOT honored by `PULL_TO_ACCOUNT`, where an encoded `0` reverts.
 */
export const OPEN_DELTA = 0n

/**
 * v4 periphery `ActionConstants.CONTRACT_BALANCE`: resolves to the router's entire balance of the
 * currency. For `PULL_TO_ACCOUNT` it is honored only on the router-balance path (`payerIsUser`
 * false).
 */
export const CONTRACT_BALANCE = 1n << 255n

/** v4 periphery `ActionConstants.MSG_SENDER`: recipient sentinel mapping to the authenticated caller. */
export const MSG_SENDER: Address = '0x0000000000000000000000000000000000000001'

/** v4 periphery `ActionConstants.ADDRESS_THIS`: recipient sentinel mapping to the router itself. */
export const ADDRESS_THIS: Address = '0x0000000000000000000000000000000000000002'

/** Basis-points denominator (1 bps = 0.01%, 10_000 bps = 100%). */
export const BPS_DENOMINATOR = 10_000n
