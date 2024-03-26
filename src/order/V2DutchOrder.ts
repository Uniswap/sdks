import { SignatureLike } from "@ethersproject/bytes";
import {
  PermitTransferFrom,
  PermitTransferFromData,
  SignatureTransfer,
  Witness,
} from "@uniswap/permit2-sdk";
import { BigNumber, ethers } from "ethers";

import { getPermit2 } from "../utils";
import { ResolvedUniswapXOrder } from "../utils/OrderQuoter";
import { getDecayedAmount } from "../utils/dutchDecay";

import {
  DutchInput,
  DutchInputJSON,
  DutchOutput,
  DutchOutputJSON,
  OffChainOrder,
  OrderInfo,
  OrderResolutionOptions,
} from "./types";
import { CustomOrderValidation, parseValidation } from "./validation";

export type CosignerData = {
  decayStartTime: number;
  decayEndTime: number;
  exclusiveFiller: string;
  exclusivityOverrideBps: BigNumber;
  inputOverride: BigNumber;
  outputOverrides: BigNumber[];
};

export type CosignerDataJSON = {
  decayStartTime: number;
  decayEndTime: number;
  exclusiveFiller: string;
  exclusivityOverrideBps: number;
  inputOverride: string;
  outputOverrides: string[];
};

export type UnsignedV2DutchOrderInfo = OrderInfo & {
  cosigner: string;
  input: DutchInput;
  outputs: DutchOutput[];
};

export type CosignedV2DutchOrderInfo = UnsignedV2DutchOrderInfo & {
  cosignerData: CosignerData;
  cosignature: string;
};

export type UnsignedV2DutchOrderInfoJSON = Omit<
  UnsignedV2DutchOrderInfo,
  "nonce" | "input" | "outputs" | "cosignerData"
> & {
  nonce: string;
  input: DutchInputJSON;
  outputs: DutchOutputJSON[];
};

export type CosignedV2DutchOrderInfoJSON = UnsignedV2DutchOrderInfoJSON & {
  cosignerData: CosignerDataJSON;
  cosignature: string;
};

type V2WitnessInfo = {
  info: OrderInfo;
  cosigner: string;
  baseInputToken: string;
  baseInputStartAmount: BigNumber;
  baseInputEndAmount: BigNumber;
  baseOutputs: DutchOutput[];
};

const COSIGNER_DATA_TUPLE_ABI =
  "tuple(uint256,uint256,address,uint256,uint256,uint256[])";

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

export class UnsignedV2DutchOrder implements OffChainOrder {
  public permit2Address: string;

  constructor(
    public readonly info: UnsignedV2DutchOrderInfo,
    public readonly chainId: number,
    _permit2Address?: string
  ) {
    this.permit2Address = getPermit2(chainId, _permit2Address);
  }

  static fromJSON(
    json: UnsignedV2DutchOrderInfoJSON,
    chainId: number,
    _permit2Address?: string
  ): UnsignedV2DutchOrder {
    return new UnsignedV2DutchOrder(
      {
        ...json,
        nonce: BigNumber.from(json.nonce),
        input: {
          token: json.input.token,
          startAmount: BigNumber.from(json.input.startAmount),
          endAmount: BigNumber.from(json.input.endAmount),
        },
        outputs: json.outputs.map((output) => ({
          token: output.token,
          startAmount: BigNumber.from(output.startAmount),
          endAmount: BigNumber.from(output.endAmount),
          recipient: output.recipient,
        })),
      },
      chainId,
      _permit2Address
    );
  }

  static parse(
    encoded: string,
    chainId: number,
    permit2?: string
  ): UnsignedV2DutchOrder {
    return new UnsignedV2DutchOrder(
      parseSerializedOrder(encoded),
      chainId,
      permit2
    );
  }

