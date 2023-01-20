import invariant from 'tiny-invariant'
import { BigNumberish } from 'ethers'
import { RoutePlanner, CommandType } from '../../utils/routerCommands'
import { Permit2Permit } from '../../utils/permit2'
import { Command, RouterTradeType, TradeConfig } from '../Command'
import { encodePermit } from '../../utils/permit2'
import { ROUTER_AS_RECIPIENT, UNIVERSAL_ROUTER_ADDRESS, WETH_ADDRESS } from '../../utils/constants'

export class UnwrapWETH implements Command {
  readonly tradeType: RouterTradeType = RouterTradeType.UnwrapWETH
  readonly permit2Data: Permit2Permit
  readonly wethAddress: string
  readonly routerAddress: string
  readonly amount: BigNumberish

  constructor(amount: BigNumberish, chainId: number, permit2?: Permit2Permit) {
    this.wethAddress = WETH_ADDRESS(chainId)
    this.routerAddress = UNIVERSAL_ROUTER_ADDRESS(chainId)
    this.amount = amount

    if (!!permit2) {
      invariant(permit2.details.token === this.wethAddress, `must be permitting WETH address: ${this.wethAddress}`)
      invariant(permit2.details.amount >= amount, `Did not permit enough WETH for unwrapWETH transaction`)
      this.permit2Data = permit2
    }
  }

  encode(planner: RoutePlanner, _: TradeConfig): void {
    if (!!this.permit2Data) encodePermit(planner, this.permit2Data)
    planner.addCommand(CommandType.PERMIT2_TRANSFER_FROM, [this.wethAddress, this.routerAddress, this.amount])
    planner.addCommand(CommandType.UNWRAP_WETH, [ROUTER_AS_RECIPIENT, this.amount])
  }
}
