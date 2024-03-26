import { DutchOrder } from "./DutchOrder";
import { RelayOrder } from "./RelayOrder";
import { CosignedV2DutchOrder, UnsignedV2DutchOrder } from "./V2DutchOrder";

export * from "./DutchOrder";
export * from "./RelayOrder";
export * from "./types";
export * from "./validation";
export * from "./V2DutchOrder";

export type UniswapXOrder =
  | DutchOrder
  | UnsignedV2DutchOrder
  | CosignedV2DutchOrder;

export type Order = UniswapXOrder | RelayOrder;
