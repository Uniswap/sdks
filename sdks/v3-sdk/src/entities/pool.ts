import { BigintIsh, CurrencyAmount, Price, Token } from '@uniswap/sdk-core'
import JSBI from 'jsbi'
import invariant from 'tiny-invariant'
import { FACTORY_ADDRESS, FeeAmount, TICK_SPACINGS } from '../constants'
import { NEGATIVE_ONE, Q192 } from '../internalConstants'
import { computePoolAddress } from '../utils/computePoolAddress'
import { v3Swap } from '../utils/v3swap'
import { TickMath } from '../utils/tickMath'
import { Tick, TickConstructorArgs } from './tick'
import { NoTickDataProvider, TickDataProvider } from './tickDataProvider'
import { TickListDataProvider } from './tickListDataProvider'

/**
 * By default, pools will not allow operations that require ticks.
 */
const NO_TICK_DATA_PROVIDER_DEFAULT = new NoTickDataProvider()

/**
 * Represents a V3 pool
 */
export class Pool {
  public readonly token0: Token
  public readonly token1: Token
  public readonly fee: FeeAmount
  public readonly sqrtRatioX96: JSBI
  public readonly liquidity: JSBI
  public readonly tickCurrent: number
  public readonly tickDataProvider: TickDataProvider

  private _token0Price?: Price<Token, Token>
  private _token1Price?: Price<Token, Token>

  public static getAddress(
    tokenA: Token,
    tokenB: Token,
    fee: FeeAmount,
    initCodeHashManualOverride?: string,
    factoryAddressOverride?: string
  ): string {
    return computePoolAddress({
      factoryAddress: factoryAddressOverride ?? FACTORY_ADDRESS,
      fee,
      tokenA,
      tokenB,
      initCodeHashManualOverride,
    })
  }

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
  public constructor(
    tokenA: Token,
    tokenB: Token,
    fee: FeeAmount,
    sqrtRatioX96: BigintIsh,
    liquidity: BigintIsh,
    tickCurrent: number,
    ticks: TickDataProvider | (Tick | TickConstructorArgs)[] = NO_TICK_DATA_PROVIDER_DEFAULT
  ) {
    invariant(Number.isInteger(fee) && fee < 1_000_000, 'FEE')

    const tickCurrentSqrtRatioX96 = TickMath.getSqrtRatioAtTick(tickCurrent)
    const nextTickSqrtRatioX96 = TickMath.getSqrtRatioAtTick(tickCurrent + 1)
    invariant(
      JSBI.greaterThanOrEqual(JSBI.BigInt(sqrtRatioX96), tickCurrentSqrtRatioX96) &&
        JSBI.lessThanOrEqual(JSBI.BigInt(sqrtRatioX96), nextTickSqrtRatioX96),
      'PRICE_BOUNDS'
    )
    // always create a copy of the list since we want the pool's tick list to be immutable
    ;[this.token0, this.token1] = tokenA.sortsBefore(tokenB) ? [tokenA, tokenB] : [tokenB, tokenA]
    this.fee = fee
    this.sqrtRatioX96 = JSBI.BigInt(sqrtRatioX96)
    this.liquidity = JSBI.BigInt(liquidity)
    this.tickCurrent = tickCurrent
    this.tickDataProvider = Array.isArray(ticks) ? new TickListDataProvider(ticks, TICK_SPACINGS[fee]) : ticks
  }

  /**
   * Returns true if the token is either token0 or token1
   * @param token The token to check
   * @returns True if token is either token0 or token
   */
  public involvesToken(token: Token): boolean {
    return token.equals(this.token0) || token.equals(this.token1)
  }

  /**
   * Returns the current mid price of the pool in terms of token0, i.e. the ratio of token1 over token0
   */
  public get token0Price(): Price<Token, Token> {
    return (
      this._token0Price ??
      (this._token0Price = new Price(
        this.token0,
        this.token1,
        Q192,
        JSBI.multiply(this.sqrtRatioX96, this.sqrtRatioX96)
      ))
    )
  }

