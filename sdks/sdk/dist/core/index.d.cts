import JSBI from 'jsbi';
import { BigNumber } from '@ethersproject/bignumber';
import { BytesLike } from '@ethersproject/bytes';

declare enum ChainId {
    MAINNET = 1,
    GOERLI = 5,
    SEPOLIA = 11155111,
    OPTIMISM = 10,
    OPTIMISM_GOERLI = 420,
    OPTIMISM_SEPOLIA = 11155420,
    ARBITRUM_ONE = 42161,
    ARBITRUM_GOERLI = 421613,
    ARBITRUM_SEPOLIA = 421614,
    POLYGON = 137,
    POLYGON_MUMBAI = 80001,
    CELO = 42220,
    CELO_ALFAJORES = 44787,
    GNOSIS = 100,
    MOONBEAM = 1284,
    BNB = 56,
    AVALANCHE = 43114,
    BASE_GOERLI = 84531,
    BASE_SEPOLIA = 84532,
    BASE = 8453,
    ZORA = 7777777,
    ZORA_SEPOLIA = 999999999,
    ROOTSTOCK = 30,
    BLAST = 81457,
    ZKSYNC = 324,
    WORLDCHAIN = 480,
    UNICHAIN_SEPOLIA = 1301,
    UNICHAIN = 130,
    MONAD_TESTNET = 10143,
    SONEIUM = 1868,
    MONAD = 143,
    XLAYER = 196
}
declare const SUPPORTED_CHAINS: readonly [ChainId.MAINNET, ChainId.OPTIMISM, ChainId.OPTIMISM_GOERLI, ChainId.OPTIMISM_SEPOLIA, ChainId.ARBITRUM_ONE, ChainId.ARBITRUM_GOERLI, ChainId.ARBITRUM_SEPOLIA, ChainId.POLYGON, ChainId.POLYGON_MUMBAI, ChainId.GOERLI, ChainId.SEPOLIA, ChainId.CELO_ALFAJORES, ChainId.CELO, ChainId.BNB, ChainId.AVALANCHE, ChainId.BASE, ChainId.BASE_GOERLI, ChainId.BASE_SEPOLIA, ChainId.ZORA, ChainId.ZORA_SEPOLIA, ChainId.ROOTSTOCK, ChainId.BLAST, ChainId.ZKSYNC, ChainId.WORLDCHAIN, ChainId.UNICHAIN_SEPOLIA, ChainId.UNICHAIN, ChainId.MONAD_TESTNET, ChainId.SONEIUM, ChainId.MONAD, ChainId.XLAYER];
type SupportedChainsType = (typeof SUPPORTED_CHAINS)[number];
declare enum NativeCurrencyName {
    ETHER = "ETH",
    MATIC = "MATIC",
    CELO = "CELO",
    GNOSIS = "XDAI",
    MOONBEAM = "GLMR",
    BNB = "BNB",
    AVAX = "AVAX",
    ROOTSTOCK = "RBTC"
}

type AddressMap = {
    [chainId: number]: string;
};
type ChainAddresses = {
    v3CoreFactoryAddress: string;
    multicallAddress: string;
    quoterAddress: string;
    v3MigratorAddress?: string;
    nonfungiblePositionManagerAddress?: string;
    tickLensAddress?: string;
    swapRouter02Address?: string;
    mixedRouteQuoterV1Address?: string;
    mixedRouteQuoterV2Address?: string;
    v4PoolManagerAddress?: string;
    v4PositionManagerAddress?: string;
    v4StateView?: string;
    v4QuoterAddress?: string;
};
declare const UNI_ADDRESSES: AddressMap;
declare const UNISWAP_NFT_AIRDROP_CLAIM_ADDRESS = "0x8B799381ac40b838BBA4131ffB26197C432AFe78";
/**
 * @deprecated use V2_FACTORY_ADDRESSES instead
 */
declare const V2_FACTORY_ADDRESS = "0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f";
declare const V2_FACTORY_ADDRESSES: AddressMap;
/**
 * @deprecated use V2_ROUTER_ADDRESSES instead
 */
