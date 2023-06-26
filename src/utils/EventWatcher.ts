import { BaseProvider, TransactionReceipt } from "@ethersproject/providers";
import { BigNumber, Event, utils } from "ethers";

import MockERC20Abi from "../../abis/MockERC20.json";
import {
  ExclusiveDutchOrderReactor,
  ExclusiveDutchOrderReactor__factory,
} from "../contracts";
import { FillEvent } from "../contracts/DutchOrderReactor";

export interface FillData {
  orderHash: string;
  filler: string;
  nonce: BigNumber;
  swapper: string;
}

export interface FillInfo extends FillData {
  blockNumber: number;
  txHash: string;
  outputs: {
    token: string;
    amount: BigNumber;
  }[];
}

/**
 * Helper for watching events
 */
export class EventWatcher {
  private reactor: ExclusiveDutchOrderReactor;

  constructor(provider: BaseProvider, reactorAddress: string) {
    this.reactor = ExclusiveDutchOrderReactor__factory.connect(
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

    // TODO: deal with batch fills for orders with the same swapper and outToken
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
        swapper: e.swapper,
        filler: e.filler,
        nonce: e.nonce,
        txLogs: txReceipts[i].logs, // insertion order
        blockNumber: txReceipts[i].blockNumber,
        txHash: txReceipts[i].transactionHash,
      };
    });

    const ERC20Interface = new utils.Interface(MockERC20Abi.abi);

    return fills.map((fill) => {
      const outputs = fill.txLogs.reduce((logAcc, log) => {
        try {
          const parsedLog = ERC20Interface.parseLog(log);
          if (
            parsedLog.name === "Transfer" &&
            parsedLog.args.to === fill.swapper
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
        swapper: fill.swapper,
        filler: fill.filler,
        nonce: fill.nonce,
        blockNumber: fill.blockNumber,
        txHash: fill.txHash,
        outputs: outputs,
      };
    });
  }

  onFill(callback: (fillData: FillData, event: Event) => void): void {
    this.reactor.on(
      this.reactor.filters.Fill(),
      (orderHash, filler, swapper, nonce, event) => {
        callback(
          {
            orderHash,
            filler,
            nonce,
            swapper,
          },
          event
        );
      }
    );
  }
}
