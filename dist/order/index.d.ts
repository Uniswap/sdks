import { IOrder } from './types';
export * from './DutchLimitOrder';
export * from './types';
/**
 * Parses a given serialized order
 * @return Parsed order object
 */
export declare function parseOrder(order: string): IOrder;
