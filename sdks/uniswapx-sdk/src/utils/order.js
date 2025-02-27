"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RelayOrderParser = exports.UniswapXOrderParser = void 0;
exports.originalIfZero = originalIfZero;
const ethers_1 = require("ethers");
const constants_1 = require("../constants");
const errors_1 = require("../errors");
const order_1 = require("../order");
const V3DutchOrder_1 = require("../order/V3DutchOrder");
const _1 = require(".");
const UNISWAPX_ORDER_INFO_OFFSET = 64;
const RELAY_ORDER_INFO_OFFSET = 64;
const SLOT_LENGTH = 64;
const ADDRESS_LENGTH = 40;
class OrderParser {
    /**
     * Parses a serialized order based on the order shape
     * @dev called by derived classes which set the offset
     */
    _parseOrder(order) {
        const strippedOrder = (0, _1.stripHexPrefix)(order);
        // look up the tail offset of orderInfo
        // orderInfo is always the first field in the order,
        // but since it is dynamic size it is a pointer in the tail
        const orderInfoOffsetBytes = parseInt(strippedOrder.slice(this.orderInfoOffset, this.orderInfoOffset + SLOT_LENGTH), 16);
        // multiply tail offset by 2 to get in terms of hex characters instead of bytes
        // and add one slot to skip the orderinfo size slot
        const reactorAddressOffset = orderInfoOffsetBytes * 2 + SLOT_LENGTH;
        const reactorAddressSlot = strippedOrder.slice(reactorAddressOffset, reactorAddressOffset + SLOT_LENGTH);
        // slice off the 0 padding in front of the address
        const reactorAddress = ethers_1.ethers.utils
            .getAddress(reactorAddressSlot.slice(SLOT_LENGTH - ADDRESS_LENGTH))
            .toLowerCase();
        if (!constants_1.REVERSE_REACTOR_MAPPING[reactorAddress]) {
            throw new errors_1.MissingConfiguration("reactor", reactorAddress);
        }
        return constants_1.REVERSE_REACTOR_MAPPING[reactorAddress].orderType;
    }
    /**
     * Determines the OrderType from an Order object
     * @return OrderType
     */
    getOrderType(order) {
        const { orderType } = constants_1.REVERSE_REACTOR_MAPPING[order.info.reactor.toLowerCase()];
        return orderType;
    }
    /**
     * Helper function to determine the OrderType from a serialized order
     */
    getOrderTypeFromEncoded(order, chainId) {
        const parsedOrder = this.parseOrder(order, chainId);
        return this.getOrderType(parsedOrder);
    }
}
class UniswapXOrderParser extends OrderParser {
    orderInfoOffset = UNISWAPX_ORDER_INFO_OFFSET;
    /**
     * Parses a serialized order
     */
    parseOrder(order, chainId) {
        const orderType = this._parseOrder(order);
        switch (orderType) {
            case constants_1.OrderType.Dutch:
                return order_1.DutchOrder.parse(order, chainId);
            case constants_1.OrderType.Dutch_V2: {
                // cosigned and unsigned serialized versions are the same format
                const cosignedOrder = order_1.CosignedV2DutchOrder.parse(order, chainId);
                // if no cosignature, returned unsigned variant
                if (cosignedOrder.info.cosignature === "0x") {
                    return order_1.UnsignedV2DutchOrder.parse(order, chainId);
                }
                // if cosignature exists then returned cosigned version
                return cosignedOrder;
            }
            case constants_1.OrderType.Dutch_V3: {
                // cosigned and unsigned serialized versions are the same format
                const cosignedOrder = V3DutchOrder_1.CosignedV3DutchOrder.parse(order, chainId);
                // if no cosignature, returned unsigned variant
                if (cosignedOrder.info.cosignature === "0x") {
                    return V3DutchOrder_1.UnsignedV3DutchOrder.parse(order, chainId);
                }
                // if cosignature exists then returned cosigned version
                return cosignedOrder;
            }
            case constants_1.OrderType.Priority: {
                // cosigned and unsigned serialized versions are the same format
                const cosignedOrder = order_1.CosignedPriorityOrder.parse(order, chainId);
                // if no cosignature, returned unsigned variant
                if (cosignedOrder.info.cosignature === "0x") {
                    return order_1.UnsignedPriorityOrder.parse(order, chainId);
                }
                // if cosignature exists then returned cosigned version
                return cosignedOrder;
            }
            default:
                throw new errors_1.MissingConfiguration("orderType", orderType);
        }
    }
    /**
     * Determine the order type of a UniswapX order
     * @dev Special cases limit orders which are dutch orders with no output decay
     */
    getOrderType(order) {
        const { orderType } = constants_1.REVERSE_REACTOR_MAPPING[order.info.reactor.toLowerCase()];
        if (orderType == constants_1.OrderType.Dutch) {
            const input = order.info.input;
            const outputs = order.info.outputs;
            const isLimit = input.startAmount.eq(input.endAmount) &&
                outputs.every((output) => output.startAmount.eq(output.endAmount));
            return isLimit ? constants_1.OrderType.Limit : constants_1.OrderType.Dutch;
        }
        return orderType;
    }
}
exports.UniswapXOrderParser = UniswapXOrderParser;
class RelayOrderParser extends OrderParser {
    orderInfoOffset = RELAY_ORDER_INFO_OFFSET;
    /**
     * Parses a serialized order
     */
    parseOrder(order, chainId) {
        return order_1.RelayOrder.parse(order, chainId);
    }
}
exports.RelayOrderParser = RelayOrderParser;
function originalIfZero(value, original) {
    return value.isZero() ? original : value;
}
//# sourceMappingURL=order.js.map