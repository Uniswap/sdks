import { BaseProvider, TransactionReceipt } from "@ethersproject/providers";
import { BigNumber, Event, utils } from "ethers";

import MockERC20Abi from "../../abis/MockERC20.json";
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

    // TODO: deal with the edge case where if a transaction batch fills multiple orders
    // with the same offerer and outToken, txs would contain less entries than events
    const txs = logs.reduce(
      (acc, log) =>
        acc.add(
          this.reactor.provider.getTransactionReceipt(log.transactionHash)
        ),
      new Set<Promise<TransactionReceipt>>()
    );
    const txReceipts = await Promise.all(txs);
    const fills = events.map((e, i) => {
      return {
        orderHash: e.orderHash,
        offerer: e.offerer,
        filler: e.filler,
        nonce: e.nonce,
        txLogs: txReceipts[i].logs,
      };
    });

    const ERC20Interface = new utils.Interface(MockERC20Abi.abi);

    return fills.map((fill) => {
      const outputs = fill.txLogs.reduce((logAcc, log) => {
        try {
          const parsedLog = ERC20Interface.parseLog(log);
          if (
            parsedLog.name === "Transfer" &&
            parsedLog.args.to === fill.offerer
          ) {
            logAcc.push({
              token: log.address,
              amount: parsedLog.args.amount,
            });
          }
          return logAcc;
        } catch (e) {
          return logAcc;
        }
      }, [] as { token: string; amount: BigNumber }[]);

      return {
        orderHash: fill.orderHash,
        offerer: fill.offerer,
        filler: fill.filler,
        nonce: fill.nonce,
        outputs: outputs,
      };
    });
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
