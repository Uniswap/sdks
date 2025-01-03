import { SignatureLike } from "@ethersproject/bytes";
import {
    PermitTransferFrom,
    PermitTransferFromData,
    SignatureTransfer,
    Witness,
} from "@uniswap/permit2-sdk";
import { BigNumber, ethers } from "ethers";

import { getPermit2, ResolvedUniswapXOrder } from "../utils";
import { getBlockDecayedAmount } from "../utils/dutchBlockDecay";
import { originalIfZero } from "../utils/order";

import {
    BlockOverrides,
    CosignerData,
    CosignerDataJSON,
    EncodedV3DutchInput,
    EncodedV3DutchOutput,
    OffChainOrder,
    OrderInfo,
    V3DutchInput,
    V3DutchInputJSON,
    V3DutchOutput,
    V3DutchOutputJSON,
    V3OrderResolutionOptions,
} from "./types";

export type V3CosignerDataJSON = Omit<
    CosignerDataJSON,
    "decayStartTime" | "decayEndTime"
> & {
    decayStartBlock: number;
};

export type V3CosignerData = Omit<
    CosignerData,
    "decayStartTime" | "decayEndTime"
> & {
    decayStartBlock: number;
};

export type UnsignedV3DutchOrderInfoJSON = Omit<
    UnsignedV3DutchOrderInfo,
    "nonce" | "startingBaseFee" | "input" | "outputs" | "cosignerData"
> & {
    nonce: string;
    startingBaseFee: string;
    input: V3DutchInputJSON;
    outputs: V3DutchOutputJSON[];
};

export type UnsignedV3DutchOrderInfo = OrderInfo & {
    cosigner: string;
    startingBaseFee: BigNumber;
    input: V3DutchInput; //different from V2DutchOrder
    outputs: V3DutchOutput[];
};

export type CosignedV3DutchOrderInfoJSON = UnsignedV3DutchOrderInfoJSON & {
    cosignerData: V3CosignerDataJSON;
    cosignature: string;
};

export type CosignedV3DutchOrderInfo = UnsignedV3DutchOrderInfo & {
    cosignerData: V3CosignerData;
    cosignature: string;
};

type V3WitnessInfo = {
    info: OrderInfo;
    cosigner: string;
    startingBaseFee: BigNumber;
    baseInput: EncodedV3DutchInput;
    baseOutputs: EncodedV3DutchOutput[];
};

const COSIGNER_DATA_TUPLE_ABI =
    "tuple(uint256,address,uint256,uint256,uint256[])";

