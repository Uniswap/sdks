// entities/route.ts

import { Route as V2RouteSDK, Pair } from '@uniswap/v2-sdk'
import { Route as V3RouteSDK, Pool as V3Pool } from '@uniswap/v3-sdk'
import { Route as V4RouteSDK, Pool as V4Pool } from '@emag3m/v4-sdk'
import { Protocol } from './protocol'
import { Currency, Price, Token } from '@uniswap/sdk-core'
import { MixedRouteSDK } from './mixedRoute/route'

export interface IRoute<TInput extends Currency, TOutput extends Currency, TPool extends Pair | V3Pool | V4Pool> {
  protocol: Protocol
  // array of pools if v3 or pairs if v2
  pools: TPool[]
  path: Currency[]
  midPrice: Price<TInput, TOutput>
  input: TInput
  output: TOutput
}

// V2 route wrapper
export class RouteV2<TInput extends Currency, TOutput extends Currency>
  extends V2RouteSDK<TInput, TOutput>
  implements IRoute<TInput, TOutput, Pair>
{
  public readonly protocol: Protocol = Protocol.V2
  public readonly pools: Pair[]

  constructor(v2Route: V2RouteSDK<TInput, TOutput>) {
    super(v2Route.pairs, v2Route.input, v2Route.output)
    this.pools = this.pairs
  }
}

// V3 route wrapper
export class RouteV3<TInput extends Currency, TOutput extends Currency>
  extends V3RouteSDK<TInput, TOutput>
  implements IRoute<TInput, TOutput, V3Pool>
{
  public readonly protocol: Protocol = Protocol.V3
  public readonly path: Token[]

  constructor(v3Route: V3RouteSDK<TInput, TOutput>) {
    super(v3Route.pools, v3Route.input, v3Route.output)
    this.path = v3Route.tokenPath
  }
}

// V4 route wrapper
export class RouteV4<TInput extends Currency, TOutput extends Currency>
  extends V4RouteSDK<TInput, TOutput>
  implements IRoute<TInput, TOutput, V4Pool>
{
  public readonly protocol: Protocol = Protocol.V4
  public readonly path: Currency[]

  constructor(v4Route: V4RouteSDK<TInput, TOutput>) {
    super(v4Route.pools, v4Route.input, v4Route.output)
    this.path = v4Route.currencyPath
  }
}

// Mixed route wrapper
export class MixedRoute<TInput extends Currency, TOutput extends Currency>
  extends MixedRouteSDK<TInput, TOutput>
  implements IRoute<TInput, TOutput, V3Pool | Pair>
{
  public readonly protocol: Protocol = Protocol.MIXED

  constructor(mixedRoute: MixedRouteSDK<TInput, TOutput>) {
    super(mixedRoute.pools, mixedRoute.input, mixedRoute.output)
  }
}
