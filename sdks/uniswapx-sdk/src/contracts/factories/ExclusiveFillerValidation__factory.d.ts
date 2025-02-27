import { Signer, ContractFactory, Overrides } from "ethers";
import type { Provider, TransactionRequest } from "@ethersproject/providers";
import type { PromiseOrValue } from "../common";
import type { ExclusiveFillerValidation, ExclusiveFillerValidationInterface } from "../ExclusiveFillerValidation";
type ExclusiveFillerValidationConstructorParams = [signer?: Signer] | ConstructorParameters<typeof ContractFactory>;
export declare class ExclusiveFillerValidation__factory extends ContractFactory {
    constructor(...args: ExclusiveFillerValidationConstructorParams);
    deploy(overrides?: Overrides & {
        from?: PromiseOrValue<string>;
    }): Promise<ExclusiveFillerValidation>;
    getDeployTransaction(overrides?: Overrides & {
        from?: PromiseOrValue<string>;
    }): TransactionRequest;
    attach(address: string): ExclusiveFillerValidation;
    connect(signer: Signer): ExclusiveFillerValidation__factory;
    static readonly bytecode = "0x608060405234801561001057600080fd5b5061028e806100206000396000f3fe608060405234801561001057600080fd5b506004361061002b5760003560e01c80636e84ba2b14610030575b600080fd5b61004361003e36600461012b565b610045565b005b6000806100528380610182565b6100609060a08101906101c0565b81019061006d919061022c565b915091504281101580156100ad57508173ffffffffffffffffffffffffffffffffffffffff168473ffffffffffffffffffffffffffffffffffffffff1614155b15610100576040517f75c1bb1400000000000000000000000000000000000000000000000000000000815273ffffffffffffffffffffffffffffffffffffffff8516600482015260240160405180910390fd5b50505050565b73ffffffffffffffffffffffffffffffffffffffff8116811461012857600080fd5b50565b6000806040838503121561013e57600080fd5b823561014981610106565b9150602083013567ffffffffffffffff81111561016557600080fd5b830160e0818603121561017757600080fd5b809150509250929050565b600082357fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff418336030181126101b657600080fd5b9190910192915050565b60008083357fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffe18436030181126101f557600080fd5b83018035915067ffffffffffffffff82111561021057600080fd5b60200191503681900382131561022557600080fd5b9250929050565b6000806040838503121561023f57600080fd5b823561024a81610106565b94602093909301359350505056fea26469706673582212202652af5f1081880a9970e6ddff1d7310c1d0628325e5337a98595a88d332dd8164736f6c63430008130033";
    static readonly abi: readonly [{
        readonly inputs: readonly [{
            readonly internalType: "address";
            readonly name: "filler";
            readonly type: "address";
        }];
        readonly name: "NotExclusiveFiller";
        readonly type: "error";
    }, {
        readonly inputs: readonly [{
            readonly internalType: "address";
            readonly name: "filler";
            readonly type: "address";
        }, {
            readonly components: readonly [{
                readonly components: readonly [{
                    readonly internalType: "contract IReactor";
                    readonly name: "reactor";
                    readonly type: "address";
                }, {
                    readonly internalType: "address";
                    readonly name: "swapper";
                    readonly type: "address";
                }, {
                    readonly internalType: "uint256";
                    readonly name: "nonce";
                    readonly type: "uint256";
                }, {
                    readonly internalType: "uint256";
                    readonly name: "deadline";
                    readonly type: "uint256";
                }, {
                    readonly internalType: "contract IValidationCallback";
                    readonly name: "additionalValidationContract";
                    readonly type: "address";
                }, {
                    readonly internalType: "bytes";
                    readonly name: "additionalValidationData";
                    readonly type: "bytes";
                }];
                readonly internalType: "struct OrderInfo";
                readonly name: "info";
                readonly type: "tuple";
            }, {
                readonly components: readonly [{
                    readonly internalType: "contract ERC20";
                    readonly name: "token";
                    readonly type: "address";
                }, {
                    readonly internalType: "uint256";
                    readonly name: "amount";
                    readonly type: "uint256";
                }, {
                    readonly internalType: "uint256";
                    readonly name: "maxAmount";
                    readonly type: "uint256";
                }];
                readonly internalType: "struct InputToken";
                readonly name: "input";
                readonly type: "tuple";
            }, {
                readonly components: readonly [{
                    readonly internalType: "address";
                    readonly name: "token";
                    readonly type: "address";
                }, {
                    readonly internalType: "uint256";
                    readonly name: "amount";
                    readonly type: "uint256";
                }, {
                    readonly internalType: "address";
                    readonly name: "recipient";
                    readonly type: "address";
                }];
                readonly internalType: "struct OutputToken[]";
                readonly name: "outputs";
                readonly type: "tuple[]";
            }, {
                readonly internalType: "bytes";
                readonly name: "sig";
                readonly type: "bytes";
            }, {
                readonly internalType: "bytes32";
                readonly name: "hash";
                readonly type: "bytes32";
            }];
            readonly internalType: "struct ResolvedOrder";
            readonly name: "resolvedOrder";
            readonly type: "tuple";
        }];
        readonly name: "validate";
        readonly outputs: readonly [];
        readonly stateMutability: "view";
        readonly type: "function";
    }];
    static createInterface(): ExclusiveFillerValidationInterface;
    static connect(address: string, signerOrProvider: Signer | Provider): ExclusiveFillerValidation;
}
export {};
