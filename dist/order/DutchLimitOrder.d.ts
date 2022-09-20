import { SignatureLike } from '@ethersproject/bytes';
import { BigNumber } from 'ethers';
import { PermitPost, PermitData } from '../utils';
import { IOrder, OrderInfo, TokenAmount } from './types';
export declare type DutchOutput = {
    readonly token: string;
    readonly startAmount: BigNumber;
    readonly endAmount: BigNumber;
    readonly recipient: string;
};
export declare type DutchLimitOrderInfo = OrderInfo & {
    startTime: number;
    endTime: number;
    input: TokenAmount;
    outputs: DutchOutput[];
};
export declare class DutchLimitOrder implements IOrder {
    readonly info: DutchLimitOrderInfo;
    readonly chainId: number;
    readonly permitPostAddress?: string | undefined;
    readonly permitPost: PermitPost;
    constructor(info: DutchLimitOrderInfo, chainId: number, permitPostAddress?: string | undefined);
    static parse(encoded: string, chainId: number): DutchLimitOrder;
    /**
     * @inheritdoc IOrder
     */
    serialize(): string;
    /**
     * @inheritdoc IOrder
     */
    getSigner(signature: SignatureLike): string;
    /**
     * @inheritdoc IOrder
     */
    permitData(): PermitData;
    /**
     * @inheritdoc IOrder
     */
    hash(): string;
}
