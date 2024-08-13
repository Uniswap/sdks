import { hexStripZeros, SignatureLike } from "@ethersproject/bytes";
import {
  PermitTransferFrom,
  PermitTransferFromData,
  SignatureTransfer,
  Witness,
} from "@uniswap/permit2-sdk";
import { BigNumber, ethers } from "ethers";

import { MPS } from "../constants";
import { getPermit2, ResolvedUniswapXOrder } from "../utils";

import {
  BlockOverrides,
  OffChainOrder,
  OrderInfo,
  PriorityInput,
  PriorityInputJSON,
  PriorityOrderResolutionOptions,
  PriorityOutput,
  PriorityOutputJSON,
} from "./types";
import { CustomOrderValidation, parseValidation } from "./validation";

export class OrderNotFillable extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OrderNotFillable";
  }
}

export type PriorityCosignerData = {
  auctionTargetBlock: BigNumber;
};

export type UnsignedPriorityOrderInfo = OrderInfo & {
  cosigner: string;
  auctionStartBlock: BigNumber;
  baselinePriorityFeeWei: BigNumber;
  input: PriorityInput;
  outputs: PriorityOutput[];
};

export type CosignedPriorityOrderInfo = UnsignedPriorityOrderInfo & {
  cosignerData: PriorityCosignerData;
  cosignature: string;
};

export type UnsignedPriorityOrderInfoJSON = Omit<
  UnsignedPriorityOrderInfo,
  "nonce" | "input" | "outputs" | "auctionStartBlock" | "baselinePriorityFeeWei"
> & {
  nonce: string;
  cosigner: string;
  auctionStartBlock: string;
  baselinePriorityFeeWei: string;
  input: PriorityInputJSON;
  outputs: PriorityOutputJSON[];
};

export type CosignedPriorityOrderInfoJSON = UnsignedPriorityOrderInfoJSON & {
  cosignerData: {
    auctionTargetBlock: string;
  };
  cosignature: string;
};

type PriorityWitnessInfo = {
  info: OrderInfo;
  cosigner: string;
  auctionStartBlock: BigNumber;
  baselinePriorityFeeWei: BigNumber;
  input: PriorityInput;
  outputs: PriorityOutput[];
};

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

export class UnsignedPriorityOrder implements OffChainOrder {
  public permit2Address: string;

  constructor(
    public readonly info: UnsignedPriorityOrderInfo,
    public readonly chainId: number,
    _permit2Address?: string
  ) {
    this.permit2Address = getPermit2(chainId, _permit2Address);
  }

