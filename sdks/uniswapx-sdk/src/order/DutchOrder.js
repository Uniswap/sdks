"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DutchOrder = void 0;
exports.id = id;
const permit2_sdk_1 = require("@uniswap/permit2-sdk");
const ethers_1 = require("ethers");
const utils_1 = require("ethers/lib/utils");
const constants_1 = require("../constants");
const errors_1 = require("../errors");
const dutchDecay_1 = require("../utils/dutchDecay");
const validation_1 = require("./validation");
function id(text) {
    return (0, utils_1.keccak256)((0, utils_1.toUtf8Bytes)(text));
}
const STRICT_EXCLUSIVITY = ethers_1.BigNumber.from(0);
const DUTCH_ORDER_TYPES = {
    ExclusiveDutchOrder: [
        { name: "info", type: "OrderInfo" },
        { name: "decayStartTime", type: "uint256" },
        { name: "decayEndTime", type: "uint256" },
        { name: "exclusiveFiller", type: "address" },
        { name: "exclusivityOverrideBps", type: "uint256" },
        { name: "inputToken", type: "address" },
        { name: "inputStartAmount", type: "uint256" },
        { name: "inputEndAmount", type: "uint256" },
        { name: "outputs", type: "DutchOutput[]" },
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
const DUTCH_ORDER_ABI = [
    "tuple(" +
        [
            "tuple(address,address,uint256,uint256,address,bytes)",
            "uint256",
            "uint256",
            "address",
            "uint256",
            "tuple(address,uint256,uint256)",
            "tuple(address,uint256,uint256,address)[]",
        ].join(",") +
        ")",
];
class DutchOrder {
    info;
    chainId;
    _permit2Address;
    permit2Address;
    constructor(info, chainId, _permit2Address) {
        this.info = info;
        this.chainId = chainId;
        this._permit2Address = _permit2Address;
        if (_permit2Address) {
            this.permit2Address = _permit2Address;
        }
        else if (constants_1.PERMIT2_MAPPING[chainId]) {
            this.permit2Address = constants_1.PERMIT2_MAPPING[chainId];
        }
        else {
            throw new errors_1.MissingConfiguration("permit2", chainId.toString());
        }
    }
    static fromJSON(json, chainId, _permit2Address) {
        return new DutchOrder({
            ...json,
            exclusivityOverrideBps: ethers_1.BigNumber.from(json.exclusivityOverrideBps),
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
        const abiCoder = new ethers_1.ethers.utils.AbiCoder();
        const decoded = abiCoder.decode(DUTCH_ORDER_ABI, encoded);
        const [[[reactor, swapper, nonce, deadline, additionalValidationContract, additionalValidationData,], decayStartTime, decayEndTime, exclusiveFiller, exclusivityOverrideBps, [inputToken, inputStartAmount, inputEndAmount], outputs,],] = decoded;
        return new DutchOrder({
            reactor,
            swapper,
            nonce,
            deadline: deadline.toNumber(),
            additionalValidationContract,
            additionalValidationData,
            decayStartTime: decayStartTime.toNumber(),
            decayEndTime: decayEndTime.toNumber(),
            exclusiveFiller,
            exclusivityOverrideBps,
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
        }, chainId, permit2);
    }
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
            decayStartTime: this.info.decayStartTime,
            decayEndTime: this.info.decayEndTime,
            exclusiveFiller: this.info.exclusiveFiller,
            exclusivityOverrideBps: this.info.exclusivityOverrideBps.toString(),
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
        return abiCoder.encode(DUTCH_ORDER_ABI, [
            [
                [
                    this.info.reactor,
                    this.info.swapper,
                    this.info.nonce,
                    this.info.deadline,
                    this.info.additionalValidationContract,
                    this.info.additionalValidationData,
                ],
                this.info.decayStartTime,
                this.info.decayEndTime,
                this.info.exclusiveFiller,
                this.info.exclusivityOverrideBps,
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
            ],
        ]);
    }
    /**
     * @inheritDoc OrderInterface
     */
    getSigner(signature) {
        return ethers_1.ethers.utils.computeAddress(ethers_1.ethers.utils.recoverPublicKey(permit2_sdk_1.SignatureTransfer.hash(this.toPermit(), this.permit2Address, this.chainId, this.witness()), signature));
    }
    /**
     * @inheritDoc OrderInterface
     */
    permitData() {
        return permit2_sdk_1.SignatureTransfer.getPermitData(this.toPermit(), this.permit2Address, this.chainId, this.witness());
    }
    /**
     * @inheritDoc OrderInterface
     */
    hash() {
        return ethers_1.ethers.utils._TypedDataEncoder
            .from(DUTCH_ORDER_TYPES)
            .hash(this.witnessInfo());
    }
    /**
     * Returns the resolved order with the given options
     * @return The resolved order
     */
    resolve(options) {
        const useOverride = this.info.exclusiveFiller !== ethers_1.ethers.constants.AddressZero &&
            options.timestamp <= this.info.decayStartTime &&
            options.filler !== this.info.exclusiveFiller;
        return {
            input: {
                token: this.info.input.token,
                amount: (0, dutchDecay_1.getDecayedAmount)({
                    decayStartTime: this.info.decayStartTime,
                    decayEndTime: this.info.decayEndTime,
                    startAmount: this.info.input.startAmount,
                    endAmount: this.info.input.endAmount,
                }, options.timestamp),
            },
            outputs: this.info.outputs.map((output) => {
                const baseAmount = (0, dutchDecay_1.getDecayedAmount)({
                    decayStartTime: this.info.decayStartTime,
                    decayEndTime: this.info.decayEndTime,
                    startAmount: output.startAmount,
                    endAmount: output.endAmount,
                }, options.timestamp);
                let amount = baseAmount;
                // strict exclusivity means the order cant be resolved filled at any price
                if (useOverride) {
                    if (this.info.exclusivityOverrideBps.eq(STRICT_EXCLUSIVITY)) {
                        amount = ethers_1.ethers.constants.MaxUint256;
                    }
                    else {
                        amount = baseAmount
                            .mul(this.info.exclusivityOverrideBps.add(constants_1.BPS))
                            .div(constants_1.BPS);
                    }
                }
                return {
                    token: output.token,
                    amount,
                };
            }),
        };
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
            decayStartTime: this.info.decayStartTime,
            decayEndTime: this.info.decayEndTime,
            exclusiveFiller: this.info.exclusiveFiller,
            exclusivityOverrideBps: this.info.exclusivityOverrideBps,
            inputToken: this.info.input.token,
            inputStartAmount: this.info.input.startAmount,
            inputEndAmount: this.info.input.endAmount,
            outputs: this.info.outputs,
        };
    }
    witness() {
        return {
            witness: this.witnessInfo(),
            // TODO: remove "Limit"
            witnessTypeName: "ExclusiveDutchOrder",
            witnessType: DUTCH_ORDER_TYPES,
        };
    }
}
exports.DutchOrder = DutchOrder;
//# sourceMappingURL=DutchOrder.js.map