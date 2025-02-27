import type { BaseContract, BigNumber, BigNumberish, BytesLike, CallOverrides, ContractTransaction, Overrides, PopulatedTransaction, Signer, utils } from "ethers";
import type { FunctionFragment, Result } from "@ethersproject/abi";
import type { Listener, Provider } from "@ethersproject/providers";
import type { TypedEventFilter, TypedEvent, TypedListener, OnEvent, PromiseOrValue } from "./common";
export type OrderInfoStruct = {
    reactor: PromiseOrValue<string>;
    swapper: PromiseOrValue<string>;
    nonce: PromiseOrValue<BigNumberish>;
    deadline: PromiseOrValue<BigNumberish>;
    additionalValidationContract: PromiseOrValue<string>;
    additionalValidationData: PromiseOrValue<BytesLike>;
};
export type OrderInfoStructOutput = [
    string,
    string,
    BigNumber,
    BigNumber,
    string,
    string
] & {
    reactor: string;
    swapper: string;
    nonce: BigNumber;
    deadline: BigNumber;
    additionalValidationContract: string;
    additionalValidationData: string;
};
export type InputTokenStruct = {
    token: PromiseOrValue<string>;
    amount: PromiseOrValue<BigNumberish>;
    maxAmount: PromiseOrValue<BigNumberish>;
};
export type InputTokenStructOutput = [string, BigNumber, BigNumber] & {
    token: string;
    amount: BigNumber;
    maxAmount: BigNumber;
};
export type OutputTokenStruct = {
    token: PromiseOrValue<string>;
    amount: PromiseOrValue<BigNumberish>;
    recipient: PromiseOrValue<string>;
};
export type OutputTokenStructOutput = [string, BigNumber, string] & {
    token: string;
    amount: BigNumber;
    recipient: string;
};
export type ResolvedOrderStruct = {
    info: OrderInfoStruct;
    input: InputTokenStruct;
    outputs: OutputTokenStruct[];
    sig: PromiseOrValue<BytesLike>;
    hash: PromiseOrValue<BytesLike>;
};
export type ResolvedOrderStructOutput = [
    OrderInfoStructOutput,
    InputTokenStructOutput,
    OutputTokenStructOutput[],
    string,
    string
] & {
    info: OrderInfoStructOutput;
    input: InputTokenStructOutput;
    outputs: OutputTokenStructOutput[];
    sig: string;
    hash: string;
};
export interface OrderQuoterInterface extends utils.Interface {
    functions: {
        "getReactor(bytes)": FunctionFragment;
        "quote(bytes,bytes)": FunctionFragment;
        "reactorCallback(((address,address,uint256,uint256,address,bytes),(address,uint256,uint256),(address,uint256,address)[],bytes,bytes32)[],bytes)": FunctionFragment;
    };
    getFunction(nameOrSignatureOrTopic: "getReactor" | "quote" | "reactorCallback"): FunctionFragment;
    encodeFunctionData(functionFragment: "getReactor", values: [PromiseOrValue<BytesLike>]): string;
    encodeFunctionData(functionFragment: "quote", values: [PromiseOrValue<BytesLike>, PromiseOrValue<BytesLike>]): string;
    encodeFunctionData(functionFragment: "reactorCallback", values: [ResolvedOrderStruct[], PromiseOrValue<BytesLike>]): string;
    decodeFunctionResult(functionFragment: "getReactor", data: BytesLike): Result;
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
        getReactor(order: PromiseOrValue<BytesLike>, overrides?: CallOverrides): Promise<[string] & {
            reactor: string;
        }>;
        quote(order: PromiseOrValue<BytesLike>, sig: PromiseOrValue<BytesLike>, overrides?: Overrides & {
            from?: PromiseOrValue<string>;
        }): Promise<ContractTransaction>;
        reactorCallback(resolvedOrders: ResolvedOrderStruct[], arg1: PromiseOrValue<BytesLike>, overrides?: CallOverrides): Promise<[void]>;
    };
    getReactor(order: PromiseOrValue<BytesLike>, overrides?: CallOverrides): Promise<string>;
    quote(order: PromiseOrValue<BytesLike>, sig: PromiseOrValue<BytesLike>, overrides?: Overrides & {
        from?: PromiseOrValue<string>;
    }): Promise<ContractTransaction>;
    reactorCallback(resolvedOrders: ResolvedOrderStruct[], arg1: PromiseOrValue<BytesLike>, overrides?: CallOverrides): Promise<void>;
    callStatic: {
        getReactor(order: PromiseOrValue<BytesLike>, overrides?: CallOverrides): Promise<string>;
        quote(order: PromiseOrValue<BytesLike>, sig: PromiseOrValue<BytesLike>, overrides?: CallOverrides): Promise<ResolvedOrderStructOutput>;
        reactorCallback(resolvedOrders: ResolvedOrderStruct[], arg1: PromiseOrValue<BytesLike>, overrides?: CallOverrides): Promise<void>;
    };
    filters: {};
    estimateGas: {
        getReactor(order: PromiseOrValue<BytesLike>, overrides?: CallOverrides): Promise<BigNumber>;
        quote(order: PromiseOrValue<BytesLike>, sig: PromiseOrValue<BytesLike>, overrides?: Overrides & {
            from?: PromiseOrValue<string>;
        }): Promise<BigNumber>;
        reactorCallback(resolvedOrders: ResolvedOrderStruct[], arg1: PromiseOrValue<BytesLike>, overrides?: CallOverrides): Promise<BigNumber>;
    };
    populateTransaction: {
        getReactor(order: PromiseOrValue<BytesLike>, overrides?: CallOverrides): Promise<PopulatedTransaction>;
        quote(order: PromiseOrValue<BytesLike>, sig: PromiseOrValue<BytesLike>, overrides?: Overrides & {
            from?: PromiseOrValue<string>;
        }): Promise<PopulatedTransaction>;
        reactorCallback(resolvedOrders: ResolvedOrderStruct[], arg1: PromiseOrValue<BytesLike>, overrides?: CallOverrides): Promise<PopulatedTransaction>;
    };
}
