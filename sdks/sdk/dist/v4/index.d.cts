import JSBI from 'jsbi';
import { BigNumber } from '@ethersproject/bignumber';
import { TypedDataDomain, TypedDataField } from '@ethersproject/abstract-signer';
import { Interface } from '@ethersproject/abi';
import { BigNumber as BigNumber$1 } from 'ethers';

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

declare const DYNAMIC_FEE_FLAG = 8388608;
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

/**
 * Trades comparator, an extension of the input output comparator that also considers other dimensions of the trade in ranking them
 * @template TInput The input currency, either Ether or an ERC-20
 * @template TOutput The output currency, either Ether or an ERC-20
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
 * @template TInput The input currency, either Ether or an ERC-20
 * @template TOutput The output currency, either Ether or an ERC-20
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
     * @template TInput The input currency, either Ether or an ERC-20
     * @template TOutput The output currency, either Ether or an ERC-20
     * @param route The route of the exact in trade
     * @param amountIn The amount being passed in
     * @returns The exact in trade
     */
    static exactIn<TInput extends Currency, TOutput extends Currency>(route: Route<TInput, TOutput>, amountIn: CurrencyAmount<TInput>): Promise<Trade<TInput, TOutput, TradeType.EXACT_INPUT>>;
    /**
     * Constructs an exact out trade with the given amount out and route
     * @template TInput The input currency, either Ether or an ERC-20
     * @template TOutput The output currency, either Ether or an ERC-20
     * @param route The route of the exact out trade
     * @param amountOut The amount returned by the trade
     * @returns The exact out trade
     */
    static exactOut<TInput extends Currency, TOutput extends Currency>(route: Route<TInput, TOutput>, amountOut: CurrencyAmount<TOutput>): Promise<Trade<TInput, TOutput, TradeType.EXACT_OUTPUT>>;
    /**
     * Constructs a trade by simulating swaps through the given route
     * @template TInput The input currency, either Ether or an ERC-20.
     * @template TOutput The output currency, either Ether or an ERC-20.
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
     * @template TInput The input currency, either Ether or an ERC-20.
     * @template TOutput The output currency, either Ether or an ERC-20.
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
     * @template TInput The input currency, either Ether or an ERC-20
     * @template TOutput The output currency, either Ether or an ERC-20
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
     * @template TInput The input currency, either Ether or an ERC-20
     * @template TOutput The output currency, either Ether or an ERC-20
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
     * Given a list of pools, and a fixed amount in, returns the top `maxNumResults` trades that go from an input currency
     * amount to an output currency, making at most `maxHops` hops.
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
     * given a list of pools, and a fixed amount out, returns the top `maxNumResults` trades that go from an input currency
     * to an output currency amount, making at most `maxHops` hops
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

interface CommonOptions {
    /**
     * How much the pool price is allowed to move from the specified action.
     */
    slippageTolerance: Percent;
    /**
     * Optional data to pass to hooks
     */
    hookData?: string;
    /**
     * When the transaction expires, in epoch seconds.
     */
    deadline: BigintIsh;
}
interface ModifyPositionSpecificOptions {
    /**
     * Indicates the ID of the position to increase liquidity for.
     */
    tokenId: BigintIsh;
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
    /**
     * Initial price to set on the pool if creating
     */
    sqrtPriceX96?: BigintIsh;
    /**
     * Whether the mint is part of a migration from V3 to V4.
     */
    migrate?: boolean;
}
/**
 * Options for producing the calldata to add liquidity.
 */
interface CommonAddLiquidityOptions {
    /**
     * Whether to spend ether. If true, one of the currencies must be the NATIVE currency.
     */
    useNative?: NativeCurrency;
    /**
     * The optional permit2 batch permit parameters for spending token0 and token1
     */
    batchPermit?: BatchPermitOptions;
}
/**
 * Options for producing the calldata to exit a position.
 */
