import { SignatureLike } from '@ethersproject/bytes';
import { TypedDataDomain, TypedDataField } from '@ethersproject/abstract-signer';
import { BigNumberish, BigNumber as BigNumber$1 } from '@ethersproject/bignumber';
import { Event, EventFilter, BaseContract, Signer, utils, BytesLike, PayableOverrides, ContractTransaction, CallOverrides, Overrides, BigNumber, PopulatedTransaction, BigNumberish as BigNumberish$1 } from 'ethers';
import { Listener, Provider, StaticJsonRpcProvider, BaseProvider, Log } from '@ethersproject/providers';
import { FunctionFragment, Result, EventFragment, Interface } from '@ethersproject/abi';
import JSBI from 'jsbi';

interface Witness {
    witness: any;
    witnessTypeName: string;
    witnessType: Record<string, TypedDataField[]>;
}
interface TokenPermissions {
    token: string;
    amount: BigNumberish;
}
interface PermitTransferFrom {
    permitted: TokenPermissions;
    spender: string;
    nonce: BigNumberish;
    deadline: BigNumberish;
}
interface PermitBatchTransferFrom {
    permitted: TokenPermissions[];
    spender: string;
    nonce: BigNumberish;
    deadline: BigNumberish;
}
type PermitTransferFromData = {
    domain: TypedDataDomain;
    types: Record<string, TypedDataField[]>;
    values: PermitTransferFrom;
};
type PermitBatchTransferFromData = {
    domain: TypedDataDomain;
    types: Record<string, TypedDataField[]>;
    values: PermitBatchTransferFrom;
};

interface TypedEvent<TArgsArray extends Array<any> = any, TArgsObject = any> extends Event {
    args: TArgsArray & TArgsObject;
}
interface TypedEventFilter<_TEvent extends TypedEvent> extends EventFilter {
}
interface TypedListener<TEvent extends TypedEvent> {
    (...listenerArg: [...__TypechainArgsArray<TEvent>, TEvent]): void;
}
type __TypechainArgsArray<T> = T extends TypedEvent<infer U> ? U : never;
interface OnEvent<TRes> {
    <TEvent extends TypedEvent>(eventFilter: TypedEventFilter<TEvent>, listener: TypedListener<TEvent>): TRes;
    (eventName: string, listener: Listener): TRes;
}
type PromiseOrValue<T> = T | Promise<T>;

type SignedOrderStruct$1 = {
    order: PromiseOrValue<BytesLike>;
    sig: PromiseOrValue<BytesLike>;
};
interface ExclusiveDutchOrderReactorInterface extends utils.Interface {
    functions: {
        "execute((bytes,bytes))": FunctionFragment;
        "executeBatch((bytes,bytes)[])": FunctionFragment;
        "executeBatchWithCallback((bytes,bytes)[],bytes)": FunctionFragment;
        "executeWithCallback((bytes,bytes),bytes)": FunctionFragment;
        "feeController()": FunctionFragment;
        "owner()": FunctionFragment;
        "permit2()": FunctionFragment;
        "setProtocolFeeController(address)": FunctionFragment;
        "transferOwnership(address)": FunctionFragment;
    };
    getFunction(nameOrSignatureOrTopic: "execute" | "executeBatch" | "executeBatchWithCallback" | "executeWithCallback" | "feeController" | "owner" | "permit2" | "setProtocolFeeController" | "transferOwnership"): FunctionFragment;
    encodeFunctionData(functionFragment: "execute", values: [SignedOrderStruct$1]): string;
    encodeFunctionData(functionFragment: "executeBatch", values: [SignedOrderStruct$1[]]): string;
    encodeFunctionData(functionFragment: "executeBatchWithCallback", values: [SignedOrderStruct$1[], PromiseOrValue<BytesLike>]): string;
    encodeFunctionData(functionFragment: "executeWithCallback", values: [SignedOrderStruct$1, PromiseOrValue<BytesLike>]): string;
    encodeFunctionData(functionFragment: "feeController", values?: undefined): string;
    encodeFunctionData(functionFragment: "owner", values?: undefined): string;
    encodeFunctionData(functionFragment: "permit2", values?: undefined): string;
    encodeFunctionData(functionFragment: "setProtocolFeeController", values: [PromiseOrValue<string>]): string;
    encodeFunctionData(functionFragment: "transferOwnership", values: [PromiseOrValue<string>]): string;
    decodeFunctionResult(functionFragment: "execute", data: BytesLike): Result;
    decodeFunctionResult(functionFragment: "executeBatch", data: BytesLike): Result;
    decodeFunctionResult(functionFragment: "executeBatchWithCallback", data: BytesLike): Result;
    decodeFunctionResult(functionFragment: "executeWithCallback", data: BytesLike): Result;
    decodeFunctionResult(functionFragment: "feeController", data: BytesLike): Result;
    decodeFunctionResult(functionFragment: "owner", data: BytesLike): Result;
    decodeFunctionResult(functionFragment: "permit2", data: BytesLike): Result;
    decodeFunctionResult(functionFragment: "setProtocolFeeController", data: BytesLike): Result;
    decodeFunctionResult(functionFragment: "transferOwnership", data: BytesLike): Result;
    events: {
        "Fill(bytes32,address,address,uint256)": EventFragment;
        "OwnershipTransferred(address,address)": EventFragment;
        "ProtocolFeeControllerSet(address,address)": EventFragment;
    };
    getEvent(nameOrSignatureOrTopic: "Fill"): EventFragment;
    getEvent(nameOrSignatureOrTopic: "OwnershipTransferred"): EventFragment;
    getEvent(nameOrSignatureOrTopic: "ProtocolFeeControllerSet"): EventFragment;
}
interface FillEventObject$1 {
    orderHash: string;
    filler: string;
    swapper: string;
    nonce: BigNumber;
}
type FillEvent$1 = TypedEvent<[
    string,
    string,
    string,
    BigNumber
], FillEventObject$1>;
type FillEventFilter = TypedEventFilter<FillEvent$1>;
interface OwnershipTransferredEventObject {
    user: string;
    newOwner: string;
}
type OwnershipTransferredEvent = TypedEvent<[
    string,
    string
], OwnershipTransferredEventObject>;
type OwnershipTransferredEventFilter = TypedEventFilter<OwnershipTransferredEvent>;
interface ProtocolFeeControllerSetEventObject {
    oldFeeController: string;
    newFeeController: string;
}
type ProtocolFeeControllerSetEvent = TypedEvent<[
    string,
    string
], ProtocolFeeControllerSetEventObject>;
type ProtocolFeeControllerSetEventFilter = TypedEventFilter<ProtocolFeeControllerSetEvent>;
interface ExclusiveDutchOrderReactor extends BaseContract {
    connect(signerOrProvider: Signer | Provider | string): this;
    attach(addressOrName: string): this;
    deployed(): Promise<this>;
    interface: ExclusiveDutchOrderReactorInterface;
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
        execute(order: SignedOrderStruct$1, overrides?: PayableOverrides & {
            from?: PromiseOrValue<string>;
        }): Promise<ContractTransaction>;
        executeBatch(orders: SignedOrderStruct$1[], overrides?: PayableOverrides & {
            from?: PromiseOrValue<string>;
        }): Promise<ContractTransaction>;
        executeBatchWithCallback(orders: SignedOrderStruct$1[], callbackData: PromiseOrValue<BytesLike>, overrides?: PayableOverrides & {
            from?: PromiseOrValue<string>;
        }): Promise<ContractTransaction>;
        executeWithCallback(order: SignedOrderStruct$1, callbackData: PromiseOrValue<BytesLike>, overrides?: PayableOverrides & {
            from?: PromiseOrValue<string>;
        }): Promise<ContractTransaction>;
        feeController(overrides?: CallOverrides): Promise<[string]>;
        owner(overrides?: CallOverrides): Promise<[string]>;
        permit2(overrides?: CallOverrides): Promise<[string]>;
        setProtocolFeeController(_newFeeController: PromiseOrValue<string>, overrides?: Overrides & {
            from?: PromiseOrValue<string>;
        }): Promise<ContractTransaction>;
        transferOwnership(newOwner: PromiseOrValue<string>, overrides?: Overrides & {
            from?: PromiseOrValue<string>;
        }): Promise<ContractTransaction>;
    };
    execute(order: SignedOrderStruct$1, overrides?: PayableOverrides & {
        from?: PromiseOrValue<string>;
    }): Promise<ContractTransaction>;
    executeBatch(orders: SignedOrderStruct$1[], overrides?: PayableOverrides & {
        from?: PromiseOrValue<string>;
    }): Promise<ContractTransaction>;
    executeBatchWithCallback(orders: SignedOrderStruct$1[], callbackData: PromiseOrValue<BytesLike>, overrides?: PayableOverrides & {
        from?: PromiseOrValue<string>;
    }): Promise<ContractTransaction>;
    executeWithCallback(order: SignedOrderStruct$1, callbackData: PromiseOrValue<BytesLike>, overrides?: PayableOverrides & {
        from?: PromiseOrValue<string>;
    }): Promise<ContractTransaction>;
    feeController(overrides?: CallOverrides): Promise<string>;
    owner(overrides?: CallOverrides): Promise<string>;
    permit2(overrides?: CallOverrides): Promise<string>;
    setProtocolFeeController(_newFeeController: PromiseOrValue<string>, overrides?: Overrides & {
        from?: PromiseOrValue<string>;
    }): Promise<ContractTransaction>;
    transferOwnership(newOwner: PromiseOrValue<string>, overrides?: Overrides & {
        from?: PromiseOrValue<string>;
    }): Promise<ContractTransaction>;
    callStatic: {
        execute(order: SignedOrderStruct$1, overrides?: CallOverrides): Promise<void>;
        executeBatch(orders: SignedOrderStruct$1[], overrides?: CallOverrides): Promise<void>;
        executeBatchWithCallback(orders: SignedOrderStruct$1[], callbackData: PromiseOrValue<BytesLike>, overrides?: CallOverrides): Promise<void>;
        executeWithCallback(order: SignedOrderStruct$1, callbackData: PromiseOrValue<BytesLike>, overrides?: CallOverrides): Promise<void>;
        feeController(overrides?: CallOverrides): Promise<string>;
        owner(overrides?: CallOverrides): Promise<string>;
        permit2(overrides?: CallOverrides): Promise<string>;
        setProtocolFeeController(_newFeeController: PromiseOrValue<string>, overrides?: CallOverrides): Promise<void>;
        transferOwnership(newOwner: PromiseOrValue<string>, overrides?: CallOverrides): Promise<void>;
    };
    filters: {
        "Fill(bytes32,address,address,uint256)"(orderHash?: PromiseOrValue<BytesLike> | null, filler?: PromiseOrValue<string> | null, swapper?: PromiseOrValue<string> | null, nonce?: null): FillEventFilter;
        Fill(orderHash?: PromiseOrValue<BytesLike> | null, filler?: PromiseOrValue<string> | null, swapper?: PromiseOrValue<string> | null, nonce?: null): FillEventFilter;
        "OwnershipTransferred(address,address)"(user?: PromiseOrValue<string> | null, newOwner?: PromiseOrValue<string> | null): OwnershipTransferredEventFilter;
        OwnershipTransferred(user?: PromiseOrValue<string> | null, newOwner?: PromiseOrValue<string> | null): OwnershipTransferredEventFilter;
        "ProtocolFeeControllerSet(address,address)"(oldFeeController?: null, newFeeController?: null): ProtocolFeeControllerSetEventFilter;
        ProtocolFeeControllerSet(oldFeeController?: null, newFeeController?: null): ProtocolFeeControllerSetEventFilter;
    };
    estimateGas: {
        execute(order: SignedOrderStruct$1, overrides?: PayableOverrides & {
            from?: PromiseOrValue<string>;
        }): Promise<BigNumber>;
        executeBatch(orders: SignedOrderStruct$1[], overrides?: PayableOverrides & {
            from?: PromiseOrValue<string>;
        }): Promise<BigNumber>;
        executeBatchWithCallback(orders: SignedOrderStruct$1[], callbackData: PromiseOrValue<BytesLike>, overrides?: PayableOverrides & {
            from?: PromiseOrValue<string>;
        }): Promise<BigNumber>;
        executeWithCallback(order: SignedOrderStruct$1, callbackData: PromiseOrValue<BytesLike>, overrides?: PayableOverrides & {
            from?: PromiseOrValue<string>;
        }): Promise<BigNumber>;
        feeController(overrides?: CallOverrides): Promise<BigNumber>;
        owner(overrides?: CallOverrides): Promise<BigNumber>;
        permit2(overrides?: CallOverrides): Promise<BigNumber>;
        setProtocolFeeController(_newFeeController: PromiseOrValue<string>, overrides?: Overrides & {
            from?: PromiseOrValue<string>;
        }): Promise<BigNumber>;
        transferOwnership(newOwner: PromiseOrValue<string>, overrides?: Overrides & {
            from?: PromiseOrValue<string>;
        }): Promise<BigNumber>;
    };
    populateTransaction: {
        execute(order: SignedOrderStruct$1, overrides?: PayableOverrides & {
            from?: PromiseOrValue<string>;
        }): Promise<PopulatedTransaction>;
        executeBatch(orders: SignedOrderStruct$1[], overrides?: PayableOverrides & {
            from?: PromiseOrValue<string>;
        }): Promise<PopulatedTransaction>;
        executeBatchWithCallback(orders: SignedOrderStruct$1[], callbackData: PromiseOrValue<BytesLike>, overrides?: PayableOverrides & {
            from?: PromiseOrValue<string>;
        }): Promise<PopulatedTransaction>;
        executeWithCallback(order: SignedOrderStruct$1, callbackData: PromiseOrValue<BytesLike>, overrides?: PayableOverrides & {
            from?: PromiseOrValue<string>;
        }): Promise<PopulatedTransaction>;
        feeController(overrides?: CallOverrides): Promise<PopulatedTransaction>;
        owner(overrides?: CallOverrides): Promise<PopulatedTransaction>;
        permit2(overrides?: CallOverrides): Promise<PopulatedTransaction>;
        setProtocolFeeController(_newFeeController: PromiseOrValue<string>, overrides?: Overrides & {
            from?: PromiseOrValue<string>;
        }): Promise<PopulatedTransaction>;
        transferOwnership(newOwner: PromiseOrValue<string>, overrides?: Overrides & {
            from?: PromiseOrValue<string>;
        }): Promise<PopulatedTransaction>;
    };
}

