import JSBI from 'jsbi';
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

declare const FACTORY_ADDRESS_MAP: {
    [chainId: number]: string;
};
declare const INIT_CODE_HASH = "0x96e8ac4277198ff8b6f785478aa9a39f403cb768dd02cbee326c3e7da348845f";
declare const MINIMUM_LIQUIDITY: JSBI;

/**
 * Indicates that the pair has insufficient reserves for a desired output amount. I.e. the amount of output cannot be
 * obtained by sending any amount of input.
 */
declare class InsufficientReservesError extends Error {
    readonly isInsufficientReservesError: true;
    constructor();
}
/**
 * Indicates that the input amount is too small to produce any amount of output. I.e. the amount of input sent is less
 * than the price of a single unit of output after fees.
 */
declare class InsufficientInputAmountError extends Error {
    readonly isInsufficientInputAmountError: true;
    constructor();
}

declare const computePairAddress: ({ factoryAddress, tokenA, tokenB, }: {
    factoryAddress: string;
    tokenA: Token;
    tokenB: Token;
}) => string;
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

declare class Route<TInput extends Currency, TOutput extends Currency> {
    readonly pairs: Pair[];
    readonly path: Token[];
    readonly input: TInput;
    readonly output: TOutput;
    constructor(pairs: Pair[], input: TInput, output: TOutput);
    private _midPrice;
    get midPrice(): Price<TInput, TOutput>;
    get chainId(): number;
}

interface InputOutput<TInput extends Currency, TOutput extends Currency> {
    readonly inputAmount: CurrencyAmount<TInput>;
    readonly outputAmount: CurrencyAmount<TOutput>;
}
declare function inputOutputComparator<TInput extends Currency, TOutput extends Currency>(a: InputOutput<TInput, TOutput>, b: InputOutput<TInput, TOutput>): number;
declare function tradeComparator<TInput extends Currency, TOutput extends Currency, TTradeType extends TradeType>(a: Trade<TInput, TOutput, TTradeType>, b: Trade<TInput, TOutput, TTradeType>): number;
interface BestTradeOptions {
    maxNumResults?: number;
    maxHops?: number;
}
/**
 * Represents a trade executed against a list of pairs.
 * Does not account for slippage, i.e. trades that front run this trade and move the price.
 */
declare class Trade<TInput extends Currency, TOutput extends Currency, TTradeType extends TradeType> {
    /**
     * The route of the trade, i.e. which pairs the trade goes through and the input/output currencies.
     */
    readonly route: Route<TInput, TOutput>;
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
    static exactIn<TInput extends Currency, TOutput extends Currency>(route: Route<TInput, TOutput>, amountIn: CurrencyAmount<TInput>): Trade<TInput, TOutput, TradeType.EXACT_INPUT>;
    /**
     * Constructs an exact out trade with the given amount out and route
     * @param route route of the exact out trade
     * @param amountOut the amount returned by the trade
     */
    static exactOut<TInput extends Currency, TOutput extends Currency>(route: Route<TInput, TOutput>, amountOut: CurrencyAmount<TOutput>): Trade<TInput, TOutput, TradeType.EXACT_OUTPUT>;
    constructor(route: Route<TInput, TOutput>, amount: TTradeType extends TradeType.EXACT_INPUT ? CurrencyAmount<TInput> : CurrencyAmount<TOutput>, tradeType: TTradeType);
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
    static bestTradeExactIn<TInput extends Currency, TOutput extends Currency>(pairs: Pair[], currencyAmountIn: CurrencyAmount<TInput>, currencyOut: TOutput, { maxNumResults, maxHops }?: BestTradeOptions, currentPairs?: Pair[], nextAmountIn?: CurrencyAmount<Currency>, bestTrades?: Trade<TInput, TOutput, TradeType.EXACT_INPUT>[]): Trade<TInput, TOutput, TradeType.EXACT_INPUT>[];
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
    static bestTradeExactOut<TInput extends Currency, TOutput extends Currency>(pairs: Pair[], currencyIn: TInput, currencyAmountOut: CurrencyAmount<TOutput>, { maxNumResults, maxHops }?: BestTradeOptions, currentPairs?: Pair[], nextAmountOut?: CurrencyAmount<Currency>, bestTrades?: Trade<TInput, TOutput, TradeType.EXACT_OUTPUT>[]): Trade<TInput, TOutput, TradeType.EXACT_OUTPUT>[];
}

/**
 * Options for producing the arguments to send call to the router.
 */
interface TradeOptions {
    /**
     * How much the execution price is allowed to move unfavorably from the trade execution price.
     */
    allowedSlippage: Percent;
    /**
     * How long the swap is valid until it expires, in seconds.
     * This will be used to produce a `deadline` parameter which is computed from when the swap call parameters
     * are generated.
     */
    ttl: number;
    /**
     * The account that should receive the output of the swap.
     */
    recipient: string;
    /**
     * Whether any of the tokens in the path are fee on transfer tokens, which should be handled with special methods
     */
    feeOnTransfer?: boolean;
}
interface TradeOptionsDeadline extends Omit<TradeOptions, 'ttl'> {
    /**
     * When the transaction expires.
     * This is an atlernate to specifying the ttl, for when you do not want to use local time.
     */
    deadline: number;
}
/**
 * The parameters to use in the call to the Uniswap V2 Router to execute a trade.
 */
interface SwapParameters {
    /**
     * The method to call on the Uniswap V2 Router.
     */
    methodName: string;
    /**
     * The arguments to pass to the method, all hex encoded.
     */
    args: (string | string[])[];
    /**
     * The amount of wei to send in hex.
     */
    value: string;
}
/**
 * Represents the Uniswap V2 Router, and has static methods for helping execute trades.
 */
declare abstract class Router {
    /**
     * Cannot be constructed.
     */
    private constructor();
    /**
     * Produces the on-chain method name to call and the hex encoded parameters to pass as arguments for a given trade.
     * @param trade to produce call parameters for
     * @param options options for the call parameters
     */
    static swapCallParameters(trade: Trade<Currency, Currency, TradeType>, options: TradeOptions | TradeOptionsDeadline): SwapParameters;
}

export { type BestTradeOptions, FACTORY_ADDRESS_MAP, INIT_CODE_HASH, InsufficientInputAmountError, InsufficientReservesError, MINIMUM_LIQUIDITY, Pair, Route, Router, type SwapParameters, Trade, type TradeOptions, type TradeOptionsDeadline, computePairAddress, inputOutputComparator, tradeComparator };
