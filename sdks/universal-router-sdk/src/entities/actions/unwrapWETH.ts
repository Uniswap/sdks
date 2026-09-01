import invariant from 'tiny-invariant'
import { BigNumberish } from 'ethers'
import { RoutePlanner, CommandType } from '../../utils/routerCommands'
import { encodeInputTokenOptions, Permit2Permit } from '../../utils/inputTokens'
import { Command, RouterActionType, TradeConfig } from '../Command'
import { ROUTER_AS_RECIPIENT, WETH_ADDRESS, UniversalRouterVersion, isAtLeastV2_3_0 } from '../../utils/constants'

export class UnwrapWETH implements Command {
  readonly tradeType: RouterActionType = RouterActionType.UnwrapWETH
  readonly permit2Data?: Permit2Permit
  readonly wethAddress: string
  readonly amount: BigNumberish
  readonly urVersion?: UniversalRouterVersion

  constructor(amount: BigNumberish, chainId: number, permit2?: Permit2Permit, urVersion?: UniversalRouterVersion) {
    this.wethAddress = WETH_ADDRESS(chainId)
    this.amount = amount
    this.urVersion = urVersion

    if (!!permit2) {
      invariant(
        permit2.details.token.toLowerCase() === this.wethAddress.toLowerCase(),
        `must be permitting WETH address: ${this.wethAddress}`
      )
      invariant(permit2.details.amount >= amount, `Did not permit enough WETH for unwrapWETH transaction`)
      this.permit2Data = permit2
    }
  }

  encode(planner: RoutePlanner, _: TradeConfig): void {
    encodeInputTokenOptions(planner, {
      permit2Permit: this.permit2Data,
      permit2TransferFrom: {
        token: this.wethAddress,
        amount: this.amount.toString(),
      },
    })
    // From UR v2.3.0 UNWRAP_WETH takes (recipient, amount, minAmount) where `amount` is exact.
    // The exact amount pulled into the router is known here, so unwrap exactly that much;
    // older routers unwrap the full balance and only min-check `this.amount`.
    const params = isAtLeastV2_3_0(this.urVersion)
      ? [ROUTER_AS_RECIPIENT, this.amount, this.amount]
      : [ROUTER_AS_RECIPIENT, this.amount]
    planner.addCommand(CommandType.UNWRAP_WETH, params, false, this.urVersion)
  }
}
