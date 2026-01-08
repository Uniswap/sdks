import { Pool as V4Pool } from '@uniswap/v4-sdk'
import { Pair } from '@uniswap/v2-sdk'
import { Pool as V3Pool } from '@uniswap/v3-sdk'

export type TPool = Pair | V3Pool | V4Pool
