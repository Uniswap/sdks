import { Currency } from '../entities/currency'

/**
 * Compares two currencies for equality
 */
export function currencyEquals(currencyA: Currency, currencyB: Currency): boolean {
  if (currencyA.isToken && currencyB.isToken) {
    return currencyA.equals(currencyB)
  } else if (currencyA.isToken) {
    return false
  } else if (currencyB.isToken) {
    return false
  } else {
    return currencyA.isEther === currencyB.isEther
  }
}
