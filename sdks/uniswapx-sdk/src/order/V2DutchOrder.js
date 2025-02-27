"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CosignedV2DutchOrder = exports.UnsignedV2DutchOrder = void 0;
const permit2_sdk_1 = require("@uniswap/permit2-sdk");
const ethers_1 = require("ethers");
const utils_1 = require("../utils");
const dutchDecay_1 = require("../utils/dutchDecay");
const order_1 = require("../utils/order");
const validation_1 = require("./validation");
const COSIGNER_DATA_TUPLE_ABI = "tuple(uint256,uint256,address,uint256,uint256,uint256[])";
const V2_DUTCH_ORDER_TYPES = {
    V2DutchOrder: [
        { name: "info", type: "OrderInfo" },
        { name: "cosigner", type: "address" },
        { name: "baseInputToken", type: "address" },
        { name: "baseInputStartAmount", type: "uint256" },
        { name: "baseInputEndAmount", type: "uint256" },
        { name: "baseOutputs", type: "DutchOutput[]" },
    ],
    OrderInfo: [
        { name: "reactor", type: "address" },
        { name: "swapper", type: "address" },
        { name: "nonce", type: "uint256" },
        { name: "deadline", type: "uint256" },
        { name: "additionalValidationContract", type: "address" },
        { name: "additionalValidationData", type: "bytes" },
    ],
    DutchOutput: [
        { name: "token", type: "address" },
        { name: "startAmount", type: "uint256" },
        { name: "endAmount", type: "uint256" },
        { name: "recipient", type: "address" },
    ],
};
const V2_DUTCH_ORDER_ABI = [
    "tuple(" +
        [
            "tuple(address,address,uint256,uint256,address,bytes)", // OrderInfo
            "address", // cosigner
            "tuple(address,uint256,uint256)", // input
            "tuple(address,uint256,uint256,address)[]", // outputs
            COSIGNER_DATA_TUPLE_ABI, // cosignerData
            "bytes", // cosignature
        ].join(",") +
        ")",
];
class UnsignedV2DutchOrder {
    info;
    chainId;
    permit2Address;
    constructor(info, chainId, _permit2Address) {
        this.info = info;
        this.chainId = chainId;
        this.permit2Address = (0, utils_1.getPermit2)(chainId, _permit2Address);
    }
    static fromJSON(json, chainId, _permit2Address) {
        return new UnsignedV2DutchOrder({
            ...json,
            nonce: ethers_1.BigNumber.from(json.nonce),
            input: {
                token: json.input.token,
                startAmount: ethers_1.BigNumber.from(json.input.startAmount),
                endAmount: ethers_1.BigNumber.from(json.input.endAmount),
            },
            outputs: json.outputs.map((output) => ({
                token: output.token,
                startAmount: ethers_1.BigNumber.from(output.startAmount),
                endAmount: ethers_1.BigNumber.from(output.endAmount),
                recipient: output.recipient,
            })),
        }, chainId, _permit2Address);
    }
    static parse(encoded, chainId, permit2) {
        return new UnsignedV2DutchOrder(parseSerializedOrder(encoded), chainId, permit2);
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
            input: {
                token: this.info.input.token,
                startAmount: this.info.input.startAmount.toString(),
                endAmount: this.info.input.endAmount.toString(),
            },
            outputs: this.info.outputs.map((output) => ({
                token: output.token,
                startAmount: output.startAmount.toString(),
                endAmount: output.endAmount.toString(),
                recipient: output.recipient,
            })),
            cosigner: this.info.cosigner,
        };
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
        const abiCoder = new ethers_1.ethers.utils.AbiCoder();
        return abiCoder.encode(V2_DUTCH_ORDER_ABI, [
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
                [
                    this.info.input.token,
                    this.info.input.startAmount,
                    this.info.input.endAmount,
                ],
                this.info.outputs.map((output) => [
                    output.token,
                    output.startAmount,
                    output.endAmount,
                    output.recipient,
                ]),
                // use empty default for cosignerData and cosignature
                [0, 0, ethers_1.ethers.constants.AddressZero, 0, 0, [0]],
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
            .from(V2_DUTCH_ORDER_TYPES)
            .hash(this.witnessInfo());
    }
    /**
     * Returns the resolved order with the given options
     * @return The resolved order
     */
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    resolve(_options) {
        // no cosigner data so no resolution possible
        throw new Error("Method not implemented");
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
                amount: this.info.input.endAmount,
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
            baseInputToken: this.info.input.token,
            baseInputStartAmount: this.info.input.startAmount,
            baseInputEndAmount: this.info.input.endAmount,
            baseOutputs: this.info.outputs,
        };
    }
    witness() {
        return {
            witness: this.witnessInfo(),
            witnessTypeName: "V2DutchOrder",
            witnessType: V2_DUTCH_ORDER_TYPES,
        };
    }
    /**
     * Full order hash that should be signed over by the cosigner
     */
    cosignatureHash(cosignerData) {
        const abiCoder = new ethers_1.ethers.utils.AbiCoder();
        return ethers_1.ethers.utils.solidityKeccak256(["bytes32", "bytes"], [
            this.hash(),
            abiCoder.encode([COSIGNER_DATA_TUPLE_ABI], [
                [
                    cosignerData.decayStartTime,
                    cosignerData.decayEndTime,
                    cosignerData.exclusiveFiller,
                    cosignerData.exclusivityOverrideBps,
                    cosignerData.inputOverride,
                    cosignerData.outputOverrides,
                ],
            ]),
        ]);
    }
}
exports.UnsignedV2DutchOrder = UnsignedV2DutchOrder;
class CosignedV2DutchOrder extends UnsignedV2DutchOrder {
    info;
    chainId;
    // build a cosigned order from an unsigned order plus cosigner data
    static fromUnsignedOrder(order, cosignerData, cosignature) {
        return new CosignedV2DutchOrder({
            ...order.info,
            cosignerData,
            cosignature,
        }, order.chainId, order.permit2Address);
    }
    // build a cosigned order from json
    static fromJSON(json, chainId, _permit2Address) {
        return new CosignedV2DutchOrder({
            ...json,
            nonce: ethers_1.BigNumber.from(json.nonce),
            input: {
                token: json.input.token,
                startAmount: ethers_1.BigNumber.from(json.input.startAmount),
                endAmount: ethers_1.BigNumber.from(json.input.endAmount),
            },
            outputs: json.outputs.map((output) => ({
                token: output.token,
                startAmount: ethers_1.BigNumber.from(output.startAmount),
                endAmount: ethers_1.BigNumber.from(output.endAmount),
                recipient: output.recipient,
            })),
            cosignerData: {
                decayStartTime: json.cosignerData.decayStartTime,
                decayEndTime: json.cosignerData.decayEndTime,
                exclusiveFiller: json.cosignerData.exclusiveFiller,
                exclusivityOverrideBps: ethers_1.BigNumber.from(json.cosignerData.exclusivityOverrideBps),
                inputOverride: ethers_1.BigNumber.from(json.cosignerData.inputOverride),
                outputOverrides: json.cosignerData.outputOverrides.map(ethers_1.BigNumber.from),
            },
            cosignature: json.cosignature,
        }, chainId, _permit2Address);
    }
    // build a cosigned order from serialized
    static parse(encoded, chainId, permit2) {
        return new CosignedV2DutchOrder(parseSerializedOrder(encoded), chainId, permit2);
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
                decayStartTime: this.info.cosignerData.decayStartTime,
                decayEndTime: this.info.cosignerData.decayEndTime,
                exclusiveFiller: this.info.cosignerData.exclusiveFiller,
                exclusivityOverrideBps: this.info.cosignerData.exclusivityOverrideBps.toNumber(),
                inputOverride: this.info.cosignerData.inputOverride.toString(),
                outputOverrides: this.info.cosignerData.outputOverrides.map((o) => o.toString()),
            },
            cosignature: this.info.cosignature,
        };
    }
    /**
     * @inheritdoc Order
     */
    resolve(options) {
        return {
            input: {
                token: this.info.input.token,
                amount: (0, dutchDecay_1.getDecayedAmount)({
                    decayStartTime: this.info.cosignerData.decayStartTime,
                    decayEndTime: this.info.cosignerData.decayEndTime,
                    startAmount: (0, order_1.originalIfZero)(this.info.cosignerData.inputOverride, this.info.input.startAmount),
                    endAmount: this.info.input.endAmount,
                }, options.timestamp),
            },
            outputs: this.info.outputs.map((output, idx) => {
                return {
                    token: output.token,
                    amount: (0, dutchDecay_1.getDecayedAmount)({
                        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                        decayStartTime: this.info.cosignerData.decayStartTime,
                        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                        decayEndTime: this.info.cosignerData.decayEndTime,
                        startAmount: (0, order_1.originalIfZero)(
                        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                        this.info.cosignerData.outputOverrides[idx], output.startAmount),
                        endAmount: output.endAmount,
                    }, options.timestamp),
                };
            }),
        };
    }
    /**
     * @inheritdoc order
     */
    serialize() {
        const abiCoder = new ethers_1.ethers.utils.AbiCoder();
        return abiCoder.encode(V2_DUTCH_ORDER_ABI, [
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
                [
                    this.info.input.token,
                    this.info.input.startAmount,
                    this.info.input.endAmount,
                ],
                this.info.outputs.map((output) => [
                    output.token,
                    output.startAmount,
                    output.endAmount,
                    output.recipient,
                ]),
                [
                    this.info.cosignerData.decayStartTime,
                    this.info.cosignerData.decayEndTime,
                    this.info.cosignerData.exclusiveFiller,
                    this.info.cosignerData.exclusivityOverrideBps,
                    this.info.cosignerData.inputOverride.toString(),
                    this.info.cosignerData.outputOverrides.map((o) => o.toString()),
                ],
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
exports.CosignedV2DutchOrder = CosignedV2DutchOrder;
function parseSerializedOrder(serialized) {
    const abiCoder = new ethers_1.ethers.utils.AbiCoder();
    const decoded = abiCoder.decode(V2_DUTCH_ORDER_ABI, serialized);
    const [[[reactor, swapper, nonce, deadline, additionalValidationContract, additionalValidationData,], cosigner, [inputToken, inputStartAmount, inputEndAmount], outputs, [decayStartTime, decayEndTime, exclusiveFiller, exclusivityOverrideBps, inputOverride, outputOverrides,], cosignature,],] = decoded;
    return {
        reactor,
        swapper,
        nonce,
        deadline: deadline.toNumber(),
        additionalValidationContract,
        additionalValidationData,
        cosigner,
        input: {
            token: inputToken,
            startAmount: inputStartAmount,
            endAmount: inputEndAmount,
        },
        outputs: outputs.map(([token, startAmount, endAmount, recipient]) => {
            return {
                token,
                startAmount,
                endAmount,
                recipient,
            };
        }),
        cosignerData: {
            decayStartTime: decayStartTime.toNumber(),
            decayEndTime: decayEndTime.toNumber(),
            exclusiveFiller,
            exclusivityOverrideBps,
            inputOverride,
            outputOverrides,
        },
        cosignature,
    };
}
//# sourceMappingURL=V2DutchOrder.js.map