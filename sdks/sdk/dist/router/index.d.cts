import JSBI from 'jsbi';
import { Interface } from '@ethersproject/abi';
import { BigNumber } from '@ethersproject/bignumber';

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

declare const ADDRESS_ZERO = "0x0000000000000000000000000000000000000000";
declare const MSG_SENDER = "0x0000000000000000000000000000000000000001";
declare const ADDRESS_THIS = "0x0000000000000000000000000000000000000002";
declare const ZERO: JSBI;
declare const ONE: JSBI;
declare const MIXED_QUOTER_V1_V2_FEE_PATH_PLACEHOLDER: number;
declare const MIXED_QUOTER_V2_V2_FEE_PATH_PLACEHOLDER: number;
declare const MIXED_QUOTER_V2_V3_FEE_PATH_PLACEHOLDER: number;
declare const MIXED_QUOTER_V2_V4_FEE_PATH_PLACEHOLDER: number;
declare const ZERO_PERCENT: Percent;
declare const ONE_HUNDRED_PERCENT: Percent;

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
 * Represents a V3 pool
 */
declare class Pool$1 {
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
    getOutputAmount(inputAmount: CurrencyAmount<Token>, sqrtPriceLimitX96?: JSBI): Promise<[CurrencyAmount<Token>, Pool$1]>;
    /**
     * Given a desired output amount of a token, return the computed input amount and a pool with state updated after the trade
     * @param outputAmount the output amount for which to quote the input amount
     * @param sqrtPriceLimitX96 The Q64.96 sqrt price limit. If zero for one, the price cannot be less than this value after the swap. If one for zero, the price cannot be greater than this value after the swap
     * @returns The input amount and the pool with updated state
     */
    getInputAmount(outputAmount: CurrencyAmount<Token>, sqrtPriceLimitX96?: JSBI): Promise<[CurrencyAmount<Token>, Pool$1]>;
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
    pool: Pool$1;
    tickLower: number;
    tickUpper: number;
    liquidity: BigintIsh;
}
/**
 * Represents a position on a Uniswap V3 Pool
 */
declare class Position {
    readonly pool: Pool$1;
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
        pool: Pool$1;
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
        pool: Pool$1;
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
        pool: Pool$1;
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
declare class Route$2<TInput extends Currency, TOutput extends Currency> {
    readonly pools: Pool$1[];
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
    constructor(pools: Pool$1[], input: TInput, output: TOutput);
    get chainId(): number;
    /**
     * Returns the mid price of the route
     */
    get midPrice(): Price<TInput, TOutput>;
}

interface BestTradeOptions$1 {
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
declare class Trade$2<TInput extends Currency, TOutput extends Currency, TTradeType extends TradeType> {
    /**
     * @deprecated Deprecated in favor of 'swaps' property. If the trade consists of multiple routes
     * this will return an error.
     *
     * When the trade consists of just a single route, this returns the route of the trade,
     * i.e. which pools the trade goes through.
     */
    get route(): Route$2<TInput, TOutput>;
    /**
     * The swaps of the trade, i.e. which routes and how much is swapped in each that
     * make up the trade.
     */
    readonly swaps: {
        route: Route$2<TInput, TOutput>;
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
    static exactIn<TInput extends Currency, TOutput extends Currency>(route: Route$2<TInput, TOutput>, amountIn: CurrencyAmount<TInput>): Promise<Trade$2<TInput, TOutput, TradeType.EXACT_INPUT>>;
    /**
     * Constructs an exact out trade with the given amount out and route
     * @template TInput The input token, either Ether or an ERC-20
     * @template TOutput The output token, either Ether or an ERC-20
     * @param route The route of the exact out trade
     * @param amountOut The amount returned by the trade
     * @returns The exact out trade
     */
    static exactOut<TInput extends Currency, TOutput extends Currency>(route: Route$2<TInput, TOutput>, amountOut: CurrencyAmount<TOutput>): Promise<Trade$2<TInput, TOutput, TradeType.EXACT_OUTPUT>>;
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
    static fromRoute<TInput extends Currency, TOutput extends Currency, TTradeType extends TradeType>(route: Route$2<TInput, TOutput>, amount: TTradeType extends TradeType.EXACT_INPUT ? CurrencyAmount<TInput> : CurrencyAmount<TOutput>, tradeType: TTradeType): Promise<Trade$2<TInput, TOutput, TTradeType>>;
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
        route: Route$2<TInput, TOutput>;
    }[], tradeType: TTradeType): Promise<Trade$2<TInput, TOutput, TTradeType>>;
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
        route: Route$2<TInput, TOutput>;
        inputAmount: CurrencyAmount<TInput>;
        outputAmount: CurrencyAmount<TOutput>;
        tradeType: TTradeType;
    }): Trade$2<TInput, TOutput, TTradeType>;
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
            route: Route$2<TInput, TOutput>;
            inputAmount: CurrencyAmount<TInput>;
            outputAmount: CurrencyAmount<TOutput>;
        }[];
        tradeType: TTradeType;
    }): Trade$2<TInput, TOutput, TTradeType>;
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
    static bestTradeExactIn<TInput extends Currency, TOutput extends Currency>(pools: Pool$1[], currencyAmountIn: CurrencyAmount<TInput>, currencyOut: TOutput, { maxNumResults, maxHops }?: BestTradeOptions$1, currentPools?: Pool$1[], nextAmountIn?: CurrencyAmount<Currency>, bestTrades?: Trade$2<TInput, TOutput, TradeType.EXACT_INPUT>[]): Promise<Trade$2<TInput, TOutput, TradeType.EXACT_INPUT>[]>;
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
    static bestTradeExactOut<TInput extends Currency, TOutput extends Currency>(pools: Pool$1[], currencyIn: TInput, currencyAmountOut: CurrencyAmount<TOutput>, { maxNumResults, maxHops }?: BestTradeOptions$1, currentPools?: Pool$1[], nextAmountOut?: CurrencyAmount<Currency>, bestTrades?: Trade$2<TInput, TOutput, TradeType.EXACT_OUTPUT>[]): Promise<Trade$2<TInput, TOutput, TradeType.EXACT_OUTPUT>[]>;
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

