import type { BaseContract, BigNumber, BigNumberish, BytesLike, CallOverrides, ContractTransaction, Overrides, PopulatedTransaction, Signer, utils } from "ethers";
import type { FunctionFragment, Result } from "@ethersproject/abi";
import type { Listener, Provider } from "@ethersproject/providers";
import type { TypedEventFilter, TypedEvent, TypedListener, OnEvent, PromiseOrValue } from "./common";
export declare type TokenDetailsStruct = {
    tokenType: PromiseOrValue<BigNumberish>;
    token: PromiseOrValue<string>;
    maxAmount: PromiseOrValue<BigNumberish>;
    id: PromiseOrValue<BigNumberish>;
};
export declare type TokenDetailsStructOutput = [
    number,
    string,
    BigNumber,
    BigNumber
] & {
    tokenType: number;
    token: string;
    maxAmount: BigNumber;
    id: BigNumber;
};
export declare type PermitStruct = {
    tokens: TokenDetailsStruct[];
    spender: PromiseOrValue<string>;
    deadline: PromiseOrValue<BigNumberish>;
    witness: PromiseOrValue<BytesLike>;
};
export declare type PermitStructOutput = [
    TokenDetailsStructOutput[],
    string,
    BigNumber,
    string
] & {
    tokens: TokenDetailsStructOutput[];
    spender: string;
    deadline: BigNumber;
    witness: string;
};
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
export interface PermitPostInterface extends utils.Interface {
    functions: {
        "_PERMIT_TYPEHASH()": FunctionFragment;
        "_TOKEN_DETAILS_TYPEHASH()": FunctionFragment;
        "bitmapPositions(uint256)": FunctionFragment;
        "invalidateNonces(uint256)": FunctionFragment;
        "invalidateUnorderedNonces(uint248,uint256)": FunctionFragment;
        "isUsedUnorderedNonce(address,uint256)": FunctionFragment;
        "nonceBitmap(address,uint248)": FunctionFragment;
        "nonces(address)": FunctionFragment;
        "transferFrom(((uint8,address,uint256,uint256)[],address,uint256,bytes32),address,address[],uint256[],uint256[],(uint8,bytes32,bytes32))": FunctionFragment;
        "unorderedTransferFrom(((uint8,address,uint256,uint256)[],address,uint256,bytes32),address[],uint256[],uint256[],uint256,(uint8,bytes32,bytes32))": FunctionFragment;
    };
    getFunction(nameOrSignatureOrTopic: "_PERMIT_TYPEHASH" | "_TOKEN_DETAILS_TYPEHASH" | "bitmapPositions" | "invalidateNonces" | "invalidateUnorderedNonces" | "isUsedUnorderedNonce" | "nonceBitmap" | "nonces" | "transferFrom" | "unorderedTransferFrom"): FunctionFragment;
    encodeFunctionData(functionFragment: "_PERMIT_TYPEHASH", values?: undefined): string;
    encodeFunctionData(functionFragment: "_TOKEN_DETAILS_TYPEHASH", values?: undefined): string;
    encodeFunctionData(functionFragment: "bitmapPositions", values: [PromiseOrValue<BigNumberish>]): string;
    encodeFunctionData(functionFragment: "invalidateNonces", values: [PromiseOrValue<BigNumberish>]): string;
    encodeFunctionData(functionFragment: "invalidateUnorderedNonces", values: [PromiseOrValue<BigNumberish>, PromiseOrValue<BigNumberish>]): string;
    encodeFunctionData(functionFragment: "isUsedUnorderedNonce", values: [PromiseOrValue<string>, PromiseOrValue<BigNumberish>]): string;
    encodeFunctionData(functionFragment: "nonceBitmap", values: [PromiseOrValue<string>, PromiseOrValue<BigNumberish>]): string;
    encodeFunctionData(functionFragment: "nonces", values: [PromiseOrValue<string>]): string;
    encodeFunctionData(functionFragment: "transferFrom", values: [
        PermitStruct,
        PromiseOrValue<string>,
        PromiseOrValue<string>[],
        PromiseOrValue<BigNumberish>[],
        PromiseOrValue<BigNumberish>[],
        SignatureStruct
    ]): string;
    encodeFunctionData(functionFragment: "unorderedTransferFrom", values: [
        PermitStruct,
        PromiseOrValue<string>[],
        PromiseOrValue<BigNumberish>[],
        PromiseOrValue<BigNumberish>[],
        PromiseOrValue<BigNumberish>,
        SignatureStruct
    ]): string;
    decodeFunctionResult(functionFragment: "_PERMIT_TYPEHASH", data: BytesLike): Result;
    decodeFunctionResult(functionFragment: "_TOKEN_DETAILS_TYPEHASH", data: BytesLike): Result;
    decodeFunctionResult(functionFragment: "bitmapPositions", data: BytesLike): Result;
    decodeFunctionResult(functionFragment: "invalidateNonces", data: BytesLike): Result;
    decodeFunctionResult(functionFragment: "invalidateUnorderedNonces", data: BytesLike): Result;
    decodeFunctionResult(functionFragment: "isUsedUnorderedNonce", data: BytesLike): Result;
    decodeFunctionResult(functionFragment: "nonceBitmap", data: BytesLike): Result;
    decodeFunctionResult(functionFragment: "nonces", data: BytesLike): Result;
    decodeFunctionResult(functionFragment: "transferFrom", data: BytesLike): Result;
    decodeFunctionResult(functionFragment: "unorderedTransferFrom", data: BytesLike): Result;
    events: {};
}
export interface PermitPost extends BaseContract {
    connect(signerOrProvider: Signer | Provider | string): this;
    attach(addressOrName: string): this;
    deployed(): Promise<this>;
    interface: PermitPostInterface;
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
        _PERMIT_TYPEHASH(overrides?: CallOverrides): Promise<[string]>;
        _TOKEN_DETAILS_TYPEHASH(overrides?: CallOverrides): Promise<[string]>;
        bitmapPositions(nonce: PromiseOrValue<BigNumberish>, overrides?: CallOverrides): Promise<[BigNumber, number] & {
            wordPos: BigNumber;
            bitPos: number;
        }>;
        invalidateNonces(amount: PromiseOrValue<BigNumberish>, overrides?: Overrides & {
            from?: PromiseOrValue<string>;
        }): Promise<ContractTransaction>;
        invalidateUnorderedNonces(wordPos: PromiseOrValue<BigNumberish>, mask: PromiseOrValue<BigNumberish>, overrides?: Overrides & {
            from?: PromiseOrValue<string>;
        }): Promise<ContractTransaction>;
        isUsedUnorderedNonce(from: PromiseOrValue<string>, nonce: PromiseOrValue<BigNumberish>, overrides?: CallOverrides): Promise<[boolean] & {
            used: boolean;
        }>;
        nonceBitmap(arg0: PromiseOrValue<string>, arg1: PromiseOrValue<BigNumberish>, overrides?: CallOverrides): Promise<[BigNumber]>;
        nonces(arg0: PromiseOrValue<string>, overrides?: CallOverrides): Promise<[BigNumber]>;
        transferFrom(permit: PermitStruct, from: PromiseOrValue<string>, to: PromiseOrValue<string>[], ids: PromiseOrValue<BigNumberish>[], amounts: PromiseOrValue<BigNumberish>[], sig: SignatureStruct, overrides?: Overrides & {
            from?: PromiseOrValue<string>;
        }): Promise<ContractTransaction>;
        unorderedTransferFrom(permit: PermitStruct, to: PromiseOrValue<string>[], ids: PromiseOrValue<BigNumberish>[], amounts: PromiseOrValue<BigNumberish>[], nonce: PromiseOrValue<BigNumberish>, sig: SignatureStruct, overrides?: Overrides & {
            from?: PromiseOrValue<string>;
        }): Promise<ContractTransaction>;
    };
    _PERMIT_TYPEHASH(overrides?: CallOverrides): Promise<string>;
    _TOKEN_DETAILS_TYPEHASH(overrides?: CallOverrides): Promise<string>;
    bitmapPositions(nonce: PromiseOrValue<BigNumberish>, overrides?: CallOverrides): Promise<[BigNumber, number] & {
        wordPos: BigNumber;
        bitPos: number;
    }>;
    invalidateNonces(amount: PromiseOrValue<BigNumberish>, overrides?: Overrides & {
        from?: PromiseOrValue<string>;
    }): Promise<ContractTransaction>;
    invalidateUnorderedNonces(wordPos: PromiseOrValue<BigNumberish>, mask: PromiseOrValue<BigNumberish>, overrides?: Overrides & {
        from?: PromiseOrValue<string>;
    }): Promise<ContractTransaction>;
    isUsedUnorderedNonce(from: PromiseOrValue<string>, nonce: PromiseOrValue<BigNumberish>, overrides?: CallOverrides): Promise<boolean>;
    nonceBitmap(arg0: PromiseOrValue<string>, arg1: PromiseOrValue<BigNumberish>, overrides?: CallOverrides): Promise<BigNumber>;
    nonces(arg0: PromiseOrValue<string>, overrides?: CallOverrides): Promise<BigNumber>;
    transferFrom(permit: PermitStruct, from: PromiseOrValue<string>, to: PromiseOrValue<string>[], ids: PromiseOrValue<BigNumberish>[], amounts: PromiseOrValue<BigNumberish>[], sig: SignatureStruct, overrides?: Overrides & {
        from?: PromiseOrValue<string>;
    }): Promise<ContractTransaction>;
    unorderedTransferFrom(permit: PermitStruct, to: PromiseOrValue<string>[], ids: PromiseOrValue<BigNumberish>[], amounts: PromiseOrValue<BigNumberish>[], nonce: PromiseOrValue<BigNumberish>, sig: SignatureStruct, overrides?: Overrides & {
        from?: PromiseOrValue<string>;
    }): Promise<ContractTransaction>;
    callStatic: {
        _PERMIT_TYPEHASH(overrides?: CallOverrides): Promise<string>;
        _TOKEN_DETAILS_TYPEHASH(overrides?: CallOverrides): Promise<string>;
        bitmapPositions(nonce: PromiseOrValue<BigNumberish>, overrides?: CallOverrides): Promise<[BigNumber, number] & {
            wordPos: BigNumber;
            bitPos: number;
        }>;
        invalidateNonces(amount: PromiseOrValue<BigNumberish>, overrides?: CallOverrides): Promise<void>;
        invalidateUnorderedNonces(wordPos: PromiseOrValue<BigNumberish>, mask: PromiseOrValue<BigNumberish>, overrides?: CallOverrides): Promise<void>;
        isUsedUnorderedNonce(from: PromiseOrValue<string>, nonce: PromiseOrValue<BigNumberish>, overrides?: CallOverrides): Promise<boolean>;
        nonceBitmap(arg0: PromiseOrValue<string>, arg1: PromiseOrValue<BigNumberish>, overrides?: CallOverrides): Promise<BigNumber>;
        nonces(arg0: PromiseOrValue<string>, overrides?: CallOverrides): Promise<BigNumber>;
        transferFrom(permit: PermitStruct, from: PromiseOrValue<string>, to: PromiseOrValue<string>[], ids: PromiseOrValue<BigNumberish>[], amounts: PromiseOrValue<BigNumberish>[], sig: SignatureStruct, overrides?: CallOverrides): Promise<void>;
        unorderedTransferFrom(permit: PermitStruct, to: PromiseOrValue<string>[], ids: PromiseOrValue<BigNumberish>[], amounts: PromiseOrValue<BigNumberish>[], nonce: PromiseOrValue<BigNumberish>, sig: SignatureStruct, overrides?: CallOverrides): Promise<void>;
    };
    filters: {};
    estimateGas: {
        _PERMIT_TYPEHASH(overrides?: CallOverrides): Promise<BigNumber>;
        _TOKEN_DETAILS_TYPEHASH(overrides?: CallOverrides): Promise<BigNumber>;
        bitmapPositions(nonce: PromiseOrValue<BigNumberish>, overrides?: CallOverrides): Promise<BigNumber>;
        invalidateNonces(amount: PromiseOrValue<BigNumberish>, overrides?: Overrides & {
            from?: PromiseOrValue<string>;
        }): Promise<BigNumber>;
        invalidateUnorderedNonces(wordPos: PromiseOrValue<BigNumberish>, mask: PromiseOrValue<BigNumberish>, overrides?: Overrides & {
            from?: PromiseOrValue<string>;
        }): Promise<BigNumber>;
        isUsedUnorderedNonce(from: PromiseOrValue<string>, nonce: PromiseOrValue<BigNumberish>, overrides?: CallOverrides): Promise<BigNumber>;
        nonceBitmap(arg0: PromiseOrValue<string>, arg1: PromiseOrValue<BigNumberish>, overrides?: CallOverrides): Promise<BigNumber>;
        nonces(arg0: PromiseOrValue<string>, overrides?: CallOverrides): Promise<BigNumber>;
        transferFrom(permit: PermitStruct, from: PromiseOrValue<string>, to: PromiseOrValue<string>[], ids: PromiseOrValue<BigNumberish>[], amounts: PromiseOrValue<BigNumberish>[], sig: SignatureStruct, overrides?: Overrides & {
            from?: PromiseOrValue<string>;
        }): Promise<BigNumber>;
        unorderedTransferFrom(permit: PermitStruct, to: PromiseOrValue<string>[], ids: PromiseOrValue<BigNumberish>[], amounts: PromiseOrValue<BigNumberish>[], nonce: PromiseOrValue<BigNumberish>, sig: SignatureStruct, overrides?: Overrides & {
            from?: PromiseOrValue<string>;
        }): Promise<BigNumber>;
    };
    populateTransaction: {
        _PERMIT_TYPEHASH(overrides?: CallOverrides): Promise<PopulatedTransaction>;
        _TOKEN_DETAILS_TYPEHASH(overrides?: CallOverrides): Promise<PopulatedTransaction>;
        bitmapPositions(nonce: PromiseOrValue<BigNumberish>, overrides?: CallOverrides): Promise<PopulatedTransaction>;
        invalidateNonces(amount: PromiseOrValue<BigNumberish>, overrides?: Overrides & {
            from?: PromiseOrValue<string>;
        }): Promise<PopulatedTransaction>;
        invalidateUnorderedNonces(wordPos: PromiseOrValue<BigNumberish>, mask: PromiseOrValue<BigNumberish>, overrides?: Overrides & {
            from?: PromiseOrValue<string>;
        }): Promise<PopulatedTransaction>;
        isUsedUnorderedNonce(from: PromiseOrValue<string>, nonce: PromiseOrValue<BigNumberish>, overrides?: CallOverrides): Promise<PopulatedTransaction>;
        nonceBitmap(arg0: PromiseOrValue<string>, arg1: PromiseOrValue<BigNumberish>, overrides?: CallOverrides): Promise<PopulatedTransaction>;
        nonces(arg0: PromiseOrValue<string>, overrides?: CallOverrides): Promise<PopulatedTransaction>;
        transferFrom(permit: PermitStruct, from: PromiseOrValue<string>, to: PromiseOrValue<string>[], ids: PromiseOrValue<BigNumberish>[], amounts: PromiseOrValue<BigNumberish>[], sig: SignatureStruct, overrides?: Overrides & {
            from?: PromiseOrValue<string>;
        }): Promise<PopulatedTransaction>;
        unorderedTransferFrom(permit: PermitStruct, to: PromiseOrValue<string>[], ids: PromiseOrValue<BigNumberish>[], amounts: PromiseOrValue<BigNumberish>[], nonce: PromiseOrValue<BigNumberish>, sig: SignatureStruct, overrides?: Overrides & {
            from?: PromiseOrValue<string>;
        }): Promise<PopulatedTransaction>;
    };
}
