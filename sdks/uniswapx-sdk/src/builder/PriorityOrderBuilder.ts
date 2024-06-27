import { BigNumber } from "ethers";
import invariant from "tiny-invariant";

import { OrderType, REACTOR_ADDRESS_MAPPING } from "../constants";
import { MissingConfiguration } from "../errors";
import {
  PriorityInput,
  PriorityOrder,
  PriorityOrderInfo,
  PriorityOutput,
} from "../order";
import { ValidationInfo } from "../order/validation";

import { OrderBuilder } from "./OrderBuilder";

/**
 * Helper builder for generating priority gas auction orders
 */
export class PriorityOrderBuilder extends OrderBuilder {
  private info: Partial<PriorityOrderInfo>;

  static fromOrder(order: PriorityOrder): PriorityOrderBuilder {
    // note chainId not used if passing in true reactor address
    const builder = new PriorityOrderBuilder(order.chainId, order.info.reactor)
      .deadline(order.info.deadline)
      .swapper(order.info.swapper)
      .nonce(order.info.nonce)
      .input(order.info.input)
      .validation({
        additionalValidationContract: order.info.additionalValidationContract,
        additionalValidationData: order.info.additionalValidationData,
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

    const mappedReactorAddress = REACTOR_ADDRESS_MAPPING[chainId]
      ? REACTOR_ADDRESS_MAPPING[chainId][OrderType.Dutch]
      : undefined;

    if (reactorAddress) {
      this.reactor(reactorAddress);
    } else if (mappedReactorAddress) {
      this.reactor(mappedReactorAddress);
    } else {
      throw new MissingConfiguration("reactor", chainId.toString());
    }

    this.info = {
      outputs: [],
    };
  }

  startBlock(startBlock: BigNumber): PriorityOrderBuilder {
    this.info.startBlock = startBlock;
    return this;
  }

  input(input: PriorityInput): PriorityOrderBuilder {
    this.info.input = input;
    return this;
  }

  output(output: PriorityOutput): PriorityOrderBuilder {
    if (!this.info.outputs) {
      this.info.outputs = [];
    }
    this.info.outputs.push(output);
    return this;
  }

  deadline(deadline: number): PriorityOrderBuilder {
    super.deadline(deadline);
    return this;
  }

  swapper(swapper: string): PriorityOrderBuilder {
    super.swapper(swapper);
    return this;
  }

  nonce(nonce: BigNumber): PriorityOrderBuilder {
    super.nonce(nonce);
    return this;
  }

  validation(info: ValidationInfo): PriorityOrderBuilder {
    super.validation(info);
    return this;
  }

  // ensures that we only change non fee outputs
  nonFeeRecipient(
    newRecipient: string,
    feeRecipient?: string
  ): PriorityOrderBuilder {
    invariant(
      newRecipient !== feeRecipient,
      `newRecipient must be different from feeRecipient: ${newRecipient}`
    );
    if (!this.info.outputs) {
      return this;
    }
    this.info.outputs = this.info.outputs.map((output) => {
      // if fee output then pass through
      if (
        feeRecipient &&
        output.recipient.toLowerCase() === feeRecipient.toLowerCase()
      ) {
        return output;
      }

      return {
        ...output,
        recipient: newRecipient,
      };
    });
    return this;
  }

  build(): PriorityOrder {
    invariant(this.info.input !== undefined, "input not set");
    invariant(
      this.info.outputs !== undefined && this.info.outputs.length !== 0,
      "outputs not set"
    );
    invariant(this.info.startBlock !== undefined, "startBlock not set");
    invariant(
      this.info.input.mpsPerPriorityFeeWei.eq(0) &&
        this.info.outputs.every((output) => output.mpsPerPriorityFeeWei.eq(0)),
      "Priority auction not configured"
    );

    return new PriorityOrder(
      Object.assign(this.getOrderInfo(), {
        startBlock: this.info.startBlock,
        input: this.info.input,
        outputs: this.info.outputs,
      }),
      this.chainId,
      this.permit2Address
    );
  }
}