type CondensedAddLiquidityOptions = Omit<MintSpecificOptions, 'createPool'> | IncreaseSpecificOptions;
declare enum ApprovalTypes {
    NOT_REQUIRED = 0,
    MAX = 1,
    MAX_MINUS_ONE = 2,
    ZERO_THEN_MAX = 3,
    ZERO_THEN_MAX_MINUS_ONE = 4
}
declare function isMint(options: CondensedAddLiquidityOptions): options is Omit<MintSpecificOptions, 'createPool'>;
declare abstract class ApproveAndCall {
    static INTERFACE: Interface;
    /**
     * Cannot be constructed.
     */
    private constructor();
    static encodeApproveMax(token: Token): string;
    static encodeApproveMaxMinusOne(token: Token): string;
    static encodeApproveZeroThenMax(token: Token): string;
    static encodeApproveZeroThenMaxMinusOne(token: Token): string;
    static encodeCallPositionManager(calldatas: string[]): string;
    /**
     * Encode adding liquidity to a position in the nft manager contract
     * @param position Forcasted position with expected amount out from swap
     * @param minimalPosition Forcasted position with custom minimal token amounts
     * @param addLiquidityOptions Options for adding liquidity
     * @param slippageTolerance Defines maximum slippage
     */
    static encodeAddLiquidity(position: Position, minimalPosition: Position, addLiquidityOptions: CondensedAddLiquidityOptions, slippageTolerance: Percent): string;
    static encodeApprove(token: Currency, approvalType: ApprovalTypes): string;
}

type Validation = BigintIsh | string;
declare abstract class MulticallExtended {
    static INTERFACE: Interface;
    /**
     * Cannot be constructed.
     */
    private constructor();
    static encodeMulticall(calldatas: string | string[], validation?: Validation): string;
}

declare abstract class PaymentsExtended {
    static INTERFACE: Interface;
    /**
     * Cannot be constructed.
     */
    private constructor();
    static encodeUnwrapWETH9(amountMinimum: JSBI, recipient?: string, feeOptions?: FeeOptions): string;
    static encodeSweepToken(token: Token, amountMinimum: JSBI, recipient?: string, feeOptions?: FeeOptions): string;
    static encodePull(token: Token, amount: JSBI): string;
    static encodeWrapETH(amount: JSBI): string;
}

