import { OrderQuoter, OrderValidation, SignedOrder } from './OrderQuoter';
/**
 * Order validator
 */
export declare class OrderValidator extends OrderQuoter {
    validate(order: SignedOrder): Promise<OrderValidation>;
    validateBatch(orders: SignedOrder[]): Promise<OrderValidation[]>;
}
