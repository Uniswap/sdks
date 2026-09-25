import { Currency, CurrencyAmount } from '@uniswap/sdk-core'
import JSBI from 'jsbi'

const ZERO = JSBI.BigInt(0)
const TEN = JSBI.BigInt(10)

// balances are capped at 10^(decimals + 3) raw units, i.e. 1000 whole tokens
const CAP_DECIMALS_OFFSET = 3

function capBalance(balance: CurrencyAmount<Currency>): JSBI {
  const cap = JSBI.exponentiate(TEN, JSBI.BigInt(balance.currency.decimals + CAP_DECIMALS_OFFSET))
  return JSBI.lessThan(balance.quotient, cap) ? balance.quotient : cap
}

/**
 * Picks the side (balance0 or balance1) with the larger capped raw-unit balance to use
 * as the independent amount when simulating an LP transaction for gas estimation.
 *
 * Each balance is capped at 10^(decimals + 3) raw units to keep simulated amounts
 * realistic regardless of whale balances, while still ensuring a valid transaction.
 *
 * Note: capped balances are compared as raw integers, not by USD/value. Tokens with
 * more decimals (e.g. 18-decimal WETH) will therefore tend to win over lower-decimal
 * tokens (e.g. 6-decimal USDC) even when the lower-decimal side is worth more. This is
 * intentional — the caller only needs *any* non-zero, representative amount for gas
 * simulation, and the chosen side is always a token the user actually holds. The cap
 * keeps both sides within ~three orders of magnitude of each other, bounding the bias.
 * Ties go to balance0.
 *
 * Returns null when both balances are zero — there is no valid simulation input in
 * that case, and the user cannot perform the LP action anyway.
 *
 * @param balance0 the wallet's balance of one pool currency
 * @param balance1 the wallet's balance of the other pool currency
 * @returns the capped balance to use as the independent amount, or null
 */
export function pickPreEstimateIndependentAmount(
  balance0: CurrencyAmount<Currency>,
  balance1: CurrencyAmount<Currency>
): CurrencyAmount<Currency> | null {
  const capped0 = capBalance(balance0)
  const capped1 = capBalance(balance1)

  if (JSBI.equal(capped0, ZERO) && JSBI.equal(capped1, ZERO)) {
    return null
  }

  return JSBI.greaterThanOrEqual(capped0, capped1)
    ? CurrencyAmount.fromRawAmount(balance0.currency, capped0)
    : CurrencyAmount.fromRawAmount(balance1.currency, capped1)
}
