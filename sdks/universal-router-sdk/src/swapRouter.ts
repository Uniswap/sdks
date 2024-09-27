import invariant from 'tiny-invariant'
import { abi } from '@uniswap/universal-router/artifacts/contracts/UniversalRouter.sol/UniversalRouter.json'
import { Interface } from '@ethersproject/abi'
import { BigNumber, BigNumberish } from 'ethers'
import { MethodParameters, Position as V3Position, NonfungiblePositionManager as V3PositionManager, RemoveLiquidityOptions as V3RemoveLiquidityOptions } from '@uniswap/v3-sdk'
import { Position as V4Position, V4PositionManager, AddLiquidityOptions as V4AddLiquidityOptions } from '@uniswap/v4-sdk';
import { Trade as RouterTrade } from '@uniswap/router-sdk'
import { Currency, CurrencyAmount, TradeType, BigintIsh, Percent } from '@uniswap/sdk-core'
import { UniswapTrade, SwapOptions } from './entities/actions/uniswap'
import { RoutePlanner, CommandType } from './utils/routerCommands'
import { encodePermit, encodeV3PositionPermit, V3PositionPermit } from './utils/inputTokens'

export type SwapRouterConfig = {
  sender?: string // address
  deadline?: BigNumberish
}

export interface MigrateV3ToV4Options {
    inputPosition: V3Position,
    inputTokenId: BigintIsh,
    outputPosition: V4Position,
    v3RemoveLiquidityOptions: V3RemoveLiquidityOptions,
    v4AddLiquidityOptions: V4AddLiquidityOptions,
    slippageTolerance: Percent;
    universalRouterAddress: string;
    recipient: string;
    inputV3NFTPermit?: V3PositionPermit;
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
   *
   */
  public static migrateV3ToV4CallParameters(options: MigrateV3ToV4Options): MethodParameters {
    const token0 = options.inputPosition.pool.token0;
    const token1 = options.inputPosition.pool.token1;
    invariant(token0 === options.outputPosition.pool.token0, 'TOKEN0_MISMATCH')
    invariant(token1 === options.outputPosition.pool.token1, 'TOKEN1_MISMATCH')
    invariant(options.v3RemoveLiquidityOptions.liquidityPercentage.equalTo(new Percent(100)), 'FULL_REMOVAL_REQUIRED')

    const planner = new RoutePlanner()

    if (options.inputV3NFTPermit) {
      // note: permit spender should be UR
      // don't need to transfer it because v3posm uses isApprovedOrOwner()
      encodeV3PositionPermit(planner, options.inputV3NFTPermit)
    }

    // encode v3 withdraw
    // consider just taking in a full v3 add params with require checks
    const v3RemoveParams = V3PositionManager.removeCallParameters(options.inputPosition, options.v3RemoveLiquidityOptions)

    //   {
    //   tokenId: options.inputTokenId,
    //   // always remove all for migrate
    //   liquidityPercentage: new Percent(100),
    //   // no slippage check on removal since we will check slippage on addition
    //   slippageTolerance: new Percent(100),
    //   deadline: options.deadlineOrPreviousBlockhash,
    //   burnToken: true,
    //   collectOptions: {
    //     // no slippage check on collect since we will check slippage on addition
    //     expectedCurrencyOwed0: CurrencyAmount.fromRawAmount(token0, '0'),
    //     expectedCurrencyOwed1: CurrencyAmount.fromRawAmount(token1, '0'),
    //     // collect to the router so it can migrate to v4
    //     recipient: options.universalRouterAddress,
    //   },
    // });
    planner.addCommand(CommandType.V3_POSITION_MANAGER_CALL, [v3RemoveParams.calldata])

    // encode v4 mint
    const v4AddParams = V4PositionManager.addCallParameters(options.outputPosition, options.v4AddLiquidityOptions);
    // {
    //   deadline: options.deadlineOrPreviousBlockhash,
    //   slippageTolerance: options.slippageTolerance,
    //   hookData: options.hookData,
    //   recipient: options.recipient,
    //   sqrtPriceX96: options.sqrtPriceX96,
    //   createPool: options.createPool,
    // });
    planner.addCommand(CommandType.V4_POSITION_CALL, [v4AddParams.calldata]);

    planner.addCommand(CommandType.SWEEP, [options.outputPosition.pool.token0, options.recipient, 0]);
    planner.addCommand(CommandType.SWEEP, [options.outputPosition.pool.token1, options.recipient, 0]);

    return SwapRouter.encodePlan(planner, BigNumber.from(0), {
      deadline: options.deadlineOrPreviousBlockhash ? BigNumber.from(options.deadlineOrPreviousBlockhash) : undefined,
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
