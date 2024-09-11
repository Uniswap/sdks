import { SignatureLike } from "@ethersproject/bytes";
import { PermitTransferFrom, PermitTransferFromData, SignatureTransfer, Witness } from "@uniswap/permit2-sdk";
import { BigNumber, ethers } from "ethers";

import { getPermit2, ResolvedUniswapXOrder } from "../utils";
import { getBlockDecayedAmount } from "../utils/dutchBlockDecay";

import { BlockOverrides, OffChainOrder, OrderInfo, V3DutchInput, V3DutchInputJSON, V3DutchOutput, V3DutchOutputJSON, V3OrderResolutionOptions } from "./types";

import { originalIfZero } from ".";

export type V3CosignerDataJSON = {
    decayStartBlock: number;
    exclusiveFiller: string;
    exclusivityOverrideBps: number;
    inputOverride: string;
    outputOverrides: string[];
}

export type UnsignedV3DutchOrderInfoJSON = Omit<UnsignedV3DutchOrderInfo, "nonce" | "input" | "outputs" | "cosignerData"> & {
    nonce: string;
    input: V3DutchInputJSON;
    outputs: V3DutchOutputJSON[];
};

export type V3CosignerData = {
    decayStartBlock: number;
    //No end in cosignerData
    exclusiveFiller: string;
    exclusivityOverrideBps: BigNumber;
    inputOverride: BigNumber;
    outputOverrides: BigNumber[];
}

export type UnsignedV3DutchOrderInfo = OrderInfo & {
    cosigner: string;
    input: V3DutchInput; //different from V2DutchOrder
    outputs: V3DutchOutput[];
};

export type CosignedV3DutchOrderInfo = UnsignedV3DutchOrderInfo & {
    cosignerData: V3CosignerData;
    cosignature: string;
};

type V3WitnessInfo = {
    info: OrderInfo,
    cosigner: string,
    baseInput: V3DutchInput,
    baseOutputs: V3DutchOutput[],
};


const COSIGNER_DATA_TUPLE_ABI = "tuple(uint256,address,uint256,uint256,uint256[])";

const V3_DUTCH_ORDER_TYPES = {
    V3DutchOrder: [
        { name: "info", type: "OrderInfo" },
        { name: "cosigner", type: "address" },
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
        { name: "curve", type: "V3Decay" },
        { name: "maxAmount", type: "uint256" },
    ],
    V3DutchOutput: [
        { name: "token", type: "address" },
        { name: "startAmount", type: "uint256" },
        { name: "curve", type: "V3Decay" },
        { name: "recipient", type: "address" },
    ],
    V3Decay: [
        { name: "relativeBlocks", type: "uint256" },
        { name: "relativeAmounts", type: "int256[]" },
    ],
};

const V3_DUTCH_ORDER_ABI = [
    "tuple(" + 
    [
        "tuple(address,address,uint256,uint256,address,bytes)", // OrderInfo
        "address", // Cosigner
        "tuple(address,uint256,tuple(uint256,int256[]),uint256)", // V3DutchInput
        "tuple(address,uint256,tuple(uint256,int256[]),address)[]", // V3DutchOutput
        COSIGNER_DATA_TUPLE_ABI,
        "bytes", // Cosignature
    ].join(",") + ")",
];

export class UnsignedV3DutchOrder implements OffChainOrder {
    public permit2Address: string;

    constructor (
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
                input: {
                    ...json.input,
                    startAmount: BigNumber.from(json.input.startAmount),
                    curve: {
                        relativeBlocks: json.input.curve.relativeBlocks,
                        relativeAmounts: json.input.curve.relativeAmounts.map(BigNumber.from),
                    },
                    maxAmount: BigNumber.from(json.input.maxAmount),
                },
                outputs: json.outputs.map(output => ({
                    ...output,
                    startAmount: BigNumber.from(output.startAmount),
                    curve: {
                        relativeBlocks: output.curve.relativeBlocks,
                        relativeAmounts: output.curve.relativeAmounts.map(BigNumber.from),
                    },
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
        return undefined
    }

    /**
     * @inheritdoc order
     */
    serialize(): string {
        const encodedRelativeBlocks = encodeRelativeBlocks(this.info.input.curve.relativeBlocks);
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
                [
                    this.info.input.token,
                    this.info.input.startAmount,
                    [encodedRelativeBlocks, this.info.input.curve.relativeAmounts],
                    this.info.input.maxAmount,
                ],
                this.info.outputs.map(output => [
                    output.token,
                    output.startAmount,
                    [encodedRelativeBlocks, output.curve.relativeAmounts],
                    output.recipient,
                ]),
                [0, ethers.constants.AddressZero, 0, 0, [0]],
                "0x",
            ],
        ]);
    }

