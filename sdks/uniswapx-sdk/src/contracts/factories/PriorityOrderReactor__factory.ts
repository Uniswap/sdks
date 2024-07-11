/* Autogenerated file. Do not edit manually. */
/* tslint:disable */
/* eslint-disable */
import { Signer, utils, Contract, ContractFactory, Overrides } from "ethers";
import type { Provider, TransactionRequest } from "@ethersproject/providers";
import type { PromiseOrValue } from "../common";
import type {
  PriorityOrderReactor,
  PriorityOrderReactorInterface,
} from "../PriorityOrderReactor";

const _abi = [
  {
    type: "constructor",
    inputs: [
      {
        name: "_permit2",
        type: "address",
        internalType: "contract IPermit2",
      },
      {
        name: "_protocolFeeOwner",
        type: "address",
        internalType: "address",
      },
    ],
    stateMutability: "nonpayable",
  },
  {
    type: "receive",
    stateMutability: "payable",
  },
  {
    type: "function",
    name: "execute",
    inputs: [
      {
        name: "order",
        type: "tuple",
        internalType: "struct SignedOrder",
        components: [
          {
            name: "order",
            type: "bytes",
            internalType: "bytes",
          },
          {
            name: "sig",
            type: "bytes",
            internalType: "bytes",
          },
        ],
      },
    ],
    outputs: [],
    stateMutability: "payable",
  },
  {
    type: "function",
    name: "executeBatch",
    inputs: [
      {
        name: "orders",
        type: "tuple[]",
        internalType: "struct SignedOrder[]",
        components: [
          {
            name: "order",
            type: "bytes",
            internalType: "bytes",
          },
          {
            name: "sig",
            type: "bytes",
            internalType: "bytes",
          },
        ],
      },
    ],
    outputs: [],
    stateMutability: "payable",
  },
  {
    type: "function",
    name: "executeBatchWithCallback",
    inputs: [
      {
        name: "orders",
        type: "tuple[]",
        internalType: "struct SignedOrder[]",
        components: [
          {
            name: "order",
            type: "bytes",
            internalType: "bytes",
          },
          {
            name: "sig",
            type: "bytes",
            internalType: "bytes",
          },
        ],
      },
      {
        name: "callbackData",
        type: "bytes",
        internalType: "bytes",
      },
    ],
    outputs: [],
    stateMutability: "payable",
  },
  {
    type: "function",
    name: "executeWithCallback",
    inputs: [
      {
        name: "order",
        type: "tuple",
        internalType: "struct SignedOrder",
        components: [
          {
            name: "order",
            type: "bytes",
            internalType: "bytes",
          },
          {
            name: "sig",
            type: "bytes",
            internalType: "bytes",
          },
        ],
      },
      {
        name: "callbackData",
        type: "bytes",
        internalType: "bytes",
      },
    ],
    outputs: [],
    stateMutability: "payable",
  },
  {
    type: "function",
    name: "feeController",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "address",
        internalType: "contract IProtocolFeeController",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "owner",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "address",
        internalType: "address",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "permit2",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "address",
        internalType: "contract IPermit2",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "setProtocolFeeController",
    inputs: [
      {
        name: "_newFeeController",
        type: "address",
        internalType: "address",
      },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "transferOwnership",
    inputs: [
      {
        name: "newOwner",
        type: "address",
        internalType: "address",
      },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "event",
    name: "Fill",
    inputs: [
      {
        name: "orderHash",
        type: "bytes32",
        indexed: true,
        internalType: "bytes32",
      },
      {
        name: "filler",
        type: "address",
        indexed: true,
        internalType: "address",
      },
      {
        name: "swapper",
        type: "address",
        indexed: true,
        internalType: "address",
      },
      {
        name: "nonce",
        type: "uint256",
        indexed: false,
        internalType: "uint256",
      },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "OwnershipTransferred",
    inputs: [
      {
        name: "user",
        type: "address",
        indexed: true,
        internalType: "address",
      },
      {
        name: "newOwner",
        type: "address",
        indexed: true,
        internalType: "address",
      },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "ProtocolFeeControllerSet",
    inputs: [
      {
        name: "oldFeeController",
        type: "address",
        indexed: false,
        internalType: "address",
      },
      {
        name: "newFeeController",
        type: "address",
        indexed: false,
        internalType: "address",
      },
    ],
    anonymous: false,
  },
  {
    type: "error",
    name: "DuplicateFeeOutput",
    inputs: [
      {
        name: "duplicateToken",
        type: "address",
        internalType: "address",
      },
    ],
  },
  {
    type: "error",
    name: "FeeTooLarge",
    inputs: [
      {
        name: "token",
        type: "address",
        internalType: "address",
      },
      {
        name: "amount",
        type: "uint256",
        internalType: "uint256",
      },
      {
        name: "recipient",
        type: "address",
        internalType: "address",
      },
    ],
  },
  {
    type: "error",
    name: "InputAndOutputFees",
    inputs: [],
  },
  {
    type: "error",
    name: "InputOutputScaling",
    inputs: [],
  },
  {
    type: "error",
    name: "InvalidCosignature",
    inputs: [],
  },
  {
    type: "error",
    name: "InvalidDeadline",
    inputs: [],
  },
  {
    type: "error",
    name: "InvalidFeeToken",
    inputs: [
      {
        name: "feeToken",
        type: "address",
        internalType: "address",
      },
    ],
  },
  {
    type: "error",
    name: "InvalidGasPrice",
    inputs: [],
  },
  {
    type: "error",
    name: "InvalidReactor",
    inputs: [],
  },
  {
    type: "error",
    name: "NativeTransferFailed",
    inputs: [],
  },
  {
    type: "error",
    name: "OrderNotFillable",
    inputs: [],
  },
] as const;

const _bytecode =
  "0x60a06040523480156200001157600080fd5b50604051620031b7380380620031b78339810160408190526200003491620000b8565b600080546001600160a01b0319166001600160a01b03831690811782556040518492849283928392907f8be0079c531659141344cd1fd0a4f28419497f9722a3daafe3b4186f6b6457e0908290a350506001600255506001600160a01b031660805250620000f79050565b6001600160a01b0381168114620000b557600080fd5b50565b60008060408385031215620000cc57600080fd5b8251620000d9816200009f565b6020840151909250620000ec816200009f565b809150509250929050565b60805161309e620001196000396000818160e00152611919015261309e6000f3fe60806040526004361061009a5760003560e01c80632d771389116100695780636999b3771161004e5780636999b377146101715780638da5cb5b1461019e578063f2fde38b146101cb57600080fd5b80632d7713891461013e5780633f62192e1461015e57600080fd5b80630d335884146100a65780630d7a16c3146100bb57806312261ee7146100ce57806313fb72c71461012b57600080fd5b366100a157005b600080fd5b6100b96100b43660046120dc565b6101eb565b005b6100b96100c936600461218a565b610364565b3480156100da57600080fd5b506101027f000000000000000000000000000000000000000000000000000000000000000081565b60405173ffffffffffffffffffffffffffffffffffffffff909116815260200160405180910390f35b6100b96101393660046121cc565b6104c5565b34801561014a57600080fd5b506100b9610159366004612265565b610683565b6100b961016c366004612289565b61078f565b34801561017d57600080fd5b506001546101029073ffffffffffffffffffffffffffffffffffffffff1681565b3480156101aa57600080fd5b506000546101029073ffffffffffffffffffffffffffffffffffffffff1681565b3480156101d757600080fd5b506100b96101e6366004612265565b610894565b6101f3610985565b604080516001808252818301909252600091816020015b6040805161016081018252600060a0820181815260c0830182905260e0830182905261010083018290526101208301829052606061014084018190529083528351808201855282815260208082018490528186018490528085019190915293830181905280830152608082015282527fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff90920191018161020a5790505090506102b2846109f6565b816000815181106102c5576102c56122f5565b60200260200101819052506102d981610b5e565b6040517f585da628000000000000000000000000000000000000000000000000000000008152339063585da62890610319908490879087906004016124f8565b600060405180830381600087803b15801561033357600080fd5b505af1158015610347573d6000803e3d6000fd5b5050505061035481610baf565b5061035f6001600255565b505050565b61036c610985565b8060008167ffffffffffffffff811115610388576103886122c6565b60405190808252806020026020018201604052801561044357816020015b6040805161016081018252600060a0820181815260c0830182905260e0830182905261010083018290526101208301829052606061014084018190529083528351808201855282815260208082018490528186018490528085019190915293830181905280830152608082015282527fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff9092019101816103a65790505b50905060005b828110156104a25761047d858583818110610466576104666122f5565b905060200281019061047891906125be565b6109f6565b82828151811061048f5761048f6122f5565b6020908102919091010152600101610449565b506104ac81610b5e565b6104b581610baf565b50506104c16001600255565b5050565b6104cd610985565b8260008167ffffffffffffffff8111156104e9576104e96122c6565b6040519080825280602002602001820160405280156105a457816020015b6040805161016081018252600060a0820181815260c0830182905260e0830182905261010083018290526101208301829052606061014084018190529083528351808201855282815260208082018490528186018490528085019190915293830181905280830152608082015282527fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff9092019101816105075790505b50905060005b828110156105ec576105c7878783818110610466576104666122f5565b8282815181106105d9576105d96122f5565b60209081029190910101526001016105aa565b506105f681610b5e565b6040517f585da628000000000000000000000000000000000000000000000000000000008152339063585da62890610636908490889088906004016124f8565b600060405180830381600087803b15801561065057600080fd5b505af1158015610664573d6000803e3d6000fd5b5050505061067181610baf565b505061067d6001600255565b50505050565b60005473ffffffffffffffffffffffffffffffffffffffff163314610709576040517f08c379a000000000000000000000000000000000000000000000000000000000815260206004820152600c60248201527f554e415554484f52495a4544000000000000000000000000000000000000000060448201526064015b60405180910390fd5b6001805473ffffffffffffffffffffffffffffffffffffffff8381167fffffffffffffffffffffffff000000000000000000000000000000000000000083168117909355604080519190921680825260208201939093527fb904ae9529e373e48bc82df4326cceaf1b4c472babf37f5b7dec46fecc6b53e0910160405180910390a15050565b610797610985565b604080516001808252818301909252600091816020015b6040805161016081018252600060a0820181815260c0830182905260e0830182905261010083018290526101208301829052606061014084018190529083528351808201855282815260208082018490528186018490528085019190915293830181905280830152608082015282527fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff9092019101816107ae579050509050610856826109f6565b81600081518110610869576108696122f5565b602002602001018190525061087d81610b5e565b61088681610baf565b506108916001600255565b50565b60005473ffffffffffffffffffffffffffffffffffffffff163314610915576040517f08c379a000000000000000000000000000000000000000000000000000000000815260206004820152600c60248201527f554e415554484f52495a454400000000000000000000000000000000000000006044820152606401610700565b600080547fffffffffffffffffffffffff00000000000000000000000000000000000000001673ffffffffffffffffffffffffffffffffffffffff83169081178255604051909133917f8be0079c531659141344cd1fd0a4f28419497f9722a3daafe3b4186f6b6457e09190a350565b60028054036109f0576040517f08c379a000000000000000000000000000000000000000000000000000000000815260206004820152601f60248201527f5265656e7472616e637947756172643a207265656e7472616e742063616c6c006044820152606401610700565b60028055565b6040805161016081018252600060a0820181815260c0830182905260e083018290526101008301829052610120830182905260606101408401819052908352835180820185528281526020808201849052818601849052840152928201839052828201929092526080810182905290610a6f83806125fc565b810190610a7c91906129c8565b90506000610a8982610d02565b90508160400151431015610aa157610aa18183610e15565b610aaa82610ffe565b6000610ab983606001516110fd565b90506040518060a0016040528084600001518152602001610ae783866080015161115290919063ffffffff16565b8152602001610b03838660a0015161124990919063ffffffff16565b8152602001868060200190610b1891906125fc565b8080601f01602080910402602001604051908101604052809392919081815260200183838082843760009201919091525050509082525060200192909252509392505050565b805160005b8181101561035f576000838281518110610b7f57610b7f6122f5565b60200260200101519050610b928161132e565b610b9c813361181e565b610ba68133611917565b50600101610b63565b805160005b81811015610cf1576000838281518110610bd057610bd06122f5565b602002602001015190506000816040015151905060005b81811015610c5157600083604001518281518110610c0757610c076122f5565b60200260200101519050610c4881604001518260200151836000015173ffffffffffffffffffffffffffffffffffffffff16611b709092919063ffffffff16565b50600101610be7565b5081600001516020015173ffffffffffffffffffffffffffffffffffffffff163373ffffffffffffffffffffffffffffffffffffffff16868581518110610c9a57610c9a6122f5565b6020026020010151608001517f78ad7ec0e9f89e74012afa58738b6b661c024cb0fd185ee2f616c0a28924bd66856000015160400151604051610cdf91815260200190565b60405180910390a45050600101610bb4565b5047156104c1576104c13347611bb7565b60006040518060c00160405280608d8152602001612f81608d9139604051806080016040528060488152602001612f0b604891396040518060800160405280605b815260200161300e605b9139604051602001610d6193929190612ac9565b60405160208183030381529060405280519060200120610d848360000151611c51565b836020015184604001518560600151610da08760800151611ceb565b610dad8860a00151611d52565b60408051602081019890985287019590955273ffffffffffffffffffffffffffffffffffffffff9093166060860152608085019190915260a084015260c083015260e0820152610100015b604051602081830303815290604052805190602001209050919050565b60c081015151600003610e26575050565b604081015160c0820151511015610e435760c08101515160408201525b6000808260e00151806020019051810190610e5e9190612c1f565b9150915060008360e00151604081518110610e7b57610e7b6122f5565b602001015160f81c60f81b60f81c905060006001868660c00151604051602001610ea89151815260200190565b604080517fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffe081840301815290829052610ee49291602001612c43565b604080517fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffe08184030181528282528051602091820120600084529083018083525260ff851690820152606081018690526080810185905260a0016020604051602081039080840390855afa158015610f60573d6000803e3d6000fd5b5050506020604051035190508073ffffffffffffffffffffffffffffffffffffffff16856020015173ffffffffffffffffffffffffffffffffffffffff16141580610fbf575073ffffffffffffffffffffffffffffffffffffffff8116155b15610ff6576040517fd7815be100000000000000000000000000000000000000000000000000000000815260040160405180910390fd5b505050505050565b80516060015142111561103d576040517f769d11e400000000000000000000000000000000000000000000000000000000815260040160405180910390fd5b438160400151111561107b576040517fc603552000000000000000000000000000000000000000000000000000000000815260040160405180910390fd5b608081015160400151156108915760005b8160a00151518110156104c15760008260a0015182815181106110b1576110b16122f5565b60200260200101516040015111156110f5576040517fa6b844f500000000000000000000000000000000000000000000000000000000815260040160405180910390fd5b60010161108c565b6000483a1015611139576040517ff3eb44e500000000000000000000000000000000000000000000000000000000815260040160405180910390fd5b50483a0381811115611149570390565b5060005b919050565b61118c6040518060600160405280600073ffffffffffffffffffffffffffffffffffffffff16815260200160008152602001600081525090565b600083604001518361119e9190612c98565b90506298968081106111ec576040518060600160405280856000015173ffffffffffffffffffffffffffffffffffffffff168152602001600081526020018560200151815250915050611243565b6040805160608101909152845173ffffffffffffffffffffffffffffffffffffffff168152602081016112346112258462989680612caf565b60208801519062989680611df0565b81526020868101519101529150505b92915050565b81516060908067ffffffffffffffff811115611267576112676122c6565b6040519080825280602002602001820160405280156112d057816020015b60408051606081018252600080825260208083018290529282015282527fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff9092019101816112855790505b50915060005b81811015611326576113018582815181106112f3576112f36122f5565b602002602001015185611e2c565b838281518110611313576113136122f5565b60209081029190910101526001016112d6565b505092915050565b60015473ffffffffffffffffffffffffffffffffffffffff1661134e5750565b6001546040517f8aa6cf0300000000000000000000000000000000000000000000000000000000815260009173ffffffffffffffffffffffffffffffffffffffff1690638aa6cf03906113a5908590600401612cc2565b600060405180830381865afa1580156113c2573d6000803e3d6000fd5b505050506040513d6000823e601f3d9081017fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffe01682016040526114089190810190612cd5565b60408301515181519192509060006114208284612da5565b67ffffffffffffffff811115611438576114386122c6565b6040519080825280602002602001820160405280156114a157816020015b60408051606081018252600080825260208083018290529282015282527fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff9092019101816114565790505b50905060005b838110156114f257856040015181815181106114c5576114c56122f5565b60200260200101518282815181106114df576114df6122f5565b60209081029190910101526001016114a7565b5060008060005b8481101561180d576000878281518110611515576115156122f5565b6020026020010151905060005b828110156115d35788818151811061153c5761153c6122f5565b60200260200101516000015173ffffffffffffffffffffffffffffffffffffffff16826000015173ffffffffffffffffffffffffffffffffffffffff16036115cb5781516040517ffff0830300000000000000000000000000000000000000000000000000000000815273ffffffffffffffffffffffffffffffffffffffff9091166004820152602401610700565b600101611522565b506000805b888110156116945760008b6040015182815181106115f8576115f86122f5565b60200260200101519050836000015173ffffffffffffffffffffffffffffffffffffffff16816000015173ffffffffffffffffffffffffffffffffffffffff160361168b578515611675576040517fedc7e2e400000000000000000000000000000000000000000000000000000000815260040160405180910390fd5b60208101516116849084612da5565b9250600196505b506001016115d8565b50815160208b01515173ffffffffffffffffffffffffffffffffffffffff91821691160361170d5784156116f4576040517fedc7e2e400000000000000000000000000000000000000000000000000000000815260040160405180910390fd5b6020808b015101516117069082612da5565b9050600193505b806000036117625781516040517feddf07f500000000000000000000000000000000000000000000000000000000815273ffffffffffffffffffffffffffffffffffffffff9091166004820152602401610700565b611770816005612710611df0565b826020015111156117e3578151602083015160408085015190517f82e7565600000000000000000000000000000000000000000000000000000000815273ffffffffffffffffffffffffffffffffffffffff93841660048201526024810192909252919091166044820152606401610700565b8186848a01815181106117f8576117f86122f5565b602090810291909101015250506001016114f9565b505050604090940193909352505050565b81515173ffffffffffffffffffffffffffffffffffffffff16301461186f576040517f4ddf4a6400000000000000000000000000000000000000000000000000000000815260040160405180910390fd5b81516080015173ffffffffffffffffffffffffffffffffffffffff16156104c1578151608001516040517f6e84ba2b00000000000000000000000000000000000000000000000000000000815273ffffffffffffffffffffffffffffffffffffffff90911690636e84ba2b906118eb9084908690600401612db8565b60006040518083038186803b15801561190357600080fd5b505afa158015610ff6573d6000803e3d6000fd5b7f000000000000000000000000000000000000000000000000000000000000000073ffffffffffffffffffffffffffffffffffffffff1663137c29fe6119d7846040805160a0810182526000606082018181526080830182905282526020820181905291810191909152506040805160a081018252602080840180515173ffffffffffffffffffffffffffffffffffffffff1660608085019182529151850151608085015283528451840151918301919091529251909201519082015290565b6040805180820182526000808252602091820152815180830190925273ffffffffffffffffffffffffffffffffffffffff86168252808701518101519082015285600001516020015186608001516040518060c00160405280608d8152602001612f81608d9139604051806080016040528060488152602001612f0b604891396040518060800160405280605b815260200161300e605b9139604051602001611a8293929190612ac9565b604080517fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffe081840301815260608301909152602e808352909190612f536020830139604051602001611ad5929190612de7565b604080517fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffe08184030181529082905260608a01517fffffffff0000000000000000000000000000000000000000000000000000000060e089901b168352611b429695949392600401612e42565b600060405180830381600087803b158015611b5c57600080fd5b505af1158015610ff6573d6000803e3d6000fd5b73ffffffffffffffffffffffffffffffffffffffff8316611b955761035f8282611bb7565b61035f73ffffffffffffffffffffffffffffffffffffffff8416338484611ece565b60008273ffffffffffffffffffffffffffffffffffffffff168260405160006040518083038185875af1925050503d8060008114611c11576040519150601f19603f3d011682016040523d82523d6000602084013e611c16565b606091505b505090508061035f576040517ff4b3b1bc00000000000000000000000000000000000000000000000000000000815260040160405180910390fd5b60006040518060c00160405280608d8152602001612f81608d913980516020918201208351848301516040808701516060880151608089015160a08a01518051908901209351610df898939492939192910196875273ffffffffffffffffffffffffffffffffffffffff958616602088015293851660408701526060860192909252608085015290911660a083015260c082015260e00190565b6000604051806080016040528060488152602001612f0b6048913980516020918201208351848301516040808701519051610df8950193845273ffffffffffffffffffffffffffffffffffffffff9290921660208401526040830152606082015260800190565b600080825160200267ffffffffffffffff811115611d7257611d726122c6565b6040519080825280601f01601f191660200182016040528015611d9c576020820181803683370190505b50905060005b8351811015611de1576000611dcf858381518110611dc257611dc26122f5565b6020026020010151611fc0565b60208381028501015250600101611da2565b50805160209091012092915050565b6000827fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff0484118302158202611e2557600080fd5b5091020490565b60408051606081018252600080825260208201819052918101919091526040518060600160405280846000015173ffffffffffffffffffffffffffffffffffffffff168152602001611ea3856040015185611e879190612c98565b611e949062989680612da5565b60208701519062989680612037565b8152602001846060015173ffffffffffffffffffffffffffffffffffffffff16815250905092915050565b60006040517f23b872dd00000000000000000000000000000000000000000000000000000000815273ffffffffffffffffffffffffffffffffffffffff8516600482015273ffffffffffffffffffffffffffffffffffffffff841660248201528260448201526020600060648360008a5af13d15601f3d1160016000511416171691505080611fb9576040517f08c379a000000000000000000000000000000000000000000000000000000000815260206004820152601460248201527f5452414e534645525f46524f4d5f4641494c45440000000000000000000000006044820152606401610700565b5050505050565b60006040518060800160405280605b815260200161300e605b9139805160209182012083518483015160408087015160608801519151610df8969192910194855273ffffffffffffffffffffffffffffffffffffffff93841660208601526040850192909252606084015216608082015260a00190565b6000827fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff048411830215820261206c57600080fd5b50910281810615159190040190565b60006040828403121561208d57600080fd5b50919050565b60008083601f8401126120a557600080fd5b50813567ffffffffffffffff8111156120bd57600080fd5b6020830191508360208285010111156120d557600080fd5b9250929050565b6000806000604084860312156120f157600080fd5b833567ffffffffffffffff8082111561210957600080fd5b6121158783880161207b565b9450602086013591508082111561212b57600080fd5b5061213886828701612093565b9497909650939450505050565b60008083601f84011261215757600080fd5b50813567ffffffffffffffff81111561216f57600080fd5b6020830191508360208260051b85010111156120d557600080fd5b6000806020838503121561219d57600080fd5b823567ffffffffffffffff8111156121b457600080fd5b6121c085828601612145565b90969095509350505050565b600080600080604085870312156121e257600080fd5b843567ffffffffffffffff808211156121fa57600080fd5b61220688838901612145565b9096509450602087013591508082111561221f57600080fd5b5061222c87828801612093565b95989497509550505050565b73ffffffffffffffffffffffffffffffffffffffff8116811461089157600080fd5b803561114d81612238565b60006020828403121561227757600080fd5b813561228281612238565b9392505050565b60006020828403121561229b57600080fd5b813567ffffffffffffffff8111156122b257600080fd5b6122be8482850161207b565b949350505050565b7f4e487b7100000000000000000000000000000000000000000000000000000000600052604160045260246000fd5b7f4e487b7100000000000000000000000000000000000000000000000000000000600052603260045260246000fd5b60005b8381101561233f578181015183820152602001612327565b50506000910152565b60008151808452612360816020860160208601612324565b601f017fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffe0169290920160200192915050565b60008151808452602080850194506020840160005b838110156123f2578151805173ffffffffffffffffffffffffffffffffffffffff908116895284820151858a01526040918201511690880152606090960195908201906001016123a7565b509495945050505050565b6000815160e0845273ffffffffffffffffffffffffffffffffffffffff8082511660e08601528060208301511661010086015260408201516101208601526060820151610140860152806080830151166101608601525060a0810151905060c06101808501526124716101a0850182612348565b905060208301516124af6020860182805173ffffffffffffffffffffffffffffffffffffffff16825260208082015190830152604090810151910152565b50604083015184820360808601526124c78282612392565b915050606083015184820360a08601526124e18282612348565b915050608083015160c08501528091505092915050565b6000604082016040835280865180835260608501915060608160051b8601019250602080890160005b8381101561256d577fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffa088870301855261255b8683516123fd565b95509382019390820190600101612521565b5050858403818701528684528688828601376000848801820152601f9096017fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffe0169092019094019695505050505050565b600082357fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffc18336030181126125f257600080fd5b9190910192915050565b60008083357fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffe184360301811261263157600080fd5b83018035915067ffffffffffffffff82111561264c57600080fd5b6020019150368190038213156120d557600080fd5b6040516060810167ffffffffffffffff81118282101715612684576126846122c6565b60405290565b6040516080810167ffffffffffffffff81118282101715612684576126846122c6565b604051610100810167ffffffffffffffff81118282101715612684576126846122c6565b604051601f82017fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffe016810167ffffffffffffffff81118282101715612718576127186122c6565b604052919050565b600082601f83011261273157600080fd5b813567ffffffffffffffff81111561274b5761274b6122c6565b61277c60207fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffe0601f840116016126d1565b81815284602083860101111561279157600080fd5b816020850160208301376000918101602001919091529392505050565b600060c082840312156127c057600080fd5b60405160c0810167ffffffffffffffff82821081831117156127e4576127e46122c6565b81604052829350843591506127f882612238565b90825260208401359061280a82612238565b81602084015260408501356040840152606085013560608401526080850135915061283482612238565b81608084015260a085013591508082111561284e57600080fd5b5061285b85828601612720565b60a0830152505092915050565b60006060828403121561287a57600080fd5b612882612661565b9050813561288f81612238565b80825250602082013560208201526040820135604082015292915050565b600067ffffffffffffffff8211156128c7576128c76122c6565b5060051b60200190565b600082601f8301126128e257600080fd5b813560206128f76128f2836128ad565b6126d1565b82815260079290921b8401810191818101908684111561291657600080fd5b8286015b8481101561297b57608081890312156129335760008081fd5b61293b61268a565b813561294681612238565b815281850135858201526040808301359082015260608083013561296981612238565b9082015283529183019160800161291a565b509695505050505050565b60006020828403121561299857600080fd5b6040516020810181811067ffffffffffffffff821117156129bb576129bb6122c6565b6040529135825250919050565b6000602082840312156129da57600080fd5b813567ffffffffffffffff808211156129f257600080fd5b908301906101408286031215612a0757600080fd5b612a0f6126ad565b823582811115612a1e57600080fd5b612a2a878286016127ae565b825250612a396020840161225a565b60208201526040830135604082015260608301356060820152612a5f8660808501612868565b608082015260e083013582811115612a7657600080fd5b612a82878286016128d1565b60a083015250612a96866101008501612986565b60c082015261012083013582811115612aae57600080fd5b612aba87828601612720565b60e08301525095945050505050565b7f5072696f726974794f726465722800000000000000000000000000000000000081527f4f72646572496e666f20696e666f2c0000000000000000000000000000000000600e8201527f6164647265737320636f7369676e65722c000000000000000000000000000000601d8201527f75696e743235362061756374696f6e5374617274426c6f636b2c000000000000602e8201527f75696e7432353620626173656c696e655072696f726974794665655765692c0060488201527f5072696f72697479496e70757420696e7075742c00000000000000000000000060678201527f5072696f726974794f75747075745b5d206f7574707574732900000000000000607b82015260008451612be5816094850160208901612324565b845190830190612bfc816094840160208901612324565b8451910190612c12816094840160208801612324565b0160940195945050505050565b60008060408385031215612c3257600080fd5b505080516020909101519092909150565b82815260008251612c5b816020850160208701612324565b919091016020019392505050565b7f4e487b7100000000000000000000000000000000000000000000000000000000600052601160045260246000fd5b808202811582820484141761124357611243612c69565b8181038181111561124357611243612c69565b60208152600061228260208301846123fd565b60006020808385031215612ce857600080fd5b825167ffffffffffffffff811115612cff57600080fd5b8301601f81018513612d1057600080fd5b8051612d1e6128f2826128ad565b81815260609182028301840191848201919088841115612d3d57600080fd5b938501935b83851015612d995780858a031215612d5a5760008081fd5b612d62612661565b8551612d6d81612238565b81528587015187820152604080870151612d8681612238565b9082015283529384019391850191612d42565b50979650505050505050565b8082018082111561124357611243612c69565b73ffffffffffffffffffffffffffffffffffffffff831681526040602082015260006122be60408301846123fd565b7f5072696f726974794f72646572207769746e6573732900000000000000000000815260008351612e1f816016850160208801612324565b835190830190612e36816016840160208801612324565b01601601949350505050565b6000610140612e72838a51805173ffffffffffffffffffffffffffffffffffffffff168252602090810151910152565b6020890151604084015260408901516060840152612eb36080840189805173ffffffffffffffffffffffffffffffffffffffff168252602090810151910152565b73ffffffffffffffffffffffffffffffffffffffff871660c08401528560e084015280610100840152612ee881840186612348565b9050828103610120840152612efd8185612348565b999850505050505050505056fe5072696f72697479496e707574286164647265737320746f6b656e2c75696e7432353620616d6f756e742c75696e74323536206d70735065725072696f7269747946656557656929546f6b656e5065726d697373696f6e73286164647265737320746f6b656e2c75696e7432353620616d6f756e74294f72646572496e666f28616464726573732072656163746f722c6164647265737320737761707065722c75696e74323536206e6f6e63652c75696e7432353620646561646c696e652c61646472657373206164646974696f6e616c56616c69646174696f6e436f6e74726163742c6279746573206164646974696f6e616c56616c69646174696f6e44617461295072696f726974794f7574707574286164647265737320746f6b656e2c75696e7432353620616d6f756e742c75696e74323536206d70735065725072696f726974794665655765692c6164647265737320726563697069656e7429a26469706673582212200157f640b2a364169513823e9bc04e1403e405f2593efb4a28be4df19b3c545364736f6c63430008180033";

type PriorityOrderReactorConstructorParams =
  | [signer?: Signer]
  | ConstructorParameters<typeof ContractFactory>;

const isSuperArgs = (
  xs: PriorityOrderReactorConstructorParams
): xs is ConstructorParameters<typeof ContractFactory> => xs.length > 1;

export class PriorityOrderReactor__factory extends ContractFactory {
  constructor(...args: PriorityOrderReactorConstructorParams) {
    if (isSuperArgs(args)) {
      super(...args);
    } else {
      super(_abi, _bytecode, args[0]);
    }
  }

  override deploy(
    _permit2: PromiseOrValue<string>,
    _protocolFeeOwner: PromiseOrValue<string>,
    overrides?: Overrides & { from?: PromiseOrValue<string> }
  ): Promise<PriorityOrderReactor> {
    return super.deploy(
      _permit2,
      _protocolFeeOwner,
      overrides || {}
    ) as Promise<PriorityOrderReactor>;
  }
  override getDeployTransaction(
    _permit2: PromiseOrValue<string>,
    _protocolFeeOwner: PromiseOrValue<string>,
    overrides?: Overrides & { from?: PromiseOrValue<string> }
  ): TransactionRequest {
    return super.getDeployTransaction(
      _permit2,
      _protocolFeeOwner,
      overrides || {}
    );
  }
  override attach(address: string): PriorityOrderReactor {
    return super.attach(address) as PriorityOrderReactor;
  }
  override connect(signer: Signer): PriorityOrderReactor__factory {
    return super.connect(signer) as PriorityOrderReactor__factory;
  }

  static readonly bytecode = _bytecode;
  static readonly abi = _abi;
  static createInterface(): PriorityOrderReactorInterface {
    return new utils.Interface(_abi) as PriorityOrderReactorInterface;
  }
  static connect(
    address: string,
    signerOrProvider: Signer | Provider
  ): PriorityOrderReactor {
    return new Contract(
      address,
      _abi,
      signerOrProvider
    ) as PriorityOrderReactor;
  }
}