type OrderInfoStruct$1 = {
    reactor: PromiseOrValue<string>;
    swapper: PromiseOrValue<string>;
    nonce: PromiseOrValue<BigNumberish$1>;
    deadline: PromiseOrValue<BigNumberish$1>;
    additionalValidationContract: PromiseOrValue<string>;
    additionalValidationData: PromiseOrValue<BytesLike>;
};
type OrderInfoStructOutput$1 = [
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
type InputTokenStruct$1 = {
    token: PromiseOrValue<string>;
    amount: PromiseOrValue<BigNumberish$1>;
    maxAmount: PromiseOrValue<BigNumberish$1>;
};
type InputTokenStructOutput$1 = [string, BigNumber, BigNumber] & {
    token: string;
    amount: BigNumber;
    maxAmount: BigNumber;
};
type OutputTokenStruct$1 = {
    token: PromiseOrValue<string>;
    amount: PromiseOrValue<BigNumberish$1>;
    recipient: PromiseOrValue<string>;
};
type OutputTokenStructOutput$1 = [string, BigNumber, string] & {
    token: string;
    amount: BigNumber;
    recipient: string;
};
type ResolvedOrderStruct$1 = {
    info: OrderInfoStruct$1;
    input: InputTokenStruct$1;
    outputs: OutputTokenStruct$1[];
    sig: PromiseOrValue<BytesLike>;
    hash: PromiseOrValue<BytesLike>;
};
type ResolvedOrderStructOutput$1 = [
    OrderInfoStructOutput$1,
    InputTokenStructOutput$1,
    OutputTokenStructOutput$1[],
    string,
    string
] & {
    info: OrderInfoStructOutput$1;
    input: InputTokenStructOutput$1;
    outputs: OutputTokenStructOutput$1[];
    sig: string;
    hash: string;
};
interface OrderQuoterInterface extends utils.Interface {
    functions: {
        "getReactor(bytes)": FunctionFragment;
        "quote(bytes,bytes)": FunctionFragment;
        "reactorCallback(((address,address,uint256,uint256,address,bytes),(address,uint256,uint256),(address,uint256,address)[],bytes,bytes32)[],bytes)": FunctionFragment;
    };
    getFunction(nameOrSignatureOrTopic: "getReactor" | "quote" | "reactorCallback"): FunctionFragment;
    encodeFunctionData(functionFragment: "getReactor", values: [PromiseOrValue<BytesLike>]): string;
    encodeFunctionData(functionFragment: "quote", values: [PromiseOrValue<BytesLike>, PromiseOrValue<BytesLike>]): string;
    encodeFunctionData(functionFragment: "reactorCallback", values: [ResolvedOrderStruct$1[], PromiseOrValue<BytesLike>]): string;
    decodeFunctionResult(functionFragment: "getReactor", data: BytesLike): Result;
    decodeFunctionResult(functionFragment: "quote", data: BytesLike): Result;
    decodeFunctionResult(functionFragment: "reactorCallback", data: BytesLike): Result;
    events: {};
}
interface OrderQuoter$1 extends BaseContract {
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
        reactorCallback(resolvedOrders: ResolvedOrderStruct$1[], arg1: PromiseOrValue<BytesLike>, overrides?: CallOverrides): Promise<[void]>;
    };
    getReactor(order: PromiseOrValue<BytesLike>, overrides?: CallOverrides): Promise<string>;
    quote(order: PromiseOrValue<BytesLike>, sig: PromiseOrValue<BytesLike>, overrides?: Overrides & {
        from?: PromiseOrValue<string>;
    }): Promise<ContractTransaction>;
    reactorCallback(resolvedOrders: ResolvedOrderStruct$1[], arg1: PromiseOrValue<BytesLike>, overrides?: CallOverrides): Promise<void>;
    callStatic: {
        getReactor(order: PromiseOrValue<BytesLike>, overrides?: CallOverrides): Promise<string>;
        quote(order: PromiseOrValue<BytesLike>, sig: PromiseOrValue<BytesLike>, overrides?: CallOverrides): Promise<ResolvedOrderStructOutput$1>;
        reactorCallback(resolvedOrders: ResolvedOrderStruct$1[], arg1: PromiseOrValue<BytesLike>, overrides?: CallOverrides): Promise<void>;
    };
    filters: {};
    estimateGas: {
        getReactor(order: PromiseOrValue<BytesLike>, overrides?: CallOverrides): Promise<BigNumber>;
        quote(order: PromiseOrValue<BytesLike>, sig: PromiseOrValue<BytesLike>, overrides?: Overrides & {
            from?: PromiseOrValue<string>;
        }): Promise<BigNumber>;
        reactorCallback(resolvedOrders: ResolvedOrderStruct$1[], arg1: PromiseOrValue<BytesLike>, overrides?: CallOverrides): Promise<BigNumber>;
    };
    populateTransaction: {
        getReactor(order: PromiseOrValue<BytesLike>, overrides?: CallOverrides): Promise<PopulatedTransaction>;
        quote(order: PromiseOrValue<BytesLike>, sig: PromiseOrValue<BytesLike>, overrides?: Overrides & {
            from?: PromiseOrValue<string>;
        }): Promise<PopulatedTransaction>;
        reactorCallback(resolvedOrders: ResolvedOrderStruct$1[], arg1: PromiseOrValue<BytesLike>, overrides?: CallOverrides): Promise<PopulatedTransaction>;
    };
}

type OrderInfoStruct = {
    reactor: PromiseOrValue<string>;
    swapper: PromiseOrValue<string>;
    nonce: PromiseOrValue<BigNumberish$1>;
    deadline: PromiseOrValue<BigNumberish$1>;
    preExecutionHook: PromiseOrValue<string>;
    preExecutionHookData: PromiseOrValue<BytesLike>;
    postExecutionHook: PromiseOrValue<string>;
    postExecutionHookData: PromiseOrValue<BytesLike>;
    auctionResolver: PromiseOrValue<string>;
};
type OrderInfoStructOutput = [
    string,
    string,
    BigNumber,
    BigNumber,
    string,
    string,
    string,
    string,
    string
] & {
    reactor: string;
    swapper: string;
    nonce: BigNumber;
    deadline: BigNumber;
    preExecutionHook: string;
    preExecutionHookData: string;
    postExecutionHook: string;
    postExecutionHookData: string;
    auctionResolver: string;
};
type InputTokenStruct = {
    token: PromiseOrValue<string>;
    amount: PromiseOrValue<BigNumberish$1>;
    maxAmount: PromiseOrValue<BigNumberish$1>;
};
type InputTokenStructOutput = [string, BigNumber, BigNumber] & {
    token: string;
    amount: BigNumber;
    maxAmount: BigNumber;
};
type OutputTokenStruct = {
    token: PromiseOrValue<string>;
    amount: PromiseOrValue<BigNumberish$1>;
    recipient: PromiseOrValue<string>;
};
type OutputTokenStructOutput = [string, BigNumber, string] & {
    token: string;
    amount: BigNumber;
    recipient: string;
};
type ResolvedOrderStruct = {
    info: OrderInfoStruct;
    input: InputTokenStruct;
    outputs: OutputTokenStruct[];
    sig: PromiseOrValue<BytesLike>;
    hash: PromiseOrValue<BytesLike>;
    auctionResolver: PromiseOrValue<string>;
    witnessTypeString: PromiseOrValue<string>;
};
type ResolvedOrderStructOutput = [
    OrderInfoStructOutput,
    InputTokenStructOutput,
    OutputTokenStructOutput[],
    string,
    string,
    string,
    string
] & {
    info: OrderInfoStructOutput;
    input: InputTokenStructOutput;
    outputs: OutputTokenStructOutput[];
    sig: string;
    hash: string;
    auctionResolver: string;
    witnessTypeString: string;
};
interface OrderQuoterV4Interface extends utils.Interface {
    functions: {
        "getAuctionResolver(bytes)": FunctionFragment;
        "quote(address,bytes,bytes)": FunctionFragment;
        "reactorCallback(((address,address,uint256,uint256,address,bytes,address,bytes,address),(address,uint256,uint256),(address,uint256,address)[],bytes,bytes32,address,string)[],bytes)": FunctionFragment;
    };
    getFunction(nameOrSignatureOrTopic: "getAuctionResolver" | "quote" | "reactorCallback"): FunctionFragment;
    encodeFunctionData(functionFragment: "getAuctionResolver", values: [PromiseOrValue<BytesLike>]): string;
    encodeFunctionData(functionFragment: "quote", values: [
        PromiseOrValue<string>,
        PromiseOrValue<BytesLike>,
        PromiseOrValue<BytesLike>
    ]): string;
    encodeFunctionData(functionFragment: "reactorCallback", values: [ResolvedOrderStruct[], PromiseOrValue<BytesLike>]): string;
    decodeFunctionResult(functionFragment: "getAuctionResolver", data: BytesLike): Result;
    decodeFunctionResult(functionFragment: "quote", data: BytesLike): Result;
    decodeFunctionResult(functionFragment: "reactorCallback", data: BytesLike): Result;
    events: {};
}
interface OrderQuoterV4 extends BaseContract {
    connect(signerOrProvider: Signer | Provider | string): this;
    attach(addressOrName: string): this;
    deployed(): Promise<this>;
    interface: OrderQuoterV4Interface;
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
        getAuctionResolver(order: PromiseOrValue<BytesLike>, overrides?: CallOverrides): Promise<[string] & {
            auctionResolver: string;
        }>;
        quote(reactor: PromiseOrValue<string>, order: PromiseOrValue<BytesLike>, sig: PromiseOrValue<BytesLike>, overrides?: Overrides & {
            from?: PromiseOrValue<string>;
        }): Promise<ContractTransaction>;
        reactorCallback(resolvedOrders: ResolvedOrderStruct[], arg1: PromiseOrValue<BytesLike>, overrides?: CallOverrides): Promise<[void]>;
    };
    getAuctionResolver(order: PromiseOrValue<BytesLike>, overrides?: CallOverrides): Promise<string>;
    quote(reactor: PromiseOrValue<string>, order: PromiseOrValue<BytesLike>, sig: PromiseOrValue<BytesLike>, overrides?: Overrides & {
        from?: PromiseOrValue<string>;
    }): Promise<ContractTransaction>;
    reactorCallback(resolvedOrders: ResolvedOrderStruct[], arg1: PromiseOrValue<BytesLike>, overrides?: CallOverrides): Promise<void>;
    callStatic: {
        getAuctionResolver(order: PromiseOrValue<BytesLike>, overrides?: CallOverrides): Promise<string>;
        quote(reactor: PromiseOrValue<string>, order: PromiseOrValue<BytesLike>, sig: PromiseOrValue<BytesLike>, overrides?: CallOverrides): Promise<ResolvedOrderStructOutput>;
        reactorCallback(resolvedOrders: ResolvedOrderStruct[], arg1: PromiseOrValue<BytesLike>, overrides?: CallOverrides): Promise<void>;
    };
    filters: {};
    estimateGas: {
        getAuctionResolver(order: PromiseOrValue<BytesLike>, overrides?: CallOverrides): Promise<BigNumber>;
        quote(reactor: PromiseOrValue<string>, order: PromiseOrValue<BytesLike>, sig: PromiseOrValue<BytesLike>, overrides?: Overrides & {
            from?: PromiseOrValue<string>;
        }): Promise<BigNumber>;
        reactorCallback(resolvedOrders: ResolvedOrderStruct[], arg1: PromiseOrValue<BytesLike>, overrides?: CallOverrides): Promise<BigNumber>;
    };
    populateTransaction: {
        getAuctionResolver(order: PromiseOrValue<BytesLike>, overrides?: CallOverrides): Promise<PopulatedTransaction>;
        quote(reactor: PromiseOrValue<string>, order: PromiseOrValue<BytesLike>, sig: PromiseOrValue<BytesLike>, overrides?: Overrides & {
            from?: PromiseOrValue<string>;
        }): Promise<PopulatedTransaction>;
        reactorCallback(resolvedOrders: ResolvedOrderStruct[], arg1: PromiseOrValue<BytesLike>, overrides?: CallOverrides): Promise<PopulatedTransaction>;
    };
}

