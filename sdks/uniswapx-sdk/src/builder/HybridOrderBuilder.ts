import { BigNumber, constants } from "ethers";
import invariant from "tiny-invariant";

import { BASE_SCALING_FACTOR } from "../constants/v4";
import { HybridOrderClass } from "../order/v4/HybridOrder";
import {
  HybridCosignerData,
  HybridInput,
  HybridOrder,
  HybridOutput,
  OrderInfoV4,
} from "../order/v4/types";

const ZERO_ADDRESS = constants.AddressZero;

export class HybridOrderBuilder {
  static fromOrder(
    order: HybridOrderClass,
    resolver?: string
  ): HybridOrderBuilder {
    const builder = new HybridOrderBuilder(
      order.chainId,
      order.order.info.reactor,
      resolver || order.resolver
    );

    builder
      .cosigner(order.order.cosigner)
      .input(order.order.input)
      .deadline(order.order.info.deadline)
      .nonce(order.order.info.nonce)
      .swapper(order.order.info.swapper)
      .auctionStartBlock(order.order.auctionStartBlock)
      .baselinePriorityFeeWei(order.order.baselinePriorityFeeWei)
      .scalingFactor(order.order.scalingFactor)
      .priceCurve(order.order.priceCurve)
      .preExecutionHook(
        order.order.info.preExecutionHook,
        order.order.info.preExecutionHookData
      )
      .postExecutionHook(
        order.order.info.postExecutionHook,
        order.order.info.postExecutionHookData
      )
      .auctionResolver(order.order.info.auctionResolver);

    order.order.outputs.forEach((output) => {
      builder.output(output);
    });

    // Copy cosigner data
    builder.cosignerData(order.order.cosignerData);

    // Copy cosignature if it exists and is not empty
    if (order.order.cosignature && order.order.cosignature !== "0x") {
      builder.cosignature(order.order.cosignature);
    }

    return builder;
  }

  private info: Partial<OrderInfoV4>;
  private orderData: {
    cosigner?: string;
    input?: HybridInput;
    outputs: HybridOutput[];
    auctionStartBlock?: BigNumber;
    baselinePriorityFeeWei?: BigNumber;
    scalingFactor?: BigNumber;
    priceCurve?: BigNumber[];
    cosignerData?: HybridCosignerData;
    cosignature?: string;
  };

  constructor(
    private chainId: number,
    reactor: string,
    private resolver: string,
    private permit2Address?: string
  ) {
    this.info = {
      reactor,
      preExecutionHook: ZERO_ADDRESS,
      preExecutionHookData: "0x",
      postExecutionHook: ZERO_ADDRESS,
      postExecutionHookData: "0x",
      auctionResolver: resolver,
    };
    this.orderData = {
      outputs: [],
    };
    this.initializeCosignerData({});
  }

  private initializeCosignerData(data: Partial<HybridCosignerData>): void {
    this.orderData.cosignerData = {
      auctionTargetBlock: BigNumber.from(0),
      supplementalPriceCurve: [],
      ...data,
    };
  }

  private validatePriceCurve(curve: BigNumber[], prefix: string): void {
    curve.forEach((elem, i) => {
      if (elem.lt(0)) {
        throw new Error(`${prefix} curve element ${i} must be non-negative`);
      }
    });
  }

  reactor(reactor: string): this {
    this.info.reactor = reactor;
    return this;
  }

  swapper(swapper: string): this {
    this.info.swapper = swapper;
    return this;
  }

  nonce(nonce: BigNumber): this {
    this.info.nonce = nonce;
    return this;
  }

  deadline(deadline: number): this {
    this.info.deadline = deadline;
    return this;
  }

  preExecutionHook(hook: string, hookData?: string): this {
    this.info.preExecutionHook = hook;
    if (hookData !== undefined) {
      this.info.preExecutionHookData = hookData;
    }
    return this;
  }

