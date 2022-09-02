import { Token } from '@uniswap/sdk-core';
import { ethers, BigNumber } from 'ethers'
import { IOrder, OrderInfo, TokenAmount } from '.';
import { REACTOR_ADDRESS_MAPPING } from '../constants';
import { PermitPost, TokenType } from '../utils';

export interface DutchOutput {
  token: Token;
  startAmount: BigNumber;
  endAmount: BigNumber;
  recipient: string;
}

export interface DutchLimitOrderInfo {
  info: OrderInfo;
  startTime: number;
  endTime: number;
  deadline?: number;
  input: TokenAmount;
  outputs: DutchOutput[];
  nonce: number;
}

export class DutchLimitOrder implements IOrder {
  private permitPost: PermitPost;
  private reactorAddress: string;

  constructor(public info: DutchLimitOrderInfo, public chainId: number, reactorAddress?: string) {
    this.permitPost = new PermitPost(chainId);

    if (reactorAddress) {
      this.reactorAddress = reactorAddress;
    } else if (REACTOR_ADDRESS_MAPPING[chainId].dutchLimit) {
      this.reactorAddress = REACTOR_ADDRESS_MAPPING[chainId].dutchLimit;
    } else {
      throw new Error(`No configured dutchLimit reactor for chainId: ${chainId}`);
    }
  }

  get digest(): string {
    return this.permitPost.getPermitDigest({
      tokens: [{
        tokenType: TokenType.ERC20,
        token: this.info.input.token.address,
        maxAmount: this.info.input.amount,
        id: BigNumber.from(0),
      }],
      spender: this.reactorAddress,
      deadline: this.info.deadline !== undefined ? this.info.deadline : this.info.endTime,
      witness: this.hash,
      nonce: this.info.nonce,
    });
  }

  get hash(): string {
    const abiCoder = new ethers.utils.AbiCoder();
    const encoded = abiCoder.encode(['tuple(address,uint256,uint256)', 'uint256', 'uint256', 'tuple(address,uint256)', 'tuple(address,uint256,uint256,address)[]'], [
      [this.reactorAddress, this.info.nonce, this.info.deadline],
      this.info.startTime,
      this.info.endTime,
      [this.info.input.token, this.info.input.amount],
      this.info.outputs.map((output) => [output.token, output.startAmount, output.endAmount, output.recipient]),
    ]);
    return ethers.utils.keccak256(encoded);
  }
}

