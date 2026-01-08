import JSBI from 'jsbi';
import { BigNumber } from '@ethersproject/bignumber';
import { Interface } from '@ethersproject/abi';
import { TypedDataDomain, TypedDataField } from '@ethersproject/abstract-signer';

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

declare const FACTORY_ADDRESS = "0x1F98431c8aD98523631AE4a59f267346ea31F984";
declare const ADDRESS_ZERO = "0x0000000000000000000000000000000000000000";
declare const POOL_INIT_CODE_HASH = "0xe34f199b19b2b4f47f68442619d555527d244f78a3297ea89325f843f87b8b54";
declare function poolInitCodeHash(chainId?: ChainId): string;
/**
 * The default factory enabled fee amounts, denominated in hundredths of bips.
 */
declare enum FeeAmount {
    LOWEST = 100,
    LOW_200 = 200,
    LOW_300 = 300,
    LOW_400 = 400,
    LOW = 500,
    MEDIUM = 3000,
    HIGH = 10000
}
/**
 * The default factory tick spacings by fee amount.
 */
declare const TICK_SPACINGS: {
    [amount in FeeAmount]: number;
};

interface TickConstructorArgs {
    index: number;
    liquidityGross: BigintIsh;
    liquidityNet: BigintIsh;
}
declare class Tick {
    readonly index: number;
    readonly liquidityGross: JSBI;
    readonly liquidityNet: JSBI;
    constructor({ index, liquidityGross, liquidityNet }: TickConstructorArgs);
}

/**
 * Provides information about ticks
 */
interface TickDataProvider {
    /**
     * Return information corresponding to a specific tick
     * @param tick the tick to load
     */
    getTick(tick: number): Promise<{
        liquidityNet: BigintIsh;
    }>;
    /**
     * Return the next tick that is initialized within a single word
     * @param tick The current tick
     * @param lte Whether the next tick should be lte the current tick
     * @param tickSpacing The tick spacing of the pool
     */
    nextInitializedTickWithinOneWord(tick: number, lte: boolean, tickSpacing: number): Promise<[number, boolean]>;
}
/**
 * This tick data provider does not know how to fetch any tick data. It throws whenever it is required. Useful if you
 * do not need to load tick data for your use case.
 */
declare class NoTickDataProvider implements TickDataProvider {
    private static ERROR_MESSAGE;
    getTick(_tick: number): Promise<{
        liquidityNet: BigintIsh;
    }>;
    nextInitializedTickWithinOneWord(_tick: number, _lte: boolean, _tickSpacing: number): Promise<[number, boolean]>;
}

/**
 * Represents a V3 pool
 */
declare class Pool {
    readonly token0: Token;
    readonly token1: Token;
    readonly fee: FeeAmount;
    readonly sqrtRatioX96: JSBI;
    readonly liquidity: JSBI;
    readonly tickCurrent: number;
    readonly tickDataProvider: TickDataProvider;
    private _token0Price?;
    private _token1Price?;
    static getAddress(tokenA: Token, tokenB: Token, fee: FeeAmount, initCodeHashManualOverride?: string, factoryAddressOverride?: string): string;
    /**
     * Construct a pool
     * @param tokenA One of the tokens in the pool
     * @param tokenB The other token in the pool
     * @param fee The fee in hundredths of a bips of the input amount of every swap that is collected by the pool
     * @param sqrtRatioX96 The sqrt of the current ratio of amounts of token1 to token0
     * @param liquidity The current value of in range liquidity
     * @param tickCurrent The current tick of the pool
     * @param ticks The current state of the pool ticks or a data provider that can return tick data
     */
    constructor(tokenA: Token, tokenB: Token, fee: FeeAmount, sqrtRatioX96: BigintIsh, liquidity: BigintIsh, tickCurrent: number, ticks?: TickDataProvider | (Tick | TickConstructorArgs)[]);
    /**
     * Returns true if the token is either token0 or token1
     * @param token The token to check
     * @returns True if token is either token0 or token
     */
    involvesToken(token: Token): boolean;
    /**
     * Returns the current mid price of the pool in terms of token0, i.e. the ratio of token1 over token0
     */
    get token0Price(): Price<Token, Token>;
    /**
     * Returns the current mid price of the pool in terms of token1, i.e. the ratio of token0 over token1
     */
    get token1Price(): Price<Token, Token>;
    /**
     * Return the price of the given token in terms of the other token in the pool.
     * @param token The token to return price of
     * @returns The price of the given token, in terms of the other.
     */
    priceOf(token: Token): Price<Token, Token>;
    /**
     * Returns the chain ID of the tokens in the pool.
     */
    get chainId(): number;
    /**
     * Given an input amount of a token, return the computed output amount, and a pool with state updated after the trade
     * @param inputAmount The input amount for which to quote the output amount
     * @param sqrtPriceLimitX96 The Q64.96 sqrt price limit
     * @returns The output amount and the pool with updated state
     */
    getOutputAmount(inputAmount: CurrencyAmount<Token>, sqrtPriceLimitX96?: JSBI): Promise<[CurrencyAmount<Token>, Pool]>;
    /**
     * Given a desired output amount of a token, return the computed input amount and a pool with state updated after the trade
     * @param outputAmount the output amount for which to quote the input amount
     * @param sqrtPriceLimitX96 The Q64.96 sqrt price limit. If zero for one, the price cannot be less than this value after the swap. If one for zero, the price cannot be greater than this value after the swap
     * @returns The input amount and the pool with updated state
     */
    getInputAmount(outputAmount: CurrencyAmount<Token>, sqrtPriceLimitX96?: JSBI): Promise<[CurrencyAmount<Token>, Pool]>;
    /**
     * Executes a swap
     * @param zeroForOne Whether the amount in is token0 or token1
     * @param amountSpecified The amount of the swap, which implicitly configures the swap as exact input (positive), or exact output (negative)
     * @param sqrtPriceLimitX96 The Q64.96 sqrt price limit. If zero for one, the price cannot be less than this value after the swap. If one for zero, the price cannot be greater than this value after the swap
     * @returns amountCalculated
     * @returns sqrtRatioX96
     * @returns liquidity
     * @returns tickCurrent
     */
    private swap;
    get tickSpacing(): number;
}

