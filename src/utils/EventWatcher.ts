import { BaseProvider } from "@ethersproject/providers";
import { BigNumber, Event, utils } from "ethers";

import { KNOWN_EVENT_SIGNATURES } from "../constants";
import {
  DutchLimitOrderReactor,
  DutchLimitOrderReactor__factory,
} from "../contracts";
import { FillEvent } from "../contracts/DutchLimitOrderReactor";

export interface FillData {
  orderHash: string;
  filler: string;
  nonce: BigNumber;
  offerer: string;
}

export interface FillInfo extends FillData {
  outputs: {
    token: string;
    amount: BigNumber;
  }[];
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

  async getFillLogs(fromBlock: number, toBlock?: number): Promise<FillEvent[]> {
    return await this.reactor.queryFilter(
      this.reactor.filters.Fill(),
      fromBlock,
      toBlock
    );
  }

  async getFillEvents(
    fromBlock: number,
    toBlock?: number
  ): Promise<FillData[]> {
    const logs = await this.getFillLogs(fromBlock, toBlock);
    return logs.map((log) => log.args);
  }

  async getFillInfo(fromBlock: number, toBlock?: number): Promise<FillInfo[]> {
    const logs = await this.getFillLogs(fromBlock, toBlock);
    const events = logs.map((log) => log.args);
    const txReceipts = await Promise.all(
      logs.map((log) => log.getTransactionReceipt())
    );
    const fills = events.map((e, i) => {
      return {
        orderHash: e.orderHash,
        offerer: e.offerer,
        filler: e.filler,
        nonce: e.nonce,
        txLogs: txReceipts[i].logs,
      };
    });

    return fills.reduce((fillInfoAcc, fill) => {
      const outputs = fill.txLogs.reduce((logAcc, log) => {
        if (
          log.topics[0] === KNOWN_EVENT_SIGNATURES.ERC20_TRANSFER &&
          utils.getAddress("0x" + log.topics[2].slice(26)) === fill.offerer
        ) {
          logAcc.push({
            token: log.address,
            amount: BigNumber.from(log.data),
          });
        }
        return logAcc;
      }, [] as { token: string; amount: BigNumber }[]);
      fillInfoAcc.push({
        orderHash: fill.orderHash,
        offerer: fill.offerer,
        filler: fill.filler,
        nonce: fill.nonce,
        outputs: outputs,
      });
      return fillInfoAcc;
    }, [] as FillInfo[]);
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
