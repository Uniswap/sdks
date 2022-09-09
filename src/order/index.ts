import { OrderType, REVERSE_REACTOR_MAPPING } from '../constants';
import { stripHexPrefix } from '../utils';

import { IOrder } from './types';
import { DutchLimitOrder } from './dutchLimit';
import { MissingConfiguration } from '../errors';

export * from './dutchLimit';
export * from './types';

/**
 * Parses a given serialized order
 * @return Parsed order object
 */
export function parseOrder(order: string): IOrder {
  // reactor address is always the first field in order
  const reactor =
    '0x' +
    stripHexPrefix(order)
      .slice(0, 40)
      .toLowerCase();

  if (!REVERSE_REACTOR_MAPPING[reactor]) {
    throw new MissingConfiguration('reactor', reactor);
  }

  const { chainId, orderType } = REVERSE_REACTOR_MAPPING[reactor];
  switch (orderType) {
    case OrderType.DutchLimit:
      return DutchLimitOrder.parse(order, chainId);
    default:
      throw new MissingConfiguration('orderType', orderType);
  }
}