interface PositionConstructorArgs {
    pool: Pool;
    tickLower: number;
    tickUpper: number;
    liquidity: BigintIsh;
}
/**
 * Represents a position on a Uniswap V3 Pool
 */
declare class Position {
    readonly pool: Pool;
    readonly tickLower: number;
    readonly tickUpper: number;
    readonly liquidity: JSBI;
    private _token0Amount;
    private _token1Amount;
    private _mintAmounts;
    /**
     * Constructs a position for a given pool with the given liquidity
     * @param pool For which pool the liquidity is assigned
     * @param liquidity The amount of liquidity that is in the position
     * @param tickLower The lower tick of the position
     * @param tickUpper The upper tick of the position
     */
    constructor({ pool, liquidity, tickLower, tickUpper }: PositionConstructorArgs);
    /**
     * Returns the price of token0 at the lower tick
     */
    get token0PriceLower(): Price<Token, Token>;
    /**
     * Returns the price of token0 at the upper tick
     */
    get token0PriceUpper(): Price<Token, Token>;
    /**
     * Returns the amount of token0 that this position's liquidity could be burned for at the current pool price
     */
    get amount0(): CurrencyAmount<Token>;
    /**
     * Returns the amount of token1 that this position's liquidity could be burned for at the current pool price
     */
    get amount1(): CurrencyAmount<Token>;
    /**
     * Returns the lower and upper sqrt ratios if the price 'slips' up to slippage tolerance percentage
     * @param slippageTolerance The amount by which the price can 'slip' before the transaction will revert
     * @returns The sqrt ratios after slippage
     */
    private ratiosAfterSlippage;
    /**
     * Returns the minimum amounts that must be sent in order to safely mint the amount of liquidity held by the position
     * with the given slippage tolerance
     * @param slippageTolerance Tolerance of unfavorable slippage from the current price
     * @returns The amounts, with slippage
     */
    mintAmountsWithSlippage(slippageTolerance: Percent): Readonly<{
        amount0: JSBI;
        amount1: JSBI;
    }>;
    /**
     * Returns the minimum amounts that should be requested in order to safely burn the amount of liquidity held by the
     * position with the given slippage tolerance
     * @param slippageTolerance tolerance of unfavorable slippage from the current price
     * @returns The amounts, with slippage
     */
    burnAmountsWithSlippage(slippageTolerance: Percent): Readonly<{
        amount0: JSBI;
        amount1: JSBI;
    }>;
    /**
     * Returns the minimum amounts that must be sent in order to mint the amount of liquidity held by the position at
     * the current price for the pool
     */
    get mintAmounts(): Readonly<{
        amount0: JSBI;
        amount1: JSBI;
    }>;
    /**
     * Computes the maximum amount of liquidity received for a given amount of token0, token1,
     * and the prices at the tick boundaries.
     * @param pool The pool for which the position should be created
     * @param tickLower The lower tick of the position
     * @param tickUpper The upper tick of the position
     * @param amount0 token0 amount
     * @param amount1 token1 amount
     * @param useFullPrecision If false, liquidity will be maximized according to what the router can calculate,
     * not what core can theoretically support
     * @returns The amount of liquidity for the position
     */
    static fromAmounts({ pool, tickLower, tickUpper, amount0, amount1, useFullPrecision, }: {
        pool: Pool;
        tickLower: number;
        tickUpper: number;
        amount0: BigintIsh;
        amount1: BigintIsh;
        useFullPrecision: boolean;
    }): Position;
    /**
     * Computes a position with the maximum amount of liquidity received for a given amount of token0, assuming an unlimited amount of token1
     * @param pool The pool for which the position is created
     * @param tickLower The lower tick
     * @param tickUpper The upper tick
     * @param amount0 The desired amount of token0
     * @param useFullPrecision If true, liquidity will be maximized according to what the router can calculate,
     * not what core can theoretically support
     * @returns The position
     */
    static fromAmount0({ pool, tickLower, tickUpper, amount0, useFullPrecision, }: {
        pool: Pool;
        tickLower: number;
        tickUpper: number;
        amount0: BigintIsh;
        useFullPrecision: boolean;
    }): Position;
    /**
     * Computes a position with the maximum amount of liquidity received for a given amount of token1, assuming an unlimited amount of token0
     * @param pool The pool for which the position is created
     * @param tickLower The lower tick
     * @param tickUpper The upper tick
     * @param amount1 The desired amount of token1
     * @returns The position
     */
    static fromAmount1({ pool, tickLower, tickUpper, amount1, }: {
        pool: Pool;
        tickLower: number;
        tickUpper: number;
        amount1: BigintIsh;
    }): Position;
}

/**
 * Represents a list of pools through which a swap can occur
 * @template TInput The input token
 * @template TOutput The output token
 */
declare class Route<TInput extends Currency, TOutput extends Currency> {
    readonly pools: Pool[];
    readonly tokenPath: Token[];
    readonly input: TInput;
    readonly output: TOutput;
    private _midPrice;
    /**
     * Creates an instance of route.
     * @param pools An array of `Pool` objects, ordered by the route the swap will take
     * @param input The input token
     * @param output The output token
     */
    constructor(pools: Pool[], input: TInput, output: TOutput);
    get chainId(): number;
    /**
     * Returns the mid price of the route
     */
    get midPrice(): Price<TInput, TOutput>;
}

