import { SignatureLike } from '@ethersproject/bytes';
import { Token } from '@uniswap/sdk-core';
import { BigNumber, ethers } from 'ethers';
import invariant from 'tiny-invariant';

import { OrderType, REACTOR_ADDRESS_MAPPING } from '../constants';
import { MissingConfiguration } from '../errors';
import { PermitPost, TokenType } from '../utils';

import {
  IOrder,
  OrderBuilder,
  OrderInfo,
  OrderValidation,
  TokenAmount,
} from '.';

export type DutchOutput = {
  readonly token: Token;
  readonly startAmount: BigNumber;
  readonly endAmount: BigNumber;
  readonly recipient: string;
};

export type DutchLimitOrderInfo = OrderInfo & {
  startTime: number;
  endTime: number;
  input: TokenAmount;
  outputs: DutchOutput[];
};

const DUTCH_LIMIT_ORDER_ABI = [
  'tuple(address,uint256,uint256)',
  'uint256',
  'uint256',
  'tuple(address,uint256)',
  'tuple(address,uint256,uint256,address)[]',
];

export class DutchLimitOrder implements IOrder {
  private readonly permitPost: PermitPost;

  constructor(
    public readonly info: DutchLimitOrderInfo,
    public readonly chainId: number
  ) {
    this.permitPost = new PermitPost(chainId);
  }

  static parse(encoded: string, chainId: number): DutchLimitOrder {
    const abiCoder = new ethers.utils.AbiCoder();
    const decoded = abiCoder.decode(DUTCH_LIMIT_ORDER_ABI, encoded);
    const [
      [reactor, nonce, deadline],
      startTime,
      endTime,
      [inputToken, inputAmount],
      outputs,
    ] = decoded;
    return new DutchLimitOrder(
      {
        reactor,
        nonce,
        deadline,
        startTime,
        endTime,
        input: { token: inputToken, amount: inputAmount },
        outputs: outputs.map(
          ([token, startAmount, endAmount, recipient]: [
            string,
            number,
            number,
            string
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
      chainId
    );
  }

  /**
   * @inheritdoc IOrder
   */
  validate(): OrderValidation {
    if (this.info.deadline < new Date().getTime() / 1000) {
      return OrderValidation.Expired;
    }

    return OrderValidation.OK;
  }

  /**
   * @inheritdoc IOrder
   */
  serialize(): string {
    const abiCoder = new ethers.utils.AbiCoder();
    return abiCoder.encode(DUTCH_LIMIT_ORDER_ABI, [
      [this.info.reactor, this.info.nonce, this.info.deadline],
      this.info.startTime,
      this.info.endTime,
      [this.info.input.token, this.info.input.amount],
      this.info.outputs.map(output => [
        output.token,
        output.startAmount,
        output.endAmount,
        output.recipient,
      ]),
    ]);
  }

  /**
   * @inheritdoc IOrder
   */
  getSigner(signature: SignatureLike): string {
    return ethers.utils.computeAddress(
      ethers.utils.recoverPublicKey(this.digest(), signature)
    );
  }

  /**
   * @inheritdoc IOrder
   */
  digest(): string {
    return this.permitPost.getPermitDigest({
      tokens: [
        {
          tokenType: TokenType.ERC20,
          token: this.info.input.token.address,
          maxAmount: this.info.input.amount,
          id: BigNumber.from(0),
        },
      ],
      spender: this.info.reactor,
      deadline: this.info.deadline,
      witness: this.hash(),
      nonce: this.info.nonce,
    });
  }

  /**
   * @inheritdoc IOrder
   */
  hash(): string {
    return ethers.utils.keccak256(this.serialize());
  }
}

export class DutchLimitOrderBuilder extends OrderBuilder {
  private info: Partial<DutchLimitOrderInfo>;

  constructor(private chainId: number, reactorAddress?: string) {
    super();

    if (reactorAddress) {
      this.reactor(reactorAddress);
    } else if (
      REACTOR_ADDRESS_MAPPING[chainId] &&
      REACTOR_ADDRESS_MAPPING[chainId][OrderType.DutchLimit]
    ) {
      const reactorAddress =
        REACTOR_ADDRESS_MAPPING[chainId][OrderType.DutchLimit];
      this.reactor(reactorAddress);
    } else {
      throw new MissingConfiguration('reactor', chainId.toString());
    }

    this.info = {
      outputs: [],
    };
  }

  startTime(startTime: number): DutchLimitOrderBuilder {
    invariant(
      !this.info.endTime || startTime <= this.info.endTime,
      `startTime must be before endTime: ${startTime}`
    );

    invariant(
      !this.orderInfo.deadline || startTime <= this.orderInfo.deadline,
      `startTime must be before deadline: ${startTime}`
    );
    this.info.startTime = startTime;
    return this;
  }

  endTime(endTime: number): DutchLimitOrderBuilder {
    invariant(
      !this.info.startTime || endTime >= this.info.startTime,
      `endTime must be after startTime: ${endTime}`
    );
    invariant(
      !this.orderInfo.deadline || endTime <= this.orderInfo.deadline,
      `endTime must be before deadline: ${endTime}`
    );
    this.info.endTime = endTime;
    return this;
  }

  input(input: TokenAmount): DutchLimitOrderBuilder {
    this.info.input = input;
    return this;
  }

  output(output: DutchOutput): DutchLimitOrderBuilder {
    if (!this.info.outputs) {
      this.info.outputs = [];
    }
    this.info.outputs.push(output);
    return this;
  }

  build(): DutchLimitOrder {
    invariant(this.info.startTime !== undefined, 'startTime not set');
    invariant(this.info.endTime !== undefined, 'endTime not set');
    invariant(this.info.input !== undefined, 'input not set');
    invariant(
      this.info.outputs !== undefined && this.info.outputs.length !== 0,
      'outputs not set'
    );

    return new DutchLimitOrder(
      Object.assign(this.getOrderInfo(), {
        startTime: this.info.startTime,
        endTime: this.info.endTime,
        input: this.info.input,
        outputs: this.info.outputs,
      }),
      this.chainId
    );
  }
}
