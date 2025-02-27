import { SignatureLike } from "@ethersproject/bytes";
import { PermitTransferFromData } from "@uniswap/permit2-sdk";
import { BigNumber } from "ethers";
import { ResolvedUniswapXOrder } from "../utils";
import { BlockOverrides, CosignerData, CosignerDataJSON, OffChainOrder, OrderInfo, V3DutchInput, V3DutchInputJSON, V3DutchOutput, V3DutchOutputJSON, V3OrderResolutionOptions } from "./types";
export type V3CosignerDataJSON = Omit<CosignerDataJSON, "decayStartTime" | "decayEndTime"> & {
    decayStartBlock: number;
};
export type V3CosignerData = Omit<CosignerData, "decayStartTime" | "decayEndTime"> & {
    decayStartBlock: number;
};
export type UnsignedV3DutchOrderInfoJSON = Omit<UnsignedV3DutchOrderInfo, "nonce" | "startingBaseFee" | "input" | "outputs" | "cosignerData"> & {
    nonce: string;
    startingBaseFee: string;
    input: V3DutchInputJSON;
    outputs: V3DutchOutputJSON[];
};
export type UnsignedV3DutchOrderInfo = OrderInfo & {
    cosigner: string;
    startingBaseFee: BigNumber;
    input: V3DutchInput;
    outputs: V3DutchOutput[];
};
export type CosignedV3DutchOrderInfoJSON = UnsignedV3DutchOrderInfoJSON & {
    cosignerData: V3CosignerDataJSON;
    cosignature: string;
};
export type CosignedV3DutchOrderInfo = UnsignedV3DutchOrderInfo & {
    cosignerData: V3CosignerData;
    cosignature: string;
};
export declare const V3_DUTCH_ORDER_TYPES: {
    V3DutchOrder: {
        name: string;
        type: string;
    }[];
    OrderInfo: {
        name: string;
        type: string;
    }[];
    V3DutchInput: {
        name: string;
        type: string;
    }[];
    V3DutchOutput: {
        name: string;
        type: string;
    }[];
    NonlinearDutchDecay: {
        name: string;
        type: string;
    }[];
};
export declare class UnsignedV3DutchOrder implements OffChainOrder {
    readonly info: UnsignedV3DutchOrderInfo;
    readonly chainId: number;
    permit2Address: string;
    constructor(info: UnsignedV3DutchOrderInfo, chainId: number, _permit2Address?: string);
    static fromJSON(json: UnsignedV3DutchOrderInfoJSON, chainId: number, _permit2Address?: string): UnsignedV3DutchOrder;
    /**
     * @inheritdoc order
     */
    get blockOverrides(): BlockOverrides;
    /**
     * @inheritdoc order
     */
    serialize(): string;
    /**
     * @inheritdoc order
     */
    toJSON(): UnsignedV3DutchOrderInfoJSON & {
        permit2Address: string;
        chainId: number;
    };
    permitData(): PermitTransferFromData;
    private toPermit;
    private witnessInfo;
    private witness;
    getSigner(signature: SignatureLike): string;
    hash(): string;
    /**
     * Full order hash that should be signed over by the cosigner
     */
    cosignatureHash(cosignerData: V3CosignerData): string;
    static parse(encoded: string, chainId: number, permit2?: string): UnsignedV3DutchOrder;
}
export declare class CosignedV3DutchOrder extends UnsignedV3DutchOrder {
    readonly info: CosignedV3DutchOrderInfo;
    readonly chainId: number;
    static fromUnsignedOrder(order: UnsignedV3DutchOrder, cosignerData: V3CosignerData, cosignature: string): CosignedV3DutchOrder;
    static fromJSON(json: CosignedV3DutchOrderInfoJSON, chainId: number, _permit2Address?: string): CosignedV3DutchOrder;
    constructor(info: CosignedV3DutchOrderInfo, chainId: number, _permit2Address?: string);
    /**
     * @inheritdoc order
     */
    toJSON(): CosignedV3DutchOrderInfoJSON & {
        permit2Address: string;
        chainId: number;
    };
    static parse(encoded: string, chainId: number, permit2?: string): CosignedV3DutchOrder;
    serialize(): string;
    recoverCosigner(): string;
    resolve(options: V3OrderResolutionOptions): ResolvedUniswapXOrder;
}
export declare function encodeRelativeBlocks(relativeBlocks: number[]): BigNumber;