/**
 * Trades comparator, an extension of the input output comparator that also considers other dimensions of the trade in ranking them
 * @template TInput The input token, either Ether or an ERC-20
 * @template TOutput The output token, either Ether or an ERC-20
 * @template TTradeType The trade type, either exact input or exact output
 * @param a The first trade to compare
 * @param b The second trade to compare
 * @returns A sorted ordering for two neighboring elements in a trade array
 */
declare function tradeComparator<TInput extends Currency, TOutput extends Currency, TTradeType extends TradeType>(a: Trade<TInput, TOutput, TTradeType>, b: Trade<TInput, TOutput, TTradeType>): number;
interface BestTradeOptions {
    maxNumResults?: number;
    maxHops?: number;
}
/**
 * Represents a trade executed against a set of routes where some percentage of the input is
 * split across each route.
 *
 * Each route has its own set of pools. Pools can not be re-used across routes.
 *
 * Does not account for slippage, i.e., changes in price environment that can occur between
 * the time the trade is submitted and when it is executed.
 * @template TInput The input token, either Ether or an ERC-20
 * @template TOutput The output token, either Ether or an ERC-20
 * @template TTradeType The trade type, either exact input or exact output
 */
declare class Trade<TInput extends Currency, TOutput extends Currency, TTradeType extends TradeType> {
    /**
     * @deprecated Deprecated in favor of 'swaps' property. If the trade consists of multiple routes
     * this will return an error.
     *
     * When the trade consists of just a single route, this returns the route of the trade,
     * i.e. which pools the trade goes through.
     */
    get route(): Route<TInput, TOutput>;
    /**
     * The swaps of the trade, i.e. which routes and how much is swapped in each that
     * make up the trade.
     */
    readonly swaps: {
        route: Route<TInput, TOutput>;
        inputAmount: CurrencyAmount<TInput>;
        outputAmount: CurrencyAmount<TOutput>;
    }[];
    /**
     * The type of the trade, either exact in or exact out.
     */
    readonly tradeType: TTradeType;
    /**
     * The cached result of the input amount computation
     * @private
     */
    private _inputAmount;
    /**
     * The input amount for the trade assuming no slippage.
     */
    get inputAmount(): CurrencyAmount<TInput>;
    /**
     * The cached result of the output amount computation
     * @private
     */
    private _outputAmount;
    /**
     * The output amount for the trade assuming no slippage.
     */
    get outputAmount(): CurrencyAmount<TOutput>;
    /**
     * The cached result of the computed execution price
     * @private
     */
    private _executionPrice;
    /**
     * The price expressed in terms of output amount/input amount.
     */
    get executionPrice(): Price<TInput, TOutput>;
    /**
     * The cached result of the price impact computation
     * @private
     */
    private _priceImpact;
    /**
     * Returns the percent difference between the route's mid price and the price impact
     */
    get priceImpact(): Percent;
    /**
     * Constructs an exact in trade with the given amount in and route
     * @template TInput The input token, either Ether or an ERC-20
     * @template TOutput The output token, either Ether or an ERC-20
     * @param route The route of the exact in trade
     * @param amountIn The amount being passed in
     * @returns The exact in trade
     */
    static exactIn<TInput extends Currency, TOutput extends Currency>(route: Route<TInput, TOutput>, amountIn: CurrencyAmount<TInput>): Promise<Trade<TInput, TOutput, TradeType.EXACT_INPUT>>;
    /**
     * Constructs an exact out trade with the given amount out and route
     * @template TInput The input token, either Ether or an ERC-20
     * @template TOutput The output token, either Ether or an ERC-20
     * @param route The route of the exact out trade
     * @param amountOut The amount returned by the trade
     * @returns The exact out trade
     */
    static exactOut<TInput extends Currency, TOutput extends Currency>(route: Route<TInput, TOutput>, amountOut: CurrencyAmount<TOutput>): Promise<Trade<TInput, TOutput, TradeType.EXACT_OUTPUT>>;
    /**
     * Constructs a trade by simulating swaps through the given route
     * @template TInput The input token, either Ether or an ERC-20.
     * @template TOutput The output token, either Ether or an ERC-20.
     * @template TTradeType The type of the trade, either exact in or exact out.
     * @param route route to swap through
     * @param amount the amount specified, either input or output, depending on tradeType
     * @param tradeType whether the trade is an exact input or exact output swap
     * @returns The route
     */
    static fromRoute<TInput extends Currency, TOutput extends Currency, TTradeType extends TradeType>(route: Route<TInput, TOutput>, amount: TTradeType extends TradeType.EXACT_INPUT ? CurrencyAmount<TInput> : CurrencyAmount<TOutput>, tradeType: TTradeType): Promise<Trade<TInput, TOutput, TTradeType>>;
    /**
     * Constructs a trade from routes by simulating swaps
     *
     * @template TInput The input token, either Ether or an ERC-20.
     * @template TOutput The output token, either Ether or an ERC-20.
     * @template TTradeType The type of the trade, either exact in or exact out.
     * @param routes the routes to swap through and how much of the amount should be routed through each
     * @param tradeType whether the trade is an exact input or exact output swap
     * @returns The trade
     */
    static fromRoutes<TInput extends Currency, TOutput extends Currency, TTradeType extends TradeType>(routes: {
        amount: TTradeType extends TradeType.EXACT_INPUT ? CurrencyAmount<TInput> : CurrencyAmount<TOutput>;
        route: Route<TInput, TOutput>;
    }[], tradeType: TTradeType): Promise<Trade<TInput, TOutput, TTradeType>>;
    /**
     * Creates a trade without computing the result of swapping through the route. Useful when you have simulated the trade
     * elsewhere and do not have any tick data
     * @template TInput The input token, either Ether or an ERC-20
     * @template TOutput The output token, either Ether or an ERC-20
     * @template TTradeType The type of the trade, either exact in or exact out
     * @param constructorArguments The arguments passed to the trade constructor
     * @returns The unchecked trade
     */
    static createUncheckedTrade<TInput extends Currency, TOutput extends Currency, TTradeType extends TradeType>(constructorArguments: {
        route: Route<TInput, TOutput>;
        inputAmount: CurrencyAmount<TInput>;
        outputAmount: CurrencyAmount<TOutput>;
        tradeType: TTradeType;
    }): Trade<TInput, TOutput, TTradeType>;
    /**
     * Creates a trade without computing the result of swapping through the routes. Useful when you have simulated the trade
     * elsewhere and do not have any tick data
     * @template TInput The input token, either Ether or an ERC-20
     * @template TOutput The output token, either Ether or an ERC-20
     * @template TTradeType The type of the trade, either exact in or exact out
     * @param constructorArguments The arguments passed to the trade constructor
     * @returns The unchecked trade
     */
    static createUncheckedTradeWithMultipleRoutes<TInput extends Currency, TOutput extends Currency, TTradeType extends TradeType>(constructorArguments: {
        routes: {
            route: Route<TInput, TOutput>;
            inputAmount: CurrencyAmount<TInput>;
            outputAmount: CurrencyAmount<TOutput>;
        }[];
        tradeType: TTradeType;
    }): Trade<TInput, TOutput, TTradeType>;
    /**
     * Construct a trade by passing in the pre-computed property values
     * @param routes The routes through which the trade occurs
     * @param tradeType The type of trade, exact input or exact output
     */
    private constructor();
    /**
     * Get the minimum amount that must be received from this trade for the given slippage tolerance
     * @param slippageTolerance The tolerance of unfavorable slippage from the execution price of this trade
     * @returns The amount out
     */
    minimumAmountOut(slippageTolerance: Percent, amountOut?: CurrencyAmount<TOutput>): CurrencyAmount<TOutput>;
    /**
     * Get the maximum amount in that can be spent via this trade for the given slippage tolerance
     * @param slippageTolerance The tolerance of unfavorable slippage from the execution price of this trade
     * @returns The amount in
     */
    maximumAmountIn(slippageTolerance: Percent, amountIn?: CurrencyAmount<TInput>): CurrencyAmount<TInput>;
    /**
     * Return the execution price after accounting for slippage tolerance
     * @param slippageTolerance the allowed tolerated slippage
     * @returns The execution price
     */
    worstExecutionPrice(slippageTolerance: Percent): Price<TInput, TOutput>;
    /**
     * Given a list of pools, and a fixed amount in, returns the top `maxNumResults` trades that go from an input token
     * amount to an output token, making at most `maxHops` hops.
     * Note this does not consider aggregation, as routes are linear. It's possible a better route exists by splitting
     * the amount in among multiple routes.
     * @param pools the pools to consider in finding the best trade
     * @param nextAmountIn exact amount of input currency to spend
     * @param currencyOut the desired currency out
     * @param maxNumResults maximum number of results to return
     * @param maxHops maximum number of hops a returned trade can make, e.g. 1 hop goes through a single pool
     * @param currentPools used in recursion; the current list of pools
     * @param currencyAmountIn used in recursion; the original value of the currencyAmountIn parameter
     * @param bestTrades used in recursion; the current list of best trades
     * @returns The exact in trade
     */
    static bestTradeExactIn<TInput extends Currency, TOutput extends Currency>(pools: Pool[], currencyAmountIn: CurrencyAmount<TInput>, currencyOut: TOutput, { maxNumResults, maxHops }?: BestTradeOptions, currentPools?: Pool[], nextAmountIn?: CurrencyAmount<Currency>, bestTrades?: Trade<TInput, TOutput, TradeType.EXACT_INPUT>[]): Promise<Trade<TInput, TOutput, TradeType.EXACT_INPUT>[]>;
    /**
     * similar to the above method but instead targets a fixed output amount
     * given a list of pools, and a fixed amount out, returns the top `maxNumResults` trades that go from an input token
     * to an output token amount, making at most `maxHops` hops
     * note this does not consider aggregation, as routes are linear. it's possible a better route exists by splitting
     * the amount in among multiple routes.
     * @param pools the pools to consider in finding the best trade
     * @param currencyIn the currency to spend
     * @param currencyAmountOut the desired currency amount out
     * @param nextAmountOut the exact amount of currency out
     * @param maxNumResults maximum number of results to return
     * @param maxHops maximum number of hops a returned trade can make, e.g. 1 hop goes through a single pool
     * @param currentPools used in recursion; the current list of pools
     * @param bestTrades used in recursion; the current list of best trades
     * @returns The exact out trade
     */
    static bestTradeExactOut<TInput extends Currency, TOutput extends Currency>(pools: Pool[], currencyIn: TInput, currencyAmountOut: CurrencyAmount<TOutput>, { maxNumResults, maxHops }?: BestTradeOptions, currentPools?: Pool[], nextAmountOut?: CurrencyAmount<Currency>, bestTrades?: Trade<TInput, TOutput, TradeType.EXACT_OUTPUT>[]): Promise<Trade<TInput, TOutput, TradeType.EXACT_OUTPUT>[]>;
}

