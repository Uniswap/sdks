import { SignatureLike } from '@ethersproject/bytes';
import { Token } from '@uniswap/sdk-core';
import { BigNumber } from 'ethers';
import invariant from 'tiny-invariant';

import { OrderType, REVERSE_REACTOR_MAPPING } from '../constants';
import { MissingConfiguration } from '../errors';
import { stripHexPrefix } from '../utils';

import { DutchLimitOrder } from './dutchLimit';

export * from './dutchLimit';

export enum OrderValidation {
  Expired,
  OK,
}

export type IOrder = {
  // TODO: maybe add generic types for more order-type specific info
  info: OrderInfo;

  /**
   * Validates the order parameters
   * Note that this doesn't validate any on-chain properties of the order, i.e.
   * the offerer's token balance or nonce reuse
   */
  validate(): OrderValidation;

  // TODO: maybe add generic order info getters, i.e.
  // affectedTokens, validTimes, max amounts?
  // not yet sure what is useful / generic here

  /**
   * Returns the abi encoded order
   * @return The abi encoded serialized order which can be submitted on-chain
   */
  serialize(): string;

  /**
   * Recovers the given signature, returning the address which created it
   *  * @param signature The signature to recover
   *  * @returns address The address which created the signature
   */
  getSigner(signature: SignatureLike): string;

  /**
   * Returns the message digest that is signed over for order validation and token
   * release
   * @return The message digest which is signed by the offerer
   */
  digest(): string;

  /**
   * Returns the order hash
   * @return The order hash which is used as a key on-chain
   */
  hash(): string;
};

export type TokenAmount = {
  readonly token: Token;
  readonly amount: BigNumber;
};

export type OrderInfo = {
  reactor: string;
  nonce: BigNumber;
  deadline: number;
};

/**
 * Builder for generating orders
 */
export abstract class OrderBuilder {
  protected orderInfo: Partial<OrderInfo>;

  constructor() {
    this.orderInfo = {};
  }

  deadline(deadline: number): OrderBuilder {
    invariant(
      deadline > new Date().getTime() / 1000,
      `Deadline must be in the future: ${deadline}`
    );
    this.orderInfo.deadline = deadline;
    return this;
  }

  nonce(nonce: BigNumber): OrderBuilder {
    this.orderInfo.nonce = nonce;
    return this;
  }

  protected reactor(reactor: string): OrderBuilder {
    this.orderInfo.reactor = reactor;
    return this;
  }

  protected getOrderInfo(): OrderInfo {
    invariant(this.orderInfo.reactor !== undefined, 'reactor not set');
    invariant(this.orderInfo.nonce !== undefined, 'nonce not set');
    invariant(this.orderInfo.deadline !== undefined, 'deadline not set');
    return {
      reactor: this.orderInfo.reactor,
      nonce: this.orderInfo.nonce,
      deadline: this.orderInfo.deadline,
    };
  }

  abstract build(): IOrder;
}

/**
 * Parses a given serialized order
 * @return Parsed order object
 */
export function parseOrder(order: string): IOrder {
  // reactor address is always the first field in order
  const reactor =
    '0x' +
    stripHexPrefix(order)
      .slice(0, 40)
      .toLowerCase();

  if (!REVERSE_REACTOR_MAPPING[reactor]) {
    throw new MissingConfiguration('reactor', reactor);
  }

  const { chainId, orderType } = REVERSE_REACTOR_MAPPING[reactor];
  switch (orderType) {
    case OrderType.DutchLimit:
      return DutchLimitOrder.parse(order, chainId);
    default:
      throw new MissingConfiguration('orderType', orderType);
  }
}
