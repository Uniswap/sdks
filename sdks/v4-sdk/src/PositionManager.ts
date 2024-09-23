import { BigintIsh, Percent, validateAndParseAddress, Currency, NativeCurrency } from '@uniswap/sdk-core'
import JSBI from 'jsbi'
import { Position } from './entities/position'
import { MethodParameters, toHex } from './utils/calldata'
import { MSG_SENDER } from './actionConstants'
import { Interface } from '@ethersproject/abi'
import { PoolKey } from './entities'
import { Multicall } from './multicall'
import invariant from 'tiny-invariant'
import {
  EMPTY_BYTES,
  CANNOT_BURN,
  NO_NATIVE,
  NO_SQRT_PRICE,
  ONE,
  PositionFunctions,
  ZERO,
  ZERO_LIQUIDITY,
} from './internalConstants'
import { V4PositionPlanner } from './utils'
import { abi } from './utils/abi'
import { ERC2612Permit, ERC2612PermitOptions } from './utils/erc2612Permit'

export interface CommonOptions {
  /**
   * How much the pool price is allowed to move from the specified action.
   */
  slippageTolerance: Percent
  /**
   * Optional data to pass to hooks
   */
  hookData?: string

  /**
   * When the transaction expires, in epoch seconds.
   */
  deadline: BigintIsh
}

export interface ModifyPositionSpecificOptions {
  /**
   * Indicates the ID of the position to increase liquidity for.
   */
  tokenId: BigintIsh
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
   * The optional ERC2612 permit parameters for approving token0 for Permit2
   */
  token0Permit?: ERC2612PermitOptions

  /**
   * The optional ERC2612 permit parameters for approving token1 for Permit2
   */
  token1Permit?: ERC2612PermitOptions

  /**
   * The optional permit2 batch permit parameters for spending token0 and token1
   */
  batchPermit?: BatchPermitOptions
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
}

export interface CollectSpecificOptions {
  /**
   * Indicates the ID of the position to collect for.
   */
  tokenId: BigintIsh

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

export interface PermitDetails {
  token: string
  amount: BigintIsh
  expiration: BigintIsh
  nonce: BigintIsh
}

export interface AllowanceTransferPermitSingle {
  details: PermitDetails
  spender: string
  sigDeadline: BigintIsh
}

export interface AllowanceTransferPermitBatch {
  details: PermitDetails[]
  spender: string
  sigDeadline: BigintIsh
}

export interface BatchPermitOptions {
  owner: string
  permitBatch: AllowanceTransferPermitBatch
  signature: string
}

export interface NFTPermitOptions {
  spender: string
  tokenId: BigintIsh
  deadline: BigintIsh
  nonce: BigintIsh
  signature: string
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
  if (options.createPool) {
    invariant(options.sqrtPriceX96 !== undefined, NO_SQRT_PRICE)
    return true
  }
  return false
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

