import { Signer, ContractFactory, Overrides } from "ethers";
import type { Provider, TransactionRequest } from "@ethersproject/providers";
import type { PromiseOrValue } from "../common";
import type { SwapRouter02Executor, SwapRouter02ExecutorInterface } from "../SwapRouter02Executor";
type SwapRouter02ExecutorConstructorParams = [signer?: Signer] | ConstructorParameters<typeof ContractFactory>;
export declare class SwapRouter02Executor__factory extends ContractFactory {
    constructor(...args: SwapRouter02ExecutorConstructorParams);
    deploy(_whitelistedCaller: PromiseOrValue<string>, _reactor: PromiseOrValue<string>, _owner: PromiseOrValue<string>, _swapRouter02: PromiseOrValue<string>, overrides?: Overrides & {
        from?: PromiseOrValue<string>;
    }): Promise<SwapRouter02Executor>;
    getDeployTransaction(_whitelistedCaller: PromiseOrValue<string>, _reactor: PromiseOrValue<string>, _owner: PromiseOrValue<string>, _swapRouter02: PromiseOrValue<string>, overrides?: Overrides & {
        from?: PromiseOrValue<string>;
    }): TransactionRequest;
    attach(address: string): SwapRouter02Executor;
    connect(signer: Signer): SwapRouter02Executor__factory;
    static readonly bytecode = "0x6101006040523480156200001257600080fd5b5060405162001a2338038062001a2383398101604081905262000035916200012b565b600080546001600160a01b0319166001600160a01b03841690811782556040518492907f8be0079c531659141344cd1fd0a4f28419497f9722a3daafe3b4186f6b6457e0908290a3506001600160a01b0380851660a05283811660c05281166080819052604080516312a9293f60e21b81529051634aa4a4fc916004808201926020929091908290030181865afa158015620000d5573d6000803e3d6000fd5b505050506040513d601f19601f82011682018060405250810190620000fb919062000193565b6001600160a01b031660e05250620001ba92505050565b6001600160a01b03811681146200012857600080fd5b50565b600080600080608085870312156200014257600080fd5b84516200014f8162000112565b6020860151909450620001628162000112565b6040860151909350620001758162000112565b6060860151909250620001888162000112565b939692955090935050565b600060208284031215620001a657600080fd5b8151620001b38162000112565b9392505050565b60805160a05160c05160e0516117f062000233600039600081816107ef01526108a10152600081816101db015281816102f201528181610452015281816109cc0152610adf0152600081816109380152610a4b0152600081816102590152818161038a0152818161051601526105ea01526117f06000f3fe60806040526004361061007f5760003560e01c80638da5cb5b1161004e5780638da5cb5b1461010d578063d0f2d8ac14610163578063e5135ec614610183578063f2fde38b146101a357600080fd5b8063585da6281461008b57806363fb0b96146100ad578063690d8320146100cd57806389a3f136146100ed57600080fd5b3661008657005b600080fd5b34801561009757600080fd5b506100ab6100a6366004610ebf565b6101c3565b005b3480156100b957600080fd5b506100ab6100c8366004610f2b565b610480565b3480156100d957600080fd5b506100ab6100e8366004610fad565b6106af565b3480156100f957600080fd5b506100ab610108366004610fad565b61073d565b34801561011957600080fd5b5060005461013a9073ffffffffffffffffffffffffffffffffffffffff1681565b60405173ffffffffffffffffffffffffffffffffffffffff909116815260200160405180910390f35b34801561016f57600080fd5b506100ab61017e366004610fd1565b610920565b34801561018f57600080fd5b506100ab61019e366004610ebf565b610a33565b3480156101af57600080fd5b506100ab6101be366004610fad565b610b52565b3373ffffffffffffffffffffffffffffffffffffffff7f00000000000000000000000000000000000000000000000000000000000000001614610232576040517f933fe52f00000000000000000000000000000000000000000000000000000000815260040160405180910390fd5b600080806102428486018661119e565b92509250925060005b83518110156102e0576102d87f00000000000000000000000000000000000000000000000000000000000000007fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff8684815181106102ab576102ab6112d4565b602002602001015173ffffffffffffffffffffffffffffffffffffffff16610c439092919063ffffffff16565b60010161024b565b5060005b825181101561034c576103447f00000000000000000000000000000000000000000000000000000000000000007fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff8584815181106102ab576102ab6112d4565b6001016102e4565b506040517f5ae401dc00000000000000000000000000000000000000000000000000000000815273ffffffffffffffffffffffffffffffffffffffff7f00000000000000000000000000000000000000000000000000000000000000001690635ae401dc906103e1907fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff908590600401611327565b6000604051808303816000875af1158015610400573d6000803e3d6000fd5b505050506040513d6000823e601f3d9081017fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffe016820160405261044691908101906113e5565b504715610477576104777f000000000000000000000000000000000000000000000000000000000000000047610d18565b50505050505050565b60005473ffffffffffffffffffffffffffffffffffffffff163314610506576040517f08c379a000000000000000000000000000000000000000000000000000000000815260206004820152600c60248201527f554e415554484f52495a4544000000000000000000000000000000000000000060448201526064015b60405180910390fd5b60005b838110156105ac5761059a7f00000000000000000000000000000000000000000000000000000000000000007fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff878785818110610568576105686112d4565b905060200201602081019061057d9190610fad565b73ffffffffffffffffffffffffffffffffffffffff169190610c43565b806105a4816114d2565b915050610509565b506040517f5ae401dc00000000000000000000000000000000000000000000000000000000815273ffffffffffffffffffffffffffffffffffffffff7f00000000000000000000000000000000000000000000000000000000000000001690635ae401dc90610643907fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff90869086906004016115de565b6000604051808303816000875af1158015610662573d6000803e3d6000fd5b505050506040513d6000823e601f3d9081017fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffe01682016040526106a891908101906113e5565b5050505050565b60005473ffffffffffffffffffffffffffffffffffffffff163314610730576040517f08c379a000000000000000000000000000000000000000000000000000000000815260206004820152600c60248201527f554e415554484f52495a4544000000000000000000000000000000000000000060448201526064016104fd565b61073a8147610dbc565b50565b60005473ffffffffffffffffffffffffffffffffffffffff1633146107be576040517f08c379a000000000000000000000000000000000000000000000000000000000815260206004820152600c60248201527f554e415554484f52495a4544000000000000000000000000000000000000000060448201526064016104fd565b6040517f70a082310000000000000000000000000000000000000000000000000000000081523060048201526000907f000000000000000000000000000000000000000000000000000000000000000073ffffffffffffffffffffffffffffffffffffffff16906370a0823190602401602060405180830381865afa15801561084b573d6000803e3d6000fd5b505050506040513d601f19601f8201168201806040525081019061086f919061166e565b6040517f2e1a7d4d000000000000000000000000000000000000000000000000000000008152600481018290529091507f000000000000000000000000000000000000000000000000000000000000000073ffffffffffffffffffffffffffffffffffffffff1690632e1a7d4d90602401600060405180830381600087803b1580156108fa57600080fd5b505af115801561090e573d6000803e3d6000fd5b5050505061091c8247610dbc565b5050565b3373ffffffffffffffffffffffffffffffffffffffff7f0000000000000000000000000000000000000000000000000000000000000000161461098f576040517f8c6e5d7100000000000000000000000000000000000000000000000000000000815260040160405180910390fd5b6040517f0d33588400000000000000000000000000000000000000000000000000000000815273ffffffffffffffffffffffffffffffffffffffff7f00000000000000000000000000000000000000000000000000000000000000001690630d33588490610a05908690869086906004016116d2565b600060405180830381600087803b158015610a1f57600080fd5b505af1158015610477573d6000803e3d6000fd5b3373ffffffffffffffffffffffffffffffffffffffff7f00000000000000000000000000000000000000000000000000000000000000001614610aa2576040517f8c6e5d7100000000000000000000000000000000000000000000000000000000815260040160405180910390fd5b6040517f13fb72c700000000000000000000000000000000000000000000000000000000815273ffffffffffffffffffffffffffffffffffffffff7f000000000000000000000000000000000000000000000000000000000000000016906313fb72c790610b1a9087908790879087906004016116f8565b600060405180830381600087803b158015610b3457600080fd5b505af1158015610b48573d6000803e3d6000fd5b5050505050505050565b60005473ffffffffffffffffffffffffffffffffffffffff163314610bd3576040517f08c379a000000000000000000000000000000000000000000000000000000000815260206004820152600c60248201527f554e415554484f52495a4544000000000000000000000000000000000000000060448201526064016104fd565b600080547fffffffffffffffffffffffff00000000000000000000000000000000000000001673ffffffffffffffffffffffffffffffffffffffff83169081178255604051909133917f8be0079c531659141344cd1fd0a4f28419497f9722a3daafe3b4186f6b6457e09190a350565b60006040517f095ea7b300000000000000000000000000000000000000000000000000000000815273ffffffffffffffffffffffffffffffffffffffff84166004820152826024820152602060006044836000895af13d15601f3d1160016000511416171691505080610d12576040517f08c379a000000000000000000000000000000000000000000000000000000000815260206004820152600e60248201527f415050524f56455f4641494c454400000000000000000000000000000000000060448201526064016104fd565b50505050565b60008273ffffffffffffffffffffffffffffffffffffffff1682611af490604051600060405180830381858888f193505050503d8060008114610d77576040519150601f19603f3d011682016040523d82523d6000602084013e610d7c565b606091505b5050905080610db7576040517ff4b3b1bc00000000000000000000000000000000000000000000000000000000815260040160405180910390fd5b505050565b600080600080600085875af1905080610db7576040517f08c379a000000000000000000000000000000000000000000000000000000000815260206004820152601360248201527f4554485f5452414e534645525f4641494c45440000000000000000000000000060448201526064016104fd565b60008083601f840112610e4357600080fd5b50813567ffffffffffffffff811115610e5b57600080fd5b6020830191508360208260051b8501011115610e7657600080fd5b9250929050565b60008083601f840112610e8f57600080fd5b50813567ffffffffffffffff811115610ea757600080fd5b602083019150836020828501011115610e7657600080fd5b60008060008060408587031215610ed557600080fd5b843567ffffffffffffffff80821115610eed57600080fd5b610ef988838901610e31565b90965094506020870135915080821115610f1257600080fd5b50610f1f87828801610e7d565b95989497509550505050565b60008060008060408587031215610f4157600080fd5b843567ffffffffffffffff80821115610f5957600080fd5b610f6588838901610e31565b90965094506020870135915080821115610f7e57600080fd5b50610f1f87828801610e31565b73ffffffffffffffffffffffffffffffffffffffff8116811461073a57600080fd5b600060208284031215610fbf57600080fd5b8135610fca81610f8b565b9392505050565b600080600060408486031215610fe657600080fd5b833567ffffffffffffffff80821115610ffe57600080fd5b908501906040828803121561101257600080fd5b9093506020850135908082111561102857600080fd5b5061103586828701610e7d565b9497909650939450505050565b7f4e487b7100000000000000000000000000000000000000000000000000000000600052604160045260246000fd5b604051601f82017fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffe016810167ffffffffffffffff811182821017156110b8576110b8611042565b604052919050565b600067ffffffffffffffff8211156110da576110da611042565b5060051b60200190565b600082601f8301126110f557600080fd5b8135602061110a611105836110c0565b611071565b82815260059290921b8401810191818101908684111561112957600080fd5b8286015b8481101561114d57803561114081610f8b565b835291830191830161112d565b509695505050505050565b600067ffffffffffffffff82111561117257611172611042565b50601f017fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffe01660200190565b6000806000606084860312156111b357600080fd5b833567ffffffffffffffff808211156111cb57600080fd5b6111d7878388016110e4565b94506020915081860135818111156111ee57600080fd5b6111fa888289016110e4565b9450506040808701358281111561121057600080fd5b8701601f8101891361122157600080fd5b803561122f611105826110c0565b81815260059190911b8201850190858101908b83111561124e57600080fd5b8684015b838110156112c25780358781111561126a5760008081fd5b8501603f81018e1361127c5760008081fd5b8881013561128c61110582611158565b8181528f898385010111156112a15760008081fd5b818984018c83013760009181018b0191909152845250918701918701611252565b50809750505050505050509250925092565b7f4e487b7100000000000000000000000000000000000000000000000000000000600052603260045260246000fd5b60005b8381101561131e578181015183820152602001611306565b50506000910152565b600060408201848352602060408185015281855180845260608601915060608160051b870101935082870160005b828110156113d7577fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffa08887030184528151805180885261139a81888a01898501611303565b601f017fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffe01696909601850195509284019290840190600101611355565b509398975050505050505050565b600060208083850312156113f857600080fd5b825167ffffffffffffffff8082111561141057600080fd5b818501915085601f83011261142457600080fd5b8151611432611105826110c0565b81815260059190911b8301840190848101908883111561145157600080fd5b8585015b838110156114c55780518581111561146d5760008081fd5b8601603f81018b1361147f5760008081fd5b87810151604061149161110583611158565b8281528d828486010111156114a65760008081fd5b6114b5838c8301848701611303565b8652505050918601918601611455565b5098975050505050505050565b60007fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff820361152a577f4e487b7100000000000000000000000000000000000000000000000000000000600052601160045260246000fd5b5060010190565b8183528181602085013750600060208284010152600060207fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffe0601f840116840101905092915050565b60008083357fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffe18436030181126115af57600080fd5b830160208101925035905067ffffffffffffffff8111156115cf57600080fd5b803603821315610e7657600080fd5b60006040820185835260206040818501528185835260608501905060608660051b86010192508660005b87811015611660577fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffa0878603018352611641828a61157a565b61164c878284611531565b965050509183019190830190600101611608565b509298975050505050505050565b60006020828403121561168057600080fd5b5051919050565b6000611693828361157a565b604085526116a5604086018284611531565b9150506116b5602084018461157a565b85830360208701526116c8838284611531565b9695505050505050565b6040815260006116e56040830186611687565b82810360208401526116c8818587611531565b6040808252810184905260006060600586901b830181019083018783805b89811015611798577fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffa087860301845282357fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffc18c3603018112611776578283fd5b611782868d8301611687565b9550506020938401939290920191600101611716565b5050505082810360208401526117af818587611531565b97965050505050505056fea26469706673582212203213842a8731c49c3a030adacfde592b28c5d22332b28c4beff280c5ee5b867964736f6c63430008130033";
    static readonly abi: readonly [{
        readonly inputs: readonly [{
            readonly internalType: "address";
            readonly name: "_whitelistedCaller";
            readonly type: "address";
        }, {
            readonly internalType: "contract IReactor";
            readonly name: "_reactor";
            readonly type: "address";
        }, {
            readonly internalType: "address";
            readonly name: "_owner";
            readonly type: "address";
        }, {
            readonly internalType: "contract ISwapRouter02";
            readonly name: "_swapRouter02";
            readonly type: "address";
        }];
        readonly stateMutability: "nonpayable";
        readonly type: "constructor";
    }, {
        readonly inputs: readonly [];
        readonly name: "CallerNotWhitelisted";
        readonly type: "error";
    }, {
        readonly inputs: readonly [];
        readonly name: "MsgSenderNotReactor";
        readonly type: "error";
    }, {
        readonly inputs: readonly [];
        readonly name: "NativeTransferFailed";
        readonly type: "error";
    }, {
        readonly anonymous: false;
        readonly inputs: readonly [{
            readonly indexed: true;
            readonly internalType: "address";
            readonly name: "user";
            readonly type: "address";
        }, {
            readonly indexed: true;
            readonly internalType: "address";
            readonly name: "newOwner";
            readonly type: "address";
        }];
        readonly name: "OwnershipTransferred";
        readonly type: "event";
    }, {
        readonly inputs: readonly [{
            readonly components: readonly [{
                readonly internalType: "bytes";
                readonly name: "order";
                readonly type: "bytes";
            }, {
                readonly internalType: "bytes";
                readonly name: "sig";
                readonly type: "bytes";
            }];
            readonly internalType: "struct SignedOrder";
            readonly name: "order";
            readonly type: "tuple";
        }, {
            readonly internalType: "bytes";
            readonly name: "callbackData";
            readonly type: "bytes";
        }];
        readonly name: "execute";
        readonly outputs: readonly [];
        readonly stateMutability: "nonpayable";
        readonly type: "function";
    }, {
        readonly inputs: readonly [{
            readonly components: readonly [{
                readonly internalType: "bytes";
                readonly name: "order";
                readonly type: "bytes";
            }, {
                readonly internalType: "bytes";
                readonly name: "sig";
                readonly type: "bytes";
            }];
            readonly internalType: "struct SignedOrder[]";
            readonly name: "orders";
            readonly type: "tuple[]";
        }, {
            readonly internalType: "bytes";
            readonly name: "callbackData";
            readonly type: "bytes";
        }];
        readonly name: "executeBatch";
        readonly outputs: readonly [];
        readonly stateMutability: "nonpayable";
        readonly type: "function";
    }, {
        readonly inputs: readonly [{
            readonly internalType: "contract ERC20[]";
            readonly name: "tokensToApprove";
            readonly type: "address[]";
        }, {
            readonly internalType: "bytes[]";
            readonly name: "multicallData";
            readonly type: "bytes[]";
        }];
        readonly name: "multicall";
        readonly outputs: readonly [];
        readonly stateMutability: "nonpayable";
        readonly type: "function";
    }, {
        readonly inputs: readonly [];
        readonly name: "owner";
        readonly outputs: readonly [{
            readonly internalType: "address";
            readonly name: "";
            readonly type: "address";
        }];
        readonly stateMutability: "view";
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
            readonly name: "";
            readonly type: "tuple[]";
        }, {
            readonly internalType: "bytes";
            readonly name: "callbackData";
            readonly type: "bytes";
        }];
        readonly name: "reactorCallback";
        readonly outputs: readonly [];
        readonly stateMutability: "nonpayable";
        readonly type: "function";
    }, {
        readonly inputs: readonly [{
            readonly internalType: "address";
            readonly name: "newOwner";
            readonly type: "address";
        }];
        readonly name: "transferOwnership";
        readonly outputs: readonly [];
        readonly stateMutability: "nonpayable";
        readonly type: "function";
    }, {
        readonly inputs: readonly [{
            readonly internalType: "address";
            readonly name: "recipient";
            readonly type: "address";
        }];
        readonly name: "unwrapWETH";
        readonly outputs: readonly [];
        readonly stateMutability: "nonpayable";
        readonly type: "function";
    }, {
        readonly inputs: readonly [{
            readonly internalType: "address";
            readonly name: "recipient";
            readonly type: "address";
        }];
        readonly name: "withdrawETH";
        readonly outputs: readonly [];
        readonly stateMutability: "nonpayable";
        readonly type: "function";
    }, {
        readonly stateMutability: "payable";
        readonly type: "receive";
    }];
    static createInterface(): SwapRouter02ExecutorInterface;
    static connect(address: string, signerOrProvider: Signer | Provider): SwapRouter02Executor;
}
export {};
