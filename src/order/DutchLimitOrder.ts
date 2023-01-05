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

import { Order, OrderInfo } from "./types";

export type DutchOutput = {
  readonly token: string;
  readonly startAmount: BigNumber;
  readonly endAmount: BigNumber;
  readonly recipient: string;
  readonly isFeeOutput: boolean;
};

export type DutchInput = {
  readonly token: string;
  readonly startAmount: BigNumber;
  readonly endAmount: BigNumber;
};

export type DutchLimitOrderInfo = OrderInfo & {
  startTime: number;
  endTime: number;
  input: DutchInput;
  outputs: DutchOutput[];
};

type WitnessInfo = OrderInfo & {
  startTime: number;
  endTime: number;
  inputToken: string;
  inputStartAmount: BigNumber;
  inputEndAmount: BigNumber;
  outputs: DutchOutput[];
};

const DUTCH_LIMIT_ORDER_TYPES = {
  DutchLimitOrder: [
    { name: "reactor", type: "address" },
    { name: "offerer", type: "address" },
    { name: "nonce", type: "uint256" },
    { name: "deadline", type: "uint256" },
    { name: "validationContract", type: "address" },
    { name: "validationData", type: "bytes" },

    { name: "startTime", type: "uint256" },
    { name: "endTime", type: "uint256" },
    { name: "inputToken", type: "address" },
    { name: "inputStartAmount", type: "uint256" },
    { name: "inputEndAmount", type: "uint256" },
    { name: "outputs", type: "DutchOutput[]" },
  ],
  DutchOutput: [
    { name: "token", type: "address" },
    { name: "startAmount", type: "uint256" },
    { name: "endAmount", type: "uint256" },
    { name: "recipient", type: "address" },
    { name: "isFeeOutput", type: "bool" },
  ],
};

const DUTCH_LIMIT_ORDER_ABI = [
  "tuple(" +
    [
      "tuple(address,address,uint256,uint256,address,bytes)",
      "uint256",
      "uint256",
      "tuple(address,uint256,uint256)",
      "tuple(address,uint256,uint256,address,bool)[]",
    ].join(",") +
    ")",
];

export class DutchLimitOrder extends Order {
  public permit2Address: string;

  constructor(
    public readonly info: DutchLimitOrderInfo,
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

  static parse(encoded: string, chainId: number): DutchLimitOrder {
    const abiCoder = new ethers.utils.AbiCoder();
    const decoded = abiCoder.decode(DUTCH_LIMIT_ORDER_ABI, encoded);
    const [
      [
        [reactor, offerer, nonce, deadline, validationContract, validationData],
        startTime,
        endTime,
        [inputToken, inputStartAmount, inputEndAmount],
        outputs,
      ],
    ] = decoded;
    return new DutchLimitOrder(
      {
        reactor,
        offerer,
        nonce,
        deadline: deadline.toNumber(),
        validationContract,
        validationData,
        startTime: startTime.toNumber(),
        endTime: endTime.toNumber(),
        input: {
          token: inputToken,
          startAmount: inputStartAmount,
          endAmount: inputEndAmount,
        },
        outputs: outputs.map(
          ([token, startAmount, endAmount, recipient, isFeeOutput]: [
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
              isFeeOutput,
            };
          }
        ),
      },
      chainId
    );
  }

  /**
   * @inheritdoc Order
   */
  serialize(): string {
    const abiCoder = new ethers.utils.AbiCoder();
    return abiCoder.encode(DUTCH_LIMIT_ORDER_ABI, [
      [
        [
          this.info.reactor,
          this.info.offerer,
          this.info.nonce,
          this.info.deadline,
          this.info.validationContract,
          this.info.validationData,
        ],
        this.info.startTime,
        this.info.endTime,
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
          output.isFeeOutput,
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
      .from(DUTCH_LIMIT_ORDER_TYPES)
      .hash(this.witnessInfo());
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

  private witnessInfo(): WitnessInfo {
    return {
      reactor: this.info.reactor,
      offerer: this.info.offerer,
      nonce: this.info.nonce,
      deadline: this.info.deadline,
      validationContract: this.info.validationContract,
      validationData: this.info.validationData,
      startTime: this.info.startTime,
      endTime: this.info.endTime,
      inputToken: this.info.input.token,
      inputStartAmount: this.info.input.startAmount,
      inputEndAmount: this.info.input.endAmount,
      outputs: this.info.outputs,
    };
  }

  private witness(): Witness {
    return {
      witness: this.witnessInfo(),
      witnessTypeName: "DutchLimitOrder",
      witnessType: DUTCH_LIMIT_ORDER_TYPES,
    };
  }
}
