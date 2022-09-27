import { BaseProvider } from "@ethersproject/providers";
import { BigNumber, Event } from "ethers";

import {
  DutchLimitOrderReactor,
  DutchLimitOrderReactor__factory,
} from "../contracts";

export interface FillData {
  orderHash: string;
  filler: string;
  nonce: BigNumber;
  offerer: string;
}

/**
 * Helper for watching events
 */
export class EventWatcher {
  private reactor: DutchLimitOrderReactor;

  constructor(provider: BaseProvider, reactorAddress: string) {
    this.reactor = DutchLimitOrderReactor__factory.connect(
      reactorAddress,
      provider
    );
  }

  async getFillEvents(
    fromBlock: number,
    toBlock?: number
  ): Promise<FillData[]> {
    const logs = await this.reactor.queryFilter(
      this.reactor.filters.Fill(),
      fromBlock,
      toBlock
    );
    return logs.map((log) => log.args);
  }

  onFill(callback: (fillData: FillData, event: Event) => void): void {
    this.reactor.on(
      this.reactor.filters.Fill(),
      (orderHash, filler, nonce, offerer, event) => {
        callback(
          {
            orderHash,
            filler,
            nonce,
            offerer,
          },
          event
        );
      }
    );
  }
}
