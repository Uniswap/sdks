"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RelayOrder = void 0;
const permit2_sdk_1 = require("@uniswap/permit2-sdk");
const ethers_1 = require("ethers");
const constants_1 = require("../constants");
const errors_1 = require("../errors");
const dutchDecay_1 = require("../utils/dutchDecay");
const RELAY_WITNESS_TYPES = {
    RelayOrder: [
        { name: "info", type: "RelayOrderInfo" },
        { name: "input", type: "Input" },
        { name: "fee", type: "FeeEscalator" },
        { name: "universalRouterCalldata", type: "bytes" },
    ],
    RelayOrderInfo: [
        { name: "reactor", type: "address" },
        { name: "swapper", type: "address" },
        { name: "nonce", type: "uint256" },
        { name: "deadline", type: "uint256" },
    ],
    Input: [
        { name: "token", type: "address" },
        { name: "amount", type: "uint256" },
        { name: "recipient", type: "address" },
    ],
    FeeEscalator: [
        { name: "token", type: "address" },
        { name: "startAmount", type: "uint256" },
        { name: "endAmount", type: "uint256" },
        { name: "startTime", type: "uint256" },
        { name: "endTime", type: "uint256" },
    ],
};
const RELAY_ORDER_ABI = [
    "tuple(" +
        [
            "tuple(address,address,uint256,uint256)",
            "tuple(address,uint256,address)",
            "tuple(address,uint256,uint256,uint256,uint256)",
            "bytes",
        ].join(",") +
        ")",
];
class RelayOrder {
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
        return new RelayOrder({
            ...json,
            nonce: ethers_1.BigNumber.from(json.nonce),
            input: {
                token: json.input.token,
                amount: ethers_1.BigNumber.from(json.input.amount),
                recipient: json.input.recipient,
            },
            fee: {
                token: json.fee.token,
                startAmount: ethers_1.BigNumber.from(json.fee.startAmount),
                endAmount: ethers_1.BigNumber.from(json.fee.endAmount),
                startTime: json.fee.startTime,
                endTime: json.fee.endTime,
            },
        }, chainId, _permit2Address);
    }
    static parse(encoded, chainId, permit2) {
        const abiCoder = new ethers_1.ethers.utils.AbiCoder();
        const decoded = abiCoder.decode(RELAY_ORDER_ABI, encoded);
        const [[[reactor, swapper, nonce, deadline], [inputToken, inputAmount, inputRecipient], [feeToken, feeStartAmount, feeEndAmount, feeStartTime, feeEndTime], universalRouterCalldata,],] = decoded;
        return new RelayOrder({
            reactor,
            swapper,
            nonce,
            deadline: deadline.toNumber(),
            input: {
                token: inputToken,
                amount: inputAmount,
                recipient: inputRecipient,
            },
            fee: {
                token: feeToken,
                startAmount: feeStartAmount,
                endAmount: feeEndAmount,
                startTime: feeStartTime.toNumber(),
                endTime: feeEndTime.toNumber(),
            },
            universalRouterCalldata: universalRouterCalldata,
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
            universalRouterCalldata: this.info.universalRouterCalldata,
            input: {
                token: this.info.input.token,
                amount: this.info.input.amount.toString(),
                recipient: this.info.input.recipient,
            },
            fee: {
                token: this.info.fee.token,
                startAmount: this.info.fee.startAmount.toString(),
                endAmount: this.info.fee.endAmount.toString(),
                startTime: this.info.fee.startTime,
                endTime: this.info.fee.endTime,
            },
        };
    }
    /**
     * @inheritdoc order
     */
    get blockOverrides() {
        return undefined;
    }
    serialize() {
        const abiCoder = new ethers_1.ethers.utils.AbiCoder();
        return abiCoder.encode(RELAY_ORDER_ABI, [
            [
                [
                    this.info.reactor,
                    this.info.swapper,
                    this.info.nonce,
                    this.info.deadline,
                ],
                [
                    this.info.input.token,
                    this.info.input.amount,
                    this.info.input.recipient,
                ],
                [
                    this.info.fee.token,
                    this.info.fee.startAmount,
                    this.info.fee.endAmount,
                    this.info.fee.startTime,
                    this.info.fee.endTime,
                ],
                this.info.universalRouterCalldata,
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
     * @inheritdoc OrderInterface
     */
    permitData() {
        return permit2_sdk_1.SignatureTransfer.getPermitData(this.toPermit(), this.permit2Address, this.chainId, this.witness());
    }
    /**
     * @inheritdoc OrderInterface
     */
    hash() {
        return ethers_1.ethers.utils._TypedDataEncoder
            .from(RELAY_WITNESS_TYPES)
            .hash(this.witnessInfo());
    }
    /**
     * Returns the resolved order with the given options
     * @return The resolved order
     */
    resolve(options) {
        return {
            fee: {
                token: this.info.fee.token,
                amount: (0, dutchDecay_1.getDecayedAmount)({
                    decayStartTime: this.info.fee.startTime,
                    decayEndTime: this.info.fee.endTime,
                    startAmount: this.info.fee.startAmount,
                    endAmount: this.info.fee.endAmount,
                }, options.timestamp),
            },
        };
    }
    toPermit() {
        return {
            permitted: [
                {
                    token: this.info.input.token,
                    amount: this.info.input.amount,
                },
                {
                    token: this.info.fee.token,
                    amount: this.info.fee.endAmount,
                },
            ],
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
            },
            input: this.info.input,
            fee: this.info.fee,
            universalRouterCalldata: this.info.universalRouterCalldata,
        };
    }
    witness() {
        return {
            witness: this.witnessInfo(),
            witnessTypeName: "RelayOrder",
            witnessType: RELAY_WITNESS_TYPES,
        };
    }
}
exports.RelayOrder = RelayOrder;
//# sourceMappingURL=RelayOrder.js.map