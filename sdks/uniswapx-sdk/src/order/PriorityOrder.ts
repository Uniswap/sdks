import { SignatureLike } from "@ethersproject/bytes";
import {
  PermitTransferFrom,
  PermitTransferFromData,
  SignatureTransfer,
  Witness,
} from "@uniswap/permit2-sdk";
import { BigNumber, ethers } from "ethers";

import { ResolvedUniswapXOrder, getPermit2 } from "../utils";

import {
  OffChainOrder,
  OrderInfo,
  PriorityInput,
  PriorityInputJSON,
  PriorityOrderResolutionOptions,
  PriorityOutput,
  PriorityOutputJSON,
} from "./types";
import { CustomOrderValidation, parseValidation } from "./validation";

export const MPS = BigNumber.from(10).pow(7);

export type PriorityOrderInfo = OrderInfo & {
  startBlock: BigNumber;
  input: PriorityInput;
  outputs: PriorityOutput[];
};

export type PriorityOrderInfoJSON = Omit<
  PriorityOrderInfo,
  "nonce" | "input" | "outputs" | "startBlock"
> & {
  nonce: string;
  startBlock: string;
  input: PriorityInputJSON;
  outputs: PriorityOutputJSON[];
};

type PriorityWitnessInfo = {
  info: OrderInfo;
  startBlock: BigNumber;
  input: PriorityInput;
  outputs: PriorityOutput[];
};

const PRIORITY_ORDER_TYPES = {
  PriorityOrder: [
    { name: "info", type: "OrderInfo" },
    { name: "startBlock", type: "uint256" },
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
      "uint256", // startBlock
      "tuple(address,uint256,uint256)", // input
      "tuple(address,uint256,uint256,address)[]", // outputs
    ].join(",") +
    ")",
];

export class PriorityOrder implements OffChainOrder {
  public permit2Address: string;

  constructor(
    public readonly info: PriorityOrderInfo,
    public readonly chainId: number,
    _permit2Address?: string
  ) {
    this.permit2Address = getPermit2(chainId, _permit2Address);
  }

  static fromJSON(
    json: PriorityOrderInfoJSON,
    chainId: number,
    _permit2Address?: string
  ): PriorityOrder {
    return new PriorityOrder(
      {
        ...json,
        startBlock: BigNumber.from(json.startBlock),
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
  ): PriorityOrder {
    return new PriorityOrder(parseSerializedOrder(encoded), chainId, permit2);
  }

  /**
   * @inheritdoc order
   */
  toJSON(): PriorityOrderInfoJSON & {
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
      startBlock: this.info.startBlock.toString(),
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
        this.info.startBlock,
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
  resolve(options: PriorityOrderResolutionOptions): ResolvedUniswapXOrder {
    return {
      input: {
        token: this.info.input.token,
        amount: scaleInput(this.info.input, options.priorityFee),
      },
      outputs: scaleOutputs(this.info.outputs, options.priorityFee),
    };
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
      startBlock: this.info.startBlock,
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
}

function parseSerializedOrder(serialized: string): PriorityOrderInfo {
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
      startBlock,
      [token, amount, mpsPerPriorityFeeWei],
      outputs,
    ],
  ] = decoded;

  return {
    reactor,
    swapper,
    nonce,
    deadline: deadline.toNumber(),
    additionalValidationContract,
    additionalValidationData,
    startBlock,
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
      amount: mod ? div.add(1) : div,
    };
  });
}
