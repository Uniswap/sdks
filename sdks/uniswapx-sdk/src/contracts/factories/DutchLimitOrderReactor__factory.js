"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DutchLimitOrderReactor__factory = void 0;
/* Autogenerated file. Do not edit manually. */
/* tslint:disable */
/* eslint-disable */
const ethers_1 = require("ethers");
const _abi = [
    {
        inputs: [
            {
                internalType: "contract IPermit2",
                name: "_permit2",
                type: "address",
            },
            {
                internalType: "address",
                name: "_protocolFeeOwner",
                type: "address",
            },
        ],
        stateMutability: "nonpayable",
        type: "constructor",
    },
    {
        inputs: [],
        name: "DeadlineBeforedecayEndTime",
        type: "error",
    },
    {
        inputs: [],
        name: "DeadlinePassed",
        type: "error",
    },
    {
        inputs: [
            {
                internalType: "address",
                name: "duplicateToken",
                type: "address",
            },
        ],
        name: "DuplicateFeeOutput",
        type: "error",
    },
    {
        inputs: [],
        name: "decayEndTimeBeforedecayStartTime",
        type: "error",
    },
    {
        inputs: [
            {
                internalType: "address",
                name: "token",
                type: "address",
            },
            {
                internalType: "uint256",
                name: "amount",
                type: "uint256",
            },
            {
                internalType: "address",
                name: "recipient",
                type: "address",
            },
        ],
        name: "FeeTooLarge",
        type: "error",
    },
    {
        inputs: [],
        name: "IncorrectAmounts",
        type: "error",
    },
    {
        inputs: [],
        name: "InputAndOutputDecay",
        type: "error",
    },
    {
        inputs: [],
        name: "InsufficientEth",
        type: "error",
    },
    {
        inputs: [
            {
                internalType: "uint256",
                name: "actualBalance",
                type: "uint256",
            },
            {
                internalType: "uint256",
                name: "expectedBalance",
                type: "uint256",
            },
        ],
        name: "InsufficientOutput",
        type: "error",
    },
    {
        inputs: [
            {
                internalType: "address",
                name: "feeToken",
                type: "address",
            },
        ],
        name: "InvalidFeeToken",
        type: "error",
    },
    {
        inputs: [],
        name: "InvalidReactor",
        type: "error",
    },
    {
        inputs: [],
        name: "NativeTransferFailed",
        type: "error",
    },
    {
        inputs: [],
        name: "NoExclusiveOverride",
        type: "error",
    },
    {
        inputs: [],
        name: "OrderdecayEndTimeBeforedecayStartTime",
        type: "error",
    },
    {
        anonymous: false,
        inputs: [
            {
                indexed: true,
                internalType: "bytes32",
                name: "orderHash",
                type: "bytes32",
            },
            {
                indexed: true,
                internalType: "address",
                name: "filler",
                type: "address",
            },
            {
                indexed: true,
                internalType: "address",
                name: "swapper",
                type: "address",
            },
            {
                indexed: false,
                internalType: "uint256",
                name: "nonce",
                type: "uint256",
            },
        ],
        name: "Fill",
        type: "event",
    },
    {
        anonymous: false,
        inputs: [
            {
                indexed: true,
                internalType: "address",
                name: "user",
                type: "address",
            },
            {
                indexed: true,
                internalType: "address",
                name: "newOwner",
                type: "address",
            },
        ],
        name: "OwnershipTransferred",
        type: "event",
    },
    {
        anonymous: false,
        inputs: [
            {
                indexed: false,
                internalType: "address",
                name: "oldFeeController",
                type: "address",
            },
            {
                indexed: false,
                internalType: "address",
                name: "newFeeController",
                type: "address",
            },
        ],
        name: "ProtocolFeeControllerSet",
        type: "event",
    },
    {
        inputs: [],
        name: "DIRECT_FILL",
        outputs: [
            {
                internalType: "contract IReactorCallback",
                name: "",
                type: "address",
            },
        ],
        stateMutability: "view",
        type: "function",
    },
    {
        inputs: [
            {
                components: [
                    {
                        internalType: "bytes",
                        name: "order",
                        type: "bytes",
                    },
                    {
                        internalType: "bytes",
                        name: "sig",
                        type: "bytes",
                    },
                ],
                internalType: "struct SignedOrder",
                name: "order",
                type: "tuple",
            },
            {
                internalType: "contract IReactorCallback",
                name: "fillContract",
                type: "address",
            },
            {
                internalType: "bytes",
                name: "fillData",
                type: "bytes",
            },
        ],
        name: "execute",
        outputs: [],
        stateMutability: "payable",
        type: "function",
    },
    {
        inputs: [
            {
                components: [
                    {
                        internalType: "bytes",
                        name: "order",
                        type: "bytes",
                    },
                    {
                        internalType: "bytes",
                        name: "sig",
                        type: "bytes",
                    },
                ],
                internalType: "struct SignedOrder[]",
                name: "orders",
                type: "tuple[]",
            },
            {
                internalType: "contract IReactorCallback",
                name: "fillContract",
                type: "address",
            },
            {
                internalType: "bytes",
                name: "fillData",
                type: "bytes",
            },
        ],
        name: "executeBatch",
        outputs: [],
        stateMutability: "payable",
        type: "function",
    },
    {
        inputs: [],
        name: "feeController",
        outputs: [
            {
                internalType: "contract IProtocolFeeController",
                name: "",
                type: "address",
            },
        ],
        stateMutability: "view",
        type: "function",
    },
    {
        inputs: [],
        name: "owner",
        outputs: [
            {
                internalType: "address",
                name: "",
                type: "address",
            },
        ],
        stateMutability: "view",
        type: "function",
    },
    {
        inputs: [],
        name: "permit2",
        outputs: [
            {
                internalType: "contract IPermit2",
                name: "",
                type: "address",
            },
        ],
        stateMutability: "view",
        type: "function",
    },
    {
        inputs: [
            {
                internalType: "address",
                name: "_newFeeController",
                type: "address",
            },
        ],
        name: "setProtocolFeeController",
        outputs: [],
        stateMutability: "nonpayable",
        type: "function",
    },
    {
        inputs: [
            {
                internalType: "address",
                name: "newOwner",
                type: "address",
            },
        ],
        name: "transferOwnership",
        outputs: [],
        stateMutability: "nonpayable",
        type: "function",
    },
];
const _bytecode = "0x60a06040523480156200001157600080fd5b5060405162003518380380620035188339810160408190526200003491620000b8565b600080546001600160a01b0319166001600160a01b03831690811782556040518492849283928392907f8be0079c531659141344cd1fd0a4f28419497f9722a3daafe3b4186f6b6457e0908290a350506001600255506001600160a01b031660805250620000f79050565b6001600160a01b0381168114620000b557600080fd5b50565b60008060408385031215620000cc57600080fd5b8251620000d9816200009f565b6020840151909250620000ec816200009f565b809150509250929050565b6080516133f8620001206000396000818160a7015281816115c601526119c201526133f86000f3fe60806040526004361061007b5760003560e01c80636f1d5f511161004e5780636f1d5f511461013f5780638da5cb5b14610152578063f2fde38b1461017f578063fccbcaaf1461019f57600080fd5b806305afc9771461008057806312261ee7146100955780632d771389146100f25780636999b37714610112575b600080fd5b61009361008e366004612674565b6101b4565b005b3480156100a157600080fd5b506100c97f000000000000000000000000000000000000000000000000000000000000000081565b60405173ffffffffffffffffffffffffffffffffffffffff909116815260200160405180910390f35b3480156100fe57600080fd5b5061009361010d3660046126f7565b6102b6565b34801561011e57600080fd5b506001546100c99073ffffffffffffffffffffffffffffffffffffffff1681565b61009361014d36600461271b565b6103c2565b34801561015e57600080fd5b506000546100c99073ffffffffffffffffffffffffffffffffffffffff1681565b34801561018b57600080fd5b5061009361019a3660046126f7565b61051e565b3480156101ab57600080fd5b506100c9600181565b6101bc61060f565b604080516001808252818301909252600091816020015b6040805161016081018252600060a0820181815260c0830182905260e0830182905261010083018290526101208301829052606061014084018190529083528351808201855282815260208082018490528186018490528085019190915293830181905280830152608082015282527fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff9092019101816101d357905050905061027b85610680565b8160008151811061028e5761028e6127fc565b60200260200101819052506102a5818585856107ec565b506102b06001600255565b50505050565b60005473ffffffffffffffffffffffffffffffffffffffff16331461033c576040517f08c379a000000000000000000000000000000000000000000000000000000000815260206004820152600c60248201527f554e415554484f52495a4544000000000000000000000000000000000000000060448201526064015b60405180910390fd5b6001805473ffffffffffffffffffffffffffffffffffffffff8381167fffffffffffffffffffffffff000000000000000000000000000000000000000083168117909355604080519190921680825260208201939093527fb904ae9529e373e48bc82df4326cceaf1b4c472babf37f5b7dec46fecc6b53e0910160405180910390a15050565b6103ca61060f565b60008467ffffffffffffffff8111156103e5576103e56127cd565b6040519080825280602002602001820160405280156104a057816020015b6040805161016081018252600060a0820181815260c0830182905260e0830182905261010083018290526101208301829052606061014084018190529083528351808201855282815260208082018490528186018490528085019190915293830181905280830152608082015282527fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff9092019101816104035790505b50905060005b858110156104ff576104da8787838181106104c3576104c36127fc565b90506020028101906104d5919061282b565b610680565b8282815181106104ec576104ec6127fc565b60209081029190910101526001016104a6565b5061050c818585856107ec565b506105176001600255565b5050505050565b60005473ffffffffffffffffffffffffffffffffffffffff16331461059f576040517f08c379a000000000000000000000000000000000000000000000000000000000815260206004820152600c60248201527f554e415554484f52495a454400000000000000000000000000000000000000006044820152606401610333565b600080547fffffffffffffffffffffffff00000000000000000000000000000000000000001673ffffffffffffffffffffffffffffffffffffffff83169081178255604051909133917f8be0079c531659141344cd1fd0a4f28419497f9722a3daafe3b4186f6b6457e09190a350565b600280540361067a576040517f08c379a000000000000000000000000000000000000000000000000000000000815260206004820152601f60248201527f5265656e7472616e637947756172643a207265656e7472616e742063616c6c006044820152606401610333565b60028055565b6040805161016081018252600060a0820181815260c0830182905260e0830182905261010083018290526101208301829052606061014084018190529083528351808201855282815260208082018490528186018490528401529282018390528282019290925260808101829052906106f98380612869565b8101906107069190612bf2565b9050610711816109b4565b6040518060a0016040528082600001518152602001610747836020015184604001518560a00151610ae69092919063ffffffff16565b815260200161076d836020015184604001518560c00151610bb89092919063ffffffff16565b81526020018480602001906107829190612869565b8080601f0160208091040260200160405190810160405280939291908181526020018383808284376000920191909152505050908252506020016107c583610c9f565b90526060820151602083015160808401519294506107e69285929190610f71565b50919050565b73ffffffffffffffffffffffffffffffffffffffff831660011460005b85518110156108f6576000868281518110610826576108266127fc565b6020026020010151905061083981611012565b610843813361148c565b610858818461085257876115c4565b336115c4565b80600001516020015173ffffffffffffffffffffffffffffffffffffffff163373ffffffffffffffffffffffffffffffffffffffff168884815181106108a0576108a06127fc565b6020026020010151608001517f78ad7ec0e9f89e74012afa58738b6b661c024cb0fd185ee2f616c0a28924bd668460000151604001516040516108e591815260200190565b60405180910390a450600101610809565b50801561090b5761090685611957565b610517565b600061091686611a32565b6040517f9943fa8900000000000000000000000000000000000000000000000000000000815290915073ffffffffffffffffffffffffffffffffffffffff861690639943fa8990610971908990339089908990600401612e99565b600060405180830381600087803b15801561098b57600080fd5b505af115801561099f573d6000803e3d6000fd5b505050506109ac81611cf8565b505050505050565b604081015181516060015110156109f7576040517f773a618700000000000000000000000000000000000000000000000000000000815260040160405180910390fd5b806020015181604001511015610a39576040517f48fee69c00000000000000000000000000000000000000000000000000000000815260040160405180910390fd5b60a0810151604081015160209091015114610ae35760005b8160c0015151811015610ae1578160c001518181518110610a7457610a746127fc565b6020026020010151604001518260c001518281518110610a9657610a966127fc565b60200260200101516020015114610ad9576040517fd303758b00000000000000000000000000000000000000000000000000000000815260040160405180910390fd5b600101610a51565b505b50565b610b206040518060600160405280600073ffffffffffffffffffffffffffffffffffffffff16815260200160008152602001600081525090565b836040015184602001511115610b62576040517f7c1f811300000000000000000000000000000000000000000000000000000000815260040160405180910390fd5b6000610b78856020015186604001518686611dbb565b60408051606081018252875173ffffffffffffffffffffffffffffffffffffffff1681526020810192909252958601519581019590955250929392505050565b82516060908067ffffffffffffffff811115610bd657610bd66127cd565b604051908082528060200260200182016040528015610c3f57816020015b60408051606081018252600080825260208083018290529282015282527fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff909201910181610bf45790505b50915060005b81811015610c9657610c71868281518110610c6257610c626127fc565b60200260200101518686611e55565b838281518110610c8357610c836127fc565b6020908102919091010152600101610c45565b50509392505050565b6040517f4578636c757369766544757463684f726465722800000000000000000000000060208201527f4f72646572496e666f20696e666f2c000000000000000000000000000000000060348201527f75696e74323536206465636179537461727454696d652c00000000000000000060438201527f75696e74323536206465636179456e6454696d652c0000000000000000000000605a8201527f61646472657373206578636c757369766546696c6c65722c0000000000000000606f8201527f75696e74323536206578636c757369766974794f766572726964654270732c0060878201527f6164647265737320696e707574546f6b656e2c0000000000000000000000000060a68201527f75696e7432353620696e7075745374617274416d6f756e742c0000000000000060b98201527f75696e7432353620696e707574456e64416d6f756e742c00000000000000000060d28201527f44757463684f75747075745b5d206f757470757473290000000000000000000060e982015260009060ff01604080517fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffe08184030181526080830190915260528083529091906132b660208301396040518060c00160405280608d8152602001613336608d9139604051602001610e9193929190612f7c565b60405160208183030381529060405280519060200120610eb48360000151611f25565b83602001518460400151856060015186608001518760a00151600001518860a00151602001518960a0015160400151610ef08b60c00151611fbf565b60408051602081019b909b528a01989098526060890196909652608088019490945273ffffffffffffffffffffffffffffffffffffffff92831660a088015260c08701919091521660e0850152610100840152610120830152610140820152610160015b604051602081830303815290604052805190602001209050919050565b610f7b838361205d565b6102b05780610fb6576040517fb9ec1e9600000000000000000000000000000000000000000000000000000000815260040160405180910390fd5b604084015160005b81518110156109ac576000828281518110610fdb57610fdb6127fc565b6020026020010151905061100484612710610ff69190612fee565b6020830151906127106120aa565b602090910152600101610fbe565b60015473ffffffffffffffffffffffffffffffffffffffff166110325750565b6001546040517f8aa6cf0300000000000000000000000000000000000000000000000000000000815260009173ffffffffffffffffffffffffffffffffffffffff1690638aa6cf0390611089908590600401613001565b600060405180830381865afa1580156110a6573d6000803e3d6000fd5b505050506040513d6000823e601f3d9081017fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffe01682016040526110ec9190810190613014565b60408301515181519192509060006111048284612fee565b67ffffffffffffffff81111561111c5761111c6127cd565b60405190808252806020026020018201604052801561118557816020015b60408051606081018252600080825260208083018290529282015282527fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff90920191018161113a5790505b50905060005b838110156111d657856040015181815181106111a9576111a96127fc565b60200260200101518282815181106111c3576111c36127fc565b602090810291909101015260010161118b565b5060005b8281101561147d5760008582815181106111f6576111f66127fc565b6020026020010151905060005b828110156112b45786818151811061121d5761121d6127fc565b60200260200101516000015173ffffffffffffffffffffffffffffffffffffffff16826000015173ffffffffffffffffffffffffffffffffffffffff16036112ac5781516040517ffff0830300000000000000000000000000000000000000000000000000000000815273ffffffffffffffffffffffffffffffffffffffff9091166004820152602401610333565b600101611203565b506000805b86811015611339576000896040015182815181106112d9576112d96127fc565b60200260200101519050836000015173ffffffffffffffffffffffffffffffffffffffff16816000015173ffffffffffffffffffffffffffffffffffffffff160361133057602081015161132d9084612fee565b92505b506001016112b9565b50815160208901515173ffffffffffffffffffffffffffffffffffffffff9182169116036113765760208089015101516113739082612fee565b90505b806000036113cb5781516040517feddf07f500000000000000000000000000000000000000000000000000000000815273ffffffffffffffffffffffffffffffffffffffff9091166004820152602401610333565b6113d98160056127106120aa565b8260200151111561144c578151602083015160408085015190517f82e7565600000000000000000000000000000000000000000000000000000000815273ffffffffffffffffffffffffffffffffffffffff93841660048201526024810192909252919091166044820152606401610333565b81846114588589612fee565b81518110611468576114686127fc565b602090810291909101015250506001016111da565b50604090940193909352505050565b81515173ffffffffffffffffffffffffffffffffffffffff1630146114dd576040517f4ddf4a6400000000000000000000000000000000000000000000000000000000815260040160405180910390fd5b81516060015142111561151c576040517f70f65caa00000000000000000000000000000000000000000000000000000000815260040160405180910390fd5b81516080015173ffffffffffffffffffffffffffffffffffffffff1615610ae1578151608001516040517f6e84ba2b00000000000000000000000000000000000000000000000000000000815273ffffffffffffffffffffffffffffffffffffffff90911690636e84ba2b9061159890849086906004016130e4565b60006040518083038186803b1580156115b057600080fd5b505afa1580156109ac573d6000803e3d6000fd5b7f000000000000000000000000000000000000000000000000000000000000000073ffffffffffffffffffffffffffffffffffffffff1663137c29fe611684846040805160a0810182526000606082018181526080830182905282526020820181905291810191909152506040805160a081018252602080840180515173ffffffffffffffffffffffffffffffffffffffff1660608085019182529151850151608085015283528451840151918301919091529251909201519082015290565b6040805180820182526000808252602091820152815180830190925273ffffffffffffffffffffffffffffffffffffffff86168252808701518101519082015285600001516020015186608001516040518060800160405280605281526020016132b660529139604080517f4578636c757369766544757463684f726465722800000000000000000000000060208201527f4f72646572496e666f20696e666f2c000000000000000000000000000000000060348201527f75696e74323536206465636179537461727454696d652c00000000000000000060438201527f75696e74323536206465636179456e6454696d652c0000000000000000000000605a8201527f61646472657373206578636c757369766546696c6c65722c0000000000000000606f8201527f75696e74323536206578636c757369766974794f766572726964654270732c0060878201527f6164647265737320696e707574546f6b656e2c0000000000000000000000000060a68201527f75696e7432353620696e7075745374617274416d6f756e742c0000000000000060b98201527f75696e7432353620696e707574456e64416d6f756e742c00000000000000000060d28201527f44757463684f75747075745b5d206f757470757473290000000000000000000060e9820152815160df8183030181526101bf8201909252608d60ff8201818152916133369061011f01396040518060600160405280602e8152602001613308602e91396040516020016118bc9493929190613113565b604080517fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffe08184030181529082905260608a01517fffffffff0000000000000000000000000000000000000000000000000000000060e089901b168352611929969594939260040161319c565b600060405180830381600087803b15801561194357600080fd5b505af11580156109ac573d6000803e3d6000fd5b60005b8151811015611a1f576000828281518110611977576119776127fc565b6020026020010151905060005b816040015151811015611a15576000826040015182815181106119a9576119a96127fc565b60200260200101519050611a0c816040015182602001517f0000000000000000000000000000000000000000000000000000000000000000846000015173ffffffffffffffffffffffffffffffffffffffff166120e6909392919063ffffffff16565b50600101611984565b505060010161195a565b504715610ae357610ae360003347612263565b60606000805b8351811015611a7157838181518110611a5357611a536127fc565b60200260200101516040015151820191508080600101915050611a38565b508067ffffffffffffffff811115611a8b57611a8b6127cd565b604051908082528060200260200182016040528015611af457816020015b60408051606081018252600080825260208083018290529282015282527fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff909201910181611aa95790505b509150506000805b8351811015611cf0576000848281518110611b1957611b196127fc565b6020026020010151905060005b816040015151811015611ce657600082604001518281518110611b4b57611b4b6127fc565b602002602001015190506000805b86811015611c27576000888281518110611b7557611b756127fc565b60200260200101519050836040015173ffffffffffffffffffffffffffffffffffffffff16816000015173ffffffffffffffffffffffffffffffffffffffff16148015611bf55750836000015173ffffffffffffffffffffffffffffffffffffffff16816020015173ffffffffffffffffffffffffffffffffffffffff16145b15611c1e5760019250836020015181604001818151611c149190612fee565b905250611c279050565b50600101611b59565b5080611cdc5760408201518251600091611c579173ffffffffffffffffffffffffffffffffffffffff169061233e565b90506040518060600160405280846040015173ffffffffffffffffffffffffffffffffffffffff168152602001846000015173ffffffffffffffffffffffffffffffffffffffff168152602001846020015183611cb49190612fee565b815250888881518110611cc957611cc96127fc565b6020908102919091010152506001909501945b5050600101611b26565b5050600101611afc565b508152919050565b60005b8151811015610ae1576000828281518110611d1857611d186127fc565b602002602001015190506000611d558260000151836020015173ffffffffffffffffffffffffffffffffffffffff1661233e90919063ffffffff16565b90508160400151811015611da6578082604001516040517f2c19b8b8000000000000000000000000000000000000000000000000000000008152600401610333929190918252602082015260400190565b50508080611db390613264565b915050611cfb565b600082821015611df7576040517f4313345300000000000000000000000000000000000000000000000000000000815260040160405180910390fd5b428211611e05575082611e4d565b428310611e13575083611e4d565b4283900383830386861015611e3857611e2f86880383836120aa565b87039250611e4a565b611e4587870383836120aa565b870192505b50505b949350505050565b6040805160608101825260008082526020820181905291810191909152836040015184602001511015611eb4576040517f7c1f811300000000000000000000000000000000000000000000000000000000815260040160405180910390fd5b6000611eca856020015186604001518686611dbb565b90506040518060600160405280866000015173ffffffffffffffffffffffffffffffffffffffff168152602001828152602001866060015173ffffffffffffffffffffffffffffffffffffffff168152509150509392505050565b60006040518060c00160405280608d8152602001613336608d913980516020918201208351848301516040808701516060880151608089015160a08a01518051908901209351610f5498939492939192910196875273ffffffffffffffffffffffffffffffffffffffff958616602088015293851660408701526060860192909252608085015290911660a083015260c082015260e00190565b600080825160200267ffffffffffffffff811115611fdf57611fdf6127cd565b6040519080825280601f01601f191660200182016040528015612009576020820181803683370190505b50905060005b835181101561204e57600061203c85838151811061202f5761202f6127fc565b6020026020010151612409565b6020838102850101525060010161200f565b50805160209091012092915050565b600073ffffffffffffffffffffffffffffffffffffffff8316158061208157508142115b806120a1575073ffffffffffffffffffffffffffffffffffffffff831633145b90505b92915050565b6000827fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff04841183021582026120df57600080fd5b5091020490565b73ffffffffffffffffffffffffffffffffffffffff84166121a15760008373ffffffffffffffffffffffffffffffffffffffff168360405160006040518083038185875af1925050503d806000811461215b576040519150601f19603f3d011682016040523d82523d6000602084013e612160565b606091505b505090508061219b576040517ff4b3b1bc00000000000000000000000000000000000000000000000000000000815260040160405180910390fd5b506102b0565b8073ffffffffffffffffffffffffffffffffffffffff166336c7851633856121c886612480565b6040517fffffffff0000000000000000000000000000000000000000000000000000000060e086901b16815273ffffffffffffffffffffffffffffffffffffffff93841660048201529183166024830152821660448201529087166064820152608401600060405180830381600087803b15801561224557600080fd5b505af1158015612259573d6000803e3d6000fd5b5050505050505050565b73ffffffffffffffffffffffffffffffffffffffff83166123185760008273ffffffffffffffffffffffffffffffffffffffff168260405160006040518083038185875af1925050503d80600081146122d8576040519150601f19603f3d011682016040523d82523d6000602084013e6122dd565b606091505b50509050806102b0576040517ff4b3b1bc00000000000000000000000000000000000000000000000000000000815260040160405180910390fd5b61233973ffffffffffffffffffffffffffffffffffffffff8416838361252a565b505050565b600073ffffffffffffffffffffffffffffffffffffffff8316612379575073ffffffffffffffffffffffffffffffffffffffff8116316120a4565b6040517f70a0823100000000000000000000000000000000000000000000000000000000815273ffffffffffffffffffffffffffffffffffffffff83811660048301528416906370a0823190602401602060405180830381865afa1580156123e5573d6000803e3d6000fd5b505050506040513d601f19601f820116820180604052508101906120a1919061329c565b60006040518060800160405280605281526020016132b660529139805160209182012083518483015160408087015160608801519151610f54969192910194855273ffffffffffffffffffffffffffffffffffffffff93841660208601526040850192909252606084015216608082015260a00190565b600073ffffffffffffffffffffffffffffffffffffffff821115612526576040517f08c379a000000000000000000000000000000000000000000000000000000000815260206004820152602760248201527f53616665436173743a2076616c756520646f65736e27742066697420696e203160448201527f36302062697473000000000000000000000000000000000000000000000000006064820152608401610333565b5090565b60006040517fa9059cbb00000000000000000000000000000000000000000000000000000000815273ffffffffffffffffffffffffffffffffffffffff84166004820152826024820152602060006044836000895af13d15601f3d11600160005114161716915050806102b0576040517f08c379a000000000000000000000000000000000000000000000000000000000815260206004820152600f60248201527f5452414e534645525f4641494c454400000000000000000000000000000000006044820152606401610333565b73ffffffffffffffffffffffffffffffffffffffff81168114610ae357600080fd5b8035612626816125f9565b919050565b60008083601f84011261263d57600080fd5b50813567ffffffffffffffff81111561265557600080fd5b60208301915083602082850101111561266d57600080fd5b9250929050565b6000806000806060858703121561268a57600080fd5b843567ffffffffffffffff808211156126a257600080fd5b90860190604082890312156126b657600080fd5b9094506020860135906126c8826125f9565b909350604086013590808211156126de57600080fd5b506126eb8782880161262b565b95989497509550505050565b60006020828403121561270957600080fd5b8135612714816125f9565b9392505050565b60008060008060006060868803121561273357600080fd5b853567ffffffffffffffff8082111561274b57600080fd5b818801915088601f83011261275f57600080fd5b81358181111561276e57600080fd5b8960208260051b850101111561278357600080fd5b602083019750809650506127996020890161261b565b945060408801359150808211156127af57600080fd5b506127bc8882890161262b565b969995985093965092949392505050565b7f4e487b7100000000000000000000000000000000000000000000000000000000600052604160045260246000fd5b7f4e487b7100000000000000000000000000000000000000000000000000000000600052603260045260246000fd5b600082357fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffc183360301811261285f57600080fd5b9190910192915050565b60008083357fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffe184360301811261289e57600080fd5b83018035915067ffffffffffffffff8211156128b957600080fd5b60200191503681900382131561266d57600080fd5b6040516060810167ffffffffffffffff811182821017156128f1576128f16127cd565b60405290565b6040516080810167ffffffffffffffff811182821017156128f1576128f16127cd565b60405160e0810167ffffffffffffffff811182821017156128f1576128f16127cd565b604051601f82017fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffe016810167ffffffffffffffff81118282101715612984576129846127cd565b604052919050565b600082601f83011261299d57600080fd5b813567ffffffffffffffff8111156129b7576129b76127cd565b6129e860207fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffe0601f8401160161293d565b8181528460208386010111156129fd57600080fd5b816020850160208301376000918101602001919091529392505050565b600060c08284031215612a2c57600080fd5b60405160c0810167ffffffffffffffff8282108183111715612a5057612a506127cd565b8160405282935084359150612a64826125f9565b908252602084013590612a76826125f9565b816020840152604085013560408401526060850135606084015260808501359150612aa0826125f9565b81608084015260a0850135915080821115612aba57600080fd5b50612ac78582860161298c565b60a0830152505092915050565b600060608284031215612ae657600080fd5b612aee6128ce565b90508135612afb816125f9565b80825250602082013560208201526040820135604082015292915050565b600067ffffffffffffffff821115612b3357612b336127cd565b5060051b60200190565b600082601f830112612b4e57600080fd5b81356020612b63612b5e83612b19565b61293d565b82815260079290921b84018101918181019086841115612b8257600080fd5b8286015b84811015612be75760808189031215612b9f5760008081fd5b612ba76128f7565b8135612bb2816125f9565b8152818501358582015260408083013590820152606080830135612bd5816125f9565b90820152835291830191608001612b86565b509695505050505050565b600060208284031215612c0457600080fd5b813567ffffffffffffffff80821115612c1c57600080fd5b908301906101208286031215612c3157600080fd5b612c3961291a565b823582811115612c4857600080fd5b612c5487828601612a1a565b8252506020830135602082015260408301356040820152612c776060840161261b565b606082015260808301356080820152612c938660a08501612ad4565b60a082015261010083013582811115612cab57600080fd5b612cb787828601612b3d565b60c08301525095945050505050565b60005b83811015612ce1578181015183820152602001612cc9565b50506000910152565b60008151808452612d02816020860160208601612cc6565b601f017fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffe0169290920160200192915050565b600081518084526020808501945080840160005b83811015612d93578151805173ffffffffffffffffffffffffffffffffffffffff908116895284820151858a0152604091820151169088015260609096019590820190600101612d48565b509495945050505050565b6000815160e0845273ffffffffffffffffffffffffffffffffffffffff8082511660e08601528060208301511661010086015260408201516101208601526060820151610140860152806080830151166101608601525060a0810151905060c0610180850152612e126101a0850182612cea565b90506020830151612e506020860182805173ffffffffffffffffffffffffffffffffffffffff16825260208082015190830152604090810151910152565b5060408301518482036080860152612e688282612d34565b915050606083015184820360a0860152612e828282612cea565b915050608083015160c08501528091505092915050565b6000606082016060835280875180835260808501915060808160051b86010192506020808a0160005b83811015612f0e577fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff80888703018552612efc868351612d9e565b95509382019390820190600101612ec2565b505073ffffffffffffffffffffffffffffffffffffffff89168187015285840360408701528684528688828601376000848801820152601f9096017fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffe016909201909401979650505050505050565b60008451612f8e818460208901612cc6565b845190830190612fa2818360208901612cc6565b8451910190612fb5818360208801612cc6565b0195945050505050565b7f4e487b7100000000000000000000000000000000000000000000000000000000600052601160045260246000fd5b808201808211156120a4576120a4612fbf565b6020815260006120a16020830184612d9e565b6000602080838503121561302757600080fd5b825167ffffffffffffffff81111561303e57600080fd5b8301601f8101851361304f57600080fd5b805161305d612b5e82612b19565b8181526060918202830184019184820191908884111561307c57600080fd5b938501935b838510156130d85780858a0312156130995760008081fd5b6130a16128ce565b85516130ac816125f9565b815285870151878201526040808701516130c5816125f9565b9082015283529384019391850191613081565b50979650505050505050565b73ffffffffffffffffffffffffffffffffffffffff83168152604060208201526000611e4d6040830184612d9e565b7f4578636c757369766544757463684f72646572207769746e657373290000000081526000855161314b81601c850160208a01612cc6565b85519083019061316281601c840160208a01612cc6565b855191019061317881601c840160208901612cc6565b845191019061318e81601c840160208801612cc6565b01601c019695505050505050565b60006101406131cc838a51805173ffffffffffffffffffffffffffffffffffffffff168252602090810151910152565b602089015160408401526040890151606084015261320d6080840189805173ffffffffffffffffffffffffffffffffffffffff168252602090810151910152565b73ffffffffffffffffffffffffffffffffffffffff871660c08401528560e08401528061010084015261324281840186612cea565b90508281036101208401526132578185612cea565b9998505050505050505050565b60007fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff820361329557613295612fbf565b5060010190565b6000602082840312156132ae57600080fd5b505191905056fe44757463684f7574707574286164647265737320746f6b656e2c75696e74323536207374617274416d6f756e742c75696e7432353620656e64416d6f756e742c6164647265737320726563697069656e7429546f6b656e5065726d697373696f6e73286164647265737320746f6b656e2c75696e7432353620616d6f756e74294f72646572496e666f28616464726573732072656163746f722c6164647265737320737761707065722c75696e74323536206e6f6e63652c75696e7432353620646561646c696e652c61646472657373206164646974696f6e616c56616c69646174696f6e436f6e74726163742c6279746573206164646974696f6e616c56616c69646174696f6e4461746129a2646970667358221220903251d00e78287b8da3d960daa9f776c1faec5ca86f1d9052f5efa102c9533064736f6c63430008130033";
const isSuperArgs = (xs) => xs.length > 1;
class DutchLimitOrderReactor__factory extends ethers_1.ContractFactory {
    constructor(...args) {
        if (isSuperArgs(args)) {
            super(...args);
        }
        else {
            super(_abi, _bytecode, args[0]);
        }
    }
    deploy(_permit2, _protocolFeeOwner, overrides) {
        return super.deploy(_permit2, _protocolFeeOwner, overrides || {});
    }
    getDeployTransaction(_permit2, _protocolFeeOwner, overrides) {
        return super.getDeployTransaction(_permit2, _protocolFeeOwner, overrides || {});
    }
    attach(address) {
        return super.attach(address);
    }
    connect(signer) {
        return super.connect(signer);
    }
    static bytecode = _bytecode;
    static abi = _abi;
    static createInterface() {
        return new ethers_1.utils.Interface(_abi);
    }
    static connect(address, signerOrProvider) {
        return new ethers_1.Contract(address, _abi, signerOrProvider);
    }
}
exports.DutchLimitOrderReactor__factory = DutchLimitOrderReactor__factory;
//# sourceMappingURL=DutchLimitOrderReactor__factory.js.map