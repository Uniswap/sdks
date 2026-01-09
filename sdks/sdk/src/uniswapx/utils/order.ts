import { BigNumber, ethers } from 'ethers'

import { OrderType, REVERSE_REACTOR_MAPPING, REVERSE_RESOLVER_MAPPING } from '../constants'
import { MissingConfiguration } from '../errors'
import {
  CosignedHybridOrder,
  CosignedPriorityOrder,
  CosignedV2DutchOrder,
  DutchOrder,
  Order,
  RelayOrder,
  UniswapXOrder,
  UnsignedHybridOrder,
  UnsignedPriorityOrder,
  UnsignedV2DutchOrder,
} from '../order'
import { CosignedV3DutchOrder, UnsignedV3DutchOrder } from '../order/V3DutchOrder'

import { stripHexPrefix } from '.'

const UNISWAPX_ORDER_INFO_OFFSET = 64
const RELAY_ORDER_INFO_OFFSET = 64
const SLOT_LENGTH = 64
const ADDRESS_LENGTH = 40

abstract class OrderParser {
  abstract orderInfoOffset: number

  abstract parseOrder(order: string, chainId: number): Order

  /**
   * Parses a serialized order based on the order shape
   * @dev called by derived classes which set the offset
   */
  protected _parseOrder(order: string): OrderType {
    const strippedOrder = stripHexPrefix(order)
    // look up the tail offset of orderInfo
    // orderInfo is always the first field in the order,
    // but since it is dynamic size it is a pointer in the tail
    const orderInfoOffsetBytes = parseInt(
      strippedOrder.slice(this.orderInfoOffset, this.orderInfoOffset + SLOT_LENGTH),
      16
    )
    // multiply tail offset by 2 to get in terms of hex characters instead of bytes
    // and add one slot to skip the orderinfo size slot
    const reactorAddressOffset = orderInfoOffsetBytes * 2 + SLOT_LENGTH
    const reactorAddressSlot = strippedOrder.slice(reactorAddressOffset, reactorAddressOffset + SLOT_LENGTH)
    // slice off the 0 padding in front of the address
    const reactorAddress = ethers.utils.getAddress(reactorAddressSlot.slice(SLOT_LENGTH - ADDRESS_LENGTH)).toLowerCase()

    if (!REVERSE_REACTOR_MAPPING[reactorAddress]) {
      throw new MissingConfiguration('reactor', reactorAddress)
    }

    return REVERSE_REACTOR_MAPPING[reactorAddress].orderType
  }

  /**
   * Determines the OrderType from an Order object
   * @return OrderType
   */
  getOrderType(order: Order): OrderType {
    const { orderType } = REVERSE_REACTOR_MAPPING[order.info.reactor.toLowerCase()]
    return orderType
  }

  /**
   * Helper function to determine the OrderType from a serialized order
   */
  getOrderTypeFromEncoded(order: string, chainId: number): OrderType {
    const parsedOrder = this.parseOrder(order, chainId)
    return this.getOrderType(parsedOrder)
  }
}

export class UniswapXOrderParser extends OrderParser {
  orderInfoOffset = UNISWAPX_ORDER_INFO_OFFSET

  /**
   * Parses a serialized order
   */
  parseOrder(order: string, chainId: number): UniswapXOrder {
    // First try resolver-based detection for V4 orders
    const v4OrderType = this.detectV4OrderType(order)
    if (v4OrderType) {
      return this.parseV4Order(order, chainId, v4OrderType)
    }

    // Fall back to reactor-based detection for V1-V3
    const orderType = this._parseOrder(order)
    switch (orderType) {
      case OrderType.Dutch:
        return DutchOrder.parse(order, chainId)
      case OrderType.Dutch_V2: {
        // cosigned and unsigned serialized versions are the same format
        const cosignedOrder = CosignedV2DutchOrder.parse(order, chainId)
        // if no cosignature, returned unsigned variant
        if (cosignedOrder.info.cosignature === '0x') {
          return UnsignedV2DutchOrder.parse(order, chainId)
        }
        // if cosignature exists then returned cosigned version
        return cosignedOrder
      }
      case OrderType.Dutch_V3: {
        // cosigned and unsigned serialized versions are the same format
        const cosignedOrder = CosignedV3DutchOrder.parse(order, chainId)
        // if no cosignature, returned unsigned variant
        if (cosignedOrder.info.cosignature === '0x') {
          return UnsignedV3DutchOrder.parse(order, chainId)
        }
        // if cosignature exists then returned cosigned version
        return cosignedOrder
      }
      case OrderType.Priority: {
        // cosigned and unsigned serialized versions are the same format
        const cosignedOrder = CosignedPriorityOrder.parse(order, chainId)
        // if no cosignature, returned unsigned variant
        if (cosignedOrder.info.cosignature === '0x') {
          return UnsignedPriorityOrder.parse(order, chainId)
        }
        // if cosignature exists then returned cosigned version
        return cosignedOrder
      }
      default:
        throw new MissingConfiguration('orderType', orderType)
    }
  }

  /**
   * Detects V4 order type by checking if the first address is a known resolver
   * V4 orders are serialized as: (resolver, orderData)
   */
  private detectV4OrderType(order: string): OrderType | null {
    try {
      const abiCoder = new ethers.utils.AbiCoder()
      const [resolver] = abiCoder.decode(['address', 'bytes'], order)
      const resolverLower = resolver.toLowerCase()
      if (REVERSE_RESOLVER_MAPPING[resolverLower]) {
        return REVERSE_RESOLVER_MAPPING[resolverLower].orderType
      }
    } catch {
      // Not a V4 order format
    }
    return null
  }

  /**
   * Parses a V4 order based on its resolver
   */
  private parseV4Order(order: string, chainId: number, orderType: OrderType): UniswapXOrder {
    switch (orderType) {
      case OrderType.Hybrid: {
        const cosignedOrder = CosignedHybridOrder.parse(order, chainId)
        if (cosignedOrder.info.cosignature === '0x') {
          return UnsignedHybridOrder.parse(order, chainId)
        }
        return cosignedOrder
      }
      default:
        throw new MissingConfiguration('v4OrderType', orderType)
    }
  }

  /**
   * Determine the order type of a UniswapX order
   * @dev Special cases limit orders which are dutch orders with no output decay
   * @dev V4 orders (like HybridOrder) are detected by instance check since they use resolver-based lookup
   */
  getOrderType(order: Order): OrderType {
    // V4 orders: check by instance type
    if (order instanceof UnsignedHybridOrder || order instanceof CosignedHybridOrder) {
      return OrderType.Hybrid
    }

    // V1-V3 orders: use reactor-based lookup
    const { orderType } = REVERSE_REACTOR_MAPPING[order.info.reactor.toLowerCase()]

    if (orderType == OrderType.Dutch) {
      const input = (order as DutchOrder).info.input
      const outputs = (order as DutchOrder).info.outputs
      const isLimit =
        input.startAmount.eq(input.endAmount) && outputs.every((output) => output.startAmount.eq(output.endAmount))

      return isLimit ? OrderType.Limit : OrderType.Dutch
    }

    return orderType
  }
}

export class RelayOrderParser extends OrderParser {
  orderInfoOffset = RELAY_ORDER_INFO_OFFSET

  /**
   * Parses a serialized order
   */
  parseOrder(order: string, chainId: number): RelayOrder {
    return RelayOrder.parse(order, chainId)
  }
}

export function originalIfZero(value: BigNumber, original: BigNumber): BigNumber {
  return value.isZero() ? original : value
}
