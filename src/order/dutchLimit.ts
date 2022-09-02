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

export class DutchLimitOrder implements IOrder<DutchLimitOrderInfo> {
  private readonly permitPost: PermitPost;

  constructor(
    public readonly info: DutchLimitOrderInfo,
    public readonly chainId: number
  ) {
    this.permitPost = new PermitPost(chainId);
  }

  serialize(): string {
    const abiCoder = new ethers.utils.AbiCoder();
    return abiCoder.encode(
      [
        'tuple(address,uint256,uint256)',
        'uint256',
        'uint256',
        'tuple(address,uint256)',
        'tuple(address,uint256,uint256,address)[]',
      ],
      [
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
      ]
    );
  }

  getSigner(signature: SignatureLike): string {
    return ethers.utils.recoverPublicKey(this.digest(), signature);
  }

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

  hash(): string {
    return ethers.utils.keccak256(this.serialize());
  }
}