declare class Pair {
    readonly liquidityToken: Token;
    private readonly tokenAmounts;
    static getAddress(tokenA: Token, tokenB: Token): string;
    constructor(currencyAmountA: CurrencyAmount<Token>, tokenAmountB: CurrencyAmount<Token>);
    /**
     * Returns true if the token is either token0 or token1
     * @param token to check
     */
    involvesToken(token: Token): boolean;
    /**
     * Returns the current mid price of the pair in terms of token0, i.e. the ratio of reserve1 to reserve0
     */
    get token0Price(): Price<Token, Token>;
    /**
     * Returns the current mid price of the pair in terms of token1, i.e. the ratio of reserve0 to reserve1
     */
    get token1Price(): Price<Token, Token>;
    /**
     * Return the price of the given token in terms of the other token in the pair.
     * @param token token to return price of
     */
    priceOf(token: Token): Price<Token, Token>;
    /**
     * Returns the chain ID of the tokens in the pair.
     */
    get chainId(): number;
    get token0(): Token;
    get token1(): Token;
    get reserve0(): CurrencyAmount<Token>;
    get reserve1(): CurrencyAmount<Token>;
    reserveOf(token: Token): CurrencyAmount<Token>;
    /**
     * getAmountOut is the linear algebra of reserve ratio against amountIn:amountOut.
     * https://ethereum.stackexchange.com/questions/101629/what-is-math-for-uniswap-calculates-the-amountout-and-amountin-why-997-and-1000
     * has the math deduction for the reserve calculation without fee-on-transfer fees.
     *
     * With fee-on-transfer tax, intuitively it's just:
     * inputAmountWithFeeAndTax = 0.997 * (1 - amountIn.sellFeesBips / 10000) * amountIn
     *                          = (1 - amountIn.sellFeesBips / 10000) * amountInWithFee
     * where amountInWithFee is the amountIn after taking out the LP fees
     * outputAmountWithTax = amountOut * (1 - amountOut.buyFeesBips / 10000)
     *
     * But we are illustrating the math deduction below to ensure that's the case.
     *
     * before swap A * B = K where A = reserveIn B = reserveOut
     *
     * after swap A' * B' = K where only k is a constant value
     *
     * getAmountOut
     *
     * A' = A + 0.997 * (1 - amountIn.sellFeesBips / 10000) * amountIn # here 0.3% is deducted
     * B' = B - amountOut * (1 - amountOut.buyFeesBips / 10000)
     * amountOut = (B - B') / (1 - amountOut.buyFeesBips / 10000) # where A' * B' still is k
     *           = (B - K/(A + 0.997 * (1 - amountIn.sellFeesBips / 10000) * amountIn))
     *             /
     *             (1 - amountOut.buyFeesBips / 10000)
     *           = (B - AB/(A + 0.997 * (1 - amountIn.sellFeesBips / 10000) * amountIn))
     *             /
     *             (1 - amountOut.buyFeesBips / 10000)
     *           = ((BA + B * 0.997 * (1 - amountIn.sellFeesBips / 10000) * amountIn - AB)/(A + 0.997 * (1 - amountIn.sellFeesBips / 10000) * amountIn))
     *             /
     *             (1 - amountOut.buyFeesBips / 10000)
     *           = (B * 0.997 * (1 - amountIn.sellFeesBips / 10000) * amountIn / (A + 0.997 * (1 - amountIn.sellFeesBips / 10000) * amountIn)
     *             /
     *             (1 - amountOut.buyFeesBips / 10000)
     * amountOut * (1 - amountOut.buyFeesBips / 10000) = (B * 0.997 * (1 - amountIn.sellFeesBips / 10000) * amountIn
     *                                                    /
     *                                                    (A + 0.997 * (1 - amountIn.sellFeesBips / 10000) * amountIn)
     *
     * outputAmountWithTax = (B * 0.997 * (1 - amountIn.sellFeesBips / 10000) * amountIn
     *                       /
     *                       (A + 0.997 * (1 - amountIn.sellFeesBips / 10000) * amountIn)
     *                       = (B * 0.997 * (1 - amountIn.sellFeesBips / 10000) * amountIn * 1000
     *                       /
     *                       ((A + 0.997 * (1 - amountIn.sellFeesBips / 10000) * amountIn) * 1000)
     *                     = (B * (1 - amountIn.sellFeesBips / 10000) 997 * * amountIn
     *                       /
     *                       (1000 * A + (1 - amountIn.sellFeesBips / 10000) * 997 * amountIn)
     *                     = (B * (1 - amountIn.sellFeesBips / 10000) * inputAmountWithFee)
     *                       /
     *                       (1000 * A + (1 - amountIn.sellFeesBips / 10000) * inputAmountWithFee)
     *                     = (B * inputAmountWithFeeAndTax)
     *                       /
     *                       (1000 * A + inputAmountWithFeeAndTax)
     *
     * inputAmountWithFeeAndTax = (1 - amountIn.sellFeesBips / 10000) * inputAmountWithFee
     * outputAmountWithTax = amountOut * (1 - amountOut.buyFeesBips / 10000)
     *
     * @param inputAmount
     * @param calculateFotFees
     */
    getOutputAmount(inputAmount: CurrencyAmount<Token>, calculateFotFees?: boolean): [CurrencyAmount<Token>, Pair];
    /**
     * getAmountIn is the linear algebra of reserve ratio against amountIn:amountOut.
     * https://ethereum.stackexchange.com/questions/101629/what-is-math-for-uniswap-calculates-the-amountout-and-amountin-why-997-and-1000
     * has the math deduction for the reserve calculation without fee-on-transfer fees.
     *
     * With fee-on-transfer fees, intuitively it's just:
     * outputAmountWithTax = amountOut / (1 - amountOut.buyFeesBips / 10000)
     * inputAmountWithTax = amountIn / (1 - amountIn.sellFeesBips / 10000) / 0.997
     *
     * But we are illustrating the math deduction below to ensure that's the case.
     *
     * before swap A * B = K where A = reserveIn B = reserveOut
     *
     * after swap A' * B' = K where only k is a constant value
     *
     * getAmountIn
     *
     * B' = B - amountOut * (1 - amountOut.buyFeesBips / 10000)
     * A' = A + 0.997 * (1 - amountIn.sellFeesBips / 10000) * amountIn # here 0.3% is deducted
     * amountIn = (A' - A) / (0.997 * (1 - amountIn.sellFeesBips / 10000))
     *          = (K / (B - amountOut / (1 - amountOut.buyFeesBips / 10000)) - A)
     *            /
     *            (0.997 * (1 - amountIn.sellFeesBips / 10000))
     *          = (AB / (B - amountOut / (1 - amountOut.buyFeesBips / 10000)) - A)
     *            /
     *            (0.997 * (1 - amountIn.sellFeesBips / 10000))
     *          = ((AB - AB + A * amountOut / (1 - amountOut.buyFeesBips / 10000)) / (B - amountOut / (1 - amountOut.buyFeesBips / 10000)))
     *            /
     *            (0.997 * (1 - amountIn.sellFeesBips / 10000))
     *          = ((A * amountOut / (1 - amountOut.buyFeesBips / 10000)) / (B - amountOut / (1 - amountOut.buyFeesBips / 10000)))
     *            /
     *            (0.997 * (1 - amountIn.sellFeesBips / 10000))
     *          = ((A * 1000 * amountOut / (1 - amountOut.buyFeesBips / 10000)) / (B - amountOut / (1 - amountOut.buyFeesBips / 10000)))
     *            /
     *            (997 * (1 - amountIn.sellFeesBips / 10000))
     *
     * outputAmountWithTax = amountOut / (1 - amountOut.buyFeesBips / 10000)
     * inputAmountWithTax = amountIn / (997 * (1 - amountIn.sellFeesBips / 10000))
     *                    = (A * outputAmountWithTax * 1000) / ((B - outputAmountWithTax) * 997)
     *
     * @param outputAmount
     */
    getInputAmount(outputAmount: CurrencyAmount<Token>, calculateFotFees?: boolean): [CurrencyAmount<Token>, Pair];
    getLiquidityMinted(totalSupply: CurrencyAmount<Token>, tokenAmountA: CurrencyAmount<Token>, tokenAmountB: CurrencyAmount<Token>): CurrencyAmount<Token>;
    getLiquidityValue(token: Token, totalSupply: CurrencyAmount<Token>, liquidity: CurrencyAmount<Token>, feeOn?: boolean, kLast?: BigintIsh): CurrencyAmount<Token>;
    private derivePercentAfterSellFees;
    private derivePercentAfterBuyFees;
}

