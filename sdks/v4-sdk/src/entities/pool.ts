import invariant from 'tiny-invariant'
import { keccak256 } from '@ethersproject/solidity'
import { BigintIsh, Currency, CurrencyAmount, Price } from '@uniswap/sdk-core'
import {
  v3Swap,
  NoTickDataProvider,
  Tick,
  TickConstructorArgs,
  TickDataProvider,
  TickListDataProvider,
  TickMath,
} from '@uniswap/v3-sdk'
import { defaultAbiCoder, isAddress } from 'ethers/lib/utils'
import { sortsBefore } from '../utils/sortsBefore'
import { Hook } from '../utils/hook'
import { ADDRESS_ZERO, NEGATIVE_ONE, Q192 } from '../internalConstants'
import JSBI from 'jsbi'

export const DYNAMIC_FEE_FLAG = 0x800000
const NO_TICK_DATA_PROVIDER_DEFAULT = new NoTickDataProvider()

export type PoolKey = {
  currency0: string
  currency1: string
  fee: number
  tickSpacing: number
  hooks: string
}

/**
 * Represents a V4 pool
 */
export class Pool {
  public readonly currency0: Currency
  public readonly currency1: Currency
  public readonly fee: number
  public readonly tickSpacing: number
  public readonly sqrtRatioX96: JSBI
  public readonly hooks: string // address
  public readonly liquidity: JSBI
  public readonly tickCurrent: number
  public readonly tickDataProvider: TickDataProvider
  public readonly poolKey: PoolKey
  public readonly poolId: string

  private _currency0Price?: Price<Currency, Currency>
  private _currency1Price?: Price<Currency, Currency>

  public static getPoolKey(
    currencyA: Currency,
    currencyB: Currency,
    fee: number,
    tickSpacing: number,
    hooks: string
  ): PoolKey {
    invariant(isAddress(hooks), 'Invalid hook address')

    const [currency0, currency1] = sortsBefore(currencyA, currencyB) ? [currencyA, currencyB] : [currencyB, currencyA]
    const currency0Addr = currency0.isNative ? ADDRESS_ZERO : currency0.wrapped.address
    const currency1Addr = currency1.isNative ? ADDRESS_ZERO : currency1.wrapped.address

    return {
      currency0: currency0Addr,
      currency1: currency1Addr,
      fee,
      tickSpacing,
      hooks,
    }
  }

  public static getPoolId(
    currencyA: Currency,
    currencyB: Currency,
    fee: number,
    tickSpacing: number,
    hooks: string
  ): string {
    const [currency0, currency1] = sortsBefore(currencyA, currencyB) ? [currencyA, currencyB] : [currencyB, currencyA]
    const currency0Addr = currency0.isNative ? ADDRESS_ZERO : currency0.wrapped.address
    const currency1Addr = currency1.isNative ? ADDRESS_ZERO : currency1.wrapped.address
    return keccak256(
      ['bytes'],
      [
        defaultAbiCoder.encode(
          ['address', 'address', 'uint24', 'int24', 'address'],
          [currency0Addr, currency1Addr, fee, tickSpacing, hooks]
        ),
      ]
    )
  }

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
  public constructor(
    currencyA: Currency,
    currencyB: Currency,
    fee: number,
    tickSpacing: number,
    hooks: string,
    sqrtRatioX96: BigintIsh,
    liquidity: BigintIsh,
    tickCurrent: number,
    ticks: TickDataProvider | (Tick | TickConstructorArgs)[] = NO_TICK_DATA_PROVIDER_DEFAULT
  ) {
    invariant(isAddress(hooks), 'Invalid hook address')
    invariant(Number.isInteger(fee) && (fee === DYNAMIC_FEE_FLAG || fee < 1_000_000), 'FEE')
    if (fee === DYNAMIC_FEE_FLAG) {
      invariant(Number(hooks) > 0, 'Dynamic fee pool requires a hook')
    }
    const tickCurrentSqrtRatioX96 = TickMath.getSqrtRatioAtTick(tickCurrent)
    const nextTickSqrtRatioX96 = TickMath.getSqrtRatioAtTick(tickCurrent + 1)
    invariant(
      JSBI.greaterThanOrEqual(JSBI.BigInt(sqrtRatioX96), tickCurrentSqrtRatioX96) &&
        JSBI.lessThanOrEqual(JSBI.BigInt(sqrtRatioX96), nextTickSqrtRatioX96),
      'PRICE_BOUNDS'
    )

    // always create a copy of the list since we want the pool's tick list to be immutable
    ;[this.currency0, this.currency1] = sortsBefore(currencyA, currencyB)
      ? [currencyA, currencyB]
      : [currencyB, currencyA]
    this.fee = fee
    this.sqrtRatioX96 = JSBI.BigInt(sqrtRatioX96)
    this.tickSpacing = tickSpacing
    this.hooks = hooks
    this.liquidity = JSBI.BigInt(liquidity)
    this.tickCurrent = tickCurrent
    this.tickDataProvider = Array.isArray(ticks) ? new TickListDataProvider(ticks, tickSpacing) : ticks
    this.poolKey = Pool.getPoolKey(this.currency0, this.currency1, this.fee, this.tickSpacing, this.hooks)
    this.poolId = Pool.getPoolId(this.currency0, this.currency1, this.fee, this.tickSpacing, this.hooks)
  }

  /** backwards compatibility with v2/3 sdks */
  public get token0(): Currency {
    return this.currency0
  }
  public get token1(): Currency {
    return this.currency1
  }

