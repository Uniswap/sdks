import { BaseProvider } from '@ethersproject/providers';
import { Interface } from '@ethersproject/abi';
export declare type MulticallParams<TFunctionParams> = {
    address: string;
    contractInterface: Interface;
    functionName: string;
    functionParams: TFunctionParams[];
};
export declare type MulticallResult = {
    success: boolean;
    returnData: string;
};
export declare function multicall<TFunctionParams extends any[] | undefined>(provider: BaseProvider, params: MulticallParams<TFunctionParams>): Promise<MulticallResult[]>;
