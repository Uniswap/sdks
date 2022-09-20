import type { BaseContract, BigNumber, BigNumberish, BytesLike, CallOverrides, ContractTransaction, Overrides, PopulatedTransaction, Signer, utils } from "ethers";
import type { FunctionFragment, Result } from "@ethersproject/abi";
import type { Listener, Provider } from "@ethersproject/providers";
import type { TypedEventFilter, TypedEvent, TypedListener, OnEvent, PromiseOrValue } from "./common";
export declare type SignatureStruct = {
    v: PromiseOrValue<BigNumberish>;
    r: PromiseOrValue<BytesLike>;
    s: PromiseOrValue<BytesLike>;
};
export declare type SignatureStructOutput = [number, string, string] & {
    v: number;
    r: string;
    s: string;
};
export declare type OrderInfoStruct = {
    reactor: PromiseOrValue<string>;
    nonce: PromiseOrValue<BigNumberish>;
    deadline: PromiseOrValue<BigNumberish>;
};
export declare type OrderInfoStructOutput = [string, BigNumber, BigNumber] & {
    reactor: string;
    nonce: BigNumber;
    deadline: BigNumber;
};
export declare type TokenAmountStruct = {
    token: PromiseOrValue<string>;
    amount: PromiseOrValue<BigNumberish>;
};
export declare type TokenAmountStructOutput = [string, BigNumber] & {
    token: string;
    amount: BigNumber;
};
export declare type OutputStruct = {
    token: PromiseOrValue<string>;
    amount: PromiseOrValue<BigNumberish>;
    recipient: PromiseOrValue<string>;
};
export declare type OutputStructOutput = [string, BigNumber, string] & {
    token: string;
    amount: BigNumber;
    recipient: string;
};
export declare type ResolvedOrderStruct = {
    info: OrderInfoStruct;
    input: TokenAmountStruct;
    outputs: OutputStruct[];
};
export declare type ResolvedOrderStructOutput = [
    OrderInfoStructOutput,
    TokenAmountStructOutput,
    OutputStructOutput[]
] & {
    info: OrderInfoStructOutput;
    input: TokenAmountStructOutput;
    outputs: OutputStructOutput[];
};
export interface OrderQuoterInterface extends utils.Interface {
    functions: {
        "quote(bytes,(uint8,bytes32,bytes32))": FunctionFragment;
        "reactorCallback(((address,uint256,uint256),(address,uint256),(address,uint256,address)[])[],bytes)": FunctionFragment;
    };
    getFunction(nameOrSignatureOrTopic: "quote" | "reactorCallback"): FunctionFragment;
    encodeFunctionData(functionFragment: "quote", values: [PromiseOrValue<BytesLike>, SignatureStruct]): string;
    encodeFunctionData(functionFragment: "reactorCallback", values: [ResolvedOrderStruct[], PromiseOrValue<BytesLike>]): string;
    decodeFunctionResult(functionFragment: "quote", data: BytesLike): Result;
    decodeFunctionResult(functionFragment: "reactorCallback", data: BytesLike): Result;
    events: {};
}
export interface OrderQuoter extends BaseContract {
    connect(signerOrProvider: Signer | Provider | string): this;
    attach(addressOrName: string): this;
    deployed(): Promise<this>;
    interface: OrderQuoterInterface;
    queryFilter<TEvent extends TypedEvent>(event: TypedEventFilter<TEvent>, fromBlockOrBlockhash?: string | number | undefined, toBlock?: string | number | undefined): Promise<Array<TEvent>>;
    listeners<TEvent extends TypedEvent>(eventFilter?: TypedEventFilter<TEvent>): Array<TypedListener<TEvent>>;
    listeners(eventName?: string): Array<Listener>;
    removeAllListeners<TEvent extends TypedEvent>(eventFilter: TypedEventFilter<TEvent>): this;
    removeAllListeners(eventName?: string): this;
    off: OnEvent<this>;
    on: OnEvent<this>;
    once: OnEvent<this>;
    removeListener: OnEvent<this>;
    functions: {
        quote(order: PromiseOrValue<BytesLike>, sig: SignatureStruct, overrides?: Overrides & {
            from?: PromiseOrValue<string>;
        }): Promise<ContractTransaction>;
        reactorCallback(resolvedOrders: ResolvedOrderStruct[], arg1: PromiseOrValue<BytesLike>, overrides?: CallOverrides): Promise<[void]>;
    };
    quote(order: PromiseOrValue<BytesLike>, sig: SignatureStruct, overrides?: Overrides & {
        from?: PromiseOrValue<string>;
    }): Promise<ContractTransaction>;
    reactorCallback(resolvedOrders: ResolvedOrderStruct[], arg1: PromiseOrValue<BytesLike>, overrides?: CallOverrides): Promise<void>;
    callStatic: {
        quote(order: PromiseOrValue<BytesLike>, sig: SignatureStruct, overrides?: CallOverrides): Promise<ResolvedOrderStructOutput>;
        reactorCallback(resolvedOrders: ResolvedOrderStruct[], arg1: PromiseOrValue<BytesLike>, overrides?: CallOverrides): Promise<void>;
    };
    filters: {};
    estimateGas: {
        quote(order: PromiseOrValue<BytesLike>, sig: SignatureStruct, overrides?: Overrides & {
            from?: PromiseOrValue<string>;
        }): Promise<BigNumber>;
        reactorCallback(resolvedOrders: ResolvedOrderStruct[], arg1: PromiseOrValue<BytesLike>, overrides?: CallOverrides): Promise<BigNumber>;
    };
    populateTransaction: {
        quote(order: PromiseOrValue<BytesLike>, sig: SignatureStruct, overrides?: Overrides & {
            from?: PromiseOrValue<string>;
        }): Promise<PopulatedTransaction>;
        reactorCallback(resolvedOrders: ResolvedOrderStruct[], arg1: PromiseOrValue<BytesLike>, overrides?: CallOverrides): Promise<PopulatedTransaction>;
    };
}
