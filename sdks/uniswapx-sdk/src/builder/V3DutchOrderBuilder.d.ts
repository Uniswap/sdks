import { BigNumber } from "ethers";
import { CosignedV3DutchOrder, UnsignedV3DutchOrder, V3CosignerData } from "../order/V3DutchOrder";
import { V3DutchInput, V3DutchOutput } from "../order/types";
import { ValidationInfo } from "../order/validation";
import { OrderBuilder } from "./OrderBuilder";
export declare class V3DutchOrderBuilder extends OrderBuilder {
    private chainId;
    static fromOrder<T extends UnsignedV3DutchOrder>(order: T): V3DutchOrderBuilder;
    build(): CosignedV3DutchOrder;
    private permit2Address;
    private info;
    constructor(chainId: number, reactorAddress?: string, _permit2Address?: string);
    cosigner(cosigner: string): this;
    cosignature(cosignature: string | undefined): this;
    decayStartBlock(decayStartBlock: number): this;
    private initializeCosignerData;
    private isRelativeBlocksIncreasing;
    private checkUnsignedInvariants;
    private checkCosignedInvariants;
    startingBaseFee(startingBaseFee: BigNumber): this;
    input(input: V3DutchInput): this;
    output(output: V3DutchOutput): this;
    inputOverride(inputOverride: BigNumber): this;
    outputOverrides(outputOverrides: BigNumber[]): this;
    deadline(deadline: number): this;
    swapper(swapper: string): this;
    nonce(nonce: BigNumber): this;
    validation(info: ValidationInfo): this;
    cosignerData(cosignerData: V3CosignerData): this;
    exclusiveFiller(exclusiveFiller: string): this;
    exclusivityOverrideBps(exclusivityOverrideBps: BigNumber): this;
    nonFeeRecipient(newRecipient: string, feeRecipient?: string): this;
    buildPartial(): UnsignedV3DutchOrder;
    static getMaxAmountOut(startAmount: BigNumber, relativeAmounts: bigint[]): BigNumber;
    static getMinAmountOut(startAmount: BigNumber, relativeAmounts: bigint[]): BigNumber;
}
