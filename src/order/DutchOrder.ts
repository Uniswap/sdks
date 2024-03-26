import { SignatureLike } from "@ethersproject/bytes";
import {
  PermitTransferFrom,
  PermitTransferFromData,
  SignatureTransfer,
  Witness,
} from "@uniswap/permit2-sdk";
import { BigNumber, ethers } from "ethers";
import { keccak256, toUtf8Bytes } from "ethers/lib/utils";

import { BPS, PERMIT2_MAPPING } from "../constants";
import { MissingConfiguration } from "../errors";
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

export function id(text: string): string {
  return keccak256(toUtf8Bytes(text));
}

export type DutchOrderInfo = OrderInfo & {
  decayStartTime: number;
  decayEndTime: number;
  exclusiveFiller: string;
  exclusivityOverrideBps: BigNumber;
  input: DutchInput;
  outputs: DutchOutput[];
};

const STRICT_EXCLUSIVITY = BigNumber.from(0);

export type DutchOrderInfoJSON = Omit<
  DutchOrderInfo,
  "nonce" | "input" | "outputs" | "exclusivityOverrideBps"
> & {
  nonce: string;
  exclusivityOverrideBps: string;
  input: DutchInputJSON;
  outputs: DutchOutputJSON[];
};

type WitnessInfo = {
  info: OrderInfo;
  decayStartTime: number;
  decayEndTime: number;
  exclusiveFiller: string;
  exclusivityOverrideBps: BigNumber;
  inputToken: string;
  inputStartAmount: BigNumber;
  inputEndAmount: BigNumber;
  outputs: DutchOutput[];
};

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

export class DutchOrder implements OffChainOrder {
  public permit2Address: string;

  constructor(
    public readonly info: DutchOrderInfo,
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
    json: DutchOrderInfoJSON,
    chainId: number,
    _permit2Address?: string
  ): DutchOrder {
    return new DutchOrder(
      {
        ...json,
        exclusivityOverrideBps: BigNumber.from(json.exclusivityOverrideBps),
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

  static parse(encoded: string, chainId: number, permit2?: string): DutchOrder {
    const abiCoder = new ethers.utils.AbiCoder();
    const decoded = abiCoder.decode(DUTCH_ORDER_ABI, encoded);
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
        decayStartTime,
        decayEndTime,
        exclusiveFiller,
        exclusivityOverrideBps,
        [inputToken, inputStartAmount, inputEndAmount],
        outputs,
      ],
    ] = decoded;
    return new DutchOrder(
      {
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
      },
      chainId,
      permit2
    );
  }

  toJSON(): DutchOrderInfoJSON & {
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
  serialize(): string {
    const abiCoder = new ethers.utils.AbiCoder();
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
   * @inheritDoc OrderInterface
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
   * @inheritDoc OrderInterface
   */
  hash(): string {
    return ethers.utils._TypedDataEncoder
      .from(DUTCH_ORDER_TYPES)
      .hash(this.witnessInfo());
  }

  /**
   * Returns the resolved order with the given options
   * @return The resolved order
   */
  resolve(options: OrderResolutionOptions): ResolvedUniswapXOrder {
    const useOverride =
      this.info.exclusiveFiller !== ethers.constants.AddressZero &&
      options.timestamp <= this.info.decayStartTime &&
      options.filler !== this.info.exclusiveFiller;
    return {
      input: {
        token: this.info.input.token,
        amount: getDecayedAmount(
          {
            decayStartTime: this.info.decayStartTime,
            decayEndTime: this.info.decayEndTime,
            startAmount: this.info.input.startAmount,
            endAmount: this.info.input.endAmount,
          },
          options.timestamp
        ),
      },
      outputs: this.info.outputs.map((output) => {
        const baseAmount = getDecayedAmount(
          {
            decayStartTime: this.info.decayStartTime,
            decayEndTime: this.info.decayEndTime,
            startAmount: output.startAmount,
            endAmount: output.endAmount,
          },
          options.timestamp
        );
        let amount = baseAmount;
        // strict exclusivity means the order cant be resolved filled at any price
        if (useOverride) {
          if (this.info.exclusivityOverrideBps.eq(STRICT_EXCLUSIVITY)) {
            amount = ethers.constants.MaxUint256;
          } else {
            amount = baseAmount
              .mul(this.info.exclusivityOverrideBps.add(BPS))
              .div(BPS);
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

  private witnessInfo(): WitnessInfo {
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

  private witness(): Witness {
    return {
      witness: this.witnessInfo(),
      // TODO: remove "Limit"
      witnessTypeName: "ExclusiveDutchOrder",
      witnessType: DUTCH_ORDER_TYPES,
    };
  }
}
