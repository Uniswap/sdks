import invariant from 'tiny-invariant'
import { Currency, Price, Token } from '@uniswap/sdk-core'
import { Pool as V4Pool } from '@uniswap/v4-sdk'
import { isValidTokenPath } from '../../utils/isValidTokenPath'
import { getPathCurrency } from '../../utils/pathCurrency'
import { TPool } from '../../utils/TPool'

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
  public readonly pathInput: Currency // routes may need to wrap/unwrap a currency to begin trading path
  public readonly pathOutput: Currency // routes may need to wrap/unwrap a currency at the end of trading path

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

    this.pathInput = getPathCurrency(input, pools[0])
    this.pathOutput = getPathCurrency(output, pools[pools.length - 1])

    invariant(pools[0].involvesToken(this.pathInput as Token), 'INPUT')
    const lastPool = pools[pools.length - 1]
    if (lastPool instanceof V4Pool) {
      invariant(lastPool.involvesToken(output) || lastPool.involvesToken(output.wrapped), 'OUTPUT')
    } else {
      invariant(lastPool.involvesToken(output.wrapped as Token), 'OUTPUT')
    }

    /**
     * Normalizes token0-token1 order and selects the next token/fee step to add to the path
     * */
    const tokenPath: Currency[] = [this.pathInput]
    pools[0].token0.equals(this.pathInput) ? tokenPath.push(pools[0].token1) : tokenPath.push(pools[0].token0)

    for (let i = 1; i < pools.length; i++) {
      const prevPool = pools[i - 1]
      const pool = pools[i]
      const inputToken = tokenPath[i]


      const outputToken = pool instanceof V4Pool ?
          (pool.token0.equals(inputToken) ? pool.token1 : pool.token0) :
          (pool.token0.wrapped.equals(inputToken.wrapped) ? pool.token1 : pool.token0)

      invariant(isValidTokenPath(prevPool, pool, inputToken), `PATH`)
      tokenPath.push(outputToken)
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

      this.pools[0].token0.equals(this.pathInput)
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
