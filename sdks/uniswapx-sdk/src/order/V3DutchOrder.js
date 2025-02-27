"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CosignedV3DutchOrder = exports.UnsignedV3DutchOrder = exports.V3_DUTCH_ORDER_TYPES = void 0;
exports.encodeRelativeBlocks = encodeRelativeBlocks;
const permit2_sdk_1 = require("@uniswap/permit2-sdk");
const ethers_1 = require("ethers");
const utils_1 = require("../utils");
const dutchBlockDecay_1 = require("../utils/dutchBlockDecay");
const order_1 = require("../utils/order");
const COSIGNER_DATA_TUPLE_ABI = "tuple(uint256,address,uint256,uint256,uint256[])";
exports.V3_DUTCH_ORDER_TYPES = {
    V3DutchOrder: [
        { name: "info", type: "OrderInfo" },
        { name: "cosigner", type: "address" },
        { name: "startingBaseFee", type: "uint256" },
        { name: "baseInput", type: "V3DutchInput" },
        { name: "baseOutputs", type: "V3DutchOutput[]" },
    ],
    OrderInfo: [
        { name: "reactor", type: "address" },
        { name: "swapper", type: "address" },
        { name: "nonce", type: "uint256" },
        { name: "deadline", type: "uint256" },
        { name: "additionalValidationContract", type: "address" },
        { name: "additionalValidationData", type: "bytes" },
    ],
    V3DutchInput: [
        { name: "token", type: "address" },
        { name: "startAmount", type: "uint256" },
        { name: "curve", type: "NonlinearDutchDecay" },
        { name: "maxAmount", type: "uint256" },
        { name: "adjustmentPerGweiBaseFee", type: "uint256" },
    ],
    V3DutchOutput: [
        { name: "token", type: "address" },
        { name: "startAmount", type: "uint256" },
        { name: "curve", type: "NonlinearDutchDecay" },
        { name: "recipient", type: "address" },
        { name: "minAmount", type: "uint256" },
        { name: "adjustmentPerGweiBaseFee", type: "uint256" },
    ],
    NonlinearDutchDecay: [
        { name: "relativeBlocks", type: "uint256" },
        { name: "relativeAmounts", type: "int256[]" },
    ],
};
const V3_DUTCH_ORDER_ABI = [
    "tuple(" +
        [
            "tuple(address,address,uint256,uint256,address,bytes)", // OrderInfo
            "address", // Cosigner
            "uint256", //startingBaseFee
            "tuple(address,uint256,tuple(uint256,int256[]),uint256,uint256)", // V3DutchInput
            "tuple(address,uint256,tuple(uint256,int256[]),address,uint256,uint256)[]", // V3DutchOutput
            COSIGNER_DATA_TUPLE_ABI,
            "bytes", // Cosignature
        ].join(",") +
        ")",
];
class UnsignedV3DutchOrder {
    info;
    chainId;
    permit2Address;
    constructor(info, chainId, _permit2Address) {
        this.info = info;
        this.chainId = chainId;
        this.permit2Address = (0, utils_1.getPermit2)(chainId, _permit2Address);
    }
    static fromJSON(json, chainId, _permit2Address) {
        return new UnsignedV3DutchOrder({
            ...json,
            nonce: ethers_1.BigNumber.from(json.nonce),
            startingBaseFee: ethers_1.BigNumber.from(json.startingBaseFee),
            input: {
                ...json.input,
                startAmount: ethers_1.BigNumber.from(json.input.startAmount),
                curve: {
                    relativeBlocks: json.input.curve.relativeBlocks,
                    relativeAmounts: json.input.curve.relativeAmounts.map((amount) => BigInt(amount)),
                },
                maxAmount: ethers_1.BigNumber.from(json.input.maxAmount),
                adjustmentPerGweiBaseFee: ethers_1.BigNumber.from(json.input.adjustmentPerGweiBaseFee),
            },
            outputs: json.outputs.map((output) => ({
                ...output,
                startAmount: ethers_1.BigNumber.from(output.startAmount),
                curve: {
                    relativeBlocks: output.curve.relativeBlocks,
                    relativeAmounts: output.curve.relativeAmounts.map((amount) => BigInt(amount)),
                },
                minAmount: ethers_1.BigNumber.from(output.minAmount),
                adjustmentPerGweiBaseFee: ethers_1.BigNumber.from(output.adjustmentPerGweiBaseFee),
            })),
        }, chainId, _permit2Address);
    }
    /**
     * @inheritdoc order
     */
    get blockOverrides() {
        return undefined;
    }
    /**
     * @inheritdoc order
     */
    serialize() {
        const encodedRelativeBlocks = encodeRelativeBlocks(this.info.input.curve.relativeBlocks);
        const abiCoder = new ethers_1.ethers.utils.AbiCoder();
        return abiCoder.encode(V3_DUTCH_ORDER_ABI, [
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
                this.info.startingBaseFee,
                [
                    this.info.input.token,
                    this.info.input.startAmount,
                    [encodedRelativeBlocks, this.info.input.curve.relativeAmounts],
                    this.info.input.maxAmount,
                    this.info.input.adjustmentPerGweiBaseFee,
                ],
                this.info.outputs.map((output) => [
                    output.token,
                    output.startAmount,
                    [encodedRelativeBlocks, output.curve.relativeAmounts],
                    output.recipient,
                    output.minAmount,
                    output.adjustmentPerGweiBaseFee,
                ]),
                [0, ethers_1.ethers.constants.AddressZero, 0, 0, [0]],
                "0x",
            ],
        ]);
    }
    /**
     * @inheritdoc order
     */
    toJSON() {
        return {
            reactor: this.info.reactor,
            swapper: this.info.swapper,
            nonce: this.info.nonce.toString(),
            deadline: this.info.deadline,
            additionalValidationContract: this.info.additionalValidationContract,
            additionalValidationData: this.info.additionalValidationData,
            cosigner: this.info.cosigner,
            startingBaseFee: this.info.startingBaseFee.toString(),
            input: {
                token: this.info.input.token,
                startAmount: this.info.input.startAmount.toString(),
                curve: {
                    relativeBlocks: this.info.input.curve.relativeBlocks,
                    relativeAmounts: this.info.input.curve.relativeAmounts.map((amount) => amount.toString()),
                },
                maxAmount: this.info.input.maxAmount.toString(),
                adjustmentPerGweiBaseFee: this.info.input.adjustmentPerGweiBaseFee.toString(),
            },
            outputs: this.info.outputs.map((output) => ({
                token: output.token,
                startAmount: output.startAmount.toString(),
                curve: {
                    relativeBlocks: output.curve.relativeBlocks,
                    relativeAmounts: output.curve.relativeAmounts.map((amount) => amount.toString()),
                },
                recipient: output.recipient,
                minAmount: output.minAmount.toString(),
                adjustmentPerGweiBaseFee: output.adjustmentPerGweiBaseFee.toString(),
            })),
            chainId: this.chainId,
            permit2Address: this.permit2Address,
        };
    }
    permitData() {
        return permit2_sdk_1.SignatureTransfer.getPermitData(this.toPermit(), this.permit2Address, this.chainId, this.witness());
    }
    toPermit() {
        return {
            permitted: {
                token: this.info.input.token,
                amount: this.info.input.maxAmount,
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
            startingBaseFee: this.info.startingBaseFee,
            baseInput: {
                token: this.info.input.token,
                startAmount: this.info.input.startAmount,
                curve: {
                    relativeBlocks: encodeRelativeBlocks(this.info.input.curve.relativeBlocks),
                    relativeAmounts: this.info.input.curve.relativeAmounts.map((amount) => amount.toString()),
                },
                maxAmount: this.info.input.maxAmount,
                adjustmentPerGweiBaseFee: this.info.input.adjustmentPerGweiBaseFee,
            },
            baseOutputs: this.info.outputs.map((output) => ({
                token: output.token,
                startAmount: output.startAmount,
                curve: {
                    relativeBlocks: encodeRelativeBlocks(output.curve.relativeBlocks),
                    relativeAmounts: output.curve.relativeAmounts.map((amount) => amount.toString()),
                },
                recipient: output.recipient,
                minAmount: output.minAmount,
                adjustmentPerGweiBaseFee: output.adjustmentPerGweiBaseFee,
            })),
        };
    }
    witness() {
        return {
            witness: this.witnessInfo(),
            witnessTypeName: "V3DutchOrder",
            witnessType: exports.V3_DUTCH_ORDER_TYPES,
        };
    }
    getSigner(signature) {
        return ethers_1.ethers.utils.computeAddress(ethers_1.ethers.utils.recoverPublicKey(permit2_sdk_1.SignatureTransfer.hash(this.toPermit(), this.permit2Address, this.chainId, this.witness()), signature));
    }
    hash() {
        const witnessInfo = this.witnessInfo();
        return ethers_1.ethers.utils._TypedDataEncoder
            .from(exports.V3_DUTCH_ORDER_TYPES)
            .hash(witnessInfo);
    }
    /**
     * Full order hash that should be signed over by the cosigner
     */
    cosignatureHash(cosignerData) {
        const abiCoder = new ethers_1.ethers.utils.AbiCoder();
        return ethers_1.ethers.utils.solidityKeccak256(["bytes32", "uint256", "bytes"], [
            this.hash(),
            this.chainId,
            abiCoder.encode([COSIGNER_DATA_TUPLE_ABI], [
                [
                    cosignerData.decayStartBlock,
                    cosignerData.exclusiveFiller,
                    cosignerData.exclusivityOverrideBps,
                    cosignerData.inputOverride,
                    cosignerData.outputOverrides,
                ],
            ]),
        ]);
    }
    static parse(encoded, chainId, permit2) {
        return new UnsignedV3DutchOrder(parseSerializedOrder(encoded), chainId, permit2);
    }
}
exports.UnsignedV3DutchOrder = UnsignedV3DutchOrder;
class CosignedV3DutchOrder extends UnsignedV3DutchOrder {
    info;
    chainId;
    static fromUnsignedOrder(order, cosignerData, cosignature) {
        return new CosignedV3DutchOrder({
            ...order.info,
            cosignerData,
            cosignature,
        }, order.chainId, order.permit2Address);
    }
    static fromJSON(json, chainId, _permit2Address) {
        return new CosignedV3DutchOrder({
            ...json,
            nonce: ethers_1.BigNumber.from(json.nonce),
            startingBaseFee: ethers_1.BigNumber.from(json.startingBaseFee),
            input: {
                token: json.input.token,
                startAmount: ethers_1.BigNumber.from(json.input.startAmount),
                curve: {
                    relativeBlocks: json.input.curve.relativeBlocks,
                    relativeAmounts: json.input.curve.relativeAmounts.map((amount) => BigInt(amount)),
                },
                maxAmount: ethers_1.BigNumber.from(json.input.maxAmount),
                adjustmentPerGweiBaseFee: ethers_1.BigNumber.from(json.input.adjustmentPerGweiBaseFee),
            },
            outputs: json.outputs.map((output) => ({
                token: output.token,
                startAmount: ethers_1.BigNumber.from(output.startAmount),
                curve: {
                    relativeBlocks: output.curve.relativeBlocks,
                    relativeAmounts: output.curve.relativeAmounts.map((amount) => BigInt(amount)),
                },
                recipient: output.recipient,
                minAmount: ethers_1.BigNumber.from(output.minAmount),
                adjustmentPerGweiBaseFee: ethers_1.BigNumber.from(output.adjustmentPerGweiBaseFee),
            })),
            cosignerData: {
                decayStartBlock: json.cosignerData.decayStartBlock,
                exclusiveFiller: json.cosignerData.exclusiveFiller,
                exclusivityOverrideBps: ethers_1.BigNumber.from(json.cosignerData.exclusivityOverrideBps),
                inputOverride: ethers_1.BigNumber.from(json.cosignerData.inputOverride),
                outputOverrides: json.cosignerData.outputOverrides.map(ethers_1.BigNumber.from),
            },
            cosignature: json.cosignature,
        }, chainId, _permit2Address);
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
                decayStartBlock: this.info.cosignerData.decayStartBlock,
                exclusiveFiller: this.info.cosignerData.exclusiveFiller,
                exclusivityOverrideBps: this.info.cosignerData.exclusivityOverrideBps.toNumber(),
                inputOverride: this.info.cosignerData.inputOverride.toString(),
                outputOverrides: this.info.cosignerData.outputOverrides.map((override) => override.toString()),
            },
            cosignature: this.info.cosignature,
        };
    }
    static parse(encoded, chainId, permit2) {
        return new CosignedV3DutchOrder(parseSerializedOrder(encoded), chainId, permit2);
    }
    serialize() {
        const encodedInputRelativeBlocks = encodeRelativeBlocks(this.info.input.curve.relativeBlocks);
        const abiCoder = new ethers_1.ethers.utils.AbiCoder();
        return abiCoder.encode(V3_DUTCH_ORDER_ABI, [
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
                this.info.startingBaseFee,
                [
                    this.info.input.token,
                    this.info.input.startAmount,
                    [encodedInputRelativeBlocks, this.info.input.curve.relativeAmounts],
                    this.info.input.maxAmount,
                    this.info.input.adjustmentPerGweiBaseFee,
                ],
                this.info.outputs.map((output) => [
                    output.token,
                    output.startAmount,
                    [
                        encodeRelativeBlocks(output.curve.relativeBlocks),
                        output.curve.relativeAmounts,
                    ],
                    output.recipient,
                    output.minAmount,
                    output.adjustmentPerGweiBaseFee,
                ]),
                [
                    this.info.cosignerData.decayStartBlock,
                    this.info.cosignerData.exclusiveFiller,
                    this.info.cosignerData.exclusivityOverrideBps,
                    this.info.cosignerData.inputOverride.toString(),
                    this.info.cosignerData.outputOverrides.map((override) => override.toString()),
                ],
                this.info.cosignature,
            ],
        ]);
    }
    recoverCosigner() {
        const messageHash = this.cosignatureHash(this.info.cosignerData);
        const signature = this.info.cosignature;
        return ethers_1.ethers.utils.recoverAddress(messageHash, signature);
    }
    resolve(options) {
        return {
            input: {
                token: this.info.input.token,
                amount: (0, dutchBlockDecay_1.getBlockDecayedAmount)({
                    decayStartBlock: this.info.cosignerData.decayStartBlock,
                    startAmount: (0, order_1.originalIfZero)(this.info.cosignerData.inputOverride, this.info.input.startAmount),
                    relativeBlocks: this.info.input.curve.relativeBlocks,
                    relativeAmounts: this.info.input.curve.relativeAmounts,
                }, options.currentBlock),
            },
            outputs: this.info.outputs.map((output, idx) => {
                return {
                    token: output.token,
                    amount: (0, dutchBlockDecay_1.getBlockDecayedAmount)({
                        decayStartBlock: this.info.cosignerData.decayStartBlock,
                        startAmount: (0, order_1.originalIfZero)(this.info.cosignerData.outputOverrides[idx], output.startAmount),
                        relativeBlocks: output.curve.relativeBlocks,
                        relativeAmounts: output.curve.relativeAmounts,
                    }, options.currentBlock),
                };
            }),
        };
    }
}
exports.CosignedV3DutchOrder = CosignedV3DutchOrder;
function parseSerializedOrder(serialized) {
    const abiCoder = new ethers_1.ethers.utils.AbiCoder();
    const decoded = abiCoder.decode(V3_DUTCH_ORDER_ABI, serialized);
    const [[[reactor, swapper, nonce, deadline, additionalValidationContract, additionalValidationData,], cosigner, startingBaseFee, [token, startAmount, [inputRelativeBlocks, relativeAmounts], maxAmount, adjustmentPerGweiBaseFee,], outputs, [decayStartBlock, exclusiveFiller, exclusivityOverrideBps, inputOverride, outputOverrides,], cosignature,],] = decoded;
    return {
        reactor,
        swapper,
        nonce,
        deadline: deadline.toNumber(),
        additionalValidationContract,
        additionalValidationData,
        cosigner,
        startingBaseFee,
        input: {
            token,
            startAmount,
            curve: {
                relativeBlocks: decodeRelativeBlocks(inputRelativeBlocks, relativeAmounts.length),
                relativeAmounts: relativeAmounts.map((amount) => amount.toBigInt()),
            },
            maxAmount,
            adjustmentPerGweiBaseFee,
        },
        outputs: outputs.map(([token, startAmount, [outputRelativeBlocks, relativeAmounts], recipient, minAmount, adjustmentPerGweiBaseFee,]) => ({
            token,
            startAmount,
            curve: {
                relativeBlocks: decodeRelativeBlocks(outputRelativeBlocks, relativeAmounts.length),
                relativeAmounts: relativeAmounts.map((amount) => amount.toBigInt()),
            },
            recipient,
            minAmount,
            adjustmentPerGweiBaseFee,
        })),
        cosignerData: {
            decayStartBlock: decayStartBlock.toNumber(),
            exclusiveFiller,
            exclusivityOverrideBps: exclusivityOverrideBps,
            inputOverride: inputOverride,
            outputOverrides,
        },
        cosignature,
    };
}
function encodeRelativeBlocks(relativeBlocks) {
    let packedData = ethers_1.BigNumber.from(0);
    for (let i = 0; i < relativeBlocks.length; i++) {
        packedData = packedData.or(ethers_1.BigNumber.from(relativeBlocks[i]).shl(i * 16));
    }
    return packedData;
}
function decodeRelativeBlocks(packedData, relativeAmountsLength) {
    const relativeBlocks = [];
    for (let i = 0; i < relativeAmountsLength; i++) {
        const block = packedData.shr(i * 16).toNumber() & 0xffff;
        relativeBlocks.push(block);
    }
    return relativeBlocks;
}
//# sourceMappingURL=V3DutchOrder.js.map