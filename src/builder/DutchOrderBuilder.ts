import { BigNumber, ethers } from "ethers";
import invariant from "tiny-invariant";

import { OrderType, REACTOR_ADDRESS_MAPPING } from "../constants";
import { MissingConfiguration } from "../errors";
import { DutchInput, DutchOrder, DutchOrderInfo, DutchOutput } from "../order";
import { ValidationInfo } from "../order/validation";

import { OrderBuilder } from "./OrderBuilder";

/**
 * Helper builder for generating dutch limit orders
 */
export class DutchOrderBuilder extends OrderBuilder {
  private info: Partial<DutchOrderInfo>;

  static fromOrder(order: DutchOrder): DutchOrderBuilder {
    // note chainId not used if passing in true reactor address
    const builder = new DutchOrderBuilder(order.chainId, order.info.reactor)
      .deadline(order.info.deadline)
      .endTime(order.info.endTime)
      .startTime(order.info.startTime)
      .swapper(order.info.swapper)
      .nonce(order.info.nonce)
      .input(order.info.input)
      .exclusiveFiller(
        order.info.exclusiveFiller,
        order.info.exclusivityOverrideBps
      )
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
      REACTOR_ADDRESS_MAPPING[chainId][OrderType.Dutch]
    ) {
      const reactorAddress = REACTOR_ADDRESS_MAPPING[chainId][OrderType.Dutch];
      this.reactor(reactorAddress);
    } else {
      throw new MissingConfiguration("reactor", chainId.toString());
    }

    this.info = {
      outputs: [],
      exclusiveFiller: ethers.constants.AddressZero,
      exclusivityOverrideBps: BigNumber.from(0),
    };
  }

  startTime(startTime: number): DutchOrderBuilder {
    this.info.startTime = startTime;
    return this;
  }

  endTime(endTime: number): DutchOrderBuilder {
    if (this.orderInfo.deadline === undefined) {
      super.deadline(endTime);
    }

    this.info.endTime = endTime;
    return this;
  }

  input(input: DutchInput): DutchOrderBuilder {
    this.info.input = input;
    return this;
  }

  output(output: DutchOutput): DutchOrderBuilder {
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

  deadline(deadline: number): DutchOrderBuilder {
    super.deadline(deadline);

    if (this.info.endTime === undefined) {
      this.endTime(deadline);
    }

    return this;
  }

  swapper(swapper: string): DutchOrderBuilder {
    super.swapper(swapper);
    return this;
  }

  nonce(nonce: BigNumber): DutchOrderBuilder {
    super.nonce(nonce);
    return this;
  }

  validation(info: ValidationInfo): DutchOrderBuilder {
    super.validation(info);
    return this;
  }

  // ensures that we only change non fee outputs
  nonFeeRecipient(recipient: string): DutchOrderBuilder {
    if (!this.info.outputs) {
      return this;
    }
    this.info.outputs = this.info.outputs.map((output) => ({
      ...output,
      recipient,
    }));
    return this;
  }

  exclusiveFiller(
    exclusiveFiller: string,
    exclusivityOverrideBps: BigNumber
  ): DutchOrderBuilder {
    this.info.exclusiveFiller = exclusiveFiller;
    this.info.exclusivityOverrideBps = exclusivityOverrideBps;
    return this;
  }

  build(): DutchOrder {
    invariant(this.info.startTime !== undefined, "startTime not set");
    invariant(this.info.input !== undefined, "input not set");
    invariant(this.info.endTime !== undefined, "endTime not set");
    invariant(
      this.info.exclusiveFiller !== undefined,
      "exclusiveFiller not set"
    );
    invariant(
      this.info.exclusivityOverrideBps !== undefined,
      "exclusivityOverrideBps not set"
    );
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

    return new DutchOrder(
      Object.assign(this.getOrderInfo(), {
        startTime: this.info.startTime,
        endTime: this.info.endTime,
        exclusiveFiller: this.info.exclusiveFiller,
        exclusivityOverrideBps: this.info.exclusivityOverrideBps,
        input: this.info.input,
        outputs: this.info.outputs,
      }),
      this.chainId,
      this.permit2Address
    );
  }
}
