import { BigNumber } from "ethers";
import invariant from "tiny-invariant";

import { OrderType, REACTOR_ADDRESS_MAPPING } from "../constants";
import { MissingConfiguration } from "../errors";
import {
  DutchInput,
  DutchLimitOrder,
  DutchLimitOrderInfo,
  DutchOutput,
} from "../order";
import { ValidationInfo } from "../order/validation";

import { OrderBuilder } from "./OrderBuilder";

/**
 * Helper builder for generating dutch limit orders
 */
export class DutchLimitOrderBuilder extends OrderBuilder {
  private info: Partial<DutchLimitOrderInfo>;

  static fromOrder(order: DutchLimitOrder): DutchLimitOrderBuilder {
    // note chainId not used if passing in true reactor address
    const builder = new DutchLimitOrderBuilder(
      order.chainId,
      order.info.reactor
    )
      .deadline(order.info.deadline)
      .endTime(order.info.endTime)
      .startTime(order.info.startTime)
      .offerer(order.info.offerer)
      .nonce(order.info.nonce)
      .input(order.info.input)
      .validation({
        validationContract: order.info.validationContract,
        validationData: order.info.validationData,
      });

    for (const output of order.info.outputs) {
      builder.output(output);
    }
    return builder;
  }

  constructor(
    private chainId: number,
    reactorAddress?: string,
    private permit2Address?: string
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
    this.info.startTime = startTime;
    return this;
  }

  endTime(endTime: number): DutchLimitOrderBuilder {
    if (this.orderInfo.deadline === undefined) {
      super.deadline(endTime);
    }

    this.info.endTime = endTime;
    return this;
  }

  input(input: DutchInput): DutchLimitOrderBuilder {
    this.info.input = input;
    return this;
  }

  output(output: DutchOutput): DutchLimitOrderBuilder {
    if (!this.info.outputs) {
      this.info.outputs = [];
    }
    invariant(
      output.startAmount.gte(output.endAmount),
      `startAmount must be greater than endAmount: ${output.startAmount.toString()}`
    );
    this.info.outputs.push(output);
    return this;
  }

  deadline(deadline: number): DutchLimitOrderBuilder {
    super.deadline(deadline);

    if (this.info.endTime === undefined) {
      this.endTime(deadline);
    }

    return this;
  }

  offerer(offerer: string): DutchLimitOrderBuilder {
    super.offerer(offerer);
    return this;
  }

  nonce(nonce: BigNumber): DutchLimitOrderBuilder {
    super.nonce(nonce);
    return this;
  }

  validation(info: ValidationInfo): DutchLimitOrderBuilder {
    super.validation(info);
    return this;
  }

  // ensures that we only change non fee outputs
  nonFeeRecipient(recipient: string): DutchLimitOrderBuilder {
    if (!this.info.outputs) {
      return this;
    }
    this.info.outputs = this.info.outputs.map((output) =>
      output.isFeeOutput
        ? output
        : {
            token: output.token,
            startAmount: output.startAmount,
            endAmount: output.endAmount,
            recipient: recipient,
            isFeeOutput: output.isFeeOutput,
          }
    );
    return this;
  }

  build(): DutchLimitOrder {
    invariant(this.info.startTime !== undefined, "startTime not set");
    invariant(this.info.input !== undefined, "input not set");
    invariant(this.info.endTime !== undefined, "endTime not set");
    invariant(
      this.info.outputs !== undefined && this.info.outputs.length !== 0,
      "outputs not set"
    );
    invariant(
      this.info.endTime !== undefined ||
        this.getOrderInfo().deadline !== undefined,
      "Must set either deadline or endTime"
    );
    invariant(
      !this.orderInfo.deadline ||
        this.info.startTime <= this.orderInfo.deadline,
      `startTime must be before or same as deadline: ${this.info.startTime}`
    );
    invariant(
      !this.orderInfo.deadline || this.info.endTime <= this.orderInfo.deadline,
      `endTime must be before or same as deadline: ${this.info.endTime}`
    );

    return new DutchLimitOrder(
      Object.assign(this.getOrderInfo(), {
        startTime: this.info.startTime,
        endTime: this.info.endTime,
        input: this.info.input,
        outputs: this.info.outputs,
      }),
      this.chainId,
      this.permit2Address
    );
  }
}