  public static addCallParameters(position: Position, options: AddLiquidityOptions): MethodParameters {
    /**
     * Cases:
     * - if pool does not exist yet, encode initializePool
     * then,
     * - if is mint, encode MINT_POSITION. If it is on a NATIVE pool, encode a SWEEP. Finally encode a SETTLE_PAIR
     * - else, encode INCREASE_LIQUIDITY. If it is on a NATIVE pool, encode a SWEEP. Finally encode a SETTLE_PAIR
     */
    invariant(JSBI.greaterThan(position.liquidity, ZERO), ZERO_LIQUIDITY)

    const calldataList: string[] = []
    const planner = new V4PositionPlanner()

    const isMintAction = isMint(options)

    // Encode initialize pool.
    if (isMintAction && shouldCreatePool(options)) {
      // No planner used here because initializePool is not supported as an Action
      calldataList.push(
        V4PositionManager.encodeInitializePool(position.pool.poolKey, options.sqrtPriceX96!, options.hookData)
      )
    }

    // adjust for slippage
    const maximumAmounts = position.mintAmountsWithSlippage(options.slippageTolerance)
    const amount0Max = toHex(maximumAmounts.amount0)
    const amount1Max = toHex(maximumAmounts.amount1)

    // Optionally, if the token is not native and has not been approved to Permit2, encode a permit call
    if (options.token0Permit && !position.pool.token0.isNative) {
      calldataList.push(ERC2612Permit.encodePermit(options.token0Permit))
    }
    if (options.token1Permit && !position.pool.token1.isNative) {
      calldataList.push(ERC2612Permit.encodePermit(options.token1Permit))
    }

    // We use permit2 to approve tokens to the position manager
    if (options.batchPermit) {
      calldataList.push(
        V4PositionManager.encodePermitBatch(
          options.batchPermit.owner,
          options.batchPermit.permitBatch,
          options.batchPermit.signature
        )
      )
    }

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

    // need to settle both currencies when minting / adding liquidity
    planner.addSettlePair(position.pool.currency0, position.pool.currency1)

    // Any sweeping must happen after the settling.
    let value: string = toHex(0)
    if (options.useNative) {
      invariant(position.pool.currency0.isNative || position.pool.currency1.isNative, NO_NATIVE)
      let nativeCurrency: Currency = position.pool.currency0.isNative
        ? position.pool.currency0
        : position.pool.currency1
      value = position.pool.currency0.isNative ? toHex(amount0Max) : toHex(amount1Max)
      planner.addSweep(nativeCurrency, MSG_SENDER)
    }

    calldataList.push(V4PositionManager.encodeModifyLiquidities(planner.finalize(), options.deadline))

    return {
      calldata: Multicall.encodeMulticall(calldataList),
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
    const calldataList: string[] = []
    const planner = new V4PositionPlanner()

    const tokenId = toHex(options.tokenId)

    if (options.burnToken) {
      // if burnToken is true, the specified liquidity percentage must be 100%
      invariant(options.liquidityPercentage.equalTo(ONE), CANNOT_BURN)

      // if there is a permit, encode the ERC721Permit permit call
      if (options.permit) {
        calldataList.push(
          V4PositionManager.encodeERC721Permit(
            options.permit.spender,
            options.permit.tokenId,
            options.permit.deadline,
            options.permit.nonce,
            options.permit.signature
          )
        )
      }

      // slippage-adjusted amounts derived from current position liquidity
      const { amount0: amount0Min, amount1: amount1Min } = position.burnAmountsWithSlippage(options.slippageTolerance)
      planner.addBurn(tokenId, amount0Min, amount1Min, options.hookData)
    } else {
      // construct a partial position with a percentage of liquidity
      const partialPosition = new Position({
        pool: position.pool,
        liquidity: options.liquidityPercentage.multiply(position.liquidity).quotient,
        tickLower: position.tickLower,
        tickUpper: position.tickUpper,
      })

      // If the partial position has liquidity=0, this is a collect call and collectCallParameters should be used
      invariant(JSBI.greaterThan(partialPosition.liquidity, ZERO), ZERO_LIQUIDITY)

      // slippage-adjusted underlying amounts
      const { amount0: amount0Min, amount1: amount1Min } = partialPosition.burnAmountsWithSlippage(
        options.slippageTolerance
      )

      planner.addDecrease(
        tokenId,
        partialPosition.liquidity.toString(),
        amount0Min.toString(),
        amount1Min.toString(),
        options.hookData ?? EMPTY_BYTES
      )
    }

    planner.addTakePair(position.pool.currency0, position.pool.currency1, MSG_SENDER)

    calldataList.push(V4PositionManager.encodeModifyLiquidities(planner.finalize(), options.deadline))

    return {
      calldata: Multicall.encodeMulticall(calldataList),
      value: toHex(0),
    }
  }

  /**
   * Produces the calldata for collecting fees from a position
   * @param position The position to collect fees from
   * @param options Additional information necessary for generating the calldata
   * @returns The call parameters
   */
  public static collectCallParameters(position: Position, options: CollectOptions): MethodParameters {
    const calldataList: string[] = []
    const planner = new V4PositionPlanner()

    const tokenId = toHex(options.tokenId)
    const recipient = validateAndParseAddress(options.recipient)

    /**
     * To collect fees in V4, we need to:
     * - encode a decrease liquidity by 0
     * - and encode a TAKE_PAIR
     */

    planner.addDecrease(tokenId, '0', '0', '0', options.hookData)

    planner.addTakePair(position.pool.currency0, position.pool.currency1, recipient)

    calldataList.push(V4PositionManager.encodeModifyLiquidities(planner.finalize(), options.deadline))

    return {
      calldata: Multicall.encodeMulticall(calldataList),
      value: toHex(0),
    }
  }

  // Initialize a pool
  private static encodeInitializePool(poolKey: PoolKey, sqrtPriceX96: BigintIsh, hookData?: string): string {
    return V4PositionManager.INTERFACE.encodeFunctionData(PositionFunctions.INITIALIZE_POOL, [
      poolKey,
      sqrtPriceX96.toString(),
      hookData ?? '0x',
    ])
  }

  // Encode a modify liquidities call
  public static encodeModifyLiquidities(unlockData: string, deadline: BigintIsh): string {
    return V4PositionManager.INTERFACE.encodeFunctionData(PositionFunctions.MODIFY_LIQUIDITIES, [unlockData, deadline])
  }

  // Encode a permit call
  public static encodePermit(owner: string, permit: AllowanceTransferPermitBatch, signature: string): string {
    return V4PositionManager.INTERFACE.encodeFunctionData(PositionFunctions.PERMIT, [owner, permit, signature])
  }

  // Encode a permit batch call
  public static encodePermitBatch(owner: string, permitBatch: AllowanceTransferPermitBatch, signature: string): string {
    return V4PositionManager.INTERFACE.encodeFunctionData(PositionFunctions.PERMIT_BATCH, [
      owner,
      permitBatch,
      signature,
    ])
  }

  // Encode a ERC721Permit permit call
  public static encodeERC721Permit(
    spender: string,
    tokenId: BigintIsh,
    deadline: BigintIsh,
    nonce: BigintIsh,
    signature: string
  ): string {
    return V4PositionManager.INTERFACE.encodeFunctionData(PositionFunctions.ERC721PERMIT_PERMIT, [
      spender,
      tokenId,
      deadline,
      nonce,
      signature,
    ])
  }

  // Encode a ERC721Permit permitForAll call
  public static encodeERC721PermitForAll(
    owner: string,
    spender: string,
    approved: boolean,
    deadline: BigintIsh,
    nonce: BigintIsh,
    signature: string
  ): string {
    return V4PositionManager.INTERFACE.encodeFunctionData(PositionFunctions.ERC721PERMIT_PERMIT_FOR_ALL, [
      owner,
      spender,
      approved,
      deadline,
      nonce,
      signature,
    ])
  }
}