  /**
   * Returns the current mid price of the pool in terms of token1, i.e. the ratio of token0 over token1
   */
  public get token1Price(): Price<Token, Token> {
    return (
      this._token1Price ??
      (this._token1Price = new Price(
        this.token1,
        this.token0,
        JSBI.multiply(this.sqrtRatioX96, this.sqrtRatioX96),
        Q192
      ))
    )
  }

  /**
   * Return the price of the given token in terms of the other token in the pool.
   * @param token The token to return price of
   * @returns The price of the given token, in terms of the other.
   */
  public priceOf(token: Token): Price<Token, Token> {
    invariant(this.involvesToken(token), 'TOKEN')
    return token.equals(this.token0) ? this.token0Price : this.token1Price
  }

  /**
   * Returns the chain ID of the tokens in the pool.
   */
  public get chainId(): number {
    return this.token0.chainId
  }

  /**
   * Given an input amount of a token, return the computed output amount, and a pool with state updated after the trade
   * @param inputAmount The input amount for which to quote the output amount
   * @param sqrtPriceLimitX96 The Q64.96 sqrt price limit
   * @returns The output amount and the pool with updated state
   */
  public async getOutputAmount(
    inputAmount: CurrencyAmount<Token>,
    sqrtPriceLimitX96?: JSBI
  ): Promise<[CurrencyAmount<Token>, Pool]> {
    invariant(this.involvesToken(inputAmount.currency), 'TOKEN')

    const zeroForOne = inputAmount.currency.equals(this.token0)

    const {
      amountCalculated: outputAmount,
      sqrtRatioX96,
      liquidity,
      tickCurrent,
    } = await this.swap(zeroForOne, inputAmount.quotient, sqrtPriceLimitX96)
    const outputToken = zeroForOne ? this.token1 : this.token0
    return [
      CurrencyAmount.fromRawAmount(outputToken, JSBI.multiply(outputAmount, NEGATIVE_ONE)),
      new Pool(this.token0, this.token1, this.fee, sqrtRatioX96, liquidity, tickCurrent, this.tickDataProvider),
    ]
  }

  /**
   * Given a desired output amount of a token, return the computed input amount and a pool with state updated after the trade
   * @param outputAmount the output amount for which to quote the input amount
   * @param sqrtPriceLimitX96 The Q64.96 sqrt price limit. If zero for one, the price cannot be less than this value after the swap. If one for zero, the price cannot be greater than this value after the swap
   * @returns The input amount and the pool with updated state
   */
  public async getInputAmount(
    outputAmount: CurrencyAmount<Token>,
    sqrtPriceLimitX96?: JSBI
  ): Promise<[CurrencyAmount<Token>, Pool]> {
    invariant(outputAmount.currency.isToken && this.involvesToken(outputAmount.currency), 'TOKEN')

    const zeroForOne = outputAmount.currency.equals(this.token1)

    const {
      amountCalculated: inputAmount,
      sqrtRatioX96,
      liquidity,
      tickCurrent,
    } = await this.swap(zeroForOne, JSBI.multiply(outputAmount.quotient, NEGATIVE_ONE), sqrtPriceLimitX96)
    const inputToken = zeroForOne ? this.token0 : this.token1
    return [
      CurrencyAmount.fromRawAmount(inputToken, inputAmount),
      new Pool(this.token0, this.token1, this.fee, sqrtRatioX96, liquidity, tickCurrent, this.tickDataProvider),
    ]
  }

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
  private async swap(
    zeroForOne: boolean,
    amountSpecified: JSBI,
    sqrtPriceLimitX96?: JSBI
  ): Promise<{ amountCalculated: JSBI; sqrtRatioX96: JSBI; liquidity: JSBI; tickCurrent: number }> {
    return v3Swap(
      JSBI.BigInt(this.fee),
      this.sqrtRatioX96,
      this.tickCurrent,
      this.liquidity,
      this.tickSpacing,
      this.tickDataProvider,
      zeroForOne,
      amountSpecified,
      sqrtPriceLimitX96
    )
  }

  public get tickSpacing(): number {
    return TICK_SPACINGS[this.fee]
  }
}
