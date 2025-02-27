"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.V2DutchOrderBuilder = void 0;
const tslib_1 = require("tslib");
const ethers_1 = require("ethers");
const tiny_invariant_1 = tslib_1.__importDefault(require("tiny-invariant"));
const constants_1 = require("../constants");
const order_1 = require("../order");
const utils_1 = require("../utils");
const OrderBuilder_1 = require("./OrderBuilder");
/**
 * Helper builder for generating dutch limit orders
 */
class V2DutchOrderBuilder extends OrderBuilder_1.OrderBuilder {
    chainId;
    info;
    permit2Address;
    static fromOrder(order) {
        const builder = new V2DutchOrderBuilder(order.chainId, order.info.reactor)
            .deadline(order.info.deadline)
            .swapper(order.info.swapper)
            .nonce(order.info.nonce)
            .input(order.info.input)
            .cosigner(order.info.cosigner)
            .validation({
            additionalValidationContract: order.info.additionalValidationContract,
            additionalValidationData: order.info.additionalValidationData,
        });
        for (const output of order.info.outputs) {
            builder.output(output);
        }
        if (order instanceof order_1.CosignedV2DutchOrder) {
            builder.cosignature(order.info.cosignature);
            builder.decayEndTime(order.info.cosignerData.decayEndTime);
            builder.decayStartTime(order.info.cosignerData.decayStartTime);
            builder.cosignerData(order.info.cosignerData);
        }
        return builder;
    }
    constructor(chainId, reactorAddress, _permit2Address) {
        super();
        this.chainId = chainId;
        this.reactor((0, utils_1.getReactor)(chainId, constants_1.OrderType.Dutch_V2, reactorAddress));
        this.permit2Address = (0, utils_1.getPermit2)(chainId, _permit2Address);
        this.info = {
            outputs: [],
            cosignerData: {
                decayStartTime: 0,
                decayEndTime: 0,
                exclusiveFiller: ethers_1.ethers.constants.AddressZero,
                exclusivityOverrideBps: ethers_1.BigNumber.from(0),
                inputOverride: ethers_1.BigNumber.from(0),
                outputOverrides: [],
            },
        };
    }
    decayStartTime(decayStartTime) {
        if (!this.info.cosignerData) {
            this.initializeCosignerData({ decayStartTime });
        }
        else {
            this.info.cosignerData.decayStartTime = decayStartTime;
        }
        return this;
    }
    decayEndTime(decayEndTime) {
        if (!this.info.cosignerData) {
            this.initializeCosignerData({ decayEndTime });
        }
        else {
            this.info.cosignerData.decayEndTime = decayEndTime;
        }
        if (!this.orderInfo.deadline) {
            super.deadline(decayEndTime);
        }
        return this;
    }
    input(input) {
        this.info.input = input;
        return this;
    }
    output(output) {
        (0, tiny_invariant_1.default)(output.startAmount.gte(output.endAmount), `startAmount must be greater than endAmount: ${output.startAmount.toString()}`);
        this.info.outputs?.push(output);
        return this;
    }
    deadline(deadline) {
        super.deadline(deadline);
        if (!this.info.cosignerData) {
            this.initializeCosignerData({ decayEndTime: deadline });
        }
        else if (!this.info.cosignerData.decayEndTime) {
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
    exclusiveFiller(exclusiveFiller) {
        if (!this.info.cosignerData) {
            this.info.cosignerData = {
                decayStartTime: 0,
                decayEndTime: 0,
                exclusiveFiller: exclusiveFiller,
                exclusivityOverrideBps: ethers_1.BigNumber.from(0),
                inputOverride: ethers_1.BigNumber.from(0),
                outputOverrides: [],
            };
        }
        this.info.cosignerData.exclusiveFiller = exclusiveFiller;
        return this;
    }
    exclusivityOverrideBps(exclusivityOverrideBps) {
        if (!this.info.cosignerData) {
            this.info.cosignerData = {
                decayStartTime: 0,
                decayEndTime: 0,
                exclusiveFiller: ethers_1.ethers.constants.AddressZero,
                exclusivityOverrideBps: exclusivityOverrideBps,
                inputOverride: ethers_1.BigNumber.from(0),
                outputOverrides: [],
            };
        }
        this.info.cosignerData.exclusivityOverrideBps = exclusivityOverrideBps;
        return this;
    }
    inputOverride(inputOverride) {
        if (!this.info.cosignerData) {
            this.initializeCosignerData({ inputOverride });
        }
        else {
            this.info.cosignerData.inputOverride = inputOverride;
        }
        return this;
    }
    outputOverrides(outputOverrides) {
        if (!this.info.cosignerData) {
            this.initializeCosignerData({ outputOverrides });
        }
        else {
            this.info.cosignerData.outputOverrides = outputOverrides;
        }
        return this;
    }
    cosigner(cosigner) {
        this.info.cosigner = cosigner;
        return this;
    }
    cosignature(cosignature) {
        this.info.cosignature = cosignature;
        return this;
    }
    cosignerData(cosignerData) {
        this.decayStartTime(cosignerData.decayStartTime);
        this.decayEndTime(cosignerData.decayEndTime);
        this.exclusiveFiller(cosignerData.exclusiveFiller);
        this.exclusivityOverrideBps(cosignerData.exclusivityOverrideBps);
        this.inputOverride(cosignerData.inputOverride);
        this.outputOverrides(cosignerData.outputOverrides);
        return this;
    }
    buildPartial() {
        (0, tiny_invariant_1.default)(this.info.cosigner !== undefined, "cosigner not set");
        (0, tiny_invariant_1.default)(this.info.input !== undefined, "input not set");
        (0, tiny_invariant_1.default)(this.info.outputs && this.info.outputs.length > 0, "outputs not set");
        (0, tiny_invariant_1.default)(this.info.input !== undefined, "original input not set");
        (0, tiny_invariant_1.default)(!this.orderInfo.deadline ||
            (this.info.cosignerData &&
                this.info.cosignerData.decayStartTime <= this.orderInfo.deadline), `if present, decayStartTime must be before or same as deadline: ${this.info.cosignerData?.decayStartTime}`);
        (0, tiny_invariant_1.default)(!this.orderInfo.deadline ||
            (this.info.cosignerData &&
                this.info.cosignerData.decayEndTime <= this.orderInfo.deadline), `if present, decayEndTime must be before or same as deadline: ${this.info.cosignerData?.decayEndTime}`);
        return new order_1.UnsignedV2DutchOrder(Object.assign(this.getOrderInfo(), {
            input: this.info.input,
            outputs: this.info.outputs,
            cosigner: this.info.cosigner,
        }), this.chainId, this.permit2Address);
    }
    build() {
        (0, tiny_invariant_1.default)(this.info.cosigner !== undefined, "cosigner not set");
        (0, tiny_invariant_1.default)(this.info.cosignature !== undefined, "cosignature not set");
        (0, tiny_invariant_1.default)(this.info.input !== undefined, "input not set");
        (0, tiny_invariant_1.default)(this.info.outputs && this.info.outputs.length > 0, "outputs not set");
        (0, tiny_invariant_1.default)(this.info.cosignerData !== undefined, "cosignerData not set");
        (0, tiny_invariant_1.default)(this.info.cosignerData.decayStartTime !== undefined, "decayStartTime not set");
        (0, tiny_invariant_1.default)(this.info.cosignerData.decayEndTime !== undefined ||
            this.orderInfo.deadline !== undefined, "Neither decayEndTime or deadline not set");
        (0, tiny_invariant_1.default)(this.info.cosignerData.exclusiveFiller !== undefined, "exclusiveFiller not set");
        (0, tiny_invariant_1.default)(this.info.cosignerData.exclusivityOverrideBps !== undefined, "exclusivityOverrideBps not set");
        (0, tiny_invariant_1.default)(this.info.cosignerData.inputOverride.lte(this.info.input.startAmount), "inputOverride larger than original input");
        (0, tiny_invariant_1.default)(this.info.cosignerData.outputOverrides.length > 0, "outputOverrides not set");
        this.info.cosignerData.outputOverrides.forEach((override, idx) => {
            (0, tiny_invariant_1.default)(
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            override.gte(this.info.outputs[idx].startAmount), "outputOverride must be larger than or equal to original output");
        });
        (0, tiny_invariant_1.default)(this.info.input !== undefined, "original input not set");
        (0, tiny_invariant_1.default)(!this.orderInfo.deadline ||
            this.info.cosignerData.decayStartTime <= this.orderInfo.deadline, `decayStartTime must be before or same as deadline: ${this.info.cosignerData.decayStartTime}`);
        (0, tiny_invariant_1.default)(!this.orderInfo.deadline ||
            this.info.cosignerData.decayEndTime <= this.orderInfo.deadline, `decayEndTime must be before or same as deadline: ${this.info.cosignerData.decayEndTime}`);
        return new order_1.CosignedV2DutchOrder(Object.assign(this.getOrderInfo(), {
            cosignerData: this.info.cosignerData,
            input: this.info.input,
            outputs: this.info.outputs,
            cosigner: this.info.cosigner,
            cosignature: this.info.cosignature,
        }), this.chainId, this.permit2Address);
    }
    initializeCosignerData(overrides) {
        this.info.cosignerData = {
            decayStartTime: 0,
            decayEndTime: 0,
            exclusiveFiller: ethers_1.ethers.constants.AddressZero,
            exclusivityOverrideBps: ethers_1.BigNumber.from(0),
            inputOverride: ethers_1.BigNumber.from(0),
            outputOverrides: [],
            ...overrides,
        };
    }
}
exports.V2DutchOrderBuilder = V2DutchOrderBuilder;
//# sourceMappingURL=V2DutchOrderBuilder.js.map