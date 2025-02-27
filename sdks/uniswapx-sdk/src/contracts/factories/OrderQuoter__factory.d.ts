import { Signer, ContractFactory, Overrides } from "ethers";
import type { Provider, TransactionRequest } from "@ethersproject/providers";
import type { PromiseOrValue } from "../common";
import type { OrderQuoter, OrderQuoterInterface } from "../OrderQuoter";
type OrderQuoterConstructorParams = [signer?: Signer] | ConstructorParameters<typeof ContractFactory>;
export declare class OrderQuoter__factory extends ContractFactory {
    constructor(...args: OrderQuoterConstructorParams);
    deploy(overrides?: Overrides & {
        from?: PromiseOrValue<string>;
    }): Promise<OrderQuoter>;
    getDeployTransaction(overrides?: Overrides & {
        from?: PromiseOrValue<string>;
    }): TransactionRequest;
    attach(address: string): OrderQuoter;
    connect(signer: Signer): OrderQuoter__factory;
    static readonly bytecode = "0x608060405234801561001057600080fd5b50610df8806100206000396000f3fe608060405234801561001057600080fd5b50600436106100415760003560e01c806341d88d6914610046578063585da6281461006f5780637671d07b14610084575b600080fd5b6100596100543660046104bb565b6100c5565b60405161006691906105f7565b60405180910390f35b61008261007d3660046108ec565b610221565b005b6100a0610092366004610a62565b604081810151909101015190565b60405173ffffffffffffffffffffffffffffffffffffffff9091168152602001610066565b6040805161016081018252600060a0820181815260c0830182905260e083018290526101008301829052610120830182905260606101408401819052908352835180820185528281526020808201849052818601849052840152928201839052828201929092526080810191909152604080840151840101516040805180820182528581526020808201869052825190810183526000815291517f0d33588400000000000000000000000000000000000000000000000000000000815273ffffffffffffffffffffffffffffffffffffffff9390931692630d335884926101af9291600401610a9f565b600060405180830381600087803b1580156101c957600080fd5b505af19250505080156101da575060015b61021b573d808015610208576040519150601f19603f3d011682016040523d82523d6000602084013e61020d565b606091505b50610217816102a2565b9150505b92915050565b815160011461025c576040517f06ee987800000000000000000000000000000000000000000000000000000000815260040160405180910390fd5b60008260008151811061027157610271610b13565b602002602001015160405160200161028991906105f7565b6040516020818303038152906040529050805181602001fd5b6040805161016081018252600060a0820181815260c080840183905260e08401839052610100840183905261012084018390526060610140850181905291845284518083018652838152602080820185905281870185905285015293830181905280830152608082015282519091111561031e57815182602001fd5b8180602001905181019061021b9190610cf0565b7f4e487b7100000000000000000000000000000000000000000000000000000000600052604160045260246000fd5b60405160c0810167ffffffffffffffff8111828210171561038457610384610332565b60405290565b6040516060810167ffffffffffffffff8111828210171561038457610384610332565b60405160a0810167ffffffffffffffff8111828210171561038457610384610332565b604051601f82017fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffe016810167ffffffffffffffff8111828210171561041757610417610332565b604052919050565b600067ffffffffffffffff82111561043957610439610332565b50601f017fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffe01660200190565b600082601f83011261047657600080fd5b81356104896104848261041f565b6103d0565b81815284602083860101111561049e57600080fd5b816020850160208301376000918101602001919091529392505050565b600080604083850312156104ce57600080fd5b823567ffffffffffffffff808211156104e657600080fd5b6104f286838701610465565b9350602085013591508082111561050857600080fd5b5061051585828601610465565b9150509250929050565b60005b8381101561053a578181015183820152602001610522565b50506000910152565b6000815180845261055b81602086016020860161051f565b601f017fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffe0169290920160200192915050565b600081518084526020808501945080840160005b838110156105ec578151805173ffffffffffffffffffffffffffffffffffffffff908116895284820151858a01526040918201511690880152606090960195908201906001016105a1565b509495945050505050565b602081526000825160e0602084015273ffffffffffffffffffffffffffffffffffffffff808251166101008501528060208301511661012085015260408201516101408501526060820151610160850152806080830151166101808501525060a0810151905060c06101a08401526106736101c0840182610543565b905060208401516106b16040850182805173ffffffffffffffffffffffffffffffffffffffff16825260208082015190830152604090810151910152565b5060408401517fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffe0808584030160a08601526106ec838361058d565b925060608601519150808584030160c08601525061070a8282610543565b915050608084015160e08401528091505092915050565b600067ffffffffffffffff82111561073b5761073b610332565b5060051b60200190565b73ffffffffffffffffffffffffffffffffffffffff8116811461076757600080fd5b50565b600060c0828403121561077c57600080fd5b610784610361565b9050813561079181610745565b815260208201356107a181610745565b80602083015250604082013560408201526060820135606082015260808201356107ca81610745565b608082015260a082013567ffffffffffffffff8111156107e957600080fd5b6107f584828501610465565b60a08301525092915050565b60006060828403121561081357600080fd5b61081b61038a565b9050813561082881610745565b80825250602082013560208201526040820135604082015292915050565b600082601f83011261085757600080fd5b8135602061086761048483610721565b8281526060928302850182019282820191908785111561088657600080fd5b8387015b858110156108df5781818a0312156108a25760008081fd5b6108aa61038a565b81356108b581610745565b815281860135868201526040808301356108ce81610745565b90820152845292840192810161088a565b5090979650505050505050565b600080604083850312156108ff57600080fd5b823567ffffffffffffffff8082111561091757600080fd5b818501915085601f83011261092b57600080fd5b8135602061093b61048483610721565b82815260059290921b8401810191818101908984111561095a57600080fd5b8286015b84811015610a4b578035868111156109765760008081fd5b870160e0818d037fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffe0018113156109ac5760008081fd5b6109b46103ad565b86830135898111156109c65760008081fd5b6109d48f898387010161076a565b8252506109e48e60408501610801565b8782015260a0830135898111156109fb5760008081fd5b610a098f8983870101610846565b60408301525060c083013589811115610a225760008081fd5b610a308f8983870101610465565b6060830152509101356080820152835291830191830161095e565b509650508601359250508082111561050857600080fd5b600060208284031215610a7457600080fd5b813567ffffffffffffffff811115610a8b57600080fd5b610a9784828501610465565b949350505050565b6040815260008351604080840152610aba6080840182610543565b905060208501517fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffc0848303016060850152610af58282610543565b9150508281036020840152610b0a8185610543565b95945050505050565b7f4e487b7100000000000000000000000000000000000000000000000000000000600052603260045260246000fd5b600082601f830112610b5357600080fd5b8151610b616104848261041f565b818152846020838601011115610b7657600080fd5b610a9782602083016020870161051f565b600060c08284031215610b9957600080fd5b610ba1610361565b90508151610bae81610745565b81526020820151610bbe81610745565b8060208301525060408201516040820152606082015160608201526080820151610be781610745565b608082015260a082015167ffffffffffffffff811115610c0657600080fd5b6107f584828501610b42565b600060608284031215610c2457600080fd5b610c2c61038a565b90508151610c3981610745565b80825250602082015160208201526040820151604082015292915050565b600082601f830112610c6857600080fd5b81516020610c7861048483610721565b82815260609283028501820192828201919087851115610c9757600080fd5b8387015b858110156108df5781818a031215610cb35760008081fd5b610cbb61038a565b8151610cc681610745565b81528186015186820152604080830151610cdf81610745565b908201528452928401928101610c9b565b600060208284031215610d0257600080fd5b815167ffffffffffffffff80821115610d1a57600080fd5b9083019060e08286031215610d2e57600080fd5b610d366103ad565b825182811115610d4557600080fd5b610d5187828601610b87565b825250610d618660208501610c12565b6020820152608083015182811115610d7857600080fd5b610d8487828601610c57565b60408301525060a083015182811115610d9c57600080fd5b610da887828601610b42565b60608301525060c09290920151608083015250939250505056fea26469706673582212200f8bfac10e493298054283c6a1044fad50f6979a90490fcbe07d79ecea4c1f8964736f6c63430008130033";
    static readonly abi: readonly [{
        readonly inputs: readonly [];
        readonly name: "OrdersLengthIncorrect";
        readonly type: "error";
    }, {
        readonly inputs: readonly [{
            readonly internalType: "bytes";
            readonly name: "order";
            readonly type: "bytes";
        }];
        readonly name: "getReactor";
        readonly outputs: readonly [{
            readonly internalType: "contract IReactor";
            readonly name: "reactor";
            readonly type: "address";
        }];
        readonly stateMutability: "pure";
        readonly type: "function";
    }, {
        readonly inputs: readonly [{
            readonly internalType: "bytes";
            readonly name: "order";
            readonly type: "bytes";
        }, {
            readonly internalType: "bytes";
            readonly name: "sig";
            readonly type: "bytes";
        }];
        readonly name: "quote";
        readonly outputs: readonly [{
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
            readonly name: "result";
            readonly type: "tuple";
        }];
        readonly stateMutability: "nonpayable";
        readonly type: "function";
    }, {
        readonly inputs: readonly [{
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
            readonly internalType: "struct ResolvedOrder[]";
            readonly name: "resolvedOrders";
            readonly type: "tuple[]";
        }, {
            readonly internalType: "bytes";
            readonly name: "";
            readonly type: "bytes";
        }];
        readonly name: "reactorCallback";
        readonly outputs: readonly [];
        readonly stateMutability: "pure";
        readonly type: "function";
    }];
    static createInterface(): OrderQuoterInterface;
    static connect(address: string, signerOrProvider: Signer | Provider): OrderQuoter;
}
export {};
