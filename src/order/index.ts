import { SignatureLike } from '@ethersproject/bytes';
import { BigNumber } from 'ethers';
import { Token } from '@uniswap/sdk-core';

export interface IOrder {
  /**
   * Returns the abi encoded order
   */
  serialize(): string;

  /**
   * Returns the msg digest that is signed over for order validation and token
   * release
   */
  get digest(): string;
  get hash(): string;

  verifySignature(signature: SignatureLike): boolean;
}

export interface TokenAmount {
  token: Token;
  amount: BigNumber;
}

export interface OrderInfo {
  counter: BigNumber;
  deadline: number;
}

export enum OrderType {
  LimitOrder,
  DutchLimitOrder,
}