type SignedOrderStruct = {
    order: PromiseOrValue<BytesLike>;
    sig: PromiseOrValue<BytesLike>;
};
interface RelayOrderReactorInterface extends utils.Interface {
    functions: {
        "PERMIT2()": FunctionFragment;
        "execute((bytes,bytes))": FunctionFragment;
        "execute((bytes,bytes),address)": FunctionFragment;
        "multicall(bytes[])": FunctionFragment;
        "permit(address,address,address,uint256,uint256,uint8,bytes32,bytes32)": FunctionFragment;
        "universalRouter()": FunctionFragment;
    };
    getFunction(nameOrSignatureOrTopic: "PERMIT2" | "execute((bytes,bytes))" | "execute((bytes,bytes),address)" | "multicall" | "permit" | "universalRouter"): FunctionFragment;
    encodeFunctionData(functionFragment: "PERMIT2", values?: undefined): string;
    encodeFunctionData(functionFragment: "execute((bytes,bytes))", values: [SignedOrderStruct]): string;
    encodeFunctionData(functionFragment: "execute((bytes,bytes),address)", values: [SignedOrderStruct, PromiseOrValue<string>]): string;
    encodeFunctionData(functionFragment: "multicall", values: [PromiseOrValue<BytesLike>[]]): string;
    encodeFunctionData(functionFragment: "permit", values: [
        PromiseOrValue<string>,
        PromiseOrValue<string>,
        PromiseOrValue<string>,
        PromiseOrValue<BigNumberish$1>,
        PromiseOrValue<BigNumberish$1>,
        PromiseOrValue<BigNumberish$1>,
        PromiseOrValue<BytesLike>,
        PromiseOrValue<BytesLike>
    ]): string;
    encodeFunctionData(functionFragment: "universalRouter", values?: undefined): string;
    decodeFunctionResult(functionFragment: "PERMIT2", data: BytesLike): Result;
    decodeFunctionResult(functionFragment: "execute((bytes,bytes))", data: BytesLike): Result;
    decodeFunctionResult(functionFragment: "execute((bytes,bytes),address)", data: BytesLike): Result;
    decodeFunctionResult(functionFragment: "multicall", data: BytesLike): Result;
    decodeFunctionResult(functionFragment: "permit", data: BytesLike): Result;
    decodeFunctionResult(functionFragment: "universalRouter", data: BytesLike): Result;
    events: {
        "Relay(bytes32,address,address,uint256)": EventFragment;
    };
    getEvent(nameOrSignatureOrTopic: "Relay"): EventFragment;
}
interface RelayEventObject {
    orderHash: string;
    filler: string;
    swapper: string;
    nonce: BigNumber;
}
type RelayEvent = TypedEvent<[
    string,
    string,
    string,
    BigNumber
], RelayEventObject>;
type RelayEventFilter = TypedEventFilter<RelayEvent>;
interface RelayOrderReactor extends BaseContract {
    connect(signerOrProvider: Signer | Provider | string): this;
    attach(addressOrName: string): this;
    deployed(): Promise<this>;
    interface: RelayOrderReactorInterface;
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
        PERMIT2(overrides?: CallOverrides): Promise<[string]>;
        "execute((bytes,bytes))"(signedOrder: SignedOrderStruct, overrides?: Overrides & {
            from?: PromiseOrValue<string>;
        }): Promise<ContractTransaction>;
        "execute((bytes,bytes),address)"(signedOrder: SignedOrderStruct, feeRecipient: PromiseOrValue<string>, overrides?: Overrides & {
            from?: PromiseOrValue<string>;
        }): Promise<ContractTransaction>;
        multicall(data: PromiseOrValue<BytesLike>[], overrides?: Overrides & {
            from?: PromiseOrValue<string>;
        }): Promise<ContractTransaction>;
        permit(token: PromiseOrValue<string>, owner: PromiseOrValue<string>, spender: PromiseOrValue<string>, amount: PromiseOrValue<BigNumberish$1>, deadline: PromiseOrValue<BigNumberish$1>, v: PromiseOrValue<BigNumberish$1>, r: PromiseOrValue<BytesLike>, s: PromiseOrValue<BytesLike>, overrides?: Overrides & {
            from?: PromiseOrValue<string>;
        }): Promise<ContractTransaction>;
        universalRouter(overrides?: CallOverrides): Promise<[string]>;
    };
    PERMIT2(overrides?: CallOverrides): Promise<string>;
    "execute((bytes,bytes))"(signedOrder: SignedOrderStruct, overrides?: Overrides & {
        from?: PromiseOrValue<string>;
    }): Promise<ContractTransaction>;
    "execute((bytes,bytes),address)"(signedOrder: SignedOrderStruct, feeRecipient: PromiseOrValue<string>, overrides?: Overrides & {
        from?: PromiseOrValue<string>;
    }): Promise<ContractTransaction>;
    multicall(data: PromiseOrValue<BytesLike>[], overrides?: Overrides & {
        from?: PromiseOrValue<string>;
    }): Promise<ContractTransaction>;
    permit(token: PromiseOrValue<string>, owner: PromiseOrValue<string>, spender: PromiseOrValue<string>, amount: PromiseOrValue<BigNumberish$1>, deadline: PromiseOrValue<BigNumberish$1>, v: PromiseOrValue<BigNumberish$1>, r: PromiseOrValue<BytesLike>, s: PromiseOrValue<BytesLike>, overrides?: Overrides & {
        from?: PromiseOrValue<string>;
    }): Promise<ContractTransaction>;
    universalRouter(overrides?: CallOverrides): Promise<string>;
    callStatic: {
        PERMIT2(overrides?: CallOverrides): Promise<string>;
        "execute((bytes,bytes))"(signedOrder: SignedOrderStruct, overrides?: CallOverrides): Promise<void>;
        "execute((bytes,bytes),address)"(signedOrder: SignedOrderStruct, feeRecipient: PromiseOrValue<string>, overrides?: CallOverrides): Promise<void>;
        multicall(data: PromiseOrValue<BytesLike>[], overrides?: CallOverrides): Promise<string[]>;
        permit(token: PromiseOrValue<string>, owner: PromiseOrValue<string>, spender: PromiseOrValue<string>, amount: PromiseOrValue<BigNumberish$1>, deadline: PromiseOrValue<BigNumberish$1>, v: PromiseOrValue<BigNumberish$1>, r: PromiseOrValue<BytesLike>, s: PromiseOrValue<BytesLike>, overrides?: CallOverrides): Promise<void>;
        universalRouter(overrides?: CallOverrides): Promise<string>;
    };
    filters: {
        "Relay(bytes32,address,address,uint256)"(orderHash?: PromiseOrValue<BytesLike> | null, filler?: PromiseOrValue<string> | null, swapper?: PromiseOrValue<string> | null, nonce?: null): RelayEventFilter;
        Relay(orderHash?: PromiseOrValue<BytesLike> | null, filler?: PromiseOrValue<string> | null, swapper?: PromiseOrValue<string> | null, nonce?: null): RelayEventFilter;
    };
    estimateGas: {
        PERMIT2(overrides?: CallOverrides): Promise<BigNumber>;
        "execute((bytes,bytes))"(signedOrder: SignedOrderStruct, overrides?: Overrides & {
            from?: PromiseOrValue<string>;
        }): Promise<BigNumber>;
        "execute((bytes,bytes),address)"(signedOrder: SignedOrderStruct, feeRecipient: PromiseOrValue<string>, overrides?: Overrides & {
            from?: PromiseOrValue<string>;
        }): Promise<BigNumber>;
        multicall(data: PromiseOrValue<BytesLike>[], overrides?: Overrides & {
            from?: PromiseOrValue<string>;
        }): Promise<BigNumber>;
        permit(token: PromiseOrValue<string>, owner: PromiseOrValue<string>, spender: PromiseOrValue<string>, amount: PromiseOrValue<BigNumberish$1>, deadline: PromiseOrValue<BigNumberish$1>, v: PromiseOrValue<BigNumberish$1>, r: PromiseOrValue<BytesLike>, s: PromiseOrValue<BytesLike>, overrides?: Overrides & {
            from?: PromiseOrValue<string>;
        }): Promise<BigNumber>;
        universalRouter(overrides?: CallOverrides): Promise<BigNumber>;
    };
    populateTransaction: {
        PERMIT2(overrides?: CallOverrides): Promise<PopulatedTransaction>;
        "execute((bytes,bytes))"(signedOrder: SignedOrderStruct, overrides?: Overrides & {
            from?: PromiseOrValue<string>;
        }): Promise<PopulatedTransaction>;
        "execute((bytes,bytes),address)"(signedOrder: SignedOrderStruct, feeRecipient: PromiseOrValue<string>, overrides?: Overrides & {
            from?: PromiseOrValue<string>;
        }): Promise<PopulatedTransaction>;
        multicall(data: PromiseOrValue<BytesLike>[], overrides?: Overrides & {
            from?: PromiseOrValue<string>;
        }): Promise<PopulatedTransaction>;
        permit(token: PromiseOrValue<string>, owner: PromiseOrValue<string>, spender: PromiseOrValue<string>, amount: PromiseOrValue<BigNumberish$1>, deadline: PromiseOrValue<BigNumberish$1>, v: PromiseOrValue<BigNumberish$1>, r: PromiseOrValue<BytesLike>, s: PromiseOrValue<BytesLike>, overrides?: Overrides & {
            from?: PromiseOrValue<string>;
        }): Promise<PopulatedTransaction>;
        universalRouter(overrides?: CallOverrides): Promise<PopulatedTransaction>;
    };
}

