import { OrderType, REVERSE_REACTOR_MAPPING } from "../constants";
import { MissingConfiguration } from "../errors";
import { stripHexPrefix } from "../utils";

import { DutchLimitOrder } from "./DutchLimitOrder";
import { Order } from "./types";

export * from "./DutchLimitOrder";
export * from "./types";
export * from "./validation";

const FIRST_FIELD_OFFSET = 88;
const ADDRESS_LENGTH = 40;

/**
 * Parses a given serialized order
 * @return Parsed order object
 */
export function parseOrder(order: string): Order {
  // reactor address is always the first field in order
  const reactor =
    "0x" +
    stripHexPrefix(order)
      .slice(FIRST_FIELD_OFFSET, FIRST_FIELD_OFFSET + ADDRESS_LENGTH)
      .toLowerCase();

  if (!REVERSE_REACTOR_MAPPING[reactor]) {
    throw new MissingConfiguration("reactor", reactor);
  }

  const { chainId, orderType } = REVERSE_REACTOR_MAPPING[reactor];
  switch (orderType) {
    case OrderType.DutchLimit:
      return DutchLimitOrder.parse(order, chainId);
    default:
      throw new MissingConfiguration("orderType", orderType);
  }
}
