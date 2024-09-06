import {
  BigintIsh,
  Percent,
  CurrencyAmount,
  validateAndParseAddress,
  Currency,
  NativeCurrency,
} from '@uniswap/sdk-core'
import { Position } from './entities/position'
import { MethodParameters, toHex } from './utils/calldata'
import { Interface } from '@ethersproject/abi'
import { Pool, PoolKey } from './entities'
import { Multicall } from './multicall'
import { ActionType, encodeAction } from './utils/actions'
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
// @ts-ignore
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

  public static addCallParameters(_position: Position, _options: AddLiquidityOptions): MethodParameters {
    // Encode INCREASE_LIQUDITY or MINT_POSITION and then SETTLE_PAIR
    const calldatas = ['0x', '0x']
    let value = toHex(0)

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
  public static removeCallParameters(_position: Position, _options: DecreaseLiquidityOptions): MethodParameters {
    // Encode DECREASE_LIQUIDITY and then COLLECT
    const calldatas = ['0x', '0x']

    return {
      calldata: Multicall.encodeMulticall(calldatas),
      value: toHex(0),
    }
  }

  public static collectCallParameters(_options: CollectOptions): MethodParameters {
    // Encode DECREASE_LIQUIDITY and then TAKE_PAIR
    const calldatas = ['0x', '0x']

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

  // @ts-ignore
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

  // @ts-ignore
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

  // @ts-ignore
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

  // @ts-ignore
  private static encodeBurn(
    tokenId: BigintIsh,
    amount0Min: BigintIsh,
    amount1Min: BigintIsh,
    hookData?: string
  ): string {
    const inputs = [tokenId.toString(), amount0Min.toString(), amount1Min.toString(), hookData ?? '0x']
    return encodeAction(ActionType.BURN_POSITION, inputs).encodedInput
  }

  // @ts-ignore
  private static encodeTake(currency: Currency, recipient: string, amount: BigintIsh): string {
    const inputs = [currency, recipient, amount.toString()]
    return encodeAction(ActionType.TAKE, inputs).encodedInput
  }

  // @ts-ignore
  private static encodeSettle(currency: Currency, amount: BigintIsh, payerIsUser: boolean): string {
    const inputs = [currency, amount.toString(), payerIsUser]
    return encodeAction(ActionType.SETTLE, inputs).encodedInput
  }

  // @ts-ignore
  private static encodeSettlePair(currency0: Currency, currency1: Currency): string {
    const inputs = [currency0.wrapped.address, currency1.wrapped.address]
    return encodeAction(ActionType.SETTLE_PAIR, inputs).encodedInput
  }

  // @ts-ignore
  private static encodeTakePair(currency0: Currency, currency1: Currency, recipient: string): string {
    const inputs = [currency0.wrapped.address, currency1.wrapped.address, recipient]
    return encodeAction(ActionType.TAKE_PAIR, inputs).encodedInput
  }

  // @ts-ignore
  private static encodeCollect(options: CollectOptions): string[] {
    const calldatas: string[] = []

    return calldatas
  }
}
