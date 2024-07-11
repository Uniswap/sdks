import { BigNumber } from "ethers";
import invariant from "tiny-invariant";

import { OrderType } from "../constants";
import {
  CosignedPriorityOrder,
  CosignedPriorityOrderInfo,
  PriorityCosignerData,
  PriorityInput,
  PriorityOutput,
  UnsignedPriorityOrder,
} from "../order";
import { ValidationInfo } from "../order/validation";
import { getPermit2, getReactor } from "../utils";

import { OrderBuilder } from "./OrderBuilder";

/**
 * Helper builder for generating priority gas auction orders
 */
export class PriorityOrderBuilder extends OrderBuilder {
  private info: Partial<CosignedPriorityOrderInfo>;

  static fromOrder<O extends UnsignedPriorityOrder>(
    order: O
  ): PriorityOrderBuilder {
    // note chainId not used if passing in true reactor address
    const builder = new PriorityOrderBuilder(order.chainId, order.info.reactor)
      .deadline(order.info.deadline)
      .swapper(order.info.swapper)
      .nonce(order.info.nonce)
      .input(order.info.input)
      .auctionStartBlock(order.info.auctionStartBlock)
      .baselinePriorityFeeWei(order.info.baselinePriorityFeeWei)
      .cosigner(order.info.cosigner)
      .validation({
        additionalValidationContract: order.info.additionalValidationContract,
        additionalValidationData: order.info.additionalValidationData,
      });

    for (const output of order.info.outputs) {
      builder.output(output);
    }

    if (isCosigned(order)) {
      builder.cosignature(order.info.cosignature);
      builder.auctionTargetBlock(order.info.cosignerData.auctionTargetBlock);
    }
    return builder;
  }

  constructor(
    private chainId: number,
    reactorAddress?: string,
    private permit2Address?: string
  ) {
    super();

    this.reactor(getReactor(chainId, OrderType.Dutch_V2, reactorAddress));
    this.permit2Address = getPermit2(chainId, permit2Address);

    this.info = {
      cosignerData: {
        auctionTargetBlock: BigNumber.from(0),
      },
      outputs: [],
    };
  }

  cosigner(cosigner: string): this {
    this.info.cosigner = cosigner;
    return this;
  }

  auctionStartBlock(auctionStartBlock: BigNumber): this {
    this.info.auctionStartBlock = auctionStartBlock;
    return this;
  }

  auctionTargetBlock(auctionTargetBlock: BigNumber): this {
    if (!this.info.cosignerData) {
      this.info.cosignerData = {
        auctionTargetBlock: auctionTargetBlock,
      };
    } else {
      this.info.cosignerData.auctionTargetBlock = auctionTargetBlock;
    }
    return this;
  }

  baselinePriorityFeeWei(baselinePriorityFeeWei: BigNumber): this {
    this.info.baselinePriorityFeeWei = baselinePriorityFeeWei;
    return this;
  }

  cosignerData(cosignerData: PriorityCosignerData): this {
    this.info.cosignerData = cosignerData;
    return this;
  }

  cosignature(cosignature: string | undefined): this {
    this.info.cosignature = cosignature;
    return this;
  }

  input(input: PriorityInput): this {
    this.info.input = input;
    return this;
  }

  output(output: PriorityOutput): this {
    if (!this.info.outputs) {
      this.info.outputs = [];
    }
    this.info.outputs.push(output);
    return this;
  }

  deadline(deadline: number): this {
    super.deadline(deadline);
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

  buildPartial(): UnsignedPriorityOrder {
    invariant(this.info.input !== undefined, "input not set");
    invariant(this.info.cosigner !== undefined, "cosigner not set");
    invariant(this.info.cosignature !== undefined, "cosignature not set");
    invariant(
      this.info.baselinePriorityFeeWei !== undefined,
      "baselinePriorityFeeWei not set"
    );
    invariant(
      this.info.outputs !== undefined && this.info.outputs.length !== 0,
      "outputs not set"
    );
    invariant(
      this.info.auctionStartBlock !== undefined &&
        this.info.auctionStartBlock.gt(0),
      "auctionStartBlock not set"
    );
    invariant(
      !this.info.input.mpsPerPriorityFeeWei.eq(0) ||
        this.info.outputs.every((output) => !output.mpsPerPriorityFeeWei.eq(0)),
      "Priority auction not configured"
    );
    invariant(
      !(
        this.info.input.mpsPerPriorityFeeWei.gt(0) &&
        this.info.outputs.every((output) => output.mpsPerPriorityFeeWei.gt(0))
      ),
      "Can only configure priority auction on either input or output"
    );
    return new UnsignedPriorityOrder(
      Object.assign(this.getOrderInfo(), {
        cosigner: this.info.cosigner,
        auctionStartBlock: this.info.auctionStartBlock,
        baselinePriorityFeeWei: this.info.baselinePriorityFeeWei,
        input: this.info.input,
        outputs: this.info.outputs,
      }),
      this.chainId,
      this.permit2Address
    );
  }

  build(): CosignedPriorityOrder {
    invariant(this.info.input !== undefined, "input not set");
    invariant(this.info.cosigner !== undefined, "cosigner not set");
    invariant(this.info.cosignature !== undefined, "cosignature not set");
    invariant(
      this.info.baselinePriorityFeeWei !== undefined,
      "baselinePriorityFeeWei not set"
    );
    invariant(
      this.info.outputs !== undefined && this.info.outputs.length !== 0,
      "outputs not set"
    );
    invariant(
      this.info.auctionStartBlock !== undefined &&
        this.info.auctionStartBlock.gt(0),
      "auctionStartBlock not set"
    );
    invariant(
      this.info.cosignerData !== undefined &&
        this.info.cosignerData.auctionTargetBlock.gt(0) &&
        this.info.cosignerData.auctionTargetBlock.lt(
          this.info.auctionStartBlock
        ),
      "auctionTargetBlock not set properly"
    );
    invariant(
      !this.info.input.mpsPerPriorityFeeWei.eq(0) ||
        this.info.outputs.every((output) => !output.mpsPerPriorityFeeWei.eq(0)),
      "Priority auction not configured"
    );
    invariant(
      !(
        this.info.input.mpsPerPriorityFeeWei.gt(0) &&
        this.info.outputs.every((output) => output.mpsPerPriorityFeeWei.gt(0))
      ),
      "Can only configure priority auction on either input or output"
    );

    return new CosignedPriorityOrder(
      Object.assign(this.getOrderInfo(), {
        cosigner: this.info.cosigner,
        auctionStartBlock: this.info.auctionStartBlock,
        baselinePriorityFeeWei: this.info.baselinePriorityFeeWei,
        input: this.info.input,
        outputs: this.info.outputs,
        cosignerData: this.info.cosignerData,
        cosignature: this.info.cosignature,
      }),
      this.chainId,
      this.permit2Address
    );
  }
}

function isCosigned(
  order: UnsignedPriorityOrder | CosignedPriorityOrder
): order is CosignedPriorityOrder {
  return (order as CosignedPriorityOrder).info.cosignature !== undefined;
}
