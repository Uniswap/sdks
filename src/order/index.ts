import { SignatureLike } from '@ethersproject/bytes';
import { Token } from '@uniswap/sdk-core';
import { BigNumber } from 'ethers';

export type IOrder<T extends OrderInfo> = {
  readonly info: T;

  /**
   * Returns the abi encoded order
   */
  serialize(): string;

  getSigner(signature: SignatureLike): string;

  /**
   * Returns the msg digest that is signed over for order validation and token
   * release
   */
  digest(): string;
  hash(): string;
};

export type TokenAmount = {
  readonly token: Token;
  readonly amount: BigNumber;
};

export type OrderInfo = {
  readonly reactor: string;
  readonly nonce: BigNumber;
  readonly deadline: number;
};

export enum OrderType {
  LimitOrder,
  DutchLimitOrder,
}
