import {
  BaseProvider,
  Log,
  TransactionReceipt,
} from "@ethersproject/providers";
import { BaseContract, BigNumber, Event, utils } from "ethers";

import MockERC20Abi from "../../abis/MockERC20.json";
import {
  ExclusiveDutchOrderReactor,
  ExclusiveDutchOrderReactor__factory,
  RelayOrderReactor,
  RelayOrderReactor__factory,
} from "../contracts";
import { FillEvent } from "../contracts/DutchOrderReactor";

const TRANSFER = "Transfer";

export type TokenTransfer = {
  token: string;
  amount: BigNumber;
};

export interface FillData {
  orderHash: string;
  filler: string;
  nonce: BigNumber;
  swapper: string;
}

export interface FillInfo extends FillData {
  blockNumber: number;
  txHash: string;
  inputs: TokenTransfer[];
  outputs: TokenTransfer[];
}

/**
 * Helper for watching events
 */
abstract class EventWatcher<TReactor extends BaseContract> {
  constructor(protected reactor: TReactor) {}

  abstract getFillLogs(
    fromBlock: number,
    toBlock?: number
  ): Promise<FillEvent[]>;
  abstract onFill(callback: (fillData: FillData, event: Event) => void): void;

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

    return fills.map((fill) => {
      const outputs = this.getTokenTransfers(fill.txLogs, fill.swapper);
      const inputs = this.getTokenTransfers(fill.txLogs, fill.filler);

      return {
        orderHash: fill.orderHash,
        swapper: fill.swapper,
        filler: fill.filler,
        nonce: fill.nonce,
        blockNumber: fill.blockNumber,
        txHash: fill.txHash,
        inputs: inputs,
        outputs: outputs,
      };
    });
  }

  getTokenTransfers(logs: Log[], recipient: string) {
    const ERC20Interface = new utils.Interface(MockERC20Abi.abi);
    return logs.reduce((logAcc, log) => {
      try {
        const parsedLog = ERC20Interface.parseLog(log);
        if (parsedLog.name === TRANSFER && parsedLog.args.to === recipient) {
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
  }
}

export class UniswapXEventWatcher extends EventWatcher<ExclusiveDutchOrderReactor> {
  constructor(provider: BaseProvider, reactorAddress: string) {
    const reactor = ExclusiveDutchOrderReactor__factory.connect(
      reactorAddress,
      provider
    );
    super(reactor);
  }

  async getFillLogs(fromBlock: number, toBlock?: number): Promise<FillEvent[]> {
    return await this.reactor.queryFilter(
      this.reactor.filters.Fill(),
      fromBlock,
      toBlock
    );
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

export class RelayEventWatcher extends EventWatcher<RelayOrderReactor> {
  constructor(provider: BaseProvider, reactorAddress: string) {
    const reactor = RelayOrderReactor__factory.connect(
      reactorAddress,
      provider
    );
    super(reactor);
  }

  async getFillLogs(fromBlock: number, toBlock?: number): Promise<FillEvent[]> {
    return await this.reactor.queryFilter(
      this.reactor.filters.Relay(),
      fromBlock,
      toBlock
    );
  }

  onFill(callback: (fillData: FillData, event: Event) => void): void {
    this.reactor.on(
      this.reactor.filters.Relay(),
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
