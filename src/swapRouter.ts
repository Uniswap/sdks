import invariant from 'tiny-invariant'
import { abi } from '@uniswap/narwhal/artifacts/contracts/Router.sol/Router.json'
import { Interface } from '@ethersproject/abi'
import { BigNumber, BigNumberish } from 'ethers'
import { MethodParameters } from '@uniswap/v3-sdk'
import { NFTTrade, Market, SupportedProtocolsData } from './entities/NFTTrade'
import { CommandType, RoutePlanner } from './utils/routerCommands'
import { ETH_ADDRESS } from './utils/constants'

export type SwapRouterConfig = {
  sender: string // address
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
    config: SwapRouterConfig
  ): MethodParameters {
    let planner = new RoutePlanner()
    let totalPrice = BigNumber.from(0)

    const allowRevert = trades.length > 1 ? true : false

    for (const trade of trades) {
      trade.encode(planner, { allowRevert })
      totalPrice = totalPrice.add(trade.getTotalPrice())
    }

    planner.addCommand(CommandType.SWEEP, [ETH_ADDRESS, config.sender, 0])
    const { commands, inputs } = planner

    const functionSignature = !!config.deadline ? 'execute(bytes,bytes[],uint256)' : 'execute(bytes,bytes[])'
    const parameters = !!config.deadline ? [commands, inputs, config.deadline] : [commands, inputs]
    const calldata = SwapRouter.INTERFACE.encodeFunctionData(functionSignature, parameters)
    return { calldata, value: totalPrice.toString() }
  }
}
