import { BigNumber, ethers } from "ethers";
import invariant from "tiny-invariant";

import { OrderInfo, UniswapXOrder } from "../order";
import { ValidationInfo } from "../order/validation";

/**
 * Builder for generating orders
 */
export abstract class OrderBuilder {
  protected orderInfo: Partial<OrderInfo>;

  constructor() {
    // set defaults
    this.orderInfo = {
      additionalValidationContract: ethers.constants.AddressZero,
      additionalValidationData: "0x",
    };
  }

  deadline(deadline: number): OrderBuilder {
    this.orderInfo.deadline = deadline;
    return this;
  }

  nonce(nonce: BigNumber): OrderBuilder {
    this.orderInfo.nonce = nonce;
    return this;
  }

  swapper(swapper: string): OrderBuilder {
    this.orderInfo.swapper = swapper;
    return this;
  }

  validation(info: ValidationInfo): OrderBuilder {
    this.orderInfo.additionalValidationContract =
      info.additionalValidationContract;
    this.orderInfo.additionalValidationData = info.additionalValidationData;
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
    invariant(
      this.orderInfo.deadline > Date.now() / 1000,
      `Deadline must be in the future: ${this.orderInfo.deadline}`
    );
    invariant(this.orderInfo.swapper !== undefined, "swapper not set");
    invariant(
      this.orderInfo.additionalValidationContract !== undefined,
      "validation contract not set"
    );
    invariant(
      this.orderInfo.additionalValidationData !== undefined,
      "validation data not set"
    );
    return {
      reactor: this.orderInfo.reactor,
      swapper: this.orderInfo.swapper,
      nonce: this.orderInfo.nonce,
      deadline: this.orderInfo.deadline,
      additionalValidationContract: this.orderInfo.additionalValidationContract,
      additionalValidationData: this.orderInfo.additionalValidationData,
    };
  }

  abstract build(): UniswapXOrder;
}