export const V3_DUTCH_ORDER_TYPES = {
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

export class UnsignedV3DutchOrder implements OffChainOrder {
    public permit2Address: string;

    constructor(
        public readonly info: UnsignedV3DutchOrderInfo,
        public readonly chainId: number,
        _permit2Address?: string
    ) {
        this.permit2Address = getPermit2(chainId, _permit2Address);
    }

    static fromJSON(
        json: UnsignedV3DutchOrderInfoJSON,
        chainId: number,
        _permit2Address?: string
    ): UnsignedV3DutchOrder {
        return new UnsignedV3DutchOrder(
            {
                ...json,
                nonce: BigNumber.from(json.nonce),
                startingBaseFee: BigNumber.from(json.startingBaseFee),
                input: {
                    ...json.input,
                    startAmount: BigNumber.from(json.input.startAmount),
                    curve: {
                        relativeBlocks: json.input.curve.relativeBlocks,
                        relativeAmounts: json.input.curve.relativeAmounts.map((amount) =>
                            BigInt(amount)
                        ),
                    },
                    maxAmount: BigNumber.from(json.input.maxAmount),
                    adjustmentPerGweiBaseFee: BigNumber.from(
                        json.input.adjustmentPerGweiBaseFee
                    ),
                },
                outputs: json.outputs.map((output) => ({
                    ...output,
                    startAmount: BigNumber.from(output.startAmount),
                    curve: {
                        relativeBlocks: output.curve.relativeBlocks,
                        relativeAmounts: output.curve.relativeAmounts.map((amount) =>
                            BigInt(amount)
                        ),
                    },
                    minAmount: BigNumber.from(output.minAmount),
                    adjustmentPerGweiBaseFee: BigNumber.from(
                        output.adjustmentPerGweiBaseFee
                    ),
                })),
            },
            chainId,
            _permit2Address
        );
    }

    /**
     * @inheritdoc order
     */
    get blockOverrides(): BlockOverrides {
        return undefined;
    }

    /**
     * @inheritdoc order
     */
    serialize(): string {
        const encodedRelativeBlocks = encodeRelativeBlocks(
            this.info.input.curve.relativeBlocks
        );
        const abiCoder = new ethers.utils.AbiCoder();
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
                [0, ethers.constants.AddressZero, 0, 0, [0]],
                "0x",
            ],
        ]);
    }

    /**
     * @inheritdoc order
     */
    toJSON(): UnsignedV3DutchOrderInfoJSON & {
        permit2Address: string;
        chainId: number;
    } {
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
                    relativeAmounts: this.info.input.curve.relativeAmounts.map((amount) =>
                        amount.toString()
                    ),
                },
                maxAmount: this.info.input.maxAmount.toString(),
                adjustmentPerGweiBaseFee:
                    this.info.input.adjustmentPerGweiBaseFee.toString(),
            },
            outputs: this.info.outputs.map((output) => ({
                token: output.token,
                startAmount: output.startAmount.toString(),
                curve: {
                    relativeBlocks: output.curve.relativeBlocks,
                    relativeAmounts: output.curve.relativeAmounts.map((amount) =>
                        amount.toString()
                    ),
                },
                recipient: output.recipient,
                minAmount: output.minAmount.toString(),
                adjustmentPerGweiBaseFee: output.adjustmentPerGweiBaseFee.toString(),
            })),
            chainId: this.chainId,
            permit2Address: this.permit2Address,
        };
    }

    permitData(): PermitTransferFromData {
        return SignatureTransfer.getPermitData(
            this.toPermit(),
            this.permit2Address,
            this.chainId,
            this.witness()
        ) as PermitTransferFromData;
    }

    private toPermit(): PermitTransferFrom {
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

    private witnessInfo(): V3WitnessInfo {
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
                    relativeAmounts: this.info.input.curve.relativeAmounts.map((amount) =>
                        amount.toString()
                    ),
                },
                maxAmount: this.info.input.maxAmount,
                adjustmentPerGweiBaseFee: this.info.input.adjustmentPerGweiBaseFee,
            },
            baseOutputs: this.info.outputs.map((output) => ({
                token: output.token,
                startAmount: output.startAmount,
                curve: {
                    relativeBlocks: encodeRelativeBlocks(output.curve.relativeBlocks),
                    relativeAmounts: output.curve.relativeAmounts.map((amount) =>
                        amount.toString()
                    ),
                },
                recipient: output.recipient,
                minAmount: output.minAmount,
                adjustmentPerGweiBaseFee: output.adjustmentPerGweiBaseFee,
            })),
        };
    }

    private witness(): Witness {
        return {
            witness: this.witnessInfo(),
            witnessTypeName: "V3DutchOrder",
            witnessType: V3_DUTCH_ORDER_TYPES,
        };
    }

    getSigner(signature: SignatureLike): string {
        return ethers.utils.computeAddress(
            ethers.utils.recoverPublicKey(
                SignatureTransfer.hash(
                    this.toPermit(),
                    this.permit2Address,
                    this.chainId,
                    this.witness()
                ),
                signature
            )
        );
    }

    hash(): string {
        const witnessInfo = this.witnessInfo();
        return ethers.utils._TypedDataEncoder
            .from(V3_DUTCH_ORDER_TYPES)
            .hash(witnessInfo);
    }

    /**
     * Full order hash that should be signed over by the cosigner
     */
    cosignatureHash(cosignerData: V3CosignerData): string {
      const abiCoder = new ethers.utils.AbiCoder();
  
      return ethers.utils.solidityKeccak256(
        ["bytes32", "uint256", "bytes"],
        [
          this.hash(),
          this.chainId,
          abiCoder.encode(
            [COSIGNER_DATA_TUPLE_ABI],
            [
                [
                    cosignerData.decayStartBlock,
                    cosignerData.exclusiveFiller,
                    cosignerData.exclusivityOverrideBps,
                    cosignerData.inputOverride,
                    cosignerData.outputOverrides,
                ],
            ]
          ),
        ]
      );
    }

    static parse(
        encoded: string,
        chainId: number,
        permit2?: string
    ): UnsignedV3DutchOrder {
        return new UnsignedV3DutchOrder(
            parseSerializedOrder(encoded),
            chainId,
            permit2
        );
    }
}