declare class Route$1<TInput extends Currency, TOutput extends Currency> {
    readonly pairs: Pair[];
    readonly path: Token[];
    readonly input: TInput;
    readonly output: TOutput;
    constructor(pairs: Pair[], input: TInput, output: TOutput);
    private _midPrice;
    get midPrice(): Price<TInput, TOutput>;
    get chainId(): number;
}

interface BestTradeOptions {
    maxNumResults?: number;
    maxHops?: number;
}
/**
 * Represents a trade executed against a list of pairs.
 * Does not account for slippage, i.e. trades that front run this trade and move the price.
 */
declare class Trade$1<TInput extends Currency, TOutput extends Currency, TTradeType extends TradeType> {
    /**
     * The route of the trade, i.e. which pairs the trade goes through and the input/output currencies.
     */
    readonly route: Route$1<TInput, TOutput>;
    /**
     * The type of the trade, either exact in or exact out.
     */
    readonly tradeType: TTradeType;
    /**
     * The input amount for the trade assuming no slippage.
     */
    readonly inputAmount: CurrencyAmount<TInput>;
    /**
     * The output amount for the trade assuming no slippage.
     */
    readonly outputAmount: CurrencyAmount<TOutput>;
    /**
     * The price expressed in terms of output amount/input amount.
     */
    readonly executionPrice: Price<TInput, TOutput>;
    /**
     * The percent difference between the mid price before the trade and the trade execution price.
     */
    readonly priceImpact: Percent;
    /**
     * Constructs an exact in trade with the given amount in and route
     * @param route route of the exact in trade
     * @param amountIn the amount being passed in
     */
    static exactIn<TInput extends Currency, TOutput extends Currency>(route: Route$1<TInput, TOutput>, amountIn: CurrencyAmount<TInput>): Trade$1<TInput, TOutput, TradeType.EXACT_INPUT>;
    /**
     * Constructs an exact out trade with the given amount out and route
     * @param route route of the exact out trade
     * @param amountOut the amount returned by the trade
     */
    static exactOut<TInput extends Currency, TOutput extends Currency>(route: Route$1<TInput, TOutput>, amountOut: CurrencyAmount<TOutput>): Trade$1<TInput, TOutput, TradeType.EXACT_OUTPUT>;
    constructor(route: Route$1<TInput, TOutput>, amount: TTradeType extends TradeType.EXACT_INPUT ? CurrencyAmount<TInput> : CurrencyAmount<TOutput>, tradeType: TTradeType);
    /**
     * Get the minimum amount that must be received from this trade for the given slippage tolerance
     * @param slippageTolerance tolerance of unfavorable slippage from the execution price of this trade
     */
    minimumAmountOut(slippageTolerance: Percent): CurrencyAmount<TOutput>;
    /**
     * Get the maximum amount in that can be spent via this trade for the given slippage tolerance
     * @param slippageTolerance tolerance of unfavorable slippage from the execution price of this trade
     */
    maximumAmountIn(slippageTolerance: Percent): CurrencyAmount<TInput>;
    /**
     * Given a list of pairs, and a fixed amount in, returns the top `maxNumResults` trades that go from an input token
     * amount to an output token, making at most `maxHops` hops.
     * Note this does not consider aggregation, as routes are linear. It's possible a better route exists by splitting
     * the amount in among multiple routes.
     * @param pairs the pairs to consider in finding the best trade
     * @param nextAmountIn exact amount of input currency to spend
     * @param currencyOut the desired currency out
     * @param maxNumResults maximum number of results to return
     * @param maxHops maximum number of hops a returned trade can make, e.g. 1 hop goes through a single pair
     * @param currentPairs used in recursion; the current list of pairs
     * @param currencyAmountIn used in recursion; the original value of the currencyAmountIn parameter
     * @param bestTrades used in recursion; the current list of best trades
     */
    static bestTradeExactIn<TInput extends Currency, TOutput extends Currency>(pairs: Pair[], currencyAmountIn: CurrencyAmount<TInput>, currencyOut: TOutput, { maxNumResults, maxHops }?: BestTradeOptions, currentPairs?: Pair[], nextAmountIn?: CurrencyAmount<Currency>, bestTrades?: Trade$1<TInput, TOutput, TradeType.EXACT_INPUT>[]): Trade$1<TInput, TOutput, TradeType.EXACT_INPUT>[];
    /**
     * Return the execution price after accounting for slippage tolerance
     * @param slippageTolerance the allowed tolerated slippage
     */
    worstExecutionPrice(slippageTolerance: Percent): Price<TInput, TOutput>;
    /**
     * similar to the above method but instead targets a fixed output amount
     * given a list of pairs, and a fixed amount out, returns the top `maxNumResults` trades that go from an input token
     * to an output token amount, making at most `maxHops` hops
     * note this does not consider aggregation, as routes are linear. it's possible a better route exists by splitting
     * the amount in among multiple routes.
     * @param pairs the pairs to consider in finding the best trade
     * @param currencyIn the currency to spend
     * @param nextAmountOut the exact amount of currency out
     * @param maxNumResults maximum number of results to return
     * @param maxHops maximum number of hops a returned trade can make, e.g. 1 hop goes through a single pair
     * @param currentPairs used in recursion; the current list of pairs
     * @param currencyAmountOut used in recursion; the original value of the currencyAmountOut parameter
     * @param bestTrades used in recursion; the current list of best trades
     */
    static bestTradeExactOut<TInput extends Currency, TOutput extends Currency>(pairs: Pair[], currencyIn: TInput, currencyAmountOut: CurrencyAmount<TOutput>, { maxNumResults, maxHops }?: BestTradeOptions, currentPairs?: Pair[], nextAmountOut?: CurrencyAmount<Currency>, bestTrades?: Trade$1<TInput, TOutput, TradeType.EXACT_OUTPUT>[]): Trade$1<TInput, TOutput, TradeType.EXACT_OUTPUT>[];
}

