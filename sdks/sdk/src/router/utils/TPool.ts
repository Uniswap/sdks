import { Pool as V4Pool } from '../../v4'
import { Pair } from '../../v2'
import { Pool as V3Pool } from '../../v3'

export type TPool = Pair | V3Pool | V4Pool