export class CosignedV3DutchOrder extends UnsignedV3DutchOrder {
    static fromUnsignedOrder(
        order: UnsignedV3DutchOrder,
        cosignerData: V3CosignerData,
        cosignature: string
    ): CosignedV3DutchOrder {
        return new CosignedV3DutchOrder(
            {
                ...order.info,
                cosignerData,
                cosignature,
            },
            order.chainId,
            order.permit2Address
        );
    }

    static fromJSON(
        json: CosignedV3DutchOrderInfoJSON,
        chainId: number,
        _permit2Address?: string
    ): CosignedV3DutchOrder {
        return new CosignedV3DutchOrder(
            {
                ...json,
                nonce: BigNumber.from(json.nonce),
                startingBaseFee: BigNumber.from(json.startingBaseFee),
                input: {
                    token: json.input.token,
                    startAmount: BigNumber.from(json.input.startAmount),
                    curve: {
                        relativeBlocks: json.input.curve.relativeBlocks,
                        relativeAmounts: json.input.curve.relativeAmounts.map((amount) =>
                            BigInt(amount)
                        ),
                    },
                    maxAmount: BigNumber.from(json.input.maxAmount),
                    adjustmentPerGweiBaseFee: BigNumber.from(
                        json.input.adjustmentPerGweiBaseFee
                    ),
                },
                outputs: json.outputs.map((output) => ({
                    token: output.token,
                    startAmount: BigNumber.from(output.startAmount),
                    curve: {
                        relativeBlocks: output.curve.relativeBlocks,
                        relativeAmounts: output.curve.relativeAmounts.map((amount) =>
                            BigInt(amount)
                        ),
                    },
                    recipient: output.recipient,
                    minAmount: BigNumber.from(output.minAmount),
                    adjustmentPerGweiBaseFee: BigNumber.from(
                        output.adjustmentPerGweiBaseFee
                    ),
                })),
                cosignerData: {
                    decayStartBlock: json.cosignerData.decayStartBlock,
                    exclusiveFiller: json.cosignerData.exclusiveFiller,
                    exclusivityOverrideBps: BigNumber.from(
                        json.cosignerData.exclusivityOverrideBps
                    ),
                    inputOverride: BigNumber.from(json.cosignerData.inputOverride),
                    outputOverrides: json.cosignerData.outputOverrides.map(
                        BigNumber.from
                    ),
                },
                cosignature: json.cosignature,
            },
            chainId,
            _permit2Address
        );
    }

    constructor(
        public readonly info: CosignedV3DutchOrderInfo,
        public readonly chainId: number,
        _permit2Address?: string
    ) {
        super(info, chainId, _permit2Address);
    }

    /**
     * @inheritdoc order
     */
    toJSON(): CosignedV3DutchOrderInfoJSON & {
        permit2Address: string;
        chainId: number;
    } {
        return {
            ...super.toJSON(),
            cosignerData: {
                decayStartBlock: this.info.cosignerData.decayStartBlock,
                exclusiveFiller: this.info.cosignerData.exclusiveFiller,
                exclusivityOverrideBps:
                    this.info.cosignerData.exclusivityOverrideBps.toNumber(),
                inputOverride: this.info.cosignerData.inputOverride.toString(),
                outputOverrides: this.info.cosignerData.outputOverrides.map(
                    (override) => override.toString()
                ),
            },
            cosignature: this.info.cosignature,
        };
    }

    static parse(
        encoded: string,
        chainId: number,
        permit2?: string
    ): CosignedV3DutchOrder {
        return new CosignedV3DutchOrder(
            parseSerializedOrder(encoded),
            chainId,
            permit2
        );
    }

