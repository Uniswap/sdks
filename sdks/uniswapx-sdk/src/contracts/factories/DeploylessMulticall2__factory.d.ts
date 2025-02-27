import { Signer } from "ethers";
import type { Provider } from "@ethersproject/providers";
import type { DeploylessMulticall2, DeploylessMulticall2Interface } from "../DeploylessMulticall2";
export declare class DeploylessMulticall2__factory {
    static readonly abi: readonly [{
        readonly inputs: readonly [{
            readonly internalType: "bool";
            readonly name: "requireSuccess";
            readonly type: "bool";
        }, {
            readonly components: readonly [{
                readonly internalType: "address";
                readonly name: "target";
                readonly type: "address";
            }, {
                readonly internalType: "bytes";
                readonly name: "callData";
                readonly type: "bytes";
            }];
            readonly internalType: "struct DeploylessMulticall2.Call[]";
            readonly name: "calls";
            readonly type: "tuple[]";
        }];
        readonly stateMutability: "nonpayable";
        readonly type: "constructor";
    }];
    static createInterface(): DeploylessMulticall2Interface;
    static connect(address: string, signerOrProvider: Signer | Provider): DeploylessMulticall2;
}
