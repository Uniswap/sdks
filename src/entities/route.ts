import { Route as V2RouteSDK, Pair} from '@uniswap/v2-sdk'
import { Route as V3RouteSDK, Pool} from '@uniswap/v3-sdk'
import { Protocol } from './protocol'
import { Currency, Price, Token } from '@uniswap/sdk-core'


export interface IRoute<TInput extends Currency, TOutput extends Currency> {
    protocol: Protocol
    // array of pools if v3 or pairs if v2
    pools : Pool[] | Pair[]
    path : Token[]
    midPrice : Price<TInput, TOutput>

}

// v2 route wrapper
export class RouteV2<TInput extends Currency, TOutput extends Currency> extends V2RouteSDK<TInput, TOutput> implements IRoute<TInput, TOutput> {
    public readonly protocol: Protocol
    public readonly pools: Pair[]

    constructor(v2Route: V2RouteSDK<TInput, TOutput>) {
        super(v2Route.pairs, v2Route.input, v2Route.output)       
        this.pools = this.pairs
        this.protocol = Protocol.V2

    }

}

//v3 route wrapper
export class RouteV3<TInput extends Currency, TOutput extends Currency> extends V3RouteSDK<TInput, TOutput> implements IRoute<TInput, TOutput> {
    public readonly protocol: Protocol
    public readonly pools: Pool[]
    public readonly path: Token[]

    constructor(v3Route: V3RouteSDK<TInput, TOutput>) {
        super(v3Route.pools, v3Route.input, v3Route.output)
        this.pools = v3Route.pools
        this.protocol = Protocol.V3
        this.path = v3Route.tokenPath

    }

}