declare const V2_ROUTER_ADDRESS = "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D";
declare const V2_ROUTER_ADDRESSES: AddressMap;
declare const CHAIN_TO_ADDRESSES_MAP: Record<SupportedChainsType, ChainAddresses>;
declare const V3_CORE_FACTORY_ADDRESSES: AddressMap;
declare const V3_MIGRATOR_ADDRESSES: AddressMap;
declare const MULTICALL_ADDRESSES: AddressMap;
/**
 * The oldest V0 governance address
 */
declare const GOVERNANCE_ALPHA_V0_ADDRESSES: AddressMap;
/**
 * The older V1 governance address
 */
declare const GOVERNANCE_ALPHA_V1_ADDRESSES: AddressMap;
/**
 * The latest governor bravo that is currently admin of timelock
 */
declare const GOVERNANCE_BRAVO_ADDRESSES: AddressMap;
declare const TIMELOCK_ADDRESSES: AddressMap;
declare const MERKLE_DISTRIBUTOR_ADDRESS: AddressMap;
declare const ARGENT_WALLET_DETECTOR_ADDRESS: AddressMap;
declare const QUOTER_ADDRESSES: AddressMap;
declare const NONFUNGIBLE_POSITION_MANAGER_ADDRESSES: AddressMap;
declare const ENS_REGISTRAR_ADDRESSES: AddressMap;
declare const SOCKS_CONTROLLER_ADDRESSES: AddressMap;
declare const TICK_LENS_ADDRESSES: AddressMap;
declare const MIXED_ROUTE_QUOTER_V1_ADDRESSES: AddressMap;
declare const SWAP_ROUTER_02_ADDRESSES: (chainId: number) => string;

type BigintIsh = JSBI | string | number;
declare enum TradeType {
    EXACT_INPUT = 0,
    EXACT_OUTPUT = 1
}
declare enum Rounding {
    ROUND_DOWN = 0,
    ROUND_HALF_UP = 1,
    ROUND_UP = 2
}
declare const MaxUint256: JSBI;

/**
 * Represents an ERC20 token with a unique address and some metadata.
 */
declare class Token extends BaseCurrency {
    readonly isNative: false;
    readonly isToken: true;
    /**
     * The contract address on the chain on which this token lives
     */
    readonly address: string;
    /**
     * Relevant for fee-on-transfer (FOT) token taxes,
     * Not every ERC20 token is FOT token, so this field is optional
     */
    readonly buyFeeBps?: BigNumber;
    readonly sellFeeBps?: BigNumber;
    /**
     *
     * @param chainId {@link BaseCurrency#chainId}
     * @param address The contract address on the chain on which this token lives
     * @param decimals {@link BaseCurrency#decimals}
     * @param symbol {@link BaseCurrency#symbol}
     * @param name {@link BaseCurrency#name}
     * @param bypassChecksum If true it only checks for length === 42, startsWith 0x and contains only hex characters
     * @param buyFeeBps Buy fee tax for FOT tokens, in basis points
     * @param sellFeeBps Sell fee tax for FOT tokens, in basis points
     */
    constructor(chainId: number, address: string, decimals: number, symbol?: string, name?: string, bypassChecksum?: boolean, buyFeeBps?: BigNumber, sellFeeBps?: BigNumber);
    /**
     * Returns true if the two tokens are equivalent, i.e. have the same chainId and address.
     * @param other other token to compare
     */
    equals(other: Currency): boolean;
    /**
     * Returns true if the address of this token sorts before the address of the other token
     * @param other other token to compare
     * @throws if the tokens have the same address
     * @throws if the tokens are on different chains
     */
    sortsBefore(other: Token): boolean;
    /**
     * Return this token, which does not need to be wrapped
     */
    get wrapped(): Token;
}

/**
 * A currency is any fungible financial instrument, including Ether, all ERC20 tokens, and other chain-native currencies
 */