  /**
   * @inheritdoc order
   */
  toJSON(): UnsignedV2DutchOrderInfoJSON & {
    permit2Address: string;
    chainId: number;
  } {
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
  serialize(): string {
    const abiCoder = new ethers.utils.AbiCoder();
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
        [0, 0, ethers.constants.AddressZero, 0, 0, [0]],
        "0x",
      ],
    ]);
  }

  /**
   * @inheritdoc Order
   */
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

  /**
   * @inheritdoc Order
   */
  permitData(): PermitTransferFromData {
    return SignatureTransfer.getPermitData(
      this.toPermit(),
      this.permit2Address,
      this.chainId,
      this.witness()
    ) as PermitTransferFromData;
  }

  /**
   * @inheritdoc Order
   */
  hash(): string {
    return ethers.utils._TypedDataEncoder
      .from(V2_DUTCH_ORDER_TYPES)
      .hash(this.witnessInfo());
  }

  /**
   * Returns the resolved order with the given options
   * @return The resolved order
   */
  resolve(_options: OrderResolutionOptions): ResolvedUniswapXOrder {
    // no cosigner data so no resolution possible
    throw new Error("Method not implemented");
  }

  /**
   * Returns the parsed validation
   * @return The parsed validation data for the order
   */
  get validation(): CustomOrderValidation {
    return parseValidation(this.info);
  }

  private toPermit(): PermitTransferFrom {
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

  private witnessInfo(): V2WitnessInfo {
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

  private witness(): Witness {
    return {
      witness: this.witnessInfo(),
      witnessTypeName: "V2DutchOrder",
      witnessType: V2_DUTCH_ORDER_TYPES,
    };
  }

  /**
   * Full order hash that should be signed over by the cosigner
   */
  cosignatureHash(cosignerData: CosignerData): string {
    const abiCoder = new ethers.utils.AbiCoder();

    return ethers.utils.solidityKeccak256(
      ["bytes32", "bytes"],
      [
        this.hash(),
        abiCoder.encode(
          [COSIGNER_DATA_TUPLE_ABI],
          [
            [
              cosignerData.decayStartTime,
              cosignerData.decayEndTime,
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
}

export class CosignedV2DutchOrder extends UnsignedV2DutchOrder {
  // build a cosigned order from an unsigned order plus cosigner data
  static fromUnsignedOrder(
    order: UnsignedV2DutchOrder,
    cosignerData: CosignerData,
    cosignature: string
  ): CosignedV2DutchOrder {
    return new CosignedV2DutchOrder(
      {
        ...order.info,
        cosignerData,
        cosignature,
      },
      order.chainId,
      order.permit2Address
    );
  }

  // build a cosigned order from json
  static fromJSON(
    json: CosignedV2DutchOrderInfoJSON,
    chainId: number,
    _permit2Address?: string
  ): CosignedV2DutchOrder {
    return new CosignedV2DutchOrder(
      {
        ...json,
        nonce: BigNumber.from(json.nonce),
        input: {
          token: json.input.token,
          startAmount: BigNumber.from(json.input.startAmount),
          endAmount: BigNumber.from(json.input.endAmount),
        },
        outputs: json.outputs.map((output) => ({
          token: output.token,
          startAmount: BigNumber.from(output.startAmount),
          endAmount: BigNumber.from(output.endAmount),
          recipient: output.recipient,
        })),
        cosignerData: {
          decayStartTime: json.cosignerData.decayStartTime,
          decayEndTime: json.cosignerData.decayEndTime,
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

  // build a cosigned order from serialized
  static parse(
    encoded: string,
    chainId: number,
    permit2?: string
  ): CosignedV2DutchOrder {
    return new CosignedV2DutchOrder(
      parseSerializedOrder(encoded),
      chainId,
      permit2
    );
  }

  constructor(
    public readonly info: CosignedV2DutchOrderInfo,
    public readonly chainId: number,
    _permit2Address?: string
  ) {
    super(info, chainId, _permit2Address);
  }

  /**
   * @inheritdoc order
   */
  toJSON(): CosignedV2DutchOrderInfoJSON & {
    permit2Address: string;
    chainId: number;
  } {
    return {
      ...super.toJSON(),
      cosignerData: {
        decayStartTime: this.info.cosignerData.decayStartTime,
        decayEndTime: this.info.cosignerData.decayEndTime,
        exclusiveFiller: this.info.cosignerData.exclusiveFiller,
        exclusivityOverrideBps:
          this.info.cosignerData.exclusivityOverrideBps.toNumber(),
        inputOverride: this.info.cosignerData.inputOverride.toString(),
        outputOverrides: this.info.cosignerData.outputOverrides.map((o) =>
          o.toString()
        ),
      },
      cosignature: this.info.cosignature,
    };
  }

  /**
   * @inheritdoc Order
   */
  resolve(options: OrderResolutionOptions): ResolvedUniswapXOrder {
    return {
      input: {
        token: this.info.input.token,
        amount: getDecayedAmount(
          {
            decayStartTime: this.info.cosignerData.decayStartTime,
            decayEndTime: this.info.cosignerData.decayEndTime,
            startAmount: originalIfZero(
              this.info.cosignerData.inputOverride,
              this.info.input.startAmount
            ),
            endAmount: this.info.input.endAmount,
          },
          options.timestamp
        ),
      },
      outputs: this.info.outputs.map((output, idx) => {
        return {
          token: output.token,
          amount: getDecayedAmount(
            {
              decayStartTime: this.info.cosignerData!.decayStartTime,
              decayEndTime: this.info.cosignerData!.decayEndTime,
              startAmount: originalIfZero(
                this.info.cosignerData!.outputOverrides[idx],
                output.startAmount
              ),
              endAmount: output.endAmount,
            },
            options.timestamp
          ),
        };
      }),
    };
  }

  /**
   * @inheritdoc order
   */
  serialize(): string {
    const abiCoder = new ethers.utils.AbiCoder();
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
  recoverCosigner(): string {
    return ethers.utils.verifyMessage(
      this.cosignatureHash(this.info.cosignerData),
      this.info.cosignature
    );
  }
}

function originalIfZero(value: BigNumber, original: BigNumber): BigNumber {
  return value.isZero() ? original : value;
}

function parseSerializedOrder(serialized: string): CosignedV2DutchOrderInfo {
  const abiCoder = new ethers.utils.AbiCoder();
  const decoded = abiCoder.decode(V2_DUTCH_ORDER_ABI, serialized);
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
      [inputToken, inputStartAmount, inputEndAmount],
      outputs,
      [
        decayStartTime,
        decayEndTime,
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
    input: {
      token: inputToken,
      startAmount: inputStartAmount,
      endAmount: inputEndAmount,
    },
    outputs: outputs.map(
      ([token, startAmount, endAmount, recipient]: [
        string,
        number,
        number,
        string,
        boolean
      ]) => {
        return {
          token,
          startAmount,
          endAmount,
          recipient,
        };
      }
    ),
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
