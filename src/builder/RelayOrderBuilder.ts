import { BigNumber } from "ethers";
import invariant from "tiny-invariant";

import { OrderType, REACTOR_ADDRESS_MAPPING } from "../constants";
import { MissingConfiguration } from "../errors";
import { RelayFee, RelayInput, RelayOrder, RelayOrderInfo } from "../order";

/**
 * Helper builder for generating relay orders
 */
export class RelayOrderBuilder {
  protected info: Partial<RelayOrderInfo> = {};

  static fromOrder(order: RelayOrder): RelayOrderBuilder {
    // note chainId not used if passing in true reactor address
    const builder = new RelayOrderBuilder(order.chainId, order.info.reactor)
      .deadline(order.info.deadline)
      .swapper(order.info.swapper)
      .nonce(order.info.nonce)
      .universalRouterCalldata(order.info.universalRouterCalldata)
      .input(order.info.input)
      .fee(order.info.fee)
      .feeStartTime(order.info.fee.startTime)
      .feeEndTime(order.info.fee.endTime);

    return builder;
  }

  constructor(
    private chainId: number,
    reactorAddress?: string,
    private permit2Address?: string
  ) {
    const mappedReactorAddress = REACTOR_ADDRESS_MAPPING[chainId]
      ? REACTOR_ADDRESS_MAPPING[chainId][OrderType.Relay]
      : undefined;

    if (reactorAddress) {
      this.reactor(reactorAddress);
    } else if (mappedReactorAddress) {
      this.reactor(mappedReactorAddress);
    } else {
      throw new MissingConfiguration("reactor", chainId.toString());
    }
  }

  protected reactor(reactor: string): RelayOrderBuilder {
    this.info.reactor = reactor;
    return this;
  }

  deadline(deadline: number): RelayOrderBuilder {
    this.info.deadline = deadline;
    return this;
  }

  nonce(nonce: BigNumber): RelayOrderBuilder {
    this.info.nonce = nonce;
    return this;
  }

  swapper(swapper: string): RelayOrderBuilder {
    this.info.swapper = swapper;
    return this;
  }

  // TODO: perform some calldata validation here
  universalRouterCalldata(universalRouterCalldata: string): RelayOrderBuilder {
    this.info.universalRouterCalldata = universalRouterCalldata;
    return this;
  }

  feeStartTime(feeStartTime: number): RelayOrderBuilder {
    invariant(this.info.fee !== undefined, "fee not set");
    this.info.fee = {
      ...this.info.fee,
      startTime: feeStartTime,
    };
    return this;
  }

  feeEndTime(feeEndTime: number): RelayOrderBuilder {
    invariant(this.info.fee !== undefined, "fee not set");
    if (this.info.deadline === undefined) {
      this.info.deadline = feeEndTime;
    }
    this.info.fee = {
      ...this.info.fee,
      endTime: feeEndTime,
    };
    return this;
  }

  input(input: RelayInput): RelayOrderBuilder {
    this.info.input = input;
    return this;
  }

  fee(fee: RelayFee): RelayOrderBuilder {
    invariant(
      fee.startAmount.lte(fee.endAmount),
      `startAmount must be less than or equal than endAmount: ${fee.startAmount.toString()}`
    );
    this.info.fee = fee;
    return this;
  }

  build(): RelayOrder {
    invariant(this.info.reactor !== undefined, "reactor not set");
    invariant(this.info.nonce !== undefined, "nonce not set");
    invariant(this.info.deadline !== undefined, "deadline not set");
    invariant(
      this.info.deadline > Date.now() / 1000,
      `Deadline must be in the future: ${this.info.deadline}`
    );
    invariant(this.info.swapper !== undefined, "swapper not set");
    invariant(
      this.info.universalRouterCalldata !== undefined,
      "universalRouterCalldata not set"
    );
    invariant(this.info.input !== undefined, "input not set");
    invariant(this.info.fee !== undefined, "fee not set");

    invariant(
      !this.info.deadline || this.info.fee.startTime <= this.info.deadline,
      `feeStartTime must be before or same as deadline: ${this.info.fee.startTime}`
    );
    invariant(
      !this.info.deadline || this.info.fee.endTime <= this.info.deadline,
      `feeEndTime must be before or same as deadline: ${this.info.fee.endTime}`
    );

    return new RelayOrder(
      Object.assign(this.info, {
        reactor: this.info.reactor,
        swapper: this.info.swapper,
        nonce: this.info.nonce,
        deadline: this.info.deadline,
        input: this.info.input,
        fee: this.info.fee,
        universalRouterCalldata: this.info.universalRouterCalldata,
      }),
      this.chainId,
      this.permit2Address
    );
  }
}