declare abstract class BaseCurrency {
    /**
     * Returns whether the currency is native to the chain and must be wrapped (e.g. Ether)
     */
    abstract readonly isNative: boolean;
    /**
     * Returns whether the currency is a token that is usable in Uniswap without wrapping
     */
    abstract readonly isToken: boolean;
    /**
     * The chain ID on which this currency resides
     */
    readonly chainId: number;
    /**
     * The decimals used in representing currency amounts
     */
    readonly decimals: number;
    /**
     * The symbol of the currency, i.e. a short textual non-unique identifier
     */
    readonly symbol?: string;
    /**
     * The name of the currency, i.e. a descriptive textual non-unique identifier
     */
    readonly name?: string;
    /**
     * Constructs an instance of the base class `BaseCurrency`.
     * @param chainId the chain ID on which this currency resides
     * @param decimals decimals of the currency
     * @param symbol symbol of the currency
     * @param name of the currency
     */
    protected constructor(chainId: number, decimals: number, symbol?: string, name?: string);
    /**
     * Returns whether this currency is functionally equivalent to the other currency
     * @param other the other currency
     */
    abstract equals(other: Currency): boolean;
    /**
     * Return the wrapped version of this currency that can be used with the Uniswap contracts. Currencies must
     * implement this to be used in Uniswap
     */
    abstract get wrapped(): Token;
}

/**
 * Represents the native currency of the chain on which it resides, e.g.
 */
declare abstract class NativeCurrency extends BaseCurrency {
    readonly isNative: true;
    readonly isToken: false;
}

type Currency = NativeCurrency | Token;

declare class Fraction {
    readonly numerator: JSBI;
    readonly denominator: JSBI;
    constructor(numerator: BigintIsh, denominator?: BigintIsh);
    private static tryParseFraction;
    get quotient(): JSBI;
    get remainder(): Fraction;
    invert(): Fraction;
    add(other: Fraction | BigintIsh): Fraction;
    subtract(other: Fraction | BigintIsh): Fraction;
    lessThan(other: Fraction | BigintIsh): boolean;
    equalTo(other: Fraction | BigintIsh): boolean;
    greaterThan(other: Fraction | BigintIsh): boolean;
    multiply(other: Fraction | BigintIsh): Fraction;
    divide(other: Fraction | BigintIsh): Fraction;
    toSignificant(significantDigits: number, format?: object, rounding?: Rounding): string;
    toFixed(decimalPlaces: number, format?: object, rounding?: Rounding): string;
    /**
     * Helper method for converting any super class back to a fraction
     */
    get asFraction(): Fraction;
}

declare class CurrencyAmount<T extends Currency> extends Fraction {
    readonly currency: T;
    readonly decimalScale: JSBI;
    /**
     * Returns a new currency amount instance from the unitless amount of token, i.e. the raw amount
     * @param currency the currency in the amount
     * @param rawAmount the raw token or ether amount
     */
    static fromRawAmount<T extends Currency>(currency: T, rawAmount: BigintIsh): CurrencyAmount<T>;
    /**
     * Construct a currency amount with a denominator that is not equal to 1
     * @param currency the currency
     * @param numerator the numerator of the fractional token amount
     * @param denominator the denominator of the fractional token amount
     */
    static fromFractionalAmount<T extends Currency>(currency: T, numerator: BigintIsh, denominator: BigintIsh): CurrencyAmount<T>;
    protected constructor(currency: T, numerator: BigintIsh, denominator?: BigintIsh);
    add(other: CurrencyAmount<T>): CurrencyAmount<T>;
    subtract(other: CurrencyAmount<T>): CurrencyAmount<T>;
    multiply(other: Fraction | BigintIsh): CurrencyAmount<T>;
    divide(other: Fraction | BigintIsh): CurrencyAmount<T>;
    toSignificant(significantDigits?: number, format?: object, rounding?: Rounding): string;
    toFixed(decimalPlaces?: number, format?: object, rounding?: Rounding): string;
    toExact(format?: object): string;
    get wrapped(): CurrencyAmount<Token>;
}

declare class Percent extends Fraction {
    /**
     * This boolean prevents a fraction from being interpreted as a Percent
     */
    readonly isPercent: true;
    add(other: Fraction | BigintIsh): Percent;
    subtract(other: Fraction | BigintIsh): Percent;
    multiply(other: Fraction | BigintIsh): Percent;
    divide(other: Fraction | BigintIsh): Percent;
    toSignificant(significantDigits?: number, format?: object, rounding?: Rounding): string;
    toFixed(decimalPlaces?: number, format?: object, rounding?: Rounding): string;
}

