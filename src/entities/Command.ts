import { RoutePlanner } from '../utils/routerCommands'

export type TradeConfig = {
  allowRevert: boolean
}

// interface for entities that can be encoded as a narwhal command
export interface Command {
  encode(planner: RoutePlanner, config: TradeConfig): void
}
