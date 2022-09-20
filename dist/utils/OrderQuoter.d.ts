import { SignatureLike } from '@ethersproject/bytes';
import { BaseProvider } from '@ethersproject/providers';
import { IOrder, TokenAmount } from '../order';
export declare enum OrderValidation {
    Expired = 0,
    AlreadyFilled = 1,
    Cancelled = 2,
    InsufficientFunds = 3,
    InvalidSignature = 4,
    InvalidOrderFields = 5,
    UnknownError = 6,
    OK = 7
}
export interface ResolvedOrder {
    input: TokenAmount;
    outputs: TokenAmount[];
}
export interface OrderQuote {
    validation: OrderValidation;
    quote: ResolvedOrder | undefined;
}
export interface SignedOrder {
    order: IOrder;
    signature: SignatureLike;
}
/**
 * Order quoter
 */
export declare class OrderQuoter {
    private provider;
    private chainId;
    private orderQuoter;
    constructor(provider: BaseProvider, chainId: number, orderQuoterAddress?: string);
    quote(order: SignedOrder): Promise<OrderQuote>;
    quoteBatch(orders: SignedOrder[]): Promise<OrderQuote[]>;
    private getValidations;
    private checkTerminalStates;
}