    serialize(): string {
        const encodedInputRelativeBlocks = encodeRelativeBlocks(
            this.info.input.curve.relativeBlocks
        );
        const abiCoder = new ethers.utils.AbiCoder();
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
                    this.info.cosignerData.outputOverrides.map((override) =>
                        override.toString()
                    ),
                ],
                this.info.cosignature,
            ],
        ]);
    }

    recoverCosigner(): string {
        const messageHash = this.cosignatureHash(this.info.cosignerData);
        const signature = this.info.cosignature;
        return ethers.utils.recoverAddress(messageHash, signature);
    }

    resolve(options: V3OrderResolutionOptions): ResolvedUniswapXOrder {
        return {
            input: {
                token: this.info.input.token,
                amount: getBlockDecayedAmount(
                    {
                        decayStartBlock: this.info.cosignerData.decayStartBlock,
                        startAmount: originalIfZero(
                            this.info.cosignerData.inputOverride,
                            this.info.input.startAmount
                        ),
                        relativeBlocks: this.info.input.curve.relativeBlocks,
                        relativeAmounts: this.info.input.curve.relativeAmounts,
                    },
                    options.currentBlock
                ),
            },
            outputs: this.info.outputs.map((output, idx) => {
                return {
                    token: output.token,
                    amount: getBlockDecayedAmount(
                        {
                            decayStartBlock: this.info.cosignerData.decayStartBlock,
                            startAmount: originalIfZero(
                                this.info.cosignerData.outputOverrides[idx],
                                output.startAmount
                            ),
                            relativeBlocks: output.curve.relativeBlocks,
                            relativeAmounts: output.curve.relativeAmounts,
                        },
                        options.currentBlock
                    ),
                };
            }),
        };
    }
}

function parseSerializedOrder(serialized: string): CosignedV3DutchOrderInfo {
    const abiCoder = new ethers.utils.AbiCoder();
    const decoded = abiCoder.decode(V3_DUTCH_ORDER_ABI, serialized);
    const [
        [
            [
                reactor,
                swapper,
                nonce,
                deadline,
                additionalValidationContract,
                additionalValidationData,
            ],
            cosigner,
            startingBaseFee,
            [
                token,
                startAmount,
                [inputRelativeBlocks, relativeAmounts],
                maxAmount,
                adjustmentPerGweiBaseFee,
            ],
            outputs,
            [
                decayStartBlock,
                exclusiveFiller,
                exclusivityOverrideBps,
                inputOverride,
                outputOverrides,
            ],
            cosignature,
        ],
    ] = decoded;

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
                relativeBlocks: decodeRelativeBlocks(
                    inputRelativeBlocks,
                    relativeAmounts.length
                ),
                relativeAmounts: relativeAmounts.map((amount: BigNumber) =>
                    amount.toBigInt()
                ),
            },
            maxAmount,
            adjustmentPerGweiBaseFee,
        },
        outputs: outputs.map(
            ([
                token,
                startAmount,
                [outputRelativeBlocks, relativeAmounts],
                recipient,
                minAmount,
                adjustmentPerGweiBaseFee,
            ]: [
                    string,
                    number,
                    [BigNumber, BigNumber[]], //abiDecode automatically converts to BigNumber
                    string,
                    BigNumber,
                    BigNumber
                ]) => ({
                    token,
                    startAmount,
                    curve: {
                        relativeBlocks: decodeRelativeBlocks(
                            outputRelativeBlocks,
                            relativeAmounts.length
                        ),
                        relativeAmounts: relativeAmounts.map((amount: BigNumber) =>
                            amount.toBigInt()
                        ),
                    },
                    recipient,
                    minAmount,
                    adjustmentPerGweiBaseFee,
                })
        ),
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

export function encodeRelativeBlocks(relativeBlocks: number[]): BigNumber {
    let packedData = BigNumber.from(0);
    for (let i = 0; i < relativeBlocks.length; i++) {
        packedData = packedData.or(BigNumber.from(relativeBlocks[i]).shl(i * 16));
    }
    return packedData;
}

function decodeRelativeBlocks(
    packedData: BigNumber,
    relativeAmountsLength: number
): number[] {
    const relativeBlocks: number[] = [];
    for (let i = 0; i < relativeAmountsLength; i++) {
        const block = packedData.shr(i * 16).toNumber() & 0xffff;
        relativeBlocks.push(block);
    }
    return relativeBlocks;
}