type PoolKey = {
    currency0: string;
    currency1: string;
    fee: number;
    tickSpacing: number;
    hooks: string;
};
/**
 * Represents a V4 pool
 */
declare class Pool {
    readonly currency0: Currency;
    readonly currency1: Currency;
    readonly fee: number;
    readonly tickSpacing: number;
    readonly sqrtRatioX96: JSBI;
    readonly hooks: string;
    readonly liquidity: JSBI;
    readonly tickCurrent: number;
    readonly tickDataProvider: TickDataProvider;
    readonly poolKey: PoolKey;
    readonly poolId: string;
    private _currency0Price?;
    private _currency1Price?;
    static getPoolKey(currencyA: Currency, currencyB: Currency, fee: number, tickSpacing: number, hooks: string): PoolKey;
    static getPoolId(currencyA: Currency, currencyB: Currency, fee: number, tickSpacing: number, hooks: string): string;
    /**
     * Construct a pool
     * @param currencyA One of the currencys in the pool
     * @param currencyB The other currency in the pool
     * @param fee The fee in hundredths of a bips of the input amount of every swap that is collected by the pool
     * @param tickSpacing The tickSpacing of the pool
     * @param hooks The address of the hook contract
     * @param sqrtRatioX96 The sqrt of the current ratio of amounts of currency1 to currency0
     * @param liquidity The current value of in range liquidity
     * @param tickCurrent The current tick of the pool
     */
    constructor(currencyA: Currency, currencyB: Currency, fee: number, tickSpacing: number, hooks: string, sqrtRatioX96: BigintIsh, liquidity: BigintIsh, tickCurrent: number, ticks?: TickDataProvider | (Tick | TickConstructorArgs)[]);
    /** backwards compatibility with v2/3 sdks */
    get token0(): Currency;
    get token1(): Currency;
    /**
     * Returns true if the currency is either currency0 or currency1
     * @param currency The currency to check
     * @returns True if currency is either currency0 or currency1
     */
    involvesCurrency(currency: Currency): boolean;
    /** backwards compatibility with v2/3 sdks */
    involvesToken(currency: Currency): boolean;
    /**
     * v4-only involvesToken convenience method, used for mixed route ETH <-> WETH connection only
     * @param currency
     */
    v4InvolvesToken(currency: Currency): boolean;
    /**
     * Returns the current mid price of the pool in terms of currency0, i.e. the ratio of currency1 over currency0
     */
    get currency0Price(): Price<Currency, Currency>;
    /** backwards compatibility with v2/3 sdks */
    get token0Price(): Price<Currency, Currency>;
    /**
     * Returns the current mid price of the pool in terms of currency1, i.e. the ratio of currency0 over currency1
     */
    get currency1Price(): Price<Currency, Currency>;
    /** backwards compatibility with v2/3 sdks */
    get token1Price(): Price<Currency, Currency>;
    /**
     * Return the price of the given currency in terms of the other currency in the pool.
     * @param currency The currency to return price of
     * @returns The price of the given currency, in terms of the other.
     */
    priceOf(currency: Currency): Price<Currency, Currency>;
    /**
     * Returns the chain ID of the currencies in the pool.
     */
    get chainId(): number;
    /** Works only for vanilla hookless v3 pools, otherwise throws an error */
    getOutputAmount(inputAmount: CurrencyAmount<Currency>, sqrtPriceLimitX96?: JSBI): Promise<[CurrencyAmount<Currency>, Pool]>;
    /**
     * Given a desired output amount of a currency, return the computed input amount and a pool with state updated after the trade
     * Works only for vanilla hookless v3 pools, otherwise throws an error
     * @param outputAmount the output amount for which to quote the input amount
     * @param sqrtPriceLimitX96 The Q64.96 sqrt price limit. If zero for one, the price cannot be less than this value after the swap. If one for zero, the price cannot be greater than this value after the swap
     * @returns The input amount and the pool with updated state
     */
    getInputAmount(outputAmount: CurrencyAmount<Currency>, sqrtPriceLimitX96?: JSBI): Promise<[CurrencyAmount<Currency>, Pool]>;
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
    private hookImpactsSwap;
}

/**
 * Represents a list of pools through which a swap can occur
 * @template TInput The input currency
 * @template TOutput The output currency
 */
declare class Route<TInput extends Currency, TOutput extends Currency> {
    readonly pools: Pool[];
    readonly currencyPath: Currency[];
    readonly input: TInput;
    readonly output: TOutput;
    readonly pathInput: Currency;
    readonly pathOutput: Currency;
    private _midPrice;
    /**
     * Creates an instance of route.
     * @param pools An array of `Pool` objects, ordered by the route the swap will take
     * @param input The input currency
     * @param output The output currency
     */
    constructor(pools: Pool[], input: TInput, output: TOutput);
    get chainId(): number;
    /**
     * Returns the mid price of the route
     */
    get midPrice(): Price<TInput, TOutput>;
}

type TPool = Pair | Pool$1 | Pool;

/**
 * Represents a list of pools or pairs through which a swap can occur
 * @template TInput The input token
 * @template TOutput The output token
 */
declare class MixedRouteSDK<TInput extends Currency, TOutput extends Currency> {
    readonly pools: TPool[];
    readonly path: Currency[];
    readonly input: TInput;
    readonly output: TOutput;
    readonly pathInput: Currency;
    readonly pathOutput: Currency;
    private _midPrice;
    /**
     * Creates an instance of route.
     * @param pools An array of `TPool` objects (pools or pairs), ordered by the route the swap will take
     * @param input The input token
     * @param output The output token
     * @param retainsFakePool Set to true to filter out a pool that has a fake eth-weth pool
     */
    constructor(pools: TPool[], input: TInput, output: TOutput, retainFakePools?: boolean);
    get chainId(): number;
    /**
     * Returns the mid price of the route
     */
    get midPrice(): Price<TInput, TOutput>;
}