  postExecutionHook(hook: string, hookData?: string): this {
    this.info.postExecutionHook = hook;
    if (hookData !== undefined) {
      this.info.postExecutionHookData = hookData;
    }
    return this;
  }

  auctionResolver(resolver: string): this {
    this.info.auctionResolver = resolver;
    return this;
  }

  cosigner(cosigner: string): this {
    this.orderData.cosigner = cosigner;
    return this;
  }

  cosignature(cosignature: string): this {
    this.orderData.cosignature = cosignature;
    return this;
  }

  input(input: HybridInput): this {
    this.orderData.input = input;
    return this;
  }

  output(output: HybridOutput): this {
    this.orderData.outputs.push(output);
    return this;
  }

  auctionStartBlock(block: BigNumber | number): this {
    this.orderData.auctionStartBlock =
      typeof block === "number" ? BigNumber.from(block) : block;
    return this;
  }

  baselinePriorityFeeWei(fee: BigNumber | number): this {
    this.orderData.baselinePriorityFeeWei =
      typeof fee === "number" ? BigNumber.from(fee) : fee;
    return this;
  }

  scalingFactor(factor: BigNumber): this {
    this.orderData.scalingFactor = factor;
    return this;
  }

  priceCurve(curve: BigNumber[]): this {
    // Validate each price curve element
    this.validatePriceCurve(curve, "Price");
    this.orderData.priceCurve = curve;
    return this;
  }

  cosignerData(data: HybridCosignerData): this {
    this.orderData.cosignerData = data;
    return this;
  }

  auctionTargetBlock(block: BigNumber | number): this {
    if (!this.orderData.cosignerData) {
      this.initializeCosignerData({
        auctionTargetBlock:
          typeof block === "number" ? BigNumber.from(block) : block,
      });
    } else {
      this.orderData.cosignerData.auctionTargetBlock =
        typeof block === "number" ? BigNumber.from(block) : block;
    }
    return this;
  }

  supplementalPriceCurve(curve: BigNumber[]): this {
    // Validate each supplemental price curve element
    this.validatePriceCurve(curve, "Supplemental price");
    if (!this.orderData.cosignerData) {
      this.initializeCosignerData({ supplementalPriceCurve: curve });
    } else {
      this.orderData.cosignerData.supplementalPriceCurve = curve;
    }
    return this;
  }

  private checkUnsignedInvariants(): void {
    invariant(this.info.reactor !== undefined, "reactor not set");
    invariant(this.info.swapper !== undefined, "swapper not set");
    invariant(this.info.nonce !== undefined, "nonce not set");
    invariant(this.info.deadline !== undefined, "deadline not set");
    invariant(
      this.info.deadline > Math.floor(Date.now() / 1000),
      `Deadline must be in the future: ${this.info.deadline}`
    );
    invariant(
      this.info.preExecutionHook !== undefined,
      "preExecutionHook not set"
    );
    invariant(
      this.info.preExecutionHookData !== undefined,
      "preExecutionHookData not set"
    );
    invariant(
      this.info.postExecutionHook !== undefined,
      "postExecutionHook not set"
    );
    invariant(
      this.info.postExecutionHookData !== undefined,
      "postExecutionHookData not set"
    );
    invariant(
      this.info.auctionResolver !== undefined,
      "auctionResolver not set"
    );
    invariant(this.orderData.input !== undefined, "input not set");
    invariant(
      this.orderData.outputs && this.orderData.outputs.length > 0,
      "outputs not set"
    );
    invariant(
      this.orderData.auctionStartBlock !== undefined,
      "auctionStartBlock not set"
    );
    invariant(
      this.orderData.baselinePriorityFeeWei !== undefined,
      "baselinePriorityFeeWei not set"
    );
    invariant(
      this.orderData.scalingFactor !== undefined,
      "scalingFactor not set"
    );
    invariant(this.orderData.priceCurve !== undefined, "priceCurve not set");

    // Validate price curve consistency
    if (this.orderData.priceCurve && this.orderData.priceCurve.length > 0) {
      // All scaling factors must share direction
      // Compare each pair of adjacent elements
      for (let i = 1; i < this.orderData.priceCurve.length; i++) {
        const prevScaling = this.extractScalingFactor(this.orderData.priceCurve[i - 1]);
        const scaling = this.extractScalingFactor(this.orderData.priceCurve[i]);

        // Either value is 1e18 (neutral), or both on same side of 1e18
        const sharesDirection =
          prevScaling.eq(BASE_SCALING_FACTOR) ||
          scaling.eq(BASE_SCALING_FACTOR) ||
          prevScaling.gt(BASE_SCALING_FACTOR) === scaling.gt(BASE_SCALING_FACTOR);

        invariant(
          sharesDirection,
          `Price curve scaling factors must share direction. Element ${i} violates this.`
        );
      }
    }

    // Validate input amounts
    invariant(
      this.orderData.input.maxAmount.gt(0),
      "input maxAmount must be greater than 0"
    );

    // Validate output amounts
    this.orderData.outputs.forEach((output, i) => {
      invariant(
        output.minAmount.gt(0),
        `output ${i} minAmount must be greater than 0`
      );
    });

    // Validate baseline priority fee is non-negative
    invariant(
      this.orderData.baselinePriorityFeeWei.gte(0),
      "baselinePriorityFeeWei must be non-negative"
    );
  }

