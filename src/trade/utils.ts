import { Currency } from "@uniswap/sdk-core";

export function areCurrenciesEqual(
  currency: Currency,
  address: string | null,
  chainId: number
) {
  if (currency.chainId !== chainId) return false;

  // TODO: once native currencies are supported by dutch order trades, add handling based on
  // shared native currency address format
  if (currency.isNative) {
    throw new Error(
      "native currencies are not currently supported by DutchOrder trades"
    );
  }

  return currency.address.toLowerCase() === address?.toLowerCase();
}
