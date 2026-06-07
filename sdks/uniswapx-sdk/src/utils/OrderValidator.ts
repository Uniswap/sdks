import {
  OrderValidation,
  RelayOrderQuoter,
  SignedRelayOrder,
  SignedUniswapXOrder,
  UniswapXOrderQuoter,
} from "./OrderQuoter";

/**
 * UniswapX order validator
 */
export class OrderValidator extends UniswapXOrderQuoter {
  async validate(order: SignedUniswapXOrder): Promise<OrderValidation> {
    return (await super.quote(order)).validation;
  }

  async validateBatch(
    orders: SignedUniswapXOrder[]
  ): Promise<OrderValidation[]> {
    return (await super.quoteBatch(orders)).map((order) => order.validation);
  }
}

export class RelayOrderValidator extends RelayOrderQuoter {
  async validate(order: SignedRelayOrder): Promise<OrderValidation> {
    return (await super.quote(order)).validation;
  }

  async validateBatch(orders: SignedRelayOrder[]): Promise<OrderValidation[]> {
    return (await super.quoteBatch(orders)).map((order) => order.validation);
  }
}
