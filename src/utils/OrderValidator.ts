import { OrderQuoter, OrderValidation, SignedOrder } from './OrderQuoter';

/**
 * Order validator
 */
export class OrderValidator extends OrderQuoter {
  async validate(order: SignedOrder): Promise<OrderValidation> {
    return (await super.quote(order)).validation;
  }

  async validateBatch(orders: SignedOrder[]): Promise<OrderValidation[]> {
    return (await super.quoteBatch(orders)).map(order => order.validation);
  }
}