/**
 * A data provider for ticks that is backed by an in-memory array of ticks.
 */
declare class TickListDataProvider implements TickDataProvider {
    private ticks;
    constructor(ticks: (Tick | TickConstructorArgs)[], tickSpacing: number);
    getTick(tick: number): Promise<{
        liquidityNet: BigintIsh;
        liquidityGross: BigintIsh;
    }>;
    nextInitializedTickWithinOneWord(tick: number, lte: boolean, tickSpacing: number): Promise<[number, boolean]>;
}

/**
 * Generated method parameters for executing a call.
 */
interface MethodParameters {
    /**
     * The hex encoded calldata to perform the given operation
     */
    calldata: string;
    /**
     * The amount of ether (wei) to send in hex.
     */
    value: string;
}
/**
 * Converts a big int to a hex string
 * @param bigintIsh
 * @returns The hex encoded calldata
 */
declare function toHex(bigintIsh: BigintIsh): string;

/**
 * Computes a pool address
 * @param factoryAddress The Uniswap V3 factory address
 * @param tokenA The first token of the pair, irrespective of sort order
 * @param tokenB The second token of the pair, irrespective of sort order
 * @param fee The fee tier of the pool
 * @param initCodeHashManualOverride Override the init code hash used to compute the pool address if necessary
 * @param chainId
 * @returns The pool address
 */
