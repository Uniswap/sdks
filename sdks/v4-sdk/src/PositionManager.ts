import {
  BigintIsh,
  Percent,
  CurrencyAmount,
  validateAndParseAddress,
  Currency,
  NativeCurrency,
} from '@uniswap/sdk-core'
import JSBI from 'jsbi'
import { Position } from './entities/position'
import { MethodParameters, toHex } from './utils/calldata'
import { MSG_SENDER } from './actionConstants'
import { Interface } from '@ethersproject/abi'
import { PoolKey } from './entities'
import { Multicall } from './multicall'
import invariant from 'tiny-invariant'
import { ZERO } from './internalConstants'
import { V4PositionPlanner } from './utils'
import { abi } from './utils/abi'

export interface CommonOptions {
  /**
   * How much the pool price is allowed to move from the specified action.
   */
  slippageTolerance: Percent
  /**
   * Optional data to pass to hooks
   */
  hookData?: string
}

export interface ModifyPositionSpecificOptions {
  /**
   * Indicates the ID of the position to increase liquidity for.
   */
  tokenId: BigintIsh

  /**
   * When the transaction expires, in epoch seconds.
   */
  deadline: BigintIsh
}

export interface MintSpecificOptions {
  /**
   * The account that should receive the minted NFT.
   */
  recipient: string

  /**
   * Creates pool if not initialized before mint.
   */
  createPool?: boolean

  /**
   * Initial price to set on the pool if creating
   */
  sqrtPriceX96?: BigintIsh
}

/**
 * Options for producing the calldata to add liquidity.
 */
export interface CommonAddLiquidityOptions {
  /**
   * Whether to spend ether. If true, one of the currencies must be the NATIVE currency.
   */
  useNative?: NativeCurrency

  /**
   * The optional permit parameters for spending token0
   */
  token0Permit?: any // TODO: add permit2 permit type here

  /**
   * The optional permit parameters for spending token1
   */
  token1Permit?: any // TODO: add permit2 permit type here
}

/**
 * Options for producing the calldata to exit a position.
 */
export interface RemoveLiquiditySpecificOptions {
  /**
   * The percentage of position liquidity to exit.
   */
  liquidityPercentage: Percent

  /**
   * Whether the NFT should be burned if the entire position is being exited, by default false.
   */
  burnToken?: boolean

  /**
   * The optional permit of the token ID being exited, in case the exit transaction is being sent by an account that does not own the NFT
   */
  permit?: NFTPermitOptions

  /**
   * Parameters to be passed on to collect
   */
  collectOptions: Omit<CollectSpecificOptions, 'tokenId'>
}

export interface CollectSpecificOptions {
  /**
   * Indicates the ID of the position to collect for.
   */
  tokenId: BigintIsh

  /**
   * Expected value of tokensOwed0, including as-of-yet-unaccounted-for fees/liquidity value to be burned
   */
  expectedCurrencyOwed0: CurrencyAmount<Currency>

  /**
   * Expected value of tokensOwed1, including as-of-yet-unaccounted-for fees/liquidity value to be burned
   */
  expectedCurrencyOwed1: CurrencyAmount<Currency>

  /**
   * The account that should receive the tokens.
   */
  recipient: string
}

export interface TransferOptions {
  /**
   * The account sending the NFT.
   */
  sender: string

  /**
   * The account that should receive the NFT.
   */
  recipient: string

  /**
   * The id of the token being sent.
   */
  tokenId: BigintIsh
}

export interface NFTPermitOptions {
  signature: string
  deadline: BigintIsh
  spender: string
  nonce: BigintIsh
}

export type MintOptions = CommonOptions & CommonAddLiquidityOptions & MintSpecificOptions
export type IncreaseLiquidityOptions = CommonOptions & CommonAddLiquidityOptions & ModifyPositionSpecificOptions

export type AddLiquidityOptions = MintOptions | IncreaseLiquidityOptions

export type RemoveLiquidityOptions = CommonOptions & RemoveLiquiditySpecificOptions & ModifyPositionSpecificOptions

export type CollectOptions = CommonOptions & CollectSpecificOptions

// type guard
function isMint(options: AddLiquidityOptions): options is MintOptions {
  return Object.keys(options).some((k) => k === 'recipient')
}

function shouldCreatePool(options: MintOptions): boolean {
  return options.createPool === true && options.sqrtPriceX96 !== undefined
}

export abstract class V4PositionManager {
  public static INTERFACE: Interface = new Interface(abi)

  /**
   * Cannot be constructed.
   */
  private constructor() {}

  /**
   * Public methods to encode method parameters for different actions on the PositionManager contract
   */
  public static createCallParameters(poolKey: PoolKey, sqrtPriceX96: BigintIsh, hookData?: string): MethodParameters {
    return {
      calldata: this.encodeInitializePool(poolKey, sqrtPriceX96, hookData),
      value: toHex(0),
    }
  }

  // TODO: Add Support for permit2 batch forwarding
  public static addCallParameters(position: Position, options: AddLiquidityOptions): MethodParameters {
    /**
     * Cases:
     * - if pool does not exist yet, encode initializePool
     * then,
     * - if is mint, encode MINT_POSITION. If it is on a NATIVE pool, encode a SWEEP. Finally encode a SETTLE_PAIR
     * - else, encode INCREASE_LIQUIDITY. If it is on a NATIVE pool, encode a SWEEP. Finally encode a SETTLE_PAIR
     */
    invariant(JSBI.greaterThan(position.liquidity, ZERO), 'ZERO_LIQUIDITY')

    const calldatas: string[] = []
    const planner = new V4PositionPlanner()

    const isMintAction = isMint(options)

    // Encode initialize pool.
    if (isMintAction && shouldCreatePool(options)) {
      // No planner used here because initializePool is not supported as an Action
      calldatas.push(
        V4PositionManager.encodeInitializePool(position.pool.poolKey, options.sqrtPriceX96!, options.hookData)
      )
    }

    // adjust for slippage
    const maximumAmounts = position.mintAmountsWithSlippage(options.slippageTolerance)
    const amount0Max = toHex(maximumAmounts.amount0)
    const amount1Max = toHex(maximumAmounts.amount1)

    // mint
    if (isMintAction) {
      const recipient: string = validateAndParseAddress(options.recipient)
      planner.addMint(
        position.pool,
        position.tickLower,
        position.tickUpper,
        position.liquidity,
        amount0Max,
        amount1Max,
        recipient,
        options.hookData
      )
    } else {
      // increase
      planner.addIncrease(options.tokenId, position.liquidity, amount0Max, amount1Max, options.hookData)
    }

    let value: string = toHex(0)
    if (options.useNative) {
      invariant(position.pool.currency0.isNative || position.pool.currency1.isNative, 'NO_NATIVE')
      let nativeCurrency: Currency = position.pool.currency0.isNative
        ? position.pool.currency0
        : position.pool.currency1
      value = position.pool.currency0.isNative ? toHex(amount0Max) : toHex(amount1Max)
      planner.addSweep(nativeCurrency, MSG_SENDER)
    }

    // need to settle both currencies when minting / adding liquidity
    planner.addSettlePair(position.pool.token0, position.pool.token1)

    calldatas.push(planner.finalize())

    return {
      calldata: Multicall.encodeMulticall(calldatas),
      value,
    }
  }

  // Initialize a pool
  private static encodeInitializePool(poolKey: PoolKey, sqrtPriceX96: BigintIsh, hookData?: string): string {
    return V4PositionManager.INTERFACE.encodeFunctionData('initializePool', [
      poolKey,
      sqrtPriceX96.toString(),
      hookData ?? '0x',
    ])
  }
}
