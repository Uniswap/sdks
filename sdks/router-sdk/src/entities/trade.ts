import { Currency, CurrencyAmount, Fraction, Percent, Price, TradeType, Ether } from '@uniswap/sdk-core'
import { Pair, Route as V2RouteSDK, Trade as V2TradeSDK } from '@uniswap/v2-sdk'
import { Pool as V3Pool, Route as V3RouteSDK, Trade as V3TradeSDK } from '@uniswap/v3-sdk'
import { Pool as V4Pool, Route as V4RouteSDK, Trade as V4TradeSDK } from '@uniswap/v4-sdk'
import invariant from 'tiny-invariant'
import { ONE, ONE_HUNDRED_PERCENT, ZERO, ZERO_PERCENT } from '../constants'
import { MixedRouteSDK } from './mixedRoute/route'
import { MixedRouteTrade as MixedRouteTradeSDK } from './mixedRoute/trade'
import { IRoute, MixedRoute, RouteV2, RouteV3, RouteV4 } from './route'

export class Trade<TInput extends Currency, TOutput extends Currency, TTradeType extends TradeType> {
  public readonly routes: IRoute<TInput, TOutput, Pair | V3Pool | V4Pool>[]
  public readonly tradeType: TTradeType
  private _outputAmount: CurrencyAmount<TOutput> | undefined
  private _inputAmount: CurrencyAmount<TInput> | undefined
  private _nativeInputRoutes: IRoute<TInput, TOutput, Pair | V3Pool | V4Pool>[] | undefined
  private _wethInputRoutes: IRoute<TInput, TOutput, Pair | V3Pool | V4Pool>[] | undefined

  /**
   * The swaps of the trade, i.e. which routes and how much is swapped in each that
   * make up the trade. May consist of swaps in v2 or v3.
   */
  public readonly swaps: {
    route: IRoute<TInput, TOutput, Pair | V3Pool | V4Pool>
    inputAmount: CurrencyAmount<TInput>
    outputAmount: CurrencyAmount<TOutput>
  }[]

  //  construct a trade across v2 and v3 routes from pre-computed amounts
  public constructor({
    v2Routes = [],
    v3Routes = [],
    v4Routes = [],
    mixedRoutes = [],
    tradeType,
  }: {
    v2Routes?: {
      routev2: V2RouteSDK<TInput, TOutput>
      inputAmount: CurrencyAmount<TInput>
      outputAmount: CurrencyAmount<TOutput>
    }[]
    v3Routes?: {
      routev3: V3RouteSDK<TInput, TOutput>
      inputAmount: CurrencyAmount<TInput>
      outputAmount: CurrencyAmount<TOutput>
    }[]
    v4Routes?: {
      routev4: V4RouteSDK<TInput, TOutput>
      inputAmount: CurrencyAmount<TInput>
      outputAmount: CurrencyAmount<TOutput>
    }[]
    mixedRoutes?: {
      mixedRoute: MixedRouteSDK<TInput, TOutput>
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
        outputAmount,
      })
    }
    // wrap v3 routes
    for (const { routev3, inputAmount, outputAmount } of v3Routes) {
      const route = new RouteV3(routev3)
      this.routes.push(route)
      this.swaps.push({
        route,
        inputAmount,
        outputAmount,
      })
    }
    // wrap v4 routes
    for (const { routev4, inputAmount, outputAmount } of v4Routes) {
      const route = new RouteV4(routev4)
      this.routes.push(route)
      this.swaps.push({
        route,
        inputAmount,
        outputAmount,
      })
    }
    for (const { mixedRoute, inputAmount, outputAmount } of mixedRoutes) {
      const route = new MixedRoute(mixedRoute)
      this.routes.push(route)
      this.swaps.push({
        route,
        inputAmount,
        outputAmount,
      })
    }

    if (this.swaps.length === 0) {
      throw new Error('No routes provided when calling Trade constructor')
    }

    this.tradeType = tradeType

