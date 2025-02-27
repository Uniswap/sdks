"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CosignedPriorityOrder = exports.UnsignedPriorityOrder = exports.OrderNotFillable = void 0;
const bytes_1 = require("@ethersproject/bytes");
const permit2_sdk_1 = require("@uniswap/permit2-sdk");
const ethers_1 = require("ethers");
const constants_1 = require("../constants");
const utils_1 = require("../utils");
const validation_1 = require("./validation");
class OrderNotFillable extends Error {
    constructor(message) {
        super(message);
        this.name = "OrderNotFillable";
    }
}
exports.OrderNotFillable = OrderNotFillable;
const PRIORITY_COSIGNER_DATA_TUPLE_ABI = "tuple(uint256)";
const PRIORITY_ORDER_TYPES = {
    PriorityOrder: [
        { name: "info", type: "OrderInfo" },
        { name: "cosigner", type: "address" },
        { name: "auctionStartBlock", type: "uint256" },
        { name: "baselinePriorityFeeWei", type: "uint256" },
        { name: "input", type: "PriorityInput" },
        { name: "outputs", type: "PriorityOutput[]" },
    ],
    OrderInfo: [
        { name: "reactor", type: "address" },
        { name: "swapper", type: "address" },
        { name: "nonce", type: "uint256" },
        { name: "deadline", type: "uint256" },
        { name: "additionalValidationContract", type: "address" },
        { name: "additionalValidationData", type: "bytes" },
    ],
    PriorityInput: [
        { name: "token", type: "address" },
        { name: "amount", type: "uint256" },
        { name: "mpsPerPriorityFeeWei", type: "uint256" },
    ],
    PriorityOutput: [
        { name: "token", type: "address" },
        { name: "amount", type: "uint256" },
        { name: "mpsPerPriorityFeeWei", type: "uint256" },
        { name: "recipient", type: "address" },
    ],
};
const PRIORITY_ORDER_ABI = [
    "tuple(" +
        [
            "tuple(address,address,uint256,uint256,address,bytes)", // OrderInfo
            "address", // cosigner
            "uint256", // auctionStartBlock
            "uint256", // baselinePriorityFeeWei
            "tuple(address,uint256,uint256)", // input
            "tuple(address,uint256,uint256,address)[]", // outputs
            "tuple(uint256)", // cosignerData
            "bytes", // cosignature
        ].join(",") +
        ")",
];
class UnsignedPriorityOrder {
    info;
    chainId;
    permit2Address;
    constructor(info, chainId, _permit2Address) {
        this.info = info;
        this.chainId = chainId;
        this.permit2Address = (0, utils_1.getPermit2)(chainId, _permit2Address);
    }
    static fromJSON(json, chainId, _permit2Address) {
        return new UnsignedPriorityOrder({
            ...json,
            cosigner: json.cosigner,
            auctionStartBlock: ethers_1.BigNumber.from(json.auctionStartBlock),
            baselinePriorityFeeWei: ethers_1.BigNumber.from(json.baselinePriorityFeeWei),
            nonce: ethers_1.BigNumber.from(json.nonce),
            input: {
                token: json.input.token,
                amount: ethers_1.BigNumber.from(json.input.amount),
                mpsPerPriorityFeeWei: ethers_1.BigNumber.from(json.input.mpsPerPriorityFeeWei),
            },
            outputs: json.outputs.map((output) => ({
                token: output.token,
                amount: ethers_1.BigNumber.from(output.amount),
                mpsPerPriorityFeeWei: ethers_1.BigNumber.from(output.mpsPerPriorityFeeWei),
                recipient: output.recipient,
            })),
        }, chainId, _permit2Address);
    }
    static parse(encoded, chainId, permit2) {
        return new UnsignedPriorityOrder(parseSerializedOrder(encoded), chainId, permit2);
    }
    /**
     * @inheritdoc order
     */
    toJSON() {
        return {
            chainId: this.chainId,
            permit2Address: this.permit2Address,
            reactor: this.info.reactor,
            swapper: this.info.swapper,
            nonce: this.info.nonce.toString(),
            deadline: this.info.deadline,
            additionalValidationContract: this.info.additionalValidationContract,
            additionalValidationData: this.info.additionalValidationData,
            cosigner: this.info.cosigner,
            auctionStartBlock: this.info.auctionStartBlock.toString(),
            baselinePriorityFeeWei: this.info.baselinePriorityFeeWei.toString(),
            input: {
                token: this.info.input.token,
                amount: this.info.input.amount.toString(),
                mpsPerPriorityFeeWei: this.info.input.mpsPerPriorityFeeWei.toString(),
            },
            outputs: this.info.outputs.map((output) => ({
                token: output.token,
                amount: output.amount.toString(),
                mpsPerPriorityFeeWei: output.mpsPerPriorityFeeWei.toString(),
                recipient: output.recipient,
            })),
        };
    }
    /**
     * @inheritdoc Order
     */
    get blockOverrides() {
        return {
            number: (0, bytes_1.hexStripZeros)(this.info.auctionStartBlock.toHexString()),
        };
    }
    /**
     * @inheritdoc order
     */
    serialize() {
        const abiCoder = new ethers_1.ethers.utils.AbiCoder();
        return abiCoder.encode(PRIORITY_ORDER_ABI, [
            [
                [
                    this.info.reactor,
                    this.info.swapper,
                    this.info.nonce,
                    this.info.deadline,
                    this.info.additionalValidationContract,
                    this.info.additionalValidationData,
                ],
                this.info.cosigner,
                this.info.auctionStartBlock,
                this.info.baselinePriorityFeeWei,
                [
                    this.info.input.token,
                    this.info.input.amount,
                    this.info.input.mpsPerPriorityFeeWei,
                ],
                this.info.outputs.map((output) => [
                    output.token,
                    output.amount,
                    output.mpsPerPriorityFeeWei,
                    output.recipient,
                ]),
                // use empty default for cosignerData and cosignature
                [0],
                "0x",
            ],
        ]);
    }
    /**
     * @inheritdoc Order
     */
    getSigner(signature) {
        return ethers_1.ethers.utils.computeAddress(ethers_1.ethers.utils.recoverPublicKey(permit2_sdk_1.SignatureTransfer.hash(this.toPermit(), this.permit2Address, this.chainId, this.witness()), signature));
    }
    /**
     * @inheritdoc Order
     */
    permitData() {
        return permit2_sdk_1.SignatureTransfer.getPermitData(this.toPermit(), this.permit2Address, this.chainId, this.witness());
    }
    /**
     * @inheritdoc Order
     */
    hash() {
        return ethers_1.ethers.utils._TypedDataEncoder
            .from(PRIORITY_ORDER_TYPES)
            .hash(this.witnessInfo());
    }
    /**
     * Returns the resolved order with the given options
     * @return The resolved order
     */
    resolve(_options) {
        // no cosigner data so no resolution possible
        throw new Error("Method not implemented.");
    }
    /**
     * Returns the parsed validation
     * @return The parsed validation data for the order
     */
    get validation() {
        return (0, validation_1.parseValidation)(this.info);
    }
    toPermit() {
        return {
            permitted: {
                token: this.info.input.token,
                amount: this.info.input.amount,
            },
            spender: this.info.reactor,
            nonce: this.info.nonce,
            deadline: this.info.deadline,
        };
    }
    witnessInfo() {
        return {
            info: {
                reactor: this.info.reactor,
                swapper: this.info.swapper,
                nonce: this.info.nonce,
                deadline: this.info.deadline,
                additionalValidationContract: this.info.additionalValidationContract,
                additionalValidationData: this.info.additionalValidationData,
            },
            cosigner: this.info.cosigner,
            auctionStartBlock: this.info.auctionStartBlock,
            baselinePriorityFeeWei: this.info.baselinePriorityFeeWei,
            input: this.info.input,
            outputs: this.info.outputs,
        };
    }
    witness() {
        return {
            witness: this.witnessInfo(),
            witnessTypeName: "PriorityOrder",
            witnessType: PRIORITY_ORDER_TYPES,
        };
    }
    /**
     * Full order hash that should be signed over by the cosigner
     */
    cosignatureHash(cosignerData) {
        const abiCoder = new ethers_1.ethers.utils.AbiCoder();
        return ethers_1.ethers.utils.solidityKeccak256(["bytes32", "uint256", "bytes"], [
            this.hash(),
            this.chainId,
            abiCoder.encode([PRIORITY_COSIGNER_DATA_TUPLE_ABI], [[cosignerData.auctionTargetBlock]]),
        ]);
    }
}
exports.UnsignedPriorityOrder = UnsignedPriorityOrder;
class CosignedPriorityOrder extends UnsignedPriorityOrder {
    info;
    chainId;
    // build a cosigned order from an unsigned order plus cosigner data
    static fromUnsignedOrder(order, cosignerData, cosignature) {
        return new CosignedPriorityOrder({
            ...order.info,
            cosignerData,
            cosignature,
        }, order.chainId, order.permit2Address);
    }
    // build a cosigned order from json
    static fromJSON(json, chainId, _permit2Address) {
        return new CosignedPriorityOrder({
            ...json,
            nonce: ethers_1.BigNumber.from(json.nonce),
            cosigner: json.cosigner,
            auctionStartBlock: ethers_1.BigNumber.from(json.auctionStartBlock),
            baselinePriorityFeeWei: ethers_1.BigNumber.from(json.baselinePriorityFeeWei),
            input: {
                token: json.input.token,
                amount: ethers_1.BigNumber.from(json.input.amount),
                mpsPerPriorityFeeWei: ethers_1.BigNumber.from(json.input.mpsPerPriorityFeeWei),
            },
            outputs: json.outputs.map((output) => ({
                token: output.token,
                amount: ethers_1.BigNumber.from(output.amount),
                mpsPerPriorityFeeWei: ethers_1.BigNumber.from(output.mpsPerPriorityFeeWei),
                recipient: output.recipient,
            })),
            cosignerData: {
                auctionTargetBlock: ethers_1.BigNumber.from(json.cosignerData.auctionTargetBlock),
            },
            cosignature: json.cosignature,
        }, chainId, _permit2Address);
    }
    // build a cosigned order from serialized
    static parse(encoded, chainId, permit2) {
        return new CosignedPriorityOrder(parseSerializedOrder(encoded), chainId, permit2);
    }
    constructor(info, chainId, _permit2Address) {
        super(info, chainId, _permit2Address);
        this.info = info;
        this.chainId = chainId;
    }
    /**
     * @inheritdoc order
     */
    toJSON() {
        return {
            ...super.toJSON(),
            cosignerData: {
                auctionTargetBlock: this.info.cosignerData.auctionTargetBlock.toString(),
            },
            cosignature: this.info.cosignature,
        };
    }
    /**
     * @inheritdoc Order
     */
    resolve(options) {
        if (options.currentBlock) {
            if (this.info.cosignerData.auctionTargetBlock.gt(0) &&
                options.currentBlock.lt(this.info.cosignerData.auctionTargetBlock)) {
                throw new OrderNotFillable("Target block in the future");
            }
            else if (options.currentBlock.lt(this.info.auctionStartBlock)) {
                throw new OrderNotFillable("Start block in the future");
            }
        }
        return {
            input: {
                token: this.info.input.token,
                amount: scaleInput(this.info.input, options.priorityFee),
            },
            outputs: scaleOutputs(this.info.outputs, options.priorityFee),
        };
    }
    /**
     * @inheritdoc Order
     */
    get blockOverrides() {
        return {
            number: (0, bytes_1.hexStripZeros)(this.info.cosignerData.auctionTargetBlock.toHexString()),
        };
    }
    /**
     * @inheritdoc order
     */
    serialize() {
        const abiCoder = new ethers_1.ethers.utils.AbiCoder();
        return abiCoder.encode(PRIORITY_ORDER_ABI, [
            [
                [
                    this.info.reactor,
                    this.info.swapper,
                    this.info.nonce,
                    this.info.deadline,
                    this.info.additionalValidationContract,
                    this.info.additionalValidationData,
                ],
                this.info.cosigner,
                this.info.auctionStartBlock,
                this.info.baselinePriorityFeeWei,
                [
                    this.info.input.token,
                    this.info.input.amount,
                    this.info.input.mpsPerPriorityFeeWei,
                ],
                this.info.outputs.map((output) => [
                    output.token,
                    output.amount,
                    output.mpsPerPriorityFeeWei,
                    output.recipient,
                ]),
                [this.info.cosignerData.auctionTargetBlock],
                this.info.cosignature,
            ],
        ]);
    }
    /**
     *  recovers co-signer address from cosignature and full order hash
     *  @returns The address which co-signed the order
     */
    recoverCosigner() {
        return ethers_1.ethers.utils.verifyMessage(this.cosignatureHash(this.info.cosignerData), this.info.cosignature);
    }
}
exports.CosignedPriorityOrder = CosignedPriorityOrder;
function parseSerializedOrder(serialized) {
    const abiCoder = new ethers_1.ethers.utils.AbiCoder();
    const decoded = abiCoder.decode(PRIORITY_ORDER_ABI, serialized);
    const [[[reactor, swapper, nonce, deadline, additionalValidationContract, additionalValidationData,], cosigner, auctionStartBlock, baselinePriorityFeeWei, [token, amount, mpsPerPriorityFeeWei], outputs, [auctionTargetBlock], cosignature,],] = decoded;
    return {
        reactor,
        swapper,
        nonce,
        deadline: deadline.toNumber(),
        additionalValidationContract,
        additionalValidationData,
        cosigner,
        auctionStartBlock,
        baselinePriorityFeeWei,
        input: {
            token,
            amount,
            mpsPerPriorityFeeWei,
        },
        outputs: outputs.map(([token, amount, mpsPerPriorityFeeWei, recipient]) => {
            return {
                token,
                amount,
                mpsPerPriorityFeeWei,
                recipient,
            };
        }),
        cosignerData: {
            auctionTargetBlock,
        },
        cosignature,
    };
}
function scaleInput(input, priorityFee) {
    if (priorityFee.mul(input.mpsPerPriorityFeeWei).gte(constants_1.MPS)) {
        return ethers_1.BigNumber.from(0);
    }
    return input.amount
        .mul(constants_1.MPS.sub(priorityFee.mul(input.mpsPerPriorityFeeWei)))
        .div(constants_1.MPS);
}
function scaleOutputs(outputs, priorityFee) {
    return outputs.map((output) => {
        const product = output.amount.mul(constants_1.MPS.add(priorityFee.mul(output.mpsPerPriorityFeeWei)));
        const mod = product.mod(constants_1.MPS);
        const div = product.div(constants_1.MPS);
        return {
            ...output,
            amount: mod.eq(0) ? div : div.add(1),
        };
    });
}
//# sourceMappingURL=PriorityOrder.js.map