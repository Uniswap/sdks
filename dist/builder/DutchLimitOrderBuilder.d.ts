import { BigNumber } from 'ethers';
import { DutchOutput, TokenAmount, DutchLimitOrder } from '../order';
import { OrderBuilder } from './OrderBuilder';
/**
 * Helper builder for generating dutch limit orders
 */
export declare class DutchLimitOrderBuilder extends OrderBuilder {
    private chainId;
    private permitPostAddress?;
    private info;
    constructor(chainId: number, reactorAddress?: string, permitPostAddress?: string | undefined);
    startTime(startTime: number): DutchLimitOrderBuilder;
    endTime(endTime: number): DutchLimitOrderBuilder;
    input(input: TokenAmount): DutchLimitOrderBuilder;
    output(output: DutchOutput): DutchLimitOrderBuilder;
    deadline(deadline: number): DutchLimitOrderBuilder;
    nonce(nonce: BigNumber): DutchLimitOrderBuilder;
    build(): DutchLimitOrder;
}
