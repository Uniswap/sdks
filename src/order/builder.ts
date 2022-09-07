import invariant from 'tiny-invariant';
import { BigNumber } from 'ethers';

import { IOrder, OrderInfo } from './types';

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