    // each route must have the same input and output currency
    const inputCurrency = this.swaps[0].inputAmount.currency
    const outputCurrency = this.swaps[0].outputAmount.currency
    invariant(
      this.swaps.every(({ route }) => inputCurrency.wrapped.equals(route.input.wrapped)),
      'INPUT_CURRENCY_MATCH'
    )
    invariant(
      this.swaps.every(({ route }) => outputCurrency.wrapped.equals(route.output.wrapped)),
      'OUTPUT_CURRENCY_MATCH'
    )

    // pools must be unique inter protocols
    const numPools = this.swaps.map(({ route }) => route.pools.length).reduce((total, cur) => total + cur, 0)
    const poolIdentifierSet = new Set<string>()
    for (const { route } of this.swaps) {
      for (const pool of route.pools) {
        if (pool instanceof V4Pool) {
          poolIdentifierSet.add(pool.poolId)
        } else if (pool instanceof V3Pool) {
          poolIdentifierSet.add(V3Pool.getAddress(pool.token0, pool.token1, pool.fee))
        } else if (pool instanceof Pair) {
          const pair = pool
          poolIdentifierSet.add(Pair.getAddress(pair.token0, pair.token1))
        } else {
          throw new Error('Unexpected pool type in route when constructing trade object')
        }
      }
    }
    invariant(numPools === poolIdentifierSet.size, 'POOLS_DUPLICATED')
  }

  public get inputAmount(): CurrencyAmount<TInput> {
    if (this._inputAmount) {
      return this._inputAmount
    }

    const inputAmountCurrency = this.swaps[0].inputAmount.currency
    const totalInputFromRoutes = this.swaps
      .map(({ inputAmount: routeInputAmount }) => routeInputAmount)
      .reduce((total, cur) => total.add(cur), CurrencyAmount.fromRawAmount(inputAmountCurrency, 0))

    this._inputAmount = totalInputFromRoutes
    return this._inputAmount
  }

  public get outputAmount(): CurrencyAmount<TOutput> {
    if (this._outputAmount) {
      return this._outputAmount
    }

    const outputCurrency = this.swaps[0].outputAmount.currency
    const totalOutputFromRoutes = this.swaps
      .map(({ outputAmount: routeOutputAmount }) => routeOutputAmount)
      .reduce((total, cur) => total.add(cur), CurrencyAmount.fromRawAmount(outputCurrency, 0))

    this._outputAmount = totalOutputFromRoutes
    return this._outputAmount
  }

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
  public get amounts(): {
    inputAmount: CurrencyAmount<TInput>
    inputAmountNative: CurrencyAmount<TInput> | undefined
    outputAmount: CurrencyAmount<TOutput>
    outputAmountNative: CurrencyAmount<TOutput> | undefined
  } {
    // Find native currencies for reduce below
    const inputNativeCurrency = this.swaps.find(({ inputAmount }) => inputAmount.currency.isNative)?.inputAmount
      .currency
    const outputNativeCurrency = this.swaps.find(({ outputAmount }) => outputAmount.currency.isNative)?.outputAmount
      .currency

    return {
      inputAmount: this.inputAmount,
      inputAmountNative: inputNativeCurrency
        ? this.swaps.reduce((total, swap) => {
            return swap.route.pathInput.isNative ? total.add(swap.inputAmount) : total
          }, CurrencyAmount.fromRawAmount(inputNativeCurrency, 0))
        : undefined,
      outputAmount: this.outputAmount,
      outputAmountNative: outputNativeCurrency
        ? this.swaps.reduce((total, swap) => {
            return swap.route.pathOutput.isNative ? total.add(swap.outputAmount) : total
          }, CurrencyAmount.fromRawAmount(outputNativeCurrency, 0))
        : undefined,
    }
  }

  public get numberOfInputWraps(): number {
    // if the trade's input is eth it may require a wrap
    if (this.inputAmount.currency.isNative) {
      return this.wethInputRoutes.length
    } else return 0
  }

  public get numberOfInputUnwraps(): number {
    // if the trade's input is weth, it may require an unwrap
    if (this.isWrappedNative(this.inputAmount.currency)) {
      return this.nativeInputRoutes.length
    } else return 0
  }

  public get nativeInputRoutes(): IRoute<TInput, TOutput, Pair | V3Pool | V4Pool>[] {
    if (this._nativeInputRoutes) {
      return this._nativeInputRoutes
    }

    this._nativeInputRoutes = this.routes.filter((route) => route.pathInput.isNative)
    return this._nativeInputRoutes
  }

  public get wethInputRoutes(): IRoute<TInput, TOutput, Pair | V3Pool | V4Pool>[] {
    if (this._wethInputRoutes) {
      return this._wethInputRoutes
    }

    this._wethInputRoutes = this.routes.filter((route) => this.isWrappedNative(route.pathInput))
    return this._wethInputRoutes
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
   * Returns the sell tax of the input token
   */
  public get inputTax(): Percent {
    const inputCurrency = this.inputAmount.currency
    if (inputCurrency.isNative || !inputCurrency.wrapped.sellFeeBps) return ZERO_PERCENT

    return new Percent(inputCurrency.wrapped.sellFeeBps.toNumber(), 10000)
  }

  /**
   * Returns the buy tax of the output token
   */
  public get outputTax(): Percent {
    const outputCurrency = this.outputAmount.currency
    if (outputCurrency.isNative || !outputCurrency.wrapped.buyFeeBps) return ZERO_PERCENT

    return new Percent(outputCurrency.wrapped.buyFeeBps.toNumber(), 10000)
  }

  private isWrappedNative(currency: Currency): boolean {
    const chainId = currency.chainId
    return currency.equals(Ether.onChain(chainId).wrapped)
  }

  /**
   * The cached result of the price impact computation
   * @private
   */
  private _priceImpact: Percent | undefined
  /**
   * Returns the percent difference between the route's mid price and the expected execution price
   * In order to exclude token taxes from the price impact calculation, the spot price is calculated
   * using a ratio of values that go into the pools, which are the post-tax input amount and pre-tax output amount.
   */
  public get priceImpact(): Percent {
    if (this._priceImpact) {
      return this._priceImpact
    }

    // returns 0% price impact even though this may be inaccurate as a swap may have occured.
    // because we're unable to derive the pre-buy-tax amount, use 0% as a placeholder.
    if (this.outputTax.equalTo(ONE_HUNDRED_PERCENT)) return ZERO_PERCENT

    let spotOutputAmount = CurrencyAmount.fromRawAmount(this.outputAmount.currency, 0)
    for (const { route, inputAmount } of this.swaps) {
      const midPrice = route.midPrice
      const postTaxInputAmount = inputAmount.multiply(new Fraction(ONE).subtract(this.inputTax))
      spotOutputAmount = spotOutputAmount.add(midPrice.quote(postTaxInputAmount))
    }

    // if the total output of this trade is 0, then most likely the post-tax input was also 0, and therefore this swap
    // does not move the pools' market price
    if (spotOutputAmount.equalTo(ZERO)) return ZERO_PERCENT

    const preTaxOutputAmount = this.outputAmount.divide(new Fraction(ONE).subtract(this.outputTax))
    const priceImpact = spotOutputAmount.subtract(preTaxOutputAmount).divide(spotOutputAmount)
    this._priceImpact = new Percent(priceImpact.numerator, priceImpact.denominator)

    return this._priceImpact
  }

  /**
   * Get the minimum amount that must be received from this trade for the given slippage tolerance
   * @param slippageTolerance The tolerance of unfavorable slippage from the execution price of this trade
   * @returns The amount out
   */
  public minimumAmountOut(slippageTolerance: Percent, amountOut = this.outputAmount): CurrencyAmount<TOutput> {
    invariant(!slippageTolerance.lessThan(ZERO), 'SLIPPAGE_TOLERANCE')
    if (this.tradeType === TradeType.EXACT_OUTPUT) {
      return amountOut
    } else {
      const slippageAdjustedAmountOut = new Fraction(ONE)
        .add(slippageTolerance)
        .invert()
        .multiply(amountOut.quotient).quotient
      return CurrencyAmount.fromRawAmount(amountOut.currency, slippageAdjustedAmountOut)
    }
  }

  /**
   * Get the maximum amount in that can be spent via this trade for the given slippage tolerance
   * @param slippageTolerance The tolerance of unfavorable slippage from the execution price of this trade
   * @returns The amount in
   */
  public maximumAmountIn(slippageTolerance: Percent, amountIn = this.inputAmount): CurrencyAmount<TInput> {
    invariant(!slippageTolerance.lessThan(ZERO), 'SLIPPAGE_TOLERANCE')
    if (this.tradeType === TradeType.EXACT_INPUT) {
      return amountIn
    } else {
      const slippageAdjustedAmountIn = new Fraction(ONE).add(slippageTolerance).multiply(amountIn.quotient).quotient
      return CurrencyAmount.fromRawAmount(amountIn.currency, slippageAdjustedAmountIn)
    }
  }

  /**
   * Return the execution price after accounting for slippage tolerance
   * @param slippageTolerance the allowed tolerated slippage
   * @returns The execution price
   */
  public worstExecutionPrice(slippageTolerance: Percent): Price<TInput, TOutput> {
    return new Price(
      this.inputAmount.currency,
      this.outputAmount.currency,
      this.maximumAmountIn(slippageTolerance).quotient,
      this.minimumAmountOut(slippageTolerance).quotient
    )
  }

  public static async fromRoutes<TInput extends Currency, TOutput extends Currency, TTradeType extends TradeType>(
    v2Routes: {
      routev2: V2RouteSDK<TInput, TOutput>
      amount: TTradeType extends TradeType.EXACT_INPUT ? CurrencyAmount<TInput> : CurrencyAmount<TOutput>
    }[],
    v3Routes: {
      routev3: V3RouteSDK<TInput, TOutput>
      amount: TTradeType extends TradeType.EXACT_INPUT ? CurrencyAmount<TInput> : CurrencyAmount<TOutput>
    }[],
    tradeType: TTradeType,
    mixedRoutes?: {
      mixedRoute: MixedRouteSDK<TInput, TOutput>
      amount: TTradeType extends TradeType.EXACT_INPUT ? CurrencyAmount<TInput> : CurrencyAmount<TOutput>
    }[],
    v4Routes?: {
      routev4: V4RouteSDK<TInput, TOutput>
      amount: TTradeType extends TradeType.EXACT_INPUT ? CurrencyAmount<TInput> : CurrencyAmount<TOutput>
    }[]
  ): Promise<Trade<TInput, TOutput, TTradeType>> {
    const populatedV2Routes: {
      routev2: V2RouteSDK<TInput, TOutput>
      inputAmount: CurrencyAmount<TInput>
      outputAmount: CurrencyAmount<TOutput>
    }[] = []

    const populatedV3Routes: {
      routev3: V3RouteSDK<TInput, TOutput>
      inputAmount: CurrencyAmount<TInput>
      outputAmount: CurrencyAmount<TOutput>
    }[] = []

    const populatedV4Routes: {
      routev4: V4RouteSDK<TInput, TOutput>
      inputAmount: CurrencyAmount<TInput>
      outputAmount: CurrencyAmount<TOutput>
    }[] = []

    const populatedMixedRoutes: {
      mixedRoute: MixedRouteSDK<TInput, TOutput>
      inputAmount: CurrencyAmount<TInput>
      outputAmount: CurrencyAmount<TOutput>
    }[] = []

    for (const { routev2, amount } of v2Routes) {
      const v2Trade = new V2TradeSDK(routev2, amount, tradeType)
      const { inputAmount, outputAmount } = v2Trade

      populatedV2Routes.push({
        routev2,
        inputAmount,
        outputAmount,
      })
    }

    for (const { routev3, amount } of v3Routes) {
      const v3Trade = await V3TradeSDK.fromRoute(routev3, amount, tradeType)
      const { inputAmount, outputAmount } = v3Trade

      populatedV3Routes.push({
        routev3,
        inputAmount,
        outputAmount,
      })
    }

    if (v4Routes) {
      for (const { routev4, amount } of v4Routes) {
        const v4Trade = await V4TradeSDK.fromRoute(routev4, amount, tradeType)
        const { inputAmount, outputAmount } = v4Trade

        populatedV4Routes.push({
          routev4,
          inputAmount,
          outputAmount,
        })
      }
    }

    if (mixedRoutes) {
      for (const { mixedRoute, amount } of mixedRoutes) {
        const mixedRouteTrade = await MixedRouteTradeSDK.fromRoute(mixedRoute, amount, tradeType)
        const { inputAmount, outputAmount } = mixedRouteTrade

        populatedMixedRoutes.push({
          mixedRoute,
          inputAmount,
          outputAmount,
        })
      }
    }

    return new Trade({
      v2Routes: populatedV2Routes,
      v3Routes: populatedV3Routes,
      v4Routes: populatedV4Routes,
      mixedRoutes: populatedMixedRoutes,
      tradeType,
    })
  }

  public static async fromRoute<TInput extends Currency, TOutput extends Currency, TTradeType extends TradeType>(
    route:
      | V2RouteSDK<TInput, TOutput>
      | V3RouteSDK<TInput, TOutput>
      | V4RouteSDK<TInput, TOutput>
      | MixedRouteSDK<TInput, TOutput>,
    amount: TTradeType extends TradeType.EXACT_INPUT ? CurrencyAmount<TInput> : CurrencyAmount<TOutput>,
    tradeType: TTradeType
  ): Promise<Trade<TInput, TOutput, TTradeType>> {
    let v2Routes: {
      routev2: V2RouteSDK<TInput, TOutput>
      inputAmount: CurrencyAmount<TInput>
      outputAmount: CurrencyAmount<TOutput>
    }[] = []

    let v3Routes: {
      routev3: V3RouteSDK<TInput, TOutput>
      inputAmount: CurrencyAmount<TInput>
      outputAmount: CurrencyAmount<TOutput>
    }[] = []

    let v4Routes: {
      routev4: V4RouteSDK<TInput, TOutput>
      inputAmount: CurrencyAmount<TInput>
      outputAmount: CurrencyAmount<TOutput>
    }[] = []

    let mixedRoutes: {
      mixedRoute: MixedRouteSDK<TInput, TOutput>
      inputAmount: CurrencyAmount<TInput>
      outputAmount: CurrencyAmount<TOutput>
    }[] = []

    if (route instanceof V2RouteSDK) {
      const v2Trade = new V2TradeSDK(route, amount, tradeType)
      const { inputAmount, outputAmount } = v2Trade
      v2Routes = [{ routev2: route, inputAmount, outputAmount }]
    } else if (route instanceof V3RouteSDK) {
      const v3Trade = await V3TradeSDK.fromRoute(route, amount, tradeType)
      const { inputAmount, outputAmount } = v3Trade
      v3Routes = [{ routev3: route, inputAmount, outputAmount }]
    } else if (route instanceof V4RouteSDK) {
      const v4Trade = await V4TradeSDK.fromRoute(route, amount, tradeType)
      const { inputAmount, outputAmount } = v4Trade
      v4Routes = [{ routev4: route, inputAmount, outputAmount }]
    } else if (route instanceof MixedRouteSDK) {
      const mixedRouteTrade = await MixedRouteTradeSDK.fromRoute(route, amount, tradeType)
      const { inputAmount, outputAmount } = mixedRouteTrade
      mixedRoutes = [{ mixedRoute: route, inputAmount, outputAmount }]
    } else {
      throw new Error('Invalid route type')
    }

    return new Trade({
      v2Routes,
      v3Routes,
      v4Routes,
      mixedRoutes,
      tradeType,
    })
  }
}
