import { SignatureLike } from "@ethersproject/bytes";
import { PermitTransferFromData } from "@uniswap/permit2-sdk";
import { ResolvedUniswapXOrder } from "../utils/OrderQuoter";
import { BlockOverrides, CosignerData, CosignerDataJSON, DutchInput, DutchInputJSON, DutchOutput, DutchOutputJSON, OffChainOrder, OrderInfo, OrderResolutionOptions } from "./types";
import { CustomOrderValidation } from "./validation";
export type UnsignedV2DutchOrderInfo = OrderInfo & {
    cosigner: string;
    input: DutchInput;
    outputs: DutchOutput[];
};
export type CosignedV2DutchOrderInfo = UnsignedV2DutchOrderInfo & {
    cosignerData: CosignerData;
    cosignature: string;
};
export type UnsignedV2DutchOrderInfoJSON = Omit<UnsignedV2DutchOrderInfo, "nonce" | "input" | "outputs" | "cosignerData"> & {
    nonce: string;
    input: DutchInputJSON;
    outputs: DutchOutputJSON[];
};
export type CosignedV2DutchOrderInfoJSON = UnsignedV2DutchOrderInfoJSON & {
    cosignerData: CosignerDataJSON;
    cosignature: string;
};
export declare class UnsignedV2DutchOrder implements OffChainOrder {
    readonly info: UnsignedV2DutchOrderInfo;
    readonly chainId: number;
    permit2Address: string;
    constructor(info: UnsignedV2DutchOrderInfo, chainId: number, _permit2Address?: string);
    static fromJSON(json: UnsignedV2DutchOrderInfoJSON, chainId: number, _permit2Address?: string): UnsignedV2DutchOrder;
    static parse(encoded: string, chainId: number, permit2?: string): UnsignedV2DutchOrder;
    /**
     * @inheritdoc order
     */
    toJSON(): UnsignedV2DutchOrderInfoJSON & {
        permit2Address: string;
        chainId: number;
    };
    /**
     * @inheritdoc order
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
    resolve(_options: OrderResolutionOptions): ResolvedUniswapXOrder;
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
    cosignatureHash(cosignerData: CosignerData): string;
}
export declare class CosignedV2DutchOrder extends UnsignedV2DutchOrder {
    readonly info: CosignedV2DutchOrderInfo;
    readonly chainId: number;
    static fromUnsignedOrder(order: UnsignedV2DutchOrder, cosignerData: CosignerData, cosignature: string): CosignedV2DutchOrder;
    static fromJSON(json: CosignedV2DutchOrderInfoJSON, chainId: number, _permit2Address?: string): CosignedV2DutchOrder;
    static parse(encoded: string, chainId: number, permit2?: string): CosignedV2DutchOrder;
    constructor(info: CosignedV2DutchOrderInfo, chainId: number, _permit2Address?: string);
    /**
     * @inheritdoc order
     */
    toJSON(): CosignedV2DutchOrderInfoJSON & {
        permit2Address: string;
        chainId: number;
    };
    /**
     * @inheritdoc Order
     */
    resolve(options: OrderResolutionOptions): ResolvedUniswapXOrder;
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
