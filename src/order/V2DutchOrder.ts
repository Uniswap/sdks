import { SignatureLike } from "@ethersproject/bytes";
import {
  PermitTransferFrom,
  PermitTransferFromData,
  SignatureTransfer,
  Witness,
} from "@uniswap/permit2-sdk";
import { BigNumber, ethers } from "ethers";

import { PERMIT2_MAPPING } from "../constants";
import { MissingConfiguration } from "../errors";
import { ResolvedOrder } from "../utils/OrderQuoter";
import { getDecayedAmount } from "../utils/dutchDecay";

import {
  DutchInput,
  DutchInputJSON,
  DutchOutput,
  DutchOutputJSON,
  OrderInfo,
  OrderResolutionOptions,
  V2Order,
} from "./types";

export type CosignerData = {
  decayStartTime: number;
  decayEndTime: number;
  exclusiveFiller: string;
  inputOverride: BigNumber;
  outputOverrides: BigNumber[];
};

export type CosignerDataJSON = {
  decayStartTime: number;
  decayEndTime: number;
  exclusiveFiller: string;
  inputOverride: string;
  outputOverrides: string[];
};

export type V2DutchOrderInfo = OrderInfo & {
  cosigner: string;
  cosignerData: CosignerData;
  input: DutchInput;
  outputs: DutchOutput[];
  cosignature?: string;
};

export type V2DutchOrderInfoJSON = Omit<
  V2DutchOrderInfo,
  "nonce" | "input" | "outputs" | "cosignerData"
> & {
  nonce: string;
  input: DutchInputJSON;
  outputs: DutchOutputJSON[];
  cosignerData: CosignerDataJSON;
};

type V2WitnessInfo = {
  info: OrderInfo;
  cosigner: string;
  inputToken: string;
  inputStartAmount: BigNumber;
  inputEndAmount: BigNumber;
  outputs: DutchOutput[];
};