declare enum Protocol {
    V2 = "V2",
    V3 = "V3",
    V4 = "V4",
    MIXED = "MIXED"
}

declare function getPathToken(currency: Currency, pool: Pair | Pool$1): Token;
interface IRoute<TInput extends Currency, TOutput extends Currency, TPool extends Pair | Pool$1 | Pool> {
    protocol: Protocol;
    pools: TPool[];
    path: Currency[];
    midPrice: Price<TInput, TOutput>;
    input: TInput;
    output: TOutput;
    pathInput: Currency;
    pathOutput: Currency;
}
declare class RouteV2<TInput extends Currency, TOutput extends Currency> extends Route$1<TInput, TOutput> implements IRoute<TInput, TOutput, Pair> {
    readonly protocol: Protocol;
    readonly pools: Pair[];
    pathInput: Currency;
    pathOutput: Currency;
    constructor(v2Route: Route$1<TInput, TOutput>);
}
declare class RouteV3<TInput extends Currency, TOutput extends Currency> extends Route$2<TInput, TOutput> implements IRoute<TInput, TOutput, Pool$1> {
    readonly protocol: Protocol;
    readonly path: Token[];
    pathInput: Currency;
    pathOutput: Currency;
    constructor(v3Route: Route$2<TInput, TOutput>);
}
declare class RouteV4<TInput extends Currency, TOutput extends Currency> extends Route<TInput, TOutput> implements IRoute<TInput, TOutput, Pool> {
    readonly protocol: Protocol;
    readonly path: Currency[];
    constructor(v4Route: Route<TInput, TOutput>);
}
declare class MixedRoute<TInput extends Currency, TOutput extends Currency> extends MixedRouteSDK<TInput, TOutput> implements IRoute<TInput, TOutput, Pair | Pool$1 | Pool> {
    readonly protocol: Protocol;
    constructor(mixedRoute: MixedRouteSDK<TInput, TOutput>);
}