declare function computePoolAddress({ factoryAddress, tokenA, tokenB, fee, initCodeHashManualOverride, chainId, }: {
    factoryAddress: string;
    tokenA: Token;
    tokenB: Token;
    fee: FeeAmount;
    initCodeHashManualOverride?: string;
    chainId?: ChainId;
}): string;

/**
 * Converts a route to a hex encoded path
 * @param route the v3 path to convert to an encoded path
 * @param exactOutput whether the route should be encoded in reverse, for making exact output swaps
 */
declare function encodeRouteToPath(route: Route<Currency, Currency>, exactOutput: boolean): string;

/**
 * Returns the sqrt ratio as a Q64.96 corresponding to a given ratio of amount1 and amount0
 * @param amount1 The numerator amount i.e., the amount of token1
 * @param amount0 The denominator amount i.e., the amount of token0
 * @returns The sqrt ratio
 */
declare function encodeSqrtRatioX96(amount1: BigintIsh, amount0: BigintIsh): JSBI;

declare abstract class FullMath {
    /**
     * Cannot be constructed.
     */
    private constructor();
    static mulDivRoundingUp(a: JSBI, b: JSBI, denominator: JSBI): JSBI;
}

/**
 * Determines if a tick list is sorted
 * @param list The tick list
 * @param comparator The comparator
 * @returns true if sorted
 */
declare function isSorted<T>(list: Array<T>, comparator: (a: T, b: T) => number): boolean;

declare abstract class LiquidityMath {
    /**
     * Cannot be constructed.
     */
    private constructor();
    static addDelta(x: JSBI, y: JSBI): JSBI;
}

/**
 * Computes the maximum amount of liquidity received for a given amount of token0, token1,
 * and the prices at the tick boundaries.
 * @param sqrtRatioCurrentX96 the current price
 * @param sqrtRatioAX96 price at lower boundary
 * @param sqrtRatioBX96 price at upper boundary
 * @param amount0 token0 amount
 * @param amount1 token1 amount
 * @param useFullPrecision if false, liquidity will be maximized according to what the router can calculate,
 * not what core can theoretically support
 */
declare function maxLiquidityForAmounts(sqrtRatioCurrentX96: JSBI, sqrtRatioAX96: JSBI, sqrtRatioBX96: JSBI, amount0: BigintIsh, amount1: BigintIsh, useFullPrecision: boolean): JSBI;

declare function mostSignificantBit(x: JSBI): number;

/**
 * Returns the closest tick that is nearest a given tick and usable for the given tick spacing
 * @param tick the target tick
 * @param tickSpacing the spacing of the pool
 */
declare function nearestUsableTick(tick: number, tickSpacing: number): number;

declare abstract class PositionLibrary {
    /**
     * Cannot be constructed.
     */
    private constructor();
    static getTokensOwed(feeGrowthInside0LastX128: JSBI, feeGrowthInside1LastX128: JSBI, liquidity: JSBI, feeGrowthInside0X128: JSBI, feeGrowthInside1X128: JSBI): JSBI[];
}

/**
 * Returns a price object corresponding to the input tick and the base/quote token
 * Inputs must be tokens because the address order is used to interpret the price represented by the tick
 * @param baseToken the base token of the price
 * @param quoteToken the quote token of the price
 * @param tick the tick for which to return the price
 */
declare function tickToPrice(baseToken: Token, quoteToken: Token, tick: number): Price<Token, Token>;
/**
 * Returns the first tick for which the given price is greater than or equal to the tick price
 * @param price for which to return the closest tick that represents a price less than or equal to the input price,
 * i.e. the price of the returned tick is less than or equal to the input price
 */
declare function priceToClosestTick(price: Price<Token, Token>): number;

declare abstract class SqrtPriceMath {
    /**
     * Cannot be constructed.
     */
    private constructor();
    static getAmount0Delta(sqrtRatioAX96: JSBI, sqrtRatioBX96: JSBI, liquidity: JSBI, roundUp: boolean): JSBI;
    static getAmount1Delta(sqrtRatioAX96: JSBI, sqrtRatioBX96: JSBI, liquidity: JSBI, roundUp: boolean): JSBI;
    static getNextSqrtPriceFromInput(sqrtPX96: JSBI, liquidity: JSBI, amountIn: JSBI, zeroForOne: boolean): JSBI;
    static getNextSqrtPriceFromOutput(sqrtPX96: JSBI, liquidity: JSBI, amountOut: JSBI, zeroForOne: boolean): JSBI;
    private static getNextSqrtPriceFromAmount0RoundingUp;
    private static getNextSqrtPriceFromAmount1RoundingDown;
}

