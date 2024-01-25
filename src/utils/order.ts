import { OrderType, REVERSE_REACTOR_MAPPING } from "../constants";
import { MissingConfiguration } from "../errors";
import { DutchOrder, Order } from "../order";

import { stripHexPrefix } from ".";

const FIRST_FIELD_OFFSET = 664;
const ADDRESS_LENGTH = 40;

/**
 * Parses a given serialized order
 * @return Parsed order object
 */
export function parseOrder(order: string, chainId: number): Order {
  // reactor address is always the first field in order
  const reactor =
    "0x" +
    stripHexPrefix(order)
      .slice(FIRST_FIELD_OFFSET, FIRST_FIELD_OFFSET + ADDRESS_LENGTH)
      .toLowerCase();

  if (!REVERSE_REACTOR_MAPPING[reactor]) {
    throw new MissingConfiguration("reactor", reactor);
  }

  const { orderType } = REVERSE_REACTOR_MAPPING[reactor];
  switch (orderType) {
    case OrderType.Dutch:
      return DutchOrder.parse(order, chainId);
    default:
      throw new MissingConfiguration("orderType", orderType);
  }
}

/**
 * Parses a given serialized order and then determines the OrderType
 * @return OrderType
 */
export function getOrderTypeFromEncoded(
  order: string,
  chainId: number
): OrderType {
  const parsedOrder = parseOrder(order, chainId);
  return getOrderType(parsedOrder);
}

/**
 * Determines the OrderType from an Order object
 * @return OrderType
 */
export function getOrderType(order: Order): OrderType {
  const { orderType } =
    REVERSE_REACTOR_MAPPING[order.info.reactor.toLowerCase()];

  if (orderType == OrderType.Dutch) {
    const input = (order as DutchOrder).info.input;
    const outputs = (order as DutchOrder).info.outputs;
    const isLimit =
      input.startAmount.eq(input.endAmount) &&
      outputs.every((output) => output.startAmount.eq(output.endAmount));

    return isLimit ? OrderType.Limit : OrderType.Dutch;
  }

  return orderType;
}