declare enum OrderValidation {
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
interface ResolvedUniswapXOrder {
    input: TokenAmount;
    outputs: TokenAmount[];
}
interface UniswapXOrderQuote {
    validation: OrderValidation;
    quote: ResolvedUniswapXOrder | undefined;
}
interface ResolvedRelayOrder {
    fee: ResolvedRelayFee;
}
interface RelayOrderQuote {
    validation: OrderValidation;
    quote: ResolvedRelayOrder | undefined;
}
type LegacyOrderInfoTypes = DutchOrderInfo | UnsignedV2DutchOrderInfo | CosignedV2DutchOrderInfo | UnsignedV3DutchOrderInfo | CosignedV3DutchOrderInfo | UnsignedPriorityOrderInfo | CosignedPriorityOrderInfo;
interface SignedUniswapXOrder {
    order: UniswapXOrder;
    signature: string;
}
interface SignedRelayOrder {
    order: RelayOrder;
    signature: string;
}
interface SignedOrder {
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
declare class UniswapXOrderQuoter implements OrderQuoter<SignedUniswapXOrder, UniswapXOrderQuote> {
    protected provider: StaticJsonRpcProvider;
    protected chainId: number;
    protected quoter: OrderQuoter$1;
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
declare class RelayOrderQuoter implements OrderQuoter<SignedRelayOrder, RelayOrderQuote> {
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
/**
 * V4 resolved order from quoter
 */
interface ResolvedV4Order {
    input: TokenAmount;
    outputs: TokenAmount[];
    auctionResolver: string;
    witnessTypeString: string;
}
/**
 * V4 order quote result
 */
interface V4OrderQuote {
    validation: OrderValidation;
    quote: ResolvedV4Order | undefined;
}
/**
 * Signed V4 order (Hybrid orders)
 */
interface SignedV4Order {
    order: UniswapXOrder;
    signature: string;
}
/**
 * V4 order quoter for Hybrid orders
 */
declare class V4OrderQuoter implements OrderQuoter<SignedV4Order, V4OrderQuote> {
    protected provider: StaticJsonRpcProvider;
    protected chainId: number;
    protected quoter: OrderQuoterV4;
    constructor(provider: StaticJsonRpcProvider, chainId: number, orderQuoterAddress?: string);
    quote(order: SignedV4Order): Promise<V4OrderQuote>;
    quoteBatch(orders: SignedV4Order[]): Promise<V4OrderQuote[]>;
    private getValidations;
    private getMulticallResults;
    get orderQuoterAddress(): string;
}

type BlockOverrides = {
    number?: string;
} | undefined;
interface OffChainOrder {
    chainId: number;
    /**
     * Returns the abi encoded order
     * @return The abi encoded serialized order which can be submitted on-chain
     */
    serialize(): string;
    /**
     * Recovers the given signature, returning the address which created it
     *  * @param signature The signature to recover
     *  * @returns address The address which created the signature
     */
    getSigner(signature: SignatureLike): string;
    /**
     * Returns the data for generating the maker EIP-712 permit signature
     * @return The data for generating the maker EIP-712 permit signature
     */
    permitData(): PermitTransferFromData | PermitBatchTransferFromData;
    /**
     * Returns the order hash
     * @return The order hash which is used as a key on-chain
     */
    hash(): string;
    /**
     * Returns any block overrides to be applied when quoting the order on chain
     * @return The block overrides
     */
    get blockOverrides(): BlockOverrides;
}
type TokenAmount = {
    readonly token: string;
    readonly amount: BigNumber;
};
type ResolvedRelayFee = {
    readonly token: string;
    readonly amount: BigNumber;
};
type OrderInfo = {
    reactor: string;
    swapper: string;
    nonce: BigNumber;
    deadline: number;
    additionalValidationContract: string;
    additionalValidationData: string;
};
type OrderResolutionOptions = {
    timestamp: number;
    filler?: string;
};
type PriorityOrderResolutionOptions = {
    priorityFee: BigNumber;
    currentBlock?: BigNumber;
};
type V3OrderResolutionOptions = {
    currentBlock: number;
    filler?: string;
};
type DutchOutput = {
    readonly token: string;
    readonly startAmount: BigNumber;
    readonly endAmount: BigNumber;
    readonly recipient: string;
};
type DutchOutputJSON = Omit<DutchOutput, "startAmount" | "endAmount"> & {
    startAmount: string;
    endAmount: string;
};
type DutchInput = {
    readonly token: string;
    readonly startAmount: BigNumber;
    readonly endAmount: BigNumber;
};
type DutchInputJSON = Omit<DutchInput, "startAmount" | "endAmount"> & {
    startAmount: string;
    endAmount: string;
};
type CosignerData = {
    decayStartTime: number;
    decayEndTime: number;
    exclusiveFiller: string;
    exclusivityOverrideBps: BigNumber;
    inputOverride: BigNumber;
    outputOverrides: BigNumber[];
};
type CosignerDataJSON = {
    decayStartTime: number;
    decayEndTime: number;
    exclusiveFiller: string;
    exclusivityOverrideBps: number;
    inputOverride: string;
    outputOverrides: string[];
};
type PriorityInput = {
    readonly token: string;
    readonly amount: BigNumber;
    readonly mpsPerPriorityFeeWei: BigNumber;
};
type PriorityOutput = PriorityInput & {
    readonly recipient: string;
};
type PriorityInputJSON = Omit<PriorityInput, "amount" | "mpsPerPriorityFeeWei"> & {
    amount: string;
    mpsPerPriorityFeeWei: string;
};
type PriorityOutputJSON = PriorityInputJSON & {
    recipient: string;
};
type V3DutchInput = {
    readonly token: string;
    readonly startAmount: BigNumber;
    readonly curve: NonlinearDutchDecay;
    readonly maxAmount: BigNumber;
    readonly adjustmentPerGweiBaseFee: BigNumber;
};
type V3DutchInputJSON = Omit<V3DutchInput, "startAmount" | "curve" | "maxAmount" | "adjustmentPerGweiBaseFee"> & {
    startAmount: string;
    curve: NonlinearDutchDecayJSON;
    maxAmount: string;
    adjustmentPerGweiBaseFee: string;
};
type NonlinearDutchDecay = {
    relativeBlocks: number[];
    relativeAmounts: bigint[];
};
type EncodedNonlinearDutchDecay = {
    relativeBlocks: BigNumber;
    relativeAmounts: string[];
};
type EncodedV3DutchInput = Omit<V3DutchInput, "curve"> & {
    curve: EncodedNonlinearDutchDecay;
};
type EncodedV3DutchOutput = Omit<V3DutchOutput, "curve"> & {
    curve: EncodedNonlinearDutchDecay;
};
type NonlinearDutchDecayJSON = {
    relativeBlocks: number[];
    relativeAmounts: string[];
};
type V3DutchOutput = {
    readonly token: string;
    readonly startAmount: BigNumber;
    readonly curve: NonlinearDutchDecay;
    readonly recipient: string;
    readonly minAmount: BigNumber;
    readonly adjustmentPerGweiBaseFee: BigNumber;
};
type V3DutchOutputJSON = Omit<V3DutchOutput, "startAmount" | "curve" | "minAmount" | "adjustmentPerGweiBaseFee"> & {
    startAmount: string;
    curve: NonlinearDutchDecayJSON;
    minAmount: string;
    adjustmentPerGweiBaseFee: string;
};

declare enum ValidationType {
    None = 0,
    ExclusiveFiller = 1
}
type ExclusiveFillerData = {
    filler: string;
    lastExclusiveTimestamp: number;
};
type ValidationInfo = {
    additionalValidationContract: string;
    additionalValidationData: string;
};
type CustomOrderValidation = {
    type: ValidationType.None;
    data: null;
} | {
    type: ValidationType.ExclusiveFiller;
    data: ExclusiveFillerData;
};
declare function parseValidation(info: OrderInfo): CustomOrderValidation;
declare function parseExclusiveFillerData(encoded: string): CustomOrderValidation;
declare function encodeExclusiveFillerData(fillerAddress: string, lastExclusiveTimestamp: number, chainId?: number, additionalValidationContractAddress?: string): ValidationInfo;

declare function id(text: string): string;
type DutchOrderInfo = OrderInfo & {
    decayStartTime: number;
    decayEndTime: number;
    exclusiveFiller: string;
    exclusivityOverrideBps: BigNumber;
    input: DutchInput;
    outputs: DutchOutput[];
};
type DutchOrderInfoJSON = Omit<DutchOrderInfo, "nonce" | "input" | "outputs" | "exclusivityOverrideBps"> & {
    nonce: string;
    exclusivityOverrideBps: string;
    input: DutchInputJSON;
    outputs: DutchOutputJSON[];
};
declare class DutchOrder implements OffChainOrder {
    readonly info: DutchOrderInfo;
    readonly chainId: number;
    readonly _permit2Address?: string | undefined;
    permit2Address: string;
    constructor(info: DutchOrderInfo, chainId: number, _permit2Address?: string | undefined);
    static fromJSON(json: DutchOrderInfoJSON, chainId: number, _permit2Address?: string): DutchOrder;
    static parse(encoded: string, chainId: number, permit2?: string): DutchOrder;
    toJSON(): DutchOrderInfoJSON & {
        permit2Address: string;
        chainId: number;
    };
    /**
     * @inheritdoc order
     */
    get blockOverrides(): BlockOverrides;
    /**
     * @inheritdoc order
     */
    serialize(): string;
    /**
     * @inheritDoc OrderInterface
     */
    getSigner(signature: SignatureLike): string;
    /**
     * @inheritDoc OrderInterface
     */
    permitData(): PermitTransferFromData;
    /**
     * @inheritDoc OrderInterface
     */
    hash(): string;
    /**
     * Returns the resolved order with the given options
     * @return The resolved order
     */
    resolve(options: OrderResolutionOptions): ResolvedUniswapXOrder;
    /**
     * Returns the parsed validation
     * @return The parsed validation data for the order
     */
    get validation(): CustomOrderValidation;
    private toPermit;
    private witnessInfo;
    private witness;
}

declare enum ChainId {
    MAINNET = 1,
    GOERLI = 5,
    SEPOLIA = 11155111,
    OPTIMISM = 10,
    OPTIMISM_GOERLI = 420,
    OPTIMISM_SEPOLIA = 11155420,
    ARBITRUM_ONE = 42161,
    ARBITRUM_GOERLI = 421613,
    ARBITRUM_SEPOLIA = 421614,
    POLYGON = 137,
    POLYGON_MUMBAI = 80001,
    CELO = 42220,
    CELO_ALFAJORES = 44787,
    GNOSIS = 100,
    MOONBEAM = 1284,
    BNB = 56,
    AVALANCHE = 43114,
    BASE_GOERLI = 84531,
    BASE_SEPOLIA = 84532,
    BASE = 8453,
    ZORA = 7777777,
    ZORA_SEPOLIA = 999999999,
    ROOTSTOCK = 30,
    BLAST = 81457,
    ZKSYNC = 324,
    WORLDCHAIN = 480,
    UNICHAIN_SEPOLIA = 1301,
    UNICHAIN = 130,
    MONAD_TESTNET = 10143,
    SONEIUM = 1868,
    MONAD = 143,
    XLAYER = 196
}

type BigintIsh = JSBI | string | number;
declare enum TradeType {
    EXACT_INPUT = 0,
    EXACT_OUTPUT = 1
}
declare enum Rounding {
    ROUND_DOWN = 0,
    ROUND_HALF_UP = 1,
    ROUND_UP = 2
}

/**
 * Represents an ERC20 token with a unique address and some metadata.
 */
declare class Token extends BaseCurrency {
    readonly isNative: false;
    readonly isToken: true;
    /**
     * The contract address on the chain on which this token lives
     */
    readonly address: string;
    /**
     * Relevant for fee-on-transfer (FOT) token taxes,
     * Not every ERC20 token is FOT token, so this field is optional
     */
    readonly buyFeeBps?: BigNumber$1;
    readonly sellFeeBps?: BigNumber$1;
    /**
     *
     * @param chainId {@link BaseCurrency#chainId}
     * @param address The contract address on the chain on which this token lives
     * @param decimals {@link BaseCurrency#decimals}
     * @param symbol {@link BaseCurrency#symbol}
     * @param name {@link BaseCurrency#name}
     * @param bypassChecksum If true it only checks for length === 42, startsWith 0x and contains only hex characters
     * @param buyFeeBps Buy fee tax for FOT tokens, in basis points
     * @param sellFeeBps Sell fee tax for FOT tokens, in basis points
     */
    constructor(chainId: number, address: string, decimals: number, symbol?: string, name?: string, bypassChecksum?: boolean, buyFeeBps?: BigNumber$1, sellFeeBps?: BigNumber$1);
    /**
     * Returns true if the two tokens are equivalent, i.e. have the same chainId and address.
     * @param other other token to compare
     */
    equals(other: Currency): boolean;
    /**
     * Returns true if the address of this token sorts before the address of the other token
     * @param other other token to compare
     * @throws if the tokens have the same address
     * @throws if the tokens are on different chains
     */
    sortsBefore(other: Token): boolean;
    /**
     * Return this token, which does not need to be wrapped
     */
    get wrapped(): Token;
}

/**
 * A currency is any fungible financial instrument, including Ether, all ERC20 tokens, and other chain-native currencies
 */
declare abstract class BaseCurrency {
    /**
     * Returns whether the currency is native to the chain and must be wrapped (e.g. Ether)
     */
    abstract readonly isNative: boolean;
    /**
     * Returns whether the currency is a token that is usable in Uniswap without wrapping
     */
    abstract readonly isToken: boolean;
    /**
     * The chain ID on which this currency resides
     */
    readonly chainId: number;
    /**
     * The decimals used in representing currency amounts
     */
    readonly decimals: number;
    /**
     * The symbol of the currency, i.e. a short textual non-unique identifier
     */
    readonly symbol?: string;
    /**
     * The name of the currency, i.e. a descriptive textual non-unique identifier
     */
    readonly name?: string;
    /**
     * Constructs an instance of the base class `BaseCurrency`.
     * @param chainId the chain ID on which this currency resides
     * @param decimals decimals of the currency
     * @param symbol symbol of the currency
     * @param name of the currency
     */
    protected constructor(chainId: number, decimals: number, symbol?: string, name?: string);
    /**
     * Returns whether this currency is functionally equivalent to the other currency
     * @param other the other currency
     */
    abstract equals(other: Currency): boolean;
    /**
     * Return the wrapped version of this currency that can be used with the Uniswap contracts. Currencies must
     * implement this to be used in Uniswap
     */
    abstract get wrapped(): Token;
}

/**
 * Represents the native currency of the chain on which it resides, e.g.
 */
declare abstract class NativeCurrency extends BaseCurrency {
    readonly isNative: true;
    readonly isToken: false;
}

type Currency = NativeCurrency | Token;

declare class Fraction {
    readonly numerator: JSBI;
    readonly denominator: JSBI;
    constructor(numerator: BigintIsh, denominator?: BigintIsh);
    private static tryParseFraction;
    get quotient(): JSBI;
    get remainder(): Fraction;
    invert(): Fraction;
    add(other: Fraction | BigintIsh): Fraction;
    subtract(other: Fraction | BigintIsh): Fraction;
    lessThan(other: Fraction | BigintIsh): boolean;
    equalTo(other: Fraction | BigintIsh): boolean;
    greaterThan(other: Fraction | BigintIsh): boolean;
    multiply(other: Fraction | BigintIsh): Fraction;
    divide(other: Fraction | BigintIsh): Fraction;
    toSignificant(significantDigits: number, format?: object, rounding?: Rounding): string;
    toFixed(decimalPlaces: number, format?: object, rounding?: Rounding): string;
    /**
     * Helper method for converting any super class back to a fraction
     */
    get asFraction(): Fraction;
}

declare class CurrencyAmount<T extends Currency> extends Fraction {
    readonly currency: T;
    readonly decimalScale: JSBI;
    /**
     * Returns a new currency amount instance from the unitless amount of token, i.e. the raw amount
     * @param currency the currency in the amount
     * @param rawAmount the raw token or ether amount
     */
    static fromRawAmount<T extends Currency>(currency: T, rawAmount: BigintIsh): CurrencyAmount<T>;
    /**
     * Construct a currency amount with a denominator that is not equal to 1
     * @param currency the currency
     * @param numerator the numerator of the fractional token amount
     * @param denominator the denominator of the fractional token amount
     */
    static fromFractionalAmount<T extends Currency>(currency: T, numerator: BigintIsh, denominator: BigintIsh): CurrencyAmount<T>;
    protected constructor(currency: T, numerator: BigintIsh, denominator?: BigintIsh);
    add(other: CurrencyAmount<T>): CurrencyAmount<T>;
    subtract(other: CurrencyAmount<T>): CurrencyAmount<T>;
    multiply(other: Fraction | BigintIsh): CurrencyAmount<T>;
    divide(other: Fraction | BigintIsh): CurrencyAmount<T>;
    toSignificant(significantDigits?: number, format?: object, rounding?: Rounding): string;
    toFixed(decimalPlaces?: number, format?: object, rounding?: Rounding): string;
    toExact(format?: object): string;
    get wrapped(): CurrencyAmount<Token>;
}

declare class Price<TBase extends Currency, TQuote extends Currency> extends Fraction {
    readonly baseCurrency: TBase;
    readonly quoteCurrency: TQuote;
    readonly scalar: Fraction;
    /**
     * Construct a price, either with the base and quote currency amount, or the
     * @param args
     */
    constructor(...args: [TBase, TQuote, BigintIsh, BigintIsh] | [{
        baseAmount: CurrencyAmount<TBase>;
        quoteAmount: CurrencyAmount<TQuote>;
    }]);
    /**
     * Flip the price, switching the base and quote currency
     */
    invert(): Price<TQuote, TBase>;
    /**
     * Multiply the price by another price, returning a new price. The other price must have the same base currency as this price's quote currency
     * @param other the other price
     */
    multiply<TOtherQuote extends Currency>(other: Price<TQuote, TOtherQuote>): Price<TBase, TOtherQuote>;
    /**
     * Return the amount of quote currency corresponding to a given amount of the base currency
     * @param currencyAmount the amount of base currency to quote against the price
     */
    quote(currencyAmount: CurrencyAmount<TBase>): CurrencyAmount<TQuote>;
    /**
     * Get the value scaled by decimals for formatting
     * @private
     */
    private get adjustedForDecimals();
    toSignificant(significantDigits?: number, format?: object, rounding?: Rounding): string;
    toFixed(decimalPlaces?: number, format?: object, rounding?: Rounding): string;
}

type AddressMap = {
    readonly [key: number]: string;
};
declare function constructSameAddressMap<T>(address: T, additionalNetworks?: ChainId[]): {
    [chainId: number]: T;
};
declare const PERMIT2_MAPPING: AddressMap;
declare const UNISWAPX_ORDER_QUOTER_MAPPING: AddressMap;
declare const UNISWAPX_V4_ORDER_QUOTER_MAPPING: AddressMap;
declare const UNISWAPX_V4_TOKEN_TRANSFER_HOOK_MAPPING: AddressMap;
declare const EXCLUSIVE_FILLER_VALIDATION_MAPPING: AddressMap;
declare enum KNOWN_EVENT_SIGNATURES {
    ERC20_TRANSFER = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef"
}
declare enum OrderType {
    Dutch = "Dutch",
    Relay = "Relay",
    Dutch_V2 = "Dutch_V2",
    Dutch_V3 = "Dutch_V3",
    Limit = "Limit",
    Priority = "Priority",
    V4 = "V4",
    Hybrid = "Hybrid"
}
type Reactors = Partial<{
    [key in OrderType]: string;
}>;
type ReactorMapping = {
    readonly [key: number]: Reactors;
};
type ReverseReactorMapping = {
    [key: string]: {
        orderType: OrderType;
    };
};
declare const REACTOR_ADDRESS_MAPPING: ReactorMapping;
declare const REACTOR_CONTRACT_MAPPING: ReactorMapping;
declare const multicallAddressOn: (chainId?: number) => "0xF9cda624FBC7e059355ce98a31693d299FACd963" | "0xcA11bde05977b3631167028862bE2a173976CA11";
declare const RELAY_SENTINEL_RECIPIENT = "0x0000000000000000000000000000000000000000";
declare const REVERSE_REACTOR_MAPPING: ReverseReactorMapping;
declare const BPS = 10000;
declare const MPS: BigNumber;
declare enum PermissionedTokenInterface {
    DSTokenInterface = "DSTokenInterface",
    ISuperstateTokenV4 = "ISuperstateTokenV4"
}
declare enum PermissionedTokenProxyType {
    None = "None",
    Standard = "Standard",// for the current Proxy
    ERC1967 = "ERC1967"
}
type PermissionedToken = {
    address: string;
    chainId: ChainId;
    symbol: string;
    proxyType?: PermissionedTokenProxyType;
    interface: PermissionedTokenInterface;
};
declare const PERMISSIONED_TOKENS: PermissionedToken[];
/**
 * V4 Resolver address mapping for resolver-based order type detection
 * Maps chainId to resolver contract addresses
 */
type ResolverMapping = {
    readonly [chainId: number]: string;
};
declare const HYBRID_RESOLVER_ADDRESS_MAPPING: ResolverMapping;
type ReverseResolverMapping = {
    [address: string]: {
        orderType: OrderType;
    };
};
declare const REVERSE_RESOLVER_MAPPING: ReverseResolverMapping;

/**
 * UniswapX order validator
 */
declare class OrderValidator extends UniswapXOrderQuoter {
    validate(order: SignedUniswapXOrder): Promise<OrderValidation>;
    validateBatch(orders: SignedUniswapXOrder[]): Promise<OrderValidation[]>;
}
declare class RelayOrderValidator extends RelayOrderQuoter {
    validate(order: SignedRelayOrder): Promise<OrderValidation>;
    validateBatch(orders: SignedRelayOrder[]): Promise<OrderValidation[]>;
}
/**
 * V4 order validator for Hybrid orders
 */
declare class V4OrderValidator extends V4OrderQuoter {
    validate(order: SignedV4Order): Promise<OrderValidation>;
    validateBatch(orders: SignedV4Order[]): Promise<OrderValidation[]>;
}

/**
 * Helper to track Permit2 nonces for addresses
 */
declare class NonceManager {
    private provider;
    private permit2;
    private currentWord;
    private currentBitmap;
    constructor(provider: BaseProvider, chainId: number, permit2Address?: string);
    /**
     * Finds the next unused nonce and returns it
     * Marks the nonce as used so it won't be returned again from this instance
     * NOTE: if any nonce usages are in-flight and created outside of this instance,
     * this function will not know about them and will return duplicates
     */
    useNonce(address: string): Promise<BigNumber>;
    isUsed(address: string, nonce: BigNumber): Promise<boolean>;
    private getNextOpenWord;
}
interface SplitNonce {
    word: BigNumber;
    bitPos: BigNumber;
}
declare function splitNonce(nonce: BigNumber): SplitNonce;
declare function buildNonce(word: BigNumber, bitPos: number): BigNumber;
declare function getFirstUnsetBit(bitmap: BigNumber): number;
declare function setBit(bitmap: BigNumber, bitPos: number): BigNumber;
interface CancelParams {
    word: BigNumber;
    mask: BigNumber;
}
declare function getCancelSingleParams(nonceToCancel: BigNumber): CancelParams;
declare function getCancelMultipleParams(noncesToCancel: BigNumber[]): CancelParams[];

interface FillEventObject {
    orderHash: string;
    filler: string;
    swapper: string;
    nonce: BigNumber;
}
type FillEvent = TypedEvent<[
    string,
    string,
    string,
    BigNumber
], FillEventObject>;

type TokenTransfer = {
    token: string;
    amount: BigNumber;
};
interface FillData {
    orderHash: string;
    filler: string;
    nonce: BigNumber;
    swapper: string;
}
interface FillInfo extends FillData {
    blockNumber: number;
    txHash: string;
    inputs: TokenTransfer[];
    outputs: TokenTransfer[];
}
/**
 * Helper for watching events
 */
declare abstract class EventWatcher<TReactor extends BaseContract> {
    protected reactor: TReactor;
    constructor(reactor: TReactor);
    abstract getFillLogs(fromBlock: number, toBlock?: number): Promise<FillEvent[]>;
    abstract onFill(callback: (fillData: FillData, event: Event) => void): void;
    getFillEvents(fromBlock: number, toBlock?: number): Promise<FillData[]>;
    getFillInfo(fromBlock: number, toBlock?: number): Promise<FillInfo[]>;
    getTokenTransfers(logs: Log[], recipient: string): {
        token: string;
        amount: BigNumber;
    }[];
}
declare class UniswapXEventWatcher extends EventWatcher<ExclusiveDutchOrderReactor> {
    constructor(provider: BaseProvider, reactorAddress: string);
    getFillLogs(fromBlock: number, toBlock?: number): Promise<FillEvent[]>;
    onFill(callback: (fillData: FillData, event: Event) => void): void;
}
declare class RelayEventWatcher extends EventWatcher<RelayOrderReactor> {
    constructor(provider: BaseProvider, reactorAddress: string);
    getFillLogs(fromBlock: number, toBlock?: number): Promise<FillEvent[]>;
    onFill(callback: (fillData: FillData, event: Event) => void): void;
}

type MulticallParams = {
    contractInterface: Interface;
    functionName: string;
};
type MulticallSameContractParams<TFunctionParams> = MulticallParams & {
    address: string;
    functionParams: TFunctionParams[];
};
type MulticallSameFunctionParams<TFunctionParams> = MulticallParams & {
    addresses: string[];
    functionParam: TFunctionParams;
};
type MulticallResult = {
    success: boolean;
    returnData: string;
};
type Call = {
    target: string;
    callData: string;
};
declare function multicallSameContractManyFunctions<TFunctionParams extends any[] | undefined>(provider: StaticJsonRpcProvider, params: MulticallSameContractParams<TFunctionParams>, stateOverrrides?: {
    code?: string;
    state?: any;
}, blockOverrides?: BlockOverrides): Promise<MulticallResult[]>;
declare function multicallSameFunctionManyContracts<TFunctionParams extends any[] | undefined>(provider: StaticJsonRpcProvider, params: MulticallSameFunctionParams<TFunctionParams>, stateOverrrides?: {
    code?: string;
    state?: any;
}, blockOverrides?: BlockOverrides): Promise<MulticallResult[]>;
declare function multicall(provider: StaticJsonRpcProvider, calls: Call[], stateOverrides?: {
    code?: string;
    state?: any;
}, blockOverrides?: BlockOverrides): Promise<MulticallResult[]>;

interface DutchDecayConfig {
    startAmount: BigNumber;
    endAmount: BigNumber;
    decayStartTime: number;
    decayEndTime: number;
}
declare function getDecayedAmount(config: DutchDecayConfig, atTime?: number): BigNumber;

declare abstract class OrderParser {
    abstract orderInfoOffset: number;
    abstract parseOrder(order: string, chainId: number): Order;
    /**
     * Parses a serialized order based on the order shape
     * @dev called by derived classes which set the offset
     */
    protected _parseOrder(order: string): OrderType;
    /**
     * Determines the OrderType from an Order object
     * @return OrderType
     */
    getOrderType(order: Order): OrderType;
    /**
     * Helper function to determine the OrderType from a serialized order
     */
    getOrderTypeFromEncoded(order: string, chainId: number): OrderType;
}
declare class UniswapXOrderParser extends OrderParser {
    orderInfoOffset: number;
    /**
     * Parses a serialized order
     */
    parseOrder(order: string, chainId: number): UniswapXOrder;
    /**
     * Detects V4 order type by checking if the first address is a known resolver
     * V4 orders are serialized as: (resolver, orderData)
     */
    private detectV4OrderType;
    /**
     * Parses a V4 order based on its resolver
     */
    private parseV4Order;
    /**
     * Determine the order type of a UniswapX order
     * @dev Special cases limit orders which are dutch orders with no output decay
     * @dev V4 orders (like HybridOrder) are detected by instance check since they use resolver-based lookup
     */
    getOrderType(order: Order): OrderType;
}
declare class RelayOrderParser extends OrderParser {
    orderInfoOffset: number;
    /**
     * Parses a serialized order
     */
    parseOrder(order: string, chainId: number): RelayOrder;
}
declare function originalIfZero(value: BigNumber, original: BigNumber): BigNumber;

declare class PermissionedTokenValidator {
    /**
     * Checks if a token is a permissioned token
     * @param tokenAddress The address of the token
     * @returns True if the token is a permissioned token, false otherwise
     */
    static isPermissionedToken(tokenAddress: string, chainId: ChainId, permissionedTokens?: typeof PERMISSIONED_TOKENS): boolean;
    /**
     * Checks if a transfer would be allowed for a permissioned token
     * @param provider The provider to use for the view call
     * @param tokenAddress The address of the permissioned token
     * @param from The sender's address
     * @param to The recipient's address
     * @param value The amount to transfer (in base units)
     * @returns True if the token is not a permissioned token or the transfer is
     * allowed, false otherwise
     * @throws Will throw an exception if there is an error with the provider
     */
    static preTransferCheck(provider: Provider, tokenAddress: string, from: string, to: string, value: string, permissionedTokens?: typeof PERMISSIONED_TOKENS): Promise<boolean>;
}

declare function stripHexPrefix(a: string): string;
declare function getPermit2(chainId: number, permit2Address?: string): string;
declare function getReactor(chainId: number, orderType: OrderType, reactorAddress?: string): string;

declare class OrderNotFillable extends Error {
    constructor(message: string);
}
type PriorityCosignerData = {
    auctionTargetBlock: BigNumber;
};
type UnsignedPriorityOrderInfo = OrderInfo & {
    cosigner: string;
    auctionStartBlock: BigNumber;
    baselinePriorityFeeWei: BigNumber;
    input: PriorityInput;
    outputs: PriorityOutput[];
};
type CosignedPriorityOrderInfo = UnsignedPriorityOrderInfo & {
    cosignerData: PriorityCosignerData;
    cosignature: string;
};
type UnsignedPriorityOrderInfoJSON = Omit<UnsignedPriorityOrderInfo, "nonce" | "input" | "outputs" | "auctionStartBlock" | "baselinePriorityFeeWei"> & {
    nonce: string;
    cosigner: string;
    auctionStartBlock: string;
    baselinePriorityFeeWei: string;
    input: PriorityInputJSON;
    outputs: PriorityOutputJSON[];
};
type CosignedPriorityOrderInfoJSON = UnsignedPriorityOrderInfoJSON & {
    cosignerData: {
        auctionTargetBlock: string;
    };
    cosignature: string;
};
declare class UnsignedPriorityOrder implements OffChainOrder {
    readonly info: UnsignedPriorityOrderInfo;
    readonly chainId: number;
    permit2Address: string;
    constructor(info: UnsignedPriorityOrderInfo, chainId: number, _permit2Address?: string);
    static fromJSON(json: UnsignedPriorityOrderInfoJSON, chainId: number, _permit2Address?: string): UnsignedPriorityOrder;
    static parse(encoded: string, chainId: number, permit2?: string): UnsignedPriorityOrder;
    /**
     * @inheritdoc order
     */
    toJSON(): UnsignedPriorityOrderInfoJSON & {
        permit2Address: string;
        chainId: number;
    };
    /**
     * @inheritdoc Order
     */
    get blockOverrides(): BlockOverrides;
    /**
     * @inheritdoc order
     */
    serialize(): string;
    /**
     * @inheritdoc Order
     */
    getSigner(signature: SignatureLike): string;
    /**
     * @inheritdoc Order
     */
    permitData(): PermitTransferFromData;
    /**
     * @inheritdoc Order
     */
    hash(): string;
    /**
     * Returns the resolved order with the given options
     * @return The resolved order
     */
    resolve(_options: PriorityOrderResolutionOptions): ResolvedUniswapXOrder;
    /**
     * Returns the parsed validation
     * @return The parsed validation data for the order
     */
    get validation(): CustomOrderValidation;
    private toPermit;
    private witnessInfo;
    private witness;
    /**
     * Full order hash that should be signed over by the cosigner
     */
    cosignatureHash(cosignerData: PriorityCosignerData): string;
}
declare class CosignedPriorityOrder extends UnsignedPriorityOrder {
    readonly info: CosignedPriorityOrderInfo;
    readonly chainId: number;
    static fromUnsignedOrder(order: UnsignedPriorityOrder, cosignerData: PriorityCosignerData, cosignature: string): CosignedPriorityOrder;
    static fromJSON(json: CosignedPriorityOrderInfoJSON, chainId: number, _permit2Address?: string): CosignedPriorityOrder;
    static parse(encoded: string, chainId: number, permit2?: string): CosignedPriorityOrder;
    constructor(info: CosignedPriorityOrderInfo, chainId: number, _permit2Address?: string);
    /**
     * @inheritdoc order
     */
    toJSON(): CosignedPriorityOrderInfoJSON & {
        permit2Address: string;
        chainId: number;
    };
    /**
     * @inheritdoc Order
     */
    resolve(options: PriorityOrderResolutionOptions): ResolvedUniswapXOrder;
    /**
     * @inheritdoc Order
     */
    get blockOverrides(): BlockOverrides;
    /**
     * @inheritdoc order
     */
    serialize(): string;
    /**
     *  recovers co-signer address from cosignature and full order hash
     *  @returns The address which co-signed the order
     */
    recoverCosigner(): string;
}

type RelayInput = {
    readonly token: string;
    readonly amount: BigNumber;
    readonly recipient: string;
};
type RelayFee = {
    readonly token: string;
    readonly startAmount: BigNumber;
    readonly endAmount: BigNumber;
    readonly startTime: number;
    readonly endTime: number;
};
type RelayInputJSON = Omit<RelayInput, "amount"> & {
    amount: string;
};
type RelayFeeJSON = Omit<RelayFee, "startAmount" | "endAmount"> & {
    startAmount: string;
    endAmount: string;
};
type RelayOrderNestedOrderInfo = Omit<OrderInfo, "additionalValidationContract" | "additionalValidationData">;
type RelayOrderInfo = RelayOrderNestedOrderInfo & {
    input: RelayInput;
    fee: RelayFee;
    universalRouterCalldata: string;
};
type RelayOrderInfoJSON = Omit<RelayOrderInfo, "nonce" | "input" | "fee"> & {
    nonce: string;
    input: RelayInputJSON;
    fee: RelayFeeJSON;
    universalRouterCalldata: string;
};
declare class RelayOrder implements OffChainOrder {
    readonly info: RelayOrderInfo;
    readonly chainId: number;
    readonly _permit2Address?: string | undefined;
    permit2Address: string;
    constructor(info: RelayOrderInfo, chainId: number, _permit2Address?: string | undefined);
    static fromJSON(json: RelayOrderInfoJSON, chainId: number, _permit2Address?: string): RelayOrder;
    static parse(encoded: string, chainId: number, permit2?: string): RelayOrder;
    toJSON(): RelayOrderInfoJSON & {
        permit2Address: string;
        chainId: number;
    };
    /**
     * @inheritdoc order
     */
    get blockOverrides(): BlockOverrides;
    serialize(): string;
    /**
     * @inheritdoc Order
     */
    getSigner(signature: SignatureLike): string;
    /**
     * @inheritdoc OrderInterface
     */
    permitData(): PermitBatchTransferFromData;
    /**
     * @inheritdoc OrderInterface
     */
    hash(): string;
    /**
     * Returns the resolved order with the given options
     * @return The resolved order
     */
    resolve(options: OrderResolutionOptions): ResolvedRelayOrder;
    private toPermit;
    private witnessInfo;
    private witness;
}

type UnsignedV2DutchOrderInfo = OrderInfo & {
    cosigner: string;
    input: DutchInput;
    outputs: DutchOutput[];
};
type CosignedV2DutchOrderInfo = UnsignedV2DutchOrderInfo & {
    cosignerData: CosignerData;
    cosignature: string;
};
type UnsignedV2DutchOrderInfoJSON = Omit<UnsignedV2DutchOrderInfo, "nonce" | "input" | "outputs" | "cosignerData"> & {
    nonce: string;
    input: DutchInputJSON;
    outputs: DutchOutputJSON[];
};
type CosignedV2DutchOrderInfoJSON = UnsignedV2DutchOrderInfoJSON & {
    cosignerData: CosignerDataJSON;
    cosignature: string;
};
declare class UnsignedV2DutchOrder implements OffChainOrder {
    readonly info: UnsignedV2DutchOrderInfo;
    readonly chainId: number;
    permit2Address: string;
    constructor(info: UnsignedV2DutchOrderInfo, chainId: number, _permit2Address?: string);
    static fromJSON(json: UnsignedV2DutchOrderInfoJSON, chainId: number, _permit2Address?: string): UnsignedV2DutchOrder;
    static parse(encoded: string, chainId: number, permit2?: string): UnsignedV2DutchOrder;
    /**
     * @inheritdoc order
     */
    toJSON(): UnsignedV2DutchOrderInfoJSON & {
        permit2Address: string;
        chainId: number;
    };
    /**
     * @inheritdoc order
     */
    get blockOverrides(): BlockOverrides;
    /**
     * @inheritdoc order
     */
    serialize(): string;
    /**
     * @inheritdoc Order
     */
    getSigner(signature: SignatureLike): string;
    /**
     * @inheritdoc Order
     */
    permitData(): PermitTransferFromData;
    /**
     * @inheritdoc Order
     */
    hash(): string;
    /**
     * Returns the resolved order with the given options
     * @return The resolved order
     */
    resolve(_options: OrderResolutionOptions): ResolvedUniswapXOrder;
    /**
     * Returns the parsed validation
     * @return The parsed validation data for the order
     */
    get validation(): CustomOrderValidation;
    private toPermit;
    private witnessInfo;
    private witness;
    /**
     * Full order hash that should be signed over by the cosigner
     */
    cosignatureHash(cosignerData: CosignerData): string;
}
declare class CosignedV2DutchOrder extends UnsignedV2DutchOrder {
    readonly info: CosignedV2DutchOrderInfo;
    readonly chainId: number;
    static fromUnsignedOrder(order: UnsignedV2DutchOrder, cosignerData: CosignerData, cosignature: string): CosignedV2DutchOrder;
    static fromJSON(json: CosignedV2DutchOrderInfoJSON, chainId: number, _permit2Address?: string): CosignedV2DutchOrder;
    static parse(encoded: string, chainId: number, permit2?: string): CosignedV2DutchOrder;
    constructor(info: CosignedV2DutchOrderInfo, chainId: number, _permit2Address?: string);
    /**
     * @inheritdoc order
     */
    toJSON(): CosignedV2DutchOrderInfoJSON & {
        permit2Address: string;
        chainId: number;
    };
    /**
     * @inheritdoc Order
     */
    resolve(options: OrderResolutionOptions): ResolvedUniswapXOrder;
    /**
     * @inheritdoc order
     */
    serialize(): string;
    /**
     *  recovers co-signer address from cosignature and full order hash
     *  @returns The address which co-signed the order
     */
    recoverCosigner(): string;
}

type V3CosignerDataJSON = Omit<CosignerDataJSON, "decayStartTime" | "decayEndTime"> & {
    decayStartBlock: number;
};
type V3CosignerData = Omit<CosignerData, "decayStartTime" | "decayEndTime"> & {
    decayStartBlock: number;
};
type UnsignedV3DutchOrderInfoJSON = Omit<UnsignedV3DutchOrderInfo, "nonce" | "startingBaseFee" | "input" | "outputs" | "cosignerData"> & {
    nonce: string;
    startingBaseFee: string;
    input: V3DutchInputJSON;
    outputs: V3DutchOutputJSON[];
};
type UnsignedV3DutchOrderInfo = OrderInfo & {
    cosigner: string;
    startingBaseFee: BigNumber;
    input: V3DutchInput;
    outputs: V3DutchOutput[];
};
type CosignedV3DutchOrderInfoJSON = UnsignedV3DutchOrderInfoJSON & {
    cosignerData: V3CosignerDataJSON;
    cosignature: string;
};
type CosignedV3DutchOrderInfo = UnsignedV3DutchOrderInfo & {
    cosignerData: V3CosignerData;
    cosignature: string;
};
declare const V3_DUTCH_ORDER_TYPES: {
    V3DutchOrder: {
        name: string;
        type: string;
    }[];
    OrderInfo: {
        name: string;
        type: string;
    }[];
    V3DutchInput: {
        name: string;
        type: string;
    }[];
    V3DutchOutput: {
        name: string;
        type: string;
    }[];
    NonlinearDutchDecay: {
        name: string;
        type: string;
    }[];
};
declare class UnsignedV3DutchOrder implements OffChainOrder {
    readonly info: UnsignedV3DutchOrderInfo;
    readonly chainId: number;
    permit2Address: string;
    constructor(info: UnsignedV3DutchOrderInfo, chainId: number, _permit2Address?: string);
    static fromJSON(json: UnsignedV3DutchOrderInfoJSON, chainId: number, _permit2Address?: string): UnsignedV3DutchOrder;
    /**
     * @inheritdoc order
     */
    get blockOverrides(): BlockOverrides;
    /**
     * @inheritdoc order
     */
    serialize(): string;
    /**
     * @inheritdoc order
     */
    toJSON(): UnsignedV3DutchOrderInfoJSON & {
        permit2Address: string;
        chainId: number;
    };
    permitData(): PermitTransferFromData;
    private toPermit;
    private witnessInfo;
    private witness;
    getSigner(signature: SignatureLike): string;
    hash(): string;
    /**
     * Full order hash that should be signed over by the cosigner
     */
    cosignatureHash(cosignerData: V3CosignerData): string;
    static parse(encoded: string, chainId: number, permit2?: string): UnsignedV3DutchOrder;
}
declare class CosignedV3DutchOrder extends UnsignedV3DutchOrder {
    readonly info: CosignedV3DutchOrderInfo;
    readonly chainId: number;
    static fromUnsignedOrder(order: UnsignedV3DutchOrder, cosignerData: V3CosignerData, cosignature: string): CosignedV3DutchOrder;
    static fromJSON(json: CosignedV3DutchOrderInfoJSON, chainId: number, _permit2Address?: string): CosignedV3DutchOrder;
    constructor(info: CosignedV3DutchOrderInfo, chainId: number, _permit2Address?: string);
    /**
     * @inheritdoc order
     */
    toJSON(): CosignedV3DutchOrderInfoJSON & {
        permit2Address: string;
        chainId: number;
    };
    static parse(encoded: string, chainId: number, permit2?: string): CosignedV3DutchOrder;
    serialize(): string;
    recoverCosigner(): string;
    resolve(options: V3OrderResolutionOptions): ResolvedUniswapXOrder;
}
declare function encodeRelativeBlocks(relativeBlocks: number[]): BigNumber;

/**
 * V4 OrderInfo structure with hooks support
 * Mirrors mandatory-hook reactor contract
 */
type OrderInfoV4 = {
    reactor: string;
    swapper: string;
    nonce: BigNumber;
    deadline: number;
    preExecutionHook: string;
    preExecutionHookData: string;
    postExecutionHook: string;
    postExecutionHookData: string;
    auctionResolver: string;
};
/**
 * Input token specification
 */
type InputToken = {
    token: string;
    amount: BigNumber;
    maxAmount: BigNumber;
};
/**
 * Output token specification
 * address(0) for native ETH
 */
type OutputToken = {
    token: string;
    amount: BigNumber;
    recipient: string;
};
/**
 * Resolved order after resolver processes it
 */
type ResolvedOrder = {
    info: OrderInfoV4;
    input: InputToken;
    outputs: OutputToken[];
    sig: string;
    hash: string;
    auctionResolver: string;
    witnessTypeString: string;
};
/**
 * Hybrid auction input token definition
 * maxAmount is fixed for exact-in orders
 */
type HybridInput = {
    token: string;
    maxAmount: BigNumber;
};
/**
 * Hybrid auction output token definition
 * minAmount is scaled up for exact-in orders
 */
type HybridOutput = {
    token: string;
    minAmount: BigNumber;
    recipient: string;
};
/**
 * Hybrid cosigner data (optional)
 */
type HybridCosignerData = {
    auctionTargetBlock: BigNumber;
    supplementalPriceCurve: BigNumber[];
};
/**
 * JSON serialization format for HybridCosignerData
 */
type HybridCosignerDataJSON = {
    auctionTargetBlock: string;
    supplementalPriceCurve: string[];
};
type UnsignedHybridOrderInfo = OrderInfoV4 & {
    cosigner: string;
    input: HybridInput;
    outputs: HybridOutput[];
    auctionStartBlock: BigNumber;
    baselinePriorityFee: BigNumber;
    scalingFactor: BigNumber;
    priceCurve: BigNumber[];
};
type CosignedHybridOrderInfo = UnsignedHybridOrderInfo & {
    cosignerData: HybridCosignerData;
    cosignature: string;
};
type OrderInfoV4JSON = Omit<OrderInfoV4, "nonce"> & {
    nonce: string;
};
type HybridInputJSON = {
    token: string;
    maxAmount: string;
};
type HybridOutputJSON = {
    token: string;
    minAmount: string;
    recipient: string;
};
type UnsignedHybridOrderInfoJSON = Omit<UnsignedHybridOrderInfo, "nonce" | "input" | "outputs" | "auctionStartBlock" | "baselinePriorityFee" | "scalingFactor" | "priceCurve"> & {
    nonce: string;
    input: HybridInputJSON;
    outputs: HybridOutputJSON[];
    auctionStartBlock: string;
    baselinePriorityFee: string;
    scalingFactor: string;
    priceCurve: string[];
};
type CosignedHybridOrderInfoJSON = UnsignedHybridOrderInfoJSON & {
    cosignerData: HybridCosignerDataJSON;
    cosignature: string;
};
/**
 * DCA Intent structure
 * Signed once by swapper
 */
type DCAIntent = {
    swapper: string;
    nonce: BigNumber;
    chainId: number;
    hookAddress: string;
    isExactIn: boolean;
    inputToken: string;
    outputToken: string;
    cosigner: string;
    minPeriod: BigNumber;
    maxPeriod: BigNumber;
    minChunkSize: BigNumber;
    maxChunkSize: BigNumber;
    minPrice: BigNumber;
    deadline: BigNumber;
    outputAllocations: OutputAllocation[];
    privateIntent: PrivateIntent;
};
/**
 * Private parameters - Only hash revealed on-chain for privacy
 */
type PrivateIntent = {
    totalAmount: BigNumber;
    exactFrequency: BigNumber;
    numChunks: BigNumber;
    salt: string;
    oracleFeeds: FeedInfo[];
};
/**
 * Output distribution specification
 */
type OutputAllocation = {
    recipient: string;
    basisPoints: number;
};
/**
 * Oracle feed information
 */
type FeedInfo = {
    feedId: string;
    feed_address: string;
    feedType: string;
};
/**
 * Cosigner authorization for single execution
 */
type DCAOrderCosignerData = {
    swapper: string;
    nonce: BigNumber;
    execAmount: BigNumber;
    orderNonce: BigNumber;
    limitAmount: BigNumber;
};
/**
 * On-chain execution state
 */
type DCAExecutionState = {
    executedChunks: BigNumber;
    lastExecutionTime: BigNumber;
    cancelled: boolean;
    totalInputExecuted: BigNumber;
    totalOutput: BigNumber;
};
/**
 * Optional Permit2 allowance data
 */
type PermitData = {
    hasPermit: boolean;
    permitSingle: {
        details: {
            token: string;
            amount: BigNumber;
        };
        spender: string;
        sigDeadline: BigNumber;
        nonce: BigNumber;
    };
    signature: string;
};
/**
 * JSON serialization format for DCAIntent
 */
type DCAIntentJSON = Omit<DCAIntent, "nonce" | "minPeriod" | "maxPeriod" | "minChunkSize" | "maxChunkSize" | "minPrice" | "deadline" | "privateIntent"> & {
    nonce: string;
    minPeriod: string;
    maxPeriod: string;
    minChunkSize: string;
    maxChunkSize: string;
    minPrice: string;
    deadline: string;
    privateIntent: {
        totalAmount: string;
        exactFrequency: string;
        numChunks: string;
        salt: string;
        oracleFeeds: FeedInfo[];
    };
};
/**
 * Resolution options for a HybridOrder when simulating fills
 */
type HybridOrderResolutionOptions = {
    currentBlock: BigNumber;
    priorityFeeWei: BigNumber;
};
/**
 * Block overrides for quoting
 */
type BlockOverridesV4 = {
    number?: string;
} | undefined;

declare class OrderResolutionError extends Error {
    constructor(message: string);
}
declare class HybridOrderPriceCurveError extends Error {
    constructor(message: string);
}
declare class HybridOrderCosignatureError extends Error {
    constructor(message: string);
}
/**
 * Unsigned HybridOrder - base class without cosigner data
 */
declare class UnsignedHybridOrder {
    readonly info: UnsignedHybridOrderInfo;
    readonly chainId: number;
    readonly resolver: string;
    readonly permit2Address: string;
    constructor(info: UnsignedHybridOrderInfo, chainId: number, resolver: string, _permit2Address?: string);
    /**
     * Parse a serialized HybridOrder into an UnsignedHybridOrder
     */
    static parse(encoded: string, chainId: number, permit2?: string): UnsignedHybridOrder;
    static fromJSON(json: UnsignedHybridOrderInfoJSON, chainId: number, resolver: string, _permit2Address?: string): UnsignedHybridOrder;
    /**
     * Encode a price curve element from duration and scaling factor
     */
    static encodePriceCurveElement(duration: number, scalingFactor: BigNumber): BigNumber;
    /**
     * Decode a price curve element into duration and scaling factor
     */
    static decodePriceCurveElement(value: BigNumber): {
        duration: number;
        scalingFactor: BigNumber;
    };
    hash(): string;
    serialize(): string;
    permitData(): PermitTransferFromData;
    getSigner(signature: SignatureLike): string;
    protected toPermit(): PermitTransferFrom;
    protected witness(): Witness;
    get blockOverrides(): BlockOverridesV4;
    resolve(_options: HybridOrderResolutionOptions): ResolvedUniswapXOrder;
    cosignatureHash(cosignerData: HybridCosignerData): string;
    toJSON(): UnsignedHybridOrderInfoJSON & {
        chainId: number;
        resolver: string;
        permit2Address: string;
    };
}
/**
 * Cosigned HybridOrder - includes cosigner data and signature
 */
declare class CosignedHybridOrder extends UnsignedHybridOrder {
    readonly info: CosignedHybridOrderInfo;
    readonly chainId: number;
    readonly resolver: string;
    constructor(info: CosignedHybridOrderInfo, chainId: number, resolver: string, _permit2Address?: string);
    /**
     * Parse a serialized HybridOrder into a CosignedHybridOrder
     */
    static parse(encoded: string, chainId: number, permit2?: string): CosignedHybridOrder;
    /**
     * Create a CosignedHybridOrder from an UnsignedHybridOrder
     */
    static fromUnsignedOrder(order: UnsignedHybridOrder, cosignerData: HybridCosignerData, cosignature: string): CosignedHybridOrder;
    static fromJSON(json: CosignedHybridOrderInfoJSON, chainId: number, resolver: string, _permit2Address?: string): CosignedHybridOrder;
    hash(): string;
    serialize(): string;
    get blockOverrides(): BlockOverridesV4;
    resolve(options: HybridOrderResolutionOptions): ResolvedUniswapXOrder;
    toJSON(): CosignedHybridOrderInfoJSON & {
        chainId: number;
        resolver: string;
        permit2Address: string;
    };
    cosignatureHash(): string;
    recoverCosigner(): string;
}

/**
 * EIP-712 type string for OrderInfoV4
 */
declare const ORDER_INFO_V4_TYPE_STRING: string;
/**
 * EIP-712 type hash for OrderInfoV4
 */
declare const ORDER_INFO_V4_TYPE_HASH: string;
/**
 * EIP-712 witness types for HybridOrder (for Permit2 signature)
 * NOTE: Types must be in alphabetical order for EIP-712 spec compliance
 */
declare const HYBRID_ORDER_TYPES: {
    HybridInput: {
        name: string;
        type: string;
    }[];
    HybridOrder: {
        name: string;
        type: string;
    }[];
    HybridOutput: {
        name: string;
        type: string;
    }[];
    OrderInfo: {
        name: string;
        type: string;
    }[];
};
/**
 * Hash OrderInfoV4 structure
 * @param info The OrderInfoV4 to hash
 * @returns The keccak256 hash
 */
declare function hashOrderInfoV4(info: OrderInfoV4): string;
declare function hashHybridOrder(order: CosignedHybridOrderInfo): string;
/**
 * Compute cosigner digest (orderHash || chainId || cosignerData encoding)
 */
declare function hashHybridCosignerData(orderHash: string, cosignerData: HybridCosignerData, chainId: number): string;
/**
 * Hash PrivateIntent structure
 * @param privateIntent The PrivateIntent to hash
 * @returns The keccak256 hash
 */
declare function hashPrivateIntent(privateIntent: PrivateIntent): string;
/**
 * Hash DCAIntent structure
 * Note: Intent should have privateIntent zeroed out for signing, with separate privateIntentHash
 * @param intent The DCAIntent to hash (with zeroed privateIntent)
 * @param privateIntentHash The hash of the PrivateIntent
 * @returns The keccak256 hash
 */
declare function hashDCAIntent(intent: DCAIntent, privateIntentHash: string): string;
/**
 * EIP-712 type hash for DCAOrderCosignerData
 */
declare const DCA_COSIGNER_DATA_TYPE_HASH: string;
/**
 * Hash DCAOrderCosignerData structure
 * @param cosignerData The DCAOrderCosignerData to hash
 * @returns The keccak256 hash
 */
declare function hashDCACosignerData(cosignerData: DCAOrderCosignerData): string;
/**
 * EIP-712 type definitions for DCAIntent
 */
declare const DCA_INTENT_TYPES: {
    DCAIntent: {
        name: string;
        type: string;
    }[];
    OutputAllocation: {
        name: string;
        type: string;
    }[];
    PrivateIntent: {
        name: string;
        type: string;
    }[];
    FeedInfo: {
        name: string;
        type: string;
    }[];
};

type UniswapXOrder = DutchOrder | UnsignedV2DutchOrder | CosignedV2DutchOrder | UnsignedV3DutchOrder | CosignedV3DutchOrder | UnsignedPriorityOrder | CosignedPriorityOrder | UnsignedHybridOrder | CosignedHybridOrder;
type Order = UniswapXOrder | RelayOrder;

declare class DutchOrderTrade<TInput extends Currency, TOutput extends Currency, TTradeType extends TradeType> {
    readonly tradeType: TTradeType;
    readonly order: DutchOrder;
    private _inputAmount;
    private _outputAmounts;
    private _currencyIn;
    private _currenciesOut;
    constructor({ currencyIn, currenciesOut, orderInfo, tradeType, }: {
        currencyIn: TInput;
        currenciesOut: TOutput[];
        orderInfo: DutchOrderInfo;
        tradeType: TTradeType;
    });
    get inputAmount(): CurrencyAmount<TInput>;
    get outputAmounts(): CurrencyAmount<TOutput>[];
    private _firstNonFeeOutputStartEndAmounts;
    private getFirstNonFeeOutputStartEndAmounts;
    get outputAmount(): CurrencyAmount<TOutput>;
    minimumAmountOut(): CurrencyAmount<TOutput>;
    maximumAmountIn(): CurrencyAmount<TInput>;
    private _executionPrice;
    /**
     * The price expressed in terms of output amount/input amount.
     */
    get executionPrice(): Price<TInput, TOutput>;
    /**
     * Return the execution price after accounting for slippage tolerance
     * @returns The execution price
     */
    worstExecutionPrice(): Price<TInput, TOutput>;
}

declare class V2DutchOrderTrade<TInput extends Currency, TOutput extends Currency, TTradeType extends TradeType> {
    readonly tradeType: TTradeType;
    readonly order: UnsignedV2DutchOrder;
    private _inputAmount;
    private _outputAmounts;
    private _currencyIn;
    private _currenciesOut;
    constructor({ currencyIn, currenciesOut, orderInfo, tradeType, }: {
        currencyIn: TInput;
        currenciesOut: TOutput[];
        orderInfo: UnsignedV2DutchOrderInfo;
        tradeType: TTradeType;
    });
    get inputAmount(): CurrencyAmount<TInput>;
    get outputAmounts(): CurrencyAmount<TOutput>[];
    private _firstNonFeeOutputStartEndAmounts;
    private getFirstNonFeeOutputStartEndAmounts;
    get outputAmount(): CurrencyAmount<TOutput>;
    minimumAmountOut(): CurrencyAmount<TOutput>;
    maximumAmountIn(): CurrencyAmount<TInput>;
    private _executionPrice;
    /**
     * The price expressed in terms of output amount/input amount.
     */
    get executionPrice(): Price<TInput, TOutput>;
    /**
     * Return the execution price after accounting for slippage tolerance
     * @returns The execution price
     */
    worstExecutionPrice(): Price<TInput, TOutput>;
}

declare class PriorityOrderTrade<TInput extends Currency, TOutput extends Currency, TTradeType extends TradeType> {
    readonly tradeType: TTradeType;
    readonly order: UnsignedPriorityOrder;
    readonly expectedAmounts: {
        expectedAmountIn: string;
        expectedAmountOut: string;
    } | undefined;
    private _inputAmount;
    private _outputAmounts;
    private _currencyIn;
    private _currenciesOut;
    constructor({ currencyIn, currenciesOut, orderInfo, tradeType, expectedAmounts, }: {
        currencyIn: TInput;
        currenciesOut: TOutput[];
        orderInfo: UnsignedPriorityOrderInfo;
        tradeType: TTradeType;
        expectedAmounts?: {
            expectedAmountIn: string;
            expectedAmountOut: string;
        };
    });
    get inputAmount(): CurrencyAmount<TInput>;
    get outputAmounts(): CurrencyAmount<TOutput>[];
    private _firstNonFeeOutputAmount;
    private getFirstNonFeeOutputAmount;
    get outputAmount(): CurrencyAmount<TOutput>;
    minimumAmountOut(): CurrencyAmount<TOutput>;
    maximumAmountIn(): CurrencyAmount<TInput>;
    private _executionPrice;
    /**
     * The price expressed in terms of output amount/input amount.
     */
    get executionPrice(): Price<TInput, TOutput>;
    /**
     * Return the execution price after accounting for slippage tolerance
     * @returns The execution price
     */
    worstExecutionPrice(): Price<TInput, TOutput>;
    private getExpectedAmountIn;
    private getExpectedAmountOut;
}

declare class RelayOrderTrade<TInput extends Currency, TOutput extends Currency, TTradeType extends TradeType> {
    readonly tradeType: TTradeType;
    readonly order: RelayOrder;
    private _outputAmount;
    private _currenciesIn;
    constructor({ currenciesIn, outputAmount, orderInfo, tradeType, }: {
        currenciesIn: TInput[];
        outputAmount: CurrencyAmount<TOutput>;
        orderInfo: RelayOrderInfo;
        tradeType: TTradeType;
    });
    get outputAmount(): CurrencyAmount<TOutput>;
    private _feeStartEndAmounts;
    private _inputAmount;
    private getFeeInputStartEndAmounts;
    private getInputAmount;
    get amountIn(): CurrencyAmount<TInput>;
    get amountInFee(): CurrencyAmount<TInput>;
    get maximumAmountInFee(): CurrencyAmount<TInput>;
    private _executionPrice;
    /**
     * The price expressed in terms of output amount/input amount.
     * @dev this only takes into account non fee inputs (does not include gas)
     */
    get executionPrice(): Price<TInput, TOutput>;
    /**
     * Return the execution price after accounting for slippage tolerance
     * @dev this only takes into account non fee inputs (does not include gas)
     * @returns The execution price
     */
    worstExecutionPrice(): Price<TInput, TOutput>;
}

declare class V3DutchOrderTrade<TInput extends Currency, TOutput extends Currency, TTradeType extends TradeType> {
    readonly tradeType: TTradeType;
    readonly order: UnsignedV3DutchOrder;
    readonly expectedAmounts: {
        expectedAmountIn: string;
        expectedAmountOut: string;
    } | undefined;
    private _inputAmount;
    private _outputAmounts;
    private _currencyIn;
    private _currenciesOut;
    constructor({ currencyIn, currenciesOut, orderInfo, tradeType, expectedAmounts, }: {
        currencyIn: TInput;
        currenciesOut: TOutput[];
        orderInfo: UnsignedV3DutchOrderInfo;
        tradeType: TTradeType;
        expectedAmounts?: {
            expectedAmountIn: string;
            expectedAmountOut: string;
        };
    });
    get inputAmount(): CurrencyAmount<TInput>;
    get outputAmounts(): CurrencyAmount<TOutput>[];
    get outputAmount(): CurrencyAmount<TOutput>;
    minimumAmountOut(): CurrencyAmount<TOutput>;
    maximumAmountIn(): CurrencyAmount<TInput>;
    private _executionPrice;
    /**
     * The price expressed in terms of output amount/input amount.
     */
    get executionPrice(): Price<TInput, TOutput>;
    /**
     * Return the execution price after accounting for slippage tolerance
     * @returns The execution price
     */
    worstExecutionPrice(): Price<TInput, TOutput>;
    private getExpectedAmountIn;
    private getExpectedAmountOut;
}

declare class HybridOrderTrade<TInput extends Currency, TOutput extends Currency, TTradeType extends TradeType> {
    readonly tradeType: TTradeType;
    readonly order: CosignedHybridOrder;
    readonly expectedAmounts: {
        expectedAmountIn: string;
        expectedAmountOut: string;
    } | undefined;
    private _inputAmount;
    private _outputAmounts;
    private _currencyIn;
    private _currenciesOut;
    constructor({ currencyIn, currenciesOut, orderInfo, chainId, resolver, permit2Address, tradeType, expectedAmounts, }: {
        currencyIn: TInput;
        currenciesOut: TOutput[];
        orderInfo: CosignedHybridOrderInfo;
        chainId: number;
        resolver: string;
        permit2Address?: string;
        tradeType: TTradeType;
        expectedAmounts?: {
            expectedAmountIn: string;
            expectedAmountOut: string;
        };
    });
    get inputAmount(): CurrencyAmount<TInput>;
    get outputAmounts(): CurrencyAmount<TOutput>[];
    get outputAmount(): CurrencyAmount<TOutput>;
    /**
     * For exact-in orders: minimum amount out is the minAmount from the order
     * For exact-out orders: minimum amount out is the fixed output amount
     */
    minimumAmountOut(): CurrencyAmount<TOutput>;
    /**
     * For exact-in orders: maximum amount in is the fixed maxAmount
     * For exact-out orders: maximum amount in is the maxAmount (worst case)
     */
    maximumAmountIn(): CurrencyAmount<TInput>;
    private _executionPrice;
    /**
     * The price expressed in terms of output amount/input amount.
     */
    get executionPrice(): Price<TInput, TOutput>;
    /**
     * Return the execution price after accounting for slippage tolerance
     * @returns The worst execution price (max in / min out)
     */
    worstExecutionPrice(): Price<TInput, TOutput>;
    /**
     * Determine if this is an exact-in order based on the scalingFactor
     */
    isExactIn(): boolean;
    /**
     * Determine if this is an exact-out order based on the scalingFactor
     */
    isExactOut(): boolean;
    private getExpectedAmountIn;
    private getExpectedAmountOut;
}

/**
 * Builder for generating orders
 */
declare abstract class OrderBuilder {
    protected orderInfo: Partial<OrderInfo>;
    constructor();
    deadline(deadline: number): OrderBuilder;
    nonce(nonce: BigNumber): OrderBuilder;
    swapper(swapper: string): OrderBuilder;
    validation(info: ValidationInfo): OrderBuilder;
    protected reactor(reactor: string): OrderBuilder;
    protected getOrderInfo(): OrderInfo;
    abstract build(): UniswapXOrder;
}

/**
 * Helper builder for generating dutch limit orders
 */
declare class DutchOrderBuilder extends OrderBuilder {
    private chainId;
    private permit2Address?;
    private info;
    static fromOrder(order: DutchOrder): DutchOrderBuilder;
    constructor(chainId: number, reactorAddress?: string, permit2Address?: string | undefined);
    decayStartTime(decayStartTime: number): DutchOrderBuilder;
    decayEndTime(decayEndTime: number): DutchOrderBuilder;
    input(input: DutchInput): DutchOrderBuilder;
    output(output: DutchOutput): DutchOrderBuilder;
    deadline(deadline: number): DutchOrderBuilder;
    swapper(swapper: string): DutchOrderBuilder;
    nonce(nonce: BigNumber): DutchOrderBuilder;
    validation(info: ValidationInfo): DutchOrderBuilder;
    nonFeeRecipient(newRecipient: string, feeRecipient?: string): DutchOrderBuilder;
    exclusiveFiller(exclusiveFiller: string, exclusivityOverrideBps: BigNumber): DutchOrderBuilder;
    build(): DutchOrder;
}

/**
 * Helper builder for generating relay orders
 */
declare class RelayOrderBuilder {
    private chainId;
    private permit2Address?;
    protected info: Partial<RelayOrderInfo>;
    static fromOrder(order: RelayOrder): RelayOrderBuilder;
    constructor(chainId: number, reactorAddress?: string, permit2Address?: string | undefined);
    protected reactor(reactor: string): RelayOrderBuilder;
    deadline(deadline: number): RelayOrderBuilder;
    nonce(nonce: BigNumber): RelayOrderBuilder;
    swapper(swapper: string): RelayOrderBuilder;
    universalRouterCalldata(universalRouterCalldata: string): RelayOrderBuilder;
    feeStartTime(feeStartTime: number): RelayOrderBuilder;
    feeEndTime(feeEndTime: number): RelayOrderBuilder;
    input(input: RelayInput): RelayOrderBuilder;
    fee(fee: RelayFee): RelayOrderBuilder;
    build(): RelayOrder;
}

/**
 * Helper builder for generating dutch limit orders
 */
declare class V2DutchOrderBuilder extends OrderBuilder {
    private chainId;
    private info;
    private permit2Address;
    static fromOrder<O extends UnsignedV2DutchOrder>(order: O): V2DutchOrderBuilder;
    constructor(chainId: number, reactorAddress?: string, _permit2Address?: string);
    decayStartTime(decayStartTime: number): this;
    decayEndTime(decayEndTime: number): this;
    input(input: DutchInput): this;
    output(output: DutchOutput): this;
    deadline(deadline: number): this;
    swapper(swapper: string): this;
    nonce(nonce: BigNumber): this;
    validation(info: ValidationInfo): this;
    nonFeeRecipient(newRecipient: string, feeRecipient?: string): this;
    exclusiveFiller(exclusiveFiller: string): this;
    exclusivityOverrideBps(exclusivityOverrideBps: BigNumber): this;
    inputOverride(inputOverride: BigNumber): this;
    outputOverrides(outputOverrides: BigNumber[]): this;
    cosigner(cosigner: string): this;
    cosignature(cosignature: string | undefined): this;
    cosignerData(cosignerData: CosignerData): this;
    buildPartial(): UnsignedV2DutchOrder;
    build(): CosignedV2DutchOrder;
    private initializeCosignerData;
}

/**
 * Helper builder for generating priority gas auction orders
 */
declare class PriorityOrderBuilder extends OrderBuilder {
    private chainId;
    private permit2Address?;
    private info;
    static fromOrder<O extends UnsignedPriorityOrder>(order: O): PriorityOrderBuilder;
    constructor(chainId: number, reactorAddress?: string, permit2Address?: string | undefined);
    cosigner(cosigner: string): this;
    auctionStartBlock(auctionStartBlock: BigNumber): this;
    auctionTargetBlock(auctionTargetBlock: BigNumber): this;
    baselinePriorityFeeWei(baselinePriorityFeeWei: BigNumber): this;
    cosignerData(cosignerData: PriorityCosignerData): this;
    cosignature(cosignature: string | undefined): this;
    input(input: PriorityInput): this;
    output(output: PriorityOutput): this;
    deadline(deadline: number): this;
    swapper(swapper: string): this;
    nonce(nonce: BigNumber): this;
    validation(info: ValidationInfo): this;
    nonFeeRecipient(newRecipient: string, feeRecipient?: string): PriorityOrderBuilder;
    buildPartial(): UnsignedPriorityOrder;
    build(): CosignedPriorityOrder;
}

declare class V3DutchOrderBuilder extends OrderBuilder {
    private chainId;
    static fromOrder<T extends UnsignedV3DutchOrder>(order: T): V3DutchOrderBuilder;
    build(): CosignedV3DutchOrder;
    private permit2Address;
    private info;
    constructor(chainId: number, reactorAddress?: string, _permit2Address?: string);
    cosigner(cosigner: string): this;
    cosignature(cosignature: string | undefined): this;
    decayStartBlock(decayStartBlock: number): this;
    private initializeCosignerData;
    private isRelativeBlocksIncreasing;
    private checkUnsignedInvariants;
    private checkCosignedInvariants;
    startingBaseFee(startingBaseFee: BigNumber): this;
    input(input: V3DutchInput): this;
    output(output: V3DutchOutput): this;
    inputOverride(inputOverride: BigNumber): this;
    outputOverrides(outputOverrides: BigNumber[]): this;
    deadline(deadline: number): this;
    swapper(swapper: string): this;
    nonce(nonce: BigNumber): this;
    validation(info: ValidationInfo): this;
    cosignerData(cosignerData: V3CosignerData): this;
    exclusiveFiller(exclusiveFiller: string): this;
    exclusivityOverrideBps(exclusivityOverrideBps: BigNumber): this;
    nonFeeRecipient(newRecipient: string, feeRecipient?: string): this;
    buildPartial(): UnsignedV3DutchOrder;
    static getMaxAmountOut(startAmount: BigNumber, relativeAmounts: bigint[]): BigNumber;
    static getMinAmountOut(startAmount: BigNumber, relativeAmounts: bigint[]): BigNumber;
}

declare class HybridOrderBuilder {
    private chainId;
    private resolver;
    private permit2Address?;
    static fromOrder(order: UnsignedHybridOrder | CosignedHybridOrder, resolver?: string): HybridOrderBuilder;
    private info;
    private orderData;
    constructor(chainId: number, reactor: string, resolver: string, permit2Address?: string | undefined);
    private initializeCosignerData;
    private validatePriceCurve;
    reactor(reactor: string): this;
    swapper(swapper: string): this;
    nonce(nonce: BigNumber): this;
    deadline(deadline: number): this;
    preExecutionHook(hook: string, hookData?: string): this;
    postExecutionHook(hook: string, hookData?: string): this;
    auctionResolver(resolver: string): this;
    cosigner(cosigner: string): this;
    cosignature(cosignature: string): this;
    input(input: HybridInput): this;
    output(output: HybridOutput): this;
    auctionStartBlock(block: BigNumber | number): this;
    baselinePriorityFee(fee: BigNumber | number): this;
    scalingFactor(factor: BigNumber): this;
    priceCurve(curve: BigNumber[]): this;
    cosignerData(data: HybridCosignerData): this;
    auctionTargetBlock(block: BigNumber | number): this;
    supplementalPriceCurve(curve: BigNumber[]): this;
    private checkUnsignedInvariants;
    private extractScalingFactor;
    private checkCosignedInvariants;
    buildPartial(): UnsignedHybridOrder;
    build(): CosignedHybridOrder;
}

export { BPS, type BlockOverrides, type BlockOverridesV4, CosignedHybridOrder, type CosignedHybridOrderInfo, type CosignedHybridOrderInfoJSON, CosignedPriorityOrder, type CosignedPriorityOrderInfo, type CosignedPriorityOrderInfoJSON, CosignedV2DutchOrder, type CosignedV2DutchOrderInfo, type CosignedV2DutchOrderInfoJSON, CosignedV3DutchOrder, type CosignedV3DutchOrderInfo, type CosignedV3DutchOrderInfoJSON, type CosignerData, type CosignerDataJSON, type CustomOrderValidation, type DCAExecutionState, type DCAIntent, type DCAIntentJSON, type DCAOrderCosignerData, DCA_COSIGNER_DATA_TYPE_HASH, DCA_INTENT_TYPES, type DutchDecayConfig, type DutchInput, type DutchInputJSON, DutchOrder, DutchOrderBuilder, type DutchOrderInfo, type DutchOrderInfoJSON, DutchOrderTrade, type DutchOutput, type DutchOutputJSON, EXCLUSIVE_FILLER_VALIDATION_MAPPING, type EncodedNonlinearDutchDecay, type EncodedV3DutchInput, type EncodedV3DutchOutput, type FeedInfo, type FillData, type FillInfo, HYBRID_ORDER_TYPES, HYBRID_RESOLVER_ADDRESS_MAPPING, type HybridCosignerData, type HybridCosignerDataJSON, type HybridInput, type HybridInputJSON, HybridOrderBuilder, HybridOrderCosignatureError, HybridOrderPriceCurveError, type HybridOrderResolutionOptions, HybridOrderTrade, type HybridOutput, type HybridOutputJSON, type InputToken, KNOWN_EVENT_SIGNATURES, type LegacyOrderInfoTypes, MPS, type MulticallParams, type MulticallResult, type MulticallSameContractParams, type MulticallSameFunctionParams, NonceManager, type NonlinearDutchDecay, type NonlinearDutchDecayJSON, ORDER_INFO_V4_TYPE_HASH, ORDER_INFO_V4_TYPE_STRING, type OffChainOrder, type Order, OrderBuilder, type OrderInfo, type OrderInfoV4, type OrderInfoV4JSON, OrderNotFillable, OrderResolutionError, type OrderResolutionOptions, OrderType, OrderValidation, OrderValidator, type OutputAllocation, type OutputToken, PERMISSIONED_TOKENS, PERMIT2_MAPPING, type PermissionedToken, PermissionedTokenInterface, PermissionedTokenProxyType, PermissionedTokenValidator, type PermitData, type PriorityCosignerData, type PriorityInput, type PriorityInputJSON, PriorityOrderBuilder, type PriorityOrderResolutionOptions, PriorityOrderTrade, type PriorityOutput, type PriorityOutputJSON, type PrivateIntent, REACTOR_ADDRESS_MAPPING, REACTOR_CONTRACT_MAPPING, RELAY_SENTINEL_RECIPIENT, REVERSE_REACTOR_MAPPING, REVERSE_RESOLVER_MAPPING, RelayEventWatcher, type RelayFee, type RelayFeeJSON, type RelayInput, type RelayInputJSON, RelayOrder, RelayOrderBuilder, type RelayOrderInfo, type RelayOrderInfoJSON, RelayOrderParser, type RelayOrderQuote, RelayOrderQuoter, RelayOrderTrade, RelayOrderValidator, type ResolvedOrder, type ResolvedRelayFee, type ResolvedRelayOrder, type ResolvedUniswapXOrder, type ResolvedV4Order, type SignedOrder, type SignedRelayOrder, type SignedUniswapXOrder, type SignedV4Order, type TokenAmount, type TokenTransfer, UNISWAPX_ORDER_QUOTER_MAPPING, UNISWAPX_V4_ORDER_QUOTER_MAPPING, UNISWAPX_V4_TOKEN_TRANSFER_HOOK_MAPPING, UniswapXEventWatcher, type UniswapXOrder, UniswapXOrderParser, type UniswapXOrderQuote, UniswapXOrderQuoter, UnsignedHybridOrder, type UnsignedHybridOrderInfo, type UnsignedHybridOrderInfoJSON, UnsignedPriorityOrder, type UnsignedPriorityOrderInfo, type UnsignedPriorityOrderInfoJSON, UnsignedV2DutchOrder, type UnsignedV2DutchOrderInfo, type UnsignedV2DutchOrderInfoJSON, UnsignedV3DutchOrder, type UnsignedV3DutchOrderInfo, type UnsignedV3DutchOrderInfoJSON, V2DutchOrderBuilder, V2DutchOrderTrade, type V3CosignerData, type V3CosignerDataJSON, type V3DutchInput, type V3DutchInputJSON, V3DutchOrderBuilder, V3DutchOrderTrade, type V3DutchOutput, type V3DutchOutputJSON, type V3OrderResolutionOptions, V3_DUTCH_ORDER_TYPES, type V4OrderQuote, V4OrderQuoter, V4OrderValidator, type ValidationInfo, ValidationType, buildNonce, constructSameAddressMap, encodeExclusiveFillerData, encodeRelativeBlocks, getCancelMultipleParams, getCancelSingleParams, getDecayedAmount, getFirstUnsetBit, getPermit2, getReactor, hashDCACosignerData, hashDCAIntent, hashHybridCosignerData, hashHybridOrder, hashOrderInfoV4, hashPrivateIntent, id, multicall, multicallAddressOn, multicallSameContractManyFunctions, multicallSameFunctionManyContracts, originalIfZero, parseExclusiveFillerData, parseValidation, setBit, splitNonce, stripHexPrefix };
