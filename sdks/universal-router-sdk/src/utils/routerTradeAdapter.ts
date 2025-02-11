import { MixedRouteSDK, Trade as RouterTrade } from '@uniswap/router-sdk'
import { Currency, CurrencyAmount, Ether, Token, TradeType } from '@uniswap/sdk-core'
import { Pair, Route as V2Route } from '@uniswap/v2-sdk'
import { Pool as V3Pool, Route as V3Route, FeeAmount } from '@uniswap/v3-sdk'
import { Pool as V4Pool, Route as V4Route } from '@uniswap/v4-sdk'
import { BigNumber } from 'ethers'
import { ETH_ADDRESS, E_ETH_ADDRESS } from './constants'

export type TokenInRoute = {
  address: string
  chainId: number
  symbol: string
  decimals: string
  name?: string
  buyFeeBps?: string
  sellFeeBps?: string
}

export enum PoolType {
  V2Pool = 'v2-pool',
  V3Pool = 'v3-pool',
  V4Pool = 'v4-pool',
}

export type V2Reserve = {
  token: TokenInRoute
  quotient: string
}

export type V2PoolInRoute = {
  type: PoolType.V2Pool
  address?: string
  tokenIn: TokenInRoute
  tokenOut: TokenInRoute
  reserve0: V2Reserve
  reserve1: V2Reserve
  amountIn?: string
  amountOut?: string
}

export type V3PoolInRoute = {
  type: PoolType.V3Pool
  address?: string
  tokenIn: TokenInRoute
  tokenOut: TokenInRoute
  sqrtRatioX96: string
  liquidity: string
  tickCurrent: string
  fee: string
  amountIn?: string
  amountOut?: string
}

export type V4PoolInRoute = {
  type: PoolType.V4Pool
  address?: string
  tokenIn: TokenInRoute
  tokenOut: TokenInRoute
  fee: string
  tickSpacing: string
  hooks: string
  liquidity: string
  sqrtRatioX96: string
  tickCurrent: string
  amountIn?: string
  amountOut?: string
}

export type PartialClassicQuote = {
  // We need tokenIn/Out to support native currency
  tokenIn: string
  tokenOut: string
  tradeType: TradeType
  route: Array<(V4PoolInRoute | V3PoolInRoute | V2PoolInRoute)[]>
}

interface RouteResult {
  routev4: V4Route<Currency, Currency> | null
  routev3: V3Route<Currency, Currency> | null
  routev2: V2Route<Currency, Currency> | null
  mixedRoute: MixedRouteSDK<Currency, Currency> | null
  inputAmount: CurrencyAmount<Currency>
  outputAmount: CurrencyAmount<Currency>
}

export const isNativeCurrency = (address: string) =>
  address.toLowerCase() === ETH_ADDRESS.toLowerCase() || address.toLowerCase() === E_ETH_ADDRESS.toLowerCase()

// Helper class to convert routing-specific quote entities to RouterTrade entities
// the returned RouterTrade can then be used to build the UniswapTrade entity in this package
export class RouterTradeAdapter {
  // Generate a RouterTrade using fields from a classic quote response
  static fromClassicQuote(quote: PartialClassicQuote) {
    const { route, tokenIn, tokenOut } = quote

    if (!route) throw new Error('Expected route to be present')
    if (!route.length) throw new Error('Expected there to be at least one route')
    if (route.some((r) => !r.length)) throw new Error('Expected all routes to have at least one pool')
    const firstRoute = route[0]

    const tokenInData = firstRoute[0].tokenIn
    const tokenOutData = firstRoute[firstRoute.length - 1].tokenOut

    if (!tokenInData || !tokenOutData) throw new Error('Expected both tokenIn and tokenOut to be present')
    if (tokenInData.chainId !== tokenOutData.chainId)
      throw new Error('Expected tokenIn and tokenOut to be have same chainId')

    const parsedCurrencyIn = RouterTradeAdapter.toCurrency(isNativeCurrency(tokenIn), tokenInData)
    const parsedCurrencyOut = RouterTradeAdapter.toCurrency(isNativeCurrency(tokenOut), tokenOutData)

    const typedRoutes: RouteResult[] = route.map((subRoute) => {
      const rawAmountIn = subRoute[0].amountIn
      const rawAmountOut = subRoute[subRoute.length - 1].amountOut

      if (!rawAmountIn || !rawAmountOut) {
        throw new Error('Expected both raw amountIn and raw amountOut to be present')
      }

      const inputAmount = CurrencyAmount.fromRawAmount(parsedCurrencyIn, rawAmountIn)
      const outputAmount = CurrencyAmount.fromRawAmount(parsedCurrencyOut, rawAmountOut)

      const isOnlyV2 = RouterTradeAdapter.isVersionedRoute<V2PoolInRoute>(PoolType.V2Pool, subRoute)
      const isOnlyV3 = RouterTradeAdapter.isVersionedRoute<V3PoolInRoute>(PoolType.V3Pool, subRoute)
      const isOnlyV4 = RouterTradeAdapter.isVersionedRoute<V4PoolInRoute>(PoolType.V4Pool, subRoute)
      return {
        routev4: isOnlyV4
          ? new V4Route(
              (subRoute as V4PoolInRoute[]).map(RouterTradeAdapter.toV4Pool),
              parsedCurrencyIn,
              parsedCurrencyOut
            )
          : null,
        routev3: isOnlyV3
          ? new V3Route(
              (subRoute as V3PoolInRoute[]).map(RouterTradeAdapter.toV3Pool),
              parsedCurrencyIn,
              parsedCurrencyOut
            )
          : null,
        routev2: isOnlyV2
          ? new V2Route(
              (subRoute as V2PoolInRoute[]).map(RouterTradeAdapter.toPair),
              parsedCurrencyIn,
              parsedCurrencyOut
            )
          : null,
        mixedRoute:
          !isOnlyV4 && !isOnlyV3 && !isOnlyV2
            ? new MixedRouteSDK(subRoute.map(RouterTradeAdapter.toPoolOrPair), parsedCurrencyIn, parsedCurrencyOut)
            : null,
        inputAmount,
        outputAmount,
      }
    })

    return new RouterTrade({
      v2Routes: typedRoutes
        .filter((route) => route.routev2)
        .map((route) => ({
          routev2: route.routev2 as V2Route<Currency, Currency>,
          inputAmount: route.inputAmount,
          outputAmount: route.outputAmount,
        })),
      v3Routes: typedRoutes
        .filter((route) => route.routev3)
        .map((route) => ({
          routev3: route.routev3 as V3Route<Currency, Currency>,
          inputAmount: route.inputAmount,
          outputAmount: route.outputAmount,
        })),
      v4Routes: typedRoutes
        .filter((route) => route.routev4)
        .map((route) => ({
          routev4: route.routev4 as V4Route<Currency, Currency>,
          inputAmount: route.inputAmount,
          outputAmount: route.outputAmount,
        })),
      mixedRoutes: typedRoutes
        .filter((route) => route.mixedRoute)
        .map((route) => ({
          mixedRoute: route.mixedRoute as MixedRouteSDK<Currency, Currency>,
          inputAmount: route.inputAmount,
          outputAmount: route.outputAmount,
        })),
      tradeType: quote.tradeType,
    })
  }