  static fromJSON(
    json: UnsignedPriorityOrderInfoJSON,
    chainId: number,
    _permit2Address?: string
  ): UnsignedPriorityOrder {
    return new UnsignedPriorityOrder(
      {
        ...json,
        cosigner: json.cosigner,
        auctionStartBlock: BigNumber.from(json.auctionStartBlock),
        baselinePriorityFeeWei: BigNumber.from(json.baselinePriorityFeeWei),
        nonce: BigNumber.from(json.nonce),
        input: {
          token: json.input.token,
          amount: BigNumber.from(json.input.amount),
          mpsPerPriorityFeeWei: BigNumber.from(json.input.mpsPerPriorityFeeWei),
        },
        outputs: json.outputs.map((output) => ({
          token: output.token,
          amount: BigNumber.from(output.amount),
          mpsPerPriorityFeeWei: BigNumber.from(output.mpsPerPriorityFeeWei),
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
  ): UnsignedPriorityOrder {
    return new UnsignedPriorityOrder(
      parseSerializedOrder(encoded),
      chainId,
      permit2
    );
  }

  /**
   * @inheritdoc order
   */
  toJSON(): UnsignedPriorityOrderInfoJSON & {
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
  get blockOverrides(): BlockOverrides {
      return {
        number: hexStripZeros(this.info.auctionStartBlock.toHexString()),
      };
  }
  

  /**
   * @inheritdoc order
   */
  serialize(): string {
    const abiCoder = new ethers.utils.AbiCoder();
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
      .from(PRIORITY_ORDER_TYPES)
      .hash(this.witnessInfo());
  }

  /**
   * Returns the resolved order with the given options
   * @return The resolved order
   */
  resolve(_options: PriorityOrderResolutionOptions): ResolvedUniswapXOrder {
    // no cosigner data so no resolution possible
    throw new Error("Method not implemented.");
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
        amount: this.info.input.amount,
      },
      spender: this.info.reactor,
      nonce: this.info.nonce,
      deadline: this.info.deadline,
    };
  }

  private witnessInfo(): PriorityWitnessInfo {
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

  private witness(): Witness {
    return {
      witness: this.witnessInfo(),
      witnessTypeName: "PriorityOrder",
      witnessType: PRIORITY_ORDER_TYPES,
    };
  }

  /**
   * Full order hash that should be signed over by the cosigner
   */
  cosignatureHash(cosignerData: PriorityCosignerData): string {
    const abiCoder = new ethers.utils.AbiCoder();

    return ethers.utils.solidityKeccak256(
      ["bytes32", "uint256", "bytes"],
      [
        this.hash(),
        this.chainId,
        abiCoder.encode(
          [PRIORITY_COSIGNER_DATA_TUPLE_ABI],
          [[cosignerData.auctionTargetBlock]]
        ),
      ]
    );
  }
}

export class CosignedPriorityOrder extends UnsignedPriorityOrder {
  // build a cosigned order from an unsigned order plus cosigner data
  static fromUnsignedOrder(
    order: UnsignedPriorityOrder,
    cosignerData: PriorityCosignerData,
    cosignature: string
  ): CosignedPriorityOrder {
    return new CosignedPriorityOrder(
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
    json: CosignedPriorityOrderInfoJSON,
    chainId: number,
    _permit2Address?: string
  ): CosignedPriorityOrder {
    return new CosignedPriorityOrder(
      {
        ...json,
        nonce: BigNumber.from(json.nonce),
        cosigner: json.cosigner,
        auctionStartBlock: BigNumber.from(json.auctionStartBlock),
        baselinePriorityFeeWei: BigNumber.from(json.baselinePriorityFeeWei),
        input: {
          token: json.input.token,
          amount: BigNumber.from(json.input.amount),
          mpsPerPriorityFeeWei: BigNumber.from(json.input.mpsPerPriorityFeeWei),
        },
        outputs: json.outputs.map((output) => ({
          token: output.token,
          amount: BigNumber.from(output.amount),
          mpsPerPriorityFeeWei: BigNumber.from(output.mpsPerPriorityFeeWei),
          recipient: output.recipient,
        })),
        cosignerData: {
          auctionTargetBlock: BigNumber.from(
            json.cosignerData.auctionTargetBlock
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
  ): CosignedPriorityOrder {
    return new CosignedPriorityOrder(
      parseSerializedOrder(encoded),
      chainId,
      permit2
    );
  }

  constructor(
    public readonly info: CosignedPriorityOrderInfo,
    public readonly chainId: number,
    _permit2Address?: string
  ) {
    super(info, chainId, _permit2Address);
  }

  /**
   * @inheritdoc order
   */
  toJSON(): CosignedPriorityOrderInfoJSON & {
    permit2Address: string;
    chainId: number;
  } {
    return {
      ...super.toJSON(),
      cosignerData: {
        auctionTargetBlock:
          this.info.cosignerData.auctionTargetBlock.toString(),
      },
      cosignature: this.info.cosignature,
    };
  }

  /**
   * @inheritdoc Order
   */
  resolve(options: PriorityOrderResolutionOptions): ResolvedUniswapXOrder {
    if (options.currentBlock) {
      if (
        this.info.cosignerData.auctionTargetBlock.gt(0) &&
        options.currentBlock.lt(this.info.cosignerData.auctionTargetBlock)
      ) {
        throw new OrderNotFillable("Target block in the future");
      } else if (options.currentBlock.lt(this.info.auctionStartBlock)) {
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
  get blockOverrides(): BlockOverrides {
    return {
      number: hexStripZeros(this.info.cosignerData.auctionTargetBlock.toHexString()),
    };
  }

  /**
   * @inheritdoc order
   */
  serialize(): string {
    const abiCoder = new ethers.utils.AbiCoder();
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
  recoverCosigner(): string {
    return ethers.utils.verifyMessage(
      this.cosignatureHash(this.info.cosignerData),
      this.info.cosignature
    );
  }
}

function parseSerializedOrder(serialized: string): CosignedPriorityOrderInfo {
  const abiCoder = new ethers.utils.AbiCoder();
  const decoded = abiCoder.decode(PRIORITY_ORDER_ABI, serialized);
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
      auctionStartBlock,
      baselinePriorityFeeWei,
      [token, amount, mpsPerPriorityFeeWei],
      outputs,
      [auctionTargetBlock],
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
    auctionStartBlock,
    baselinePriorityFeeWei,
    input: {
      token,
      amount,
      mpsPerPriorityFeeWei,
    },
    outputs: outputs.map(
      ([token, amount, mpsPerPriorityFeeWei, recipient]: [
        string,
        BigNumber,
        BigNumber,
        string
      ]) => {
        return {
          token,
          amount,
          mpsPerPriorityFeeWei,
          recipient,
        };
      }
    ),
    cosignerData: {
      auctionTargetBlock,
    },
    cosignature,
  };
}

function scaleInput(input: PriorityInput, priorityFee: BigNumber): BigNumber {
  if (priorityFee.mul(input.mpsPerPriorityFeeWei).gte(MPS)) {
    return BigNumber.from(0);
  }
  return input.amount
    .mul(MPS.sub(priorityFee.mul(input.mpsPerPriorityFeeWei)))
    .div(MPS);
}

function scaleOutputs(
  outputs: PriorityOutput[],
  priorityFee: BigNumber
): PriorityOutput[] {
  return outputs.map((output) => {
    const product = output.amount.mul(
      MPS.add(priorityFee.mul(output.mpsPerPriorityFeeWei))
    );
    const mod = product.mod(MPS);
    const div = product.div(MPS);
    return {
      ...output,
      amount: mod.eq(0) ? div : div.add(1),
    };
  });
}
