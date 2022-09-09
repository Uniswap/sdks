import { SignatureLike, splitSignature } from '@ethersproject/bytes';
import { ethers } from 'ethers';

import { MissingConfiguration } from '../errors';
import { ORDER_QUOTER_MAPPING } from '../constants';
import { OrderQuoter, OrderQuoter__factory } from '../contracts';
import { IOrder } from '../order';

export enum OrderValidation {
  Expired,
  AlreadyFilled,
  Cancelled,
  InsufficientFunds,
  InvalidSignature,
  InvalidOrderFields,
  UnknownError,
  OK,
}

const KNOWN_ERRORS: { [key: string]: OrderValidation } = {
  '8baa579f': OrderValidation.InvalidSignature,
  '1f6d5aef': OrderValidation.Cancelled,
  // invalid dutch decay time
  '302e5b7c': OrderValidation.InvalidOrderFields,
  // invalid dutch decay time
  '773a6187': OrderValidation.InvalidOrderFields,
  // invalid reactor address
  '4ddf4a64': OrderValidation.InvalidOrderFields,
  '70f65caa': OrderValidation.Expired,
  ee3b3d4b: OrderValidation.AlreadyFilled,
  TRANSFER_FROM_FAILED: OrderValidation.InsufficientFunds,
};

/**
 * Order validator
 */
export class OrderValidator {
  // TODO: use multicall
  // TODO: add batch
  private orderQuoter: OrderQuoter;

  constructor(
    private provider: ethers.providers.Provider,
    chainId: number,
    orderQuoterAddress?: string
  ) {
    if (orderQuoterAddress) {
      this.orderQuoter = OrderQuoter__factory.connect(
        orderQuoterAddress,
        provider
      );
    } else if (ORDER_QUOTER_MAPPING[chainId]) {
      this.orderQuoter = OrderQuoter__factory.connect(
        ORDER_QUOTER_MAPPING[chainId],
        this.provider
      );
    } else {
      throw new MissingConfiguration('orderQuoter', chainId.toString());
    }
  }

  async validate(
    order: IOrder,
    signature: SignatureLike
  ): Promise<OrderValidation> {
    if (order.info.deadline < new Date().getTime() / 1000) {
      return OrderValidation.Expired;
    }

    try {
      const { v, r, s } = splitSignature(signature);
      await this.orderQuoter.callStatic.quote(order.serialize(), { v, r, s });
      return OrderValidation.OK;
    } catch (e) {
      if (e instanceof Error) {
        for (const key of Object.keys(KNOWN_ERRORS)) {
          if (e.message.includes(key)) {
            return KNOWN_ERRORS[key];
          }
        }
      }

      return OrderValidation.UnknownError;
    }
  }
}
