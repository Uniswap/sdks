import { BigNumber } from "ethers";
import { CosignedPriorityOrder, PriorityCosignerData, PriorityInput, PriorityOutput, UnsignedPriorityOrder } from "../order";
import { ValidationInfo } from "../order/validation";
import { OrderBuilder } from "./OrderBuilder";
/**
 * Helper builder for generating priority gas auction orders
 */
export declare class PriorityOrderBuilder extends OrderBuilder {
    private chainId;
    private permit2Address?;
    private info;
    static fromOrder<O extends UnsignedPriorityOrder>(order: O): PriorityOrderBuilder;
    constructor(chainId: number, reactorAddress?: string, permit2Address?: string | undefined);
    cosigner(cosigner: string): this;
    auctionStartBlock(auctionStartBlock: BigNumber): this;
    auctionTargetBlock(auctionTargetBlock: BigNumber): this;
    baselinePriorityFeeWei(baselinePriorityFeeWei: BigNumber): this;
    cosignerData(cosignerData: PriorityCosignerData): this;
    cosignature(cosignature: string | undefined): this;
    input(input: PriorityInput): this;
    output(output: PriorityOutput): this;
    deadline(deadline: number): this;
    swapper(swapper: string): this;
    nonce(nonce: BigNumber): this;
    validation(info: ValidationInfo): this;
    nonFeeRecipient(newRecipient: string, feeRecipient?: string): PriorityOrderBuilder;
    buildPartial(): UnsignedPriorityOrder;
    build(): CosignedPriorityOrder;
}
