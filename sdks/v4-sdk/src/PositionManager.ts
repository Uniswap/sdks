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
import { Interface } from '@ethersproject/abi'
import { Pool, PoolKey } from './entities'
import { Multicall } from './multicall'
import invariant from 'tiny-invariant'
import { MIN_SLIPPAGE_DECREASE, ONE, ZERO } from './internalConstants'
import { Actions, V4Planner } from './utils'

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
   * Whether to spend ether. If true, one of the pool tokens must be WETH, by default false
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

export abstract class V4PositionManager {
  public static INTERFACE: Interface = new Interface([])

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

  public static addCallParameters(position: Position, options: AddLiquidityOptions): MethodParameters {
    /**
     * Cases:
     * - if pool does not exist yet, encode initializePool
     * then,
     * - if is mint, encode MINT_POSITION and then SETTLE_PAIR
     * - else, encode INCREASE_LIQUIDITY and then SETTLE_PAIR
     */
    invariant(JSBI.greaterThan(position.liquidity, ZERO), 'ZERO_LIQUIDITY')

    const calldatas: string[] = []
    const planner = new V4Planner()

    // get amounts
    // const { amount0: amount0Desired, amount1: amount1Desired } = position.mintAmounts

    // adjust for slippage
    const minimumAmounts = position.mintAmountsWithSlippage(options.slippageTolerance)
    const amount0Min = toHex(minimumAmounts.amount0)
    const amount1Min = toHex(minimumAmounts.amount1)

    // create pool if needed
    if (isMint(options) && options.createPool && options.sqrtPriceX96 !== undefined) {
      // No planner used here because initializePool is not supported as an Action
      calldatas.push(
        V4PositionManager.encodeInitializePool(position.pool.poolKey, options.sqrtPriceX96, options.hookData)
      )
    }

    // permits if necessary
    if (options.token0Permit && !position.pool.token0.isNative) {
      // TODO: add permit2 permit forwarding support
    }
    if (options.token1Permit && !position.pool.token1.isNative) {
      // TODO: add permit2 permit forwarding support
    }

    // mint
    if (isMint(options)) {
      const recipient: string = validateAndParseAddress(options.recipient)

      V4PositionManager.encodeMint(
        planner,
        position.pool,
        position.tickLower,
        position.tickUpper,
        position.liquidity,
        amount0Min,
        amount1Min,
        recipient,
        options.hookData
      )
    } else {
      // increase
      V4PositionManager.encodeIncrease(
        planner,
        options.tokenId,
        position.liquidity,
        amount0Min,
        amount1Min,
        options.hookData
      )
    }

    let value: string = toHex(0)

    if (options.useNative) {
      // TODO: handle if we are supplying native to pool as liquidity, and optionally refund leftover ETH
    }

    // need to settle when minting / adding liquidity
    V4PositionManager.encodeSettlePair(planner, position.pool.token0, position.pool.token1)

    calldatas.push(planner.finalize())

    return {
      calldata: Multicall.encodeMulticall(calldatas),
      value,
    }
  }

  /**
   * Produces the calldata for completely or partially exiting a position
   * @param position The position to exit
   * @param options Additional information necessary for generating the calldata
   * @returns The call parameters
   */
  public static removeCallParameters(position: Position, options: RemoveLiquidityOptions): MethodParameters {
    /**
     * cases:
     * - if liquidityPercentage is 100%, encode BURN_POSITION and then TAKE_PAIR
     * - else, encode DECREASE_LIQUIDITY and then TAKE_PAIR
     */
    const calldatas: string[] = []
    const planner = new V4Planner()

    // const deadline = toHex(options.deadline) // TODO?
    const tokenId = toHex(options.tokenId)

    // construct a partial position with a percentage of liquidity
    const partialPosition = new Position({
      pool: position.pool,
      liquidity: options.liquidityPercentage.multiply(position.liquidity).quotient,
      tickLower: position.tickLower,
      tickUpper: position.tickUpper,
    })
    invariant(JSBI.greaterThan(partialPosition.liquidity, ZERO), 'ZERO_LIQUIDITY')

    // slippage-adjusted underlying amounts
    const { amount0: amount0Min, amount1: amount1Min } = partialPosition.burnAmountsWithSlippage(
      options.slippageTolerance
    )

    if (options.permit) {
      // TODO: support ERC721Permit
    }

    // remove liquidity
    V4PositionManager.encodeDecrease(
      planner,
      tokenId,
      partialPosition.liquidity.toString(),
      amount0Min.toString(),
      amount1Min.toString(),
      options.hookData
    )

    // Collect fees
    const { expectedCurrencyOwed0, expectedCurrencyOwed1, recipient } = options.collectOptions

    // now take the collected fees using take pair
    V4PositionManager.encodeTakePair(planner, expectedCurrencyOwed0.currency, expectedCurrencyOwed1.currency, recipient)

    if (options.liquidityPercentage.equalTo(ONE)) {
      if (options.burnToken) {
        V4PositionManager.encodeBurn(planner, tokenId, amount0Min, amount1Min, options.hookData)
      }
    } else {
      invariant(options.burnToken !== true, 'CANNOT_BURN')
    }

    return {
      calldata: Multicall.encodeMulticall(calldatas),
      value: toHex(0),
    }
  }

