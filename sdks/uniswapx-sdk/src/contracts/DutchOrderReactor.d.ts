import type { BaseContract, BigNumber, BytesLike, CallOverrides, ContractTransaction, Overrides, PayableOverrides, PopulatedTransaction, Signer, utils } from "ethers";
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
export interface DutchOrderReactorInterface extends utils.Interface {
    functions: {
        "DIRECT_FILL()": FunctionFragment;
        "execute((bytes,bytes),address,bytes)": FunctionFragment;
        "executeBatch((bytes,bytes)[],address,bytes)": FunctionFragment;
        "feeController()": FunctionFragment;
        "owner()": FunctionFragment;
        "permit2()": FunctionFragment;
        "setProtocolFeeController(address)": FunctionFragment;
        "transferOwnership(address)": FunctionFragment;
    };
    getFunction(nameOrSignatureOrTopic: "DIRECT_FILL" | "execute" | "executeBatch" | "feeController" | "owner" | "permit2" | "setProtocolFeeController" | "transferOwnership"): FunctionFragment;
    encodeFunctionData(functionFragment: "DIRECT_FILL", values?: undefined): string;
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
    encodeFunctionData(functionFragment: "feeController", values?: undefined): string;
    encodeFunctionData(functionFragment: "owner", values?: undefined): string;
    encodeFunctionData(functionFragment: "permit2", values?: undefined): string;
    encodeFunctionData(functionFragment: "setProtocolFeeController", values: [PromiseOrValue<string>]): string;
    encodeFunctionData(functionFragment: "transferOwnership", values: [PromiseOrValue<string>]): string;
    decodeFunctionResult(functionFragment: "DIRECT_FILL", data: BytesLike): Result;
    decodeFunctionResult(functionFragment: "execute", data: BytesLike): Result;
    decodeFunctionResult(functionFragment: "executeBatch", data: BytesLike): Result;
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
export interface FillEventObject {
    orderHash: string;
    filler: string;
    swapper: string;
    nonce: BigNumber;
}
export type FillEvent = TypedEvent<[
    string,
    string,
    string,
    BigNumber
], FillEventObject>;
export type FillEventFilter = TypedEventFilter<FillEvent>;
export interface OwnershipTransferredEventObject {
    user: string;
    newOwner: string;
}
export type OwnershipTransferredEvent = TypedEvent<[
    string,
    string
], OwnershipTransferredEventObject>;
export type OwnershipTransferredEventFilter = TypedEventFilter<OwnershipTransferredEvent>;
export interface ProtocolFeeControllerSetEventObject {
    oldFeeController: string;
    newFeeController: string;
}
export type ProtocolFeeControllerSetEvent = TypedEvent<[
    string,
    string
], ProtocolFeeControllerSetEventObject>;
export type ProtocolFeeControllerSetEventFilter = TypedEventFilter<ProtocolFeeControllerSetEvent>;
export interface DutchOrderReactor extends BaseContract {
    connect(signerOrProvider: Signer | Provider | string): this;
    attach(addressOrName: string): this;
    deployed(): Promise<this>;
    interface: DutchOrderReactorInterface;
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
        DIRECT_FILL(overrides?: CallOverrides): Promise<[string]>;
        execute(order: SignedOrderStruct, fillContract: PromiseOrValue<string>, fillData: PromiseOrValue<BytesLike>, overrides?: PayableOverrides & {
            from?: PromiseOrValue<string>;
        }): Promise<ContractTransaction>;
        executeBatch(orders: SignedOrderStruct[], fillContract: PromiseOrValue<string>, fillData: PromiseOrValue<BytesLike>, overrides?: PayableOverrides & {
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
    DIRECT_FILL(overrides?: CallOverrides): Promise<string>;
    execute(order: SignedOrderStruct, fillContract: PromiseOrValue<string>, fillData: PromiseOrValue<BytesLike>, overrides?: PayableOverrides & {
        from?: PromiseOrValue<string>;
    }): Promise<ContractTransaction>;
    executeBatch(orders: SignedOrderStruct[], fillContract: PromiseOrValue<string>, fillData: PromiseOrValue<BytesLike>, overrides?: PayableOverrides & {
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
        DIRECT_FILL(overrides?: CallOverrides): Promise<string>;
        execute(order: SignedOrderStruct, fillContract: PromiseOrValue<string>, fillData: PromiseOrValue<BytesLike>, overrides?: CallOverrides): Promise<void>;
        executeBatch(orders: SignedOrderStruct[], fillContract: PromiseOrValue<string>, fillData: PromiseOrValue<BytesLike>, overrides?: CallOverrides): Promise<void>;
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
        DIRECT_FILL(overrides?: CallOverrides): Promise<BigNumber>;
        execute(order: SignedOrderStruct, fillContract: PromiseOrValue<string>, fillData: PromiseOrValue<BytesLike>, overrides?: PayableOverrides & {
            from?: PromiseOrValue<string>;
        }): Promise<BigNumber>;
        executeBatch(orders: SignedOrderStruct[], fillContract: PromiseOrValue<string>, fillData: PromiseOrValue<BytesLike>, overrides?: PayableOverrides & {
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
        DIRECT_FILL(overrides?: CallOverrides): Promise<PopulatedTransaction>;
        execute(order: SignedOrderStruct, fillContract: PromiseOrValue<string>, fillData: PromiseOrValue<BytesLike>, overrides?: PayableOverrides & {
            from?: PromiseOrValue<string>;
        }): Promise<PopulatedTransaction>;
        executeBatch(orders: SignedOrderStruct[], fillContract: PromiseOrValue<string>, fillData: PromiseOrValue<BytesLike>, overrides?: PayableOverrides & {
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
