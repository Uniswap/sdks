import { BigNumber } from 'ethers';
import { IOrder, OrderInfo } from '../order';
/**
 * Builder for generating orders
 */
export declare abstract class OrderBuilder {
    protected orderInfo: Partial<OrderInfo>;
    constructor();
    deadline(deadline: number): OrderBuilder;
    nonce(nonce: BigNumber): OrderBuilder;
    protected reactor(reactor: string): OrderBuilder;
    protected getOrderInfo(): OrderInfo;
    abstract build(): IOrder;
}
