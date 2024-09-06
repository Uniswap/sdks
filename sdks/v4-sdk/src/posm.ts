import {
  BigintIsh,
  Percent,
  CurrencyAmount,
  validateAndParseAddress,
  Currency,
  NativeCurrency,
} from '@uniswap/sdk-core'
import JSBI from 'jsbi'
import invariant from 'tiny-invariant'
import { Position } from './entities/position'
import { ONE, ZERO } from './internalConstants'
import { MethodParameters, toHex } from './utils/calldata'
import { Interface } from '@ethersproject/abi'
import { ADDRESS_ZERO } from './internalConstants'
import { Pool, PoolKey } from './entities'
import { Multicall } from './multicall'
import { ActionType, encodeAction } from './utils/actions'
import { MIN_SLIPPAGE_DECREASE } from './internalConstants'
import { abi } from './utils/abi'

export interface CommonOptions {
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
   * How much the pool price is allowed to move.
   */
  slippageTolerance: Percent

  /**
   * When the transaction expires, in epoch seconds.
   */
  deadline: BigintIsh
}

export interface MintSpecificOptions {
  /**
   * How much the pool price is allowed to move.
   */
  slippageTolerance: Percent
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
  token0Permit?: any

  /**
   * The optional permit parameters for spending token1
   */
  token1Permit?: any
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

export type MintOptions = CommonOptions & CommonAddLiquidityOptions & MintSpecificOptions
export type IncreaseOptions = CommonOptions & CommonAddLiquidityOptions & ModifyPositionSpecificOptions

export type DecreaseLiquidityOptions = CommonOptions & RemoveLiquiditySpecificOptions & ModifyPositionSpecificOptions
export type CollectOptions = CommonOptions & CollectSpecificOptions
export type AddLiquidityOptions = MintOptions | IncreaseOptions

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

// type guard
function isMint(options: AddLiquidityOptions): options is MintOptions {
  return Object.keys(options).some((k) => k === 'recipient')
}

export interface NFTPermitOptions {
  signature: string
  deadline: BigintIsh
  spender: string
  nonce: BigintIsh
}

export abstract class V4PositionManager {
  public static INTERFACE: Interface = new Interface(abi)

  /**
   * Cannot be constructed.
   */
  private constructor() {}

  public static collectCallParameters(options: CollectOptions): MethodParameters {
    const calldatas: string[] = V4PositionManager.encodeCollect(options)

    return {
      calldata: Multicall.encodeMulticall(calldatas),
      value: toHex(0),
    }
  }

  /**
   * Produces the calldata for completely or partially exiting a position
   * @param position The position to exit
   * @param options Additional information necessary for generating the calldata
   * @returns The call parameters
   */
  public static removeCallParameters(position: Position, options: DecreaseLiquidityOptions): MethodParameters {
    const calldatas: string[] = []

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
      calldatas.push(
        V4PositionManager.INTERFACE.encodeFunctionData('permit', [
          validateAndParseAddress(options.permit.spender),
          tokenId,
          toHex(options.permit.deadline),
          options.permit.nonce,
          options.permit.signature,
        ])
      )
    }

    // remove liquidity
    calldatas.push(
      V4PositionManager.encodeDecrease(
        tokenId,
        partialPosition.liquidity.toString(),
        amount0Min.toString(),
        amount1Min.toString(),
        options.hookData
      )
    )

    // Collect fees
    const { expectedCurrencyOwed0, expectedCurrencyOwed1, ...rest } = options.collectOptions
    calldatas.push(
      ...V4PositionManager.encodeCollect({
        tokenId: toHex(options.tokenId),
        // add the underlying value to the expected currency already owed
        expectedCurrencyOwed0: expectedCurrencyOwed0.add(
          CurrencyAmount.fromRawAmount(expectedCurrencyOwed0.currency, amount0Min)
        ),
        expectedCurrencyOwed1: expectedCurrencyOwed1.add(
          CurrencyAmount.fromRawAmount(expectedCurrencyOwed1.currency, amount1Min)
        ),
        ...rest,
      })
    )

    if (options.liquidityPercentage.equalTo(ONE)) {
      if (options.burnToken) {
        calldatas.push(V4PositionManager.encodeBurn(tokenId, amount0Min, amount1Min, options.hookData))
      }
    } else {
      invariant(options.burnToken !== true, 'CANNOT_BURN')
    }

