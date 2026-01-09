import { RoutePlanner } from '../utils/routerCommands'

export type TradeConfig = {
  allowRevert: boolean
}

export enum RouterActionType {
  UniswapTrade = 'UniswapTrade',
  UnwrapWETH = 'UnwrapWETH',
}

// interface for entities that can be encoded as a Universal Router command
export interface Command {
  tradeType: RouterActionType
  encode(planner: RoutePlanner, config: TradeConfig): void
}
