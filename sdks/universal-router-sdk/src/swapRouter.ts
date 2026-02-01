import invariant from 'tiny-invariant'
import UniversalRouter from '@uniswap/universal-router/artifacts/contracts/UniversalRouter.sol/UniversalRouter.json'
import { Interface } from '@ethersproject/abi'
import { BigNumber, BigNumberish } from 'ethers'
import {
  MethodParameters,
  Multicall,
  Position as V3Position,
  NonfungiblePositionManager as V3PositionManager,
  RemoveLiquidityOptions as V3RemoveLiquidityOptions,
} from '@uniswap/v3-sdk'
import {
  Position as V4Position,
  V4PositionManager,
  AddLiquidityOptions as V4AddLiquidityOptions,
  MintOptions,
  Pool as V4Pool,
  PoolKey,
} from '@uniswap/v4-sdk'
import { Trade as RouterTrade } from '@uniswap/router-sdk'
import { Currency, TradeType, Percent, CHAIN_TO_ADDRESSES_MAP, SupportedChainsType } from '@uniswap/sdk-core'
import { UniswapTrade, SwapOptions } from './entities/actions/uniswap'
import { RoutePlanner, CommandType } from './utils/routerCommands'
import { encodePermit, encodeV3PositionPermit } from './utils/inputTokens'
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
}

function isMint(options: V4AddLiquidityOptions): options is MintOptions {
  return Object.keys(options).some((k) => k === 'recipient')
}

export abstract class SwapRouter {
  public static INTERFACE: Interface = new Interface(UniversalRouter.abi)

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
  public static migrateV3ToV4CallParameters(
    options: MigrateV3ToV4Options,
    positionManagerOverride?: string
  ): MethodParameters {
    const v4Pool: V4Pool = options.outputPosition.pool
    const v3Token0 = options.inputPosition.pool.token0
    const v3Token1 = options.inputPosition.pool.token1
    const v4PositionManagerAddress =
      positionManagerOverride ?? CHAIN_TO_ADDRESSES_MAP[v4Pool.chainId as SupportedChainsType].v4PositionManagerAddress

    // owner of the v3 nft must be the receiver of the v4 nft

    // validate the parameters
    if (v4Pool.currency0.isNative) {
      invariant(
        (v4Pool.currency0.wrapped.equals(v3Token0) && v4Pool.currency1.equals(v3Token1)) ||
          (v4Pool.currency0.wrapped.equals(v3Token1) && v4Pool.currency1.equals(v3Token0)),
        'TOKEN_MISMATCH'
      )
    } else {
      invariant(v3Token0 === v4Pool.token0, 'TOKEN0_MISMATCH')
      invariant(v3Token1 === v4Pool.token1, 'TOKEN1_MISMATCH')
    }

    invariant(
      options.v3RemoveLiquidityOptions.liquidityPercentage.equalTo(new Percent(100, 100)),
      'FULL_REMOVAL_REQUIRED'
    )
    invariant(options.v3RemoveLiquidityOptions.burnToken == true, 'BURN_TOKEN_REQUIRED')
    invariant(
      options.v3RemoveLiquidityOptions.collectOptions.recipient === v4PositionManagerAddress,
      'RECIPIENT_NOT_POSITION_MANAGER'
    )
    invariant(isMint(options.v4AddLiquidityOptions), 'MINT_REQUIRED')
    invariant(options.v4AddLiquidityOptions.migrate, 'MIGRATE_REQUIRED')

    const planner = new RoutePlanner()

    // to prevent reentrancy by the pool hook, we initialize the v4 pool before moving funds
    if (options.v4AddLiquidityOptions.createPool) {
      const poolKey: PoolKey = V4Pool.getPoolKey(
        v4Pool.currency0,
        v4Pool.currency1,
        v4Pool.fee,
        v4Pool.tickSpacing,
        v4Pool.hooks
      )
      planner.addCommand(CommandType.V4_INITIALIZE_POOL, [poolKey, v4Pool.sqrtRatioX96.toString()])
      // remove createPool setting, so that it doesnt get encoded again later
      delete options.v4AddLiquidityOptions.createPool
    }

    // add position permit to the universal router planner
    if (options.v3RemoveLiquidityOptions.permit) {
      // permit spender should be UR
      const universalRouterAddress = UNIVERSAL_ROUTER_ADDRESS(
        UniversalRouterVersion.V2_0,
        options.inputPosition.pool.chainId as SupportedChainsType
      )
      invariant(universalRouterAddress == options.v3RemoveLiquidityOptions.permit.spender, 'INVALID_SPENDER')
      // don't need to transfer it because v3posm uses isApprovedOrOwner()
      encodeV3PositionPermit(planner, options.v3RemoveLiquidityOptions.permit, options.v3RemoveLiquidityOptions.tokenId)
      // remove permit so that multicall doesnt add it again
      delete options.v3RemoveLiquidityOptions.permit
    }

    // encode v3 withdraw
    const v3RemoveParams: MethodParameters = V3PositionManager.removeCallParameters(
      options.inputPosition,
      options.v3RemoveLiquidityOptions
    )
    const v3Calls: string[] = Multicall.decodeMulticall(v3RemoveParams.calldata)

    for (const v3Call of v3Calls) {
      // slice selector - 0x + 4 bytes = 10 characters
      const selector = v3Call.slice(0, 10)
      invariant(
        selector == V3PositionManager.INTERFACE.getSighash('collect') ||
          selector == V3PositionManager.INTERFACE.getSighash('decreaseLiquidity') ||
          selector == V3PositionManager.INTERFACE.getSighash('burn'),
        'INVALID_V3_CALL: ' + selector
      )
      planner.addCommand(CommandType.V3_POSITION_MANAGER_CALL, [v3Call])
    }

    // encode v4 mint
    const v4AddParams = V4PositionManager.addCallParameters(options.outputPosition, options.v4AddLiquidityOptions)
    // only modifyLiquidities can be called by the UniversalRouter
    const selector = v4AddParams.calldata.slice(0, 10)
    invariant(selector == V4PositionManager.INTERFACE.getSighash('modifyLiquidities'), 'INVALID_V4_CALL: ' + selector)

    planner.addCommand(CommandType.V4_POSITION_MANAGER_CALL, [v4AddParams.calldata])

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
