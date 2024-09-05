import { BigintIsh, MaxUint256, Percent, Price, CurrencyAmount, Token } from '@uniswap/sdk-core'
import JSBI from 'jsbi'
import invariant from 'tiny-invariant'
import { ZERO } from '../utils/internalConstants'
import { maxLiquidityForAmounts } from '../utils/maxLiquidityForAmounts'
import { tickToPrice } from '../utils/priceTickConversions'
import { SqrtPriceMath } from '../utils/sqrtPriceMath'
import { TickMath } from '../utils/tickMath'
import { encodeSqrtRatioX96 } from '../utils/encodeSqrtRatioX96'
import { Pool } from './pool'

interface PositionConstructorArgs {
  poolKey: Pool
  tickLower: number
  tickUpper: number
}

/**
 * Represents a position on a Uniswap V4 Pool
 * @dev Similar to the V3 implementation
 */
export class Position {
  public readonly poolKey: Pool
  public readonly tickLower: number
  public readonly tickUpper: number

  // cached resuts for the getters
  private _token0Amount: CurrencyAmount<Token> | null = null
  private _token1Amount: CurrencyAmount<Token> | null = null
  private _mintAmounts: Readonly<{ amount0: JSBI; amount1: JSBI }> | null = null

  /**
   * Constructs a position for a given poolKey with the given liquidity
   * @param poolKey For which poolKey the liquidity is assigned
   * @param liquidity The amount of liquidity that is in the position
   * @param tickLower The lower tick of the position
   * @param tickUpper The upper tick of the position
   */
  public constructor({ poolKey, tickLower, tickUpper }: PositionConstructorArgs) {
    invariant(tickLower < tickUpper, 'TICK_ORDER')
    invariant(tickLower >= TickMath.MIN_TICK && tickLower % poolKey.tickSpacing === 0, 'TICK_LOWER')
    invariant(tickUpper <= TickMath.MAX_TICK && tickUpper % poolKey.tickSpacing === 0, 'TICK_UPPER')

    this.poolKey = poolKey
    this.tickLower = tickLower
    this.tickUpper = tickUpper
  }

  /**
   * Returns the price of token0 at the lower tick
   */
  public get token0PriceLower(): Price<Token, Token> {
    return tickToPrice(this.poolKey.token0, this.poolKey.token1, this.tickLower)
  }

  /**
   * Returns the price of token0 at the upper tick
   */
  public get token0PriceUpper(): Price<Token, Token> {
    return tickToPrice(this.poolKey.token0, this.poolKey.token1, this.tickUpper)
  }

  /**
   * Returns the amount of token0 that this position's liquidity could be burned for at the current poolKey price
   */
  public get amount0(): CurrencyAmount<Token> {
    if (this._token0Amount === null) {
      if (this.poolKey.tickCurrent < this.tickLower) {
        this._token0Amount = CurrencyAmount.fromRawAmount(
          this.poolKey.token0,
          SqrtPriceMath.getAmount0Delta(
            TickMath.getSqrtRatioAtTick(this.tickLower),
            TickMath.getSqrtRatioAtTick(this.tickUpper),
            this.liquidity,
            false
          )
        )
      } else if (this.poolKey.tickCurrent < this.tickUpper) {
        this._token0Amount = CurrencyAmount.fromRawAmount(
          this.poolKey.token0,
          SqrtPriceMath.getAmount0Delta(
            this.poolKey.sqrtRatioX96,
            TickMath.getSqrtRatioAtTick(this.tickUpper),
            this.liquidity,
            false
          )
        )
      } else {
        this._token0Amount = CurrencyAmount.fromRawAmount(this.poolKey.token0, ZERO)
      }
    }
    return this._token0Amount
  }

  /**
   * Returns the amount of token1 that this position's liquidity could be burned for at the current poolKey price
   */
  public get amount1(): CurrencyAmount<Token> {
    if (this._token1Amount === null) {
      if (this.poolKey.tickCurrent < this.tickLower) {
        this._token1Amount = CurrencyAmount.fromRawAmount(this.poolKey.token1, ZERO)
      } else if (this.poolKey.tickCurrent < this.tickUpper) {
        this._token1Amount = CurrencyAmount.fromRawAmount(
          this.poolKey.token1,
          SqrtPriceMath.getAmount1Delta(
            TickMath.getSqrtRatioAtTick(this.tickLower),
            this.poolKey.sqrtRatioX96,
            this.liquidity,
            false
          )
        )
      } else {
        this._token1Amount = CurrencyAmount.fromRawAmount(
          this.poolKey.token1,
          SqrtPriceMath.getAmount1Delta(
            TickMath.getSqrtRatioAtTick(this.tickLower),
            TickMath.getSqrtRatioAtTick(this.tickUpper),
            this.liquidity,
            false
          )
        )
      }
    }
    return this._token1Amount
  }