declare class Price<TBase extends Currency, TQuote extends Currency> extends Fraction {
    readonly baseCurrency: TBase;
    readonly quoteCurrency: TQuote;
    readonly scalar: Fraction;
    /**
     * Construct a price, either with the base and quote currency amount, or the
     * @param args
     */
    constructor(...args: [TBase, TQuote, BigintIsh, BigintIsh] | [{
        baseAmount: CurrencyAmount<TBase>;
        quoteAmount: CurrencyAmount<TQuote>;
    }]);
    /**
     * Flip the price, switching the base and quote currency
     */
    invert(): Price<TQuote, TBase>;
    /**
     * Multiply the price by another price, returning a new price. The other price must have the same base currency as this price's quote currency
     * @param other the other price
     */
    multiply<TOtherQuote extends Currency>(other: Price<TQuote, TOtherQuote>): Price<TBase, TOtherQuote>;
    /**
     * Return the amount of quote currency corresponding to a given amount of the base currency
     * @param currencyAmount the amount of base currency to quote against the price
     */
    quote(currencyAmount: CurrencyAmount<TBase>): CurrencyAmount<TQuote>;
    /**
     * Get the value scaled by decimals for formatting
     * @private
     */
    private get adjustedForDecimals();
    toSignificant(significantDigits?: number, format?: object, rounding?: Rounding): string;
    toFixed(decimalPlaces?: number, format?: object, rounding?: Rounding): string;
}

/**
 * Ether is the main usage of a 'native' currency, i.e. for Ethereum mainnet and all testnets
 */
declare class Ether extends NativeCurrency {
    protected constructor(chainId: number);
    get wrapped(): Token;
    private static _etherCache;
    static onChain(chainId: number): Ether;
    equals(other: Currency): boolean;
}

/**
 * Known WETH9 implementation addresses, used in our implementation of Ether#wrapped
 */
declare const WETH9: {
    [chainId: number]: Token;
};

/**
 * Returns the percent difference between the mid price and the execution price, i.e. price impact.
 * @param midPrice mid price before the trade
 * @param inputAmount the input amount of the trade
 * @param outputAmount the output amount of the trade
 */
declare function computePriceImpact<TBase extends Currency, TQuote extends Currency>(midPrice: Price<TBase, TQuote>, inputAmount: CurrencyAmount<TBase>, outputAmount: CurrencyAmount<TQuote>): Percent;

declare function computeZksyncCreate2Address(sender: string, bytecodeHash: BytesLike, salt: BytesLike, input?: BytesLike): string;

declare function sortedInsert<T>(items: T[], add: T, maxSize: number, comparator: (a: T, b: T) => number): T | null;

/**
 * Computes floor(sqrt(value))
 * @param value the value for which to compute the square root, rounded down
 */
declare function sqrt(value: JSBI): JSBI;

/**
 * Validates an address and returns the parsed (checksummed) version of that address
 * @param address the unchecksummed hex address
 */
declare function validateAndParseAddress(address: string): string;

export { ARGENT_WALLET_DETECTOR_ADDRESS, type BigintIsh, CHAIN_TO_ADDRESSES_MAP, ChainId, type Currency, CurrencyAmount, ENS_REGISTRAR_ADDRESSES, Ether, Fraction, GOVERNANCE_ALPHA_V0_ADDRESSES, GOVERNANCE_ALPHA_V1_ADDRESSES, GOVERNANCE_BRAVO_ADDRESSES, MERKLE_DISTRIBUTOR_ADDRESS, MIXED_ROUTE_QUOTER_V1_ADDRESSES, MULTICALL_ADDRESSES, MaxUint256, NONFUNGIBLE_POSITION_MANAGER_ADDRESSES, NativeCurrency, NativeCurrencyName, Percent, Price, QUOTER_ADDRESSES, Rounding, SOCKS_CONTROLLER_ADDRESSES, SUPPORTED_CHAINS, SWAP_ROUTER_02_ADDRESSES, type SupportedChainsType, TICK_LENS_ADDRESSES, TIMELOCK_ADDRESSES, Token, TradeType, UNISWAP_NFT_AIRDROP_CLAIM_ADDRESS, UNI_ADDRESSES, V2_FACTORY_ADDRESS, V2_FACTORY_ADDRESSES, V2_ROUTER_ADDRESS, V2_ROUTER_ADDRESSES, V3_CORE_FACTORY_ADDRESSES, V3_MIGRATOR_ADDRESSES, WETH9, computePriceImpact, computeZksyncCreate2Address, sortedInsert, sqrt, validateAndParseAddress };