declare class Trade<TInput extends Currency, TOutput extends Currency, TTradeType extends TradeType> {
    readonly routes: IRoute<TInput, TOutput, Pair | Pool$1 | Pool>[];
    readonly tradeType: TTradeType;
    private _outputAmount;
    private _inputAmount;
    private _nativeInputRoutes;
    private _wethInputRoutes;
    /**
     * The swaps of the trade, i.e. which routes and how much is swapped in each that
     * make up the trade. May consist of swaps in v2 or v3.
     */
    readonly swaps: {
        route: IRoute<TInput, TOutput, Pair | Pool$1 | Pool>;
        inputAmount: CurrencyAmount<TInput>;
        outputAmount: CurrencyAmount<TOutput>;
    }[];
    constructor({ v2Routes, v3Routes, v4Routes, mixedRoutes, tradeType, }: {
        v2Routes?: {
            routev2: Route$1<TInput, TOutput>;
            inputAmount: CurrencyAmount<TInput>;
            outputAmount: CurrencyAmount<TOutput>;
        }[];
        v3Routes?: {
            routev3: Route$2<TInput, TOutput>;
            inputAmount: CurrencyAmount<TInput>;
            outputAmount: CurrencyAmount<TOutput>;
        }[];
        v4Routes?: {
            routev4: Route<TInput, TOutput>;
            inputAmount: CurrencyAmount<TInput>;
            outputAmount: CurrencyAmount<TOutput>;
        }[];
        mixedRoutes?: {
            mixedRoute: MixedRouteSDK<TInput, TOutput>;
            inputAmount: CurrencyAmount<TInput>;
            outputAmount: CurrencyAmount<TOutput>;
        }[];
        tradeType: TTradeType;
    });
    get inputAmount(): CurrencyAmount<TInput>;
    get outputAmount(): CurrencyAmount<TOutput>;
    /**
     * Returns the sum of all swaps within the trade
     * @returns
     * inputAmount: total input amount
     * inputAmountNative: total amount of native currency required for ETH input paths
     *  - 0 if inputAmount is native but no native input paths
     *  - undefined if inputAmount is not native
     * outputAmount: total output amount
     * outputAmountNative: total amount of native currency returned from ETH output paths
     *  - 0 if outputAmount is native but no native output paths
     *  - undefined if outputAmount is not native
     */
    get amounts(): {
        inputAmount: CurrencyAmount<TInput>;
        inputAmountNative: CurrencyAmount<TInput> | undefined;
        outputAmount: CurrencyAmount<TOutput>;
        outputAmountNative: CurrencyAmount<TOutput> | undefined;
    };
    get numberOfInputWraps(): number;
    get numberOfInputUnwraps(): number;
    get nativeInputRoutes(): IRoute<TInput, TOutput, Pair | Pool$1 | Pool>[];
    get wethInputRoutes(): IRoute<TInput, TOutput, Pair | Pool$1 | Pool>[];
    private _executionPrice;
    /**
     * The price expressed in terms of output amount/input amount.
     */
    get executionPrice(): Price<TInput, TOutput>;
    /**
     * Returns the sell tax of the input token
     */
    get inputTax(): Percent;
    /**
     * Returns the buy tax of the output token
     */
    get outputTax(): Percent;
    private isWrappedNative;
    /**
     * The cached result of the price impact computation
     * @private
     */
    private _priceImpact;
    /**
     * Returns the percent difference between the route's mid price and the expected execution price
     * In order to exclude token taxes from the price impact calculation, the spot price is calculated
     * using a ratio of values that go into the pools, which are the post-tax input amount and pre-tax output amount.
     */
    get priceImpact(): Percent;
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
    static fromRoutes<TInput extends Currency, TOutput extends Currency, TTradeType extends TradeType>(v2Routes: {
        routev2: Route$1<TInput, TOutput>;
        amount: TTradeType extends TradeType.EXACT_INPUT ? CurrencyAmount<TInput> : CurrencyAmount<TOutput>;
    }[], v3Routes: {
        routev3: Route$2<TInput, TOutput>;
        amount: TTradeType extends TradeType.EXACT_INPUT ? CurrencyAmount<TInput> : CurrencyAmount<TOutput>;
    }[], tradeType: TTradeType, mixedRoutes?: {
        mixedRoute: MixedRouteSDK<TInput, TOutput>;
        amount: TTradeType extends TradeType.EXACT_INPUT ? CurrencyAmount<TInput> : CurrencyAmount<TOutput>;
    }[], v4Routes?: {
        routev4: Route<TInput, TOutput>;
        amount: TTradeType extends TradeType.EXACT_INPUT ? CurrencyAmount<TInput> : CurrencyAmount<TOutput>;
    }[]): Promise<Trade<TInput, TOutput, TTradeType>>;
    static fromRoute<TInput extends Currency, TOutput extends Currency, TTradeType extends TradeType>(route: Route$1<TInput, TOutput> | Route$2<TInput, TOutput> | Route<TInput, TOutput> | MixedRouteSDK<TInput, TOutput>, amount: TTradeType extends TradeType.EXACT_INPUT ? CurrencyAmount<TInput> : CurrencyAmount<TOutput>, tradeType: TTradeType): Promise<Trade<TInput, TOutput, TTradeType>>;
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
declare function tradeComparator<TInput extends Currency, TOutput extends Currency, TTradeType extends TradeType>(a: MixedRouteTrade<TInput, TOutput, TTradeType>, b: MixedRouteTrade<TInput, TOutput, TTradeType>): number;
/**
 * Represents a trade executed against a set of routes where some percentage of the input is
 * split across each route.
 *
 * Each route has its own set of pools. Pools can not be re-used across routes.
 *
 * Does not account for slippage, i.e., changes in price environment that can occur between
 * the time the trade is submitted and when it is executed.
 * @notice This class is functionally the same as the `Trade` class in the `@uniswap/v3-sdk` package, aside from typing and some input validation.
 * @template TInput The input token, either Ether or an ERC-20
 * @template TOutput The output token, either Ether or an ERC-20
 * @template TTradeType The trade type, either exact input or exact output
 */
declare class MixedRouteTrade<TInput extends Currency, TOutput extends Currency, TTradeType extends TradeType> {
    /**
     * @deprecated Deprecated in favor of 'swaps' property. If the trade consists of multiple routes
     * this will return an error.
     *
     * When the trade consists of just a single route, this returns the route of the trade,
     * i.e. which pools the trade goes through.
     */
    get route(): MixedRouteSDK<TInput, TOutput>;
    /**
     * The swaps of the trade, i.e. which routes and how much is swapped in each that
     * make up the trade.
     */
    readonly swaps: {
        route: MixedRouteSDK<TInput, TOutput>;
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
     * Constructs a trade by simulating swaps through the given route
     * @template TInput The input token, either Ether or an ERC-20.
     * @template TOutput The output token, either Ether or an ERC-20.
     * @template TTradeType The type of the trade, either exact in or exact out.
     * @param route route to swap through
     * @param amount the amount specified, either input or output, depending on tradeType
     * @param tradeType whether the trade is an exact input or exact output swap
     * @returns The route
     */
    static fromRoute<TInput extends Currency, TOutput extends Currency, TTradeType extends TradeType>(route: MixedRouteSDK<TInput, TOutput>, amount: TTradeType extends TradeType.EXACT_INPUT ? CurrencyAmount<TInput> : CurrencyAmount<TOutput>, tradeType: TTradeType): Promise<MixedRouteTrade<TInput, TOutput, TTradeType>>;
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
        route: MixedRouteSDK<TInput, TOutput>;
    }[], tradeType: TTradeType): Promise<MixedRouteTrade<TInput, TOutput, TTradeType>>;
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
        route: MixedRouteSDK<TInput, TOutput>;
        inputAmount: CurrencyAmount<TInput>;
        outputAmount: CurrencyAmount<TOutput>;
        tradeType: TTradeType;
    }): MixedRouteTrade<TInput, TOutput, TTradeType>;
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
            route: MixedRouteSDK<TInput, TOutput>;
            inputAmount: CurrencyAmount<TInput>;
            outputAmount: CurrencyAmount<TOutput>;
        }[];
        tradeType: TTradeType;
    }): MixedRouteTrade<TInput, TOutput, TTradeType>;
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
    static bestTradeExactIn<TInput extends Currency, TOutput extends Currency>(pools: TPool[], currencyAmountIn: CurrencyAmount<TInput>, currencyOut: TOutput, { maxNumResults, maxHops }?: BestTradeOptions$1, currentPools?: TPool[], nextAmountIn?: CurrencyAmount<Currency>, bestTrades?: MixedRouteTrade<TInput, TOutput, TradeType.EXACT_INPUT>[]): Promise<MixedRouteTrade<TInput, TOutput, TradeType.EXACT_INPUT>[]>;
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
     * The account that should receive the output. If omitted, output is sent to msg.sender.
     */
    recipient?: string;
    /**
     * Either deadline (when the transaction expires, in epoch seconds), or previousBlockhash.
     */
    deadlineOrPreviousBlockhash?: Validation;
    /**
     * The optional permit parameters for spending the input.
     */
    inputTokenPermit?: PermitOptions;
    /**
     * Optional information for taking a fee on output.
     */
    fee?: FeeOptions;
}
interface SwapAndAddOptions extends SwapOptions {
    /**
     * The optional permit parameters for pulling in remaining output token.
     */
    outputTokenPermit?: PermitOptions;
}
type AnyTradeType = Trade<Currency, Currency, TradeType> | Trade$1<Currency, Currency, TradeType> | Trade$2<Currency, Currency, TradeType> | MixedRouteTrade<Currency, Currency, TradeType> | (Trade$1<Currency, Currency, TradeType> | Trade$2<Currency, Currency, TradeType> | MixedRouteTrade<Currency, Currency, TradeType>)[];
/**
 * Represents the Uniswap V2 + V3 SwapRouter02, and has static methods for helping execute trades.
 */