declare function v3Swap(fee: JSBI, sqrtRatioX96: JSBI, tickCurrent: number, liquidity: JSBI, tickSpacing: number, tickDataProvider: TickDataProvider, zeroForOne: boolean, amountSpecified: JSBI, sqrtPriceLimitX96?: JSBI): Promise<{
    amountCalculated: JSBI;
    sqrtRatioX96: JSBI;
    liquidity: JSBI;
    tickCurrent: number;
}>;

declare abstract class SwapMath {
    /**
     * Cannot be constructed.
     */
    private constructor();
    static computeSwapStep(sqrtRatioCurrentX96: JSBI, sqrtRatioTargetX96: JSBI, liquidity: JSBI, amountRemaining: JSBI, feePips: JSBI | FeeAmount): [JSBI, JSBI, JSBI, JSBI];
}

interface FeeGrowthOutside {
    feeGrowthOutside0X128: JSBI;
    feeGrowthOutside1X128: JSBI;
}
declare function subIn256(x: JSBI, y: JSBI): JSBI;
declare abstract class TickLibrary {
    /**
     * Cannot be constructed.
     */
    private constructor();
    static getFeeGrowthInside(feeGrowthOutsideLower: FeeGrowthOutside, feeGrowthOutsideUpper: FeeGrowthOutside, tickLower: number, tickUpper: number, tickCurrent: number, feeGrowthGlobal0X128: JSBI, feeGrowthGlobal1X128: JSBI): JSBI[];
}

/**
 * Utility methods for interacting with sorted lists of ticks
 */
declare abstract class TickList {
    /**
     * Cannot be constructed
     */
    private constructor();
    static validateList(ticks: Tick[], tickSpacing: number): void;
    static isBelowSmallest(ticks: readonly Tick[], tick: number): boolean;
    static isAtOrAboveLargest(ticks: readonly Tick[], tick: number): boolean;
    static getTick(ticks: readonly Tick[], index: number): Tick;
    /**
     * Finds the largest tick in the list of ticks that is less than or equal to tick
     * @param ticks list of ticks
     * @param tick tick to find the largest tick that is less than or equal to tick
     * @private
     */
    private static binarySearch;
    static nextInitializedTick(ticks: readonly Tick[], tick: number, lte: boolean): Tick;
    static nextInitializedTickWithinOneWord(ticks: readonly Tick[], tick: number, lte: boolean, tickSpacing: number): [number, boolean];
}

declare abstract class TickMath {
    /**
     * Cannot be constructed.
     */
    private constructor();
    /**
     * The minimum tick that can be used on any pool.
     */
    static MIN_TICK: number;
    /**
     * The maximum tick that can be used on any pool.
     */
    static MAX_TICK: number;
    /**
     * The sqrt ratio corresponding to the minimum tick that could be used on any pool.
     */
    static MIN_SQRT_RATIO: JSBI;
    /**
     * The sqrt ratio corresponding to the maximum tick that could be used on any pool.
     */
    static MAX_SQRT_RATIO: JSBI;
    /**
     * Returns the sqrt ratio as a Q64.96 for the given tick. The sqrt ratio is computed as sqrt(1.0001)^tick
     * @param tick the tick for which to compute the sqrt ratio
     */
    static getSqrtRatioAtTick(tick: number): JSBI;
    /**
     * Returns the tick corresponding to a given sqrt ratio, s.t. #getSqrtRatioAtTick(tick) <= sqrtRatioX96
     * and #getSqrtRatioAtTick(tick + 1) > sqrtRatioX96
     * @param sqrtRatioX96 the sqrt ratio as a Q64.96 for which to compute the tick
     */
    static getTickAtSqrtRatio(sqrtRatioX96: JSBI): number;
}

declare abstract class Multicall {
    static INTERFACE: Interface;
    /**
     * Cannot be constructed.
     */
    private constructor();
    static encodeMulticall(calldatas: string | string[]): string;
    static decodeMulticall(multicall: string): string[];
}

interface StandardPermitArguments {
    v: 0 | 1 | 27 | 28;
    r: string;
    s: string;
    amount: BigintIsh;
    deadline: BigintIsh;
}
interface AllowedPermitArguments {
    v: 0 | 1 | 27 | 28;
    r: string;
    s: string;
    nonce: BigintIsh;
    expiry: BigintIsh;
}
type PermitOptions = StandardPermitArguments | AllowedPermitArguments;
declare abstract class SelfPermit {
    static INTERFACE: Interface;
    /**
     * Cannot be constructed.
     */
    private constructor();
    static encodePermit(token: Token, options: PermitOptions): string;
}

interface MintSpecificOptions {
    /**
     * The account that should receive the minted NFT.
     */
    recipient: string;
    /**
     * Creates pool if not initialized before mint.
     */
    createPool?: boolean;
}
interface IncreaseSpecificOptions {
    /**
     * Indicates the ID of the position to increase liquidity for.
     */
    tokenId: BigintIsh;
}
/**
 * Options for producing the calldata to add liquidity.
 */