  public static collectCallParameters(options: CollectOptions): MethodParameters {
    /**
     * Collecting in V4 is just a DECREASE_LIQUIDITY with 0 liquidity and then a TAKE_PAIR
     */
    const planner = new V4Planner()
    const tokenId = toHex(options.tokenId)

    const recipient = validateAndParseAddress(options.recipient)

    // first, decrease liquidity by 0 to trigger fee collection
    V4PositionManager.encodeDecrease(
      planner,
      tokenId,
      0,
      MIN_SLIPPAGE_DECREASE,
      MIN_SLIPPAGE_DECREASE,
      options.hookData
    )

    // now take the fee using take pair
    V4PositionManager.encodeTakePair(
      planner,
      options.expectedCurrencyOwed0.currency,
      options.expectedCurrencyOwed1.currency,
      recipient // TODO: do we need to special case when ETH is involved?
    )

    return {
      calldata: Multicall.encodeMulticall(planner.finalize()),
      value: toHex(0),
    }
  }

  public static transferFromParameters(options: TransferOptions): MethodParameters {
    const recipient = validateAndParseAddress(options.recipient)
    const sender = validateAndParseAddress(options.sender)

    let calldata: string
    calldata = V4PositionManager.INTERFACE.encodeFunctionData('transferFrom(address,address,uint256)', [
      sender,
      recipient,
      toHex(options.tokenId),
    ])
    return {
      calldata: calldata,
      value: toHex(0),
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

  /**
   * ---- Private functions to encode calldata for different actions on the PositionManager contract -----
   */

  // MINT_POSITION
  private static encodeMint(
    planner: V4Planner,
    pool: Pool,
    tickLower: number,
    tickUpper: number,
    liquidity: BigintIsh,
    amount0Max: BigintIsh,
    amount1Max: BigintIsh,
    owner: string,
    hookData?: string
  ): void {
    const inputs = [
      Pool.getPoolKey(pool.currency0, pool.currency1, pool.fee, pool.tickSpacing, pool.hooks),
      tickLower,
      tickUpper,
      liquidity.toString(),
      amount0Max.toString(),
      amount1Max.toString(),
      owner,
      hookData ?? '0x',
    ]
    planner.addAction(Actions.MINT_POSITION, inputs)
  }

  // INCREASE_LIQUIDITY
  private static encodeIncrease(
    planner: V4Planner,
    tokenId: BigintIsh,
    liquidity: BigintIsh,
    amount0Max: BigintIsh,
    amount1Max: BigintIsh,
    hookData?: string
  ): void {
    const inputs = [
      tokenId.toString(),
      liquidity.toString(),
      amount0Max.toString(),
      amount1Max.toString(),
      hookData ?? '0x',
    ]
    planner.addAction(Actions.INCREASE_LIQUIDITY, inputs)
  }

  // DECREASE_LIQUIDITY
  private static encodeDecrease(
    planner: V4Planner,
    tokenId: BigintIsh,
    liquidity: BigintIsh,
    amount0Min: BigintIsh,
    amount1Min: BigintIsh,
    hookData?: string
  ): void {
    const inputs = [
      tokenId.toString(),
      liquidity.toString(),
      amount0Min.toString(),
      amount1Min.toString(),
      hookData ?? '0x',
    ]
    planner.addAction(Actions.DECREASE_LIQUIDITY, inputs)
  }

  // BURN_POSITION
  private static encodeBurn(
    planner: V4Planner,
    tokenId: BigintIsh,
    amount0Min: BigintIsh,
    amount1Min: BigintIsh,
    hookData?: string
  ): void {
    const inputs = [tokenId.toString(), amount0Min.toString(), amount1Min.toString(), hookData ?? '0x']
    planner.addAction(Actions.BURN_POSITION, inputs)
  }

  // SETTLE_PAIR
  private static encodeSettlePair(planner: V4Planner, currency0: Currency, currency1: Currency): void {
    const inputs = [currency0.wrapped.address, currency1.wrapped.address]
    planner.addAction(Actions.SETTLE_PAIR, inputs)
  }

  // TAKE_PAIR
  private static encodeTakePair(planner: V4Planner, currency0: Currency, currency1: Currency, recipient: string): void {
    const inputs = [currency0.wrapped.address, currency1.wrapped.address, recipient]
    planner.addAction(Actions.TAKE_PAIR, inputs)
  }
}