const V2_DUTCH_ORDER_TYPES = {
  V2DutchOrder: [
    { name: "info", type: "OrderInfo" },
    { name: "cosigner", type: "address" },
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

const V2_DUTCH_ORDER_ABI = [
  "tuple(" +
    [
      "tuple(address,address,uint256,uint256,address,bytes)", // OrderInfo
      "address", // cosigner
      "tuple(address,uint256,uint256)", // input
      "tuple(address,uint256,uint256,address)[]", // outputs
      "tuple(uint256,uint256,address,uint256,uint256[])", // cosignerData
      "bytes", // cosignature
    ].join(",") +
    ")",
];

export class V2DutchOrder extends V2Order {
  public permit2Address: string;

  constructor(
    public readonly info: V2DutchOrderInfo,
    public readonly chainId: number,
    readonly _permit2Address?: string
  ) {
    super();
    if (_permit2Address) {
      this.permit2Address = _permit2Address;
    } else if (PERMIT2_MAPPING[chainId]) {
      this.permit2Address = PERMIT2_MAPPING[chainId];
    } else {
      throw new MissingConfiguration("permit2", chainId.toString());
    }
  }

  static fromJSON(
    json: V2DutchOrderInfoJSON,
    chainId: number,
    _permit2Address?: string
  ): V2DutchOrder {
    return new V2DutchOrder(
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
          ...json.cosignerData,
          inputOverride: BigNumber.from(json.cosignerData.inputOverride),
          outputOverrides: json.cosignerData.outputOverrides.map((value) =>
            BigNumber.from(value)
          ),
        },
      },
      chainId,
      _permit2Address
    );
  }

  static parse(
    encoded: string,
    chainId: number,
    permit2?: string
  ): V2DutchOrder {
    const abiCoder = new ethers.utils.AbiCoder();
    const decoded = abiCoder.decode(V2_DUTCH_ORDER_ABI, encoded);
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
          inputOverride,
          outputOverrides,
        ],
        cosignature,
      ],
    ] = decoded;
    return new V2DutchOrder(
      {
        reactor,
        swapper,
        nonce,
        deadline: deadline.toNumber(),
        additionalValidationContract,
        additionalValidationData,
        cosigner,
        cosignerData: {
          decayStartTime: decayStartTime.toNumber(),
          decayEndTime: decayEndTime.toNumber(),
          exclusiveFiller,
          inputOverride,
          outputOverrides,
        },
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
        cosignature,
      },
      chainId,
      permit2
    );
  }

  /**
   * @inheritdoc order
   */
  toJSON(): V2DutchOrderInfoJSON & {
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
      cosignerData: {
        decayStartTime: this.info.cosignerData.decayStartTime,
        decayEndTime: this.info.cosignerData.decayEndTime,
        exclusiveFiller: this.info.cosignerData.exclusiveFiller,
        inputOverride: this.info.cosignerData.inputOverride.toString(),
        outputOverrides: this.info.cosignerData.outputOverrides.map((value) =>
          value.toString()
        ),
      },
      cosignature: this.info.cosignature,
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
          this.info.cosignerData.inputOverride,
          this.info.cosignerData.outputOverrides,
        ],
        this.info.cosignature,
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
   * @inheritdoc Order
   */
  hashFullOrder(): string {
    const abiCoder = new ethers.utils.AbiCoder();
    return ethers.utils.solidityKeccak256(
      ["bytes32", "bytes"],
      [
        this.hash(),
        abiCoder.encode(
          ["uint256", "uint256", "address", "uint256", "uint256[]"],
          [
            this.info.cosignerData.decayStartTime,
            this.info.cosignerData.decayEndTime,
            this.info.cosignerData.exclusiveFiller,
            this.info.cosignerData.inputOverride,
            this.info.cosignerData.outputOverrides,
          ]
        ),
      ]
    );
  }

  /**
   * @inheritdoc Order
   */
  resolve(options: OrderResolutionOptions): ResolvedOrder {
    return {
      input: {
        token: this.info.input.token,
        amount: getDecayedAmount(
          {
            decayStartTime: this.info.cosignerData.decayStartTime,
            decayEndTime: this.info.cosignerData.decayEndTime,
            startAmount: this.info.cosignerData.inputOverride,
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
              decayStartTime: this.info.cosignerData.decayStartTime,
              decayEndTime: this.info.cosignerData.decayEndTime,
              startAmount: this.info.cosignerData.outputOverrides[idx],
              endAmount: output.endAmount,
            },
            options.timestamp
          ),
        };
      }),
    };
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
      inputToken: this.info.input.token,
      inputStartAmount: this.info.input.startAmount,
      inputEndAmount: this.info.input.endAmount,
      outputs: this.info.outputs,
    };
  }

  private witness(): Witness {
    return {
      witness: this.witnessInfo(),
      // TODO: remove "Limit"
      witnessTypeName: "V2DutchOrder",
      witnessType: V2_DUTCH_ORDER_TYPES,
    };
  }
}

export class CosignedV2DutchOrder extends V2DutchOrder {
  constructor(
    public readonly info: Omit<V2DutchOrderInfo, "cosignature"> & {
      cosignature: string;
    },
    public readonly chainId: number,
    readonly _permit2Address?: string
  ) {
    super(info, chainId, _permit2Address);
  }

  static fromUnsignedOrder(
    order: V2DutchOrder,
    cosignature: string
  ): CosignedV2DutchOrder {
    return new CosignedV2DutchOrder(
      {
        ...order.info,
        cosignature,
      },
      order.chainId,
      order.permit2Address
    );
  }

  /**
   *  recovers co-signer address from cosignature and full order hash
   *  @param fullOrderHash The full order hash over (orderHash || cosignerData)
   *  @param cosignature The cosignature to recover
   *  @returns The address which co-signed the order
   */
  recoverCosigner(
    fullOrderHash: string,
    cosignature: string = this.info.cosignature
  ): string {
    return ethers.utils.verifyMessage(fullOrderHash, cosignature);
  }
}
