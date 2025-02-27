"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PriorityOrderBuilder = void 0;
const tslib_1 = require("tslib");
const ethers_1 = require("ethers");
const tiny_invariant_1 = tslib_1.__importDefault(require("tiny-invariant"));
const constants_1 = require("../constants");
const order_1 = require("../order");
const utils_1 = require("../utils");
const OrderBuilder_1 = require("./OrderBuilder");
/**
 * Helper builder for generating priority gas auction orders
 */
class PriorityOrderBuilder extends OrderBuilder_1.OrderBuilder {
    chainId;
    permit2Address;
    info;
    static fromOrder(order) {
        // note chainId not used if passing in true reactor address
        const builder = new PriorityOrderBuilder(order.chainId, order.info.reactor, order.permit2Address)
            .deadline(order.info.deadline)
            .swapper(order.info.swapper)
            .nonce(order.info.nonce)
            .input(order.info.input)
            .auctionStartBlock(order.info.auctionStartBlock)
            .baselinePriorityFeeWei(order.info.baselinePriorityFeeWei)
            .cosigner(order.info.cosigner)
            .validation({
            additionalValidationContract: order.info.additionalValidationContract,
            additionalValidationData: order.info.additionalValidationData,
        });
        for (const output of order.info.outputs) {
            builder.output(output);
        }
        if (isCosigned(order)) {
            builder.cosignature(order.info.cosignature);
            builder.auctionTargetBlock(order.info.cosignerData.auctionTargetBlock);
        }
        return builder;
    }
    constructor(chainId, reactorAddress, permit2Address) {
        super();
        this.chainId = chainId;
        this.permit2Address = permit2Address;
        this.reactor((0, utils_1.getReactor)(chainId, constants_1.OrderType.Priority, reactorAddress));
        this.permit2Address = (0, utils_1.getPermit2)(chainId, permit2Address);
        this.info = {
            cosignerData: {
                auctionTargetBlock: ethers_1.BigNumber.from(0),
            },
            outputs: [],
        };
    }
    cosigner(cosigner) {
        this.info.cosigner = cosigner;
        return this;
    }
    auctionStartBlock(auctionStartBlock) {
        this.info.auctionStartBlock = auctionStartBlock;
        return this;
    }
    auctionTargetBlock(auctionTargetBlock) {
        if (!this.info.cosignerData) {
            this.info.cosignerData = {
                auctionTargetBlock: auctionTargetBlock,
            };
        }
        else {
            this.info.cosignerData.auctionTargetBlock = auctionTargetBlock;
        }
        return this;
    }
    baselinePriorityFeeWei(baselinePriorityFeeWei) {
        this.info.baselinePriorityFeeWei = baselinePriorityFeeWei;
        return this;
    }
    cosignerData(cosignerData) {
        this.info.cosignerData = cosignerData;
        return this;
    }
    cosignature(cosignature) {
        this.info.cosignature = cosignature;
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
        this.info.outputs.push(output);
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
        (0, tiny_invariant_1.default)(this.info.input !== undefined, "input not set");
        (0, tiny_invariant_1.default)(this.info.cosigner !== undefined, "cosigner not set");
        (0, tiny_invariant_1.default)(this.info.baselinePriorityFeeWei !== undefined, "baselinePriorityFeeWei not set");
        (0, tiny_invariant_1.default)(this.info.outputs !== undefined && this.info.outputs.length !== 0, "outputs not set");
        (0, tiny_invariant_1.default)(this.info.auctionStartBlock !== undefined &&
            this.info.auctionStartBlock.gt(0), "auctionStartBlock not set");
        (0, tiny_invariant_1.default)(!this.info.input.mpsPerPriorityFeeWei.eq(0) ||
            this.info.outputs.every((output) => !output.mpsPerPriorityFeeWei.eq(0)), "Priority auction not configured");
        (0, tiny_invariant_1.default)(!(this.info.input.mpsPerPriorityFeeWei.gt(0) &&
            this.info.outputs.every((output) => output.mpsPerPriorityFeeWei.gt(0))), "Can only configure priority auction on either input or output");
        return new order_1.UnsignedPriorityOrder(Object.assign(this.getOrderInfo(), {
            cosigner: this.info.cosigner,
            auctionStartBlock: this.info.auctionStartBlock,
            baselinePriorityFeeWei: this.info.baselinePriorityFeeWei,
            input: this.info.input,
            outputs: this.info.outputs,
        }), this.chainId, this.permit2Address);
    }
    build() {
        (0, tiny_invariant_1.default)(this.info.input !== undefined, "input not set");
        (0, tiny_invariant_1.default)(this.info.cosigner !== undefined, "cosigner not set");
        (0, tiny_invariant_1.default)(this.info.cosignature !== undefined, "cosignature not set");
        (0, tiny_invariant_1.default)(this.info.baselinePriorityFeeWei !== undefined, "baselinePriorityFeeWei not set");
        (0, tiny_invariant_1.default)(this.info.outputs !== undefined && this.info.outputs.length !== 0, "outputs not set");
        (0, tiny_invariant_1.default)(this.info.auctionStartBlock !== undefined &&
            this.info.auctionStartBlock.gt(0), "auctionStartBlock not set");
        (0, tiny_invariant_1.default)(this.info.cosignerData !== undefined &&
            this.info.cosignerData.auctionTargetBlock.gt(0) &&
            this.info.cosignerData.auctionTargetBlock.lte(this.info.auctionStartBlock), "auctionTargetBlock not set properly");
        (0, tiny_invariant_1.default)(!this.info.input.mpsPerPriorityFeeWei.eq(0) ||
            this.info.outputs.every((output) => !output.mpsPerPriorityFeeWei.eq(0)), "Priority auction not configured");
        (0, tiny_invariant_1.default)(!(this.info.input.mpsPerPriorityFeeWei.gt(0) &&
            this.info.outputs.some((output) => output.mpsPerPriorityFeeWei.gt(0))), "Can only configure priority auction on either input or output");
        return new order_1.CosignedPriorityOrder(Object.assign(this.getOrderInfo(), {
            cosigner: this.info.cosigner,
            auctionStartBlock: this.info.auctionStartBlock,
            baselinePriorityFeeWei: this.info.baselinePriorityFeeWei,
            input: this.info.input,
            outputs: this.info.outputs,
            cosignerData: this.info.cosignerData,
            cosignature: this.info.cosignature,
        }), this.chainId, this.permit2Address);
    }
}
exports.PriorityOrderBuilder = PriorityOrderBuilder;
function isCosigned(order) {
    return order.info.cosignature !== undefined;
}
//# sourceMappingURL=PriorityOrderBuilder.js.map