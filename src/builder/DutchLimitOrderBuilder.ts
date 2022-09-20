import { BigNumber } from "ethers";
import invariant from "tiny-invariant";

import { OrderType, REACTOR_ADDRESS_MAPPING } from "../constants";
import { MissingConfiguration } from "../errors";
import {
  DutchLimitOrder,
  DutchLimitOrderInfo,
  DutchOutput,
  TokenAmount,
} from "../order";

import { OrderBuilder } from "./OrderBuilder";

/**
 * Helper builder for generating dutch limit orders
 */
export class DutchLimitOrderBuilder extends OrderBuilder {
  private info: Partial<DutchLimitOrderInfo>;

  constructor(
    private chainId: number,
    reactorAddress?: string,
    private permitPostAddress?: string
  ) {
    super();

    if (reactorAddress) {
      this.reactor(reactorAddress);
    } else if (
      REACTOR_ADDRESS_MAPPING[chainId] &&
      REACTOR_ADDRESS_MAPPING[chainId][OrderType.DutchLimit]
    ) {
      const reactorAddress =
        REACTOR_ADDRESS_MAPPING[chainId][OrderType.DutchLimit];
      this.reactor(reactorAddress);
    } else {
      throw new MissingConfiguration("reactor", chainId.toString());
    }

    this.info = {
      outputs: [],
    };
  }

  startTime(startTime: number): DutchLimitOrderBuilder {
    invariant(
      !this.info.endTime || startTime <= this.info.endTime,
      `startTime must be before endTime: ${startTime}`
    );

    invariant(
      !this.orderInfo.deadline || startTime <= this.orderInfo.deadline,
      `startTime must be before deadline: ${startTime}`
    );
    this.info.startTime = startTime;
    return this;
  }

  endTime(endTime: number): DutchLimitOrderBuilder {
    invariant(
      !this.info.startTime || endTime >= this.info.startTime,
      `endTime must be after startTime: ${endTime}`
    );
    invariant(
      !this.orderInfo.deadline || endTime <= this.orderInfo.deadline,
      `endTime must be before deadline: ${endTime}`
    );
    this.info.endTime = endTime;
    return this;
  }

  input(input: TokenAmount): DutchLimitOrderBuilder {
    this.info.input = input;
    return this;
  }

  output(output: DutchOutput): DutchLimitOrderBuilder {
    if (!this.info.outputs) {
      this.info.outputs = [];
    }
    this.info.outputs.push(output);
    return this;
  }

  deadline(deadline: number): DutchLimitOrderBuilder {
    super.deadline(deadline);
    return this;
  }

  nonce(nonce: BigNumber): DutchLimitOrderBuilder {
    super.nonce(nonce);
    return this;
  }

  build(): DutchLimitOrder {
    invariant(this.info.startTime !== undefined, "startTime not set");
    invariant(this.info.endTime !== undefined, "endTime not set");
    invariant(this.info.input !== undefined, "input not set");
    invariant(
      this.info.outputs !== undefined && this.info.outputs.length !== 0,
      "outputs not set"
    );

    return new DutchLimitOrder(
      Object.assign(this.getOrderInfo(), {
        startTime: this.info.startTime,
        endTime: this.info.endTime,
        input: this.info.input,
        outputs: this.info.outputs,
      }),
      this.chainId,
      this.permitPostAddress
    );
  }
}
