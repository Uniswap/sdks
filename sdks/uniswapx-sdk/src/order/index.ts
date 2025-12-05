import { DutchOrder } from "./DutchOrder";
import { CosignedPriorityOrder, UnsignedPriorityOrder } from "./PriorityOrder";
import { RelayOrder } from "./RelayOrder";
import { CosignedV2DutchOrder, UnsignedV2DutchOrder } from "./V2DutchOrder";
import { CosignedV3DutchOrder, UnsignedV3DutchOrder } from "./V3DutchOrder";
import { HybridOrderClass } from "./v4/HybridOrder";

export * from "./DutchOrder";
export * from "./PriorityOrder";
export * from "./RelayOrder";
export * from "./types";
export * from "./validation";
export * from "./V2DutchOrder";
export * from "./V3DutchOrder";
export type {
  OrderInfoV4,
  HybridInput,
  HybridOutput,
  HybridCosignerData,
  HybridOrder,
  HybridOrderJSON,
  InputToken,
  OutputToken,
  ResolvedOrder,
  HybridOrderResolutionOptions,
  BlockOverridesV4,
  DCAIntent,
  DCAOrderCosignerData,
  DCAExecutionState,
  DCAIntentJSON,
  PrivateIntent,
  OutputAllocation,
  FeedInfo,
  PermitData,
} from "./v4/types";
export * from "./v4/HybridOrder";
export * from "./v4/hashing";

export type UniswapXOrder =
  | DutchOrder
  | UnsignedV2DutchOrder
  | CosignedV2DutchOrder
  | UnsignedV3DutchOrder
  | CosignedV3DutchOrder
  | UnsignedPriorityOrder
  | CosignedPriorityOrder
  | HybridOrderClass;

export type Order = UniswapXOrder | RelayOrder;