interface RemoveLiquiditySpecificOptions {
    /**
     * The percentage of position liquidity to exit.
     */
    liquidityPercentage: Percent;
    /**
     * Whether the NFT should be burned if the entire position is being exited, by default false.
     */
    burnToken?: boolean;
    /**
     * The optional permit of the token ID being exited, in case the exit transaction is being sent by an account that does not own the NFT
     */
    permit?: NFTPermitOptions;
}
interface CollectSpecificOptions {
    /**
     * Indicates the ID of the position to collect for.
     */
    tokenId: BigintIsh;
    /**
     * The account that should receive the tokens.
     */
    recipient: string;
}
interface TransferOptions {
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
}
interface PermitDetails {
    token: string;
    amount: BigintIsh;
    expiration: BigintIsh;
    nonce: BigintIsh;
}
interface AllowanceTransferPermitSingle {
    details: PermitDetails;
    spender: string;
    sigDeadline: BigintIsh;
}
interface AllowanceTransferPermitBatch {
    details: PermitDetails[];
    spender: string;
    sigDeadline: BigintIsh;
}
interface BatchPermitOptions {
    owner: string;
    permitBatch: AllowanceTransferPermitBatch;
    signature: string;
}
interface NFTPermitValues {
    spender: string;
    tokenId: BigintIsh;
    deadline: BigintIsh;
    nonce: BigintIsh;
}
interface NFTPermitOptions extends NFTPermitValues {
    signature: string;
}
interface NFTPermitData {
    domain: TypedDataDomain;
    types: Record<string, TypedDataField[]>;
    values: NFTPermitValues;
}
type MintOptions = CommonOptions & CommonAddLiquidityOptions & MintSpecificOptions;
type IncreaseLiquidityOptions = CommonOptions & CommonAddLiquidityOptions & ModifyPositionSpecificOptions;
type AddLiquidityOptions = MintOptions | IncreaseLiquidityOptions;
type RemoveLiquidityOptions = CommonOptions & RemoveLiquiditySpecificOptions & ModifyPositionSpecificOptions;
type CollectOptions = CommonOptions & CollectSpecificOptions;
declare abstract class V4PositionManager {
    static INTERFACE: Interface;
    /**
     * Cannot be constructed.
     */
    private constructor();
    /**
     * Public methods to encode method parameters for different actions on the PositionManager contract
     */
    static createCallParameters(poolKey: PoolKey, sqrtPriceX96: BigintIsh): MethodParameters;
    static addCallParameters(position: Position, options: AddLiquidityOptions): MethodParameters;
    /**
     * Produces the calldata for completely or partially exiting a position
     * @param position The position to exit
     * @param options Additional information necessary for generating the calldata
     * @returns The call parameters
     */
    static removeCallParameters(position: Position, options: RemoveLiquidityOptions): MethodParameters;
    /**
     * Produces the calldata for collecting fees from a position
     * @param position The position to collect fees from
     * @param options Additional information necessary for generating the calldata
     * @returns The call parameters
     */
    static collectCallParameters(position: Position, options: CollectOptions): MethodParameters;
    private static encodeInitializePool;
    static encodeModifyLiquidities(unlockData: string, deadline: BigintIsh): string;
    static encodePermitBatch(owner: string, permitBatch: AllowanceTransferPermitBatch, signature: string): string;
    static encodeERC721Permit(spender: string, tokenId: BigintIsh, deadline: BigintIsh, nonce: BigintIsh, signature: string): string;
    static getPermitData(permit: NFTPermitValues, positionManagerAddress: string, chainId: number): NFTPermitData;
}

interface PositionConstructorArgs {
    pool: Pool;
    liquidity: BigintIsh;
    tickLower: number;
    tickUpper: number;
}
/**
 * Represents a position on a Uniswap V4 Pool
 * @dev Similar to the V3 implementation
 * - using Currency instead of Token
 * - keep in mind that Pool and liquidity must be fetched from the pool manager
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
    get token0PriceLower(): Price<Currency, Currency>;
    /**
     * Returns the price of token0 at the upper tick
     */
    get token0PriceUpper(): Price<Currency, Currency>;
    /**
     * Returns the amount of token0 that this position's liquidity could be burned for at the current pool price
     */
    get amount0(): CurrencyAmount<Currency>;
    /**
     * Returns the amount of token1 that this position's liquidity could be burned for at the current pool price
     */
    get amount1(): CurrencyAmount<Currency>;
    /**
     * Returns the lower and upper sqrt ratios if the price 'slips' up to slippage tolerance percentage
     * @param slippageTolerance The amount by which the price can 'slip' before the transaction will revert
     * @returns The sqrt ratios after slippage
     */
    private ratiosAfterSlippage;
    /**
     * Returns the maximum amount of token0 and token1 that must be sent in order to safely mint the amount of liquidity held by the position
     * with the given slippage tolerance
     * @param slippageTolerance Tolerance of unfavorable slippage from the current price
     * @returns The amounts, with slippage
     * @dev In v4, minting and increasing is protected by maximum amounts of token0 and token1.
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
     * Returns the AllowanceTransferPermitBatch for adding liquidity to a position
     * @param slippageTolerance The amount by which the price can 'slip' before the transaction will revert
     * @param spender The spender of the permit (should usually be the PositionManager)
     * @param nonce A valid permit2 nonce
     * @param deadline The deadline for the permit
     */
    permitBatchData(slippageTolerance: Percent, spender: string, nonce: BigintIsh, deadline: BigintIsh): AllowanceTransferPermitBatch;
    /**
     * Computes the maximum amount of liquidity received for a given amount of token0, token1,
     * and the prices at the tick boundaries.
     * @param pool The pool for which the position should be created
     * @param tickLower The lower tick of the position
     * @param tickUpper The upper tick of the position
     * @param amount0 token0 amountzw
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

type PathKey = {
    intermediateCurrency: string;
    fee: number;
    tickSpacing: number;
    hooks: string;
    hookData: string;
};
declare const encodeRouteToPath: (route: Route<Currency, Currency>, exactOutput?: boolean) => PathKey[];

/**
 * Actions
 * @description Constants that define what action to perform
 * Not all actions are supported yet.
 * @enum {number}
 */
