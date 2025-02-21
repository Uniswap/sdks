import invariant from 'tiny-invariant'

import { Currency, Price } from '@uniswap/sdk-core'
import { Pool } from './pool'
import { getPathCurrency } from '../utils/pathCurrency'

/**
 * Represents a list of pools through which a swap can occur
 * @template TInput The input currency
 * @template TOutput The output currency
 */
export class Route<TInput extends Currency, TOutput extends Currency> {
  public readonly pools: Pool[]
  public readonly currencyPath: Currency[]
  public readonly input: TInput
  public readonly output: TOutput
  public readonly pathInput: Currency // equivalent or wrapped/unwrapped input to match pool
  public readonly pathOutput: Currency // equivalent or wrapped/unwrapped output to match pool

  private _midPrice: Price<TInput, TOutput> | null = null

  /**
   * Creates an instance of route.
   * @param pools An array of `Pool` objects, ordered by the route the swap will take
   * @param input The input currency
   * @param output The output currency
   */
  public constructor(pools: Pool[], input: TInput, output: TOutput) {
    invariant(pools.length > 0, 'POOLS')

    const chainId = pools[0].chainId
    const allOnSameChain = pools.every((pool) => pool.chainId === chainId)
    invariant(allOnSameChain, 'CHAIN_IDS')

    /**
     * function throws if pools do not involve the input and output currency or the native/wrapped equivalent
     **/
    this.pathInput = getPathCurrency(input, pools[0])
    this.pathOutput = getPathCurrency(output, pools[pools.length - 1])

    /**
     * Normalizes currency0-currency1 order and selects the next currency/fee step to add to the path
     * */
    const currencyPath: Currency[] = [this.pathInput]
    for (const [i, pool] of pools.entries()) {
      const currentInputCurrency = currencyPath[i]
      invariant(currentInputCurrency.equals(pool.currency0) || currentInputCurrency.equals(pool.currency1), 'PATH')
      const nextCurrency = currentInputCurrency.equals(pool.currency0) ? pool.currency1 : pool.currency0
      currencyPath.push(nextCurrency)
    }

    this.pools = pools
    this.currencyPath = currencyPath
    this.input = input
    this.output = output ?? currencyPath[currencyPath.length - 1]
  }

  public get chainId(): number {
    return this.pools[0].chainId
  }

  /**
   * Returns the mid price of the route
   */
  public get midPrice(): Price<TInput, TOutput> {
    if (this._midPrice !== null) return this._midPrice

    const price = this.pools.slice(1).reduce(
      ({ nextInput, price }, pool) => {
        return nextInput.equals(pool.currency0)
          ? {
              nextInput: pool.currency1,
              price: price.multiply(pool.currency0Price),
            }
          : {
              nextInput: pool.currency0,
              price: price.multiply(pool.currency1Price),
            }
      },
      this.pools[0].currency0.equals(this.input)
        ? {
            nextInput: this.pools[0].currency1,
            price: this.pools[0].currency0Price,
          }
        : {
            nextInput: this.pools[0].currency0,
            price: this.pools[0].currency1Price,
          }
    ).price

    return (this._midPrice = new Price(this.input, this.output, price.denominator, price.numerator))
  }
}