    /**
     * @inheritdoc order
     */
    toJSON(): UnsignedV3DutchOrderInfoJSON {
        return {
            reactor: this.info.reactor,
            swapper: this.info.swapper,
            nonce: this.info.nonce.toString(),
            deadline: this.info.deadline,
            additionalValidationContract: this.info.additionalValidationContract,
            additionalValidationData: this.info.additionalValidationData,
            cosigner: this.info.cosigner,
            input: {
                token: this.info.input.token,
                startAmount: this.info.input.startAmount.toString(),
                curve: this.info.input.curve,
                maxAmount: this.info.input.maxAmount.toString(),
            },
            outputs: this.info.outputs.map(output => ({
                token: output.token,
                startAmount: output.startAmount.toString(),
                curve: output.curve,
                recipient: output.recipient,
            })),
        }
    };

    permitData(): PermitTransferFromData {
        return SignatureTransfer.getPermitData(
            this.toPermit(),
            this.permit2Address,
            this.chainId,
            this.witness(),
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
        }
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
            baseInput: this.info.input,
            baseOutputs: this.info.outputs,
        }
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
                    this.witness(),
                ),
                signature
            )
        );
    }

    hash(): string {
        return ethers.utils._TypedDataEncoder
            .from(V3_DUTCH_ORDER_TYPES)
            .hash(this.witnessInfo());
    }

    cosignatureHash(cosignerData: V3CosignerData): string {
        const abiCoder = new ethers.utils.AbiCoder();
        return ethers.utils.solidityKeccak256(
            ["bytes32", "bytes"],
            [
                this.hash(),
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
                    ],
                ),
            ]
        )
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

    constructor(
        public readonly info: CosignedV3DutchOrderInfo,
        public readonly chainId: number,
        _permit2Address?: string
    ) {
        super(info, chainId, _permit2Address);
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
        const encodedInputRelativeBlocks = encodeRelativeBlocks(this.info.input.curve.relativeBlocks);
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
                [
                    this.info.input.token,
                    this.info.input.startAmount,
                    [encodedInputRelativeBlocks, this.info.input.curve.relativeAmounts],
                    this.info.input.maxAmount,
                ],
                this.info.outputs.map(output => [
                    output.token,
                    output.startAmount,
                    [encodeRelativeBlocks(output.curve.relativeBlocks), output.curve.relativeAmounts],
                    output.recipient,
                ]),
                [
                    this.info.cosignerData.decayStartBlock,
                    this.info.cosignerData.exclusiveFiller,
                    this.info.cosignerData.exclusivityOverrideBps,
                    this.info.cosignerData.inputOverride.toString(),
                    this.info.cosignerData.outputOverrides.map(override => override.toString()),
                ],
                this.info.cosignature,
            ],
        ]);
    }

    recoverCosigner(): string {
        return ethers.utils.verifyMessage(
          this.cosignatureHash(this.info.cosignerData),
          this.info.cosignature
        );
    }

    resolve(options: V3OrderResolutionOptions): ResolvedUniswapXOrder {
        return {
            input: {
                token: this.info.input.token,
                amount: getBlockDecayedAmount(
                    {
                        decayStartBlock: this.info.cosignerData.decayStartBlock,
                        startAmount: originalIfZero(this.info.cosignerData.inputOverride, this.info.input.startAmount),
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
                            startAmount: originalIfZero(this.info.cosignerData.outputOverrides[idx], output.startAmount),
                            relativeBlocks: output.curve.relativeBlocks,
                            relativeAmounts: output.curve.relativeAmounts,
                        },
                        options.currentBlock
                    ),
                }
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
            [
                token,
                startAmount,
                [relativeBlocks, relativeAmounts],
                maxAmount,
            ],
            outputs,
            [decayStartBlock, exclusiveFiller, exclusivityOverrideBps, inputOverride, outputOverrides],
            cosignature,
        ],
    ] = decoded;

    const decodedRelativeBlocks = decodeRelativeBlocks(relativeBlocks);

    return {
        reactor,
        swapper,
        nonce,
        deadline: deadline.toNumber(),
        additionalValidationContract,
        additionalValidationData,
        cosigner,
        input: {
            token,
            startAmount,
            curve: {
                relativeBlocks: decodedRelativeBlocks,
                relativeAmounts,
            },
            maxAmount,
        },
        outputs: outputs.map(
            ([token, startAmount, [relativeBlocks, relativeAmounts], recipient]: [
                string,
                number,
                [BigNumber, number[]],
                string,
                boolean
            ]) => ({
                token,
                startAmount,
                curve: {
                    relativeBlocks: decodeRelativeBlocks(relativeBlocks),
                    relativeAmounts,
                },
                recipient,
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

function encodeRelativeBlocks(relativeBlocks: number[]): BigNumber {
    let packedData = BigNumber.from(0);
    for (let i = 0; i < relativeBlocks.length; i++) {
        packedData = packedData.or(BigNumber.from(relativeBlocks[i]).shl(i * 16));
    }
    return packedData;
}
/* eslint-disable */
function decodeRelativeBlocks(packedData: BigNumber): number[] {
    let relativeBlocks: number[] = [];
    for (let i = 0; i < 16; i++) {
        const block = packedData.shr(i * 16).toNumber() & 0xFFFF;
        if (block !== 0) {
            relativeBlocks.push(block);
        }
    }
    return relativeBlocks;
}
/* eslint-enable */