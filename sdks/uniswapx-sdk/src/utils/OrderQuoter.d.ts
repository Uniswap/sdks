import { StaticJsonRpcProvider } from "@ethersproject/providers";
import { OrderQuoter as OrderQuoterContract, RelayOrderReactor } from "../contracts";
import { Order, RelayOrder, ResolvedRelayFee, TokenAmount, UniswapXOrder } from "../order";
export declare enum OrderValidation {
    Expired = 0,
    NonceUsed = 1,
    InsufficientFunds = 2,
    InvalidSignature = 3,
    InvalidOrderFields = 4,
    UnknownError = 5,
    ValidationFailed = 6,
    ExclusivityPeriod = 7,
    OrderNotFillableYet = 8,
    InvalidGasPrice = 9,
    InvalidCosignature = 10,
    OK = 11
}
export interface ResolvedUniswapXOrder {
    input: TokenAmount;
    outputs: TokenAmount[];
}
export interface UniswapXOrderQuote {
    validation: OrderValidation;
    quote: ResolvedUniswapXOrder | undefined;
}
export interface ResolvedRelayOrder {
    fee: ResolvedRelayFee;
}
export interface RelayOrderQuote {
    validation: OrderValidation;
    quote: ResolvedRelayOrder | undefined;
}
export interface SignedUniswapXOrder {
    order: UniswapXOrder;
    signature: string;
}
export interface SignedRelayOrder {
    order: RelayOrder;
    signature: string;
}
export interface SignedOrder {
    order: Order;
    signature: string;
}
interface OrderQuoter<TOrder, TQuote> {
    quote(order: TOrder): Promise<TQuote>;
    quoteBatch(orders: TOrder[]): Promise<TQuote[]>;
    orderQuoterAddress: string;
}
/**
 * UniswapX order quoter
 */
export declare class UniswapXOrderQuoter implements OrderQuoter<SignedUniswapXOrder, UniswapXOrderQuote> {
    protected provider: StaticJsonRpcProvider;
    protected chainId: number;
    protected quoter: OrderQuoterContract;
    constructor(provider: StaticJsonRpcProvider, chainId: number, orderQuoterAddress?: string);
    quote(order: SignedUniswapXOrder): Promise<UniswapXOrderQuote>;
    quoteBatch(orders: SignedUniswapXOrder[]): Promise<UniswapXOrderQuote[]>;
    private getValidations;
    private getMulticallResults;
    get orderQuoterAddress(): string;
}
/**
 * Relay order quoter
 */
export declare class RelayOrderQuoter implements OrderQuoter<SignedRelayOrder, RelayOrderQuote> {
    protected provider: StaticJsonRpcProvider;
    protected chainId: number;
    protected quoter: RelayOrderReactor;
    private quoteFunctionSelector;
    constructor(provider: StaticJsonRpcProvider, chainId: number, reactorAddress?: string);
    quote(order: SignedRelayOrder): Promise<RelayOrderQuote>;
    quoteBatch(orders: SignedRelayOrder[]): Promise<RelayOrderQuote[]>;
    private getMulticallResults;
    private getValidations;
    get orderQuoterAddress(): string;
}
export {};
