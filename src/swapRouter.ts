import invariant from 'tiny-invariant'
import { abi } from '@uniswap/narwhal/artifacts/contracts/Router.sol/Router.json'
import { Interface } from '@ethersproject/abi'
import { BigNumber, BigNumberish } from 'ethers'
import { MethodParameters } from '@uniswap/v3-sdk'
import { NFTTrade, Market, SupportedProtocolsData } from './entities/NFTTrade'
import { RoutePlanner } from './utils/routerCommands'

export type SwapRouterConfig = {
  deadline?: BigNumberish
}

export abstract class SwapRouter {
  public static INTERFACE: Interface = new Interface(abi)

  /**
   * Produces the on-chain method name to call and the hex encoded parameters to pass as arguments for a given swap.
   * @param trades to produce call parameters for
   */
  public static swapGenieCallParameters(
    trades: NFTTrade<SupportedProtocolsData>[],
    config: SwapRouterConfig = {}
  ): MethodParameters {
    let planner = new RoutePlanner()
    let totalPrice = BigNumber.from(0)

    for (const trade of trades) {
      trade.encode(planner)
      totalPrice = totalPrice.add(trade.getTotalPrice())
    }

    const { commands, inputs } = planner

    const functionSignature = !!config.deadline ? 'execute(bytes,bytes[],uint256)' : 'execute(bytes,bytes[])'
    const parameters = !!config.deadline ? [commands, inputs, config.deadline] : [commands, inputs]
    const calldata = SwapRouter.INTERFACE.encodeFunctionData(functionSignature, parameters)
    return { calldata, value: totalPrice.toString() }
  }
}