declare abstract class SwapRouter {
    static INTERFACE: Interface;
    /**
     * Cannot be constructed.
     */
    private constructor();
    /**
     * @notice Generates the calldata for a Swap with a V2 Route.
     * @param trade The V2Trade to encode.
     * @param options SwapOptions to use for the trade.
     * @param routerMustCustody Flag for whether funds should be sent to the router
     * @param performAggregatedSlippageCheck Flag for whether we want to perform an aggregated slippage check
     * @returns A string array of calldatas for the trade.
     */
    private static encodeV2Swap;
    /**
     * @notice Generates the calldata for a Swap with a V3 Route.
     * @param trade The V3Trade to encode.
     * @param options SwapOptions to use for the trade.
     * @param routerMustCustody Flag for whether funds should be sent to the router
     * @param performAggregatedSlippageCheck Flag for whether we want to perform an aggregated slippage check
     * @returns A string array of calldatas for the trade.
     */
    private static encodeV3Swap;
    /**
     * @notice Generates the calldata for a MixedRouteSwap. Since single hop routes are not MixedRoutes, we will instead generate
     *         them via the existing encodeV3Swap and encodeV2Swap methods.
     * @param trade The MixedRouteTrade to encode.
     * @param options SwapOptions to use for the trade.
     * @param routerMustCustody Flag for whether funds should be sent to the router
     * @param performAggregatedSlippageCheck Flag for whether we want to perform an aggregated slippage check
     * @returns A string array of calldatas for the trade.
     */
    private static encodeMixedRouteSwap;
    private static encodeSwaps;
    /**
     * Produces the on-chain method name to call and the hex encoded parameters to pass as arguments for a given trade.
     * @param trades to produce call parameters for
     * @param options options for the call parameters
     */
    static swapCallParameters(trades: Trade<Currency, Currency, TradeType> | Trade$1<Currency, Currency, TradeType> | Trade$2<Currency, Currency, TradeType> | MixedRouteTrade<Currency, Currency, TradeType> | (Trade$1<Currency, Currency, TradeType> | Trade$2<Currency, Currency, TradeType> | MixedRouteTrade<Currency, Currency, TradeType>)[], options: SwapOptions): MethodParameters;
    /**
     * Produces the on-chain method name to call and the hex encoded parameters to pass as arguments for a given trade.
     * @param trades to produce call parameters for
     * @param options options for the call parameters
     */
    static swapAndAddCallParameters(trades: AnyTradeType, options: SwapAndAddOptions, position: Position, addLiquidityOptions: CondensedAddLiquidityOptions, tokenInApprovalType: ApprovalTypes, tokenOutApprovalType: ApprovalTypes): MethodParameters;
    private static riskOfPartialFill;
    private static v3TradeWithHighPriceImpact;
    private static getPositionAmounts;
}

/**
 * Converts a route to a hex encoded path
 * @notice only supports exactIn route encodings
 * @param route the mixed path to convert to an encoded path
 * @param useMixedRouterQuoteV2 if true, uses the Mixed Quoter V2 encoding for v4 pools. By default, we do not set it. This is only used in SOR for explicit setting during onchain quoting.
 * @returns the exactIn encoded path
 */
declare function encodeMixedRouteToPath(route: MixedRouteSDK<Currency, Currency>, useMixedRouterQuoteV2?: boolean): string;

declare function amountWithPathCurrency(amount: CurrencyAmount<Currency>, pool: TPool): CurrencyAmount<Currency>;
declare function getPathCurrency(currency: Currency, pool: TPool): Currency;

/**
 * Utility function to return each consecutive section of Pools or Pairs in a MixedRoute
 * @param route
 * @returns a nested array of Pools or Pairs in the order of the route
 */
declare const partitionMixedRouteByProtocol: (route: MixedRouteSDK<Currency, Currency>) => TPool[][];
/**
 * Simple utility function to get the output of an array of Pools or Pairs
 * @param pools
 * @param firstInputToken
 * @returns the output token of the last pool in the array
 */
declare const getOutputOfPools: (pools: TPool[], firstInputToken: Currency) => Currency;

export { ADDRESS_THIS, ADDRESS_ZERO, ApprovalTypes, ApproveAndCall, type CondensedAddLiquidityOptions, type IRoute, MIXED_QUOTER_V1_V2_FEE_PATH_PLACEHOLDER, MIXED_QUOTER_V2_V2_FEE_PATH_PLACEHOLDER, MIXED_QUOTER_V2_V3_FEE_PATH_PLACEHOLDER, MIXED_QUOTER_V2_V4_FEE_PATH_PLACEHOLDER, MSG_SENDER, MixedRoute, MixedRouteSDK, MixedRouteTrade, MulticallExtended, ONE, ONE_HUNDRED_PERCENT, PaymentsExtended, Protocol, RouteV2, RouteV3, RouteV4, type SwapAndAddOptions, type SwapOptions, SwapRouter, type TPool, Trade, type Validation, ZERO, ZERO_PERCENT, amountWithPathCurrency, encodeMixedRouteToPath, getOutputOfPools, getPathCurrency, getPathToken, isMint, partitionMixedRouteByProtocol, tradeComparator };