  /**
   * Returns true if the currency is either currency0 or currency1
   * @param currency The currency to check
   * @returns True if currency is either currency0 or currency1
   */
  public involvesCurrency(currency: Currency): boolean {
    return currency.equals(this.currency0) || currency.equals(this.currency1)
  }
  /** backwards compatibility with v2/3 sdks */
  public involvesToken(currency: Currency): boolean {
    return this.involvesCurrency(currency)
  }

  /**
   * v4-only involvesToken convenience method, used for mixed route ETH <-> WETH connection only
   * @param currency
   */
  public v4InvolvesToken(currency: Currency): boolean {
    return (
      this.involvesCurrency(currency) ||
      currency.wrapped.equals(this.currency0) ||
      currency.wrapped.equals(this.currency1) ||
      currency.wrapped.equals(this.currency0.wrapped) ||
      currency.wrapped.equals(this.currency1.wrapped)
    )
  }

  /**
   * Returns the current mid price of the pool in terms of currency0, i.e. the ratio of currency1 over currency0
   */
  public get currency0Price(): Price<Currency, Currency> {
    return (
      this._currency0Price ??
      (this._currency0Price = new Price(
        this.currency0,
        this.currency1,
        Q192,
        JSBI.multiply(this.sqrtRatioX96, this.sqrtRatioX96)
      ))
    )
  }
  /** backwards compatibility with v2/3 sdks */
  public get token0Price(): Price<Currency, Currency> {
    return this.currency0Price
  }

  /**
   * Returns the current mid price of the pool in terms of currency1, i.e. the ratio of currency0 over currency1
   */
  public get currency1Price(): Price<Currency, Currency> {
    return (
      this._currency1Price ??
      (this._currency1Price = new Price(
        this.currency1,
        this.currency0,
        JSBI.multiply(this.sqrtRatioX96, this.sqrtRatioX96),
        Q192
      ))
    )
  }
  /** backwards compatibility with v2/3 sdks */
  public get token1Price(): Price<Currency, Currency> {
    return this.currency1Price
  }

  /**
   * Return the price of the given currency in terms of the other currency in the pool.
   * @param currency The currency to return price of
   * @returns The price of the given currency, in terms of the other.
   */
  public priceOf(currency: Currency): Price<Currency, Currency> {
    invariant(this.involvesCurrency(currency), 'CURRENCY')
    return currency.equals(this.currency0) ? this.currency0Price : this.currency1Price
  }

  /**
   * Returns the chain ID of the currencies in the pool.
   */
  public get chainId(): number {
    return this.currency0.chainId
  }

  /** Works only for vanilla hookless v3 pools, otherwise throws an error */
  public async getOutputAmount(
    inputAmount: CurrencyAmount<Currency>,
    sqrtPriceLimitX96?: JSBI
  ): Promise<[CurrencyAmount<Currency>, Pool]> {
    invariant(this.involvesCurrency(inputAmount.currency), 'CURRENCY')

    const zeroForOne = inputAmount.currency.equals(this.currency0)

    const {
      amountCalculated: outputAmount,
      sqrtRatioX96,
      liquidity,
      tickCurrent,
    } = await this.swap(zeroForOne, inputAmount.quotient, sqrtPriceLimitX96)
    const outputCurrency = zeroForOne ? this.currency1 : this.currency0
    return [
      CurrencyAmount.fromRawAmount(outputCurrency, JSBI.multiply(outputAmount, NEGATIVE_ONE)),
      new Pool(
        this.currency0,
        this.currency1,
        this.fee,
        this.tickSpacing,
        this.hooks,
        sqrtRatioX96,
        liquidity,
        tickCurrent,
        this.tickDataProvider
      ),
    ]
  }

  /**
   * Given a desired output amount of a currency, return the computed input amount and a pool with state updated after the trade
   * Works only for vanilla hookless v3 pools, otherwise throws an error
   * @param outputAmount the output amount for which to quote the input amount
   * @param sqrtPriceLimitX96 The Q64.96 sqrt price limit. If zero for one, the price cannot be less than this value after the swap. If one for zero, the price cannot be greater than this value after the swap
   * @returns The input amount and the pool with updated state
   */
  public async getInputAmount(
    outputAmount: CurrencyAmount<Currency>,
    sqrtPriceLimitX96?: JSBI
  ): Promise<[CurrencyAmount<Currency>, Pool]> {
    invariant(this.involvesCurrency(outputAmount.currency), 'CURRENCY')

    const zeroForOne = outputAmount.currency.equals(this.currency1)

    const {
      amountCalculated: inputAmount,
      sqrtRatioX96,
      liquidity,
      tickCurrent,
    } = await this.swap(zeroForOne, JSBI.multiply(outputAmount.quotient, NEGATIVE_ONE), sqrtPriceLimitX96)
    const inputCurrency = zeroForOne ? this.currency0 : this.currency1
    return [
      CurrencyAmount.fromRawAmount(inputCurrency, inputAmount),
      new Pool(
        this.currency0,
        this.currency1,
        this.fee,
        this.tickSpacing,
        this.hooks,
        sqrtRatioX96,
        liquidity,
        tickCurrent,
        this.tickDataProvider
      ),
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
    if (!this.hookImpactsSwap()) {
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
    } else {
      throw new Error('Unsupported hook')
    }
  }

  private hookImpactsSwap(): boolean {
    // could use this function to clear certain hooks that may have swap Permissions, but we know they don't interfere
    // in the swap outcome
    return Hook.hasSwapPermissions(this.hooks)
  }
}
