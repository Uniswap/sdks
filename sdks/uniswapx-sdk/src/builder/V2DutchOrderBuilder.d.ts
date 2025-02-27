import { BigNumber } from "ethers";
import { CosignedV2DutchOrder, CosignerData, DutchInput, DutchOutput, UnsignedV2DutchOrder } from "../order";
import { ValidationInfo } from "../order/validation";
import { OrderBuilder } from "./OrderBuilder";
/**
 * Helper builder for generating dutch limit orders
 */
export declare class V2DutchOrderBuilder extends OrderBuilder {
    private chainId;
    private info;
    private permit2Address;
    static fromOrder<O extends UnsignedV2DutchOrder>(order: O): V2DutchOrderBuilder;
    constructor(chainId: number, reactorAddress?: string, _permit2Address?: string);
    decayStartTime(decayStartTime: number): this;
    decayEndTime(decayEndTime: number): this;
    input(input: DutchInput): this;
    output(output: DutchOutput): this;
    deadline(deadline: number): this;
    swapper(swapper: string): this;
    nonce(nonce: BigNumber): this;
    validation(info: ValidationInfo): this;
    nonFeeRecipient(newRecipient: string, feeRecipient?: string): this;
    exclusiveFiller(exclusiveFiller: string): this;
    exclusivityOverrideBps(exclusivityOverrideBps: BigNumber): this;
    inputOverride(inputOverride: BigNumber): this;
    outputOverrides(outputOverrides: BigNumber[]): this;
    cosigner(cosigner: string): this;
    cosignature(cosignature: string | undefined): this;
    cosignerData(cosignerData: CosignerData): this;
    buildPartial(): UnsignedV2DutchOrder;
    build(): CosignedV2DutchOrder;
    private initializeCosignerData;
}
