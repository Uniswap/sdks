"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RelayOrderValidator = exports.OrderValidator = void 0;
const OrderQuoter_1 = require("./OrderQuoter");
/**
 * UniswapX order validator
 */
class OrderValidator extends OrderQuoter_1.UniswapXOrderQuoter {
    async validate(order) {
        return (await super.quote(order)).validation;
    }
    async validateBatch(orders) {
        return (await super.quoteBatch(orders)).map((order) => order.validation);
    }
}
exports.OrderValidator = OrderValidator;
class RelayOrderValidator extends OrderQuoter_1.RelayOrderQuoter {
    async validate(order) {
        return (await super.quote(order)).validation;
    }
    async validateBatch(orders) {
        return (await super.quoteBatch(orders)).map((order) => order.validation);
    }
}
exports.RelayOrderValidator = RelayOrderValidator;
//# sourceMappingURL=OrderValidator.js.map