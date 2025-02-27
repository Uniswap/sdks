import { Interface } from "@ethersproject/abi";
import { StaticJsonRpcProvider } from "@ethersproject/providers";
import { BlockOverrides } from "../order";
export type MulticallParams = {
    contractInterface: Interface;
    functionName: string;
};
export type MulticallSameContractParams<TFunctionParams> = MulticallParams & {
    address: string;
    functionParams: TFunctionParams[];
};
export type MulticallSameFunctionParams<TFunctionParams> = MulticallParams & {
    addresses: string[];
    functionParam: TFunctionParams;
};
export type MulticallResult = {
    success: boolean;
    returnData: string;
};
type Call = {
    target: string;
    callData: string;
};
export declare function multicallSameContractManyFunctions<TFunctionParams extends any[] | undefined>(provider: StaticJsonRpcProvider, params: MulticallSameContractParams<TFunctionParams>, stateOverrrides?: {
    code?: string;
    state?: any;
}, blockOverrides?: BlockOverrides): Promise<MulticallResult[]>;
export declare function multicallSameFunctionManyContracts<TFunctionParams extends any[] | undefined>(provider: StaticJsonRpcProvider, params: MulticallSameFunctionParams<TFunctionParams>, stateOverrrides?: {
    code?: string;
    state?: any;
}, blockOverrides?: BlockOverrides): Promise<MulticallResult[]>;
export declare function multicall(provider: StaticJsonRpcProvider, calls: Call[], stateOverrides?: {
    code?: string;
    state?: any;
}, blockOverrides?: BlockOverrides): Promise<MulticallResult[]>;
export {};
