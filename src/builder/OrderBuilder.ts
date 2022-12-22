import { BigNumber, ethers } from "ethers";
import invariant from "tiny-invariant";

import { IOrder, OrderInfo } from "../order";

/**
 * Builder for generating orders
 */
export abstract class OrderBuilder {
  protected orderInfo: Partial<OrderInfo>;

  constructor() {
    // set defaults
    this.orderInfo = {
      validationContract: ethers.constants.AddressZero,
      validationData: "0x",
    };
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

  offerer(offerer: string): OrderBuilder {
    this.orderInfo.offerer = offerer;
    return this;
  }

  protected reactor(reactor: string): OrderBuilder {
    this.orderInfo.reactor = reactor;
    return this;
  }

  protected getOrderInfo(): OrderInfo {
    invariant(this.orderInfo.reactor !== undefined, "reactor not set");
    invariant(this.orderInfo.nonce !== undefined, "nonce not set");
    invariant(this.orderInfo.deadline !== undefined, "deadline not set");
    invariant(this.orderInfo.offerer !== undefined, "offerer not set");
    invariant(
      this.orderInfo.validationContract !== undefined,
      "validation contract not set"
    );
    invariant(
      this.orderInfo.validationData !== undefined,
      "validation data not set"
    );
    return {
      reactor: this.orderInfo.reactor,
      offerer: this.orderInfo.offerer,
      nonce: this.orderInfo.nonce,
      deadline: this.orderInfo.deadline,
      validationContract: this.orderInfo.validationContract,
      validationData: this.orderInfo.validationData,
    };
  }

  abstract build(): IOrder;
}