  private extractScalingFactor(curveElement: BigNumber): BigNumber {
    // Price curve element format: (duration << 240) | scalingFactor
    // Extract lower 240 bits for scaling factor
    const mask = BigNumber.from(2).pow(240).sub(1);
    return curveElement.and(mask);
  }

  private checkCosignedInvariants(): void {
    invariant(
      this.orderData.cosignature !== undefined &&
      this.orderData.cosignature !== "0x",
      "cosignature not set"
    );
    invariant(
      this.orderData.cosignerData !== undefined,
      "cosignerData not set"
    );
    invariant(
      this.orderData.cosignerData.auctionTargetBlock !== undefined,
      "auctionTargetBlock not set"
    );
    invariant(
      this.orderData.cosignerData.supplementalPriceCurve !== undefined,
      "supplementalPriceCurve not set"
    );
  }

  buildPartial(): HybridOrderClass {
    this.checkUnsignedInvariants();

    const order: HybridOrder = {
      info: this.info as OrderInfoV4,
      cosigner: this.orderData.cosigner || ZERO_ADDRESS,
      input: this.orderData.input!,
      outputs: this.orderData.outputs,
      auctionStartBlock: this.orderData.auctionStartBlock!,
      baselinePriorityFeeWei: this.orderData.baselinePriorityFeeWei!,
      scalingFactor: this.orderData.scalingFactor!,
      priceCurve: this.orderData.priceCurve!,
      cosignerData: this.orderData.cosignerData || {
        auctionTargetBlock: BigNumber.from(0),
        supplementalPriceCurve: [],
      },
      cosignature: this.orderData.cosignature || "0x",
    };

    return new HybridOrderClass(
      order,
      this.chainId,
      this.resolver,
      this.permit2Address
    );
  }

  build(): HybridOrderClass {
    this.checkUnsignedInvariants();
    this.checkCosignedInvariants();

    const order: HybridOrder = {
      info: this.info as OrderInfoV4,
      cosigner: this.orderData.cosigner!,
      input: this.orderData.input!,
      outputs: this.orderData.outputs,
      auctionStartBlock: this.orderData.auctionStartBlock!,
      baselinePriorityFeeWei: this.orderData.baselinePriorityFeeWei!,
      scalingFactor: this.orderData.scalingFactor!,
      priceCurve: this.orderData.priceCurve!,
      cosignerData: this.orderData.cosignerData!,
      cosignature: this.orderData.cosignature!,
    };

    return new HybridOrderClass(
      order,
      this.chainId,
      this.resolver,
      this.permit2Address
    );
  }
}

