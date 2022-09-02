import { SignatureLike } from '@ethersproject/bytes';
import { Token } from '@uniswap/sdk-core';
import { BigNumber, ethers } from 'ethers';

import { PermitPost, TokenType } from '../utils';

import { IOrder, OrderInfo, TokenAmount } from '.';

export type DutchOutput = {
  readonly token: Token;
  readonly startAmount: BigNumber;
  readonly endAmount: BigNumber;
  readonly recipient: string;
};

export type DutchLimitOrderInfo = OrderInfo & {
  readonly startTime: number;
  readonly endTime: number;
  readonly input: TokenAmount;
  readonly outputs: readonly DutchOutput[];
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
  serialize(): string {
    const abiCoder = new ethers.utils.AbiCoder();
    return abiCoder.encode(DUTCH_LIMIT_ORDER_ABI, [
      [this.info.reactor, this.info.nonce, this.info.deadline],
      this.info.startTime,
      this.info.endTime,
      [this.info.input.token, this.info.input.amount],
      this.info.outputs.map((output) => [
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
