"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DutchOrderBuilder = void 0;
const tslib_1 = require("tslib");
const ethers_1 = require("ethers");
const tiny_invariant_1 = tslib_1.__importDefault(require("tiny-invariant"));
const constants_1 = require("../constants");
const errors_1 = require("../errors");
const order_1 = require("../order");
const OrderBuilder_1 = require("./OrderBuilder");
/**
 * Helper builder for generating dutch limit orders
 */
class DutchOrderBuilder extends OrderBuilder_1.OrderBuilder {
    chainId;
    permit2Address;
    info;
    static fromOrder(order) {
        // note chainId not used if passing in true reactor address
        const builder = new DutchOrderBuilder(order.chainId, order.info.reactor)
            .deadline(order.info.deadline)
            .decayEndTime(order.info.decayEndTime)
            .decayStartTime(order.info.decayStartTime)
            .swapper(order.info.swapper)
            .nonce(order.info.nonce)
            .input(order.info.input)
            .exclusiveFiller(order.info.exclusiveFiller, order.info.exclusivityOverrideBps)
            .validation({
            additionalValidationContract: order.info.additionalValidationContract,
            additionalValidationData: order.info.additionalValidationData,
        });
        for (const output of order.info.outputs) {
            builder.output(output);
        }
        return builder;
    }
    constructor(chainId, reactorAddress, permit2Address) {
        super();
        this.chainId = chainId;
        this.permit2Address = permit2Address;
        const mappedReactorAddress = constants_1.REACTOR_ADDRESS_MAPPING[chainId]
            ? constants_1.REACTOR_ADDRESS_MAPPING[chainId][constants_1.OrderType.Dutch]
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
        this.info = {
            outputs: [],
            exclusiveFiller: ethers_1.ethers.constants.AddressZero,
            exclusivityOverrideBps: ethers_1.BigNumber.from(0),
        };
    }
    decayStartTime(decayStartTime) {
        this.info.decayStartTime = decayStartTime;
        return this;
    }
    decayEndTime(decayEndTime) {
        if (this.orderInfo.deadline === undefined) {
            super.deadline(decayEndTime);
        }
        this.info.decayEndTime = decayEndTime;
        return this;
    }
    input(input) {
        this.info.input = input;
        return this;
    }
    output(output) {
        if (!this.info.outputs) {
            this.info.outputs = [];
        }
        (0, tiny_invariant_1.default)(output.startAmount.gte(output.endAmount), `startAmount must be greater than endAmount: ${output.startAmount.toString()}`);
        this.info.outputs.push(output);
        return this;
    }
    deadline(deadline) {
        super.deadline(deadline);
        if (this.info.decayEndTime === undefined) {
            this.decayEndTime(deadline);
        }
        return this;
    }
    swapper(swapper) {
        super.swapper(swapper);
        return this;
    }
    nonce(nonce) {
        super.nonce(nonce);
        return this;
    }
    validation(info) {
        super.validation(info);
        return this;
    }
    // ensures that we only change non fee outputs
    nonFeeRecipient(newRecipient, feeRecipient) {
        (0, tiny_invariant_1.default)(newRecipient !== feeRecipient, `newRecipient must be different from feeRecipient: ${newRecipient}`);
        if (!this.info.outputs) {
            return this;
        }
        this.info.outputs = this.info.outputs.map((output) => {
            // if fee output then pass through
            if (feeRecipient &&
                output.recipient.toLowerCase() === feeRecipient.toLowerCase()) {
                return output;
            }
            return {
                ...output,
                recipient: newRecipient,
            };
        });
        return this;
    }
    exclusiveFiller(exclusiveFiller, exclusivityOverrideBps) {
        this.info.exclusiveFiller = exclusiveFiller;
        this.info.exclusivityOverrideBps = exclusivityOverrideBps;
        return this;
    }
    build() {
        (0, tiny_invariant_1.default)(this.info.decayStartTime !== undefined, "decayStartTime not set");
        (0, tiny_invariant_1.default)(this.info.input !== undefined, "input not set");
        (0, tiny_invariant_1.default)(this.info.decayEndTime !== undefined, "decayEndTime not set");
        (0, tiny_invariant_1.default)(this.info.exclusiveFiller !== undefined, "exclusiveFiller not set");
        (0, tiny_invariant_1.default)(this.info.exclusivityOverrideBps !== undefined, "exclusivityOverrideBps not set");
        (0, tiny_invariant_1.default)(this.info.outputs !== undefined && this.info.outputs.length !== 0, "outputs not set");
        (0, tiny_invariant_1.default)(this.info.decayEndTime !== undefined ||
            this.getOrderInfo().deadline !== undefined, "Must set either deadline or decayEndTime");
        (0, tiny_invariant_1.default)(!this.orderInfo.deadline ||
            this.info.decayStartTime <= this.orderInfo.deadline, `decayStartTime must be before or same as deadline: ${this.info.decayStartTime}`);
        (0, tiny_invariant_1.default)(!this.orderInfo.deadline ||
            this.info.decayEndTime <= this.orderInfo.deadline, `decayEndTime must be before or same as deadline: ${this.info.decayEndTime}`);
        return new order_1.DutchOrder(Object.assign(this.getOrderInfo(), {
            decayStartTime: this.info.decayStartTime,
            decayEndTime: this.info.decayEndTime,
            exclusiveFiller: this.info.exclusiveFiller,
            exclusivityOverrideBps: this.info.exclusivityOverrideBps,
            input: this.info.input,
            outputs: this.info.outputs,
        }), this.chainId, this.permit2Address);
    }
}
exports.DutchOrderBuilder = DutchOrderBuilder;
//# sourceMappingURL=DutchOrderBuilder.js.map