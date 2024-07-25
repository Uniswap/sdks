import invariant from 'tiny-invariant'

import { Currency, Price, Token } from '@uniswap/sdk-core'
import { Pair } from '@uniswap/v2-sdk'
import { Pool as V3Pool } from '@uniswap/v3-sdk'
import { Pool as V4Pool } from '@uniswap/v4-sdk'

type TPool = Pair | V3Pool | V4Pool

/**
 * Represents a list of pools or pairs through which a swap can occur
 * @template TInput The input token
 * @template TOutput The output token
 */
export class MixedRouteSDK<TInput extends Currency, TOutput extends Currency> {
  public readonly pools: TPool[]
  public readonly path: Currency[]
  public readonly input: TInput
  public readonly output: TOutput
  public readonly adjustedInput: Currency // routes with v2/v3 initial pool must wrap native input currency before trading

  private _midPrice: Price<TInput, TOutput> | null = null

  /**
   * Creates an instance of route.
   * @param pools An array of `TPool` objects (pools or pairs), ordered by the route the swap will take
   * @param input The input token
   * @param output The output token
   */
  public constructor(pools: TPool[], input: TInput, output: TOutput) {
    invariant(pools.length > 0, 'POOLS')

    const chainId = pools[0].chainId
    const allOnSameChain = pools.every((pool) => pool.chainId === chainId)
    invariant(allOnSameChain, 'CHAIN_IDS')

    if (pools[0] instanceof V4Pool) {
      this.adjustedInput = pools[0].involvesToken(input) ? input : input.wrapped
    } else {
      this.adjustedInput = input.wrapped // no native currencies in v2/v3
    }
    invariant(pools[0].involvesToken(this.adjustedInput as Token), 'INPUT')
    invariant(pools[pools.length - 1].involvesToken(output.wrapped), 'OUTPUT')

    /**
     * Normalizes token0-token1 order and selects the next token/fee step to add to the path
     * */
    const tokenPath: Currency[] = [this.adjustedInput]
    for (const [i, pool] of pools.entries()) {
      const currentInputToken = tokenPath[i]
      invariant(currentInputToken.equals(pool.token0) || currentInputToken.equals(pool.token1), 'PATH')
      const nextToken = currentInputToken.equals(pool.token0) ? pool.token1 : pool.token0
      tokenPath.push(nextToken)
    }

    this.pools = pools
    this.path = tokenPath
    this.input = input
    this.output = output ?? tokenPath[tokenPath.length - 1]
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
        return nextInput.equals(pool.token0)
          ? {
              nextInput: pool.token1,
              price: price.multiply(pool.token0Price.asFraction),
            }
          : {
              nextInput: pool.token0,
              price: price.multiply(pool.token1Price.asFraction),
            }
      },

      this.pools[0].token0.equals(this.adjustedInput)
        ? {
            nextInput: this.pools[0].token1,
            price: this.pools[0].token0Price.asFraction,
          }
        : {
            nextInput: this.pools[0].token0,
            price: this.pools[0].token1Price.asFraction,
          }
    ).price

    return (this._midPrice = new Price(this.input, this.output, price.denominator, price.numerator))
  }
}
