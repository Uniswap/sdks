import { SignatureLike } from "@ethersproject/bytes";
import { PermitBatchTransferFromData } from "@uniswap/permit2-sdk";
import { BigNumber } from "ethers";
import { ResolvedRelayOrder } from "../utils/OrderQuoter";
import { BlockOverrides, OffChainOrder, OrderInfo, OrderResolutionOptions } from "./types";
export type RelayInput = {
    readonly token: string;
    readonly amount: BigNumber;
    readonly recipient: string;
};
export type RelayFee = {
    readonly token: string;
    readonly startAmount: BigNumber;
    readonly endAmount: BigNumber;
    readonly startTime: number;
    readonly endTime: number;
};
export type RelayInputJSON = Omit<RelayInput, "amount"> & {
    amount: string;
};
export type RelayFeeJSON = Omit<RelayFee, "startAmount" | "endAmount"> & {
    startAmount: string;
    endAmount: string;
};
type RelayOrderNestedOrderInfo = Omit<OrderInfo, "additionalValidationContract" | "additionalValidationData">;
export type RelayOrderInfo = RelayOrderNestedOrderInfo & {
    input: RelayInput;
    fee: RelayFee;
    universalRouterCalldata: string;
};
export type RelayOrderInfoJSON = Omit<RelayOrderInfo, "nonce" | "input" | "fee"> & {
    nonce: string;
    input: RelayInputJSON;
    fee: RelayFeeJSON;
    universalRouterCalldata: string;
};
export declare class RelayOrder implements OffChainOrder {
    readonly info: RelayOrderInfo;
    readonly chainId: number;
    readonly _permit2Address?: string | undefined;
    permit2Address: string;
    constructor(info: RelayOrderInfo, chainId: number, _permit2Address?: string | undefined);
    static fromJSON(json: RelayOrderInfoJSON, chainId: number, _permit2Address?: string): RelayOrder;
    static parse(encoded: string, chainId: number, permit2?: string): RelayOrder;
    toJSON(): RelayOrderInfoJSON & {
        permit2Address: string;
        chainId: number;
    };
    /**
     * @inheritdoc order
     */
    get blockOverrides(): BlockOverrides;
    serialize(): string;
    /**
     * @inheritdoc Order
     */
    getSigner(signature: SignatureLike): string;
    /**
     * @inheritdoc OrderInterface
     */
    permitData(): PermitBatchTransferFromData;
    /**
     * @inheritdoc OrderInterface
     */
    hash(): string;
    /**
     * Returns the resolved order with the given options
     * @return The resolved order
     */
    resolve(options: OrderResolutionOptions): ResolvedRelayOrder;
    private toPermit;
    private witnessInfo;
    private witness;
}
export {};
