import { Signer, ContractFactory, BigNumberish, Overrides } from "ethers";
import type { Provider, TransactionRequest } from "@ethersproject/providers";
import type { PromiseOrValue } from "../common";
import type { MockERC20, MockERC20Interface } from "../MockERC20";
type MockERC20ConstructorParams = [signer?: Signer] | ConstructorParameters<typeof ContractFactory>;
export declare class MockERC20__factory extends ContractFactory {
    constructor(...args: MockERC20ConstructorParams);
    deploy(name: PromiseOrValue<string>, symbol: PromiseOrValue<string>, decimals: PromiseOrValue<BigNumberish>, overrides?: Overrides & {
        from?: PromiseOrValue<string>;
    }): Promise<MockERC20>;
    getDeployTransaction(name: PromiseOrValue<string>, symbol: PromiseOrValue<string>, decimals: PromiseOrValue<BigNumberish>, overrides?: Overrides & {
        from?: PromiseOrValue<string>;
    }): TransactionRequest;
    attach(address: string): MockERC20;
    connect(signer: Signer): MockERC20__factory;
    static readonly bytecode = "0x60e06040523480156200001157600080fd5b5060405162001039380380620010398339810160408190526200003491620001db565b8282826000620000458482620002ef565b506001620000548382620002ef565b5060ff81166080524660a0526200006a6200007a565b60c0525062000439945050505050565b60007f8b73c3c69bb8fe3d512ecc4cf759cc79239f7b179b0ffacaa9a75d522b39400f6000604051620000ae9190620003bb565b6040805191829003822060208301939093528101919091527fc89efdaa54c0f20c7adf612882df0950f5a951637e0307cdcb4c672f298b8bc660608201524660808201523060a082015260c00160405160208183030381529060405280519060200120905090565b634e487b7160e01b600052604160045260246000fd5b600082601f8301126200013e57600080fd5b81516001600160401b03808211156200015b576200015b62000116565b604051601f8301601f19908116603f0116810190828211818310171562000186576200018662000116565b81604052838152602092508683858801011115620001a357600080fd5b600091505b83821015620001c75785820183015181830184015290820190620001a8565b600093810190920192909252949350505050565b600080600060608486031215620001f157600080fd5b83516001600160401b03808211156200020957600080fd5b62000217878388016200012c565b945060208601519150808211156200022e57600080fd5b506200023d868287016200012c565b925050604084015160ff811681146200025557600080fd5b809150509250925092565b600181811c908216806200027557607f821691505b6020821081036200029657634e487b7160e01b600052602260045260246000fd5b50919050565b601f821115620002ea57600081815260208120601f850160051c81016020861015620002c55750805b601f850160051c820191505b81811015620002e657828155600101620002d1565b5050505b505050565b81516001600160401b038111156200030b576200030b62000116565b62000323816200031c845462000260565b846200029c565b602080601f8311600181146200035b5760008415620003425750858301515b600019600386901b1c1916600185901b178555620002e6565b600085815260208120601f198616915b828110156200038c578886015182559484019460019091019084016200036b565b5085821015620003ab5787850151600019600388901b60f8161c191681555b5050505050600190811b01905550565b6000808354620003cb8162000260565b60018281168015620003e65760018114620003fc576200042d565b60ff19841687528215158302870194506200042d565b8760005260208060002060005b85811015620004245781548a82015290840190820162000409565b50505082870194505b50929695505050505050565b60805160a05160c051610bd06200046960003960006104820152600061044d0152600061015f0152610bd06000f3fe608060405234801561001057600080fd5b50600436106100ea5760003560e01c806361f49ed61161008c57806395d89b411161006657806395d89b4114610203578063a9059cbb1461020b578063d505accf1461021e578063dd62ed3e1461023157600080fd5b806361f49ed6146101b057806370a08231146101c35780637ecebe00146101e357600080fd5b806323b872dd116100c857806323b872dd14610147578063313ce5671461015a5780633644e5151461019357806340c10f191461019b57600080fd5b806306fdde03146100ef578063095ea7b31461010d57806318160ddd14610130575b600080fd5b6100f761025c565b60405161010491906108ed565b60405180910390f35b61012061011b366004610957565b6102ea565b6040519015158152602001610104565b61013960025481565b604051908152602001610104565b610120610155366004610981565b610357565b6101817f000000000000000000000000000000000000000000000000000000000000000081565b60405160ff9091168152602001610104565b610139610449565b6101ae6101a9366004610957565b6104a4565b005b6101206101be366004610981565b6104b2565b6101396101d13660046109bd565b60036020526000908152604090205481565b6101396101f13660046109bd565b60056020526000908152604090205481565b6100f761051a565b610120610219366004610957565b610527565b6101ae61022c3660046109df565b61059f565b61013961023f366004610a52565b600460209081526000928352604080842090915290825290205481565b6000805461026990610a85565b80601f016020809104026020016040519081016040528092919081815260200182805461029590610a85565b80156102e25780601f106102b7576101008083540402835291602001916102e2565b820191906000526020600020905b8154815290600101906020018083116102c557829003601f168201915b505050505081565b3360008181526004602090815260408083206001600160a01b038716808552925280832085905551919290917f8c5be1e5ebec7d5bd14f71427d1e84f3dd0314c0f7b2291e5b200ac8c7c3b925906103459086815260200190565b60405180910390a35060015b92915050565b6001600160a01b038316600090815260046020908152604080832033845290915281205460001981146103b35761038e8382610ad5565b6001600160a01b03861660009081526004602090815260408083203384529091529020555b6001600160a01b038516600090815260036020526040812080548592906103db908490610ad5565b90915550506001600160a01b03808516600081815260036020526040908190208054870190555190918716907fddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef906104369087815260200190565b60405180910390a3506001949350505050565b60007f0000000000000000000000000000000000000000000000000000000000000000461461047f5761047a6107e8565b905090565b507f000000000000000000000000000000000000000000000000000000000000000090565b6104ae8282610882565b5050565b6001600160a01b03838116600081815260046020908152604080832094871680845294825280832086905551858152919392917f8c5be1e5ebec7d5bd14f71427d1e84f3dd0314c0f7b2291e5b200ac8c7c3b925910160405180910390a35060019392505050565b6001805461026990610a85565b33600090815260036020526040812080548391908390610548908490610ad5565b90915550506001600160a01b038316600081815260036020526040908190208054850190555133907fddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef906103459086815260200190565b428410156105f45760405162461bcd60e51b815260206004820152601760248201527f5045524d49545f444541444c494e455f4558504952454400000000000000000060448201526064015b60405180910390fd5b60006001610600610449565b6001600160a01b038a811660008181526005602090815260409182902080546001810190915582517f6e71edae12b1b97f4d1f60370fef10105fa2faae0126114a169c64845d6126c98184015280840194909452938d166060840152608083018c905260a083019390935260c08083018b90528151808403909101815260e08301909152805192019190912061190160f01b6101008301526101028201929092526101228101919091526101420160408051601f198184030181528282528051602091820120600084529083018083525260ff871690820152606081018590526080810184905260a0016020604051602081039080840390855afa15801561070c573d6000803e3d6000fd5b5050604051601f1901519150506001600160a01b038116158015906107425750876001600160a01b0316816001600160a01b0316145b61077f5760405162461bcd60e51b815260206004820152600e60248201526d24a72b20a624a22fa9a4a3a722a960911b60448201526064016105eb565b6001600160a01b0390811660009081526004602090815260408083208a8516808552908352928190208990555188815291928a16917f8c5be1e5ebec7d5bd14f71427d1e84f3dd0314c0f7b2291e5b200ac8c7c3b925910160405180910390a350505050505050565b60007f8b73c3c69bb8fe3d512ecc4cf759cc79239f7b179b0ffacaa9a75d522b39400f600060405161081a9190610ae8565b6040805191829003822060208301939093528101919091527fc89efdaa54c0f20c7adf612882df0950f5a951637e0307cdcb4c672f298b8bc660608201524660808201523060a082015260c00160405160208183030381529060405280519060200120905090565b80600260008282546108949190610b87565b90915550506001600160a01b0382166000818152600360209081526040808320805486019055518481527fddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef910160405180910390a35050565b600060208083528351808285015260005b8181101561091a578581018301518582016040015282016108fe565b506000604082860101526040601f19601f8301168501019250505092915050565b80356001600160a01b038116811461095257600080fd5b919050565b6000806040838503121561096a57600080fd5b6109738361093b565b946020939093013593505050565b60008060006060848603121561099657600080fd5b61099f8461093b565b92506109ad6020850161093b565b9150604084013590509250925092565b6000602082840312156109cf57600080fd5b6109d88261093b565b9392505050565b600080600080600080600060e0888a0312156109fa57600080fd5b610a038861093b565b9650610a116020890161093b565b95506040880135945060608801359350608088013560ff81168114610a3557600080fd5b9699959850939692959460a0840135945060c09093013592915050565b60008060408385031215610a6557600080fd5b610a6e8361093b565b9150610a7c6020840161093b565b90509250929050565b600181811c90821680610a9957607f821691505b602082108103610ab957634e487b7160e01b600052602260045260246000fd5b50919050565b634e487b7160e01b600052601160045260246000fd5b8181038181111561035157610351610abf565b600080835481600182811c915080831680610b0457607f831692505b60208084108203610b2357634e487b7160e01b86526022600452602486fd5b818015610b375760018114610b4c57610b79565b60ff1986168952841515850289019650610b79565b60008a81526020902060005b86811015610b715781548b820152908501908301610b58565b505084890196505b509498975050505050505050565b8082018082111561035157610351610abf56fea26469706673582212203582f9ba28e259cd1bb001b79d8e065911e52d22256508983534d64d7fdc459664736f6c63430008100033";
    static readonly abi: readonly [{
        readonly inputs: readonly [{
            readonly internalType: "string";
            readonly name: "name";
            readonly type: "string";
        }, {
            readonly internalType: "string";
            readonly name: "symbol";
            readonly type: "string";
        }, {
            readonly internalType: "uint8";
            readonly name: "decimals";
            readonly type: "uint8";
        }];
        readonly stateMutability: "nonpayable";
        readonly type: "constructor";
    }, {
        readonly anonymous: false;
        readonly inputs: readonly [{
            readonly indexed: true;
            readonly internalType: "address";
            readonly name: "owner";
            readonly type: "address";
        }, {
            readonly indexed: true;
            readonly internalType: "address";
            readonly name: "spender";
            readonly type: "address";
        }, {
            readonly indexed: false;
            readonly internalType: "uint256";
            readonly name: "amount";
            readonly type: "uint256";
        }];
        readonly name: "Approval";
        readonly type: "event";
    }, {
        readonly anonymous: false;
        readonly inputs: readonly [{
            readonly indexed: true;
            readonly internalType: "address";
            readonly name: "from";
            readonly type: "address";
        }, {
            readonly indexed: true;
            readonly internalType: "address";
            readonly name: "to";
            readonly type: "address";
        }, {
            readonly indexed: false;
            readonly internalType: "uint256";
            readonly name: "amount";
            readonly type: "uint256";
        }];
        readonly name: "Transfer";
        readonly type: "event";
    }, {
        readonly inputs: readonly [];
        readonly name: "DOMAIN_SEPARATOR";
        readonly outputs: readonly [{
            readonly internalType: "bytes32";
            readonly name: "";
            readonly type: "bytes32";
        }];
        readonly stateMutability: "view";
        readonly type: "function";
    }, {
        readonly inputs: readonly [{
            readonly internalType: "address";
            readonly name: "";
            readonly type: "address";
        }, {
            readonly internalType: "address";
            readonly name: "";
            readonly type: "address";
        }];
        readonly name: "allowance";
        readonly outputs: readonly [{
            readonly internalType: "uint256";
            readonly name: "";
            readonly type: "uint256";
        }];
        readonly stateMutability: "view";
        readonly type: "function";
    }, {
        readonly inputs: readonly [{
            readonly internalType: "address";
            readonly name: "spender";
            readonly type: "address";
        }, {
            readonly internalType: "uint256";
            readonly name: "amount";
            readonly type: "uint256";
        }];
        readonly name: "approve";
        readonly outputs: readonly [{
            readonly internalType: "bool";
            readonly name: "";
            readonly type: "bool";
        }];
        readonly stateMutability: "nonpayable";
        readonly type: "function";
    }, {
        readonly inputs: readonly [{
            readonly internalType: "address";
            readonly name: "";
            readonly type: "address";
        }];
        readonly name: "balanceOf";
        readonly outputs: readonly [{
            readonly internalType: "uint256";
            readonly name: "";
            readonly type: "uint256";
        }];
        readonly stateMutability: "view";
        readonly type: "function";
    }, {
        readonly inputs: readonly [];
        readonly name: "decimals";
        readonly outputs: readonly [{
            readonly internalType: "uint8";
            readonly name: "";
            readonly type: "uint8";
        }];
        readonly stateMutability: "view";
        readonly type: "function";
    }, {
        readonly inputs: readonly [{
            readonly internalType: "address";
            readonly name: "_from";
            readonly type: "address";
        }, {
            readonly internalType: "address";
            readonly name: "_to";
            readonly type: "address";
        }, {
            readonly internalType: "uint256";
            readonly name: "_amount";
            readonly type: "uint256";
        }];
        readonly name: "forceApprove";
        readonly outputs: readonly [{
            readonly internalType: "bool";
            readonly name: "";
            readonly type: "bool";
        }];
        readonly stateMutability: "nonpayable";
        readonly type: "function";
    }, {
        readonly inputs: readonly [{
            readonly internalType: "address";
            readonly name: "_to";
            readonly type: "address";
        }, {
            readonly internalType: "uint256";
            readonly name: "_amount";
            readonly type: "uint256";
        }];
        readonly name: "mint";
        readonly outputs: readonly [];
        readonly stateMutability: "nonpayable";
        readonly type: "function";
    }, {
        readonly inputs: readonly [];
        readonly name: "name";
        readonly outputs: readonly [{
            readonly internalType: "string";
            readonly name: "";
            readonly type: "string";
        }];
        readonly stateMutability: "view";
        readonly type: "function";
    }, {
        readonly inputs: readonly [{
            readonly internalType: "address";
            readonly name: "";
            readonly type: "address";
        }];
        readonly name: "nonces";
        readonly outputs: readonly [{
            readonly internalType: "uint256";
            readonly name: "";
            readonly type: "uint256";
        }];
        readonly stateMutability: "view";
        readonly type: "function";
    }, {
        readonly inputs: readonly [{
            readonly internalType: "address";
            readonly name: "owner";
            readonly type: "address";
        }, {
            readonly internalType: "address";
            readonly name: "spender";
            readonly type: "address";
        }, {
            readonly internalType: "uint256";
            readonly name: "value";
            readonly type: "uint256";
        }, {
            readonly internalType: "uint256";
            readonly name: "deadline";
            readonly type: "uint256";
        }, {
            readonly internalType: "uint8";
            readonly name: "v";
            readonly type: "uint8";
        }, {
            readonly internalType: "bytes32";
            readonly name: "r";
            readonly type: "bytes32";
        }, {
            readonly internalType: "bytes32";
            readonly name: "s";
            readonly type: "bytes32";
        }];
        readonly name: "permit";
        readonly outputs: readonly [];
        readonly stateMutability: "nonpayable";
        readonly type: "function";
    }, {
        readonly inputs: readonly [];
        readonly name: "symbol";
        readonly outputs: readonly [{
            readonly internalType: "string";
            readonly name: "";
            readonly type: "string";
        }];
        readonly stateMutability: "view";
        readonly type: "function";
    }, {
        readonly inputs: readonly [];
        readonly name: "totalSupply";
        readonly outputs: readonly [{
            readonly internalType: "uint256";
            readonly name: "";
            readonly type: "uint256";
        }];
        readonly stateMutability: "view";
        readonly type: "function";
    }, {
        readonly inputs: readonly [{
            readonly internalType: "address";
            readonly name: "to";
            readonly type: "address";
        }, {
            readonly internalType: "uint256";
            readonly name: "amount";
            readonly type: "uint256";
        }];
        readonly name: "transfer";
        readonly outputs: readonly [{
            readonly internalType: "bool";
            readonly name: "";
            readonly type: "bool";
        }];
        readonly stateMutability: "nonpayable";
        readonly type: "function";
    }, {
        readonly inputs: readonly [{
            readonly internalType: "address";
            readonly name: "from";
            readonly type: "address";
        }, {
            readonly internalType: "address";
            readonly name: "to";
            readonly type: "address";
        }, {
            readonly internalType: "uint256";
            readonly name: "amount";
            readonly type: "uint256";
        }];
        readonly name: "transferFrom";
        readonly outputs: readonly [{
            readonly internalType: "bool";
            readonly name: "";
            readonly type: "bool";
        }];
        readonly stateMutability: "nonpayable";
        readonly type: "function";
    }];
    static createInterface(): MockERC20Interface;
    static connect(address: string, signerOrProvider: Signer | Provider): MockERC20;
}
export {};