  /**
   * Returns the lower and upper sqrt ratios if the price 'slips' up to slippage tolerance percentage
   * @param slippageTolerance The amount by which the price can 'slip' before the transaction will revert
   * @returns The sqrt ratios after slippage
   */
  private ratiosAfterSlippage(slippageTolerance: Percent): { sqrtRatioX96Lower: JSBI; sqrtRatioX96Upper: JSBI } {
    const priceLower = this.poolKey.token0Price.asFraction.multiply(new Percent(1).subtract(slippageTolerance))
    const priceUpper = this.poolKey.token0Price.asFraction.multiply(slippageTolerance.add(1))
    let sqrtRatioX96Lower = encodeSqrtRatioX96(priceLower.numerator, priceLower.denominator)
    if (JSBI.lessThanOrEqual(sqrtRatioX96Lower, TickMath.MIN_SQRT_RATIO)) {
      sqrtRatioX96Lower = JSBI.add(TickMath.MIN_SQRT_RATIO, JSBI.BigInt(1))
    }
    let sqrtRatioX96Upper = encodeSqrtRatioX96(priceUpper.numerator, priceUpper.denominator)
    if (JSBI.greaterThanOrEqual(sqrtRatioX96Upper, TickMath.MAX_SQRT_RATIO)) {
      sqrtRatioX96Upper = JSBI.subtract(TickMath.MAX_SQRT_RATIO, JSBI.BigInt(1))
    }
    return {
      sqrtRatioX96Lower,
      sqrtRatioX96Upper,
    }
  }

  /**
   * Returns the minimum amounts that must be sent in order to safely mint the amount of liquidity held by the position
   * with the given slippage tolerance
   * @param slippageTolerance Tolerance of unfavorable slippage from the current price
   * @returns The amounts, with slippage
   */
  public mintAmountsWithSlippage(slippageTolerance: Percent): Readonly<{ amount0: JSBI; amount1: JSBI }> {
    // get lower/upper prices
    const { sqrtRatioX96Upper, sqrtRatioX96Lower } = this.ratiosAfterSlippage(slippageTolerance)

    // construct counterfactual poolKeys
    const poolKeyLower = new Pool(
      this.poolKey.token0,
      this.poolKey.token1,
      this.poolKey.fee,
      sqrtRatioX96Lower,
      0 /* liquidity doesn't matter */,
      TickMath.getTickAtSqrtRatio(sqrtRatioX96Lower)
    )
    const poolKeyUpper = new Pool(
      this.poolKey.token0,
      this.poolKey.token1,
      this.poolKey.fee,
      sqrtRatioX96Upper,
      0 /* liquidity doesn't matter */,
      TickMath.getTickAtSqrtRatio(sqrtRatioX96Upper)
    )

    // because the router is imprecise, we need to calculate the position that will be created (assuming no slippage)
    const positionThatWillBeCreated = Position.fromAmounts({
      poolKey: this.poolKey,
      tickLower: this.tickLower,
      tickUpper: this.tickUpper,
      ...this.mintAmounts, // the mint amounts are what will be passed as calldata
      useFullPrecision: false,
    })

    // we want the smaller amounts...
    // ...which occurs at the upper price for amount0...
    const { amount0 } = new Position({
      poolKey: poolKeyUpper,
      liquidity: positionThatWillBeCreated.liquidity,
      tickLower: this.tickLower,
      tickUpper: this.tickUpper,
    }).mintAmounts
    // ...and the lower for amount1
    const { amount1 } = new Position({
      poolKey: poolKeyLower,
      liquidity: positionThatWillBeCreated.liquidity,
      tickLower: this.tickLower,
      tickUpper: this.tickUpper,
    }).mintAmounts

    return { amount0, amount1 }
  }

  /**
   * Returns the minimum amounts that should be requested in order to safely burn the amount of liquidity held by the
   * position with the given slippage tolerance
   * @param slippageTolerance tolerance of unfavorable slippage from the current price
   * @returns The amounts, with slippage
   */
  public burnAmountsWithSlippage(slippageTolerance: Percent): Readonly<{ amount0: JSBI; amount1: JSBI }> {
    // get lower/upper prices
    const { sqrtRatioX96Upper, sqrtRatioX96Lower } = this.ratiosAfterSlippage(slippageTolerance)

    // construct counterfactual poolKeys
    const poolKeyLower = new Pool(
      this.poolKey.token0,
      this.poolKey.token1,
      this.poolKey.fee,
      sqrtRatioX96Lower,
      0 /* liquidity doesn't matter */,
      TickMath.getTickAtSqrtRatio(sqrtRatioX96Lower)
    )
    const poolKeyUpper = new Pool(
      this.poolKey.token0,
      this.poolKey.token1,
      this.poolKey.fee,
      sqrtRatioX96Upper,
      0 /* liquidity doesn't matter */,
      TickMath.getTickAtSqrtRatio(sqrtRatioX96Upper)
    )

    // we want the smaller amounts...
    // ...which occurs at the upper price for amount0...
    const amount0 = new Position({
      poolKey: poolKeyUpper,
      liquidity: this.liquidity,
      tickLower: this.tickLower,
      tickUpper: this.tickUpper,
    }).amount0
    // ...and the lower for amount1
    const amount1 = new Position({
      poolKey: poolKeyLower,
      liquidity: this.liquidity,
      tickLower: this.tickLower,
      tickUpper: this.tickUpper,
    }).amount1

    return { amount0: amount0.quotient, amount1: amount1.quotient }
  }

