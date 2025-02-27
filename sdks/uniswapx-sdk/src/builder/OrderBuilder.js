"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.OrderBuilder = void 0;
const tslib_1 = require("tslib");
const ethers_1 = require("ethers");
const tiny_invariant_1 = tslib_1.__importDefault(require("tiny-invariant"));
/**
 * Builder for generating orders
 */
class OrderBuilder {
    orderInfo;
    constructor() {
        // set defaults
        this.orderInfo = {
            additionalValidationContract: ethers_1.ethers.constants.AddressZero,
            additionalValidationData: "0x",
        };
    }
    deadline(deadline) {
        this.orderInfo.deadline = deadline;
        return this;
    }
    nonce(nonce) {
        this.orderInfo.nonce = nonce;
        return this;
    }
    swapper(swapper) {
        this.orderInfo.swapper = swapper;
        return this;
    }
    validation(info) {
        this.orderInfo.additionalValidationContract =
            info.additionalValidationContract;
        this.orderInfo.additionalValidationData = info.additionalValidationData;
        return this;
    }
    reactor(reactor) {
        this.orderInfo.reactor = reactor;
        return this;
    }
    getOrderInfo() {
        (0, tiny_invariant_1.default)(this.orderInfo.reactor !== undefined, "reactor not set");
        (0, tiny_invariant_1.default)(this.orderInfo.nonce !== undefined, "nonce not set");
        (0, tiny_invariant_1.default)(this.orderInfo.deadline !== undefined, "deadline not set");
        (0, tiny_invariant_1.default)(this.orderInfo.deadline > Date.now() / 1000, `Deadline must be in the future: ${this.orderInfo.deadline}`);
        (0, tiny_invariant_1.default)(this.orderInfo.swapper !== undefined, "swapper not set");
        (0, tiny_invariant_1.default)(this.orderInfo.additionalValidationContract !== undefined, "validation contract not set");
        (0, tiny_invariant_1.default)(this.orderInfo.additionalValidationData !== undefined, "validation data not set");
        return {
            reactor: this.orderInfo.reactor,
            swapper: this.orderInfo.swapper,
            nonce: this.orderInfo.nonce,
            deadline: this.orderInfo.deadline,
            additionalValidationContract: this.orderInfo.additionalValidationContract,
            additionalValidationData: this.orderInfo.additionalValidationData,
        };
    }
}
exports.OrderBuilder = OrderBuilder;
//# sourceMappingURL=OrderBuilder.js.map