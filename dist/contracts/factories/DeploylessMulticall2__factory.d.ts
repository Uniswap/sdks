import { Signer } from "ethers";
import type { Provider } from "@ethersproject/providers";
import type { DeploylessMulticall2, DeploylessMulticall2Interface } from "../DeploylessMulticall2";
export declare class DeploylessMulticall2__factory {
    static readonly abi: {
        inputs: ({
            internalType: string;
            name: string;
            type: string;
            components?: undefined;
        } | {
            components: {
                internalType: string;
                name: string;
                type: string;
            }[];
            internalType: string;
            name: string;
            type: string;
        })[];
        stateMutability: string;
        type: string;
    }[];
    static createInterface(): DeploylessMulticall2Interface;
    static connect(address: string, signerOrProvider: Signer | Provider): DeploylessMulticall2;
}
