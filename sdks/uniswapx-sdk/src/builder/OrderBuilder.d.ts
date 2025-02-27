import { BigNumber } from "ethers";
import { OrderInfo, UniswapXOrder } from "../order";
import { ValidationInfo } from "../order/validation";
/**
 * Builder for generating orders
 */
export declare abstract class OrderBuilder {
    protected orderInfo: Partial<OrderInfo>;
    constructor();
    deadline(deadline: number): OrderBuilder;
    nonce(nonce: BigNumber): OrderBuilder;
    swapper(swapper: string): OrderBuilder;
    validation(info: ValidationInfo): OrderBuilder;
    protected reactor(reactor: string): OrderBuilder;
    protected getOrderInfo(): OrderInfo;
    abstract build(): UniswapXOrder;
}
