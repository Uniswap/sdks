import { DutchOrder } from "./DutchOrder";
import { CosignedPriorityOrder, UnsignedPriorityOrder } from "./PriorityOrder";
import { RelayOrder } from "./RelayOrder";
import { CosignedV2DutchOrder, UnsignedV2DutchOrder } from "./V2DutchOrder";

export * from "./DutchOrder";
export * from "./PriorityOrder";
export * from "./RelayOrder";
export * from "./types";
export * from "./validation";
export * from "./V2DutchOrder";

export type UniswapXOrder =
  | DutchOrder
  | UnsignedV2DutchOrder
  | CosignedV2DutchOrder
  | UnsignedPriorityOrder
  | CosignedPriorityOrder;

export type Order = UniswapXOrder | RelayOrder;
