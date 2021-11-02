import { Currency, CurrencyAmount, Percent, Price, TradeType } from '@uniswap/sdk-core'
import { IRoute, RouteV2, RouteV3 } from './route'
import { Route as V2RouteSDK } from '@uniswap/v2-sdk'
import { Route as V3RouteSDK } from '@uniswap/v3-sdk'

export class Trade<TInput extends Currency, TOutput extends Currency, TTradeType extends TradeType> {
  public readonly routes: IRoute<TInput, TOutput>[]
  public readonly tradeType: TTradeType
  private _outputAmount: CurrencyAmount<TOutput> | undefined
  private _inputAmount: CurrencyAmount<TInput> | undefined

  /**
   * The swaps of the trade, i.e. which routes and how much is swapped in each that
   * make up the trade. May consist of swaps in v2 or v3.
   */
   public readonly swaps: {
    route: IRoute<TInput, TOutput>
    inputAmount: CurrencyAmount<TInput>
    outputAmount: CurrencyAmount<TOutput>
  }[]

  //  construct a trade across v2 and v3 routes from pre-computed amounts
  public constructor({
    v2Routes,
    v3Routes,
    tradeType,
  }: {
    v2Routes: {
      routev2: V2RouteSDK<TInput, TOutput>
      inputAmount: CurrencyAmount<TInput>
      outputAmount: CurrencyAmount<TOutput>
    }[]
    v3Routes: {
      routev3: V3RouteSDK<TInput, TOutput>
      inputAmount: CurrencyAmount<TInput>
      outputAmount: CurrencyAmount<TOutput>
    }[]
    tradeType: TTradeType
  }) {
    this.swaps = []
    this.routes = []
    // wrap v2 routes
    for (const { routev2, inputAmount, outputAmount } of v2Routes) {
      const route = new RouteV2(routev2)
      this.routes.push(route)
      this.swaps.push({
        route,
        inputAmount,
        outputAmount
      })
    }

    for (const { routev3, inputAmount, outputAmount } of v3Routes) {
      const route = new RouteV3(routev3)
      this.routes.push(route)
      this.swaps.push({
        route,
        inputAmount,
        outputAmount
      })
    }

    this.tradeType = tradeType
  }

  public get inputAmount(): CurrencyAmount<TInput> {
    if (this._inputAmount) {
      return this._inputAmount
    }

    const inputCurrency = this.swaps[0].inputAmount.currency
    const totalInputFromRoutes = this.swaps
      .map(({ inputAmount }) => inputAmount)
      .reduce((total, cur) => total.add(cur), CurrencyAmount.fromRawAmount(inputCurrency, 0))

    this._inputAmount = totalInputFromRoutes
    return this._inputAmount
  }

  public get outputAmount(): CurrencyAmount<TOutput> {
    if (this._outputAmount) {
      return this._outputAmount
    }

    const outputCurrency = this.swaps[0].outputAmount.currency
    const totalOutputFromRoutes = this.swaps
      .map(({ outputAmount }) => outputAmount)
      .reduce((total, cur) => total.add(cur), CurrencyAmount.fromRawAmount(outputCurrency, 0))

    this._outputAmount = totalOutputFromRoutes
    return this._outputAmount
  }

  private _executionPrice: Price<TInput, TOutput> | undefined

  /**
   * The price expressed in terms of output amount/input amount.
   */
  public get executionPrice(): Price<TInput, TOutput> {
    return (
      this._executionPrice ??
      (this._executionPrice = new Price(
        this.inputAmount.currency,
        this.outputAmount.currency,
        this.inputAmount.quotient,
        this.outputAmount.quotient
      ))
    )
  }

  /**
   * The cached result of the price impact computation
   * @private
   */
  private _priceImpact: Percent | undefined
  /**
   * Returns the percent difference between the route's mid price and the price impact
   */
   public get priceImpact(): Percent {
    if (this._priceImpact) {
      return this._priceImpact
    }

    let spotOutputAmount = CurrencyAmount.fromRawAmount(this.outputAmount.currency, 0)
    for (const { route, inputAmount } of this.swaps) {
      const midPrice = route.midPrice
      spotOutputAmount = spotOutputAmount.add(midPrice.quote(inputAmount))
    }

    const priceImpact = spotOutputAmount.subtract(this.outputAmount).divide(spotOutputAmount)
    this._priceImpact = new Percent(priceImpact.numerator, priceImpact.denominator)

    return this._priceImpact
  }
}
