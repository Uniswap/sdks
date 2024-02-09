import { BigNumber, ethers } from "ethers";
import invariant from "tiny-invariant";

import { OrderType, REACTOR_ADDRESS_MAPPING } from "../constants";
import { MissingConfiguration } from "../errors";
import {
  CosignedV2DutchOrder,
  CosignerData,
  DutchInput,
  DutchOutput,
  V2DutchOrder,
  V2DutchOrderInfo,
} from "../order";
import { ValidationInfo } from "../order/validation";

import { OrderBuilder } from "./OrderBuilder";

/**
 * Helper builder for generating dutch limit orders
 */
export class V2DutchOrderBuilder extends OrderBuilder {
  private info: Pick<V2DutchOrderInfo, "cosignerData" | "outputs"> &
    Partial<V2DutchOrderInfo>;

  static fromOrder(order: V2DutchOrder): V2DutchOrderBuilder {
    const builder = new V2DutchOrderBuilder(order.chainId, order.info.reactor)
      .deadline(order.info.deadline)
      .swapper(order.info.swapper)
      .nonce(order.info.nonce)
      .input(order.info.input)
      .cosigner(order.info.cosigner)
      .cosignature(order.info.cosignature)
      .validation({
        additionalValidationContract: order.info.additionalValidationContract,
        additionalValidationData: order.info.additionalValidationData,
      });

    for (const output of order.info.outputs) {
      builder.output(output);
    }

    if (order.info.cosignerData) {
      builder.decayEndTime(order.info.cosignerData.decayEndTime);
      builder.decayStartTime(order.info.cosignerData.decayStartTime);
      builder.cosignerData(order.info.cosignerData);
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
      ? REACTOR_ADDRESS_MAPPING[chainId][OrderType.Dutch_V2]
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
      cosignerData: {
        decayStartTime: 0,
        decayEndTime: 0,
        exclusiveFiller: ethers.constants.AddressZero,
        inputOverride: BigNumber.from(0),
        outputOverrides: [],
      },
    };
  }

  decayStartTime(decayStartTime: number): this {
    if (!this.info.cosignerData) {
      this.initializeCosignerData({ decayStartTime });
    } else {
      this.info.cosignerData.decayStartTime = decayStartTime;
    }
    return this;
  }

  decayEndTime(decayEndTime: number): this {
    if (!this.info.cosignerData) {
      this.initializeCosignerData({ decayEndTime });
    } else {
      this.info.cosignerData.decayEndTime = decayEndTime;
    }
    if (!this.orderInfo.deadline) {
      super.deadline(decayEndTime);
    }
    return this;
  }

  input(input: DutchInput): this {
    this.info.input = input;
    return this;
  }

  output(output: DutchOutput): this {
    invariant(
      output.startAmount.gte(output.endAmount),
      `startAmount must be greater than endAmount: ${output.startAmount.toString()}`
    );
    this.info.outputs.push(output);
    return this;
  }

  deadline(deadline: number): this {
    super.deadline(deadline);

    if (!this.info.cosignerData) {
      this.initializeCosignerData({ decayEndTime: deadline });
    } else if (!this.info.cosignerData.decayEndTime) {
      this.decayEndTime(deadline);
    }
    return this;
  }

  swapper(swapper: string): this {
    super.swapper(swapper);
    return this;
  }

  nonce(nonce: BigNumber): this {
    super.nonce(nonce);
    return this;
  }

  validation(info: ValidationInfo): this {
    super.validation(info);
    return this;
  }