interface CommonAddLiquidityOptions {
    /**
     * How much the pool price is allowed to move.
     */
    slippageTolerance: Percent;
    /**
     * When the transaction expires, in epoch seconds.
     */
    deadline: BigintIsh;
    /**
     * Whether to spend ether. If true, one of the pool tokens must be WETH, by default false
     */
    useNative?: NativeCurrency;
    /**
     * The optional permit parameters for spending token0
     */
    token0Permit?: PermitOptions;
    /**
     * The optional permit parameters for spending token1
     */
    token1Permit?: PermitOptions;
}
type MintOptions = CommonAddLiquidityOptions & MintSpecificOptions;
type IncreaseOptions = CommonAddLiquidityOptions & IncreaseSpecificOptions;
type AddLiquidityOptions = MintOptions | IncreaseOptions;
interface SafeTransferOptions {
    /**
     * The account sending the NFT.
     */
    sender: string;
    /**
     * The account that should receive the NFT.
     */
    recipient: string;
    /**
     * The id of the token being sent.
     */
    tokenId: BigintIsh;
    /**
     * The optional parameter that passes data to the `onERC721Received` call for the staker
     */
    data?: string;
}
interface CollectOptions {
    /**
     * Indicates the ID of the position to collect for.
     */
    tokenId: BigintIsh;
    /**
     * Expected value of tokensOwed0, including as-of-yet-unaccounted-for fees/liquidity value to be burned
     */
    expectedCurrencyOwed0: CurrencyAmount<Currency>;
    /**
     * Expected value of tokensOwed1, including as-of-yet-unaccounted-for fees/liquidity value to be burned
     */
    expectedCurrencyOwed1: CurrencyAmount<Currency>;
    /**
     * The account that should receive the tokens.
     */
    recipient: string;
}
interface NFTPermitValues {
    spender: string;
    tokenId: BigintIsh;
    deadline: BigintIsh;
    nonce: BigintIsh;
}
interface NFTPermitData {
    domain: TypedDataDomain;
    types: Record<string, TypedDataField[]>;
    values: NFTPermitValues;
}
interface NFTPermitOptions {
    v: 0 | 1 | 27 | 28;
    r: string;
    s: string;
    deadline: BigintIsh;
    spender: string;
}
/**
 * Options for producing the calldata to exit a position.
 */
interface RemoveLiquidityOptions {
    /**
     * The ID of the token to exit
     */
    tokenId: BigintIsh;
    /**
     * The percentage of position liquidity to exit.
     */
    liquidityPercentage: Percent;
    /**
     * How much the pool price is allowed to move.
     */
    slippageTolerance: Percent;
    /**
     * When the transaction expires, in epoch seconds.
     */
    deadline: BigintIsh;
    /**
     * Whether the NFT should be burned if the entire position is being exited, by default false.
     */
    burnToken?: boolean;
    /**
     * The optional permit of the token ID being exited, in case the exit transaction is being sent by an account that does not own the NFT
     */
    permit?: NFTPermitOptions;
    /**
     * Parameters to be passed on to collect
     */
    collectOptions: Omit<CollectOptions, 'tokenId'>;
}
declare abstract class NonfungiblePositionManager {
    static INTERFACE: Interface;
    /**
     * Cannot be constructed.
     */
    private constructor();
    private static encodeCreate;
    static createCallParameters(pool: Pool): MethodParameters;
    static addCallParameters(position: Position, options: AddLiquidityOptions): MethodParameters;
    private static encodeCollect;
    static collectCallParameters(options: CollectOptions): MethodParameters;
    /**
     * Produces the calldata for completely or partially exiting a position
     * @param position The position to exit
     * @param options Additional information necessary for generating the calldata
     * @returns The call parameters
     */
    static removeCallParameters(position: Position, options: RemoveLiquidityOptions): MethodParameters;
    static safeTransferFromParameters(options: SafeTransferOptions): MethodParameters;
    static getPermitData(permit: NFTPermitValues, positionManagerAddress: string, chainId: number): NFTPermitData;
}

interface FeeOptions {
    /**
     * The percent of the output that will be taken as a fee.
     */
    fee: Percent;
    /**
     * The recipient of the fee.
     */
    recipient: string;
}
declare abstract class Payments {
    static INTERFACE: Interface;
    /**
     * Cannot be constructed.
     */
    private constructor();
    private static encodeFeeBips;
    static encodeUnwrapWETH9(amountMinimum: JSBI, recipient: string, feeOptions?: FeeOptions): string;
    static encodeSweepToken(token: Token, amountMinimum: JSBI, recipient: string, feeOptions?: FeeOptions): string;
    static encodeRefundETH(): string;
}

/**
 * Optional arguments to send to the quoter.
 */
interface QuoteOptions {
    /**
     * The optional price limit for the trade.
     */
    sqrtPriceLimitX96?: BigintIsh;
    /**
     * The optional quoter interface to use
     */
    useQuoterV2?: boolean;
}
/**
 * Represents the Uniswap V3 QuoterV1 contract with a method for returning the formatted
 * calldata needed to call the quoter contract.
 */
declare abstract class SwapQuoter {
    static V1INTERFACE: Interface;
    static V2INTERFACE: Interface;
    /**
     * Produces the on-chain method name of the appropriate function within QuoterV2,
     * and the relevant hex encoded parameters.
     * @template TInput The input token, either Ether or an ERC-20
     * @template TOutput The output token, either Ether or an ERC-20
     * @param route The swap route, a list of pools through which a swap can occur
     * @param amount The amount of the quote, either an amount in, or an amount out
     * @param tradeType The trade type, either exact input or exact output
     * @param options The optional params including price limit and Quoter contract switch
     * @returns The formatted calldata
     */
    static quoteCallParameters<TInput extends Currency, TOutput extends Currency>(route: Route<TInput, TOutput>, amount: CurrencyAmount<TInput | TOutput>, tradeType: TradeType, options?: QuoteOptions): MethodParameters;
}

type FullWithdrawOptions = ClaimOptions & WithdrawOptions;
/**
 * Represents a unique staking program.
 */
interface IncentiveKey {
    /**
     * The token rewarded for participating in the staking program.
     */
    rewardToken: Token;
    /**
     * The pool that the staked positions must provide in.
     */
    pool: Pool;
    /**
     * The time when the incentive program begins.
     */
    startTime: BigintIsh;
    /**
     * The time that the incentive program ends.
     */
    endTime: BigintIsh;
    /**
     * The address which receives any remaining reward tokens at `endTime`.
     */
    refundee: string;
}
/**
 * Options to specify when claiming rewards.
 */