  /**
   * Returns the minimum amounts that must be sent in order to mint the amount of liquidity held by the position at
   * the current price for the poolKey
   */
  public get mintAmounts(): Readonly<{ amount0: JSBI; amount1: JSBI }> {
    if (this._mintAmounts === null) {
      if (this.poolKey.tickCurrent < this.tickLower) {
        return {
          amount0: SqrtPriceMath.getAmount0Delta(
            TickMath.getSqrtRatioAtTick(this.tickLower),
            TickMath.getSqrtRatioAtTick(this.tickUpper),
            this.liquidity,
            true
          ),
          amount1: ZERO,
        }
      } else if (this.poolKey.tickCurrent < this.tickUpper) {
        return {
          amount0: SqrtPriceMath.getAmount0Delta(
            this.poolKey.sqrtRatioX96,
            TickMath.getSqrtRatioAtTick(this.tickUpper),
            this.liquidity,
            true
          ),
          amount1: SqrtPriceMath.getAmount1Delta(
            TickMath.getSqrtRatioAtTick(this.tickLower),
            this.poolKey.sqrtRatioX96,
            this.liquidity,
            true
          ),
        }
      } else {
        return {
          amount0: ZERO,
          amount1: SqrtPriceMath.getAmount1Delta(
            TickMath.getSqrtRatioAtTick(this.tickLower),
            TickMath.getSqrtRatioAtTick(this.tickUpper),
            this.liquidity,
            true
          ),
        }
      }
    }
    return this._mintAmounts
  }

  /**
   * Computes the maximum amount of liquidity received for a given amount of token0, token1,
   * and the prices at the tick boundaries.
   * @param poolKey The poolKey for which the position should be created
   * @param tickLower The lower tick of the position
   * @param tickUpper The upper tick of the position
   * @param amount0 token0 amount
   * @param amount1 token1 amount
   * @param useFullPrecision If false, liquidity will be maximized according to what the router can calculate,
   * not what core can theoretically support
   * @returns The amount of liquidity for the position
   */
  public static fromAmounts({
    poolKey,
    tickLower,
    tickUpper,
    amount0,
    amount1,
    useFullPrecision,
  }: {
    poolKey: Pool
    tickLower: number
    tickUpper: number
    amount0: BigintIsh
    amount1: BigintIsh
    useFullPrecision: boolean
  }) {
    const sqrtRatioAX96 = TickMath.getSqrtRatioAtTick(tickLower)
    const sqrtRatioBX96 = TickMath.getSqrtRatioAtTick(tickUpper)
    return new Position({
      poolKey,
      tickLower,
      tickUpper,
      liquidity: maxLiquidityForAmounts(
        poolKey.sqrtRatioX96,
        sqrtRatioAX96,
        sqrtRatioBX96,
        amount0,
        amount1,
        useFullPrecision
      ),
    })
  }

  /**
   * Computes a position with the maximum amount of liquidity received for a given amount of token0, assuming an unlimited amount of token1
   * @param poolKey The poolKey for which the position is created
   * @param tickLower The lower tick
   * @param tickUpper The upper tick
   * @param amount0 The desired amount of token0
   * @param useFullPrecision If true, liquidity will be maximized according to what the router can calculate,
   * not what core can theoretically support
   * @returns The position
   */
  public static fromAmount0({
    poolKey,
    tickLower,
    tickUpper,
    amount0,
    useFullPrecision,
  }: {
    poolKey: Pool
    tickLower: number
    tickUpper: number
    amount0: BigintIsh
    useFullPrecision: boolean
  }) {
    return Position.fromAmounts({ poolKey, tickLower, tickUpper, amount0, amount1: MaxUint256, useFullPrecision })
  }

  /**
   * Computes a position with the maximum amount of liquidity received for a given amount of token1, assuming an unlimited amount of token0
   * @param poolKey The poolKey for which the position is created
   * @param tickLower The lower tick
   * @param tickUpper The upper tick
   * @param amount1 The desired amount of token1
   * @returns The position
   */
  public static fromAmount1({
    poolKey,
    tickLower,
    tickUpper,
    amount1,
  }: {
    poolKey: Pool
    tickLower: number
    tickUpper: number
    amount1: BigintIsh
  }) {
    // this function always uses full precision,
    return Position.fromAmounts({ poolKey, tickLower, tickUpper, amount0: MaxUint256, amount1, useFullPrecision: true })
  }
}
