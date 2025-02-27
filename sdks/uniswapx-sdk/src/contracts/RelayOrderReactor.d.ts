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
export interface RelayOrderReactorInterface extends utils.Interface {
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
        PromiseOrValue<BigNumberish>,
        PromiseOrValue<BigNumberish>,
        PromiseOrValue<BigNumberish>,
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
export interface RelayEventObject {
    orderHash: string;
    filler: string;
    swapper: string;
    nonce: BigNumber;
}
export type RelayEvent = TypedEvent<[
    string,
    string,
    string,
    BigNumber
], RelayEventObject>;
export type RelayEventFilter = TypedEventFilter<RelayEvent>;
export interface RelayOrderReactor extends BaseContract {
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
        permit(token: PromiseOrValue<string>, owner: PromiseOrValue<string>, spender: PromiseOrValue<string>, amount: PromiseOrValue<BigNumberish>, deadline: PromiseOrValue<BigNumberish>, v: PromiseOrValue<BigNumberish>, r: PromiseOrValue<BytesLike>, s: PromiseOrValue<BytesLike>, overrides?: Overrides & {
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
    permit(token: PromiseOrValue<string>, owner: PromiseOrValue<string>, spender: PromiseOrValue<string>, amount: PromiseOrValue<BigNumberish>, deadline: PromiseOrValue<BigNumberish>, v: PromiseOrValue<BigNumberish>, r: PromiseOrValue<BytesLike>, s: PromiseOrValue<BytesLike>, overrides?: Overrides & {
        from?: PromiseOrValue<string>;
    }): Promise<ContractTransaction>;
    universalRouter(overrides?: CallOverrides): Promise<string>;
    callStatic: {
        PERMIT2(overrides?: CallOverrides): Promise<string>;
        "execute((bytes,bytes))"(signedOrder: SignedOrderStruct, overrides?: CallOverrides): Promise<void>;
        "execute((bytes,bytes),address)"(signedOrder: SignedOrderStruct, feeRecipient: PromiseOrValue<string>, overrides?: CallOverrides): Promise<void>;
        multicall(data: PromiseOrValue<BytesLike>[], overrides?: CallOverrides): Promise<string[]>;
        permit(token: PromiseOrValue<string>, owner: PromiseOrValue<string>, spender: PromiseOrValue<string>, amount: PromiseOrValue<BigNumberish>, deadline: PromiseOrValue<BigNumberish>, v: PromiseOrValue<BigNumberish>, r: PromiseOrValue<BytesLike>, s: PromiseOrValue<BytesLike>, overrides?: CallOverrides): Promise<void>;
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
        permit(token: PromiseOrValue<string>, owner: PromiseOrValue<string>, spender: PromiseOrValue<string>, amount: PromiseOrValue<BigNumberish>, deadline: PromiseOrValue<BigNumberish>, v: PromiseOrValue<BigNumberish>, r: PromiseOrValue<BytesLike>, s: PromiseOrValue<BytesLike>, overrides?: Overrides & {
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
        permit(token: PromiseOrValue<string>, owner: PromiseOrValue<string>, spender: PromiseOrValue<string>, amount: PromiseOrValue<BigNumberish>, deadline: PromiseOrValue<BigNumberish>, v: PromiseOrValue<BigNumberish>, r: PromiseOrValue<BytesLike>, s: PromiseOrValue<BytesLike>, overrides?: Overrides & {
            from?: PromiseOrValue<string>;
        }): Promise<PopulatedTransaction>;
        universalRouter(overrides?: CallOverrides): Promise<PopulatedTransaction>;
    };
}
