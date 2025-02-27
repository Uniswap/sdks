"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RelayOrderBuilder = void 0;
const tslib_1 = require("tslib");
const tiny_invariant_1 = tslib_1.__importDefault(require("tiny-invariant"));
const constants_1 = require("../constants");
const errors_1 = require("../errors");
const order_1 = require("../order");
/**
 * Helper builder for generating relay orders
 */
class RelayOrderBuilder {
    chainId;
    permit2Address;
    info = {};
    static fromOrder(order) {
        // note chainId not used if passing in true reactor address
        const builder = new RelayOrderBuilder(order.chainId, order.info.reactor)
            .deadline(order.info.deadline)
            .swapper(order.info.swapper)
            .nonce(order.info.nonce)
            .universalRouterCalldata(order.info.universalRouterCalldata)
            .input(order.info.input)
            .fee(order.info.fee)
            .feeStartTime(order.info.fee.startTime)
            .feeEndTime(order.info.fee.endTime);
        return builder;
    }
    constructor(chainId, reactorAddress, permit2Address) {
        this.chainId = chainId;
        this.permit2Address = permit2Address;
        const mappedReactorAddress = constants_1.REACTOR_ADDRESS_MAPPING[chainId]
            ? constants_1.REACTOR_ADDRESS_MAPPING[chainId][constants_1.OrderType.Relay]
            : undefined;
        if (reactorAddress) {
            this.reactor(reactorAddress);
        }
        else if (mappedReactorAddress) {
            this.reactor(mappedReactorAddress);
        }
        else {
            throw new errors_1.MissingConfiguration("reactor", chainId.toString());
        }
    }
    reactor(reactor) {
        this.info.reactor = reactor;
        return this;
    }
    deadline(deadline) {
        this.info.deadline = deadline;
        return this;
    }
    nonce(nonce) {
        this.info.nonce = nonce;
        return this;
    }
    swapper(swapper) {
        this.info.swapper = swapper;
        return this;
    }
    // TODO: perform some calldata validation here
    universalRouterCalldata(universalRouterCalldata) {
        this.info.universalRouterCalldata = universalRouterCalldata;
        return this;
    }
    feeStartTime(feeStartTime) {
        (0, tiny_invariant_1.default)(this.info.fee !== undefined, "fee not set");
        this.info.fee = {
            ...this.info.fee,
            startTime: feeStartTime,
        };
        return this;
    }
    feeEndTime(feeEndTime) {
        (0, tiny_invariant_1.default)(this.info.fee !== undefined, "fee not set");
        if (this.info.deadline === undefined) {
            this.info.deadline = feeEndTime;
        }
        this.info.fee = {
            ...this.info.fee,
            endTime: feeEndTime,
        };
        return this;
    }
    input(input) {
        this.info.input = input;
        return this;
    }
    fee(fee) {
        (0, tiny_invariant_1.default)(fee.startAmount.lte(fee.endAmount), `startAmount must be less than or equal than endAmount: ${fee.startAmount.toString()}`);
        this.info.fee = fee;
        return this;
    }
    build() {
        (0, tiny_invariant_1.default)(this.info.reactor !== undefined, "reactor not set");
        (0, tiny_invariant_1.default)(this.info.nonce !== undefined, "nonce not set");
        (0, tiny_invariant_1.default)(this.info.deadline !== undefined, "deadline not set");
        (0, tiny_invariant_1.default)(this.info.deadline > Date.now() / 1000, `Deadline must be in the future: ${this.info.deadline}`);
        (0, tiny_invariant_1.default)(this.info.swapper !== undefined, "swapper not set");
        (0, tiny_invariant_1.default)(this.info.universalRouterCalldata !== undefined, "universalRouterCalldata not set");
        (0, tiny_invariant_1.default)(this.info.input !== undefined, "input not set");
        (0, tiny_invariant_1.default)(this.info.fee !== undefined, "fee not set");
        (0, tiny_invariant_1.default)(!this.info.deadline || this.info.fee.startTime <= this.info.deadline, `feeStartTime must be before or same as deadline: ${this.info.fee.startTime}`);
        (0, tiny_invariant_1.default)(!this.info.deadline || this.info.fee.endTime <= this.info.deadline, `feeEndTime must be before or same as deadline: ${this.info.fee.endTime}`);
        return new order_1.RelayOrder(Object.assign(this.info, {
            reactor: this.info.reactor,
            swapper: this.info.swapper,
            nonce: this.info.nonce,
            deadline: this.info.deadline,
            input: this.info.input,
            fee: this.info.fee,
            universalRouterCalldata: this.info.universalRouterCalldata,
        }), this.chainId, this.permit2Address);
    }
}
exports.RelayOrderBuilder = RelayOrderBuilder;
//# sourceMappingURL=RelayOrderBuilder.js.map