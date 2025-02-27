import { Currency } from "@uniswap/sdk-core";
export declare enum NativeAssets {
    MATIC = "MATIC",
    BNB = "BNB",
    AVAX = "AVAX",
    ETH = "ETH"
}
export declare function areCurrenciesEqual(currency: Currency, address: string | null, chainId: number): boolean;
