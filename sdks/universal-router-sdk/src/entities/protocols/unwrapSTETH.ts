import invariant from 'tiny-invariant'
import { BigNumberish } from 'ethers'
import { RoutePlanner, CommandType } from '../../utils/routerCommands'
import { Command, RouterTradeType, TradeConfig } from '../Command'
import { STETH_ADDRESS, NOT_SUPPORTED_ON_CHAIN } from '../../utils/constants'

export class UnwrapSTETH implements Command {
  readonly tradeType: RouterTradeType = RouterTradeType.UnwrapSTETH
  readonly recipient: string
  readonly amountMinimum: BigNumberish

  constructor(recipient: string, amountMinimum: BigNumberish, chainId: number) {
    this.recipient = recipient
    this.amountMinimum = amountMinimum
    invariant(STETH_ADDRESS(chainId) != NOT_SUPPORTED_ON_CHAIN, `STETH not supported on chain ${chainId}`)
  }

  encode(planner: RoutePlanner, _: TradeConfig): void {
    planner.addCommand(CommandType.UNWRAP_STETH, [this.recipient, this.amountMinimum])
  }
}
