import {
  OrderValidation,
  RelayOrderQuoter,
  SignedRelayOrder,
  SignedUniswapXOrder,
  SignedV4Order,
  UniswapXOrderQuoter,
  V4OrderQuoter,
} from './OrderQuoter'

/**
 * UniswapX order validator
 */
export class OrderValidator extends UniswapXOrderQuoter {
  async validate(order: SignedUniswapXOrder): Promise<OrderValidation> {
    return (await super.quote(order)).validation
  }

  async validateBatch(orders: SignedUniswapXOrder[]): Promise<OrderValidation[]> {
    return (await super.quoteBatch(orders)).map((order) => order.validation)
  }
}

export class RelayOrderValidator extends RelayOrderQuoter {
  async validate(order: SignedRelayOrder): Promise<OrderValidation> {
    return (await super.quote(order)).validation
  }

  async validateBatch(orders: SignedRelayOrder[]): Promise<OrderValidation[]> {
    return (await super.quoteBatch(orders)).map((order) => order.validation)
  }
}

/**
 * V4 order validator for Hybrid orders
 */
export class V4OrderValidator extends V4OrderQuoter {
  async validate(order: SignedV4Order): Promise<OrderValidation> {
    return (await super.quote(order)).validation
  }

  async validateBatch(orders: SignedV4Order[]): Promise<OrderValidation[]> {
    return (await super.quoteBatch(orders)).map((order) => order.validation)
  }
}
