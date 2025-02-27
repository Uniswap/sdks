import { BaseProvider, Log } from "@ethersproject/providers";
import { BaseContract, BigNumber, Event } from "ethers";
import { ExclusiveDutchOrderReactor, RelayOrderReactor } from "../contracts";
import { FillEvent } from "../contracts/DutchOrderReactor";
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
declare abstract class EventWatcher<TReactor extends BaseContract> {
    protected reactor: TReactor;
    constructor(reactor: TReactor);
    abstract getFillLogs(fromBlock: number, toBlock?: number): Promise<FillEvent[]>;
    abstract onFill(callback: (fillData: FillData, event: Event) => void): void;
    getFillEvents(fromBlock: number, toBlock?: number): Promise<FillData[]>;
    getFillInfo(fromBlock: number, toBlock?: number): Promise<FillInfo[]>;
    getTokenTransfers(logs: Log[], recipient: string): {
        token: string;
        amount: BigNumber;
    }[];
}
export declare class UniswapXEventWatcher extends EventWatcher<ExclusiveDutchOrderReactor> {
    constructor(provider: BaseProvider, reactorAddress: string);
    getFillLogs(fromBlock: number, toBlock?: number): Promise<FillEvent[]>;
    onFill(callback: (fillData: FillData, event: Event) => void): void;
}
export declare class RelayEventWatcher extends EventWatcher<RelayOrderReactor> {
    constructor(provider: BaseProvider, reactorAddress: string);
    getFillLogs(fromBlock: number, toBlock?: number): Promise<FillEvent[]>;
    onFill(callback: (fillData: FillData, event: Event) => void): void;
}
export {};