  private static toCurrency(isNative: boolean, token: TokenInRoute): Currency {
    if (isNative) {
      return Ether.onChain(token.chainId)
    }
    return this.toToken(token)
  }

  private static toPoolOrPair = (pool: V4PoolInRoute | V3PoolInRoute | V2PoolInRoute): V4Pool | V3Pool | Pair => {
    switch (pool.type) {
      case PoolType.V4Pool:
        return RouterTradeAdapter.toV4Pool(pool)
      case PoolType.V3Pool:
        return RouterTradeAdapter.toV3Pool(pool)
      case PoolType.V2Pool:
        return RouterTradeAdapter.toPair(pool)
      default:
        throw new Error('Invalid pool type')
    }
  }

  private static toToken(token: TokenInRoute): Token {
    const { chainId, address, decimals, symbol, buyFeeBps, sellFeeBps } = token
    return new Token(
      chainId,
      address,
      parseInt(decimals.toString()),
      symbol,
      /* name */ undefined,
      false,
      buyFeeBps ? BigNumber.from(buyFeeBps) : undefined,
      sellFeeBps ? BigNumber.from(sellFeeBps) : undefined
    )
  }

  private static toV3Pool({ fee, sqrtRatioX96, liquidity, tickCurrent, tokenIn, tokenOut }: V3PoolInRoute): V3Pool {
    return new V3Pool(
      RouterTradeAdapter.toToken(tokenIn),
      RouterTradeAdapter.toToken(tokenOut),
      parseInt(fee) as FeeAmount,
      sqrtRatioX96,
      liquidity,
      parseInt(tickCurrent)
    )
  }

  private static toV4Pool(pool: V4PoolInRoute): V4Pool {
    const parsedCurrencyIn = RouterTradeAdapter.toCurrency(isNativeCurrency(pool.tokenIn.address), pool.tokenIn)
    const parsedCurrencyOut = RouterTradeAdapter.toCurrency(isNativeCurrency(pool.tokenOut.address), pool.tokenOut)
    return new V4Pool(
      parsedCurrencyIn,
      parsedCurrencyOut,
      parseInt(pool.fee) as FeeAmount,
      parseInt(pool.tickSpacing),
      pool.hooks,
      pool.sqrtRatioX96,
      pool.liquidity,
      parseInt(pool.tickCurrent)
    )
  }

  private static toPair = ({ reserve0, reserve1 }: V2PoolInRoute): Pair => {
    return new Pair(
      CurrencyAmount.fromRawAmount(RouterTradeAdapter.toToken(reserve0.token), reserve0.quotient),
      CurrencyAmount.fromRawAmount(RouterTradeAdapter.toToken(reserve1.token), reserve1.quotient)
    )
  }

  private static isVersionedRoute<T extends V2PoolInRoute | V3PoolInRoute | V4PoolInRoute>(
    type: PoolType,
    route: (V3PoolInRoute | V2PoolInRoute | V4PoolInRoute)[]
  ): route is T[] {
    return route.every((pool) => pool.type === type)
  }
}
