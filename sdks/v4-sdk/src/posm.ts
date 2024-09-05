import {
  BigintIsh,
  Percent,
  Token,
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
import { PermitOptions, SelfPermit } from './selfPermit'
import { ADDRESS_ZERO } from './constants'
import { Pool, PoolKey } from './entities'
import { Multicall } from './multicall'
import { Payments } from './payments'
import { ActionType, encodeAction } from './utils/actions'

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
     * The account that should receive the minted NFT.
     */
    recipient: string
  
    /**
     * Creates pool if not initialized before mint.
     */
    createPool?: boolean
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
    token0Permit?: PermitOptions
  
    /**
     * The optional permit parameters for spending token1
     */
    token1Permit?: PermitOptions
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
        collectOptions: Omit<CollectOptions, 'tokenId'>
      }
  
  export type MintOptions = CommonOptions & CommonAddLiquidityOptions & MintSpecificOptions
  export type IncreaseOptions = CommonOptions & CommonAddLiquidityOptions & ModifyPositionSpecificOptions

  export type DecreaseLiquidityOptions = CommonOptions & RemoveLiquiditySpecificOptions & ModifyPositionSpecificOptions
  export type AddLiquidityOptions = MintOptions | IncreaseOptions
  
  export interface SafeTransferOptions {
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
    /**
     * The optional parameter that passes data to the `onERC721Received` call for the staker
     */
    data?: string
  }
  
  // type guard
  function isMint(options: AddLiquidityOptions): options is MintOptions {
    return Object.keys(options).some((k) => k === 'recipient')
  }
  
  export interface CollectOptions {
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
  
  export interface NFTPermitOptions {
    v: 0 | 1 | 27 | 28
    r: string
    s: string
    deadline: BigintIsh
    spender: string
  }

export abstract class NonfungiblePositionManager {
  public static INTERFACE: Interface = new Interface(INonfungiblePositionManager.abi)

  /**
   * Cannot be constructed.
   */
  private constructor() {}

  /**
   * Functions to encode calldata for different actions on the PositionManager contract
   */

  // Initialize a pool
  private static encodeInitializePool(poolKey: PoolKey, sqrtPriceX96: BigintIsh, hookData?: string): string {
    return NonfungiblePositionManager.INTERFACE.encodeFunctionData('initializePool', [poolKey, sqrtPriceX96, hookData])
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
      [
        Pool.getPoolKey(pool.currency0, pool.currency1, pool.fee, pool.tickSpacing, pool.hooks),
        tickLower,
        tickUpper,
        liquidity,
        amount0Max,
        amount1Max,
        owner,
        hookData,
      ],
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
    const inputs = [[tokenId, liquidity, amount0Max, amount1Max, hookData]]
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
    const inputs = [[tokenId, liquidity, amount0Min, amount1Min, hookData]]
    return encodeAction(ActionType.DECREASE_LIQUIDITY, inputs).encodedInput
  }

  // BURN_POSITION
  private static encodeBurn(
    tokenId: BigintIsh,
    amount0Min: BigintIsh,
    amount1Min: BigintIsh,
    hookData?: string
  ): string {
    const inputs = [[tokenId, amount0Min, amount1Min, hookData]]
    return encodeAction(ActionType.BURN_POSITION, inputs).encodedInput
  }

  // TAKE
  private static encodeTake(
    currency: Currency,
    recipient: string,
    amount: BigintIsh
  ): string {
    const inputs = [[currency, recipient, amount]]
    return encodeAction(ActionType.TAKE, inputs).encodedInput
  }

  // SETTLE 
  private static encodeSettle(
    currency: Currency,
    amount: BigintIsh,
    payerIsUser: boolean
  ): string {
    const inputs = [[currency, amount, payerIsUser]]
    return encodeAction(ActionType.SETTLE, inputs).encodedInput
  }

  // TAKE_PAIR 
  private static encodeTakePair(
    currency0: Currency,
    currency1: Currency,
    recipient: string
  ): string {
    const inputs = [[currency0, currency1, recipient]]
    return encodeAction(ActionType.TAKE_PAIR, inputs).encodedInput
  }

  /**
   * Public methods to encode method parameters for different actions on the PositionManager contract
   */
  public static initializeCallParameters(poolKey: PoolKey, sqrtPriceX96: BigintIsh, hookData?: string): MethodParameters {
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
    const { amount0: amount0Desired, amount1: amount1Desired } = position.mintAmounts

    // adjust for slippage
    const minimumAmounts = position.mintAmountsWithSlippage(options.slippageTolerance)
    const amount0Min = toHex(minimumAmounts.amount0)
    const amount1Min = toHex(minimumAmounts.amount1)

    const deadline = toHex(options.deadline)

    // create pool if needed
    if (isMint(options) && options.createPool) {
      calldatas.push(this.encodeInitializePool(position.pool, position.sqrtPriceX96, options.hookData))
    }

    // permits if necessary
    if (options.token0Permit) {
      calldatas.push(SelfPermit.encodePermit(position.pool.token0, options.token0Permit))
    }
    if (options.token1Permit) {
      calldatas.push(SelfPermit.encodePermit(position.pool.token1, options.token1Permit))
    }

    // mint
    if (isMint(options)) {
      const recipient: string = validateAndParseAddress(options.recipient)

      calldatas.push(
        NonfungiblePositionManager.encodeMint(position.pool, position.tickLower, position.tickUpper, position.liquidity, amount0Min, amount1Min, recipient, options.hookData),
      )
    } else {
      // increase
      calldatas.push(
        NonfungiblePositionManager.encodeIncrease(options.tokenId, position.liquidity, amount0Min, amount1Min, options.hookData),
      )
    }

    let value: string = toHex(0)

    if (options.useNative) {
      const wrapped = options.useNative.wrapped
      invariant(position.pool.token0.equals(wrapped) || position.pool.token1.equals(wrapped), 'NO_WETH')

      const wrappedValue = position.pool.token0.equals(wrapped) ? amount0Desired : amount1Desired

      // we only need to refund if we're actually sending ETH
      if (JSBI.greaterThan(wrappedValue, ZERO)) {
        calldatas.push(Payments.encodeRefundETH())
      }

      value = toHex(wrappedValue)
    }

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

    // collect
    calldatas.push(
        NonfungiblePositionManager.encodeDecrease(
            options.tokenId,
            0,
            MIN_SLIPPAGE_DECREASE,
            MIN_SLIPPAGE_DECREASE,
            options.hookData
        )
    )

    calldatas.push(
        NonfungiblePositionManager.encodeTakePair(
            options.expectedCurrencyOwed0.currency,
            options.expectedCurrencyOwed1.currency,
            involvesETH ? ADDRESS_ZERO : recipient
        )
    )

    if (involvesETH) {
      const ethAmount = options.expectedCurrencyOwed0.currency.isNative
        ? options.expectedCurrencyOwed0.quotient
        : options.expectedCurrencyOwed1.quotient
      const token = options.expectedCurrencyOwed0.currency.isNative
        ? (options.expectedCurrencyOwed1.currency as Token)
        : (options.expectedCurrencyOwed0.currency as Token)
      const tokenAmount = options.expectedCurrencyOwed0.currency.isNative
        ? options.expectedCurrencyOwed1.quotient
        : options.expectedCurrencyOwed0.quotient

      calldatas.push(Payments.encodeUnwrapWETH9(ethAmount, recipient))
      calldatas.push(Payments.encodeSweepToken(token, tokenAmount, recipient))
    }

    return calldatas
  }

  public static collectCallParameters(options: CollectOptions): MethodParameters {
    const calldatas: string[] = NonfungiblePositionManager.encodeCollect(options)

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

    const deadline = toHex(options.deadline)
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
        NonfungiblePositionManager.INTERFACE.encodeFunctionData('permit', [
          validateAndParseAddress(options.permit.spender),
          tokenId,
          toHex(options.permit.deadline),
          options.permit.v,
          options.permit.r,
          options.permit.s,
        ])
      )
    }

    // remove liquidity
    calldatas.push(
      NonfungiblePositionManager.encodeDecrease(tokenId, partialPosition.liquidity, amount0Min, amount1Min, options.hookData)
    )

    const { expectedCurrencyOwed0, expectedCurrencyOwed1, ...rest } = options.collectOptions
    calldatas.push(
      ...NonfungiblePositionManager.encodeCollect({
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
        calldatas.push(NonfungiblePositionManager.INTERFACE.encodeFunctionData('burn', [tokenId]))
      }
    } else {
      invariant(options.burnToken !== true, 'CANNOT_BURN')
    }

    return {
      calldata: Multicall.encodeMulticall(calldatas),
      value: toHex(0),
    }
  }

  public static safeTransferFromParameters(options: SafeTransferOptions): MethodParameters {
    const recipient = validateAndParseAddress(options.recipient)
    const sender = validateAndParseAddress(options.sender)

    let calldata: string
    if (options.data) {
      calldata = NonfungiblePositionManager.INTERFACE.encodeFunctionData(
        'safeTransferFrom(address,address,uint256,bytes)',
        [sender, recipient, toHex(options.tokenId), options.data]
      )
    } else {
      calldata = NonfungiblePositionManager.INTERFACE.encodeFunctionData('safeTransferFrom(address,address,uint256)', [
        sender,
        recipient,
        toHex(options.tokenId),
      ])
    }
    return {
      calldata: calldata,
      value: toHex(0),
    }
  }
}