interface ClaimOptions {
    /**
     * The id of the NFT
     */
    tokenId: BigintIsh;
    /**
     * Address to send rewards to.
     */
    recipient: string;
    /**
     * The amount of `rewardToken` to claim. 0 claims all.
     */
    amount?: BigintIsh;
}
/**
 * Options to specify when withdrawing a position.
 */
interface WithdrawOptions {
    /**
     * Set when withdrawing. The position will be sent to `owner` on withdraw.
     */
    owner: string;
    /**
     * Set when withdrawing. `data` is passed to `safeTransferFrom` when transferring the position from contract back to owner.
     */
    data?: string;
}
declare abstract class Staker {
    static INTERFACE: Interface;
    protected constructor();
    private static INCENTIVE_KEY_ABI;
    /**
     *  To claim rewards, must unstake and then claim.
     * @param incentiveKey The unique identifier of a staking program.
     * @param options Options for producing the calldata to claim. Can't claim unless you unstake.
     * @returns The calldatas for 'unstakeToken' and 'claimReward'.
     */
    private static encodeClaim;
    /**
     *
     * Note:  A `tokenId` can be staked in many programs but to claim rewards and continue the program you must unstake, claim, and then restake.
     * @param incentiveKeys An IncentiveKey or array of IncentiveKeys that `tokenId` is staked in.
     * Input an array of IncentiveKeys to claim rewards for each program.
     * @param options ClaimOptions to specify tokenId, recipient, and amount wanting to collect.
     * Note that you can only specify one amount and one recipient across the various programs if you are collecting from multiple programs at once.
     * @returns
     */
    static collectRewards(incentiveKeys: IncentiveKey | IncentiveKey[], options: ClaimOptions): MethodParameters;
    /**
     *
     * @param incentiveKeys A list of incentiveKeys to unstake from. Should include all incentiveKeys (unique staking programs) that `options.tokenId` is staked in.
     * @param withdrawOptions Options for producing claim calldata and withdraw calldata. Can't withdraw without unstaking all programs for `tokenId`.
     * @returns Calldata for unstaking, claiming, and withdrawing.
     */
    static withdrawToken(incentiveKeys: IncentiveKey | IncentiveKey[], withdrawOptions: FullWithdrawOptions): MethodParameters;
    /**
     *
     * @param incentiveKeys A single IncentiveKey or array of IncentiveKeys to be encoded and used in the data parameter in `safeTransferFrom`
     * @returns An IncentiveKey as a string
     */
    static encodeDeposit(incentiveKeys: IncentiveKey | IncentiveKey[]): string;
    /**
     *
     * @param incentiveKey An `IncentiveKey` which represents a unique staking program.
     * @returns An encoded IncentiveKey to be read by ethers
     */
    private static _encodeIncentiveKey;
}

/**
 * Options for producing the arguments to send calls to the router.
 */
interface SwapOptions {
    /**
     * How much the execution price is allowed to move unfavorably from the trade execution price.
     */
    slippageTolerance: Percent;
    /**
     * The account that should receive the output.
     */
    recipient: string;
    /**
     * When the transaction expires, in epoch seconds.
     */
    deadline: BigintIsh;
    /**
     * The optional permit parameters for spending the input.
     */
    inputTokenPermit?: PermitOptions;
    /**
     * The optional price limit for the trade.
     */
    sqrtPriceLimitX96?: BigintIsh;
    /**
     * Optional information for taking a fee on output.
     */
    fee?: FeeOptions;
}
/**
 * Represents the Uniswap V3 SwapRouter, and has static methods for helping execute trades.
 */
declare abstract class SwapRouter {
    static INTERFACE: Interface;
    /**
     * Cannot be constructed.
     */
    private constructor();
    /**
     * Produces the on-chain method name to call and the hex encoded parameters to pass as arguments for a given trade.
     * @param trade to produce call parameters for
     * @param options options for the call parameters
     */
    static swapCallParameters(trades: Trade<Currency, Currency, TradeType> | Trade<Currency, Currency, TradeType>[], options: SwapOptions): MethodParameters;
}

export { ADDRESS_ZERO, type AddLiquidityOptions, type AllowedPermitArguments, type BestTradeOptions, type ClaimOptions, type CollectOptions, type CommonAddLiquidityOptions, FACTORY_ADDRESS, FeeAmount, type FeeOptions, FullMath, type FullWithdrawOptions, type IncentiveKey, type IncreaseOptions, type IncreaseSpecificOptions, LiquidityMath, type MethodParameters, type MintOptions, type MintSpecificOptions, Multicall, type NFTPermitData, type NFTPermitOptions, type NFTPermitValues, NoTickDataProvider, NonfungiblePositionManager, POOL_INIT_CODE_HASH, Payments, type PermitOptions, Pool, Position, PositionLibrary, type QuoteOptions, type RemoveLiquidityOptions, Route, type SafeTransferOptions, SelfPermit, SqrtPriceMath, Staker, type StandardPermitArguments, SwapMath, type SwapOptions, SwapQuoter, SwapRouter, TICK_SPACINGS, Tick, type TickConstructorArgs, type TickDataProvider, TickLibrary, TickList, TickListDataProvider, TickMath, Trade, type WithdrawOptions, computePoolAddress, encodeRouteToPath, encodeSqrtRatioX96, isSorted, maxLiquidityForAmounts, mostSignificantBit, nearestUsableTick, poolInitCodeHash, priceToClosestTick, subIn256, tickToPrice, toHex, tradeComparator, v3Swap };
