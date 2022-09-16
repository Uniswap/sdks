import { SignatureLike, splitSignature } from '@ethersproject/bytes';
import { BaseProvider } from '@ethersproject/providers';
import { ethers } from 'ethers';

import { multicall } from './multicall';
import { MissingConfiguration } from '../errors';
import { ORDER_QUOTER_MAPPING } from '../constants';
import {
  OrderQuoter,
  OrderQuoter__factory,
  DutchLimitOrderReactor__factory,
} from '../contracts';
import { IOrder } from '../order';
import { NonceManager } from './NonceManager';

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

const BASIC_ERROR = '0x08c379a0';

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

export interface SignedOrder {
  order: IOrder;
  signature: SignatureLike;
}

/**
 * Order validator
 */
export class OrderValidator {
  // TODO: use multicall
  // TODO: add batch
  private orderQuoter: OrderQuoter;

  constructor(
    private provider: BaseProvider,
    private chainId: number,
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

  async validate(order: SignedOrder): Promise<OrderValidation> {
    return (await this.validateBatch([order]))[0];
  }

  async validateBatch(orders: SignedOrder[]): Promise<OrderValidation[]> {
    const calls = orders.map(order => {
      const { v, r, s } = splitSignature(order.signature);
      return [order.order.serialize(), { v, r, s }];
    });

    const results = await multicall(this.provider, {
      address: this.orderQuoter.address,
      contractInterface: this.orderQuoter.interface,
      functionName: 'quote',
      functionParams: calls,
    });

    const validations = results.map(result => {
      if (result.success) {
        return OrderValidation.OK;
      } else {
        let returnData = result.returnData;

        // Parse traditional string error messages
        if (returnData.startsWith(BASIC_ERROR)) {
          returnData = new ethers.utils.AbiCoder().decode(
            ['string'],
            '0x' + returnData.slice(10)
          )[0];
        }

        for (const key of Object.keys(KNOWN_ERRORS)) {
          if (returnData.includes(key)) {
            return KNOWN_ERRORS[key];
          }
        }
      }

      return OrderValidation.UnknownError;
    });

    return await this.checkTerminalStates(orders, validations);
  }

  // The quoter contract has a quirk that make validations inaccurate:
  // - checks expiry before anything else, so old but already filled orders will return as canceled
  // so this function takes orders in expired and already filled states and double checks them
  async checkTerminalStates(
    orders: SignedOrder[],
    validations: OrderValidation[]
  ): Promise<OrderValidation[]> {
    return await Promise.all(
      validations.map(async (validation, i) => {
        const order = orders[i];
        if (validation === OrderValidation.Expired) {
          // all reactors have the same orderStatus interface, we just use limitorder to implement the interface
          const reactor = DutchLimitOrderReactor__factory.connect(
            order.order.info.reactor,
            this.provider
          );
          const orderStatus = await reactor.orderStatus(order.order.hash());
          if (orderStatus.isFilled) {
            return OrderValidation.AlreadyFilled;
          } else {
            const nonceManager = new NonceManager(
              this.provider,
              this.chainId,
              await reactor.permitPost()
            );
            const maker = order.order.getSigner(order.signature);
            const cancelled = await nonceManager.isUsed(
              maker,
              order.order.info.nonce
            );
            return cancelled ? OrderValidation.Cancelled : validation;
          }
        } else {
          return validation;
        }
      })
    );
  }
}
