import invariant from 'tiny-invariant'
import { abi } from '@uniswap/universal-router/artifacts/contracts/UniversalRouter.sol/UniversalRouter.json'
import { Interface } from '@ethersproject/abi'
import { BigNumber, BigNumberish } from 'ethers'
import {
  MethodParameters,
  Position as V3Position,
  NonfungiblePositionManager as V3PositionManager,
  RemoveLiquidityOptions as V3RemoveLiquidityOptions,
} from '@uniswap/v3-sdk'
import {
  Position as V4Position,
  V4PositionManager,
  AddLiquidityOptions as V4AddLiquidityOptions,
  MintOptions,
} from '@uniswap/v4-sdk'
import { Trade as RouterTrade } from '@uniswap/router-sdk'
import { Currency, TradeType, Percent, CHAIN_TO_ADDRESSES_MAP, SupportedChainsType } from '@uniswap/sdk-core'
import { UniswapTrade, SwapOptions } from './entities/actions/uniswap'
import { RoutePlanner, CommandType } from './utils/routerCommands'
import { encodePermit, encodeV3PositionPermit, V3PositionPermit } from './utils/inputTokens'
import { UNIVERSAL_ROUTER_ADDRESS, UniversalRouterVersion } from './utils/constants'

export type SwapRouterConfig = {
  sender?: string // address
  deadline?: BigNumberish
}

export interface MigrateV3ToV4Options {
  inputPosition: V3Position
  outputPosition: V4Position
  v3RemoveLiquidityOptions: V3RemoveLiquidityOptions
  v4AddLiquidityOptions: V4AddLiquidityOptions
  inputV3NFTPermit?: V3PositionPermit
}

function isMint(options: V4AddLiquidityOptions): options is MintOptions {
  return Object.keys(options).some((k) => k === 'recipient')
}

export abstract class SwapRouter {
  public static INTERFACE: Interface = new Interface(abi)

  public static swapCallParameters(
    trades: RouterTrade<Currency, Currency, TradeType>,
    options: SwapOptions
  ): MethodParameters {
    // TODO: use permit if signature included in swapOptions
    const planner = new RoutePlanner()

    const trade: UniswapTrade = new UniswapTrade(trades, options)

    const inputCurrency = trade.trade.inputAmount.currency
    invariant(!(inputCurrency.isNative && !!options.inputTokenPermit), 'NATIVE_INPUT_PERMIT')

    if (options.inputTokenPermit) {
      encodePermit(planner, options.inputTokenPermit)
    }

    const nativeCurrencyValue = inputCurrency.isNative
      ? BigNumber.from(trade.trade.maximumAmountIn(options.slippageTolerance).quotient.toString())
      : BigNumber.from(0)

    trade.encode(planner, { allowRevert: false })
    return SwapRouter.encodePlan(planner, nativeCurrencyValue, {
      deadline: options.deadlineOrPreviousBlockhash ? BigNumber.from(options.deadlineOrPreviousBlockhash) : undefined,
    })
  }

  /**
   * Builds the call parameters for a migration from a V3 position to a V4 position.
   * Some requirements of the parameters:
   *   - v3RemoveLiquidityOptions.collectOptions.recipient must equal v4PositionManager
   *   - v3RemoveLiquidityOptions.liquidityPercentage must be 100%
   *   - input pool and output pool must have the same tokens
   *   - V3 NFT must be approved, or valid inputV3NFTPermit must be provided with UR as spender
   */
  public static migrateV3ToV4CallParameters(options: MigrateV3ToV4Options): MethodParameters {
    const token0 = options.inputPosition.pool.token0
    const token1 = options.inputPosition.pool.token1
    const v4PositionManagerAddress =
      CHAIN_TO_ADDRESSES_MAP[options.outputPosition.pool.chainId as SupportedChainsType].v4PositionManagerAddress

    invariant(token0 === options.outputPosition.pool.token0, 'TOKEN0_MISMATCH')
    invariant(token1 === options.outputPosition.pool.token1, 'TOKEN1_MISMATCH')
    invariant(options.v3RemoveLiquidityOptions.liquidityPercentage.equalTo(new Percent(100)), 'FULL_REMOVAL_REQUIRED')
    invariant(
      options.v3RemoveLiquidityOptions.collectOptions.recipient === v4PositionManagerAddress,
      'RECIPIENT_NOT_POSITION_MANAGER'
    )

    invariant(isMint(options.v4AddLiquidityOptions), 'MINT_REQUIRED')
    invariant(options.v4AddLiquidityOptions.migrate, 'MIGRATE_REQUIRED')

    const planner = new RoutePlanner()

    if (options.inputV3NFTPermit) {
      // permit spender should be UR
      const universalRouterAddress = UNIVERSAL_ROUTER_ADDRESS(
        UniversalRouterVersion.V2_0,
        options.inputPosition.pool.chainId as SupportedChainsType
      )
      invariant(universalRouterAddress == options.inputV3NFTPermit.spender, 'INVALID_SPENDER')
      // don't need to transfer it because v3posm uses isApprovedOrOwner()
      encodeV3PositionPermit(planner, options.inputV3NFTPermit)
    }

    // encode v3 withdraw
    const v3RemoveParams = V3PositionManager.removeCallParameters(
      options.inputPosition,
      options.v3RemoveLiquidityOptions
    )
    planner.addCommand(CommandType.V3_POSITION_MANAGER_CALL, [v3RemoveParams.calldata])

    // encode v4 mint
    const v4AddParams = V4PositionManager.addCallParameters(options.outputPosition, options.v4AddLiquidityOptions)
    planner.addCommand(CommandType.V4_POSITION_CALL, [v4AddParams.calldata])

    return SwapRouter.encodePlan(planner, BigNumber.from(0), {
      deadline: BigNumber.from(options.v4AddLiquidityOptions.deadline),
    })
  }

  /**
   * Encodes a planned route into a method name and parameters for the Router contract.
   * @param planner the planned route
   * @param nativeCurrencyValue the native currency value of the planned route
   * @param config the router config
   */
  private static encodePlan(
    planner: RoutePlanner,
    nativeCurrencyValue: BigNumber,
    config: SwapRouterConfig = {}
  ): MethodParameters {
    const { commands, inputs } = planner
    const functionSignature = !!config.deadline ? 'execute(bytes,bytes[],uint256)' : 'execute(bytes,bytes[])'
    const parameters = !!config.deadline ? [commands, inputs, config.deadline] : [commands, inputs]
    const calldata = SwapRouter.INTERFACE.encodeFunctionData(functionSignature, parameters)
    return { calldata, value: nativeCurrencyValue.toHexString() }
  }
}
