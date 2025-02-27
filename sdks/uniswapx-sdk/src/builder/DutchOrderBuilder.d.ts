import { BigNumber } from "ethers";
import { DutchInput, DutchOrder, DutchOutput } from "../order";
import { ValidationInfo } from "../order/validation";
import { OrderBuilder } from "./OrderBuilder";
/**
 * Helper builder for generating dutch limit orders
 */
export declare class DutchOrderBuilder extends OrderBuilder {
    private chainId;
    private permit2Address?;
    private info;
    static fromOrder(order: DutchOrder): DutchOrderBuilder;
    constructor(chainId: number, reactorAddress?: string, permit2Address?: string | undefined);
    decayStartTime(decayStartTime: number): DutchOrderBuilder;
    decayEndTime(decayEndTime: number): DutchOrderBuilder;
    input(input: DutchInput): DutchOrderBuilder;
    output(output: DutchOutput): DutchOrderBuilder;
    deadline(deadline: number): DutchOrderBuilder;
    swapper(swapper: string): DutchOrderBuilder;
    nonce(nonce: BigNumber): DutchOrderBuilder;
    validation(info: ValidationInfo): DutchOrderBuilder;
    nonFeeRecipient(newRecipient: string, feeRecipient?: string): DutchOrderBuilder;
    exclusiveFiller(exclusiveFiller: string, exclusivityOverrideBps: BigNumber): DutchOrderBuilder;
    build(): DutchOrder;
}
