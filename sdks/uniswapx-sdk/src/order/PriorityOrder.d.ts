import { SignatureLike } from "@ethersproject/bytes";
import { PermitTransferFromData } from "@uniswap/permit2-sdk";
import { BigNumber } from "ethers";
import { ResolvedUniswapXOrder } from "../utils";
import { BlockOverrides, OffChainOrder, OrderInfo, PriorityInput, PriorityInputJSON, PriorityOrderResolutionOptions, PriorityOutput, PriorityOutputJSON } from "./types";
import { CustomOrderValidation } from "./validation";
export declare class OrderNotFillable extends Error {
    constructor(message: string);
}
export type PriorityCosignerData = {
    auctionTargetBlock: BigNumber;
};
export type UnsignedPriorityOrderInfo = OrderInfo & {
    cosigner: string;
    auctionStartBlock: BigNumber;
    baselinePriorityFeeWei: BigNumber;
    input: PriorityInput;
    outputs: PriorityOutput[];
};
export type CosignedPriorityOrderInfo = UnsignedPriorityOrderInfo & {
    cosignerData: PriorityCosignerData;
    cosignature: string;
};
export type UnsignedPriorityOrderInfoJSON = Omit<UnsignedPriorityOrderInfo, "nonce" | "input" | "outputs" | "auctionStartBlock" | "baselinePriorityFeeWei"> & {
    nonce: string;
    cosigner: string;
    auctionStartBlock: string;
    baselinePriorityFeeWei: string;
    input: PriorityInputJSON;
    outputs: PriorityOutputJSON[];
};
export type CosignedPriorityOrderInfoJSON = UnsignedPriorityOrderInfoJSON & {
    cosignerData: {
        auctionTargetBlock: string;
    };
    cosignature: string;
};
export declare class UnsignedPriorityOrder implements OffChainOrder {
    readonly info: UnsignedPriorityOrderInfo;
    readonly chainId: number;
    permit2Address: string;
    constructor(info: UnsignedPriorityOrderInfo, chainId: number, _permit2Address?: string);
    static fromJSON(json: UnsignedPriorityOrderInfoJSON, chainId: number, _permit2Address?: string): UnsignedPriorityOrder;
    static parse(encoded: string, chainId: number, permit2?: string): UnsignedPriorityOrder;
    /**
     * @inheritdoc order
     */
    toJSON(): UnsignedPriorityOrderInfoJSON & {
        permit2Address: string;
        chainId: number;
    };
    /**
     * @inheritdoc Order
     */
    get blockOverrides(): BlockOverrides;
    /**
     * @inheritdoc order
     */
    serialize(): string;
    /**
     * @inheritdoc Order
     */
    getSigner(signature: SignatureLike): string;
    /**
     * @inheritdoc Order
     */
    permitData(): PermitTransferFromData;
    /**
     * @inheritdoc Order
     */
    hash(): string;
    /**
     * Returns the resolved order with the given options
     * @return The resolved order
     */
    resolve(_options: PriorityOrderResolutionOptions): ResolvedUniswapXOrder;
    /**
     * Returns the parsed validation
     * @return The parsed validation data for the order
     */
    get validation(): CustomOrderValidation;
    private toPermit;
    private witnessInfo;
    private witness;
    /**
     * Full order hash that should be signed over by the cosigner
     */
    cosignatureHash(cosignerData: PriorityCosignerData): string;
}
export declare class CosignedPriorityOrder extends UnsignedPriorityOrder {
    readonly info: CosignedPriorityOrderInfo;
    readonly chainId: number;
    static fromUnsignedOrder(order: UnsignedPriorityOrder, cosignerData: PriorityCosignerData, cosignature: string): CosignedPriorityOrder;
    static fromJSON(json: CosignedPriorityOrderInfoJSON, chainId: number, _permit2Address?: string): CosignedPriorityOrder;
    static parse(encoded: string, chainId: number, permit2?: string): CosignedPriorityOrder;
    constructor(info: CosignedPriorityOrderInfo, chainId: number, _permit2Address?: string);
    /**
     * @inheritdoc order
     */
    toJSON(): CosignedPriorityOrderInfoJSON & {
        permit2Address: string;
        chainId: number;
    };
    /**
     * @inheritdoc Order
     */
    resolve(options: PriorityOrderResolutionOptions): ResolvedUniswapXOrder;
    /**
     * @inheritdoc Order
     */
    get blockOverrides(): BlockOverrides;
    /**
     * @inheritdoc order
     */
    serialize(): string;
    /**
     *  recovers co-signer address from cosignature and full order hash
     *  @returns The address which co-signed the order
     */
    recoverCosigner(): string;
}
