import type { BaseContract, BigNumber, BigNumberish, BytesLike, CallOverrides, ContractTransaction, Overrides, PopulatedTransaction, Signer, utils } from "ethers";
import type { FunctionFragment, Result, EventFragment } from "@ethersproject/abi";
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
export declare type SignedOrderStruct = {
    order: PromiseOrValue<BytesLike>;
    sig: SignatureStruct;
};
export declare type SignedOrderStructOutput = [string, SignatureStructOutput] & {
    order: string;
    sig: SignatureStructOutput;
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
export interface DutchLimitOrderReactorInterface extends utils.Interface {
    functions: {
        "execute((bytes,(uint8,bytes32,bytes32)),address,bytes)": FunctionFragment;
        "executeBatch((bytes,(uint8,bytes32,bytes32))[],address,bytes)": FunctionFragment;
        "orderStatus(bytes32)": FunctionFragment;
        "permitPost()": FunctionFragment;
        "resolve(bytes)": FunctionFragment;
    };
    getFunction(nameOrSignatureOrTopic: "execute" | "executeBatch" | "orderStatus" | "permitPost" | "resolve"): FunctionFragment;
    encodeFunctionData(functionFragment: "execute", values: [
        SignedOrderStruct,
        PromiseOrValue<string>,
        PromiseOrValue<BytesLike>
    ]): string;
    encodeFunctionData(functionFragment: "executeBatch", values: [
        SignedOrderStruct[],
        PromiseOrValue<string>,
        PromiseOrValue<BytesLike>
    ]): string;
    encodeFunctionData(functionFragment: "orderStatus", values: [PromiseOrValue<BytesLike>]): string;
    encodeFunctionData(functionFragment: "permitPost", values?: undefined): string;
    encodeFunctionData(functionFragment: "resolve", values: [PromiseOrValue<BytesLike>]): string;
    decodeFunctionResult(functionFragment: "execute", data: BytesLike): Result;
    decodeFunctionResult(functionFragment: "executeBatch", data: BytesLike): Result;
    decodeFunctionResult(functionFragment: "orderStatus", data: BytesLike): Result;
    decodeFunctionResult(functionFragment: "permitPost", data: BytesLike): Result;
    decodeFunctionResult(functionFragment: "resolve", data: BytesLike): Result;
    events: {
        "Fill(bytes32,address)": EventFragment;
    };
    getEvent(nameOrSignatureOrTopic: "Fill"): EventFragment;
}
export interface FillEventObject {
    orderHash: string;
    filler: string;
}
export declare type FillEvent = TypedEvent<[string, string], FillEventObject>;
export declare type FillEventFilter = TypedEventFilter<FillEvent>;
export interface DutchLimitOrderReactor extends BaseContract {
    connect(signerOrProvider: Signer | Provider | string): this;
    attach(addressOrName: string): this;
    deployed(): Promise<this>;
    interface: DutchLimitOrderReactorInterface;
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
        execute(order: SignedOrderStruct, fillContract: PromiseOrValue<string>, fillData: PromiseOrValue<BytesLike>, overrides?: Overrides & {
            from?: PromiseOrValue<string>;
        }): Promise<ContractTransaction>;
        executeBatch(orders: SignedOrderStruct[], fillContract: PromiseOrValue<string>, fillData: PromiseOrValue<BytesLike>, overrides?: Overrides & {
            from?: PromiseOrValue<string>;
        }): Promise<ContractTransaction>;
        orderStatus(arg0: PromiseOrValue<BytesLike>, overrides?: CallOverrides): Promise<[
            boolean,
            boolean
        ] & {
            isCancelled: boolean;
            isFilled: boolean;
        }>;
        permitPost(overrides?: CallOverrides): Promise<[string]>;
        resolve(order: PromiseOrValue<BytesLike>, overrides?: CallOverrides): Promise<[
            ResolvedOrderStructOutput
        ] & {
            resolvedOrder: ResolvedOrderStructOutput;
        }>;
    };
    execute(order: SignedOrderStruct, fillContract: PromiseOrValue<string>, fillData: PromiseOrValue<BytesLike>, overrides?: Overrides & {
        from?: PromiseOrValue<string>;
    }): Promise<ContractTransaction>;
    executeBatch(orders: SignedOrderStruct[], fillContract: PromiseOrValue<string>, fillData: PromiseOrValue<BytesLike>, overrides?: Overrides & {
        from?: PromiseOrValue<string>;
    }): Promise<ContractTransaction>;
    orderStatus(arg0: PromiseOrValue<BytesLike>, overrides?: CallOverrides): Promise<[boolean, boolean] & {
        isCancelled: boolean;
        isFilled: boolean;
    }>;
    permitPost(overrides?: CallOverrides): Promise<string>;
    resolve(order: PromiseOrValue<BytesLike>, overrides?: CallOverrides): Promise<ResolvedOrderStructOutput>;
    callStatic: {
        execute(order: SignedOrderStruct, fillContract: PromiseOrValue<string>, fillData: PromiseOrValue<BytesLike>, overrides?: CallOverrides): Promise<void>;
        executeBatch(orders: SignedOrderStruct[], fillContract: PromiseOrValue<string>, fillData: PromiseOrValue<BytesLike>, overrides?: CallOverrides): Promise<void>;
        orderStatus(arg0: PromiseOrValue<BytesLike>, overrides?: CallOverrides): Promise<[
            boolean,
            boolean
        ] & {
            isCancelled: boolean;
            isFilled: boolean;
        }>;
        permitPost(overrides?: CallOverrides): Promise<string>;
        resolve(order: PromiseOrValue<BytesLike>, overrides?: CallOverrides): Promise<ResolvedOrderStructOutput>;
    };
    filters: {
        "Fill(bytes32,address)"(orderHash?: null, filler?: null): FillEventFilter;
        Fill(orderHash?: null, filler?: null): FillEventFilter;
    };
    estimateGas: {
        execute(order: SignedOrderStruct, fillContract: PromiseOrValue<string>, fillData: PromiseOrValue<BytesLike>, overrides?: Overrides & {
            from?: PromiseOrValue<string>;
        }): Promise<BigNumber>;
        executeBatch(orders: SignedOrderStruct[], fillContract: PromiseOrValue<string>, fillData: PromiseOrValue<BytesLike>, overrides?: Overrides & {
            from?: PromiseOrValue<string>;
        }): Promise<BigNumber>;
        orderStatus(arg0: PromiseOrValue<BytesLike>, overrides?: CallOverrides): Promise<BigNumber>;
        permitPost(overrides?: CallOverrides): Promise<BigNumber>;
        resolve(order: PromiseOrValue<BytesLike>, overrides?: CallOverrides): Promise<BigNumber>;
    };
    populateTransaction: {
        execute(order: SignedOrderStruct, fillContract: PromiseOrValue<string>, fillData: PromiseOrValue<BytesLike>, overrides?: Overrides & {
            from?: PromiseOrValue<string>;
        }): Promise<PopulatedTransaction>;
        executeBatch(orders: SignedOrderStruct[], fillContract: PromiseOrValue<string>, fillData: PromiseOrValue<BytesLike>, overrides?: Overrides & {
            from?: PromiseOrValue<string>;
        }): Promise<PopulatedTransaction>;
        orderStatus(arg0: PromiseOrValue<BytesLike>, overrides?: CallOverrides): Promise<PopulatedTransaction>;
        permitPost(overrides?: CallOverrides): Promise<PopulatedTransaction>;
        resolve(order: PromiseOrValue<BytesLike>, overrides?: CallOverrides): Promise<PopulatedTransaction>;
    };
}
