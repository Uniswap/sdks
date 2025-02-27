import type { BaseContract, BigNumber, BigNumberish, BytesLike, CallOverrides, ContractTransaction, Overrides, PopulatedTransaction, Signer, utils } from "ethers";
import type { FunctionFragment, Result, EventFragment } from "@ethersproject/abi";
import type { Listener, Provider } from "@ethersproject/providers";
import type { TypedEventFilter, TypedEvent, TypedListener, OnEvent, PromiseOrValue } from "./common";
export type SignedOrderStruct = {
    order: PromiseOrValue<BytesLike>;
    sig: PromiseOrValue<BytesLike>;
};
export type SignedOrderStructOutput = [string, string] & {
    order: string;
    sig: string;
};
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
export interface SwapRouter02ExecutorInterface extends utils.Interface {
    functions: {
        "execute((bytes,bytes),bytes)": FunctionFragment;
        "executeBatch((bytes,bytes)[],bytes)": FunctionFragment;
        "multicall(address[],bytes[])": FunctionFragment;
        "owner()": FunctionFragment;
        "reactorCallback(((address,address,uint256,uint256,address,bytes),(address,uint256,uint256),(address,uint256,address)[],bytes,bytes32)[],bytes)": FunctionFragment;
        "transferOwnership(address)": FunctionFragment;
        "unwrapWETH(address)": FunctionFragment;
        "withdrawETH(address)": FunctionFragment;
    };
    getFunction(nameOrSignatureOrTopic: "execute" | "executeBatch" | "multicall" | "owner" | "reactorCallback" | "transferOwnership" | "unwrapWETH" | "withdrawETH"): FunctionFragment;
    encodeFunctionData(functionFragment: "execute", values: [SignedOrderStruct, PromiseOrValue<BytesLike>]): string;
    encodeFunctionData(functionFragment: "executeBatch", values: [SignedOrderStruct[], PromiseOrValue<BytesLike>]): string;
    encodeFunctionData(functionFragment: "multicall", values: [PromiseOrValue<string>[], PromiseOrValue<BytesLike>[]]): string;
    encodeFunctionData(functionFragment: "owner", values?: undefined): string;
    encodeFunctionData(functionFragment: "reactorCallback", values: [ResolvedOrderStruct[], PromiseOrValue<BytesLike>]): string;
    encodeFunctionData(functionFragment: "transferOwnership", values: [PromiseOrValue<string>]): string;
    encodeFunctionData(functionFragment: "unwrapWETH", values: [PromiseOrValue<string>]): string;
    encodeFunctionData(functionFragment: "withdrawETH", values: [PromiseOrValue<string>]): string;
    decodeFunctionResult(functionFragment: "execute", data: BytesLike): Result;
    decodeFunctionResult(functionFragment: "executeBatch", data: BytesLike): Result;
    decodeFunctionResult(functionFragment: "multicall", data: BytesLike): Result;
    decodeFunctionResult(functionFragment: "owner", data: BytesLike): Result;
    decodeFunctionResult(functionFragment: "reactorCallback", data: BytesLike): Result;
    decodeFunctionResult(functionFragment: "transferOwnership", data: BytesLike): Result;
    decodeFunctionResult(functionFragment: "unwrapWETH", data: BytesLike): Result;
    decodeFunctionResult(functionFragment: "withdrawETH", data: BytesLike): Result;
    events: {
        "OwnershipTransferred(address,address)": EventFragment;
    };
    getEvent(nameOrSignatureOrTopic: "OwnershipTransferred"): EventFragment;
}
export interface OwnershipTransferredEventObject {
    user: string;
    newOwner: string;
}
export type OwnershipTransferredEvent = TypedEvent<[
    string,
    string
], OwnershipTransferredEventObject>;
export type OwnershipTransferredEventFilter = TypedEventFilter<OwnershipTransferredEvent>;
export interface SwapRouter02Executor extends BaseContract {
    connect(signerOrProvider: Signer | Provider | string): this;
    attach(addressOrName: string): this;
    deployed(): Promise<this>;
    interface: SwapRouter02ExecutorInterface;
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
        execute(order: SignedOrderStruct, callbackData: PromiseOrValue<BytesLike>, overrides?: Overrides & {
            from?: PromiseOrValue<string>;
        }): Promise<ContractTransaction>;
        executeBatch(orders: SignedOrderStruct[], callbackData: PromiseOrValue<BytesLike>, overrides?: Overrides & {
            from?: PromiseOrValue<string>;
        }): Promise<ContractTransaction>;
        multicall(tokensToApprove: PromiseOrValue<string>[], multicallData: PromiseOrValue<BytesLike>[], overrides?: Overrides & {
            from?: PromiseOrValue<string>;
        }): Promise<ContractTransaction>;
        owner(overrides?: CallOverrides): Promise<[string]>;
        reactorCallback(arg0: ResolvedOrderStruct[], callbackData: PromiseOrValue<BytesLike>, overrides?: Overrides & {
            from?: PromiseOrValue<string>;
        }): Promise<ContractTransaction>;
        transferOwnership(newOwner: PromiseOrValue<string>, overrides?: Overrides & {
            from?: PromiseOrValue<string>;
        }): Promise<ContractTransaction>;
        unwrapWETH(recipient: PromiseOrValue<string>, overrides?: Overrides & {
            from?: PromiseOrValue<string>;
        }): Promise<ContractTransaction>;
        withdrawETH(recipient: PromiseOrValue<string>, overrides?: Overrides & {
            from?: PromiseOrValue<string>;
        }): Promise<ContractTransaction>;
    };
    execute(order: SignedOrderStruct, callbackData: PromiseOrValue<BytesLike>, overrides?: Overrides & {
        from?: PromiseOrValue<string>;
    }): Promise<ContractTransaction>;
    executeBatch(orders: SignedOrderStruct[], callbackData: PromiseOrValue<BytesLike>, overrides?: Overrides & {
        from?: PromiseOrValue<string>;
    }): Promise<ContractTransaction>;
    multicall(tokensToApprove: PromiseOrValue<string>[], multicallData: PromiseOrValue<BytesLike>[], overrides?: Overrides & {
        from?: PromiseOrValue<string>;
    }): Promise<ContractTransaction>;
    owner(overrides?: CallOverrides): Promise<string>;
    reactorCallback(arg0: ResolvedOrderStruct[], callbackData: PromiseOrValue<BytesLike>, overrides?: Overrides & {
        from?: PromiseOrValue<string>;
    }): Promise<ContractTransaction>;
    transferOwnership(newOwner: PromiseOrValue<string>, overrides?: Overrides & {
        from?: PromiseOrValue<string>;
    }): Promise<ContractTransaction>;
    unwrapWETH(recipient: PromiseOrValue<string>, overrides?: Overrides & {
        from?: PromiseOrValue<string>;
    }): Promise<ContractTransaction>;
    withdrawETH(recipient: PromiseOrValue<string>, overrides?: Overrides & {
        from?: PromiseOrValue<string>;
    }): Promise<ContractTransaction>;
    callStatic: {
        execute(order: SignedOrderStruct, callbackData: PromiseOrValue<BytesLike>, overrides?: CallOverrides): Promise<void>;
        executeBatch(orders: SignedOrderStruct[], callbackData: PromiseOrValue<BytesLike>, overrides?: CallOverrides): Promise<void>;
        multicall(tokensToApprove: PromiseOrValue<string>[], multicallData: PromiseOrValue<BytesLike>[], overrides?: CallOverrides): Promise<void>;
        owner(overrides?: CallOverrides): Promise<string>;
        reactorCallback(arg0: ResolvedOrderStruct[], callbackData: PromiseOrValue<BytesLike>, overrides?: CallOverrides): Promise<void>;
        transferOwnership(newOwner: PromiseOrValue<string>, overrides?: CallOverrides): Promise<void>;
        unwrapWETH(recipient: PromiseOrValue<string>, overrides?: CallOverrides): Promise<void>;
        withdrawETH(recipient: PromiseOrValue<string>, overrides?: CallOverrides): Promise<void>;
    };
    filters: {
        "OwnershipTransferred(address,address)"(user?: PromiseOrValue<string> | null, newOwner?: PromiseOrValue<string> | null): OwnershipTransferredEventFilter;
        OwnershipTransferred(user?: PromiseOrValue<string> | null, newOwner?: PromiseOrValue<string> | null): OwnershipTransferredEventFilter;
    };
    estimateGas: {
        execute(order: SignedOrderStruct, callbackData: PromiseOrValue<BytesLike>, overrides?: Overrides & {
            from?: PromiseOrValue<string>;
        }): Promise<BigNumber>;
        executeBatch(orders: SignedOrderStruct[], callbackData: PromiseOrValue<BytesLike>, overrides?: Overrides & {
            from?: PromiseOrValue<string>;
        }): Promise<BigNumber>;
        multicall(tokensToApprove: PromiseOrValue<string>[], multicallData: PromiseOrValue<BytesLike>[], overrides?: Overrides & {
            from?: PromiseOrValue<string>;
        }): Promise<BigNumber>;
        owner(overrides?: CallOverrides): Promise<BigNumber>;
        reactorCallback(arg0: ResolvedOrderStruct[], callbackData: PromiseOrValue<BytesLike>, overrides?: Overrides & {
            from?: PromiseOrValue<string>;
        }): Promise<BigNumber>;
        transferOwnership(newOwner: PromiseOrValue<string>, overrides?: Overrides & {
            from?: PromiseOrValue<string>;
        }): Promise<BigNumber>;
        unwrapWETH(recipient: PromiseOrValue<string>, overrides?: Overrides & {
            from?: PromiseOrValue<string>;
        }): Promise<BigNumber>;
        withdrawETH(recipient: PromiseOrValue<string>, overrides?: Overrides & {
            from?: PromiseOrValue<string>;
        }): Promise<BigNumber>;
    };
    populateTransaction: {
        execute(order: SignedOrderStruct, callbackData: PromiseOrValue<BytesLike>, overrides?: Overrides & {
            from?: PromiseOrValue<string>;
        }): Promise<PopulatedTransaction>;
        executeBatch(orders: SignedOrderStruct[], callbackData: PromiseOrValue<BytesLike>, overrides?: Overrides & {
            from?: PromiseOrValue<string>;
        }): Promise<PopulatedTransaction>;
        multicall(tokensToApprove: PromiseOrValue<string>[], multicallData: PromiseOrValue<BytesLike>[], overrides?: Overrides & {
            from?: PromiseOrValue<string>;
        }): Promise<PopulatedTransaction>;
        owner(overrides?: CallOverrides): Promise<PopulatedTransaction>;
        reactorCallback(arg0: ResolvedOrderStruct[], callbackData: PromiseOrValue<BytesLike>, overrides?: Overrides & {
            from?: PromiseOrValue<string>;
        }): Promise<PopulatedTransaction>;
        transferOwnership(newOwner: PromiseOrValue<string>, overrides?: Overrides & {
            from?: PromiseOrValue<string>;
        }): Promise<PopulatedTransaction>;
        unwrapWETH(recipient: PromiseOrValue<string>, overrides?: Overrides & {
            from?: PromiseOrValue<string>;
        }): Promise<PopulatedTransaction>;
        withdrawETH(recipient: PromiseOrValue<string>, overrides?: Overrides & {
            from?: PromiseOrValue<string>;
        }): Promise<PopulatedTransaction>;
    };
}
