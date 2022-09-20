import type { BaseContract, BigNumber, BigNumberish, BytesLike, CallOverrides, ContractTransaction, Overrides, PopulatedTransaction, Signer, utils } from "ethers";
import type { FunctionFragment, Result } from "@ethersproject/abi";
import type { Listener, Provider } from "@ethersproject/providers";
import type { TypedEventFilter, TypedEvent, TypedListener, OnEvent, PromiseOrValue } from "./common";
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
export interface DirectTakerExecutorInterface extends utils.Interface {
    functions: {
        "reactorCallback(((address,uint256,uint256),(address,uint256),(address,uint256,address)[])[],bytes)": FunctionFragment;
    };
    getFunction(nameOrSignatureOrTopic: "reactorCallback"): FunctionFragment;
    encodeFunctionData(functionFragment: "reactorCallback", values: [ResolvedOrderStruct[], PromiseOrValue<BytesLike>]): string;
    decodeFunctionResult(functionFragment: "reactorCallback", data: BytesLike): Result;
    events: {};
}
export interface DirectTakerExecutor extends BaseContract {
    connect(signerOrProvider: Signer | Provider | string): this;
    attach(addressOrName: string): this;
    deployed(): Promise<this>;
    interface: DirectTakerExecutorInterface;
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
        reactorCallback(resolvedOrders: ResolvedOrderStruct[], fillData: PromiseOrValue<BytesLike>, overrides?: Overrides & {
            from?: PromiseOrValue<string>;
        }): Promise<ContractTransaction>;
    };
    reactorCallback(resolvedOrders: ResolvedOrderStruct[], fillData: PromiseOrValue<BytesLike>, overrides?: Overrides & {
        from?: PromiseOrValue<string>;
    }): Promise<ContractTransaction>;
    callStatic: {
        reactorCallback(resolvedOrders: ResolvedOrderStruct[], fillData: PromiseOrValue<BytesLike>, overrides?: CallOverrides): Promise<void>;
    };
    filters: {};
    estimateGas: {
        reactorCallback(resolvedOrders: ResolvedOrderStruct[], fillData: PromiseOrValue<BytesLike>, overrides?: Overrides & {
            from?: PromiseOrValue<string>;
        }): Promise<BigNumber>;
    };
    populateTransaction: {
        reactorCallback(resolvedOrders: ResolvedOrderStruct[], fillData: PromiseOrValue<BytesLike>, overrides?: Overrides & {
            from?: PromiseOrValue<string>;
        }): Promise<PopulatedTransaction>;
    };
}
