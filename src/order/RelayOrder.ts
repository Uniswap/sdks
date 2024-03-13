import { SignatureLike } from "@ethersproject/bytes";
import {
  PermitBatchTransferFrom,
  PermitBatchTransferFromData,
  SignatureTransfer,
  Witness,
} from "@uniswap/permit2-sdk";
import { BigNumber, ethers } from "ethers";

import { PERMIT2_MAPPING } from "../constants";
import { MissingConfiguration } from "../errors";
import { ResolvedRelayOrder } from "../utils/OrderQuoter";
import { getDecayedAmount } from "../utils/dutchDecay";

import { OffChainOrder, OrderInfo, OrderResolutionOptions } from "./types";

export type RelayInput = {
  readonly token: string;
  readonly amount: BigNumber;
  readonly recipient: string;
};

export type RelayFee = {
  readonly token: string;
  readonly startAmount: BigNumber;
  readonly endAmount: BigNumber;
  readonly startTime: number;
  readonly endTime: number;
};

export type RelayInputJSON = Omit<RelayInput, "amount"> & {
  amount: string;
};

export type RelayFeeJSON = Omit<RelayFee, "startAmount" | "endAmount"> & {
  startAmount: string;
  endAmount: string;
};

type RelayOrderNestedOrderInfo = Omit<
  OrderInfo,
  "additionalValidationContract" | "additionalValidationData"
>;

export type RelayOrderInfo = RelayOrderNestedOrderInfo & {
  input: RelayInput;
  fee: RelayFee;
  universalRouterCalldata: string;
};

export type RelayOrderInfoJSON = Omit<
  RelayOrderInfo,
  "nonce" | "input" | "fee"
> & {
  nonce: string;
  input: RelayInputJSON;
  fee: RelayFeeJSON;
  universalRouterCalldata: string;
};

type WitnessInfo = {
  info: RelayOrderNestedOrderInfo;
  input: RelayInput;
  fee: RelayFee;
  universalRouterCalldata: string;
};

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

export class RelayOrder implements OffChainOrder {
  public permit2Address: string;

  constructor(
    public readonly info: RelayOrderInfo,
    public readonly chainId: number,
    readonly _permit2Address?: string
  ) {
    if (_permit2Address) {
      this.permit2Address = _permit2Address;
    } else if (PERMIT2_MAPPING[chainId]) {
      this.permit2Address = PERMIT2_MAPPING[chainId];
    } else {
      throw new MissingConfiguration("permit2", chainId.toString());
    }
  }

  static fromJSON(
    json: RelayOrderInfoJSON,
    chainId: number,
    _permit2Address?: string
  ): RelayOrder {
    return new RelayOrder(
      {
        ...json,
        nonce: BigNumber.from(json.nonce),
        input: {
          token: json.input.token,
          amount: BigNumber.from(json.input.amount),
          recipient: json.input.recipient,
        },
        fee: {
          token: json.fee.token,
          startAmount: BigNumber.from(json.fee.startAmount),
          endAmount: BigNumber.from(json.fee.endAmount),
          startTime: json.fee.startTime,
          endTime: json.fee.endTime,
        },
      },
      chainId,
      _permit2Address
    );
  }

  static parse(encoded: string, chainId: number, permit2?: string): RelayOrder {
    const abiCoder = new ethers.utils.AbiCoder();
    const decoded = abiCoder.decode(RELAY_ORDER_ABI, encoded);
    const [
      [
        [reactor, swapper, nonce, deadline],
        [inputToken, inputAmount, inputRecipient],
        [feeToken, feeStartAmount, feeEndAmount, feeStartTime, feeEndTime],
        universalRouterCalldata,
      ],
    ] = decoded;
    return new RelayOrder(
      {
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
      },
      chainId,
      permit2
    );
  }

  toJSON(): RelayOrderInfoJSON & {
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

  serialize(): string {
    const abiCoder = new ethers.utils.AbiCoder();
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
   * @inheritdoc OrderInterface
   */
  permitData(): PermitBatchTransferFromData {
    return SignatureTransfer.getPermitData(
      this.toPermit(),
      this.permit2Address,
      this.chainId,
      this.witness()
    ) as PermitBatchTransferFromData;
  }

  /**
   * @inheritdoc OrderInterface
   */
  hash(): string {
    return ethers.utils._TypedDataEncoder
      .from(RELAY_WITNESS_TYPES)
      .hash(this.witnessInfo());
  }

  /**
   * Returns the resolved order with the given options
   * @return The resolved order
   */
  resolve(options: OrderResolutionOptions): ResolvedRelayOrder {
    return {
      fee: {
        token: this.info.fee.token,
        amount: getDecayedAmount(
          {
            decayStartTime: this.info.fee.startTime,
            decayEndTime: this.info.fee.endTime,
            startAmount: this.info.fee.startAmount,
            endAmount: this.info.fee.endAmount,
          },
          options.timestamp
        ),
      },
    };
  }

  private toPermit(): PermitBatchTransferFrom {
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

  private witnessInfo(): WitnessInfo {
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

  private witness(): Witness {
    return {
      witness: this.witnessInfo(),
      witnessTypeName: "RelayOrder",
      witnessType: RELAY_WITNESS_TYPES,
    };
  }
}
