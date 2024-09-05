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
import { ADDRESS_ZERO } from './internalConstants'
import { Pool, PoolKey } from './entities'
import { Multicall } from './multicall'
import { Payments } from './payments'
import { ActionType, encodeAction } from './utils/actions'
import { MIN_SLIPPAGE_DECREASE } from './internalConstants'

// TODO: import this from npm
const abi = [{"type":"function","name":"getPoolAndPositionInfo","inputs":[{"name":"tokenId","type":"uint256","internalType":"uint256"}],"outputs":[{"name":"","type":"tuple","internalType":"struct PoolKey","components":[{"name":"currency0","type":"address","internalType":"Currency"},{"name":"currency1","type":"address","internalType":"Currency"},{"name":"fee","type":"uint24","internalType":"uint24"},{"name":"tickSpacing","type":"int24","internalType":"int24"},{"name":"hooks","type":"address","internalType":"contract IHooks"}]},{"name":"","type":"uint256","internalType":"PositionInfo"}],"stateMutability":"view"},{"type":"function","name":"getPositionLiquidity","inputs":[{"name":"tokenId","type":"uint256","internalType":"uint256"}],"outputs":[{"name":"liquidity","type":"uint128","internalType":"uint128"}],"stateMutability":"view"},{"type":"function","name":"modifyLiquidities","inputs":[{"name":"unlockData","type":"bytes","internalType":"bytes"},{"name":"deadline","type":"uint256","internalType":"uint256"}],"outputs":[],"stateMutability":"payable"},{"type":"function","name":"modifyLiquiditiesWithoutUnlock","inputs":[{"name":"actions","type":"bytes","internalType":"bytes"},{"name":"params","type":"bytes[]","internalType":"bytes[]"}],"outputs":[],"stateMutability":"payable"},{"type":"function","name":"nextTokenId","inputs":[],"outputs":[{"name":"","type":"uint256","internalType":"uint256"}],"stateMutability":"view"},{"type":"function","name":"subscribe","inputs":[{"name":"tokenId","type":"uint256","internalType":"uint256"},{"name":"newSubscriber","type":"address","internalType":"address"},{"name":"data","type":"bytes","internalType":"bytes"}],"outputs":[],"stateMutability":"payable"},{"type":"function","name":"subscriber","inputs":[{"name":"tokenId","type":"uint256","internalType":"uint256"}],"outputs":[{"name":"subscriber","type":"address","internalType":"contract ISubscriber"}],"stateMutability":"view"},{"type":"function","name":"unsubscribe","inputs":[{"name":"tokenId","type":"uint256","internalType":"uint256"}],"outputs":[],"stateMutability":"payable"},{"type":"function","name":"unsubscribeGasLimit","inputs":[],"outputs":[{"name":"","type":"uint256","internalType":"uint256"}],"stateMutability":"view"},{"type":"event","name":"Subscription","inputs":[{"name":"tokenId","type":"uint256","indexed":true,"internalType":"uint256"},{"name":"subscriber","type":"address","indexed":true,"internalType":"address"}],"anonymous":false},{"type":"event","name":"Unsubscription","inputs":[{"name":"tokenId","type":"uint256","indexed":true,"internalType":"uint256"},{"name":"subscriber","type":"address","indexed":true,"internalType":"address"}],"anonymous":false},{"type":"error","name":"AlreadySubscribed","inputs":[{"name":"tokenId","type":"uint256","internalType":"uint256"},{"name":"subscriber","type":"address","internalType":"address"}]},{"type":"error","name":"DeadlinePassed","inputs":[{"name":"deadline","type":"uint256","internalType":"uint256"}]},{"type":"error","name":"GasLimitTooLow","inputs":[]},{"type":"error","name":"NoCodeSubscriber","inputs":[]},{"type":"error","name":"NotApproved","inputs":[{"name":"caller","type":"address","internalType":"address"}]},{"type":"error","name":"NotSubscribed","inputs":[]},{"type":"error","name":"Wrap__ModifyLiquidityNotificationReverted","inputs":[{"name":"subscriber","type":"address","internalType":"address"},{"name":"reason","type":"bytes","internalType":"bytes"}]},{"type":"error","name":"Wrap__SubscriptionReverted","inputs":[{"name":"subscriber","type":"address","internalType":"address"},{"name":"reason","type":"bytes","internalType":"bytes"}]},{"type":"error","name":"Wrap__TransferNotificationReverted","inputs":[{"name":"subscriber","type":"address","internalType":"address"},{"name":"reason","type":"bytes","internalType":"bytes"}]}]

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

  /**
   * Functions to encode calldata for different actions on the PositionManager contract
   */

  // Initialize a pool
  private static encodeInitializePool(poolKey: PoolKey, sqrtPriceX96: BigintIsh, hookData?: string): string {
    return V4PositionManager.INTERFACE.encodeFunctionData('initializePool', [poolKey, sqrtPriceX96, hookData])
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
  private static encodeTake(currency: Currency, recipient: string, amount: BigintIsh): string {
    const inputs = [[currency, recipient, amount]]
    return encodeAction(ActionType.TAKE, inputs).encodedInput
  }

  // SETTLE
  private static encodeSettle(currency: Currency, amount: BigintIsh, payerIsUser: boolean): string {
    const inputs = [[currency, amount, payerIsUser]]
    return encodeAction(ActionType.SETTLE, inputs).encodedInput
  }

  // SETTLE_PAIR
  private static encodeSettlePair(currency0: Currency, currency1: Currency): string {
    const inputs = [[currency0, currency1]]
    return encodeAction(ActionType.SETTLE_PAIR, inputs).encodedInput
  }

  // TAKE_PAIR
  private static encodeTakePair(currency0: Currency, currency1: Currency, recipient: string): string {
    const inputs = [[currency0, currency1, recipient]]
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
    const { amount0: amount0Desired, amount1: amount1Desired } = position.mintAmounts

    // adjust for slippage
    const minimumAmounts = position.mintAmountsWithSlippage(options.slippageTolerance)
    const amount0Min = toHex(minimumAmounts.amount0)
    const amount1Min = toHex(minimumAmounts.amount1)

    // create pool if needed
    if (isMint(options) && options.createPool && options.sqrtPriceX96) {
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
        V4PositionManager.encodeIncrease(
          options.tokenId,
          position.liquidity,
          amount0Min,
          amount1Min,
          options.hookData
        )
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
      V4PositionManager.encodeDecrease(
        tokenId,
        0,
        MIN_SLIPPAGE_DECREASE,
        MIN_SLIPPAGE_DECREASE,
        options.hookData
      )
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
      const ethAmount = options.expectedCurrencyOwed0.currency.isNative
        ? options.expectedCurrencyOwed0.quotient
        : options.expectedCurrencyOwed1.quotient
      const token = options.expectedCurrencyOwed0.currency.isNative
        ? (options.expectedCurrencyOwed1.currency as Token)
        : (options.expectedCurrencyOwed0.currency as Token)
      const tokenAmount = options.expectedCurrencyOwed0.currency.isNative
        ? options.expectedCurrencyOwed1.quotient
        : options.expectedCurrencyOwed0.quotient

      calldatas.push(Payments.encodeUnwrapWETH9(ethAmount, recipient)) // TODO: don't think you need since v4 supports native, just need sweep
      calldatas.push(Payments.encodeSweepToken(token, tokenAmount, recipient))
    }

    return calldatas
  }

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
        partialPosition.liquidity,
        amount0Min,
        amount1Min,
        options.hookData
      )
    )

    // Add TAKE_PAIR to take the tokens
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
}
