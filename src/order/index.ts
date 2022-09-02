import { SignatureLike } from '@ethersproject/bytes';
import { Token } from '@uniswap/sdk-core';
import { BigNumber } from 'ethers';

import { OrderType, REVERSE_REACTOR_MAPPING } from '../constants';
import { stripHexPrefix } from '../utils';

import { DutchLimitOrder } from './dutchLimit';

export * from './dutchLimit';

export type IOrder = {
  // TODO: maybe add generic types for more order-type specific info
  info: OrderInfo;

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
  readonly reactor: string;
  readonly nonce: BigNumber;
  readonly deadline: number;
};

/**
 * Parses a given serialized order
 * @return Parsed order object
 */
export function parseOrder(order: string): IOrder {
  // reactor address is always the first field in order
  const reactor = '0x' + stripHexPrefix(order).slice(0, 40).toLowerCase();

  if (!REVERSE_REACTOR_MAPPING[reactor]) {
    throw new Error(`Unknown reactor address: ${reactor}`);
  }

  const { chainId, orderType } = REVERSE_REACTOR_MAPPING[reactor];
  switch (orderType) {
    case OrderType.DutchLimit:
      return DutchLimitOrder.parse(order, chainId);
    default:
      throw new Error(`Unknown order type: ${orderType}`);
  }
}
