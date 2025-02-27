import { BigNumber } from "ethers";
import { RelayFee, RelayInput, RelayOrder, RelayOrderInfo } from "../order";
/**
 * Helper builder for generating relay orders
 */
export declare class RelayOrderBuilder {
    private chainId;
    private permit2Address?;
    protected info: Partial<RelayOrderInfo>;
    static fromOrder(order: RelayOrder): RelayOrderBuilder;
    constructor(chainId: number, reactorAddress?: string, permit2Address?: string | undefined);
    protected reactor(reactor: string): RelayOrderBuilder;
    deadline(deadline: number): RelayOrderBuilder;
    nonce(nonce: BigNumber): RelayOrderBuilder;
    swapper(swapper: string): RelayOrderBuilder;
    universalRouterCalldata(universalRouterCalldata: string): RelayOrderBuilder;
    feeStartTime(feeStartTime: number): RelayOrderBuilder;
    feeEndTime(feeEndTime: number): RelayOrderBuilder;
    input(input: RelayInput): RelayOrderBuilder;
    fee(fee: RelayFee): RelayOrderBuilder;
    build(): RelayOrder;
}
