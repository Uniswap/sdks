import { Actions, V4Planner } from './v4Planner'
import { Pool } from '../entities'
import { BigintIsh, Currency } from '@uniswap/sdk-core'
import { toAddress } from '../utils/currencyMap'
import { EMPTY_BYTES } from '../internalConstants'

// A wrapper around V4Planner to help handle PositionManager actions
export class V4PositionPlanner extends V4Planner {
  // MINT_POSITION
  addMint(
    pool: Pool,
    tickLower: number,
    tickUpper: number,
    liquidity: BigintIsh,
    amount0Max: BigintIsh,
    amount1Max: BigintIsh,
    owner: string,
    hookData: string = EMPTY_BYTES
  ): void {
    const inputs = [
      Pool.getPoolKey(pool.currency0, pool.currency1, pool.fee, pool.tickSpacing, pool.hooks),
      tickLower,
      tickUpper,
      liquidity.toString(),
      amount0Max.toString(),
      amount1Max.toString(),
      owner,
      hookData,
    ]
    this.addAction(Actions.MINT_POSITION, inputs)
  }

  // INCREASE_LIQUIDITY
  addIncrease(
    tokenId: BigintIsh,
    liquidity: BigintIsh,
    amount0Max: BigintIsh,
    amount1Max: BigintIsh,
    hookData: string = EMPTY_BYTES
  ): void {
    const inputs = [tokenId.toString(), liquidity.toString(), amount0Max.toString(), amount1Max.toString(), hookData]
    this.addAction(Actions.INCREASE_LIQUIDITY, inputs)
  }

  // DECREASE_LIQUIDITY
  addDecrease(
    tokenId: BigintIsh,
    liquidity: BigintIsh,
    amount0Min: BigintIsh,
    amount1Min: BigintIsh,
    hookData: string = EMPTY_BYTES
  ): void {
    const inputs = [tokenId.toString(), liquidity.toString(), amount0Min.toString(), amount1Min.toString(), hookData]
    this.addAction(Actions.DECREASE_LIQUIDITY, inputs)
  }

  // BURN_POSITION
  addBurn(tokenId: BigintIsh, amount0Min: BigintIsh, amount1Min: BigintIsh, hookData: string = EMPTY_BYTES): void {
    const inputs = [tokenId.toString(), amount0Min.toString(), amount1Min.toString(), hookData]
    this.addAction(Actions.BURN_POSITION, inputs)
  }

  // SETTLE_PAIR
  addSettlePair(currency0: Currency, currency1: Currency): void {
    const inputs = [toAddress(currency0), toAddress(currency1)]
    this.addAction(Actions.SETTLE_PAIR, inputs)
  }

  // TAKE_PAIR
  addTakePair(currency0: Currency, currency1: Currency, recipient: string): void {
    const inputs = [toAddress(currency0), toAddress(currency1), recipient]
    this.addAction(Actions.TAKE_PAIR, inputs)
  }

  // SWEEP
  addSweep(currency: Currency, to: string): void {
    const inputs = [toAddress(currency), to]
    this.addAction(Actions.SWEEP, inputs)
  }
}