declare enum Actions {
    INCREASE_LIQUIDITY = 0,
    DECREASE_LIQUIDITY = 1,
    MINT_POSITION = 2,
    BURN_POSITION = 3,
    SWAP_EXACT_IN_SINGLE = 6,
    SWAP_EXACT_IN = 7,
    SWAP_EXACT_OUT_SINGLE = 8,
    SWAP_EXACT_OUT = 9,
    SETTLE = 11,
    SETTLE_ALL = 12,
    SETTLE_PAIR = 13,
    TAKE = 14,
    TAKE_ALL = 15,
    TAKE_PORTION = 16,
    TAKE_PAIR = 17,
    CLOSE_CURRENCY = 18,
    SWEEP = 20,
    UNWRAP = 22
}
declare enum Subparser {
    V4SwapExactInSingle = 0,
    V4SwapExactIn = 1,
    V4SwapExactOutSingle = 2,
    V4SwapExactOut = 3,
    PoolKey = 4
}
type ParamType = {
    readonly name: string;
    readonly type: string;
    readonly subparser?: Subparser;
};
declare const V4_BASE_ACTIONS_ABI_DEFINITION: {
    [key in Actions]: readonly ParamType[];
};
declare class V4Planner {
    actions: string;
    params: string[];
    constructor();
    addAction(type: Actions, parameters: any[]): V4Planner;
    addTrade(trade: Trade<Currency, Currency, TradeType>, slippageTolerance?: Percent): V4Planner;
    addSettle(currency: Currency, payerIsUser: boolean, amount?: BigNumber$1): V4Planner;
    addTake(currency: Currency, recipient: string, amount?: BigNumber$1): V4Planner;
    addUnwrap(amount: BigNumber$1): V4Planner;
    finalize(): string;
}

declare class V4PositionPlanner extends V4Planner {
    addMint(pool: Pool, tickLower: number, tickUpper: number, liquidity: BigintIsh, amount0Max: BigintIsh, amount1Max: BigintIsh, owner: string, hookData?: string): void;
    addIncrease(tokenId: BigintIsh, liquidity: BigintIsh, amount0Max: BigintIsh, amount1Max: BigintIsh, hookData?: string): void;
    addDecrease(tokenId: BigintIsh, liquidity: BigintIsh, amount0Min: BigintIsh, amount1Min: BigintIsh, hookData?: string): void;
    addBurn(tokenId: BigintIsh, amount0Min: BigintIsh, amount1Min: BigintIsh, hookData?: string): void;
    addSettlePair(currency0: Currency, currency1: Currency): void;
    addTakePair(currency0: Currency, currency1: Currency, recipient: string): void;
    addSweep(currency: Currency, to: string): void;
}

type Param = {
    readonly name: string;
    readonly value: any;
};
type V4RouterAction = {
    readonly actionName: string;
    readonly actionType: Actions;
    readonly params: readonly Param[];
};
type V4RouterCall = {
    readonly actions: readonly V4RouterAction[];
};
type SwapExactInSingle = {
    readonly poolKey: PoolKey;
    readonly zeroForOne: boolean;
    readonly amountIn: string;
    readonly amountOutMinimum: string;
    readonly hookData: string;
};
type SwapExactIn = {
    readonly currencyIn: string;
    readonly path: readonly PathKey[];
    readonly amountIn: string;
    readonly amountOutMinimum: string;
};
type SwapExactOutSingle = {
    readonly poolKey: PoolKey;
    readonly zeroForOne: boolean;
    readonly amountOut: string;
    readonly amountInMaximum: string;
    readonly hookData: string;
};
type SwapExactOut = {
    readonly currencyOut: string;
    readonly path: readonly PathKey[];
    readonly amountOut: string;
    readonly amountInMaximum: string;
};
declare abstract class V4BaseActionsParser {
    static parseCalldata(calldata: string): V4RouterCall;
    private static getActions;
}

