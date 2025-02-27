import { OrderValidation, RelayOrderQuoter, SignedRelayOrder, SignedUniswapXOrder, UniswapXOrderQuoter } from "./OrderQuoter";
/**
 * UniswapX order validator
 */
export declare class OrderValidator extends UniswapXOrderQuoter {
    validate(order: SignedUniswapXOrder): Promise<OrderValidation>;
    validateBatch(orders: SignedUniswapXOrder[]): Promise<OrderValidation[]>;
}
export declare class RelayOrderValidator extends RelayOrderQuoter {
    validate(order: SignedRelayOrder): Promise<OrderValidation>;
    validateBatch(orders: SignedRelayOrder[]): Promise<OrderValidation[]>;
}