  // ensures that we only change non fee outputs
  nonFeeRecipient(newRecipient: string, feeRecipient?: string): this {
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

  exclusiveFiller(exclusiveFiller: string): this {
    if (!this.info.cosignerData) {
      this.info.cosignerData = {
        decayStartTime: 0,
        decayEndTime: 0,
        exclusiveFiller: exclusiveFiller,
        inputOverride: BigNumber.from(0),
        outputOverrides: [],
      };
    }
    this.info.cosignerData.exclusiveFiller = exclusiveFiller;
    return this;
  }

  inputOverride(inputOverride: BigNumber): this {
    if (!this.info.cosignerData) {
      this.initializeCosignerData({ inputOverride });
    } else {
      this.info.cosignerData.inputOverride = inputOverride;
    }
    return this;
  }

  outputOverrides(outputOverrides: BigNumber[]): this {
    if (!this.info.cosignerData) {
      this.initializeCosignerData({ outputOverrides });
    } else {
      this.info.cosignerData.outputOverrides = outputOverrides;
    }
    return this;
  }

  cosigner(cosigner: string): this {
    this.info.cosigner = cosigner;
    return this;
  }

  cosignature(cosignature: string | undefined): this {
    this.info.cosignature = cosignature;
    return this;
  }

  cosignerData(cosignerData: CosignerData): this {
    this.decayStartTime(cosignerData.decayStartTime);
    this.decayEndTime(cosignerData.decayEndTime);
    this.exclusiveFiller(cosignerData.exclusiveFiller);
    this.inputOverride(cosignerData.inputOverride);
    this.outputOverrides(cosignerData.outputOverrides);
    return this;
  }

  buildPartial(): V2DutchOrder {
    invariant(this.info.cosigner !== undefined, "cosigner not set");
    invariant(this.info.input !== undefined, "input not set");
    invariant(this.info.outputs.length > 0, "outputs not set");
    invariant(this.info.input !== undefined, "original input not set");
    invariant(
      !this.orderInfo.deadline ||
        (this.info.cosignerData &&
          this.info.cosignerData.decayStartTime <= this.orderInfo.deadline),
      `if present, decayStartTime must be before or same as deadline: ${this.info.cosignerData?.decayStartTime}`
    );
    invariant(
      !this.orderInfo.deadline ||
        (this.info.cosignerData &&
          this.info.cosignerData.decayEndTime <= this.orderInfo.deadline),
      `if present, decayEndTime must be before or same as deadline: ${this.info.cosignerData?.decayEndTime}`
    );

    return new V2DutchOrder(
      Object.assign(this.getOrderInfo(), {
        cosignerData: this.info.cosignerData,
        input: this.info.input,
        outputs: this.info.outputs,
        cosigner: this.info.cosigner,
        cosignature: this.info.cosignature,
      }),
      this.chainId,
      this.permit2Address
    );
  }

  build(): CosignedV2DutchOrder {
    invariant(this.info.cosigner !== undefined, "cosigner not set");
    invariant(this.info.cosignature !== undefined, "cosignature not set");
    invariant(this.info.input !== undefined, "input not set");
    invariant(this.info.outputs.length > 0, "outputs not set");
    invariant(this.info.cosignerData !== undefined, "cosignerData not set");
    invariant(
      this.info.cosignerData.decayStartTime !== undefined,
      "decayStartTime not set"
    );
    invariant(
      this.info.cosignerData.decayEndTime !== undefined ||
        this.orderInfo.deadline !== undefined,
      "Neither decayEndTime or deadline not set"
    );
    invariant(
      this.info.cosignerData.exclusiveFiller !== undefined,
      "exclusiveFiller not set"
    );
    invariant(
      this.info.cosignerData.inputOverride !== undefined &&
        this.info.cosignerData.inputOverride.gte(this.info.input.startAmount),
      "inputOverride not set or smaller than original input"
    );
    invariant(
      this.info.cosignerData.outputOverrides.length > 0,
      "outputOverrides not set"
    );
    this.info.cosignerData.outputOverrides.forEach((override, idx) => {
      invariant(
        override.lte(this.info.outputs[idx].startAmount),
        "outputOverride must not be larger than original output"
      );
    });
    invariant(this.info.input !== undefined, "original input not set");
    invariant(
      !this.orderInfo.deadline ||
        this.info.cosignerData.decayStartTime <= this.orderInfo.deadline,
      `decayStartTime must be before or same as deadline: ${this.info.cosignerData.decayStartTime}`
    );
    invariant(
      !this.orderInfo.deadline ||
        this.info.cosignerData.decayEndTime <= this.orderInfo.deadline,
      `decayEndTime must be before or same as deadline: ${this.info.cosignerData.decayEndTime}`
    );

    return new CosignedV2DutchOrder(
      Object.assign(this.getOrderInfo(), {
        cosignerData: this.info.cosignerData,
        input: this.info.input,
        outputs: this.info.outputs,
        cosigner: this.info.cosigner,
        cosignature: this.info.cosignature,
      }),
      this.chainId,
      this.permit2Address
    );
  }

  private initializeCosignerData(overrides: Partial<CosignerData>): void {
    this.info.cosignerData = {
      decayStartTime: 0,
      decayEndTime: 0,
      exclusiveFiller: ethers.constants.AddressZero,
      inputOverride: BigNumber.from(0),
      outputOverrides: [],
      ...overrides,
    };
  }
}