declare function toAddress(currency: Currency): string;

declare function amountWithPathCurrency(amount: CurrencyAmount<Currency>, pool: Pool): CurrencyAmount<Currency>;
declare function getPathCurrency(currency: Currency, pool: Pool): Currency;

/**
 * This library is the almost the same as v3-sdk priceTickConversion except
 * that it accepts a Currency type instead of a Token type,
 * and thus uses some helper functions defined for the Currency type over the Token type.
 */
/**
 * Returns a price object corresponding to the input tick and the base/quote token
 * Inputs must be tokens because the address order is used to interpret the price represented by the tick
 * @param baseToken the base token of the price
 * @param quoteToken the quote token of the price
 * @param tick the tick for which to return the price
 */
declare function tickToPrice(baseCurrency: Currency, quoteCurrency: Currency, tick: number): Price<Currency, Currency>;
/**
 * Returns the first tick for which the given price is greater than or equal to the tick price
 * @param price for which to return the closest tick that represents a price less than or equal to the input price,
 * i.e. the price of the returned tick is less than or equal to the input price
 */
declare function priceToClosestTick(price: Price<Currency, Currency>): number;

declare function sortsBefore(currencyA: Currency, currencyB: Currency): boolean;

type HookPermissions = {
    [key in HookOptions]: boolean;
};
declare enum HookOptions {
    AfterRemoveLiquidityReturnsDelta = "afterRemoveLiquidityReturnsDelta",
    AfterAddLiquidityReturnsDelta = "afterAddLiquidityReturnsDelta",
    AfterSwapReturnsDelta = "afterSwapReturnsDelta",
    BeforeSwapReturnsDelta = "beforeSwapReturnsDelta",
    AfterDonate = "afterDonate",
    BeforeDonate = "beforeDonate",
    AfterSwap = "afterSwap",
    BeforeSwap = "beforeSwap",
    AfterRemoveLiquidity = "afterRemoveLiquidity",
    BeforeRemoveLiquidity = "beforeRemoveLiquidity",
    AfterAddLiquidity = "afterAddLiquidity",
    BeforeAddLiquidity = "beforeAddLiquidity",
    AfterInitialize = "afterInitialize",
    BeforeInitialize = "beforeInitialize"
}
declare const hookFlagIndex: {
    afterRemoveLiquidityReturnsDelta: number;
    afterAddLiquidityReturnsDelta: number;
    afterSwapReturnsDelta: number;
    beforeSwapReturnsDelta: number;
    afterDonate: number;
    beforeDonate: number;
    afterSwap: number;
    beforeSwap: number;
    afterRemoveLiquidity: number;
    beforeRemoveLiquidity: number;
    afterAddLiquidity: number;
    beforeAddLiquidity: number;
    afterInitialize: number;
    beforeInitialize: number;
};
declare class Hook {
    static permissions(address: string): HookPermissions;
    static hasPermission(address: string, hookOption: HookOptions): boolean;
    static hasInitializePermissions(address: string): boolean;
    static hasLiquidityPermissions(address: string): boolean;
    static hasSwapPermissions(address: string): boolean;
    static hasDonatePermissions(address: string): boolean;
    private static _hasPermission;
    private static _checkAddress;
}

export { Actions, type AddLiquidityOptions, type AllowanceTransferPermitBatch, type AllowanceTransferPermitSingle, type BatchPermitOptions, type BestTradeOptions, type CollectOptions, type CollectSpecificOptions, type CommonAddLiquidityOptions, type CommonOptions, DYNAMIC_FEE_FLAG, Hook, HookOptions, type HookPermissions, type IncreaseLiquidityOptions, type MethodParameters, type MintOptions, type MintSpecificOptions, type ModifyPositionSpecificOptions, type NFTPermitData, type NFTPermitOptions, type NFTPermitValues, type Param, type ParamType, type PathKey, type PermitDetails, Pool, type PoolKey, Position, type RemoveLiquidityOptions, type RemoveLiquiditySpecificOptions, Route, Subparser, type SwapExactIn, type SwapExactInSingle, type SwapExactOut, type SwapExactOutSingle, Trade, type TransferOptions, V4BaseActionsParser, V4Planner, V4PositionManager, V4PositionPlanner, type V4RouterAction, type V4RouterCall, V4_BASE_ACTIONS_ABI_DEFINITION, amountWithPathCurrency, encodeRouteToPath, getPathCurrency, hookFlagIndex, priceToClosestTick, sortsBefore, tickToPrice, toAddress, toHex, tradeComparator };