    return {
      calldata: Multicall.encodeMulticall(calldatas),
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

  /**
   * ---- Private functions to encode calldata for different actions on the PositionManager contract -----
   */

  // Initialize a pool
  private static encodeInitializePool(poolKey: PoolKey, sqrtPriceX96: BigintIsh, hookData?: string): string {
    return V4PositionManager.INTERFACE.encodeFunctionData('initializePool', [
      poolKey,
      sqrtPriceX96.toString(),
      hookData ?? '0x',
    ])
  }

  // MINT_POSITION
  private static encodeMint(
    pool: Pool,
    tickLower: number,
    tickUpper: number,
    liquidity: BigintIsh,
    amount0Max: BigintIsh,
    amount1Max: BigintIsh,
    owner: string,
    hookData?: string
  ): string {
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
    return encodeAction(ActionType.MINT_POSITION, inputs).encodedInput
  }

  // INCREASE_LIQUIDITY
  private static encodeIncrease(
    tokenId: BigintIsh,
    liquidity: BigintIsh,
    amount0Max: BigintIsh,
    amount1Max: BigintIsh,
    hookData?: string
  ): string {
    const inputs = [
      tokenId.toString(),
      liquidity.toString(),
      amount0Max.toString(),
      amount1Max.toString(),
      hookData ?? '0x',
    ]
    return encodeAction(ActionType.INCREASE_LIQUIDITY, inputs).encodedInput
  }

  // DECREASE_LIQUIDITY
  private static encodeDecrease(
    tokenId: BigintIsh,
    liquidity: BigintIsh,
    amount0Min: BigintIsh,
    amount1Min: BigintIsh,
    hookData?: string
  ): string {
    const inputs = [
      tokenId.toString(),
      liquidity.toString(),
      amount0Min.toString(),
      amount1Min.toString(),
      hookData ?? '0x',
    ]
    return encodeAction(ActionType.DECREASE_LIQUIDITY, inputs).encodedInput
  }

  // BURN_POSITION
  private static encodeBurn(
    tokenId: BigintIsh,
    amount0Min: BigintIsh,
    amount1Min: BigintIsh,
    hookData?: string
  ): string {
    const inputs = [tokenId.toString(), amount0Min.toString(), amount1Min.toString(), hookData ?? '0x']
    return encodeAction(ActionType.BURN_POSITION, inputs).encodedInput
  }

  //   // TAKE
  //   private static encodeTake(currency: Currency, recipient: string, amount: BigintIsh): string {
  //     const inputs = [currency, recipient, amount.toString()]
  //     return encodeAction(ActionType.TAKE, inputs).encodedInput
  //   }

  //   // SETTLE
  //   private static encodeSettle(currency: Currency, amount: BigintIsh, payerIsUser: boolean): string {
  //     const inputs = [currency, amount.toString(), payerIsUser]
  //     return encodeAction(ActionType.SETTLE, inputs).encodedInput
  //   }

  // SETTLE_PAIR
  private static encodeSettlePair(currency0: Currency, currency1: Currency): string {
    const inputs = [currency0.wrapped.address, currency1.wrapped.address]
    return encodeAction(ActionType.SETTLE_PAIR, inputs).encodedInput
  }

  // TAKE_PAIR
  private static encodeTakePair(currency0: Currency, currency1: Currency, recipient: string): string {
    const inputs = [currency0.wrapped.address, currency1.wrapped.address, recipient]
    return encodeAction(ActionType.TAKE_PAIR, inputs).encodedInput
  }

  /**
   * Public methods to encode method parameters for different actions on the PositionManager contract
   */
  public static initializeCallParameters(
    poolKey: PoolKey,
    sqrtPriceX96: BigintIsh,
    hookData?: string
  ): MethodParameters {
    return {
      calldata: this.encodeInitializePool(poolKey, sqrtPriceX96, hookData),
      value: toHex(0),
    }
  }

  // INCREASE_LIQUIDITY / ADD_LIQUIDITY
  public static addCallParameters(position: Position, options: AddLiquidityOptions): MethodParameters {
    invariant(JSBI.greaterThan(position.liquidity, ZERO), 'ZERO_LIQUIDITY')

    const calldatas: string[] = []

    // get amounts
    // const { amount0: amount0Desired, amount1: amount1Desired } = position.mintAmounts

    // adjust for slippage
    const minimumAmounts = position.mintAmountsWithSlippage(options.slippageTolerance)
    const amount0Min = toHex(minimumAmounts.amount0)
    const amount1Min = toHex(minimumAmounts.amount1)

    // create pool if needed
    if (isMint(options) && options.createPool && options.sqrtPriceX96 !== undefined) {
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

      calldatas.push(
        V4PositionManager.encodeMint(
          position.pool,
          position.tickLower,
          position.tickUpper,
          position.liquidity,
          amount0Min,
          amount1Min,
          recipient,
          options.hookData
        )
      )
    } else {
      // increase
      calldatas.push(
        V4PositionManager.encodeIncrease(options.tokenId, position.liquidity, amount0Min, amount1Min, options.hookData)
      )
    }

    let value: string = toHex(0)

    if (options.useNative) {
      // TODO: handle if we are supplying native to pool as liquidity, and optionally refund leftover ETH
    }

    // need to settle when minting / adding liquidity
    calldatas.push(V4PositionManager.encodeSettlePair(position.pool.token0, position.pool.token1))

    return {
      calldata: Multicall.encodeMulticall(calldatas),
      value,
    }
  }

  // In V4, collecting earned fees is a decreaseLiquidity with 0 + TAKE_PAIR
  private static encodeCollect(options: CollectOptions): string[] {
    const calldatas: string[] = []

    const tokenId = toHex(options.tokenId)

    const involvesETH =
      options.expectedCurrencyOwed0.currency.isNative || options.expectedCurrencyOwed1.currency.isNative

    const recipient = validateAndParseAddress(options.recipient)

    // first, decrease liquidity by 0 to trigger fee collection
    calldatas.push(
      V4PositionManager.encodeDecrease(tokenId, 0, MIN_SLIPPAGE_DECREASE, MIN_SLIPPAGE_DECREASE, options.hookData)
    )

    // now take the fee using take pair
    calldatas.push(
      V4PositionManager.encodeTakePair(
        options.expectedCurrencyOwed0.currency,
        options.expectedCurrencyOwed1.currency,
        involvesETH ? ADDRESS_ZERO : recipient
      )
    )

    if (involvesETH) {
      // TODO: handle the case where we are collecting ETH
    }

    return calldatas
  }
}
