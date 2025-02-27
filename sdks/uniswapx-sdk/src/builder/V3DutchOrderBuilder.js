"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.V3DutchOrderBuilder = void 0;
const tslib_1 = require("tslib");
const ethers_1 = require("ethers");
const tiny_invariant_1 = tslib_1.__importDefault(require("tiny-invariant"));
const constants_1 = require("../constants");
const V3DutchOrder_1 = require("../order/V3DutchOrder");
const utils_1 = require("../utils");
const OrderBuilder_1 = require("./OrderBuilder");
class V3DutchOrderBuilder extends OrderBuilder_1.OrderBuilder {
    chainId;
    static fromOrder(order) {
        const builder = new V3DutchOrderBuilder(order.chainId, order.info.reactor);
        builder
            .cosigner(order.info.cosigner)
            .startingBaseFee(order.info.startingBaseFee)
            .input(order.info.input)
            .deadline(order.info.deadline)
            .nonce(order.info.nonce)
            .swapper(order.info.swapper)
            .validation({
            additionalValidationContract: order.info.additionalValidationContract,
            additionalValidationData: order.info.additionalValidationData,
        });
        order.info.outputs.forEach((output) => {
            builder.output(output);
        });
        if (order instanceof V3DutchOrder_1.CosignedV3DutchOrder) {
            builder.cosignature(order.info.cosignature);
            builder.decayStartBlock(order.info.cosignerData.decayStartBlock);
            builder.exclusiveFiller(order.info.cosignerData.exclusiveFiller);
            builder.inputOverride(order.info.cosignerData.inputOverride);
            builder.exclusivityOverrideBps(order.info.cosignerData.exclusivityOverrideBps);
            builder.outputOverrides(order.info.cosignerData.outputOverrides);
        }
        return builder;
    }
    build() {
        (0, tiny_invariant_1.default)(this.info.cosignature !== undefined, "cosignature not set");
        this.checkUnsignedInvariants(this.info);
        this.checkCosignedInvariants(this.info);
        return new V3DutchOrder_1.CosignedV3DutchOrder(Object.assign(this.getOrderInfo(), {
            cosignerData: this.info.cosignerData,
            startingBaseFee: this.info.startingBaseFee,
            input: this.info.input,
            outputs: this.info.outputs,
            cosigner: this.info.cosigner,
            cosignature: this.info.cosignature,
        }), this.chainId, this.permit2Address);
    }
    permit2Address;
    info;
    constructor(chainId, reactorAddress, _permit2Address) {
        super();
        this.chainId = chainId;
        this.reactor((0, utils_1.getReactor)(chainId, constants_1.OrderType.Dutch_V3, reactorAddress));
        this.permit2Address = (0, utils_1.getPermit2)(chainId, _permit2Address);
        this.info = {
            outputs: [],
        };
        this.initializeCosignerData({});
    }
    cosigner(cosigner) {
        this.info.cosigner = cosigner;
        return this;
    }
    cosignature(cosignature) {
        this.info.cosignature = cosignature;
        return this;
    }
    decayStartBlock(decayStartBlock) {
        if (!this.info.cosignerData) {
            this.initializeCosignerData({ decayStartBlock });
        }
        else {
            this.info.cosignerData.decayStartBlock = decayStartBlock;
        }
        return this;
    }
    initializeCosignerData(data) {
        this.info.cosignerData = {
            decayStartBlock: 0,
            exclusiveFiller: ethers_1.ethers.constants.AddressZero,
            exclusivityOverrideBps: ethers_1.BigNumber.from(0),
            inputOverride: ethers_1.BigNumber.from(0),
            outputOverrides: [],
            ...data,
        };
    }
    isRelativeBlocksIncreasing(relativeBlocks) {
        let prevBlock = 0;
        for (const block of relativeBlocks) {
            if (block <= prevBlock) {
                return false;
            }
            prevBlock = block;
        }
        return true;
    }
    checkUnsignedInvariants(info) {
        (0, tiny_invariant_1.default)(info.cosigner !== undefined, "cosigner not set");
        (0, tiny_invariant_1.default)(info.startingBaseFee !== undefined, "startingBaseFee not set");
        (0, tiny_invariant_1.default)(info.input !== undefined, "input not set");
        (0, tiny_invariant_1.default)(info.outputs && info.outputs.length > 0, "outputs not set");
        // Check if input curve is valid
        (0, tiny_invariant_1.default)(info.input.curve.relativeAmounts.length ===
            info.input.curve.relativeBlocks.length, "relativeBlocks and relativeAmounts length mismatch");
        (0, tiny_invariant_1.default)(this.isRelativeBlocksIncreasing(info.input.curve.relativeBlocks), "relativeBlocks not strictly increasing");
        // For each output's curve, we need to make sure relativeBlocks is strictly increasing
        info.outputs.forEach((output) => {
            (0, tiny_invariant_1.default)(output.curve.relativeBlocks.length ===
                output.curve.relativeAmounts.length, "relativeBlocks and relativeAmounts length mismatch");
            // For each output's curve, we need to make sure relativeBlocks is strictly increasing
            (0, tiny_invariant_1.default)(this.isRelativeBlocksIncreasing(output.curve.relativeBlocks), "relativeBlocks not strictly increasing");
        });
        // In V3, we don't have a decayEndTime field and use OrderInfo.deadline field for Permit2
        (0, tiny_invariant_1.default)(this.orderInfo.deadline !== undefined, "deadline not set");
        (0, tiny_invariant_1.default)(this.orderInfo.swapper !== undefined, "swapper not set");
    }
    checkCosignedInvariants(info) {
        // In V3, we are not enforcing that the startAmount is greater than the endAmount
        (0, tiny_invariant_1.default)(info.cosignerData !== undefined, "cosignerData not set");
        (0, tiny_invariant_1.default)(info.cosignerData.decayStartBlock !== undefined, "decayStartBlock not set");
        (0, tiny_invariant_1.default)(info.cosignerData.exclusiveFiller !== undefined, "exclusiveFiller not set");
        (0, tiny_invariant_1.default)(info.cosignerData.exclusivityOverrideBps !== undefined, "exclusivityOverrideBps not set");
        (0, tiny_invariant_1.default)(info.cosignerData.outputOverrides.length > 0, "outputOverrides not set");
        (0, tiny_invariant_1.default)(
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        info.cosignerData.inputOverride.lte(this.info.input.startAmount), "inputOverride larger than original input");
        info.cosignerData.outputOverrides.forEach((override, idx) => {
            if (override.toString() != "0") {
                (0, tiny_invariant_1.default)(
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                override.gte(this.info.outputs[idx].startAmount), "outputOverride smaller than original output");
            }
        });
        // We are not checking if the decayStartBlock is before the deadline because it is not enforced in the smart contract
    }
    startingBaseFee(startingBaseFee) {
        this.info.startingBaseFee = startingBaseFee;
        return this;
    }
    input(input) {
        this.info.input = input;
        return this;
    }
    output(output) {
        this.info.outputs?.push(output);
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
    deadline(deadline) {
        super.deadline(deadline);
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
    cosignerData(cosignerData) {
        this.decayStartBlock(cosignerData.decayStartBlock);
        this.exclusiveFiller(cosignerData.exclusiveFiller);
        this.exclusivityOverrideBps(cosignerData.exclusivityOverrideBps);
        this.inputOverride(cosignerData.inputOverride);
        this.outputOverrides(cosignerData.outputOverrides);
        return this;
    }
    exclusiveFiller(exclusiveFiller) {
        if (!this.info.cosignerData) {
            this.initializeCosignerData({ exclusiveFiller });
        }
        else {
            this.info.cosignerData.exclusiveFiller = exclusiveFiller;
        }
        return this;
    }
    exclusivityOverrideBps(exclusivityOverrideBps) {
        if (!this.info.cosignerData) {
            this.initializeCosignerData({ exclusivityOverrideBps });
        }
        else {
            this.info.cosignerData.exclusivityOverrideBps = exclusivityOverrideBps;
        }
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
    buildPartial() {
        //build an unsigned order
        this.checkUnsignedInvariants(this.info);
        return new V3DutchOrder_1.UnsignedV3DutchOrder(Object.assign(this.getOrderInfo(), {
            input: this.info.input,
            outputs: this.info.outputs,
            cosigner: this.info.cosigner,
            startingBaseFee: this.info.startingBaseFee,
        }), this.chainId, this.permit2Address);
    }
    // A helper function for users of the class to easily find the value to pass to maxAmount in an input
    static getMaxAmountOut(startAmount, relativeAmounts) {
        if (relativeAmounts.length == 0) {
            return startAmount;
        }
        // Find the minimum of the relative amounts
        const minRelativeAmount = relativeAmounts.reduce((min, amount) => (amount < min ? amount : min), BigInt(0));
        // Maximum is the start - the min of the relative amounts
        const maxOut = startAmount.sub(minRelativeAmount.toString());
        return maxOut;
    }
    // A helper function for users of the class find the lowest possible output amount
    static getMinAmountOut(startAmount, relativeAmounts) {
        if (relativeAmounts.length == 0) {
            return startAmount;
        }
        // Find the maximum of the relative amounts
        const maxRelativeAmount = relativeAmounts.reduce((max, amount) => (amount > max ? amount : max), BigInt(0));
        // Minimum is the start - the max of the relative amounts
        const minOut = startAmount.sub(maxRelativeAmount.toString());
        return minOut;
    }
}
exports.V3DutchOrderBuilder = V3DutchOrderBuilder;
//# sourceMappingURL=V3DutchOrderBuilder.js.map