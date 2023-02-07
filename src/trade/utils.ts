import { Currency } from "@uniswap/sdk-core";

export function areCurrenciesEqual(
  currency: Currency,
  address: string | null,
  chainId: number
) {
  if (currency.chainId !== chainId) return false;
  if (currency.isNative) {
    throw new Error(
      "native currencies are not currently supported by DutchLimitOrder trades"
    );
  }

  return currency.address.toLowerCase() === address?.toLowerCase();
}
