import { ethers } from "ethers";

import { OrderType, REVERSE_REACTOR_MAPPING } from "../constants";
import { MissingConfiguration } from "../errors";
import {
  CosignedV2DutchOrder,
  DutchOrder,
  Order,
  RelayOrder,
  UniswapXOrder,
  UnsignedV2DutchOrder,
} from "../order";

import { stripHexPrefix } from ".";

const UNISWAPX_ORDER_INFO_OFFSET = 64;
const RELAY_ORDER_INFO_OFFSET = 64;
const SLOT_LENGTH = 64;
const ADDRESS_LENGTH = 40;

abstract class OrderParser {
  abstract orderInfoOffset: number;

  abstract parseOrder(order: string, chainId: number): Order;

  /**
   * Parses a serialized order based on the order shape
   * @dev called by derived classes which set the offset
   */
  protected _parseOrder(order: string): OrderType {
    const strippedOrder = stripHexPrefix(order);
    // look up the tail offset of orderInfo
    // orderInfo is always the first field in the order,
    // but since it is dynamic size it is a pointer in the tail
    const orderInfoOffsetBytes = parseInt(
      strippedOrder.slice(
        this.orderInfoOffset,
        this.orderInfoOffset + SLOT_LENGTH
      ),
      16
    );
    // multiply tail offset by 2 to get in terms of hex characters instead of bytes
    // and add one slot to skip the orderinfo size slot
    const reactorAddressOffset = orderInfoOffsetBytes * 2 + SLOT_LENGTH;
    const reactorAddressSlot = strippedOrder.slice(
      reactorAddressOffset,
      reactorAddressOffset + SLOT_LENGTH
    );
    // slice off the 0 padding in front of the address
    const reactorAddress = ethers.utils
      .getAddress(reactorAddressSlot.slice(SLOT_LENGTH - ADDRESS_LENGTH))
      .toLowerCase();

    if (!REVERSE_REACTOR_MAPPING[reactorAddress]) {
      throw new MissingConfiguration("reactor", reactorAddress);
    }

    return REVERSE_REACTOR_MAPPING[reactorAddress].orderType;
  }

  /**
   * Determines the OrderType from an Order object
   * @return OrderType
   */
  getOrderType(order: Order): OrderType {
    const { orderType } =
      REVERSE_REACTOR_MAPPING[order.info.reactor.toLowerCase()];
    return orderType;
  }

  /**
   * Helper function to determine the OrderType from a serialized order
   */
  getOrderTypeFromEncoded(order: string, chainId: number): OrderType {
    const parsedOrder = this.parseOrder(order, chainId);
    return this.getOrderType(parsedOrder);
  }
}

export class UniswapXOrderParser extends OrderParser {
  orderInfoOffset = UNISWAPX_ORDER_INFO_OFFSET;

  /**
   * Parses a serialized order
   */
  parseOrder(order: string, chainId: number): UniswapXOrder {
    const orderType = this._parseOrder(order);
    switch (orderType) {
      case OrderType.Dutch:
        return DutchOrder.parse(order, chainId);
      case OrderType.Dutch_V2: {
        // cosigned and unsigned serialized versions are the same format
        const cosignedOrder = CosignedV2DutchOrder.parse(order, chainId);
        // if no cosignature, returned unsigned variant
        if (cosignedOrder.info.cosignature === "0x") {
          return UnsignedV2DutchOrder.parse(order, chainId);
        }
        // if cosignature exists then returned cosigned version
        return cosignedOrder;
      }
      default:
        throw new MissingConfiguration("orderType", orderType);
    }
  }

  /**
   * Determine the order type of a UniswapX order
   * @dev Special cases limit orders which are dutch orders with no output decay
   */
  getOrderType(order: Order): OrderType {
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
}

export class RelayOrderParser extends OrderParser {
  orderInfoOffset = RELAY_ORDER_INFO_OFFSET;

  /**
   * Parses a serialized order
   */
  parseOrder(order: string, chainId: number): RelayOrder {
    return RelayOrder.parse(order, chainId);
  }
}
