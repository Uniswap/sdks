import { SignatureLike } from "@ethersproject/bytes";
import { PermitTransferFromData } from "@uniswap/permit2-sdk";
import { BigNumber } from "ethers";
import { ResolvedUniswapXOrder } from "../utils/OrderQuoter";
import { BlockOverrides, DutchInput, DutchInputJSON, DutchOutput, DutchOutputJSON, OffChainOrder, OrderInfo, OrderResolutionOptions } from "./types";
import { CustomOrderValidation } from "./validation";
export declare function id(text: string): string;
export type DutchOrderInfo = OrderInfo & {
    decayStartTime: number;
    decayEndTime: number;
    exclusiveFiller: string;
    exclusivityOverrideBps: BigNumber;
    input: DutchInput;
    outputs: DutchOutput[];
};
export type DutchOrderInfoJSON = Omit<DutchOrderInfo, "nonce" | "input" | "outputs" | "exclusivityOverrideBps"> & {
    nonce: string;
    exclusivityOverrideBps: string;
    input: DutchInputJSON;
    outputs: DutchOutputJSON[];
};
export declare class DutchOrder implements OffChainOrder {
    readonly info: DutchOrderInfo;
    readonly chainId: number;
    readonly _permit2Address?: string | undefined;
    permit2Address: string;
    constructor(info: DutchOrderInfo, chainId: number, _permit2Address?: string | undefined);
    static fromJSON(json: DutchOrderInfoJSON, chainId: number, _permit2Address?: string): DutchOrder;
    static parse(encoded: string, chainId: number, permit2?: string): DutchOrder;
    toJSON(): DutchOrderInfoJSON & {
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
     * @inheritDoc OrderInterface
     */
    getSigner(signature: SignatureLike): string;
    /**
     * @inheritDoc OrderInterface
     */
    permitData(): PermitTransferFromData;
    /**
     * @inheritDoc OrderInterface
     */
    hash(): string;
    /**
     * Returns the resolved order with the given options
     * @return The resolved order
     */
    resolve(options: OrderResolutionOptions): ResolvedUniswapXOrder;
    /**
     * Returns the parsed validation
     * @return The parsed validation data for the order
     */
    get validation(): CustomOrderValidation;
    private toPermit;
    private witnessInfo;
    private witness;
}
